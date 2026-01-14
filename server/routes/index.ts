import { Router } from "express";
import auditRoutes from "./audit";
import leadsRoutes from "./leads";
import adminRoutes from "./admin";

const router = Router();

router.use("/audit", auditRoutes);
router.use("/leads", leadsRoutes);
router.use("/admin", adminRoutes);

export default router;
