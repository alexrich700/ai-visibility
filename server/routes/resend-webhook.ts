import { Router, type Request, type Response } from "express";
import {
  processResendWebhook,
  ResendWebhookConfigurationError,
  ResendWebhookVerificationError,
  type ProcessResendWebhookResult,
  type ResendWebhookHeaders,
} from "../services/resend-webhook";
import { createLogger } from "../utils/logger";

const logger = createLogger("resend-webhook-route");
const router = Router();

export interface ResendWebhookHandlerDependencies {
  processFn?: (
    rawBody: string,
    headers: ResendWebhookHeaders,
  ) => Promise<ProcessResendWebhookResult>;
}

export async function handleResendWebhook(
  req: Request,
  res: Response,
  dependencies: ResendWebhookHandlerDependencies = {},
): Promise<void> {
  const rawBodyValue = (req as Request & { rawBody?: unknown }).rawBody;
  if (!Buffer.isBuffer(rawBodyValue)) {
    res.status(400).json({ message: "Invalid webhook body" });
    return;
  }

  const headers: ResendWebhookHeaders = {
    id: req.get("svix-id") ?? "",
    timestamp: req.get("svix-timestamp") ?? "",
    signature: req.get("svix-signature") ?? "",
  };

  try {
    const result = await (
      dependencies.processFn ?? processResendWebhook
    )(rawBodyValue.toString("utf8"), headers);
    res.status(200).json({ received: true, status: result.status });
  } catch (error) {
    if (error instanceof ResendWebhookVerificationError) {
      logger.warn("Rejected invalid Resend webhook", {
        providerEventId: headers.id || undefined,
      });
      res.status(400).json({ message: "Invalid webhook signature" });
      return;
    }

    if (error instanceof ResendWebhookConfigurationError) {
      logger.error("Resend webhook is not configured");
      res.status(503).json({ message: "Webhook unavailable" });
      return;
    }

    logger.error("Resend webhook processing failed", {
      providerEventId: headers.id || undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ message: "Webhook processing failed" });
  }
}

router.post("/", (req, res) => {
  void handleResendWebhook(req, res);
});

export default router;