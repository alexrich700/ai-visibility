import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateServiceGroups, generateServiceGroupsMultiCategory, generatePromptsForGroups, runPromptCheck, synthesizeSentimentNarratives, generateBrandSentimentPrompts, type SynthesizedNarratives, type MultiCategoryServiceGroupsResult, getPromptGenerationStats, testOpenAIConnectivity } from "./ai-services";
import { monitoringClientRequestSchema, promptFallbackLogs } from "@shared/schema";
import { db } from "./db";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { logError, getSafeErrorResponse } from "./utils/error-sanitizer";
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
  type BrandSentimentFinding
} from "./services/scan-analytics";
import { streamExportZip, streamSessionExportZip } from "./services/export-generator";
import apiRouter from "./routes/index";
import { 
  requireAdminAuth, 
  requireAdminOrClientAuth,
  generateClientAccessToken,
  createClientSession,
  getClientIdFromRequest,
  isAdminRequest
} from "./middleware/auth";


// Temporary cache for pending scan configurations (for SSE handshake only)
// Actual scan data is persisted in the database
interface PendingScanConfig {
  client: z.infer<typeof monitoringClientRequestSchema>;
  groups: { name: string; description: string; isHighLevelCategory: boolean }[];
  prompts: { groupName: string; text: string }[];
  targetCity?: string; // Which city this scan is for (multi-city support)
  createdAt: number;
}
const pendingScanConfigs = new Map<string, PendingScanConfig>();

// Interface for rescan config (existing client)
interface PendingRescanConfig {
  clientId: number;
  targetCity?: string; // Which city this scan is for (multi-city support)
  client: {
    id: number;
    businessName: string;
    domain: string;
    industry: string | null;
    scope: string | null;
    city: string | null;
    cities: string[] | null; // Multiple target cities
    primaryCategories: string[] | null; // Multiple service categories
    brandAliases: string[] | null;
    checkFrequencyDays: number;
    nextCheckAt: Date | null;
    isActive: boolean;
    createdAt: Date | null;
  };
  groups: {
    id: number;
    clientId: number;
    name: string;
    description: string | null;
    isHighLevelCategory: boolean;
    isActive: boolean;
    createdAt: Date | null;
  }[];
  prompts: {
    id: number;
    groupId: number;
    promptText: string;
    isActive: boolean;
    createdAt: Date | null;
  }[];
  createdAt: number;
}
const pendingRescanConfigs = new Map<string, PendingRescanConfig>();

// Retry helper with exponential backoff for API calls
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 10000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorType = lastError.message.includes("rate") || lastError.message.includes("429") 
        ? "RATE_LIMIT" 
        : lastError.message.includes("timeout") 
          ? "TIMEOUT" 
          : "API_ERROR";
      
      if (attempt < maxRetries) {
        // Exponential backoff: 10s, 20s, 30s
        const delayMs = baseDelayMs * (attempt + 1);
        console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed (${errorType}): ${lastError.message}`);
        console.log(`[RETRY] Waiting ${delayMs/1000}s before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.log(`[RETRY] All ${maxRetries} retries exhausted. Final error: ${lastError.message}`);
      }
    }
  }
  
  throw lastError;
}

