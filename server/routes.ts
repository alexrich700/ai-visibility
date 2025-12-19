import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runAudit, generateServiceGroups, generatePromptsForGroups, runPromptCheck } from "./ai-services";
import { auditRequestSchema, leadSchema, monitoringClientRequestSchema } from "@shared/schema";
import { z } from "zod";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

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

  // SSE endpoint for real-time scan progress
  // Streams progress events as each prompt is tested on each platform
  app.post("/api/monitoring/scan-stream", async (req, res) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    // Track if client disconnected to cancel remaining work
    let isClientConnected = true;
    req.on("close", () => {
      isClientConnected = false;
      console.log("Client disconnected from scan stream");
    });

    // Helper to send SSE events with immediate flush
    const sendEvent = (type: string, data: Record<string, unknown>) => {
      if (!isClientConnected) return;
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      // Force flush to ensure immediate delivery
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    try {
      const { client: clientData, groups, prompts } = req.body;
      
      // Send immediate heartbeat to confirm stream is active
      sendEvent("heartbeat", { message: "Stream connected" });
      
      // Validate client data
      const validatedClient = monitoringClientRequestSchema.parse(clientData);
      
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
      
      // Run visibility checks with progress updates
      let foundCount = 0;
      let citedCount = 0;
      let chatgptFoundCount = 0;
      let googleAIFoundCount = 0;
      let promptIndex = 0;
      
      const location = client.city || undefined;
      
      // Process prompts group by group for better UX
      for (const groupName of groupNames) {
        // Exit early if client disconnected
        if (!isClientConnected) {
          console.log("Scan cancelled - client disconnected");
          return;
        }
        
        const groupPrompts = promptsByGroup[groupName] || [];
        
        for (const prompt of groupPrompts) {
          // Exit early if client disconnected
          if (!isClientConnected) {
            console.log("Scan cancelled - client disconnected");
            return;
          }
          
          promptIndex++;
          const progressPercent = 10 + Math.round((promptIndex / totalPrompts) * 85); // 10-95%
          
          // Send progress event for this prompt BEFORE the blocking check
          sendEvent("testing", { 
            groupName,
            promptIndex,
            totalPrompts,
            promptText: prompt.text.slice(0, 60) + (prompt.text.length > 60 ? "..." : ""),
            progress: progressPercent,
          });
          
          // Run the check (ChatGPT and Google AI in parallel for speed)
          const result = await runPromptCheck(
            prompt.text,
            client.businessName,
            client.domain,
            location
          );
          
          // Skip storing if client disconnected during the check
          if (!isClientConnected) {
            console.log("Scan cancelled - client disconnected during prompt check");
            return;
          }
          
          // Store result
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
          
          // Send completion event for this prompt
          sendEvent("prompt_complete", {
            groupName,
            promptIndex,
            totalPrompts,
            chatgptFound: result.chatgpt.found,
            googleAIFound: result.googleAI.found,
            progress: progressPercent,
          });
        }
        
        // Send group completion event
        sendEvent("group_complete", { groupName });
      }
      
      // Calculate final scores
      const overallScore = totalPrompts > 0 ? Math.round((foundCount / totalPrompts) * 100) : 0;
      const chatgptScore = totalPrompts > 0 ? Math.round((chatgptFoundCount / totalPrompts) * 100) : 0;
      const googleAIScore = totalPrompts > 0 ? Math.round((googleAIFoundCount / totalPrompts) * 100) : 0;
      
      sendEvent("status", { message: "Calculating final scores...", progress: 97 });
      
      // Update session with final scores
      await storage.updateCheckSession(session.id, {
        overallScore,
        chatgptScore,
        googleAIScore,
        foundCount,
        citedCount,
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
      
      res.json({
        client,
        groups,
        sessions,
        latestResults,
        resultsByGroup,
      });
    } catch (error) {
      console.error("Get dashboard error:", error);
      res.status(500).json({ error: "Failed to get dashboard data" });
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
