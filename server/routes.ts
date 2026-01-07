import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAudit, generateServiceGroups, generatePromptsForGroups, runPromptCheck, synthesizeSentimentNarratives, generateBrandSentimentPrompts, type SynthesizedNarratives } from "./ai-services";
import { auditRequestSchema, leadSchema, monitoringClientRequestSchema } from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { 
  analyzeResponse, 
  aggregateCitations, 
  computeShareOfVoice, 
  aggregateCompetitorMentions,
  aggregateSentiment,
  calculateAverageRank,
  countFirstPlace,
  calculateSentimentScore,
  calculateOverallSentimentScore,
  aggregateSentimentStatements,
  computeCompetitorVisibility,
  collectBrandSentimentFindings,
  type Citation,
  type BrandSentimentFinding
} from "./services/scan-analytics";
import { streamExportZip } from "./services/export-generator";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";


// Temporary cache for pending scan configurations (for SSE handshake only)
// Actual scan data is persisted in the database
interface PendingScanConfig {
  client: z.infer<typeof monitoringClientRequestSchema>;
  groups: { name: string; description: string; isHighLevelCategory: boolean }[];
  prompts: { groupName: string; text: string }[];
  createdAt: number;
}
const pendingScanConfigs = new Map<string, PendingScanConfig>();

