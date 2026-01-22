import { storage } from "../storage";
import { log } from "../index";
import {
  runPromptCheck,
  synthesizeSentimentNarratives,
  type SynthesizedNarratives
} from "../ai-services";
import {
  analyzeResponse,
  aggregateCitations,
  computeShareOfVoice,
  aggregateCompetitorMentions,
  aggregateSentiment,
  calculateAverageRank,
  countFirstPlace,
  aggregateSentimentStatements,
  computeCompetitorVisibility,
  collectBrandSentimentFindings,
  type Citation,
} from "./scan-analytics";
import type { ScanJob, MonitoringClient, MonitoringGroup, MonitoringPrompt } from "@shared/schema";

const JOB_POLL_INTERVAL_MS = 5000;
const CONCURRENT_PROMPTS = 4;
const MAX_RUNNING_JOBS = 2;
const STUCK_JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes without progress = stuck

let isProcessorRunning = false;
let processorIntervalId: NodeJS.Timeout | null = null;

async function updateJobProgress(
  jobId: number, 
  completedPrompts: number, 
  totalPrompts: number, 
  message: string
): Promise<void> {
  const progress = totalPrompts > 0 ? Math.round((completedPrompts / totalPrompts) * 100) : 0;
  await storage.updateScanJob(jobId, {
    progress,
    progressMessage: message,
    completedPrompts,
    lastProgressAt: new Date(),
  });
}

async function detectAndFailStuckJobs(): Promise<void> {
  try {
    const runningJobs = await storage.getRunningScanJobs();
    const now = Date.now();
    
    for (const job of runningJobs) {
      // Use lastProgressAt if available, otherwise fall back to startedAt
      const lastActivity = job.lastProgressAt || job.startedAt;
      
      if (!lastActivity) {
        // Job is running but has no start time - mark as failed immediately
        log(`[ScanJobProcessor] Job ${job.id} has no start time, marking as failed`, "job-processor");
        await storage.updateScanJob(job.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: 'Job stuck - no start time recorded',
          progressMessage: 'Failed: Job stuck - no activity recorded',
        });
        continue;
      }
      
      const timeSinceActivity = now - new Date(lastActivity).getTime();
      
      if (timeSinceActivity > STUCK_JOB_TIMEOUT_MS) {
        const minutesStuck = Math.round(timeSinceActivity / 60000);
        log(`[ScanJobProcessor] Job ${job.id} stuck for ${minutesStuck} minutes, marking as failed`, "job-processor");
        
        await storage.updateScanJob(job.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: `Job stuck - no progress for ${minutesStuck} minutes`,
          progressMessage: `Failed: No progress for ${minutesStuck} minutes`,
        });
        
        // Also mark the session as failed if it exists
        if (job.sessionId) {
          await storage.updateCheckSession(job.sessionId, {
            status: 'failed',
          } as any);
        }
      }
    }
  } catch (error) {
    log(`[ScanJobProcessor] Error detecting stuck jobs: ${error}`, "job-processor");
  }
}

