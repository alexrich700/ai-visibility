import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAudit, generateServiceGroups, generatePromptsForGroups, runPromptCheck } from "./ai-services";
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
  type Citation
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

// Clean up stale configs older than 5 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(pendingScanConfigs.entries());
  for (const [id, config] of entries) {
    if (now - config.createdAt > 5 * 60 * 1000) {
      pendingScanConfigs.delete(id);
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
          location
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
      for (const group of groups) {
        const createdGroup = await storage.createGroup({
          clientId: client.id,
          name: group.name,
          description: group.description || null,
          isHighLevelCategory: group.isHighLevelCategory || false,
          isActive: true,
        });
        groupIdMap[group.name] = createdGroup.id;
        groupNames.push(group.name);
      }
      
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
      
      const allPrompts = Object.values(promptsByGroup).flat();
      const totalPrompts = allPrompts.length;
      
      // Create check session
      const session = await storage.createCheckSession({
        clientId: client.id,
        overallScore: 0,
        chatgptScore: 0,
        googleAIScore: 0,
        totalPrompts,
        foundCount: 0,
        citedCount: 0,
      });
      
      // Run visibility checks with bounded concurrency (4 prompts at a time)
      // Each prompt still runs ChatGPT and Gemini in parallel internally
      const CONCURRENT_PROMPTS = 4;
      let foundCount = 0;
      let citedCount = 0;
      let chatgptFoundCount = 0;
      let googleAIFoundCount = 0;
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
      }[] = [];
      
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
              location
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
          
          // Collect for session-level aggregation
          allChatgptCitations.push(chatgptAnalytics.citations);
          allGoogleAICitations.push(googleAIAnalytics.citations);
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
            googleAISentimentScore
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
            chatgptCitations: chatgptAnalytics.citations,
            googleAICitations: googleAIAnalytics.citations,
            chatgptSnippet: chatgptAnalytics.snippet,
            googleAISnippet: googleAIAnalytics.snippet,
          });
          
          if (result.chatgpt.found || result.googleAI.found) foundCount++;
          if (result.chatgpt.cited || result.googleAI.cited) citedCount++;
          if (result.chatgpt.found) chatgptFoundCount++;
          if (result.googleAI.found) googleAIFoundCount++;
          
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
      
      // Calculate final scores
      const overallScore = totalPrompts > 0 ? Math.round((foundCount / totalPrompts) * 100) : 0;
      const chatgptScore = totalPrompts > 0 ? Math.round((chatgptFoundCount / totalPrompts) * 100) : 0;
      const googleAIScore = totalPrompts > 0 ? Math.round((googleAIFoundCount / totalPrompts) * 100) : 0;
      
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
      
      // Compute competitor visibility
      const competitorVisibility = computeCompetitorVisibility(competitorCounts, totalPrompts, 5);
      
      // Extract sentiment statements
      const sentimentStatements = aggregateSentimentStatements(storedResults, client.businessName);
      
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
      
      // Stream the ZIP file
      await streamExportZip(res, {
        client,
        groups,
        sessions,
        results,
        dateRange: { start, end },
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

  return httpServer;
}
