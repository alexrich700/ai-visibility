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

const SCHEDULER_INTERVAL_MS = 60 * 1000;
// Increased from 4 to 8 to offset GPT-5-mini's slower response time
const CONCURRENT_PROMPTS = 8;

let isSchedulerRunning = false;
let schedulerIntervalId: NodeJS.Timeout | null = null;

async function runScheduledScan(clientId: number): Promise<void> {
  const startTime = Date.now();
  log(`Starting scheduled scan for client ${clientId}`, "scheduler");

  try {
    const client = await storage.getMonitoringClientById(clientId);
    if (!client) {
      log(`Client ${clientId} not found, skipping`, "scheduler");
      return;
    }

    if (!client.isActive) {
      log(`Client ${clientId} is not active, skipping`, "scheduler");
      return;
    }

    const groups = await storage.getGroupsByClientId(clientId);
    const allPrompts = await storage.getPromptsByClientId(clientId);

    const activeGroups = groups.filter(g => g.isActive);
    const activeGroupIds = new Set(activeGroups.map(g => g.id));
    const prompts = allPrompts.filter(p => p.isActive && activeGroupIds.has(p.groupId));

    if (prompts.length === 0) {
      log(`Client ${clientId} has no active prompts, skipping scan`, "scheduler");
      const nextCheck = new Date();
      nextCheck.setDate(nextCheck.getDate() + client.checkFrequencyDays);
      await storage.updateMonitoringClient(clientId, {
        nextCheckAt: nextCheck,
        lastCheckAt: new Date(),
      } as any);
      return;
    }

    const totalPrompts = prompts.length;

    const brandSentimentGroupIds = new Set(
      activeGroups.filter(g => (g as any).promptCategory === 'brand_sentiment').map(g => g.id)
    );
    const servicePromptCount = prompts.filter(p => !brandSentimentGroupIds.has(p.groupId)).length;

    const session = await storage.createCheckSession({
      clientId,
      overallScore: 0,
      chatgptScore: 0,
      googleAIScore: 0,
      totalPrompts: servicePromptCount,
      foundCount: 0,
      citedCount: 0,
    });

    log(`Created session ${session.id} for client ${clientId} with ${totalPrompts} prompts`, "scheduler");

    let foundCount = 0;
    let citedCount = 0;
    let chatgptFoundCount = 0;
    let googleAIFoundCount = 0;

    const allChatgptCitations: Citation[] = [];
    const allGoogleAICitations: Citation[] = [];
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

    const location = client.city || undefined;
    const promptsWithGroups = prompts.map(prompt => {
      const group = activeGroups.find(g => g.id === prompt.groupId);
      return { prompt, group };
    });

    for (let i = 0; i < promptsWithGroups.length; i += CONCURRENT_PROMPTS) {
      const batch = promptsWithGroups.slice(i, i + CONCURRENT_PROMPTS);

      const results = await Promise.all(
        batch.map(async ({ prompt, group }) => {
          try {
            const result = await runPromptCheck(
              prompt.promptText,
              client.businessName,
              client.domain,
              location,
              client.brandAliases || undefined
            );
            return { prompt, group, result };
          } catch (error) {
            log(`Error running prompt ${prompt.id}: ${error}`, "scheduler");
            return { prompt, group, result: null };
          }
        })
      );

      for (const { prompt, group, result } of results) {
        if (!result) continue;

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

        const chatgptAnalysis = analyzeResponse(
          result.chatgpt.response,
          client.businessName
        );
        const googleAIAnalysis = analyzeResponse(
          result.googleAI.response,
          client.businessName
        );

        // Sentiment scores removed - using categorical sentiment only
        const chatgptSentimentScore = null;
        const googleAISentimentScore = null;

        if (!isBrandSentiment) {
          allChatgptCitations.push(...chatgptAnalysis.citations);
          allGoogleAICitations.push(...googleAIAnalysis.citations);
          allChatgptRanks.push(chatgptAnalysis.rank);
          allGoogleAIRanks.push(googleAIAnalysis.rank);
          allChatgptSentiments.push(chatgptAnalysis.sentiment);
          allGoogleAISentiments.push(googleAIAnalysis.sentiment);
        }

        storedResults.push({
          competitors: competitors.length > 0 ? JSON.stringify(competitors) : null,
          chatgptResponse: result.chatgpt.response || null,
          googleAIResponse: result.googleAI.response || null,
          promptText: prompt.promptText,
          chatgptSentimentScore,
          googleAISentimentScore,
          isBrandSentiment,
        });

        await storage.createCheckResult({
          sessionId: session.id,
          clientId,
          groupId: prompt.groupId,
          promptId: prompt.id,
          promptText: prompt.promptText,
          chatgptFound: result.chatgpt.found,
          chatgptCited: result.chatgpt.cited,
          googleAIFound: result.googleAI.found,
          googleAICited: result.googleAI.cited,
          competitors: competitors.length > 0 ? JSON.stringify(competitors) : null,
          chatgptResponse: result.chatgpt.response || null,
          googleAIResponse: result.googleAI.response || null,
        });
      }
    }

    const overallScore = servicePromptCount > 0 ? Math.round((foundCount / servicePromptCount) * 100) : 0;
    const servicePromptsChatgpt = servicePromptCount;
    const servicePromptsGoogle = servicePromptCount;
    const chatgptScore = servicePromptsChatgpt > 0 ? Math.round((chatgptFoundCount / servicePromptsChatgpt) * 100) : 0;
    const googleAIScore = servicePromptsGoogle > 0 ? Math.round((googleAIFoundCount / servicePromptsGoogle) * 100) : 0;

    const topCitations = aggregateCitations([
      allChatgptCitations,
      allGoogleAICitations
    ]);

    const competitorCounts = aggregateCompetitorMentions(
      storedResults.filter(r => !r.isBrandSentiment).map(r => ({ competitors: r.competitors }))
    );
    const shareOfVoice = computeShareOfVoice(client.businessName, foundCount, competitorCounts, servicePromptCount);
    const sentimentBreakdown = aggregateSentiment([...allChatgptSentiments, ...allGoogleAISentiments]);
    const avgChatgptRank = calculateAverageRank(allChatgptRanks);
    const avgGoogleAIRank = calculateAverageRank(allGoogleAIRanks);
    const firstPlaceCount = countFirstPlace(allChatgptRanks) + countFirstPlace(allGoogleAIRanks);

    // Sentiment score calculation removed - using categorical sentiment only
    const sentimentScore = null;
    const competitorVisibility = computeCompetitorVisibility(competitorCounts, servicePromptCount);

    const sentimentStatements = aggregateSentimentStatements(
      storedResults.filter(r => !r.isBrandSentiment),
      client.businessName
    );

    const brandSentimentFindings = collectBrandSentimentFindings(
      storedResults.filter(r => r.isBrandSentiment),
      client.businessName
    );

    for (const finding of brandSentimentFindings.issues) {
      sentimentStatements.negative.unshift({
        text: finding.text,
        platform: finding.platform,
      });
    }
    for (const finding of brandSentimentFindings.praise) {
      sentimentStatements.positive.unshift({
        text: finding.text,
        platform: finding.platform,
      });
    }

    sentimentStatements.positive = sentimentStatements.positive.slice(0, 5);
    sentimentStatements.negative = sentimentStatements.negative.slice(0, 5);

    let sentimentNarratives: SynthesizedNarratives | null = null;
    try {
      const statementsToSynthesize = {
        positive: sentimentStatements.positive.slice(0, 10).map(s => ({
          text: s.text,
          platform: s.platform,
          promptText: "",
        })),
        negative: sentimentStatements.negative.slice(0, 10).map(s => ({
          text: s.text,
          platform: s.platform,
          promptText: "",
        })),
      };
      sentimentNarratives = await synthesizeSentimentNarratives(
        statementsToSynthesize,
        client.businessName
      );
    } catch (error) {
      log(`Failed to synthesize sentiment narratives: ${error}`, "scheduler");
    }

    await storage.updateCheckSession(session.id, {
      overallScore,
      chatgptScore,
      googleAIScore,
      totalPrompts: servicePromptCount,
      foundCount,
      citedCount,
      shareOfVoice,
      avgChatgptRank,
      avgGoogleAIRank,
      firstPlaceCount,
      sentimentBreakdown,
      topCitations,
      sentimentScore,
      competitorVisibility,
      sentimentStatements,
      sentimentNarratives,
    } as any);

    for (const group of activeGroups) {
      const gm = groupMetrics[group.name];
      if (gm && gm.totalPrompts > 0) {
        const visibilityScore = Math.round((gm.foundCount / gm.totalPrompts) * 100);
        await storage.createCheckGroupMetric({
          sessionId: session.id,
          clientId,
          groupId: gm.groupId,
          groupName: group.name,
          totalPrompts: gm.totalPrompts,
          foundCount: gm.foundCount,
          citedCount: gm.citedCount,
          visibilityScore,
          chatgptFoundCount: gm.chatgptFoundCount,
          googleAIFoundCount: gm.googleAIFoundCount,
        });
      }
    }

    for (const [compName, count] of Array.from(competitorCounts.entries())) {
      const visibilityPercent = servicePromptCount > 0 ? (count / servicePromptCount) * 100 : 0;
      await storage.createCheckCompetitorMetric({
        sessionId: session.id,
        clientId,
        competitorName: compName,
        mentionCount: count,
        visibilityPercent,
        chatgptMentions: 0,
        googleAIMentions: 0,
      });
    }

    const nextCheck = new Date();
    nextCheck.setDate(nextCheck.getDate() + client.checkFrequencyDays);
    await storage.updateMonitoringClient(clientId, {
      nextCheckAt: nextCheck,
      lastCheckAt: new Date(),
    } as any);

    const duration = Math.round((Date.now() - startTime) / 1000);
    log(`Completed scheduled scan for client ${clientId} (session ${session.id}): score ${overallScore}% in ${duration}s`, "scheduler");

  } catch (error) {
    log(`Error during scheduled scan for client ${clientId}: ${error}`, "scheduler");
    const nextCheck = new Date();
    nextCheck.setMinutes(nextCheck.getMinutes() + 30);
    try {
      await storage.updateMonitoringClient(clientId, {
        nextCheckAt: nextCheck,
      } as any);
    } catch (updateError) {
      log(`Failed to update nextCheckAt after error: ${updateError}`, "scheduler");
    }
  }
}

async function checkAndRunScheduledScans(): Promise<void> {
  if (isSchedulerRunning) {
    return;
  }

  isSchedulerRunning = true;

  try {
    const dueClients = await storage.getClientsDueForCheck();

    if (dueClients.length > 0) {
      log(`Found ${dueClients.length} clients due for scheduled check`, "scheduler");
    }

    for (const client of dueClients) {
      await runScheduledScan(client.id);
    }
  } catch (error) {
    log(`Error checking for scheduled scans: ${error}`, "scheduler");
  } finally {
    isSchedulerRunning = false;
  }
}

export function startScheduler(): void {
  if (schedulerIntervalId) {
    log("Scheduler already running", "scheduler");
    return;
  }

  log("Starting visibility check scheduler", "scheduler");

  checkAndRunScheduledScans();

  schedulerIntervalId = setInterval(checkAndRunScheduledScans, SCHEDULER_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    log("Scheduler stopped", "scheduler");
  }
}