async function processScanJob(job: ScanJob, alreadyClaimed: boolean = false): Promise<void> {
  const startTime = Date.now();
  log(`[ScanJobProcessor] Starting job ${job.id} for client ${job.clientId}`, "job-processor");

  try {
    // If the job was already claimed by claimQueuedJob(), skip the status update
    // This prevents race conditions with distributed job processing
    if (!alreadyClaimed) {
      const now = new Date();
      await storage.updateScanJob(job.id, {
        status: 'running',
        startedAt: now,
        lastProgressAt: now,
        progressMessage: 'Initializing scan...',
      });
    } else {
      await storage.updateScanJob(job.id, {
        progressMessage: 'Initializing scan...',
      });
    }

    const client = await storage.getMonitoringClientById(job.clientId);
    if (!client) {
      throw new Error(`Client ${job.clientId} not found`);
    }

    if (!client.isActive) {
      throw new Error(`Client ${job.clientId} is not active`);
    }

    const groups = await storage.getGroupsByClientId(job.clientId);
    const allPrompts = await storage.getPromptsByClientId(job.clientId);

    const activeGroups = groups.filter(g => g.isActive);
    const activeGroupIds = new Set(activeGroups.map(g => g.id));
    const prompts = allPrompts.filter(p => p.isActive && activeGroupIds.has(p.groupId));

    if (prompts.length === 0) {
      throw new Error(`Client ${job.clientId} has no active prompts`);
    }

    const totalPrompts = prompts.length;
    await storage.updateScanJob(job.id, {
      totalPrompts,
      progressMessage: 'Setting up scan session...',
    });

    const brandSentimentGroupIds = new Set(
      activeGroups.filter(g => (g as any).promptCategory === 'brand_sentiment').map(g => g.id)
    );
    const servicePromptCount = prompts.filter(p => !brandSentimentGroupIds.has(p.groupId)).length;

    const location = job.targetCity || client.city || undefined;

    const session = await storage.createCheckSession({
      clientId: job.clientId,
      city: location || null,
      overallScore: 0,
      chatgptScore: 0,
      googleAIScore: 0,
      totalPrompts: servicePromptCount,
      foundCount: 0,
      citedCount: 0,
      status: 'running',
      totalPromptsToScan: totalPrompts,
      lastCompletedPromptIndex: 0,
    });

    await storage.updateScanJob(job.id, {
      sessionId: session.id,
      progressMessage: 'Running AI visibility checks...',
    });

    log(`[ScanJobProcessor] Created session ${session.id} for job ${job.id} with ${totalPrompts} prompts`, "job-processor");

    let foundCount = 0;
    let citedCount = 0;
    let chatgptFoundCount = 0;
    let googleAIFoundCount = 0;
    let completedCount = 0;

    const allChatgptCitations: Citation[][] = [];
    const allGoogleAICitations: Citation[][] = [];
    const allChatgptRanks: (number | null)[] = [];
    const allGoogleAIRanks: (number | null)[] = [];
    const allChatgptSentiments: (string | null)[] = [];
    const allGoogleAISentiments: (string | null)[] = [];
    const storedResults: {
      competitors: string | null;
      chatgptResponse: string | null;
      googleAIResponse: string | null;
      promptText: string;
      chatgptSentimentScore: number | null;
      googleAISentimentScore: number | null;
      isBrandSentiment: boolean;
    }[] = [];

    const groupMetrics: Record<string, {
      groupId: number;
      totalPrompts: number;
      foundCount: number;
      citedCount: number;
      chatgptFoundCount: number;
      googleAIFoundCount: number;
      competitors: string[];
    }> = {};

    for (const group of activeGroups) {
      const groupPromptCount = prompts.filter(p => p.groupId === group.id).length;
      groupMetrics[group.name] = {
        groupId: group.id,
        totalPrompts: groupPromptCount,
        foundCount: 0,
        citedCount: 0,
        chatgptFoundCount: 0,
        googleAIFoundCount: 0,
        competitors: [],
      };
    }

    const promptsWithGroups = prompts.map(prompt => {
      const group = activeGroups.find(g => g.id === prompt.groupId);
      return { prompt, group };
    });

    const allCities = client.cities || (client.city ? [client.city] : []);
    const scanCity = job.targetCity || undefined;

    for (let i = 0; i < promptsWithGroups.length; i += CONCURRENT_PROMPTS) {
      const batch = promptsWithGroups.slice(i, i + CONCURRENT_PROMPTS);

      const results = await Promise.all(
        batch.map(async ({ prompt, group }) => {
          try {
            let processedPromptText = prompt.promptText;
            if (scanCity && allCities.length > 0) {
              for (const city of allCities) {
                if (city !== scanCity) {
                  const cityRegex = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
                  processedPromptText = processedPromptText.replace(cityRegex, scanCity);
                }
              }
            }

            const result = await runPromptCheck(
              processedPromptText,
              client.businessName,
              client.domain,
              location,
              client.brandAliases || undefined
            );
            return { prompt, group, result, processedPromptText };
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log(`[ScanJobProcessor] Error running prompt ${prompt.id}: ${errMsg}`, "job-processor");
            return { 
              prompt, 
              group, 
              result: {
                chatgpt: { found: false, response: `Error: ${errMsg}`, cited: false, citations: [] },
                googleAI: { found: false, response: `Error: ${errMsg}`, cited: false, citations: [] },
                competitors: []
              },
              processedPromptText: prompt.promptText
            };
          }
        })
      );

      for (const { prompt, group, result, processedPromptText } of results) {
        completedCount++;
        
        const groupName = group?.name || "Unknown";
        const isBrandSentiment = brandSentimentGroupIds.has(prompt.groupId);
        const wasFound = result.chatgpt.found || result.googleAI.found;
        const wasCited = result.chatgpt.cited || result.googleAI.cited;
        const competitors = result.competitors;

        if (!isBrandSentiment) {
          if (wasFound) foundCount++;
          if (wasCited) citedCount++;
          if (result.chatgpt.found) chatgptFoundCount++;
          if (result.googleAI.found) googleAIFoundCount++;

          if (groupMetrics[groupName]) {
            if (wasFound) groupMetrics[groupName].foundCount++;
            if (wasCited) groupMetrics[groupName].citedCount++;
            if (result.chatgpt.found) groupMetrics[groupName].chatgptFoundCount++;
            if (result.googleAI.found) groupMetrics[groupName].googleAIFoundCount++;
            groupMetrics[groupName].competitors.push(...competitors);
          }
        }

        const chatgptAnalysis = analyzeResponse(result.chatgpt.response, client.businessName);
        const googleAIAnalysis = analyzeResponse(result.googleAI.response, client.businessName);

        const chatgptSentimentScore = null;
        const googleAISentimentScore = null;

        const chatgptCitationsToStore = result.chatgpt.citations?.length > 0 
          ? result.chatgpt.citations 
          : chatgptAnalysis.citations;
        const googleAICitationsToStore = result.googleAI.citations?.length > 0 
          ? result.googleAI.citations 
          : googleAIAnalysis.citations;

        if (!isBrandSentiment) {
          allChatgptCitations.push(chatgptCitationsToStore);
          allGoogleAICitations.push(googleAICitationsToStore);
          allChatgptRanks.push(chatgptAnalysis.rank);
          allGoogleAIRanks.push(googleAIAnalysis.rank);
          allChatgptSentiments.push(chatgptAnalysis.sentiment);
          allGoogleAISentiments.push(googleAIAnalysis.sentiment);
        }

        storedResults.push({
          competitors: competitors.length > 0 ? JSON.stringify(competitors) : null,
          chatgptResponse: result.chatgpt.response || null,
          googleAIResponse: result.googleAI.response || null,
          promptText: processedPromptText,
          chatgptSentimentScore,
          googleAISentimentScore,
          isBrandSentiment,
        });

        try {
          await storage.createCheckResult({
            sessionId: session.id,
            clientId: job.clientId,
            groupId: prompt.groupId,
            promptId: prompt.id,
            promptText: processedPromptText,
            chatgptFound: result.chatgpt.found,
            chatgptCited: result.chatgpt.cited,
            googleAIFound: result.googleAI.found,
            googleAICited: result.googleAI.cited,
            competitors: competitors.length > 0 ? JSON.stringify(competitors) : null,
            chatgptResponse: result.chatgpt.response || null,
            googleAIResponse: result.googleAI.response || null,
            chatgptSentiment: chatgptAnalysis.sentiment,
            googleAISentiment: googleAIAnalysis.sentiment,
            chatgptSentimentScore,
            googleAISentimentScore,
            chatgptRank: chatgptAnalysis.rank,
            googleAIRank: googleAIAnalysis.rank,
            chatgptCitations: chatgptCitationsToStore,
            googleAICitations: googleAICitationsToStore,
            chatgptSnippet: chatgptAnalysis.snippet,
            googleAISnippet: googleAIAnalysis.snippet,
            googleAIGroundingMetadata: result.googleAI.groundingMetadata,
          });
        } catch (storeError) {
          log(`[ScanJobProcessor] Storage error for prompt ${prompt.id}: ${storeError}`, "job-processor");
        }

        await updateJobProgress(
          job.id, 
          completedCount, 
          totalPrompts, 
          `Checking prompt ${completedCount} of ${totalPrompts}...`
        );

        const runningTotalExposures = servicePromptCount * 2;
        const runningTotalFound = chatgptFoundCount + googleAIFoundCount;
        const runningOverallScore = runningTotalExposures > 0 ? Math.round((runningTotalFound / runningTotalExposures) * 100) : 0;
        const runningChatgptScore = servicePromptCount > 0 ? Math.round((chatgptFoundCount / servicePromptCount) * 100) : 0;
        const runningGoogleAIScore = servicePromptCount > 0 ? Math.round((googleAIFoundCount / servicePromptCount) * 100) : 0;

        await storage.updateCheckSession(session.id, {
          lastCompletedPromptIndex: completedCount,
          status: 'running',
          overallScore: runningOverallScore,
          chatgptScore: runningChatgptScore,
          googleAIScore: runningGoogleAIScore,
          foundCount: chatgptFoundCount + googleAIFoundCount,
          citedCount,
        } as any);
      }
    }

    log(`[ScanJobProcessor] Completed prompt processing for job ${job.id}. Calculating final scores...`, "job-processor");

    await updateJobProgress(job.id, completedCount, totalPrompts, 'Calculating final scores...');

    const totalExposures = servicePromptCount * 2;
    const totalFound = chatgptFoundCount + googleAIFoundCount;
    const overallScore = totalExposures > 0 ? Math.round((totalFound / totalExposures) * 100) : 0;
    const chatgptScore = servicePromptCount > 0 ? Math.round((chatgptFoundCount / servicePromptCount) * 100) : 0;
    const googleAIScore = servicePromptCount > 0 ? Math.round((googleAIFoundCount / servicePromptCount) * 100) : 0;

    const flatChatgptCitations = allChatgptCitations.flat();
    const flatGoogleAICitations = allGoogleAICitations.flat();
    const topCitations = aggregateCitations([flatChatgptCitations, flatGoogleAICitations]);

    const competitorCounts = aggregateCompetitorMentions(
      storedResults.filter(r => !r.isBrandSentiment).map(r => ({ competitors: r.competitors }))
    );
    const shareOfVoice = computeShareOfVoice(client.businessName, foundCount, competitorCounts, servicePromptCount);
    const sentimentBreakdown = aggregateSentiment([...allChatgptSentiments, ...allGoogleAISentiments]);
    const avgChatgptRank = calculateAverageRank(allChatgptRanks);
    const avgGoogleAIRank = calculateAverageRank(allGoogleAIRanks);
    const firstPlaceCount = countFirstPlace(allChatgptRanks) + countFirstPlace(allGoogleAIRanks);

    const sentimentScore = null;
    const competitorVisibility = computeCompetitorVisibility(competitorCounts, servicePromptCount);
    const sentimentStatements = aggregateSentimentStatements(
      storedResults.filter(r => !r.isBrandSentiment).map(r => ({
        chatgptResponse: r.chatgptResponse,
        googleAIResponse: r.googleAIResponse,
        promptText: r.promptText,
      })),
      client.businessName
    );

    await storage.updateCheckSession(session.id, {
      overallScore,
      chatgptScore,
      googleAIScore,
      foundCount: totalFound,
      citedCount,
      shareOfVoice,
      topCitations,
      avgChatgptRank,
      avgGoogleAIRank,
      firstPlaceCount,
      sentimentBreakdown,
      sentimentScore,
      competitorVisibility,
      sentimentStatements,
      status: 'complete',
      lastCompletedPromptIndex: totalPrompts,
    } as any);

    for (const [groupName, metrics] of Object.entries(groupMetrics)) {
      const visibilityScore = metrics.totalPrompts > 0 
        ? Math.round(((metrics.chatgptFoundCount + metrics.googleAIFoundCount) / (metrics.totalPrompts * 2)) * 100) 
        : 0;

      await storage.createCheckGroupMetric({
        sessionId: session.id,
        clientId: job.clientId,
        groupId: metrics.groupId,
        groupName,
        totalPrompts: metrics.totalPrompts,
        foundCount: metrics.foundCount,
        citedCount: metrics.citedCount,
        visibilityScore,
        chatgptFoundCount: metrics.chatgptFoundCount,
        googleAIFoundCount: metrics.googleAIFoundCount,
      });
    }

    const allCompetitors = new Map<string, { chatgpt: number; google: number }>();
    for (const result of storedResults) {
      if (result.isBrandSentiment || !result.competitors) continue;
      try {
        const competitors = JSON.parse(result.competitors) as string[];
        for (const comp of competitors) {
          const existing = allCompetitors.get(comp) || { chatgpt: 0, google: 0 };
          existing.chatgpt++;
          allCompetitors.set(comp, existing);
        }
      } catch {}
    }

    for (const [competitorName, counts] of Array.from(allCompetitors.entries())) {
      const totalMentions = counts.chatgpt + counts.google;
      const visibilityPercent = servicePromptCount > 0 
        ? Math.round((totalMentions / (servicePromptCount * 2)) * 100) 
        : 0;

      await storage.createCheckCompetitorMetric({
        sessionId: session.id,
        clientId: job.clientId,
        competitorName,
        mentionCount: totalMentions,
        visibilityPercent,
        chatgptMentions: counts.chatgpt,
        googleAIMentions: counts.google,
      });
    }

    const nextCheck = new Date();
    nextCheck.setDate(nextCheck.getDate() + client.checkFrequencyDays);
    await storage.updateMonitoringClient(job.clientId, {
      lastCheckAt: new Date(),
      nextCheckAt: nextCheck,
    } as any);

    const durationMs = Date.now() - startTime;
    log(`[ScanJobProcessor] Job ${job.id} completed successfully in ${Math.round(durationMs / 1000)}s. Score: ${overallScore}%`, "job-processor");

    await storage.updateScanJob(job.id, {
      status: 'complete',
      completedAt: new Date(),
      progress: 100,
      progressMessage: 'Scan complete!',
      resultScore: overallScore,
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(`[ScanJobProcessor] Job ${job.id} failed: ${errMsg}`, "job-processor");

    await storage.updateScanJob(job.id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: errMsg,
      progressMessage: `Failed: ${errMsg}`,
    });
  }
}

async function pollAndProcessJobs(): Promise<void> {
  try {
    // First, detect and fail any stuck jobs
    await detectAndFailStuckJobs();
    
    const runningJobs = await storage.getRunningScanJobs();
    if (runningJobs.length >= MAX_RUNNING_JOBS) {
      return;
    }

    // Claim and process jobs up to the limit
    const slotsAvailable = MAX_RUNNING_JOBS - runningJobs.length;
    
    for (let i = 0; i < slotsAvailable; i++) {
      // Atomically claim a job - this prevents race conditions with multiple server instances
      const claimedJob = await storage.claimQueuedJob();
      
      if (!claimedJob) {
        // No more queued jobs
        break;
      }
      
      log(`[ScanJobProcessor] Claimed job ${claimedJob.id} for processing`, "job-processor");
      
      // Process the claimed job (status is already 'running')
      processScanJob(claimedJob, true).catch(error => {
        log(`[ScanJobProcessor] Uncaught error processing job ${claimedJob.id}: ${error}`, "job-processor");
      });
    }
  } catch (error) {
    log(`[ScanJobProcessor] Error polling jobs: ${error}`, "job-processor");
  }
}

async function cleanupOrphanedJobs(): Promise<void> {
  try {
    const runningJobs = await storage.getRunningScanJobs();
    
    if (runningJobs.length === 0) {
      log("[ScanJobProcessor] No orphaned jobs found on startup", "job-processor");
      return;
    }
    
    log(`[ScanJobProcessor] Found ${runningJobs.length} orphaned 'running' jobs on startup - marking as failed`, "job-processor");
    
    for (const job of runningJobs) {
      log(`[ScanJobProcessor] Marking orphaned job ${job.id} (client ${job.clientId}) as failed`, "job-processor");
      
      await storage.updateScanJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Job interrupted by server restart',
        progressMessage: 'Failed: Interrupted by server restart',
      });
      
      if (job.sessionId) {
        await storage.updateCheckSession(job.sessionId, {
          status: 'failed',
        });
      }
    }
    
    log(`[ScanJobProcessor] Cleaned up ${runningJobs.length} orphaned jobs`, "job-processor");
  } catch (error) {
    log(`[ScanJobProcessor] Error cleaning up orphaned jobs: ${error instanceof Error ? error.message : String(error)}`, "job-processor");
  }
}

export function startScanJobProcessor(): void {
  if (isProcessorRunning) {
    log("[ScanJobProcessor] Already running", "job-processor");
    return;
  }

  isProcessorRunning = true;
  log("[ScanJobProcessor] Starting background job processor", "job-processor");

  cleanupOrphanedJobs().then(() => {
    pollAndProcessJobs();
    
    processorIntervalId = setInterval(() => {
      pollAndProcessJobs();
    }, JOB_POLL_INTERVAL_MS);
  });
}

export function stopScanJobProcessor(): void {
  if (!isProcessorRunning) {
    return;
  }

  isProcessorRunning = false;
  if (processorIntervalId) {
    clearInterval(processorIntervalId);
    processorIntervalId = null;
  }

  log("[ScanJobProcessor] Stopped", "job-processor");
}

export function isJobProcessorRunning(): boolean {
  return isProcessorRunning;
}