// Interface for rescan config (existing client)
interface PendingRescanConfig {
  clientId: number;
  client: {
    id: number;
    businessName: string;
    domain: string;
    industry: string | null;
    scope: string | null;
    city: string | null;
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
  
  // Run AI visibility audit
  app.post("/api/audit", async (req, res) => {
    try {
      const validatedData = auditRequestSchema.parse(req.body);
      
      const { businessName, url, keyword, scope, city } = validatedData;

      // Run the audit
      const results = await runAudit(businessName, url, keyword, scope, city);

      // Store the audit record with full results
      const audit = await storage.createAudit({
        businessName,
        url: url || null,
        keyword,
        scope,
        city: city || null,
        overallScore: results.overallScore,
        chatgptScore: results.chatgptScore,
        googleAIScore: results.googleAIScore,
        fullResults: JSON.stringify(results),
      });

      // Return full results with audit ID
      res.json({
        auditId: audit.id,
        businessName,
        url,
        keyword,
        scope,
        city,
        overallScore: results.overallScore,
        chatgptScore: results.chatgptScore,
        googleAIScore: results.googleAIScore,
        executiveSummary: results.executiveSummary,
        promptResults: results.promptResults,
        sentimentAnalysis: results.sentimentAnalysis,
        competitors: results.competitors,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Audit error:", error);
      res.status(400).json({ 
        error: "Failed to run audit",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Capture lead
  app.post("/api/leads", async (req, res) => {
    try {
      const validatedData = leadSchema.parse(req.body);
      
      const lead = await storage.createLead({
        auditId: validatedData.auditId || null,
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        businessName: validatedData.businessName,
        auditScore: validatedData.auditScore,
        status: "new",
      });

      res.json(lead);
    } catch (error) {
      console.error("Lead capture error:", error);
      res.status(400).json({ 
        error: "Failed to capture lead",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Admin login
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Get all audits with lead info (for admin)
  app.get("/api/admin/audits", async (req, res) => {
    try {
      const auditsWithLeads = await storage.getAuditsWithLeads();
      res.json(auditsWithLeads);
    } catch (error) {
      console.error("Get audits error:", error);
      res.status(500).json({ error: "Failed to get audits" });
    }
  });

  // Get all leads (for admin)
  app.get("/api/admin/leads", async (req, res) => {
    try {
      const leads = await storage.getLeads();
      res.json(leads);
    } catch (error) {
      console.error("Get leads error:", error);
      res.status(500).json({ error: "Failed to get leads" });
    }
  });

  // Update lead status (for admin)
  app.patch("/api/admin/leads/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      const validStatuses = ["new", "contacted", "not_reached", "closed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      const lead = await storage.updateLeadStatus(id, status);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json(lead);
    } catch (error) {
      console.error("Update lead status error:", error);
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });

  // Get single audit by ID (for admin to view full results)
  app.get("/api/admin/audits/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const audit = await storage.getAuditById(id);
      if (!audit) {
        return res.status(404).json({ error: "Audit not found" });
      }
      res.json(audit);
    } catch (error) {
      console.error("Get audit error:", error);
      res.status(500).json({ error: "Failed to get audit" });
    }
  });

  // ============================================
  // MONITORING ENDPOINTS
  // ============================================

  // Generate service groups using AI
  app.post("/api/monitoring/generate-groups", async (req, res) => {
    try {
      const { businessName, industry, scope, city } = req.body;
      
      if (!businessName || !industry) {
        return res.status(400).json({ error: "Business name and industry are required" });
      }

      const result = await generateServiceGroups(businessName, industry, scope, city);
      
      // Return high-level category as the first group, followed by specific groups
      // This gives 11 total groups: 1 umbrella + 10 specific
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
        highLevelCategory: result.highLevelCategory 
      });
    } catch (error) {
      console.error("Generate groups error:", error);
      res.status(500).json({ error: "Failed to generate groups" });
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
      console.error("Generate prompts error:", error);
      res.status(500).json({ error: "Failed to generate prompts" });
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
      
      // Calculate final scores
      const overallScore = totalPrompts > 0 ? Math.round((foundCount / totalPrompts) * 100) : 0;
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
      console.error("Create and scan error:", error);
      res.status(500).json({ 
        error: "Failed to create client and run scan",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Step 1: Prepare scan - stores config temporarily and returns a prepareId
  // This allows the frontend to then connect via EventSource (GET) for proper SSE
  app.post("/api/monitoring/scan-prepare", async (req, res) => {
    try {
      const { client: clientData, groups, prompts } = req.body;
      
      // Validate client data upfront
      const validatedClient = monitoringClientRequestSchema.parse(clientData);
      
      // Generate unique ID for this scan preparation
      const prepareId = randomUUID();
      
      // Store config temporarily (will be consumed by SSE endpoint)
      pendingScanConfigs.set(prepareId, {
        client: validatedClient,
        groups: groups || [],
        prompts: prompts || [],
        createdAt: Date.now(),
      });
      
      res.json({ prepareId });
    } catch (error) {
      console.error("Scan prepare error:", error);
      res.status(400).json({ 
        error: "Failed to prepare scan",
        details: error instanceof Error ? error.message : "Unknown error"
      });
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
    req.on("close", () => {
      isClientConnected = false;
      console.log("Client disconnected from scan stream");
    });

    // Helper to send SSE events
    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (!isClientConnected) return;
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
      const { client: validatedClient, groups, prompts } = config;
      
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
      
      // Generate and create brand sentiment prompts
      const brandSentimentPrompts = generateBrandSentimentPrompts(
        client.businessName,
        client.industry,
        client.city || undefined
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
      
      // Create check session
      const session = await storage.createCheckSession({
        clientId: client.id,
        overallScore: 0,
        chatgptScore: 0,
        googleAIScore: 0,
        totalPrompts: servicePromptCount, // Store only service prompts in visibility totals
        foundCount: 0,
        citedCount: 0,
      });
      
      // Run visibility checks with bounded concurrency (4 prompts at a time)
      // Each prompt still runs ChatGPT and Gemini in parallel internally
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
      
      const location = client.city || undefined;
      
      // Flatten all prompts with their group names and original indices for batch processing
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
          allPromptsWithGroups.push({ prompt, groupName, originalIndex: idx });
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
      
      // Process prompts in concurrent batches
      for (let i = 0; i < allPromptsWithGroups.length; i += CONCURRENT_PROMPTS) {
        // Exit early if client disconnected
        if (!isClientConnected) {
          console.log("Scan cancelled - client disconnected");
          return;
        }
        
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
        
        // Run all prompts in this batch concurrently
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            if (!isClientConnected) return null;
            
            const result = await runPromptCheck(
              item.prompt.text,
              client.businessName,
              client.domain,
              location,
              client.brandAliases || undefined
            );
            
            return { ...item, result };
          })
        );
        
        // Exit early if client disconnected during batch
        if (!isClientConnected) {
          console.log("Scan cancelled - client disconnected during batch");
          return;
        }
        
        // Process and store results from this batch (maintain order for consistent indices)
        for (const batchResult of batchResults) {
          if (!batchResult || !isClientConnected) continue;
          
          const { prompt, groupName, originalIndex, result } = batchResult;
          completedCount++;
          const progressPercent = 10 + Math.round((completedCount / totalPrompts) * 85);
          
          // Analyze responses for analytics
          const chatgptAnalytics = analyzeResponse(result.chatgpt.response, client.businessName);
          const googleAIAnalytics = analyzeResponse(result.googleAI.response, client.businessName);
          
          // Calculate numerical sentiment scores
          const chatgptSentimentScore = calculateSentimentScore(result.chatgpt.response, client.businessName);
          const googleAISentimentScore = calculateSentimentScore(result.googleAI.response, client.businessName);
          
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
          
          // Store result with analytics
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
          });
          
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
        }
      }
      
      // Fire group_complete for any groups with zero prompts (edge case)
      for (const groupName of groupNames) {
        if (!groupsCompleted.has(groupName) && groupTotalCounts[groupName] === 0) {
          sendEvent("group_complete", { groupName });
        }
      }
      
      // Exit early if client disconnected
      if (!isClientConnected) {
        console.log("Scan cancelled - client disconnected");
        return;
      }
      
      // Calculate final scores (using service prompt count, excluding brand sentiment)
      const overallScore = servicePromptCount > 0 ? Math.round((foundCount / servicePromptCount) * 100) : 0;
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
      
      // Calculate overall sentiment score (0-100)
      const allSentimentScores = storedResults
        .flatMap(r => [r.chatgptSentimentScore, r.googleAISentimentScore])
        .filter((s): s is number => s !== null);
      const sentimentScore = calculateOverallSentimentScore(allSentimentScores);
      
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
      console.error("Scan stream error:", error);
      sendEvent("error", { 
        message: error instanceof Error ? error.message : "Unknown error occurred",
      });
      res.end();
    }
  });

  // Rescan endpoint for existing clients - creates new session with fresh data
  // Step 1: Prepare rescan (returns prepareId)
  app.post("/api/monitoring/rescan-prepare/:clientId", async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      
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
      pendingRescanConfigs.set(prepareId, {
        clientId,
        client,
        groups: activeGroups,
        prompts,
        createdAt: Date.now(),
      });
      
      res.json({ prepareId, totalPrompts: prompts.length });
    } catch (error) {
      console.error("Rescan prepare error:", error);
      res.status(400).json({ 
        error: "Failed to prepare rescan",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

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

    // Track if client disconnected to cancel remaining work
    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
      console.log("Client disconnected from rescan stream");
    });

    // Helper to send SSE events
    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (!isClientConnected) return;
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
      const { clientId, client, groups, prompts } = config;
      
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
      
      // Create new check session
      const session = await storage.createCheckSession({
        clientId,
        overallScore: 0,
        chatgptScore: 0,
        googleAIScore: 0,
        totalPrompts: servicePromptCount, // Store only service prompts in visibility totals
        foundCount: 0,
        citedCount: 0,
      });
      
      sendEvent("status", { message: "Running AI visibility checks...", progress: 10 });
      
      // Run visibility checks with bounded concurrency
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
      
      const location = client.city || undefined;
      
      // Map prompts with their group names
      const promptsWithGroups = prompts.map((prompt, index) => {
        const group = groups.find(g => g.id === prompt.groupId);
        return { prompt, groupName: group?.name || "Unknown", originalIndex: index + 1 };
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
      
      // Process prompts in concurrent batches
      for (let i = 0; i < promptsWithGroups.length; i += CONCURRENT_PROMPTS) {
        if (!isClientConnected) {
          console.log("Rescan cancelled - client disconnected");
          return;
        }
        
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
        
        // Run all prompts in this batch concurrently
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            if (!isClientConnected) return null;
            
            const result = await runPromptCheck(
              item.prompt.promptText,
              client.businessName,
              client.domain,
              location,
              client.brandAliases || undefined
            );
            
            return { ...item, result };
          })
        );
        
        if (!isClientConnected) {
          console.log("Rescan cancelled - client disconnected during batch");
          return;
        }
        
        // Process and store results from this batch
        for (const batchResult of batchResults) {
          if (!batchResult || !isClientConnected) continue;
          
          const { prompt, groupName, originalIndex, result } = batchResult;
          completedCount++;
          const progressPercent = 10 + Math.round((completedCount / totalPrompts) * 85);
          
          // Analyze responses for analytics
          const chatgptAnalytics = analyzeResponse(result.chatgpt.response, client.businessName);
          const googleAIAnalytics = analyzeResponse(result.googleAI.response, client.businessName);
          
          // Calculate sentiment scores
          const chatgptSentimentScore = calculateSentimentScore(result.chatgpt.response, client.businessName);
          const googleAISentimentScore = calculateSentimentScore(result.googleAI.response, client.businessName);
          
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
          
          // Store result
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
          });
          
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
        }
      }
      
      if (!isClientConnected) {
        console.log("Rescan cancelled - client disconnected");
        return;
      }
      
      // Calculate final scores (using service prompt count, excluding brand sentiment)
      const overallScore = servicePromptCount > 0 ? Math.round((foundCount / servicePromptCount) * 100) : 0;
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
      
      // Calculate overall sentiment score
      const allSentimentScores = storedResults
        .flatMap(r => [r.chatgptSentimentScore, r.googleAISentimentScore])
        .filter((s): s is number => s !== null);
      const sentimentScore = calculateOverallSentimentScore(allSentimentScores);
      
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
      console.error("Rescan stream error:", error);
      sendEvent("error", { 
        message: error instanceof Error ? error.message : "Unknown error occurred",
      });
      res.end();
    }
  });

  // Get dashboard data for a client
  app.get("/api/monitoring/dashboard/:id", async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      const client = await storage.getMonitoringClientById(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const groups = await storage.getGroupsByClientId(clientId);
      const sessions = await storage.getCheckSessionsByClientId(clientId);
      
      // Get results from the latest session (if any)
      let latestResults: any[] = [];
      if (sessions.length > 0) {
        latestResults = await storage.getCheckResultsBySessionId(sessions[0].id);
      }
      
      // Group results by group
      const resultsByGroup = groups.map(group => ({
        groupId: group.id,
        groupName: group.name,
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
      console.error("Get dashboard error:", error);
      res.status(500).json({ error: "Failed to get dashboard data" });
    }
  });

  // Get group visibility trends over time
  app.get("/api/monitoring/trends/groups/:clientId", async (req, res) => {
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
      console.error("Get group trends error:", error);
      res.status(500).json({ error: "Failed to get group trends" });
    }
  });

  // Get competitor visibility trends over time
  app.get("/api/monitoring/trends/competitors/:clientId", async (req, res) => {
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
      console.error("Get competitor trends error:", error);
      res.status(500).json({ error: "Failed to get competitor trends" });
    }
  });

  // Export monitoring data as ZIP
  app.get("/api/monitoring/exports/:id", async (req, res) => {
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
      
      // Compute analytics from results
      const totalPrompts = results.length;
      const foundCount = results.filter(r => r.chatgptFound || r.googleAIFound).length;
      
      // Collect sentiment data for scoring
      const allSentimentScores: (number | null)[] = [];
      const allChatgptRanks: number[] = [];
      const allGoogleAIRanks: number[] = [];
      const allChatgptCitations: Citation[] = [];
      const allGoogleAICitations: Citation[] = [];
      
      for (const result of results) {
        // Collect sentiments for scoring
        if (result.chatgptResponse && (result.chatgptFound || result.chatgptCited)) {
          const score = calculateSentimentScore(result.chatgptResponse, client.businessName);
          if (score !== null) allSentimentScores.push(score);
        }
        if (result.googleAIResponse && (result.googleAIFound || result.googleAICited)) {
          const score = calculateSentimentScore(result.googleAIResponse, client.businessName);
          if (score !== null) allSentimentScores.push(score);
        }
        
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
      const sentimentScore = calculateOverallSentimentScore(allSentimentScores);
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
      console.error("Export error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate export" });
      }
    }
  });

  // Get all monitoring clients
  app.get("/api/monitoring/clients", async (req, res) => {
    try {
      const clients = await storage.getMonitoringClients();
      res.json(clients);
    } catch (error) {
      console.error("Get clients error:", error);
      res.status(500).json({ error: "Failed to get clients" });
    }
  });

  // Get all monitoring clients with stats (for clients list page)
  app.get("/api/monitoring/clients-with-stats", async (req, res) => {
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
      console.error("Get clients with stats error:", error);
      res.status(500).json({ error: "Failed to get clients" });
    }
  });

  // Delete a monitoring client
  app.delete("/api/monitoring/clients/:id", async (req, res) => {
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
      console.error("Delete client error:", error);
      res.status(500).json({ error: "Failed to delete client" });
    }
  });

