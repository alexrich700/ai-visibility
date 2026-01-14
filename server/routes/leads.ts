import { Router } from "express";
import { storage } from "../storage";
import { leadSchema } from "@shared/schema";

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

    res.json(lead);
  } catch (error) {
    console.error("Lead capture error:", error);
    res.status(400).json({ 
      error: "Failed to capture lead",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;
