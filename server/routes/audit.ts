import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { runAudit, ProgressCallback, WarningCallback } from "../ai-services";
import { auditRequestSchema } from "@shared/schema";
import crypto from "crypto";
import { withDatabaseRetry } from "../db-utils";
import { logError, getSafeErrorResponse } from "../utils/error-sanitizer";

const router = Router();

interface AuditStreamDeps {
  runAuditFn: typeof runAudit;
  createAuditFn: typeof storage.createAudit;
  withDatabaseRetryFn: typeof withDatabaseRetry;
}

const defaultAuditStreamDeps: AuditStreamDeps = {
  runAuditFn: runAudit,
  createAuditFn: storage.createAudit.bind(storage),
  withDatabaseRetryFn: withDatabaseRetry,
};

function generateShareToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// SSE endpoint for real-time audit progress
export async function handleAuditStream(
  req: Request,
  res: Response,
  deps: AuditStreamDeps = defaultAuditStreamDeps,
) {
  let clientDisconnected = false;
  let heartbeat: NodeJS.Timeout | null = null;

  try {
    const validatedData = auditRequestSchema.parse(req.body);
    const { businessName, url, keyword, scope, city } = validatedData;

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Disable Nagle algorithm to prevent TCP buffering of small SSE events
    if (req.socket) {
      req.socket.setNoDelay(true);
    }

    // Helper to send SSE events - single atomic write + explicit flush
    const sendEvent = (eventType: string, data: any) => {
      if (clientDisconnected || res.writableEnded) {
        console.log(`[SSE] SKIPPED event: ${eventType} (clientDisconnected=${clientDisconnected}, writableEnded=${res.writableEnded})`);
        return;
      }
      try {
        const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        const writeResult = res.write(payload);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
        console.log(`[SSE] Sent event: ${eventType} (${payload.length} bytes, writeResult=${writeResult})`);
      } catch (err) {
        console.error(`[SSE] ERROR writing event ${eventType}:`, err);
      }
    };

    res.on("close", () => {
      console.log(`[SSE] Client connection closed`);
      clientDisconnected = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    });

    heartbeat = setInterval(() => {
      if (clientDisconnected || res.writableEnded) {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        return;
      }
      const hb = `: heartbeat ${Date.now()}\n\n`;
      res.write(hb);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    }, 15000);

    // Progress callback for real-time updates
    const onProgress: ProgressCallback = (stage, progress, total) => {
      sendEvent("progress", { stage, progress, total });
    };

    const onWarning: WarningCallback = (message, subtext) => {
      sendEvent("warning", { message, subtext });
    };

    // Run the audit with progress streaming
    const results = await deps.runAuditFn(
      businessName,
      url,
      keyword,
      scope,
      city,
      onProgress,
      onWarning
    );

    // Save to database
    const audit = await deps.withDatabaseRetryFn(() => 
      deps.createAuditFn({
        businessName,
        url: url || null,
        keyword,
        scope,
        city: city || null,
        overallScore: results.overallScore,
        chatgptScore: results.chatgptScore,
        googleAIScore: results.googleAIScore,
        fullResults: JSON.stringify(results),
      })
    );

    // Send final result
    sendEvent("complete", {
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

    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    res.end();
  } catch (error) {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    if (clientDisconnected) {
      return;
    }

    logError("AUDIT STREAM ERROR", error);
    // Send error event
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: "Failed to run audit" })}\n\n`);
    res.end();
  }
}

router.post("/stream", (req, res) => {
  void handleAuditStream(req, res);
});

// Original endpoint for backwards compatibility (no streaming)
router.post("/", async (req, res) => {
  try {
    const validatedData = auditRequestSchema.parse(req.body);
    
    const { businessName, url, keyword, scope, city } = validatedData;

    const results = await runAudit(businessName, url, keyword, scope, city);

    // Use retry wrapper for database operation in case connection was lost during long AI operations
    const audit = await withDatabaseRetry(() => 
      storage.createAudit({
        businessName,
        url: url || null,
        keyword,
        scope,
        city: city || null,
        overallScore: results.overallScore,
        chatgptScore: results.chatgptScore,
        googleAIScore: results.googleAIScore,
        fullResults: JSON.stringify(results),
      })
    );

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
    logError("AUDIT ERROR", error);
    res.status(400).json(getSafeErrorResponse("Failed to run audit"));
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid audit ID" });
    }
    const audit = await storage.getAuditById(id);
    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }
    res.json(audit);
  } catch (error) {
    logError("GET AUDIT ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to get audit"));
  }
});

router.post("/:id/share", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid audit ID" });
    }
    
    const audit = await storage.getAuditById(id);
    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }
    
    if (audit.shareToken) {
      return res.json({ shareToken: audit.shareToken });
    }
    
    const shareToken = generateShareToken();
    const updatedAudit = await storage.updateAuditShareToken(id, shareToken);
    
    if (!updatedAudit) {
      return res.status(500).json({ error: "Failed to generate share token" });
    }
    
    res.json({ shareToken: updatedAudit.shareToken });
  } catch (error) {
    logError("GENERATE SHARE TOKEN ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to generate share token"));
  }
});

router.get("/share/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: "Share token required" });
    }
    
    const audit = await storage.getAuditByShareToken(token);
    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }
    
    res.json(audit);
  } catch (error) {
    logError("GET SHARED AUDIT ERROR", error);
    res.status(500).json(getSafeErrorResponse("Failed to get shared audit"));
  }
});

export default router;
