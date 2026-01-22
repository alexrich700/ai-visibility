import { Router } from "express";
import { storage } from "../storage";
import { leadSchema } from "@shared/schema";
import { sendAuditNotification } from "../email";
import { logError, getSafeErrorResponse } from "../utils/error-sanitizer";

const router = Router();

router.post("/", async (req, res) => {
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

    // Send email notification with lead and audit info
    if (validatedData.auditId) {
      const audit = await storage.getAuditById(validatedData.auditId);
      if (audit) {
        sendAuditNotification({
          businessName: audit.businessName,
          keyword: audit.keyword,
          city: audit.city,
          overallScore: audit.overallScore,
          chatgptScore: audit.chatgptScore,
          googleAIScore: audit.googleAIScore,
          auditId: audit.id,
          leadName: validatedData.name,
          leadEmail: validatedData.email,
          leadPhone: validatedData.phone || undefined,
        }).catch(err => console.error('Failed to send lead notification:', err));
      }
    }

    res.json(lead);
  } catch (error) {
    logError("LEAD CAPTURE ERROR", error);
    res.status(400).json(getSafeErrorResponse("Failed to capture lead"));
  }
});

export default router;
