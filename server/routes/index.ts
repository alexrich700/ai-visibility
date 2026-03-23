import { Router } from "express";
import auditRoutes from "./audit";
import leadsRoutes from "./leads";
import adminRoutes from "./admin";
import seoAuditRoutes from "./seo-audit";

const router = Router();

router.use("/audit", auditRoutes);
router.use("/leads", leadsRoutes);
router.use("/admin", adminRoutes);
router.use("/seo-audits", seoAuditRoutes);
router.use("/seo-audit", seoAuditRoutes);

export default router;