// Clean up stale configs older than 5 minutes
setInterval(() => {
  const now = Date.now();
  const scanEntries = Array.from(pendingScanConfigs.entries());
  for (const [id, config] of scanEntries) {
    if (now - config.createdAt > 5 * 60 * 1000) {
      pendingScanConfigs.delete(id);
    }
  }
  const rescanEntries = Array.from(pendingRescanConfigs.entries());
  for (const [id, config] of rescanEntries) {
    if (now - config.createdAt > 5 * 60 * 1000) {
      pendingRescanConfigs.delete(id);
    }
  }
}, 60 * 1000);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Mount modular routes for audit, leads, and admin
  app.use("/api", apiRouter);

  // ============================================
  // DIAGNOSTICS ENDPOINTS
  // ============================================

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // OpenAI connectivity test (admin only - checks if API is working)
  app.get("/api/diagnostics/openai", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const result = await testOpenAIConnectivity();
    res.json(result);
  });

  // Prompt generation statistics (admin only)
  app.get("/api/diagnostics/prompt-stats", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const stats = getPromptGenerationStats();
    res.json({
      ...stats,
      serverTime: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development"
    });
  });

  // Fallback logs from database (admin only) - persistent history of prompt generation failures
  app.get("/api/diagnostics/fallback-logs", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const logs = await db.select()
        .from(promptFallbackLogs)
        .orderBy(desc(promptFallbackLogs.createdAt))
        .limit(limit);
      
      // Aggregate stats from the logs
      const reasonCounts: Record<string, number> = {};
      for (const log of logs) {
        reasonCounts[log.reason] = (reasonCounts[log.reason] || 0) + 1;
      }
      
      res.json({
        logs,
        totalCount: logs.length,
        reasonCounts,
        serverTime: new Date().toISOString()
      });
    } catch (error) {
      logError("FETCH FALLBACK LOGS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to fetch fallback logs"));
    }
  });

  // ============================================
  // MONITORING ENDPOINTS
  // ============================================

  // Generate service groups using AI
  // Supports both single-category (legacy) and multi-category requests
  app.post("/api/monitoring/generate-groups", async (req, res) => {
    try {
      const { businessName, industry, scope, city, primaryCategories } = req.body;
      
      if (!businessName) {
        return res.status(400).json({ error: "Business name is required" });
      }
      
      // Determine categories to use - either explicit primaryCategories array or legacy industry field
      const categories: string[] = primaryCategories && primaryCategories.length > 0 
        ? primaryCategories 
        : industry ? [industry] : [];
      
      if (categories.length === 0) {
        return res.status(400).json({ error: "At least one category (industry or primaryCategories) is required" });
      }

      // Use multi-category function if multiple categories, otherwise single category
      if (categories.length > 1) {
        const result = await generateServiceGroupsMultiCategory(businessName, categories, scope, city);
        
        // Return high-level categories as initial groups, followed by specific groups
        const allGroups = [
          ...result.highLevelCategories.map(cat => ({ 
            name: cat.name, 
            description: cat.description,
            isHighLevelCategory: true 
          })),
          ...result.groups.map(g => ({ ...g, isHighLevelCategory: false }))
        ];
        
        res.json({ 
          groups: allGroups,
          highLevelCategories: result.highLevelCategories,
          isMultiCategory: true
        });
      } else {
        const result = await generateServiceGroups(businessName, categories[0], scope, city);
        
        // Return high-level category as the first group, followed by specific groups
        const allGroups = [
          { 
            name: result.highLevelCategory.name, 
            description: result.highLevelCategory.description,
            isHighLevelCategory: true 
          },
          ...result.groups.map(g => ({ ...g, isHighLevelCategory: false }))
        ];
        
        res.json({ 
          groups: allGroups,
          highLevelCategory: result.highLevelCategory,
          isMultiCategory: false
        });
      }
    } catch (error) {
      logError("GENERATE GROUPS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to generate groups"));
    }
  });

  // Generate prompts for groups using AI
  app.post("/api/monitoring/generate-prompts", async (req, res) => {
    try {
      const { businessName, domain, industry, scope, city, groups } = req.body;
      
      if (!businessName || !industry || !groups || !Array.isArray(groups)) {
        return res.status(400).json({ error: "Business name, industry, and groups are required" });
      }

      // Generate prompts for all groups using the shared PROMPTS_PER_GROUP constant
      const prompts = await generatePromptsForGroups(businessName, domain, industry, scope, city, groups);
      
      res.json({ prompts });
    } catch (error) {
      logError("GENERATE PROMPTS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to generate prompts"));
    }
  });

  // Create client and run initial scan
  app.post("/api/monitoring/create-and-scan", async (req, res) => {
    try {
      const { client: clientData, groups, prompts } = req.body;
      
      // Validate client data
      const validatedClient = monitoringClientRequestSchema.parse(clientData);
      
      // Create monitoring client
      const client = await storage.createMonitoringClient({
        businessName: validatedClient.businessName,
        domain: validatedClient.domain,
        industry: validatedClient.industry,
        scope: validatedClient.scope,
        city: validatedClient.city || null,
        cities: validatedClient.cities || null,
        primaryCategories: validatedClient.primaryCategories || null,
        brandAliases: validatedClient.brandAliases || null,
        checkFrequencyDays: validatedClient.checkFrequencyDays,
        isActive: true,
      });
      
      // Create groups and map their IDs
      const groupIdMap: Record<string, number> = {};
      for (const group of groups) {
        const createdGroup = await storage.createGroup({
          clientId: client.id,
          name: group.name,
          description: group.description || null,
          isHighLevelCategory: group.isHighLevelCategory || false,
          isActive: true,
        });
        groupIdMap[group.name] = createdGroup.id;
      }
      
      // Create prompts
      const createdPrompts: { id: number; groupId: number; text: string }[] = [];
      for (const prompt of prompts) {
        const groupId = groupIdMap[prompt.groupName];
        if (groupId) {
          const createdPrompt = await storage.createPrompt({
            groupId,
            promptText: prompt.text,
            isActive: true,
          });
          createdPrompts.push({ id: createdPrompt.id, groupId, text: prompt.text });
        }
      }
      
      const totalPrompts = createdPrompts.length;
      
      // Create check session first with initial values (will update with final scores)
      const session = await storage.createCheckSession({
        clientId: client.id,
        overallScore: 0,
        chatgptScore: 0,
        googleAIScore: 0,
        totalPrompts,
        foundCount: 0,
        citedCount: 0,
      });
      
      // Run visibility check on all prompts
      let foundCount = 0;
      let citedCount = 0;
      let chatgptFoundCount = 0;
      let googleAIFoundCount = 0;
      
      // Build location string for web search grounding (same format as lead gen audit)
      const location = client.city || undefined;
      
      for (const prompt of createdPrompts) {
        const result = await runPromptCheck(
          prompt.text,
          client.businessName,
          client.domain,
          location,
          client.brandAliases || undefined
        );
        
        // Store result with sessionId
        await storage.createCheckResult({
          sessionId: session.id,
          clientId: client.id,
          groupId: prompt.groupId,
          promptId: prompt.id,
          promptText: prompt.text,
          chatgptFound: result.chatgpt.found,
          chatgptResponse: result.chatgpt.response,
          chatgptCited: result.chatgpt.cited,
          googleAIFound: result.googleAI.found,
          googleAIResponse: result.googleAI.response,
          googleAICited: result.googleAI.cited,
          competitors: JSON.stringify(result.competitors),
        });
        
        if (result.chatgpt.found || result.googleAI.found) foundCount++;
        if (result.chatgpt.cited || result.googleAI.cited) citedCount++;
        if (result.chatgpt.found) chatgptFoundCount++;
        if (result.googleAI.found) googleAIFoundCount++;
      }
      
      // Calculate final scores using per-exposure method (each platform check counts separately)
      // This matches the frontend visibilityRate calculation: (chatgptFound + googleAIFound) / (prompts × 2)
      const totalExposures = totalPrompts * 2; // Each prompt checks 2 platforms
      const totalFound = chatgptFoundCount + googleAIFoundCount;
      const overallScore = totalExposures > 0 ? Math.round((totalFound / totalExposures) * 100) : 0;
      const chatgptScore = totalPrompts > 0 ? Math.round((chatgptFoundCount / totalPrompts) * 100) : 0;
      const googleAIScore = totalPrompts > 0 ? Math.round((googleAIFoundCount / totalPrompts) * 100) : 0;
      
      // Update session with final scores
      await storage.updateCheckSession(session.id, {
        overallScore,
        chatgptScore,
        googleAIScore,
        foundCount,
        citedCount,
      });
      
      // Update client with last check time and calculate next check
      const nextCheckAt = new Date();
      nextCheckAt.setDate(nextCheckAt.getDate() + validatedClient.checkFrequencyDays);
      await storage.updateMonitoringClient(client.id, {
        checkFrequencyDays: validatedClient.checkFrequencyDays,
      });
      
      res.json({ clientId: client.id, sessionId: session.id });
    } catch (error) {
      logError("CREATE AND SCAN ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to create client and run scan"));
    }
  });

  // Step 1: Prepare scan - stores config temporarily and returns a prepareId
  // This allows the frontend to then connect via EventSource (GET) for proper SSE
  app.post("/api/monitoring/scan-prepare", async (req, res) => {
    try {
      const { client: clientData, groups, prompts, targetCity } = req.body;
      
      // Validate client data upfront
      const validatedClient = monitoringClientRequestSchema.parse(clientData);
      
      // Generate unique ID for this scan preparation
      const prepareId = randomUUID();
      
      // Store config temporarily (will be consumed by SSE endpoint)
      // targetCity determines which city this scan is for (for multi-city clients)
      pendingScanConfigs.set(prepareId, {
        client: validatedClient,
        groups: groups || [],
        prompts: prompts || [],
        targetCity: targetCity || validatedClient.city || undefined,
        createdAt: Date.now(),
      });
      
      res.json({ prepareId });
    } catch (error) {
      logError("SCAN PREPARE ERROR", error);
      res.status(400).json(getSafeErrorResponse("Failed to prepare scan"));
    }
  });

  // Step 2: SSE endpoint (GET) for real-time scan progress
  // Using GET allows proper EventSource connection from browser
  app.get("/api/monitoring/scan-stream/:prepareId", async (req, res) => {
    const { prepareId } = req.params;
    
    // Retrieve and consume the pending config
    const config = pendingScanConfigs.get(prepareId);
    if (!config) {
      res.status(404).json({ error: "Scan configuration not found or expired" });
      return;
    }
    pendingScanConfigs.delete(prepareId);
    
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Track if client disconnected to cancel remaining work
    let isClientConnected = true;
    let activeSessionId: number | null = null; // Track session for pause on disconnect
    
    req.on("close", async () => {
      isClientConnected = false;
      console.log("Client disconnected from scan stream - scan will continue in background");
      // Note: We do NOT mark the session as paused or cancel the scan
      // The scan continues running on the server even if the client navigates away
      // The user can check the monitoring dashboard to see the completed results
    });

    // Helper to send SSE events
    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (!isClientConnected) return;
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    // Heartbeat interval to keep SSE connection alive (declared here so catch can clean up)
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    try {
      const { client: validatedClient, groups, prompts, targetCity } = config;
      
      // Determine the city for this scan - use targetCity if provided, else fall back to client's city
      const scanCity = targetCity || validatedClient.city || undefined;
      
      // Send immediate heartbeat to confirm stream is active
      sendEvent("heartbeat", { message: "Stream connected" });
      
      sendEvent("status", { message: "Creating client profile...", progress: 5 });
      
      // Create monitoring client
      const client = await storage.createMonitoringClient({
        businessName: validatedClient.businessName,
        domain: validatedClient.domain,
        industry: validatedClient.industry,
        scope: validatedClient.scope,
        city: validatedClient.city || null,
        cities: validatedClient.cities || null,
        primaryCategories: validatedClient.primaryCategories || null,
        brandAliases: validatedClient.brandAliases || null,
        checkFrequencyDays: validatedClient.checkFrequencyDays,
        isActive: true,
      });
      
      sendEvent("status", { message: "Setting up service groups...", progress: 8 });
      
      // Create groups and map their IDs
      const groupIdMap: Record<string, number> = {};
      const groupNames: string[] = [];
      const brandSentimentGroupName = "Brand Sentiment";
      
      for (const group of groups) {
        const createdGroup = await storage.createGroup({
          clientId: client.id,
          name: group.name,
          description: group.description || null,
          isHighLevelCategory: group.isHighLevelCategory || false,
          promptCategory: 'service', // Regular service prompts
          isActive: true,
        });
        groupIdMap[group.name] = createdGroup.id;
        groupNames.push(group.name);
      }
      
      // Create Brand Sentiment group with brand-specific prompts
      const brandSentimentGroup = await storage.createGroup({
        clientId: client.id,
        name: brandSentimentGroupName,
        description: "Direct brand questions to gather sentiment and feedback",
        isHighLevelCategory: false,
        promptCategory: 'brand_sentiment', // Brand sentiment category - excluded from visibility metrics
        isActive: true,
      });
      groupIdMap[brandSentimentGroupName] = brandSentimentGroup.id;
      groupNames.push(brandSentimentGroupName);
      
      sendEvent("status", { message: "Preparing prompts...", progress: 10 });
      
      // Create prompts and organize by group
      const promptsByGroup: Record<string, { id: number; groupId: number; text: string }[]> = {};
      for (const prompt of prompts) {
        const groupId = groupIdMap[prompt.groupName];
        if (groupId) {
          const createdPrompt = await storage.createPrompt({
            groupId,
            promptText: prompt.text,
            isActive: true,
          });
          if (!promptsByGroup[prompt.groupName]) {
            promptsByGroup[prompt.groupName] = [];
          }
          promptsByGroup[prompt.groupName].push({ id: createdPrompt.id, groupId, text: prompt.text });
        }
      }
      
      // Generate and create brand sentiment prompts (use scanCity for location context)
      const brandSentimentPrompts = generateBrandSentimentPrompts(
        client.businessName,
        client.industry,
        scanCity || client.city || undefined
      );
      promptsByGroup[brandSentimentGroupName] = [];
      for (const promptText of brandSentimentPrompts) {
        const createdPrompt = await storage.createPrompt({
          groupId: brandSentimentGroup.id,
          promptText,
          isActive: true,
        });
        promptsByGroup[brandSentimentGroupName].push({
          id: createdPrompt.id,
          groupId: brandSentimentGroup.id,
          text: promptText,
        });
      }
      
      const allPrompts = Object.values(promptsByGroup).flat();
      const totalPrompts = allPrompts.length;
      
      // Calculate service-only prompt count for visibility scoring (exclude brand sentiment)
      const servicePromptCount = totalPrompts - (promptsByGroup[brandSentimentGroupName]?.length || 0);
      
      // Create check session with city for multi-city tracking
      // Include checkpoint fields for resume capability
      const session = await storage.createCheckSession({
        clientId: client.id,
        city: scanCity || null, // Track which city this scan was for
        overallScore: 0,
        chatgptScore: 0,
        googleAIScore: 0,
        totalPrompts: servicePromptCount, // Store only service prompts in visibility totals
        foundCount: 0,
        citedCount: 0,
        // Checkpoint fields for resume capability
        status: 'running',
        prepareId,
        lastCompletedPromptIndex: 0,
        totalPromptsToScan: totalPrompts,
        errorMessage: null,
      });
      
      // Set activeSessionId for pause-on-disconnect handling
      activeSessionId = session.id;
      
      // Send sessionId early so frontend can use it for resume on disconnect
      sendEvent("session_created", { sessionId: session.id, clientId: client.id });
      
      // Run visibility checks with bounded concurrency (4 prompts at a time)
      // Each prompt still runs ChatGPT and Gemini in parallel internally
      // Reduced from 8 to 4 to avoid rate limiting; retry logic handles transient failures
      const CONCURRENT_PROMPTS = 4;
      let foundCount = 0;  // Service prompts only
      let citedCount = 0;  // Service prompts only
      let chatgptFoundCount = 0;  // Service prompts only
      let googleAIFoundCount = 0;  // Service prompts only
      let completedCount = 0;
      
      // Analytics collection for session-level aggregation
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
        isBrandSentiment: boolean;  // Track if this is a brand sentiment prompt
      }[] = [];
      
      // Per-group metrics tracking
      const groupMetrics: Record<string, {
        groupId: number;
        totalPrompts: number;
        foundCount: number;
        citedCount: number;
        chatgptFoundCount: number;
        googleAIFoundCount: number;
        competitors: string[];
      }> = {};
      
      // Use scanCity (targetCity) for location context in AI queries
      const location = scanCity || client.city || undefined;
      
      // Get all configured cities for city name substitution
      // When scanning for a different city, we need to replace city names in prompts
      const allCities = validatedClient.cities || (validatedClient.city ? [validatedClient.city] : []);
      
      // Helper to escape regex special characters in city names (e.g., "St. Paul" has a period)
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Sort cities by length (longest first) to avoid substring collisions
      // e.g., "New York" should be replaced before "York" to avoid "New New York"
      const sortedCities = [...allCities].sort((a, b) => b.length - a.length);
      
      // Flatten all prompts with their group names and original indices for batch processing
      // Apply city substitution if scanning for a different city than what prompts were generated with
      const allPromptsWithGroups: { 
        prompt: { id: number; groupId: number; text: string }; 
        groupName: string; 
        originalIndex: number; 
      }[] = [];
      let idx = 0;
      for (const groupName of groupNames) {
        const groupPrompts = promptsByGroup[groupName] || [];
        for (const prompt of groupPrompts) {
          idx++;
          
          // Substitute city names in prompts if scanning for a different city
          let promptText = prompt.text;
          if (scanCity) {
            for (const originalCity of sortedCities) {
              if (originalCity !== scanCity && promptText.includes(originalCity)) {
                const escapedCity = escapeRegex(originalCity);
                promptText = promptText.replace(new RegExp(escapedCity, 'gi'), scanCity);
              }
            }
          }
          
          allPromptsWithGroups.push({ 
            prompt: { ...prompt, text: promptText }, 
            groupName, 
            originalIndex: idx 
          });
        }
      }
      
      // Track per-group completion counts
      const groupCompletedCounts: Record<string, number> = {};
      const groupTotalCounts: Record<string, number> = {};
      const groupsCompleted = new Set<string>();
      
      for (const groupName of groupNames) {
        groupCompletedCounts[groupName] = 0;
        groupTotalCounts[groupName] = (promptsByGroup[groupName] || []).length;
        // Initialize group metrics tracking
        groupMetrics[groupName] = {
          groupId: groupIdMap[groupName],
          totalPrompts: groupTotalCounts[groupName],
          foundCount: 0,
          citedCount: 0,
          chatgptFoundCount: 0,
          googleAIFoundCount: 0,
          competitors: [],
        };
      }
      
      // Setup heartbeat interval to keep SSE connection alive (every 5 seconds for production proxy compatibility)
      heartbeatInterval = setInterval(() => {
        if (isClientConnected) {
          sendEvent("heartbeat", { timestamp: Date.now(), completedCount, totalPrompts });
        }
      }, 5000);
      
      // Process prompts in concurrent batches
      // Note: Scan continues even if client disconnects - do NOT cancel on disconnect
      for (let i = 0; i < allPromptsWithGroups.length; i += CONCURRENT_PROMPTS) {
        const batch = allPromptsWithGroups.slice(i, i + CONCURRENT_PROMPTS);
        
        // Send testing events for all prompts in this batch (use original index)
        for (const item of batch) {
          sendEvent("testing", { 
            groupName: item.groupName,
            promptIndex: item.originalIndex,
            totalPrompts,
            promptText: item.prompt.text.slice(0, 60) + (item.prompt.text.length > 60 ? "..." : ""),
            progress: 10 + Math.round((item.originalIndex / totalPrompts) * 85),
          });
        }
        
        // Run all prompts in this batch concurrently with per-prompt error handling
        // Note: Scan continues even if client disconnects
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            try {
              const result = await retryWithBackoff(() => 
                runPromptCheck(
                  item.prompt.text,
                  client.businessName,
                  client.domain,
                  location,
                  client.brandAliases || undefined
                )
              );
              
              return { ...item, result };
            } catch (error) {
              logError(`PROMPT ERROR - Prompt ${item.originalIndex + 1} (${item.groupName})`, error);
              // Return a failed result with sanitized error message - no internal details
              return { 
                ...item, 
                result: {
                  chatgpt: { found: false, response: "Unable to complete this check at this time.", cited: false, citations: [] },
                  googleAI: { found: false, response: "Unable to complete this check at this time.", cited: false, citations: [] },
                  competitors: []
                }
              };
            }
          })
        );
        
        // Process and store results from this batch (maintain order for consistent indices)
        // Note: Scan continues even if client disconnects
        for (const batchResult of batchResults) {
          if (!batchResult) continue;
          
          const { prompt, groupName, originalIndex, result } = batchResult;
          completedCount++;
          const progressPercent = 10 + Math.round((completedCount / totalPrompts) * 85);
          
          // Analyze responses for analytics
          const chatgptAnalytics = analyzeResponse(result.chatgpt.response, client.businessName);
          const googleAIAnalytics = analyzeResponse(result.googleAI.response, client.businessName);
          
          // Sentiment scores removed - using categorical sentiment only
          const chatgptSentimentScore = null;
          const googleAISentimentScore = null;
          
          // Use API-extracted citations (with title info) if available, fallback to text-extracted
          const chatgptCitationsToStore = result.chatgpt.citations.length > 0 
            ? result.chatgpt.citations 
            : chatgptAnalytics.citations;
          const googleAICitationsToStore = result.googleAI.citations.length > 0 
            ? result.googleAI.citations 
            : googleAIAnalytics.citations;
          
          // Track if this is a brand sentiment prompt (excluded from visibility scoring)
          const isBrandSentiment = groupName === brandSentimentGroupName;
          
          // Collect for session-level aggregation
          allChatgptCitations.push(chatgptCitationsToStore);
          allGoogleAICitations.push(googleAICitationsToStore);
          allChatgptRanks.push(chatgptAnalytics.rank);
          allGoogleAIRanks.push(googleAIAnalytics.rank);
          allChatgptSentiments.push(chatgptAnalytics.sentiment);
          allGoogleAISentiments.push(googleAIAnalytics.sentiment);
          storedResults.push({ 
            competitors: JSON.stringify(result.competitors),
            chatgptResponse: result.chatgpt.response,
            googleAIResponse: result.googleAI.response,
            promptText: prompt.text,
            chatgptSentimentScore,
            googleAISentimentScore,
            isBrandSentiment
          });
          
          // Store result with analytics (with error handling)
          try {
            await storage.createCheckResult({
              sessionId: session.id,
              clientId: client.id,
              groupId: prompt.groupId,
              promptId: prompt.id,
              promptText: prompt.text,
              chatgptFound: result.chatgpt.found,
              chatgptResponse: result.chatgpt.response,
              chatgptCited: result.chatgpt.cited,
              googleAIFound: result.googleAI.found,
              googleAIResponse: result.googleAI.response,
              googleAICited: result.googleAI.cited,
              competitors: JSON.stringify(result.competitors),
              // Analytics fields
              chatgptSentiment: chatgptAnalytics.sentiment,
              googleAISentiment: googleAIAnalytics.sentiment,
              chatgptSentimentScore,
              googleAISentimentScore,
              chatgptRank: chatgptAnalytics.rank,
              googleAIRank: googleAIAnalytics.rank,
              chatgptCitations: chatgptCitationsToStore,
              googleAICitations: googleAICitationsToStore,
              chatgptSnippet: chatgptAnalytics.snippet,
              googleAISnippet: googleAIAnalytics.snippet,
              googleAIGroundingMetadata: result.googleAI.groundingMetadata,
            });
          } catch (storeError) {
            console.error(`[STORAGE ERROR] Scan: Failed to store result for prompt ${originalIndex + 1}:`, storeError);
            // Continue processing - storage failure shouldn't crash the scan
          }
          
          // Only count service prompts for visibility scoring (exclude brand sentiment prompts)
          if (!isBrandSentiment) {
            if (result.chatgpt.found || result.googleAI.found) foundCount++;
            if (result.chatgpt.cited || result.googleAI.cited) citedCount++;
            if (result.chatgpt.found) chatgptFoundCount++;
            if (result.googleAI.found) googleAIFoundCount++;
          }
          
          // Track per-group metrics (include all groups for display purposes)
          if (groupMetrics[groupName]) {
            if (result.chatgpt.found || result.googleAI.found) groupMetrics[groupName].foundCount++;
            if (result.chatgpt.cited || result.googleAI.cited) groupMetrics[groupName].citedCount++;
            if (result.chatgpt.found) groupMetrics[groupName].chatgptFoundCount++;
            if (result.googleAI.found) groupMetrics[groupName].googleAIFoundCount++;
            if (result.competitors && result.competitors.length > 0) {
              groupMetrics[groupName].competitors.push(...result.competitors);
            }
          }
          
          // Track per-group completion
          groupCompletedCounts[groupName]++;
          
          // Send completion event for this prompt (use original index for consistency)
          sendEvent("prompt_complete", {
            groupName,
            promptIndex: originalIndex,
            totalPrompts,
            chatgptFound: result.chatgpt.found,
            googleAIFound: result.googleAI.found,
            progress: progressPercent,
          });
          
          // Check if this group is now complete
          if (!groupsCompleted.has(groupName) && 
              groupCompletedCounts[groupName] >= groupTotalCounts[groupName]) {
            groupsCompleted.add(groupName);
            sendEvent("group_complete", { groupName });
          }
          
          // Update checkpoint after each prompt to enable resume
          // Also save running scores so partial scans show accurate data
          try {
            // Calculate running scores using per-exposure method (each platform check counts separately)
            const runningTotalExposures = servicePromptCount * 2;
            const runningTotalFound = chatgptFoundCount + googleAIFoundCount;
            const runningOverallScore = runningTotalExposures > 0 ? Math.round((runningTotalFound / runningTotalExposures) * 100) : 0;
            const runningChatgptScore = servicePromptCount > 0 ? Math.round((chatgptFoundCount / servicePromptCount) * 100) : 0;
            const runningGoogleAIScore = servicePromptCount > 0 ? Math.round((googleAIFoundCount / servicePromptCount) * 100) : 0;
            
            await storage.updateCheckSession(session.id, {
              lastCompletedPromptIndex: completedCount,
              status: 'running',
              // Save running counts and scores for accurate partial data
              foundCount,
              citedCount,
              overallScore: runningOverallScore,
              chatgptScore: runningChatgptScore,
              googleAIScore: runningGoogleAIScore,
            });
            console.log(`[Checkpoint] Session ${session.id}: Saved checkpoint at prompt ${completedCount}/${totalPrompts} (score: ${runningOverallScore}%)`);
          } catch (checkpointError) {
            console.error(`[Checkpoint] Failed to save checkpoint for session ${session.id}:`, checkpointError);
            // Continue processing - checkpoint failure shouldn't stop the scan
          }
        }
      }
      
      // Fire group_complete for any groups with zero prompts (edge case)
      for (const groupName of groupNames) {
        if (!groupsCompleted.has(groupName) && groupTotalCounts[groupName] === 0) {
          sendEvent("group_complete", { groupName });
        }
      }
      
      // Note: Scan continues even if client disconnects - do NOT cancel here
      
      // Clear heartbeat now that processing is complete
      clearInterval(heartbeatInterval);
      
      // Calculate final scores using per-exposure method (each platform check counts separately)
      // This matches the frontend visibilityRate calculation: (chatgptFound + googleAIFound) / (prompts × 2)
      const totalExposures = servicePromptCount * 2; // Each prompt checks 2 platforms
      const totalFound = chatgptFoundCount + googleAIFoundCount;
      const overallScore = totalExposures > 0 ? Math.round((totalFound / totalExposures) * 100) : 0;
      const chatgptScore = servicePromptCount > 0 ? Math.round((chatgptFoundCount / servicePromptCount) * 100) : 0;
      const googleAIScore = servicePromptCount > 0 ? Math.round((googleAIFoundCount / servicePromptCount) * 100) : 0;
      
      sendEvent("status", { message: "Calculating final scores...", progress: 97 });
      
      // Aggregate session-level analytics
      const competitorCounts = aggregateCompetitorMentions(storedResults);
      const shareOfVoice = computeShareOfVoice(client.businessName, foundCount, competitorCounts, totalPrompts);
      const avgChatgptRank = calculateAverageRank(allChatgptRanks);
      const avgGoogleAIRank = calculateAverageRank(allGoogleAIRanks);
      const firstPlaceCount = countFirstPlace(allChatgptRanks) + countFirstPlace(allGoogleAIRanks);
      const sentimentBreakdown = aggregateSentiment([...allChatgptSentiments, ...allGoogleAISentiments]);
      const topCitations = aggregateCitations([...allChatgptCitations, ...allGoogleAICitations]);
      
      // Sentiment score calculation removed - using categorical sentiment only
      const sentimentScore = null;
      
      // Compute competitor visibility (using service prompts only)
      const competitorVisibility = computeCompetitorVisibility(competitorCounts, servicePromptCount, 5);
      
      // Extract sentiment statements from service prompts
      const sentimentStatements = aggregateSentimentStatements(storedResults, client.businessName);
      
      // Extract brand sentiment findings from brand-specific prompts
      const brandSentimentFindings = collectBrandSentimentFindings(storedResults, client.businessName);
      
      // Merge brand sentiment findings into negative statements for Areas for Improvement
      // Brand sentiment issues provide more specific, actionable feedback
      if (brandSentimentFindings.issues.length > 0) {
        const brandIssueStatements = brandSentimentFindings.issues.map(finding => ({
          text: finding.text,
          platform: finding.platform,
          promptText: finding.promptText
        }));
        // Prepend brand sentiment issues (they're more specific than service prompt sentiment)
        sentimentStatements.negative = [...brandIssueStatements, ...sentimentStatements.negative].slice(0, 5);
      }
      
      // Merge brand sentiment praise into positive statements
      if (brandSentimentFindings.praise.length > 0) {
        const brandPraiseStatements = brandSentimentFindings.praise.map(finding => ({
          text: finding.text,
          platform: finding.platform,
          promptText: finding.promptText
        }));
        // Prepend brand sentiment praise
        sentimentStatements.positive = [...brandPraiseStatements, ...sentimentStatements.positive].slice(0, 5);
      }
      
      // Update session with final scores and analytics
      await storage.updateCheckSession(session.id, {
        overallScore,
        chatgptScore,
        googleAIScore,
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
      });
      
      // Store per-group metrics for trending
      for (const groupName of groupNames) {
        const gm = groupMetrics[groupName];
        if (gm && gm.totalPrompts > 0) {
          const visibilityScore = Math.round((gm.foundCount / gm.totalPrompts) * 100);
          await storage.createCheckGroupMetric({
            sessionId: session.id,
            clientId: client.id,
            groupId: gm.groupId,
            groupName,
            totalPrompts: gm.totalPrompts,
            foundCount: gm.foundCount,
            citedCount: gm.citedCount,
            visibilityScore,
            chatgptFoundCount: gm.chatgptFoundCount,
            googleAIFoundCount: gm.googleAIFoundCount,
          });
        }
      }
      
      // Store per-competitor metrics for trending
      for (const [compName, count] of Array.from(competitorCounts.entries())) {
        const visibilityPercent = totalPrompts > 0 ? (count / totalPrompts) * 100 : 0;
        await storage.createCheckCompetitorMetric({
          sessionId: session.id,
          clientId: client.id,
          competitorName: compName,
          mentionCount: count,
          visibilityPercent,
          chatgptMentions: 0, // Not tracked separately in current flow
          googleAIMentions: 0,
        });
      }
      
      // Update client
      await storage.updateMonitoringClient(client.id, {
        checkFrequencyDays: validatedClient.checkFrequencyDays,
      });
      
      // Mark session as complete - prevents accidental resume attempts
      await storage.updateCheckSession(session.id, {
        status: 'complete',
        lastCompletedPromptIndex: totalPrompts,
      } as any);
      
      // Send completion event with final data
      sendEvent("complete", { 
        clientId: client.id, 
        sessionId: session.id,
        overallScore,
        chatgptScore,
        googleAIScore,
        progress: 100,
      });
      
      res.end();
    } catch (error) {
      logError(`SCAN STREAM ERROR (prepareId=${prepareId})`, error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      // Mark session as failed with error details (safe for internal storage)
      const internalErrorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      if (activeSessionId) {
        try {
          await storage.updateCheckSession(activeSessionId, {
            status: 'failed',
            errorMessage: internalErrorMessage,
          } as any);
        } catch (updateErr) {
          console.error("Failed to mark session as failed:", updateErr);
        }
      }
      
      // Send sanitized error to client - no stack traces or internal details
      sendEvent("error", { 
        message: "An error occurred during the scan. Please try again.",
      });
      res.end();
    }
  });

  // Rescan endpoint for existing clients - creates new session with fresh data
  // Step 1: Prepare rescan (returns prepareId) (admin only)
  // Accepts optional targetCity in request body for multi-city rescans
  app.post("/api/monitoring/rescan-prepare/:clientId", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      const { targetCity } = req.body || {};
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const groups = await storage.getGroupsByClientId(clientId);
      const allPrompts = await storage.getPromptsByClientId(clientId);
      
      // Filter for only active groups and prompts
      const activeGroups = groups.filter(g => g.isActive);
      const activeGroupIds = new Set(activeGroups.map(g => g.id));
      const prompts = allPrompts.filter(p => p.isActive && activeGroupIds.has(p.groupId));
      
      // Validate that there are prompts to scan
      if (prompts.length === 0) {
        return res.status(400).json({ 
          error: "No prompts to scan",
          details: "This client has no active prompts configured. Please add prompts in the settings first."
        });
      }
      
      // Generate unique ID for this rescan preparation
      const prepareId = randomUUID();
      
      // Store config temporarily with existing client data (only active groups/prompts)
      // Include targetCity for multi-city support
      pendingRescanConfigs.set(prepareId, {
        clientId,
        targetCity: targetCity || undefined,
        client,
        groups: activeGroups,
        prompts,
        createdAt: Date.now(),
      });
      
      res.json({ prepareId, totalPrompts: prompts.length, targetCity: targetCity || null });
    } catch (error) {
      logError("RESCAN PREPARE ERROR", error);
      res.status(400).json(getSafeErrorResponse("Failed to prepare rescan"));
    }
  });

  // ============================================
  // BACKGROUND SCAN JOB API (Queue-based, browser-independent)
  // ============================================

  // Queue a new scan job - returns immediately, job runs in background (admin only)
  app.post("/api/monitoring/scan-job/:clientId", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      const { targetCity } = req.body || {};
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      // Check if there's already an active job for this client
      const existingJob = await storage.getActiveScanJobForClient(clientId);
      if (existingJob) {
        return res.status(409).json({ 
          error: "Scan already in progress",
          jobId: existingJob.id,
          status: existingJob.status,
          progress: existingJob.progress,
        });
      }
      
      // Validate that there are prompts to scan
      const groups = await storage.getGroupsByClientId(clientId);
      const allPrompts = await storage.getPromptsByClientId(clientId);
      const activeGroups = groups.filter(g => g.isActive);
      const activeGroupIds = new Set(activeGroups.map(g => g.id));
      const prompts = allPrompts.filter(p => p.isActive && activeGroupIds.has(p.groupId));
      
      if (prompts.length === 0) {
        return res.status(400).json({ 
          error: "No prompts to scan",
          details: "This client has no active prompts configured. Please add prompts in the settings first."
        });
      }
      
      // Create the job - it will be picked up by the background processor
      const job = await storage.createScanJob({
        clientId,
        targetCity: targetCity || null,
        status: 'queued',
        progress: 0,
        progressMessage: 'Queued for processing...',
        completedPrompts: 0,
        totalPrompts: prompts.length,
      });
      
      console.log(`[ScanJob] Created job ${job.id} for client ${clientId} with ${prompts.length} prompts`);
      
      res.json({ 
        jobId: job.id, 
        status: 'queued',
        totalPrompts: prompts.length,
        message: 'Scan queued successfully. You can close this page - the scan will continue in the background.'
      });
    } catch (error) {
      logError("SCAN JOB CREATION ERROR", error);
      res.status(400).json(getSafeErrorResponse("Failed to queue scan"));
    }
  });

  // Get scan job status by job ID (admin only)
  app.get("/api/monitoring/scan-job/:jobId", requireAdminAuth, async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      
      const job = await storage.getScanJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json({
        id: job.id,
        clientId: job.clientId,
        targetCity: job.targetCity,
        status: job.status,
        progress: job.progress,
        progressMessage: job.progressMessage,
        completedPrompts: job.completedPrompts,
        totalPrompts: job.totalPrompts,
        sessionId: job.sessionId,
        resultScore: job.resultScore,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      });
    } catch (error) {
      logError("SCAN JOB STATUS ERROR", error);
      res.status(400).json(getSafeErrorResponse("Failed to get job status"));
    }
  });

  // Get all scan jobs for a client (with optional status filter) (admin only)
  app.get("/api/monitoring/scan-jobs/:clientId", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      
      const jobs = await storage.getScanJobsByClientId(clientId);
      
      res.json(jobs.map(job => ({
        id: job.id,
        clientId: job.clientId,
        targetCity: job.targetCity,
        status: job.status,
        progress: job.progress,
        progressMessage: job.progressMessage,
        completedPrompts: job.completedPrompts,
        totalPrompts: job.totalPrompts,
        sessionId: job.sessionId,
        resultScore: job.resultScore,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      })));
    } catch (error) {
      logError("SCAN JOBS LIST ERROR", error);
      res.status(400).json(getSafeErrorResponse("Failed to get jobs"));
    }
  });

  // Get active (queued or running) scan job for a client (admin only)
  app.get("/api/monitoring/scan-job-active/:clientId", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      
      const job = await storage.getActiveScanJobForClient(clientId);
      
      if (!job) {
        return res.json({ hasActiveJob: false });
      }
      
      res.json({
        hasActiveJob: true,
        job: {
          id: job.id,
          clientId: job.clientId,
          targetCity: job.targetCity,
          status: job.status,
          progress: job.progress,
          progressMessage: job.progressMessage,
          completedPrompts: job.completedPrompts,
          totalPrompts: job.totalPrompts,
          sessionId: job.sessionId,
          resultScore: job.resultScore,
          startedAt: job.startedAt,
          createdAt: job.createdAt,
        }
      });
    } catch (error) {
      logError("ACTIVE SCAN JOB CHECK ERROR", error);
      res.status(400).json(getSafeErrorResponse("Failed to check active job"));
    }
  });

  // ============================================
  // END BACKGROUND SCAN JOB API
  // ============================================

  // Step 2: SSE endpoint for rescan progress
  app.get("/api/monitoring/rescan-stream/:prepareId", async (req, res) => {
    const { prepareId } = req.params;
    
    // Retrieve and consume the pending config
    const config = pendingRescanConfigs.get(prepareId);
    if (!config) {
      res.status(404).json({ error: "Rescan configuration not found or expired" });
      return;
    }
    pendingRescanConfigs.delete(prepareId);
    
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Track if client disconnected (scan continues even if they disconnect)
    let isClientConnected = true;
    let activeSessionId: number | null = null;
    
    req.on("close", async () => {
      isClientConnected = false;
      console.log("Client disconnected from rescan stream - scan will continue in background");
      // Note: We do NOT mark the session as paused or cancel the scan
      // The scan continues running on the server even if the client navigates away
    });

    // Helper to send SSE events
    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (!isClientConnected) return;
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    // Heartbeat interval to keep SSE connection alive (declared here so catch can clean up)
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    try {
      const { clientId, targetCity, client, groups, prompts } = config;
      
      // Determine the city for this scan - use targetCity if provided, else fall back to client's city
      const scanCity = targetCity || client.city || undefined;
      
      // Send immediate heartbeat to confirm stream is active
      sendEvent("heartbeat", { message: "Rescan stream connected" });
      
      sendEvent("status", { message: "Starting rescan...", progress: 5 });
      
      const totalPrompts = prompts.length;
      
      // Track which groups are brand sentiment groups (define early to use in servicePromptCount)
      const brandSentimentGroupIds = new Set(
        groups.filter(g => (g as any).promptCategory === 'brand_sentiment').map(g => g.id)
      );
      
      // Calculate service-only prompt count for visibility scoring (exclude brand sentiment)
      const servicePromptCount = prompts.filter(p => !brandSentimentGroupIds.has(p.groupId)).length;
      
      // Safety guard: should never happen with validation in rescan-prepare, but prevent NaN
      if (totalPrompts <= 0) {
        sendEvent("error", { message: "No prompts configured for this client." });
        res.end();
        return;
      }
      
      // Create new check session with city for multi-city tracking
      // Include checkpoint fields for resume capability
      const session = await storage.createCheckSession({
        clientId,
        city: scanCity || null, // Track which city this scan was for
        overallScore: 0,
        chatgptScore: 0,
        googleAIScore: 0,
        totalPrompts: servicePromptCount, // Store only service prompts in visibility totals
        foundCount: 0,
        citedCount: 0,
        // Checkpoint fields for resume capability
        status: 'running',
        prepareId,
        lastCompletedPromptIndex: 0,
        totalPromptsToScan: totalPrompts,
        errorMessage: null,
      });
      
      // Set activeSessionId for pause-on-disconnect handling
      activeSessionId = session.id;
      
      // Send sessionId early so frontend can use it for resume on disconnect
      sendEvent("session_created", { sessionId: session.id, clientId: client.id });
      sendEvent("status", { message: "Running AI visibility checks...", progress: 10, sessionId: session.id });
      
      // Run visibility checks with bounded concurrency (4 prompts at a time)
      // Reduced from 8 to 4 to avoid rate limiting; retry logic handles transient failures
      const CONCURRENT_PROMPTS = 4;
      let foundCount = 0;
      let citedCount = 0;
      let chatgptFoundCount = 0;
      let googleAIFoundCount = 0;
      let completedCount = 0;
      
      // Analytics collection
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
      
      // Per-group metrics tracking for trending
      const groupMetrics: Record<string, {
        groupId: number;
        totalPrompts: number;
        foundCount: number;
        citedCount: number;
        chatgptFoundCount: number;
        googleAIFoundCount: number;
        competitors: string[];
      }> = {};
      
      // Use scanCity (targetCity) for location context in AI queries
      const location = scanCity || client.city || undefined;
      
      // Get all configured cities for city name substitution
      // When scanning for a different city, we need to replace city names in prompts
      const allCities = client.cities || (client.city ? [client.city] : []);
      
      // Helper to escape regex special characters in city names (e.g., "St. Paul" has a period)
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Sort cities by length (longest first) to avoid substring collisions
      // e.g., "New York" should be replaced before "York" to avoid "New New York"
      const sortedCities = [...allCities].sort((a, b) => b.length - a.length);
      
      // Map prompts with their group names
      // Substitute city names in prompts if scanning for a different city than what was originally configured
      const promptsWithGroups = prompts.map((prompt, index) => {
        const group = groups.find(g => g.id === prompt.groupId);
        let promptText = prompt.promptText;
        
        // If we have a target city different from the original prompts, substitute city names
        // This handles multi-city clients where prompts were generated with the first city
        if (scanCity) {
          for (const originalCity of sortedCities) {
            if (originalCity !== scanCity && promptText.includes(originalCity)) {
              const escapedCity = escapeRegex(originalCity);
              promptText = promptText.replace(new RegExp(escapedCity, 'gi'), scanCity);
            }
          }
        }
        
        return { 
          prompt: { ...prompt, promptText }, 
          groupName: group?.name || "Unknown", 
          originalIndex: index + 1 
        };
      });
      
      // Track per-group completion
      const groupCompletedCounts: Record<string, number> = {};
      const groupTotalCounts: Record<string, number> = {};
      const groupsCompleted = new Set<string>();
      
      for (const group of groups) {
        groupCompletedCounts[group.name] = 0;
        const groupPromptCount = prompts.filter(p => p.groupId === group.id).length;
        groupTotalCounts[group.name] = groupPromptCount;
        // Initialize group metrics
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
      
      // Setup heartbeat interval to keep SSE connection alive (every 5 seconds for production proxy compatibility)
      heartbeatInterval = setInterval(() => {
        if (isClientConnected) {
          sendEvent("heartbeat", { timestamp: Date.now(), completedCount, totalPrompts });
        }
      }, 5000);
      
      // Process prompts in concurrent batches
      // Note: Scan continues even if client disconnects - do NOT cancel on disconnect
      for (let i = 0; i < promptsWithGroups.length; i += CONCURRENT_PROMPTS) {
        const batch = promptsWithGroups.slice(i, i + CONCURRENT_PROMPTS);
        
        // Send testing events for this batch
        for (const item of batch) {
          sendEvent("testing", { 
            groupName: item.groupName,
            promptIndex: item.originalIndex,
            totalPrompts,
            promptText: item.prompt.promptText.slice(0, 60) + (item.prompt.promptText.length > 60 ? "..." : ""),
            progress: 10 + Math.round((item.originalIndex / totalPrompts) * 85),
          });
        }
        
        // Run all prompts in this batch concurrently with per-prompt error handling
        // Note: Scan continues even if client disconnects
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            try {
              const result = await retryWithBackoff(() =>
                runPromptCheck(
                  item.prompt.promptText,
                  client.businessName,
                  client.domain,
                  location,
                  client.brandAliases || undefined
                )
              );
              
              return { ...item, result };
            } catch (error) {
              logError(`RESCAN PROMPT ERROR - Prompt ${item.originalIndex + 1} (${item.groupName})`, error);
              // Return a failed result with sanitized error message - no internal details
              return { 
                ...item, 
                result: {
                  chatgpt: { found: false, response: "Unable to complete this check at this time.", cited: false, citations: [] },
                  googleAI: { found: false, response: "Unable to complete this check at this time.", cited: false, citations: [] },
                  competitors: []
                }
              };
            }
          })
        );
        
        // Process and store results from this batch
        // Note: Scan continues even if client disconnects
        for (const batchResult of batchResults) {
          if (!batchResult) continue;
          
          const { prompt, groupName, originalIndex, result } = batchResult;
          completedCount++;
          const progressPercent = 10 + Math.round((completedCount / totalPrompts) * 85);
          
          // Analyze responses for analytics
          const chatgptAnalytics = analyzeResponse(result.chatgpt.response, client.businessName);
          const googleAIAnalytics = analyzeResponse(result.googleAI.response, client.businessName);
          
          // Sentiment scores removed - using categorical sentiment only
          const chatgptSentimentScore = null;
          const googleAISentimentScore = null;
          
          // Use API-extracted citations (with title info) if available, fallback to text-extracted
          const chatgptCitationsToStore = result.chatgpt.citations.length > 0 
            ? result.chatgpt.citations 
            : chatgptAnalytics.citations;
          const googleAICitationsToStore = result.googleAI.citations.length > 0 
            ? result.googleAI.citations 
            : googleAIAnalytics.citations;
          
          // Collect for aggregation
          allChatgptCitations.push(chatgptCitationsToStore);
          allGoogleAICitations.push(googleAICitationsToStore);
          allChatgptRanks.push(chatgptAnalytics.rank);
          allGoogleAIRanks.push(googleAIAnalytics.rank);
          allChatgptSentiments.push(chatgptAnalytics.sentiment);
          allGoogleAISentiments.push(googleAIAnalytics.sentiment);
          // Check if this is a brand sentiment prompt
          const isBrandSentiment = brandSentimentGroupIds.has(prompt.groupId);
          
          storedResults.push({ 
            competitors: JSON.stringify(result.competitors),
            chatgptResponse: result.chatgpt.response,
            googleAIResponse: result.googleAI.response,
            promptText: prompt.promptText,
            chatgptSentimentScore,
            googleAISentimentScore,
            isBrandSentiment
          });
          
          // Store result with error handling
          try {
            await storage.createCheckResult({
              sessionId: session.id,
              clientId,
              groupId: prompt.groupId,
              promptId: prompt.id,
              promptText: prompt.promptText,
              chatgptFound: result.chatgpt.found,
              chatgptResponse: result.chatgpt.response,
              chatgptCited: result.chatgpt.cited,
              googleAIFound: result.googleAI.found,
              googleAIResponse: result.googleAI.response,
              googleAICited: result.googleAI.cited,
              competitors: JSON.stringify(result.competitors),
              chatgptSentiment: chatgptAnalytics.sentiment,
              googleAISentiment: googleAIAnalytics.sentiment,
              chatgptSentimentScore,
              googleAISentimentScore,
              chatgptRank: chatgptAnalytics.rank,
              googleAIRank: googleAIAnalytics.rank,
              chatgptCitations: chatgptCitationsToStore,
              googleAICitations: googleAICitationsToStore,
              chatgptSnippet: chatgptAnalytics.snippet,
              googleAISnippet: googleAIAnalytics.snippet,
              googleAIGroundingMetadata: result.googleAI.groundingMetadata,
            });
          } catch (storeError) {
            console.error(`[STORAGE ERROR] Failed to store result for prompt ${originalIndex + 1}:`, storeError);
            // Continue processing - storage failure for one result shouldn't crash the scan
          }
          
          // Only count service prompts for visibility scoring (exclude brand sentiment prompts)
          if (!isBrandSentiment) {
            if (result.chatgpt.found || result.googleAI.found) foundCount++;
            if (result.chatgpt.cited || result.googleAI.cited) citedCount++;
            if (result.chatgpt.found) chatgptFoundCount++;
            if (result.googleAI.found) googleAIFoundCount++;
          }
          
          // Track per-group metrics
          if (groupMetrics[groupName]) {
            if (result.chatgpt.found || result.googleAI.found) groupMetrics[groupName].foundCount++;
            if (result.chatgpt.cited || result.googleAI.cited) groupMetrics[groupName].citedCount++;
            if (result.chatgpt.found) groupMetrics[groupName].chatgptFoundCount++;
            if (result.googleAI.found) groupMetrics[groupName].googleAIFoundCount++;
            if (result.competitors && result.competitors.length > 0) {
              groupMetrics[groupName].competitors.push(...result.competitors);
            }
          }
          
          // Track per-group completion
          groupCompletedCounts[groupName]++;
          
          sendEvent("prompt_complete", {
            groupName,
            promptIndex: originalIndex,
            totalPrompts,
            chatgptFound: result.chatgpt.found,
            googleAIFound: result.googleAI.found,
            progress: progressPercent,
          });
          
          // Check if group is complete
          if (!groupsCompleted.has(groupName) && 
              groupCompletedCounts[groupName] >= groupTotalCounts[groupName]) {
            groupsCompleted.add(groupName);
            sendEvent("group_complete", { groupName });
          }
          
          // Update checkpoint after each prompt to enable resume
          // Also save running scores so partial scans show accurate data
          try {
            // Calculate running scores using per-exposure method (each platform check counts separately)
            const runningTotalExposures = servicePromptCount * 2;
            const runningTotalFound = chatgptFoundCount + googleAIFoundCount;
            const runningOverallScore = runningTotalExposures > 0 ? Math.round((runningTotalFound / runningTotalExposures) * 100) : 0;
            const runningChatgptScore = servicePromptCount > 0 ? Math.round((chatgptFoundCount / servicePromptCount) * 100) : 0;
            const runningGoogleAIScore = servicePromptCount > 0 ? Math.round((googleAIFoundCount / servicePromptCount) * 100) : 0;
            
            await storage.updateCheckSession(session.id, {
              lastCompletedPromptIndex: completedCount,
              status: 'running',
              // Save running counts and scores for accurate partial data
              foundCount,
              citedCount,
              overallScore: runningOverallScore,
              chatgptScore: runningChatgptScore,
              googleAIScore: runningGoogleAIScore,
            });
            console.log(`[Checkpoint] Rescan session ${session.id}: Saved checkpoint at prompt ${completedCount}/${totalPrompts} (score: ${runningOverallScore}%)`);
          } catch (checkpointError) {
            console.error(`[Checkpoint] Failed to save rescan checkpoint for session ${session.id}:`, checkpointError);
          }
        }
      }
      
      // Note: Scan continues even if client disconnects - do NOT cancel here
      
      // Clear heartbeat now that processing is complete
      clearInterval(heartbeatInterval);
      
      // Calculate final scores using per-exposure method (each platform check counts separately)
      // This matches the frontend visibilityRate calculation: (chatgptFound + googleAIFound) / (prompts × 2)
      const totalExposures = servicePromptCount * 2; // Each prompt checks 2 platforms
      const totalFound = chatgptFoundCount + googleAIFoundCount;
      const overallScore = totalExposures > 0 ? Math.round((totalFound / totalExposures) * 100) : 0;
      const chatgptScore = servicePromptCount > 0 ? Math.round((chatgptFoundCount / servicePromptCount) * 100) : 0;
      const googleAIScore = servicePromptCount > 0 ? Math.round((googleAIFoundCount / servicePromptCount) * 100) : 0;
      
      sendEvent("status", { message: "Calculating final scores...", progress: 97 });
      
      // Aggregate session-level analytics
      const competitorCounts = aggregateCompetitorMentions(storedResults);
      const shareOfVoice = computeShareOfVoice(client.businessName, foundCount, competitorCounts, servicePromptCount);
      const avgChatgptRank = calculateAverageRank(allChatgptRanks);
      const avgGoogleAIRank = calculateAverageRank(allGoogleAIRanks);
      const firstPlaceCount = countFirstPlace(allChatgptRanks) + countFirstPlace(allGoogleAIRanks);
      const sentimentBreakdown = aggregateSentiment([...allChatgptSentiments, ...allGoogleAISentiments]);
      const topCitations = aggregateCitations([...allChatgptCitations, ...allGoogleAICitations]);
      
      // Sentiment score calculation removed - using categorical sentiment only
      const sentimentScore = null;
      
      // Compute competitor visibility (using service prompts only)
      const competitorVisibility = computeCompetitorVisibility(competitorCounts, servicePromptCount, 5);
      
      // Extract sentiment statements from service prompts
      const sentimentStatements = aggregateSentimentStatements(storedResults, client.businessName);
      
      // Extract brand sentiment findings from brand-specific prompts (rescan flow)
      const brandSentimentFindings = collectBrandSentimentFindings(storedResults, client.businessName);
      
      // Merge brand sentiment findings into negative statements for Areas for Improvement
      if (brandSentimentFindings.issues.length > 0) {
        const brandIssueStatements = brandSentimentFindings.issues.map(finding => ({
          text: finding.text,
          platform: finding.platform,
          promptText: finding.promptText
        }));
        sentimentStatements.negative = [...brandIssueStatements, ...sentimentStatements.negative].slice(0, 5);
      }
      
      // Merge brand sentiment praise into positive statements
      if (brandSentimentFindings.praise.length > 0) {
        const brandPraiseStatements = brandSentimentFindings.praise.map(finding => ({
          text: finding.text,
          platform: finding.platform,
          promptText: finding.promptText
        }));
        sentimentStatements.positive = [...brandPraiseStatements, ...sentimentStatements.positive].slice(0, 5);
      }
      
      // Update session with final scores and analytics
      await storage.updateCheckSession(session.id, {
        overallScore,
        chatgptScore,
        googleAIScore,
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
      });
      
      // Store per-group metrics for trending
      for (const group of groups) {
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
      
      // Store per-competitor metrics for trending
      for (const [compName, count] of Array.from(competitorCounts.entries())) {
        const visibilityPercent = totalPrompts > 0 ? (count / totalPrompts) * 100 : 0;
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
      
      // Update lastCheckAt and calculate nextCheckAt for scheduling
      const nextCheckAt = new Date();
      nextCheckAt.setDate(nextCheckAt.getDate() + client.checkFrequencyDays);
      await storage.updateMonitoringClient(clientId, {
        lastCheckAt: new Date(),
        nextCheckAt,
      } as any);
      
      // Mark session as complete - prevents accidental resume attempts
      await storage.updateCheckSession(session.id, {
        status: 'complete',
        lastCompletedPromptIndex: totalPrompts,
      } as any);
      
      // Send completion event
      sendEvent("complete", { 
        clientId, 
        sessionId: session.id,
        overallScore,
        chatgptScore,
        googleAIScore,
        progress: 100,
      });
      
      res.end();
    } catch (error) {
      logError(`RESCAN STREAM ERROR (prepareId=${prepareId})`, error);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      // Mark session as failed with error details (safe for internal storage)
      const internalErrorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      if (activeSessionId) {
        try {
          await storage.updateCheckSession(activeSessionId, {
            status: 'failed',
            errorMessage: internalErrorMessage,
          } as any);
        } catch (updateErr) {
          console.error("Failed to mark rescan session as failed:", updateErr);
        }
      }
      
      // Send sanitized error to client - no stack traces or internal details
      sendEvent("error", { 
        message: "An error occurred during the rescan. Please try again.",
      });
      res.end();
    }
  });

  // ============================================
  // RESUME SCAN ENDPOINT - Resume paused/interrupted scans
  // ============================================
  
  // Get resumable sessions for a client
  app.get("/api/monitoring/resumable/:clientId", async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      const sessions = await storage.getResumableSessions(clientId);
      res.json({ sessions });
    } catch (error) {
      logError("GET RESUMABLE SESSIONS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get resumable sessions"));
    }
  });

  // Resume a paused scan - SSE endpoint
  app.get("/api/monitoring/resume-stream/:sessionId", async (req, res) => {
    const sessionId = parseInt(req.params.sessionId);
    
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let isClientConnected = true;
    
    req.on("close", async () => {
      isClientConnected = false;
      console.log("Client disconnected from resume stream - scan will continue in background");
      // Note: We do NOT mark the session as paused or cancel the scan
      // The scan continues running on the server even if the client navigates away
    });

    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (!isClientConnected) return;
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    try {
      // Get the session directly by ID
      const targetSession = await storage.getCheckSessionById(sessionId);
      
      if (!targetSession) {
        sendEvent("error", { message: "Session not found" });
        res.end();
        return;
      }
      
      if (targetSession.status !== 'paused' && targetSession.status !== 'running') {
        sendEvent("error", { message: `Session cannot be resumed (status: ${targetSession.status})` });
        res.end();
        return;
      }
      
      // Get the client for this session
      const client = await storage.getMonitoringClientById(targetSession.clientId);
      if (!client) {
        sendEvent("error", { message: "Client not found for this session" });
        res.end();
        return;
      }
      
      // Mark session as running
      await storage.updateCheckSession(sessionId, {
        status: 'running',
      } as any);
      
      sendEvent("heartbeat", { message: "Resume stream connected" });
      sendEvent("status", { message: "Resuming scan...", progress: 5 });
      
      // Get all prompts and existing results
      const groups = await storage.getGroupsByClientId(client.id);
      const allPrompts = await storage.getPromptsByClientId(client.id);
      const existingResults = await storage.getCheckResultsBySessionId(sessionId);
      
      // Find which promptIds already have results
      const completedPromptIds = new Set(existingResults.map(r => r.promptId));
      
      // Filter to only active prompts that haven't been completed
      const activeGroups = groups.filter(g => g.isActive);
      const activeGroupIds = new Set(activeGroups.map(g => g.id));
      const remainingPrompts = allPrompts.filter(p => 
        p.isActive && 
        activeGroupIds.has(p.groupId) && 
        !completedPromptIds.has(p.id)
      );
      
      const totalPromptsInSession = targetSession.totalPromptsToScan || allPrompts.filter(p => p.isActive && activeGroupIds.has(p.groupId)).length;
      const completedCount = completedPromptIds.size;
      
      sendEvent("status", { 
        message: `Resuming from prompt ${completedCount + 1} of ${totalPromptsInSession}...`,
        progress: 10 + Math.round((completedCount / totalPromptsInSession) * 85),
      });
      
      if (remainingPrompts.length === 0) {
        // All prompts were already completed - just finalize
        sendEvent("status", { message: "All prompts already completed, finalizing...", progress: 95 });
        
        await storage.updateCheckSession(sessionId, {
          status: 'complete',
          lastCompletedPromptIndex: totalPromptsInSession,
        } as any);
        
        sendEvent("complete", { 
          clientId: client.id, 
          sessionId,
          progress: 100,
        });
        res.end();
        return;
      }
      
      // Track brand sentiment group for visibility exclusion
      const brandSentimentGroupIds = new Set(
        activeGroups.filter(g => (g as any).promptCategory === 'brand_sentiment').map(g => g.id)
      );
      
      // Calculate service prompt count for running score calculation (excluding brand sentiment)
      const servicePromptCount = allPrompts.filter(p => 
        p.isActive && activeGroupIds.has(p.groupId) && !brandSentimentGroupIds.has(p.groupId)
      ).length;
      
      // Initialize running counts from previously completed results (existingResults already fetched above)
      let runningFoundCount = 0;
      let runningCitedCount = 0;
      let runningChatgptFoundCount = 0;
      let runningGoogleAIFoundCount = 0;
      
      for (const res of existingResults) {
        const isBrandSentiment = brandSentimentGroupIds.has(res.groupId);
        if (!isBrandSentiment) {
          if (res.chatgptFound || res.googleAIFound) runningFoundCount++;
          if (res.chatgptCited || res.googleAICited) runningCitedCount++;
          if (res.chatgptFound) runningChatgptFoundCount++;
          if (res.googleAIFound) runningGoogleAIFoundCount++;
        }
      }
      
      // Run remaining prompts with bounded concurrency
      const CONCURRENT_PROMPTS = 4;
      let currentCompleted = completedCount;
      const location = targetSession.city || client.city || undefined;
      
      // Setup heartbeat (every 5 seconds for production proxy compatibility)
      heartbeatInterval = setInterval(() => {
        if (isClientConnected) {
          sendEvent("heartbeat", { timestamp: Date.now(), completedCount: currentCompleted, totalPrompts: totalPromptsInSession });
        }
      }, 5000);
      
      // Get all configured cities for city name substitution
      const allCities = client.cities || (client.city ? [client.city] : []);
      const scanCity = targetSession.city || undefined;
      
      // Helper to escape regex special characters in city names (e.g., "St. Paul" has a period)
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Sort cities by length (longest first) to avoid substring collisions
      const sortedCities = [...allCities].sort((a, b) => b.length - a.length);
      
      // Map prompts with group names
      // Substitute city names in prompts if scanning for a different city than what was originally configured
      const promptsWithGroups = remainingPrompts.map((prompt, index) => {
        const group = groups.find(g => g.id === prompt.groupId);
        let promptText = prompt.promptText;
        
        // If we have a target city different from the original prompts, substitute city names
        if (scanCity) {
          for (const originalCity of sortedCities) {
            if (originalCity !== scanCity && promptText.includes(originalCity)) {
              const escapedCity = escapeRegex(originalCity);
              promptText = promptText.replace(new RegExp(escapedCity, 'gi'), scanCity);
            }
          }
        }
        
        return { 
          prompt: { ...prompt, promptText }, 
          groupName: group?.name || "Unknown", 
          originalIndex: completedCount + index + 1 
        };
      });
      
      // Process remaining prompts
      // Note: Scan continues even if client disconnects - do NOT cancel on disconnect
      for (let i = 0; i < promptsWithGroups.length; i += CONCURRENT_PROMPTS) {
        const batch = promptsWithGroups.slice(i, i + CONCURRENT_PROMPTS);
        
        // Send testing events
        for (const item of batch) {
          sendEvent("testing", { 
            groupName: item.groupName,
            promptIndex: item.originalIndex,
            totalPrompts: totalPromptsInSession,
            promptText: item.prompt.promptText.slice(0, 60) + (item.prompt.promptText.length > 60 ? "..." : ""),
            progress: 10 + Math.round((item.originalIndex / totalPromptsInSession) * 85),
          });
        }
        
        // Run batch concurrently
        // Note: Scan continues even if client disconnects
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            try {
              const result = await retryWithBackoff(() => 
                runPromptCheck(
                  item.prompt.promptText,
                  client.businessName,
                  client.domain,
                  location,
                  client.brandAliases || undefined
                )
              );
              return { ...item, result };
            } catch (error) {
              logError(`RESUME PROMPT ERROR - Prompt ${item.originalIndex}`, error);
              // Return a failed result with sanitized error message - no internal details
              return { 
                ...item, 
                result: {
                  chatgpt: { found: false, response: "Unable to complete this check at this time.", cited: false, citations: [] },
                  googleAI: { found: false, response: "Unable to complete this check at this time.", cited: false, citations: [] },
                  competitors: []
                }
              };
            }
          })
        );
        
        // Store results
        // Note: Scan continues even if client disconnects
        for (const batchResult of batchResults) {
          if (!batchResult) continue;
          
          const { prompt, groupName, originalIndex, result } = batchResult;
          currentCompleted++;
          const progressPercent = 10 + Math.round((currentCompleted / totalPromptsInSession) * 85);
          
          // Analyze responses
          const chatgptAnalytics = analyzeResponse(result.chatgpt.response, client.businessName);
          const googleAIAnalytics = analyzeResponse(result.googleAI.response, client.businessName);
          // Sentiment scores removed - using categorical sentiment only
          const chatgptSentimentScore = null;
          const googleAISentimentScore = null;
          
          const chatgptCitationsToStore = result.chatgpt.citations.length > 0 
            ? result.chatgpt.citations 
            : chatgptAnalytics.citations;
          const googleAICitationsToStore = result.googleAI.citations.length > 0 
            ? result.googleAI.citations 
            : googleAIAnalytics.citations;
          
          // Store result with error handling
          try {
            await storage.createCheckResult({
              sessionId,
              clientId: client.id,
              groupId: prompt.groupId,
              promptId: prompt.id,
              promptText: prompt.promptText,
              chatgptFound: result.chatgpt.found,
              chatgptResponse: result.chatgpt.response,
              chatgptCited: result.chatgpt.cited,
              googleAIFound: result.googleAI.found,
              googleAIResponse: result.googleAI.response,
              googleAICited: result.googleAI.cited,
              competitors: JSON.stringify(result.competitors),
              chatgptSentiment: chatgptAnalytics.sentiment,
              googleAISentiment: googleAIAnalytics.sentiment,
              chatgptSentimentScore,
              googleAISentimentScore,
              chatgptRank: chatgptAnalytics.rank,
              googleAIRank: googleAIAnalytics.rank,
              chatgptCitations: chatgptCitationsToStore,
              googleAICitations: googleAICitationsToStore,
              chatgptSnippet: chatgptAnalytics.snippet,
              googleAISnippet: googleAIAnalytics.snippet,
              googleAIGroundingMetadata: result.googleAI.groundingMetadata,
            });
          } catch (storeError) {
            console.error(`[STORAGE ERROR] Resume: Failed to store result for prompt ${originalIndex + 1}:`, storeError);
            // Continue processing - storage failure shouldn't crash the scan
          }
          
          // Update running counts (exclude brand sentiment prompts from visibility scoring)
          const isBrandSentiment = brandSentimentGroupIds.has(prompt.groupId);
          if (!isBrandSentiment) {
            if (result.chatgpt.found || result.googleAI.found) runningFoundCount++;
            if (result.chatgpt.cited || result.googleAI.cited) runningCitedCount++;
            if (result.chatgpt.found) runningChatgptFoundCount++;
            if (result.googleAI.found) runningGoogleAIFoundCount++;
          }
          
          // Update checkpoint with running scores
          // Also save running scores so partial scans show accurate data
          try {
            // Calculate running scores using per-exposure method (each platform check counts separately)
            const runningTotalExposures = servicePromptCount * 2;
            const runningTotalFound = runningChatgptFoundCount + runningGoogleAIFoundCount;
            const runningOverallScore = runningTotalExposures > 0 ? Math.round((runningTotalFound / runningTotalExposures) * 100) : 0;
            const runningChatgptScore = servicePromptCount > 0 ? Math.round((runningChatgptFoundCount / servicePromptCount) * 100) : 0;
            const runningGoogleAIScore = servicePromptCount > 0 ? Math.round((runningGoogleAIFoundCount / servicePromptCount) * 100) : 0;
            
            await storage.updateCheckSession(sessionId, {
              lastCompletedPromptIndex: currentCompleted,
              status: 'running',
              // Save running counts and scores for accurate partial data
              foundCount: runningFoundCount,
              citedCount: runningCitedCount,
              overallScore: runningOverallScore,
              chatgptScore: runningChatgptScore,
              googleAIScore: runningGoogleAIScore,
            });
            console.log(`[Checkpoint] Resume session ${sessionId}: Saved checkpoint at prompt ${currentCompleted}/${totalPromptsInSession} (score: ${runningOverallScore}%)`);
          } catch (checkpointError) {
            console.error(`[Checkpoint] Failed to save resume checkpoint for session ${sessionId}:`, checkpointError);
          }
          
          sendEvent("prompt_complete", {
            groupName,
            promptIndex: originalIndex,
            totalPrompts: totalPromptsInSession,
            chatgptFound: result.chatgpt.found,
            googleAIFound: result.googleAI.found,
            progress: progressPercent,
          });
        }
      }
      
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      // All remaining prompts completed - calculate final scores from running counts
      sendEvent("status", { message: "Calculating final scores...", progress: 97 });
      
      // Calculate final scores using per-exposure method (each platform check counts separately)
      // This matches the frontend visibilityRate calculation: (chatgptFound + googleAIFound) / (prompts × 2)
      const totalExposures = servicePromptCount * 2; // Each prompt checks 2 platforms
      const totalFound = runningChatgptFoundCount + runningGoogleAIFoundCount;
      const finalOverallScore = totalExposures > 0 ? Math.round((totalFound / totalExposures) * 100) : 0;
      const finalChatgptScore = servicePromptCount > 0 ? Math.round((runningChatgptFoundCount / servicePromptCount) * 100) : 0;
      const finalGoogleAIScore = servicePromptCount > 0 ? Math.round((runningGoogleAIFoundCount / servicePromptCount) * 100) : 0;
      
      // Update session with final scores
      await storage.updateCheckSession(sessionId, {
        status: 'complete',
        overallScore: finalOverallScore,
        chatgptScore: finalChatgptScore,
        googleAIScore: finalGoogleAIScore,
        foundCount: runningFoundCount,
        citedCount: runningCitedCount,
        lastCompletedPromptIndex: totalPromptsInSession,
      } as any);
      
      sendEvent("complete", { 
        clientId: client.id, 
        sessionId,
        overallScore: finalOverallScore,
        chatgptScore: finalChatgptScore,
        googleAIScore: finalGoogleAIScore,
        progress: 100,
      });
      
      res.end();
    } catch (error) {
      logError(`RESUME STREAM ERROR (sessionId=${sessionId})`, error);
      
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      // Mark session as failed with error details (safe for internal storage)
      const internalErrorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      try {
        await storage.updateCheckSession(sessionId, {
          status: 'failed',
          errorMessage: internalErrorMessage,
        } as any);
      } catch (updateErr) {
        console.error("Failed to mark resume session as failed:", updateErr);
      }
      
      // Send sanitized error to client - no stack traces or internal details
      sendEvent("error", { 
        message: "An error occurred while resuming the scan. Please try again.",
      });
      res.end();
    }
  });

  // Get dashboard data for a client
  // Dashboard endpoint (admin OR client with matching ID)
  app.get("/api/monitoring/dashboard/:id", requireAdminOrClientAuth("id"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const groups = await storage.getGroupsByClientId(clientId);
      const sessions = await storage.getCheckSessionsByClientId(clientId);
      
      // For multi-city clients, get results from the latest session per city
      // This allows "All Cities" view to aggregate data from all cities
      let latestResults: any[] = [];
      if (sessions.length > 0) {
        // Group sessions by city and get the latest session for each city
        const latestSessionPerCity = new Map<string | null, typeof sessions[0]>();
        for (const session of sessions) {
          const city = (session as any).city || null;
          if (!latestSessionPerCity.has(city)) {
            latestSessionPerCity.set(city, session);
          }
        }
        
        // Fetch results from all latest city sessions
        const latestCitySessions = Array.from(latestSessionPerCity.values());
        for (const session of latestCitySessions) {
          const sessionResults = await storage.getCheckResultsBySessionId(session.id);
          latestResults.push(...sessionResults);
        }
      }
      
      // Group results by group (include promptCategory for filtering brand sentiment)
      const resultsByGroup = groups.map(group => ({
        groupId: group.id,
        groupName: group.name,
        promptCategory: group.promptCategory,
        results: latestResults.filter(r => r.groupId === group.id),
      }));
      
      // Extract latest session analytics (if available)
      const latestSession = sessions[0] || null;
      
      // Synthesize clean sentiment narratives from raw statements (now with prompt context)
      let sentimentNarratives: SynthesizedNarratives = { strengths: [], improvements: [] };
      if (latestSession?.sentimentStatements) {
        const rawStatements = {
          positive: (latestSession.sentimentStatements as any).positive?.map((s: any) => ({
            text: s.text,
            promptText: s.promptText,
            platform: s.platform
          })) || [],
          negative: (latestSession.sentimentStatements as any).negative?.map((s: any) => ({
            text: s.text,
            promptText: s.promptText,
            platform: s.platform
          })) || []
        };
        if (rawStatements.positive.length > 0 || rawStatements.negative.length > 0) {
          try {
            sentimentNarratives = await synthesizeSentimentNarratives(rawStatements, client.businessName);
          } catch (narrativeError) {
            console.error('[Dashboard] Error synthesizing narratives:', narrativeError);
          }
        }
      }
      
      const analytics = latestSession ? {
        shareOfVoice: latestSession.shareOfVoice || {},
        avgChatgptRank: latestSession.avgChatgptRank,
        avgGoogleAIRank: latestSession.avgGoogleAIRank,
        firstPlaceCount: latestSession.firstPlaceCount || 0,
        sentimentBreakdown: latestSession.sentimentBreakdown || { positive: 0, neutral: 0, negative: 0 },
        topCitations: latestSession.topCitations || [],
        sentimentScore: latestSession.sentimentScore || null,
        competitorVisibility: latestSession.competitorVisibility || [],
        sentimentStatements: latestSession.sentimentStatements || { positive: [], negative: [] },
        sentimentNarratives, // New synthesized narratives
      } : null;
      
      // Build historical trend data from all sessions
      const trendData = sessions.slice().reverse().map(s => ({
        date: s.createdAt,
        overallScore: s.overallScore,
        chatgptScore: s.chatgptScore,
        googleAIScore: s.googleAIScore,
        foundCount: s.foundCount,
        citedCount: s.citedCount,
        shareOfVoice: s.shareOfVoice,
        avgRank: s.avgChatgptRank && s.avgGoogleAIRank 
          ? (s.avgChatgptRank + s.avgGoogleAIRank) / 2 
          : s.avgChatgptRank || s.avgGoogleAIRank || null,
        sentiment: s.sentimentBreakdown,
      }));
      
      res.json({
        client,
        groups,
        sessions,
        latestResults,
        resultsByGroup,
        analytics,
        trendData,
      });
    } catch (error) {
      logError("GET DASHBOARD ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get dashboard data"));
    }
  });

  // Get group visibility trends over time (admin only)
  app.get("/api/monitoring/trends/groups/:clientId", requireAdminOrClientAuth("clientId"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const groupMetrics = await storage.getGroupMetricsByClientId(clientId);
      const sessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Create a map of session dates
      const sessionDates: Record<number, Date | null> = {};
      for (const session of sessions) {
        sessionDates[session.id] = session.createdAt;
      }
      
      // Group metrics by group name, with trend data per session
      const groupTrends: Record<string, { 
        groupId: number; 
        groupName: string; 
        data: { date: Date | null; visibilityScore: number; foundCount: number; totalPrompts: number }[] 
      }> = {};
      
      for (const metric of groupMetrics) {
        if (!groupTrends[metric.groupName]) {
          groupTrends[metric.groupName] = {
            groupId: metric.groupId,
            groupName: metric.groupName,
            data: [],
          };
        }
        groupTrends[metric.groupName].data.push({
          date: sessionDates[metric.sessionId] || null,
          visibilityScore: metric.visibilityScore,
          foundCount: metric.foundCount,
          totalPrompts: metric.totalPrompts,
        });
      }
      
      // Sort each group's data by date (oldest to newest)
      for (const groupName of Object.keys(groupTrends)) {
        groupTrends[groupName].data.sort((a, b) => {
          if (!a.date || !b.date) return 0;
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
      }
      
      res.json({ groupTrends: Object.values(groupTrends) });
    } catch (error) {
      logError("GET GROUP TRENDS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get group trends"));
    }
  });

  // Get competitor visibility trends over time (admin only)
  app.get("/api/monitoring/trends/competitors/:clientId", requireAdminOrClientAuth("clientId"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const competitorMetrics = await storage.getCompetitorMetricsByClientId(clientId);
      const sessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Create a map of session dates
      const sessionDates: Record<number, Date | null> = {};
      for (const session of sessions) {
        sessionDates[session.id] = session.createdAt;
      }
      
      // Group metrics by competitor name, with trend data per session
      const competitorTrends: Record<string, { 
        competitorName: string; 
        data: { date: Date | null; visibilityPercent: number; mentionCount: number }[] 
      }> = {};
      
      for (const metric of competitorMetrics) {
        if (!competitorTrends[metric.competitorName]) {
          competitorTrends[metric.competitorName] = {
            competitorName: metric.competitorName,
            data: [],
          };
        }
        competitorTrends[metric.competitorName].data.push({
          date: sessionDates[metric.sessionId] || null,
          visibilityPercent: metric.visibilityPercent,
          mentionCount: metric.mentionCount,
        });
      }
      
      // Sort each competitor's data by date (oldest to newest)
      for (const compName of Object.keys(competitorTrends)) {
        competitorTrends[compName].data.sort((a, b) => {
          if (!a.date || !b.date) return 0;
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
      }
      
      // Get top 10 competitors by total mentions across all sessions
      const competitorTotals = Object.entries(competitorTrends).map(([name, trend]) => ({
        name,
        totalMentions: trend.data.reduce((sum, d) => sum + d.mentionCount, 0),
        trend,
      }));
      competitorTotals.sort((a, b) => b.totalMentions - a.totalMentions);
      const topCompetitors = competitorTotals.slice(0, 10).map(c => c.trend);
      
      res.json({ competitorTrends: topCompetitors });
    } catch (error) {
      logError("GET COMPETITOR TRENDS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get competitor trends"));
    }
  });

  // Get available scan dates for export dropdown (admin only)
  app.get("/api/monitoring/scan-dates/:id", requireAdminOrClientAuth("id"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const allSessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Filter to sessions that have data (completed, running, or paused with partial results)
      const completedSessions = allSessions.filter(s => 
        s.status === 'complete' || s.status === 'running' || s.status === 'paused'
      );
      
      // Group sessions by date (YYYY-MM-DD) and collect cities
      const dateMap = new Map<string, { date: string; cities: string[]; sessionIds: number[] }>();
      
      for (const session of completedSessions) {
        const dateStr = new Date(session.createdAt).toISOString().split("T")[0];
        
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, { date: dateStr, cities: [], sessionIds: [] });
        }
        
        const entry = dateMap.get(dateStr)!;
        entry.sessionIds.push(session.id);
        if (session.city && !entry.cities.includes(session.city)) {
          entry.cities.push(session.city);
        }
      }
      
      // Convert to array and sort by date (newest first)
      const scanDates = Array.from(dateMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      res.json({ scanDates });
    } catch (error) {
      logError("GET SCAN DATES ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get scan dates"));
    }
  });

  // Export by specific scan date (new format with per-city Excel files) (admin only)
  app.get("/api/monitoring/export-by-date/:id", requireAdminOrClientAuth("id"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const { scanDate } = req.query;
      
      if (!scanDate || typeof scanDate !== 'string') {
        return res.status(400).json({ error: "scanDate query parameter is required" });
      }
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const groups = await storage.getGroupsByClientId(clientId);
      const allSessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Filter sessions to the selected date (matching date portion only)
      const sessions = allSessions.filter(s => {
        const sessionDateStr = new Date(s.createdAt).toISOString().split("T")[0];
        return sessionDateStr === scanDate;
      });
      
      if (sessions.length === 0) {
        return res.status(404).json({ error: "No data found for the selected scan date" });
      }
      
      // Get all results from sessions for this date
      const results: any[] = [];
      for (const session of sessions) {
        const sessionResults = await storage.getCheckResultsBySessionId(session.id);
        results.push(...sessionResults);
      }
      
      // Check export size to prevent memory issues (Excel exports buffer in memory)
      const MAX_EXPORT_RESULTS = 50000;
      if (results.length > MAX_EXPORT_RESULTS) {
        return res.status(413).json({ 
          error: `Export too large (${results.length} results). Maximum is ${MAX_EXPORT_RESULTS} results. Please export a smaller date range.` 
        });
      }
      
      // Stream the new format export (Excel files per city with service group sheets)
      await streamSessionExportZip(res, {
        client,
        groups,
        sessions,
        results,
        scanDate,
      });
    } catch (error) {
      logError("EXPORT BY DATE ERROR", error);
      if (!res.headersSent) {
        res.status(500).json(getSafeErrorResponse("Failed to generate export"));
      }
    }
  });

  // Export monitoring data as ZIP (legacy date range format)
  // Export endpoint (admin only)
  app.get("/api/monitoring/exports/:id", requireAdminOrClientAuth("id"), async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const { startDate, endDate } = req.query;
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const groups = await storage.getGroupsByClientId(clientId);
      const allSessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Parse date range (default to last 30 days)
      const end = endDate ? new Date(String(endDate)) : new Date();
      const start = startDate 
        ? new Date(String(startDate)) 
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Filter sessions by date range
      const sessions = allSessions.filter(s => {
        const sessionDate = new Date(s.createdAt);
        return sessionDate >= start && sessionDate <= end;
      });
      
      if (sessions.length === 0) {
        return res.status(404).json({ error: "No data found for the selected date range" });
      }
      
      // Get all results from sessions in range
      const results: any[] = [];
      for (const session of sessions) {
        const sessionResults = await storage.getCheckResultsBySessionId(session.id);
        results.push(...sessionResults);
      }
      
      // Check export size to prevent memory issues (exports buffer data in memory)
      const MAX_EXPORT_RESULTS = 50000;
      if (results.length > MAX_EXPORT_RESULTS) {
        return res.status(413).json({ 
          error: `Export too large (${results.length} results). Maximum is ${MAX_EXPORT_RESULTS} results. Please export a smaller date range.` 
        });
      }
      
      // Compute analytics from results
      const totalPrompts = results.length;
      const foundCount = results.filter(r => r.chatgptFound || r.googleAIFound).length;
      
      // Collect rank and citation data for export
      const allChatgptRanks: number[] = [];
      const allGoogleAIRanks: number[] = [];
      const allChatgptCitations: Citation[] = [];
      const allGoogleAICitations: Citation[] = [];
      
      for (const result of results) {
        // Collect ranks
        if (result.chatgptRank && result.chatgptRank > 0) allChatgptRanks.push(result.chatgptRank);
        if (result.googleAIRank && result.googleAIRank > 0) allGoogleAIRanks.push(result.googleAIRank);
        
        // Collect citations
        if (result.chatgptCitations) {
          const citations = Array.isArray(result.chatgptCitations) ? result.chatgptCitations : [];
          citations.forEach((c: any) => {
            if (typeof c === 'object' && c.domain) {
              allChatgptCitations.push({ url: c.url || c.domain, domain: c.domain });
            } else if (typeof c === 'string') {
              allChatgptCitations.push({ url: c, domain: c });
            }
          });
        }
        if (result.googleAICitations) {
          const citations = Array.isArray(result.googleAICitations) ? result.googleAICitations : [];
          citations.forEach((c: any) => {
            if (typeof c === 'object' && c.domain) {
              allGoogleAICitations.push({ url: c.url || c.domain, domain: c.domain });
            } else if (typeof c === 'string') {
              allGoogleAICitations.push({ url: c, domain: c });
            }
          });
        }
      }
      
      // Calculate aggregate metrics
      const competitorCounts = aggregateCompetitorMentions(results);
      const shareOfVoiceRaw = computeShareOfVoice(client.businessName, foundCount, competitorCounts, totalPrompts);
      const topCitationsRaw = aggregateCitations([allChatgptCitations, allGoogleAICitations]);
      // Sentiment score calculation removed - using categorical sentiment only
      const sentimentScore = null;
      const competitorVisibilityRaw = computeCompetitorVisibility(competitorCounts, totalPrompts, 5);
      
      // Transform share of voice to export format
      const brandEntry = shareOfVoiceRaw.find(m => m.name === client.businessName);
      const competitorTotal = shareOfVoiceRaw.filter(m => m.name !== client.businessName).reduce((sum, m) => sum + m.percentage, 0);
      const shareOfVoice = {
        brand: brandEntry?.percentage ?? 0,
        competitors: competitorTotal,
      };
      
      // Transform competitor visibility to export format
      const competitorVisibility = competitorVisibilityRaw.map(c => ({
        name: c.name,
        mentionCount: c.mentionCount,
        visibilityPercent: c.visibilityPercent,
      }));
      
      // Transform citations to export format (url instead of domain)
      const topCitations = topCitationsRaw.slice(0, 5).map(c => ({
        url: c.domain,
        count: c.count,
      }));
      
      // Calculate average rank and first place count
      const allRanks = [...allChatgptRanks, ...allGoogleAIRanks];
      const avgMentionRank = allRanks.length > 0 
        ? Math.round((allRanks.reduce((a, b) => a + b, 0) / allRanks.length) * 10) / 10 
        : null;
      const firstPlaceCount = allRanks.filter(r => r === 1).length;
      
      // Extract and synthesize sentiment narratives (with prompt context)
      const sentimentStatements = aggregateSentimentStatements(results, client.businessName);
      let sentimentNarratives = null;
      
      if (sentimentStatements.positive.length > 0 || sentimentStatements.negative.length > 0) {
        try {
          sentimentNarratives = await synthesizeSentimentNarratives(
            {
              positive: sentimentStatements.positive.map(s => ({
                text: s.text,
                promptText: s.promptText,
                platform: s.platform
              })),
              negative: sentimentStatements.negative.map(s => ({
                text: s.text,
                promptText: s.promptText,
                platform: s.platform
              })),
            },
            client.businessName
          );
        } catch (e) {
          console.error("Failed to synthesize sentiment narratives for export:", e);
        }
      }
      
      // Stream the ZIP file with analytics
      await streamExportZip(res, {
        client,
        groups,
        sessions,
        results,
        dateRange: { start, end },
        analytics: {
          sentimentScore,
          sentimentNarratives,
          shareOfVoice,
          competitorVisibility,
          topCitations,
          avgMentionRank,
          firstPlaceCount,
        },
      });
    } catch (error) {
      logError("EXPORT ERROR", error);
      if (!res.headersSent) {
        res.status(500).json(getSafeErrorResponse("Failed to generate export"));
      }
    }
  });

  // Get all monitoring clients (admin only)
  app.get("/api/monitoring/clients", requireAdminAuth, async (req, res) => {
    try {
      const clients = await storage.getMonitoringClients();
      res.json(clients);
    } catch (error) {
      logError("GET CLIENTS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get clients"));
    }
  });

  // Get all monitoring clients with stats (for clients list page) (admin only)
  app.get("/api/monitoring/clients-with-stats", requireAdminAuth, async (req, res) => {
    try {
      const clients = await storage.getMonitoringClients();
      
      // Enhance each client with latest session and stats
      const clientsWithStats = await Promise.all(clients.map(async (client) => {
        // Get latest session for this client
        const sessions = await storage.getCheckSessionsByClientId(client.id);
        const latestSession = sessions.length > 0 ? sessions[0] : null;
        
        // Get groups and prompts count
        const groups = await storage.getGroupsByClientId(client.id);
        const prompts = await storage.getPromptsByClientId(client.id);
        
        return {
          ...client,
          latestSession: latestSession ? {
            id: latestSession.id,
            overallScore: latestSession.overallScore,
            chatgptScore: latestSession.chatgptScore,
            googleAIScore: latestSession.googleAIScore,
            createdAt: latestSession.createdAt,
          } : undefined,
          groupCount: groups.length,
          promptCount: prompts.length,
        };
      }));
      
      res.json(clientsWithStats);
    } catch (error) {
      logError("GET CLIENTS WITH STATS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get clients"));
    }
  });

  // Delete a monitoring client
  // Delete client (admin only)
  app.delete("/api/monitoring/clients/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if client exists
      const client = await storage.getMonitoringClientById(id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      // Delete client and all associated data
      await storage.deleteMonitoringClient(id);
      
      res.json({ success: true, message: "Client deleted successfully" });
    } catch (error) {
      logError("DELETE CLIENT ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to delete client"));
    }
  });

  // ============================================
  // CLIENT ACCESS TOKEN MANAGEMENT
  // ============================================

  // Generate or regenerate client access token (admin only)
  app.post("/api/monitoring/clients/:id/access-token", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      // Generate new access token
      const accessToken = generateClientAccessToken();
      
      // Update client with new token
      const client = await storage.updateMonitoringClient(clientId, {
        clientAccessToken: accessToken
      });
      
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      res.json({ 
        accessToken, 
        accessUrl: `/monitor/client-access/${accessToken}` 
      });
    } catch (error) {
      logError("GENERATE CLIENT ACCESS TOKEN ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to generate access token"));
    }
  });

  // Get client access token (admin only) - returns existing token without regenerating
  app.get("/api/monitoring/clients/:id/access-token", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      if (!client.clientAccessToken) {
        return res.json({ accessToken: null, accessUrl: null });
      }
      
      res.json({ 
        accessToken: client.clientAccessToken, 
        accessUrl: `/monitor/client-access/${client.clientAccessToken}` 
      });
    } catch (error) {
      logError("GET CLIENT ACCESS TOKEN ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get access token"));
    }
  });

  // Client access authentication - validates token and creates session
  app.get("/api/monitoring/client-access/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token || token.length !== 64) {
        return res.status(400).json({ error: "Invalid access token" });
      }
      
      // Find client by access token
      const client = await storage.getMonitoringClientByAccessToken(token);
      if (!client) {
        return res.status(401).json({ error: "Invalid or expired access token" });
      }
      
      // Create client session (stored in database for persistence across restarts)
      const sessionToken = await createClientSession(client.id);
      
      // Set session cookie (90 days)
      res.cookie("clientSession", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        path: "/"
      });
      
      res.json({ 
        success: true, 
        clientId: client.id,
        businessName: client.businessName,
        redirectTo: `/monitor/dashboard/${client.id}`
      });
    } catch (error) {
      logError("CLIENT ACCESS AUTH ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to authenticate"));
    }
  });

  // Client session status check - for frontend to know if user is logged in as client
  app.get("/api/monitoring/client-session", async (req, res) => {
    try {
      const clientId = getClientIdFromRequest(req);
      const isAdmin = isAdminRequest(req);
      
      if (clientId !== null) {
        const client = await storage.getMonitoringClientById(clientId);
        res.json({ 
          authenticated: true, 
          isAdmin: false,
          clientId,
          businessName: client?.businessName || null
        });
      } else if (isAdmin) {
        res.json({ 
          authenticated: true, 
          isAdmin: true,
          clientId: null,
          businessName: null
        });
      } else {
        res.json({ 
          authenticated: false, 
          isAdmin: false,
          clientId: null,
          businessName: null
        });
      }
    } catch (error) {
      logError("CLIENT SESSION CHECK ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to check session"));
    }
  });

  // ============================================
  // CLIENT SETTINGS ENDPOINTS
  // ============================================

  // Update monitoring client (for settings page)
  // Update client (admin only)
  app.patch("/api/monitoring/clients/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { businessName, domain, industry, scope, city, brandAliases, checkFrequencyDays, isActive } = req.body;
      
      const updateData: any = {};
      if (businessName !== undefined) updateData.businessName = businessName;
      if (domain !== undefined) updateData.domain = domain;
      if (industry !== undefined) updateData.industry = industry;
      if (scope !== undefined) updateData.scope = scope;
      if (city !== undefined) updateData.city = city;
      if (brandAliases !== undefined) updateData.brandAliases = brandAliases;
      if (checkFrequencyDays !== undefined) updateData.checkFrequencyDays = checkFrequencyDays;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const client = await storage.updateMonitoringClient(id, updateData);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      res.json(client);
    } catch (error) {
      logError("UPDATE CLIENT ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to update client"));
    }
  });

  // ============================================
  // GROUPS CRUD ENDPOINTS
  // ============================================

  // Get groups for a client (admin only)
  app.get("/api/monitoring/clients/:id/groups", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const groups = await storage.getGroupsByClientId(clientId);
      res.json(groups);
    } catch (error) {
      logError("GET GROUPS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get groups"));
    }
  });

  // Create a new group (admin only)
  app.post("/api/monitoring/clients/:id/groups", requireAdminAuth, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const { name, description, isHighLevelCategory } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Group name is required" });
      }
      
      const group = await storage.createGroup({
        clientId,
        name,
        description: description || null,
        isHighLevelCategory: isHighLevelCategory || false,
        isActive: true,
      });
      
      res.json(group);
    } catch (error) {
      logError("CREATE GROUP ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to create group"));
    }
  });

  // Update a group (admin only)
  app.patch("/api/monitoring/groups/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, isHighLevelCategory, isActive } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (isHighLevelCategory !== undefined) updateData.isHighLevelCategory = isHighLevelCategory;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const group = await storage.updateGroup(id, updateData);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      res.json(group);
    } catch (error) {
      logError("UPDATE GROUP ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to update group"));
    }
  });

  // Delete a group (and its prompts) (admin only)
  app.delete("/api/monitoring/groups/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGroup(id);
      res.json({ success: true });
    } catch (error) {
      logError("DELETE GROUP ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to delete group"));
    }
  });

  // ============================================
  // PROMPTS CRUD ENDPOINTS
  // ============================================

  // Get prompts for a group (admin only)
  app.get("/api/monitoring/groups/:id/prompts", requireAdminAuth, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const prompts = await storage.getPromptsByGroupId(groupId);
      res.json(prompts);
    } catch (error) {
      logError("GET PROMPTS ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to get prompts"));
    }
  });

  // Create a new prompt (admin only)
  app.post("/api/monitoring/groups/:id/prompts", requireAdminAuth, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const { promptText } = req.body;
      
      if (!promptText) {
        return res.status(400).json({ error: "Prompt text is required" });
      }
      
      const prompt = await storage.createPrompt({
        groupId,
        promptText,
        isActive: true,
      });
      
      res.json(prompt);
    } catch (error) {
      logError("CREATE PROMPT ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to create prompt"));
    }
  });

  // Update a prompt (admin only)
  app.patch("/api/monitoring/prompts/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { promptText, isActive } = req.body;
      
      const updateData: any = {};
      if (promptText !== undefined) updateData.promptText = promptText;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const prompt = await storage.updatePrompt(id, updateData);
      if (!prompt) {
        return res.status(404).json({ error: "Prompt not found" });
      }
      
      res.json(prompt);
    } catch (error) {
      logError("UPDATE PROMPT ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to update prompt"));
    }
  });

  // Delete a prompt (admin only)
  app.delete("/api/monitoring/prompts/:id", requireAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePrompt(id);
      res.json({ success: true });
    } catch (error) {
      logError("DELETE PROMPT ERROR", error);
      res.status(500).json(getSafeErrorResponse("Failed to delete prompt"));
    }
  });

  return httpServer;
}
