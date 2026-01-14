import { Router } from "express";
import { storage } from "../storage";
import { runAudit } from "../ai-services";
import { auditRequestSchema } from "@shared/schema";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const validatedData = auditRequestSchema.parse(req.body);
    
    const { businessName, url, keyword, scope, city } = validatedData;

    const results = await runAudit(businessName, url, keyword, scope, city);

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
    console.error("Get audit error:", error);
    res.status(500).json({ error: "Failed to get audit" });
  }
});

export default router;
