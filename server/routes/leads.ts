import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { leadSchema } from "@shared/schema";
import { logError, getSafeErrorResponse } from "../utils/error-sanitizer";
import crypto from "crypto";
import { createLeadWithUnlockNotification } from "../services/email-notification-queue";

const router = Router();

interface LeadRouteDeps {
  createLeadFn: typeof storage.createLead;
  getAuditByIdFn: typeof storage.getAuditById;
  createLeadWithNotificationFn: typeof createLeadWithUnlockNotification;
}

const defaultLeadRouteDeps: LeadRouteDeps = {
  createLeadFn: storage.createLead.bind(storage),
  getAuditByIdFn: storage.getAuditById.bind(storage),
  createLeadWithNotificationFn: createLeadWithUnlockNotification,
};

export async function handleCreateLead(
  req: Request,
  res: Response,
  deps: LeadRouteDeps = defaultLeadRouteDeps,
) {
  try {
    const validatedData = leadSchema.parse(req.body);
    const requestId = validatedData.requestId ?? crypto.randomUUID();
    
    let lead;
    if (validatedData.auditId) {
      const audit = await deps.getAuditByIdFn(validatedData.auditId);
      if (!audit) {
        throw new Error("Audit not found for lead notification");
      }

      // Lead creation and its durable notification commit atomically. Provider
      // delivery remains asynchronous, so provider failures never block access.
      lead = await deps.createLeadWithNotificationFn({
        requestId,
        lead: {
          auditId: validatedData.auditId,
          name: validatedData.name,
          email: validatedData.email,
          phone: validatedData.phone,
          businessName: validatedData.businessName,
          auditScore: validatedData.auditScore,
          status: "new",
        },
        notification: {
            businessName: audit.businessName,
            url: audit.url,
            keyword: audit.keyword,
            scope: audit.scope === "national" ? "national" : "local",
            city: audit.scope === "local" ? audit.city : null,
            overallScore: audit.overallScore,
            chatgptScore: audit.chatgptScore,
            googleAIScore: audit.googleAIScore,
            auditId: audit.id,
            leadName: validatedData.name,
            leadEmail: validatedData.email,
            leadPhone: validatedData.phone || undefined,
        },
      });
    } else {
      lead = await deps.createLeadFn({
        auditId: null,
        submissionId: requestId,
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        businessName: validatedData.businessName,
        auditScore: validatedData.auditScore,
        status: "new",
      });
    }

    res.json(lead);
  } catch (error) {
    logError("LEAD CAPTURE ERROR", error);
    res.status(400).json(getSafeErrorResponse("Failed to capture lead"));
  }
}

router.post("/", (req, res) => {
  void handleCreateLead(req, res);
});

export default router;
