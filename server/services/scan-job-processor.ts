import { storage } from "../storage";
import { log } from "../index";
import {
  runPromptCheck,
  synthesizeSentimentNarratives,
  resetCircuitBreakers,
  type SynthesizedNarratives
} from "../ai-services";
import { clearActiveScans } from "../routes/monitoring";
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
import { buildPromptLookupData, countServiceResultStatuses } from "./scan-job-processor-lookup";

const JOB_POLL_INTERVAL_MS = 5000;
const CONCURRENT_PROMPTS = 4;
const MAX_RUNNING_JOBS = 2;
const STUCK_JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes without progress = stuck
const STALE_QUEUED_THRESHOLD_MS = 60 * 1000; // 1 minute in queue without being claimed = orphaned

let isProcessorRunning = false;
let processorIntervalId: NodeJS.Timeout | null = null;
let isShuttingDown = false;

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
      const lastActivity = job.lastProgressAt || job.startedAt;
      
      if (!lastActivity) {
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
        const hasNotStartedProcessing = (job.completedPrompts || 0) === 0 && !job.sessionId;
        const wasAlreadyRequeued = job.errorMessage === 'requeued-after-stuck';
        
        if (hasNotStartedProcessing && !wasAlreadyRequeued) {
          log(`[ScanJobProcessor] Job ${job.id} stuck for ${minutesStuck} minutes with 0 progress, re-queuing for retry`, "job-processor");
          await storage.updateScanJob(job.id, {
            status: 'queued',
            startedAt: null as any,
            lastProgressAt: new Date(),
            progressMessage: 'Re-queued after being stuck (deployment recovery)',
            errorMessage: 'requeued-after-stuck',
          });
        } else {
          log(`[ScanJobProcessor] Job ${job.id} stuck for ${minutesStuck} minutes, marking as failed`, "job-processor");
          await storage.updateScanJob(job.id, {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: `Job stuck - no progress for ${minutesStuck} minutes`,
            progressMessage: `Failed: No progress for ${minutesStuck} minutes`,
          });
          
          if (job.sessionId) {
            await storage.updateCheckSession(job.sessionId, {
              status: 'failed',
            } as any);
          }
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

  resetCircuitBreakers();
  log(`[ScanJobProcessor] Reset circuit breakers for job ${job.id}`, "job-processor");

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

    const {
      groupById,
      brandSentimentGroupIds,
      promptCountByGroupId,
      servicePromptCount,
    } = buildPromptLookupData(activeGroups, prompts);

    log(
      `[ScanJobProcessor] Prepared lookup maps for job ${job.id}: ${activeGroups.length} active groups, ${prompts.length} active prompts`,
      "job-processor"
    );

    const location = job.targetCity || client.city || undefined;

    // Check if this is a resume (job already has a session)
    let session;
    let resumeFromIndex = 0;
    
    if (job.sessionId) {
      // Try to resume from existing session
      const existingSession = await storage.getCheckSessionById(job.sessionId);
      if (existingSession && existingSession.status !== 'complete') {
        session = existingSession;
        
        // Validate resume index by checking actual DB results count
        // This handles cases where partial batches were written before crash
        const existingResults = await storage.getCheckResultsBySessionId(existingSession.id);
        const actualResultsCount = existingResults.length;
        const savedIndex = existingSession.lastCompletedPromptIndex || 0;
        
        // Use the actual DB results count as the authoritative resume point
        // This prevents duplicate processing if savedIndex is ahead of actual results
        resumeFromIndex = Math.min(savedIndex, actualResultsCount);
        
        if (resumeFromIndex !== savedIndex) {
          log(`[ScanJobProcessor] Corrected resume index from ${savedIndex} to ${resumeFromIndex} based on actual DB results`, "job-processor");
        }
        
        log(`[ScanJobProcessor] Resuming session ${session.id} from prompt index ${resumeFromIndex}/${totalPrompts}`, "job-processor");
        
        // Update session status back to running
        await storage.updateCheckSession(session.id, {
          status: 'running',
        });
      }
    }
    
    // Create new session if not resuming
    if (!session) {
      session = await storage.createCheckSession({
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
      });
      
      log(`[ScanJobProcessor] Created new session ${session.id} for job ${job.id} with ${totalPrompts} prompts`, "job-processor");
    }
    
    await storage.updateScanJob(job.id, {
      progressMessage: resumeFromIndex > 0 
        ? `Resuming AI visibility checks from ${resumeFromIndex}/${totalPrompts}...`
        : 'Running AI visibility checks...',
    });

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
      const groupPromptCount = promptCountByGroupId.get(group.id) || 0;
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
      const group = groupById.get(prompt.groupId);
      return { prompt, group };
    });

    const allCities = client.cities || (client.city ? [client.city] : []);
    const scanCity = job.targetCity || undefined;
    
    // If resuming, skip already-processed prompts and restore the completed count
    const startIndex = resumeFromIndex;
    if (startIndex > 0) {
      completedCount = startIndex;
      log(`[ScanJobProcessor] Skipping first ${startIndex} prompts (already processed)`, "job-processor");
    }

    for (let i = startIndex; i < promptsWithGroups.length; i += CONCURRENT_PROMPTS) {
      if (i > startIndex) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
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

        // Note: foundCount uses distinct prompt-level count (foundCount variable), not exposure sum
        await storage.updateCheckSession(session.id, {
          lastCompletedPromptIndex: completedCount,
          status: 'running',
          overallScore: runningOverallScore,
          chatgptScore: runningChatgptScore,
          googleAIScore: runningGoogleAIScore,
          foundCount, // Use distinct prompt-level found count
          citedCount,
        } as any);
      }
    }

    log(`[ScanJobProcessor] Completed prompt processing for job ${job.id}. Calculating final scores from database...`, "job-processor");

    await updateJobProgress(job.id, completedCount, totalPrompts, 'Calculating final scores...');

    // IMPORTANT: Load all results from database to ensure correct aggregation on resume
    // This ensures resumed scans include ALL results, not just the ones processed in this run
    const allDbResults = await storage.getCheckResultsBySessionId(session.id);
    
    // Determine which results are brand sentiment vs service prompts
    const serviceResults = allDbResults.filter(r => !brandSentimentGroupIds.has(r.groupId));
    const serviceResultCountByStatus = countServiceResultStatuses(serviceResults);
    const actualServicePromptCount = serviceResults.length;
    
    // Compute scores from DB results
    const dbChatgptFoundCount = serviceResultCountByStatus.chatgptFound;
    const dbGoogleAIFoundCount = serviceResultCountByStatus.googleAIFound;
    const dbCitedCount = serviceResultCountByStatus.cited;
    
    const totalExposures = actualServicePromptCount * 2;
    const totalFound = dbChatgptFoundCount + dbGoogleAIFoundCount;
    const overallScore = totalExposures > 0 ? Math.round((totalFound / totalExposures) * 100) : 0;
    const chatgptScore = actualServicePromptCount > 0 ? Math.round((dbChatgptFoundCount / actualServicePromptCount) * 100) : 0;
    const googleAIScore = actualServicePromptCount > 0 ? Math.round((dbGoogleAIFoundCount / actualServicePromptCount) * 100) : 0;

    // Parse citations from DB results
    const dbChatgptCitations: Citation[][] = [];
    const dbGoogleAICitations: Citation[][] = [];
    const dbChatgptRanks: (number | null)[] = [];
    const dbGoogleAIRanks: (number | null)[] = [];
    const dbChatgptSentiments: (string | null)[] = [];
    const dbGoogleAISentiments: (string | null)[] = [];
    
    for (const result of allDbResults) {
      // Parse citations if they exist
      if (result.chatgptCitations) {
        try {
          const citations = typeof result.chatgptCitations === 'string' 
            ? JSON.parse(result.chatgptCitations) 
            : result.chatgptCitations;
          dbChatgptCitations.push(citations);
        } catch {}
      }
      if (result.googleAICitations) {
        try {
          const citations = typeof result.googleAICitations === 'string' 
            ? JSON.parse(result.googleAICitations) 
            : result.googleAICitations;
          dbGoogleAICitations.push(citations);
        } catch {}
      }
      
      dbChatgptRanks.push(result.chatgptRank);
      dbGoogleAIRanks.push(result.googleAIRank);
      dbChatgptSentiments.push(result.chatgptSentiment);
      dbGoogleAISentiments.push(result.googleAISentiment);
    }

    const flatChatgptCitations = dbChatgptCitations.flat();
    const flatGoogleAICitations = dbGoogleAICitations.flat();
    const topCitations = aggregateCitations([flatChatgptCitations, flatGoogleAICitations]);

    const competitorCounts = aggregateCompetitorMentions(
      serviceResults.map(r => ({ competitors: r.competitors }))
    );
    const dbFoundCount = serviceResultCountByStatus.found;
    const shareOfVoice = computeShareOfVoice(client.businessName, dbFoundCount, competitorCounts, actualServicePromptCount);
    const sentimentBreakdown = aggregateSentiment([...dbChatgptSentiments, ...dbGoogleAISentiments]);
    const avgChatgptRank = calculateAverageRank(dbChatgptRanks);
    const avgGoogleAIRank = calculateAverageRank(dbGoogleAIRanks);
    const firstPlaceCount = countFirstPlace(dbChatgptRanks) + countFirstPlace(dbGoogleAIRanks);

    const sentimentScore = null;
    const competitorVisibility = computeCompetitorVisibility(competitorCounts, actualServicePromptCount);
    const sentimentStatements = aggregateSentimentStatements(
      serviceResults.map(r => ({
        chatgptResponse: r.chatgptResponse,
        googleAIResponse: r.googleAIResponse,
        promptText: r.promptText,
      })),
      client.businessName
    );

    // Synthesize sentiment narratives at scan time so dashboard reads are instant
    let sentimentNarratives: SynthesizedNarratives | null = null;
    if (sentimentStatements.positive.length > 0 || sentimentStatements.negative.length > 0) {
      try {
        sentimentNarratives = await synthesizeSentimentNarratives(
          {
            positive: sentimentStatements.positive.map(s => ({
              text: s.text, promptText: s.promptText, platform: s.platform
            })),
            negative: sentimentStatements.negative.map(s => ({
              text: s.text, promptText: s.promptText, platform: s.platform
            })),
          },
          client.businessName
        );
      } catch (e) {
        log(`[ScanJobProcessor] Failed to synthesize narratives: ${e instanceof Error ? e.message : String(e)}`, "job-processor");
      }
    }

    await storage.updateCheckSession(session.id, {
      overallScore,
      chatgptScore,
      googleAIScore,
      foundCount: dbFoundCount, // Use distinct prompt-level found count
      citedCount: dbCitedCount,
      shareOfVoice,
      topCitations,
      avgChatgptRank,
      avgGoogleAIRank,
      firstPlaceCount,
      sentimentBreakdown,
      sentimentScore,
      competitorVisibility,
      sentimentStatements,
      sentimentNarratives,
      status: 'complete',
      lastCompletedPromptIndex: totalPrompts,
    } as any);

    // Compute group metrics from DB results (excluding brand sentiment groups)
    const dbGroupMetrics: Record<string, {
      groupId: number;
      totalPrompts: number;
      foundCount: number;
      citedCount: number;
      chatgptFoundCount: number;
      googleAIFoundCount: number;
    }> = {};
    
    for (const result of allDbResults) {
      // Skip brand sentiment groups - they shouldn't be included in visibility metrics
      if (brandSentimentGroupIds.has(result.groupId)) continue;
      
      const group = groupById.get(result.groupId);
      if (!group) continue;
      
      if (!dbGroupMetrics[group.name]) {
        dbGroupMetrics[group.name] = {
          groupId: group.id,
          totalPrompts: 0,
          foundCount: 0,
          citedCount: 0,
          chatgptFoundCount: 0,
          googleAIFoundCount: 0,
        };
      }
      
      const metrics = dbGroupMetrics[group.name];
      metrics.totalPrompts++;
      if (result.chatgptFound) metrics.chatgptFoundCount++;
      if (result.googleAIFound) metrics.googleAIFoundCount++;
      if (result.chatgptFound || result.googleAIFound) metrics.foundCount++;
      if (result.chatgptCited || result.googleAICited) metrics.citedCount++;
    }
    
    for (const [groupName, metrics] of Object.entries(dbGroupMetrics)) {
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

    // Compute competitor metrics from DB results
    const allCompetitors = new Map<string, { chatgpt: number; google: number }>();
    for (const result of serviceResults) {
      if (!result.competitors) continue;
      try {
        const competitors = typeof result.competitors === 'string' 
          ? JSON.parse(result.competitors) as string[]
          : result.competitors as string[];
        for (const comp of competitors) {
          const existing = allCompetitors.get(comp) || { chatgpt: 0, google: 0 };
          existing.chatgpt++;
          allCompetitors.set(comp, existing);
        }
      } catch {}
    }

    for (const [competitorName, counts] of Array.from(allCompetitors.entries())) {
      const totalMentions = counts.chatgpt + counts.google;
      const visibilityPercent = actualServicePromptCount > 0 
        ? Math.round((totalMentions / (actualServicePromptCount * 2)) * 100) 
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

    await storage.updateScanJob(job.id, {
      status: 'complete',
      completedAt: new Date(),
      progress: 100,
      progressMessage: 'Scan complete!',
      resultScore: overallScore,
    });

    const durationMs = Date.now() - startTime;
    log(`[ScanJobProcessor] Job ${job.id} completed successfully in ${Math.round(durationMs / 1000)}s. Score: ${overallScore}%`, "job-processor");

    const remainingJob = await storage.getActiveScanJobForClient(job.clientId);
    if (!remainingJob) {
      const nextCheck = new Date();
      nextCheck.setDate(nextCheck.getDate() + client.checkFrequencyDays);
      await storage.updateMonitoringClient(job.clientId, {
        lastCheckAt: new Date(),
        nextCheckAt: nextCheck,
      } as any);
      log(`[ScanJobProcessor] All city jobs complete for client ${job.clientId}, next check scheduled`, "job-processor");
    } else {
      await storage.updateMonitoringClient(job.clientId, {
        lastCheckAt: new Date(),
      } as any);
      log(`[ScanJobProcessor] City job done, remaining queued jobs for client ${job.clientId}`, "job-processor");
    }

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
    // Get both running jobs (always orphaned after restart) and stale queued jobs
    const orphanedJobs = await storage.getOrphanedJobs(STALE_QUEUED_THRESHOLD_MS);
    
    if (orphanedJobs.length === 0) {
      log("[ScanJobProcessor] No orphaned jobs found on startup", "job-processor");
      return;
    }
    
    const runningJobs = orphanedJobs.filter(j => j.status === 'running');
    const staleQueuedJobs = orphanedJobs.filter(j => j.status === 'queued');
    
    log(`[ScanJobProcessor] Found ${orphanedJobs.length} orphaned jobs (${runningJobs.length} running, ${staleQueuedJobs.length} stale queued)`, "job-processor");
    
    // For running jobs that were interrupted - reset to queued so they can be resumed
    for (const job of runningJobs) {
      log(`[ScanJobProcessor] Re-queuing interrupted job ${job.id} (client ${job.clientId}, was at ${job.completedPrompts || 0}/${job.totalPrompts || 0} prompts)`, "job-processor");
      
      await storage.updateScanJob(job.id, {
        status: 'queued',
        progressMessage: `Resuming after server restart (was at ${job.completedPrompts || 0}/${job.totalPrompts || 0})`,
        lastProgressAt: new Date(), // Update to prevent immediate stuck detection
      });
      
      // Update session to pending so it shows as resumable
      if (job.sessionId) {
        await storage.updateCheckSession(job.sessionId, {
          status: 'pending',
        });
      }
    }
    
    // For stale queued jobs - reset their lastProgressAt to prevent them being marked as stuck
    for (const job of staleQueuedJobs) {
      log(`[ScanJobProcessor] Refreshing stale queued job ${job.id} (client ${job.clientId})`, "job-processor");
      
      await storage.updateScanJob(job.id, {
        lastProgressAt: new Date(), // Refresh to prevent being marked as stuck
        progressMessage: 'Waiting to resume after server restart',
      });
    }
    
    log(`[ScanJobProcessor] Re-queued ${runningJobs.length} interrupted jobs, refreshed ${staleQueuedJobs.length} stale jobs`, "job-processor");
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

// Graceful shutdown - marks all running jobs as interrupted before server terminates
export async function gracefulShutdown(): Promise<void> {
  if (isShuttingDown) {
    return; // Already shutting down
  }
  
  isShuttingDown = true;
  log("[ScanJobProcessor] Graceful shutdown initiated - marking running jobs as interrupted", "job-processor");

  // Clear SSE scan guards so they don't block rescans after restart
  clearActiveScans();
  
  try {
    const runningJobs = await storage.getRunningScanJobs();
    
    if (runningJobs.length === 0) {
      log("[ScanJobProcessor] No running jobs to interrupt", "job-processor");
      return;
    }
    
    log(`[ScanJobProcessor] Marking ${runningJobs.length} running jobs as interrupted`, "job-processor");
    
    for (const job of runningJobs) {
      await storage.updateScanJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Job interrupted by server shutdown',
        progressMessage: 'Failed: Interrupted by server shutdown',
      });
      
      if (job.sessionId) {
        await storage.updateCheckSession(job.sessionId, {
          status: 'failed',
        } as any);
      }
      
      log(`[ScanJobProcessor] Marked job ${job.id} as interrupted`, "job-processor");
    }
    
    log(`[ScanJobProcessor] Graceful shutdown complete - ${runningJobs.length} jobs marked as interrupted`, "job-processor");
  } catch (error) {
    log(`[ScanJobProcessor] Error during graceful shutdown: ${error instanceof Error ? error.message : String(error)}`, "job-processor");
  }
}

// Register signal handlers for graceful shutdown
export function registerShutdownHandlers(): void {
  const handleSignal = async (signal: string) => {
    log(`[ScanJobProcessor] Received ${signal} signal, initiating graceful shutdown`, "job-processor");
    await gracefulShutdown();
    stopScanJobProcessor();
    // Give a moment for cleanup to complete before process exits
    setTimeout(() => process.exit(0), 1000);
  };
  
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
  
  log("[ScanJobProcessor] Registered shutdown signal handlers (SIGTERM, SIGINT)", "job-processor");
}
