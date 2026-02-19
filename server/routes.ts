import type { Express } from "express";
import type { Server } from "http";
import apiRouter from "./routes/index";
import { registerDiagnosticsRoutes } from "./routes/diagnostics";
import { registerMonitoringRoutes } from "./routes/monitoring";
import { registerExportRoutes } from "./routes/exports";
import { registerSessionRoutes } from "./routes/sessions";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use("/api", apiRouter);

  registerDiagnosticsRoutes(app);
  registerMonitoringRoutes(app);
  registerExportRoutes(app);
  registerSessionRoutes(app);

  return httpServer;
}
