import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startScheduler } from "./services/scheduler";
import { startScanJobProcessor, registerShutdownHandlers } from "./services/scan-job-processor";
import { startEmailNotificationWorker, stopEmailNotificationWorker } from "./services/email-notification-queue";
import { validateOpenAIKey } from "./ai-services";
import { createLogger } from "./utils/logger";

const app = express();
const startupLogger = createLogger("startup");
const httpLogger = createLogger("express");

// ============================================
// STARTUP VALIDATION
// ============================================
function validateEnvironment() {
  startupLogger.info("========================================");
  startupLogger.info("ENVIRONMENT VALIDATION");
  startupLogger.info("========================================");
  
  // Validate OpenAI API key
  const openaiResult = validateOpenAIKey();
  if (!openaiResult.valid) {
    startupLogger.error(openaiResult.message, { status: "critical" });
    startupLogger.error("Prompt generation will use fallback defaults - AI prompts won't be customized!", { status: "critical" });
  }
  
  // Check other important environment variables
  if (!process.env.DATABASE_URL) {
    startupLogger.warn("DATABASE_URL is not set - database operations will fail");
  } else {
    startupLogger.info("DATABASE_URL is configured");
  }
  
  startupLogger.info("Admin portal auth uses database-backed user credentials and sessions");
  
  // Optional API keys
  if (process.env.PERPLEXITY_API_KEY) {
    startupLogger.info("PERPLEXITY_API_KEY is configured");
  } else {
    startupLogger.info("PERPLEXITY_API_KEY not set - Perplexity checks will be skipped");
  }

  startupLogger.info("========================================");
}

// Run validation on startup
validateEnvironment();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(cookieParser());

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  createLogger(source).info(message);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      httpLogger.info(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      startupLogger.info(`serving on port ${port}`, { port });
      
      // Start the background scheduler for automated visibility checks
      startScheduler();
      
      // Start the background scan job processor for async scan processing
      startScanJobProcessor();

      // Start durable delivery for audit-funnel email notifications
      startEmailNotificationWorker();
      process.once("SIGTERM", stopEmailNotificationWorker);
      process.once("SIGINT", stopEmailNotificationWorker);
      
      // Register graceful shutdown handlers to clean up running jobs before termination
      registerShutdownHandlers();
    },
  );
})();