  // ============================================
  // CLIENT SETTINGS ENDPOINTS
  // ============================================

  // Update monitoring client (for settings page)
  app.patch("/api/monitoring/clients/:id", async (req, res) => {
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
      console.error("Update client error:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  // ============================================
  // GROUPS CRUD ENDPOINTS
  // ============================================

  // Get groups for a client
  app.get("/api/monitoring/clients/:id/groups", async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const groups = await storage.getGroupsByClientId(clientId);
      res.json(groups);
    } catch (error) {
      console.error("Get groups error:", error);
      res.status(500).json({ error: "Failed to get groups" });
    }
  });

  // Create a new group
  app.post("/api/monitoring/clients/:id/groups", async (req, res) => {
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
      console.error("Create group error:", error);
      res.status(500).json({ error: "Failed to create group" });
    }
  });

  // Update a group
  app.patch("/api/monitoring/groups/:id", async (req, res) => {
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
      console.error("Update group error:", error);
      res.status(500).json({ error: "Failed to update group" });
    }
  });

  // Delete a group (and its prompts)
  app.delete("/api/monitoring/groups/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGroup(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete group error:", error);
      res.status(500).json({ error: "Failed to delete group" });
    }
  });

  // ============================================
  // PROMPTS CRUD ENDPOINTS
  // ============================================

  // Get prompts for a group
  app.get("/api/monitoring/groups/:id/prompts", async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const prompts = await storage.getPromptsByGroupId(groupId);
      res.json(prompts);
    } catch (error) {
      console.error("Get prompts error:", error);
      res.status(500).json({ error: "Failed to get prompts" });
    }
  });

  // Create a new prompt
  app.post("/api/monitoring/groups/:id/prompts", async (req, res) => {
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
      console.error("Create prompt error:", error);
      res.status(500).json({ error: "Failed to create prompt" });
    }
  });

  // Update a prompt
  app.patch("/api/monitoring/prompts/:id", async (req, res) => {
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
      console.error("Update prompt error:", error);
      res.status(500).json({ error: "Failed to update prompt" });
    }
  });

  // Delete a prompt
  app.delete("/api/monitoring/prompts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePrompt(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete prompt error:", error);
      res.status(500).json({ error: "Failed to delete prompt" });
    }
  });

  // ============================================
  // ADMIN: BACKFILL METRICS FROM EXISTING RESULTS
  // ============================================
  
  app.post("/api/admin/backfill-metrics", async (req, res) => {
    try {
      const password = req.body.password;
      const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
      
      if (password !== adminPassword) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Get all sessions and their results
      const allClients = await storage.getMonitoringClients();
      let totalGroupMetrics = 0;
      let totalCompetitorMetrics = 0;
      
      for (const client of allClients) {
        const sessions = await storage.getCheckSessionsByClientId(client.id);
        const groups = await storage.getGroupsByClientId(client.id);
        
        for (const session of sessions) {
          // Check if metrics already exist for this session (check both group and competitor)
          const existingGroupMetrics = await storage.getGroupMetricsBySessionId(session.id);
          const existingCompetitorMetrics = await storage.getCompetitorMetricsBySessionId(session.id);
          if (existingGroupMetrics.length > 0 && existingCompetitorMetrics.length > 0) {
            continue; // Already backfilled
          }
          
          const results = await storage.getCheckResultsBySessionId(session.id);
          if (results.length === 0) continue;
          
          // Group results by group name
          const groupMetrics: Record<string, {
            groupId: number;
            totalPrompts: number;
            foundCount: number;
            citedCount: number;
            chatgptFoundCount: number;
            googleAIFoundCount: number;
          }> = {};
          
          for (const group of groups) {
            groupMetrics[group.name] = {
              groupId: group.id,
              totalPrompts: 0,
              foundCount: 0,
              citedCount: 0,
              chatgptFoundCount: 0,
              googleAIFoundCount: 0,
            };
          }
          
          const competitorCounts = new Map<string, number>();
          
          for (const result of results) {
            const group = groups.find(g => g.id === result.groupId);
            if (group && groupMetrics[group.name]) {
              groupMetrics[group.name].totalPrompts++;
              
              const chatgptFound = result.chatgptFound || false;
              const googleAIFound = result.googleAIFound || false;
              
              if (chatgptFound || googleAIFound) {
                groupMetrics[group.name].foundCount++;
              }
              if (chatgptFound) {
                groupMetrics[group.name].chatgptFoundCount++;
              }
              if (googleAIFound) {
                groupMetrics[group.name].googleAIFoundCount++;
              }
              if (result.chatgptCited || result.googleAICited) {
                groupMetrics[group.name].citedCount++;
              }
            }
            
            // Aggregate competitors
            if (result.competitors) {
              try {
                const comps = JSON.parse(result.competitors) as string[];
                for (const comp of comps) {
                  const normalized = comp.trim();
                  if (normalized && normalized.length > 2 && !normalized.toLowerCase().includes('fort worth') && !normalized.toLowerCase().includes('dallas')) {
                    competitorCounts.set(normalized, (competitorCounts.get(normalized) || 0) + 1);
                  }
                }
              } catch {}
            }
          }
          
          // Store group metrics (only if not already present)
          if (existingGroupMetrics.length === 0) {
            for (const groupName of Object.keys(groupMetrics)) {
              const gm = groupMetrics[groupName];
              if (gm.totalPrompts > 0) {
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
                totalGroupMetrics++;
              }
            }
          }
          
          // Store competitor metrics (top 20, only if not already present)
          if (existingCompetitorMetrics.length === 0) {
            const sortedCompetitors = Array.from(competitorCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 20);
            
            const totalPrompts = results.length;
            for (const [compName, count] of sortedCompetitors) {
              const visibilityPercent = totalPrompts > 0 ? (count / totalPrompts) * 100 : 0;
              await storage.createCheckCompetitorMetric({
                sessionId: session.id,
                clientId: client.id,
                competitorName: compName,
                mentionCount: count,
                visibilityPercent,
                chatgptMentions: 0,
                googleAIMentions: 0,
              });
              totalCompetitorMetrics++;
            }
          }
        }
      }
      
      res.json({ 
        success: true, 
        message: `Backfilled ${totalGroupMetrics} group metrics and ${totalCompetitorMetrics} competitor metrics` 
      });
    } catch (error) {
      console.error("Backfill metrics error:", error);
      res.status(500).json({ error: "Failed to backfill metrics" });
    }
  });

  return httpServer;
}
