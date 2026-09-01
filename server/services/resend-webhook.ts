import { createHmac, timingSafeEqual } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  EMAIL_DELIVERY_STATUS,
  RESEND_DELIVERY_EVENT_TYPES,
  emailDeliveryEvents,
  emailNotifications,
  type EmailDeliveryStatus,
  type ResendDeliveryEventType,
} from "@shared/schema";
import { db } from "../db";
import { createLogger } from "../utils/logger";

const logger = createLogger("resend-webhooks");
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const SUPPORTED_EVENT_TYPES = new Set<string>(
  Object.values(RESEND_DELIVERY_EVENT_TYPES),
);

export interface ResendWebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

export interface ResendDeliveryEventInput {
  providerEventId: string;
  providerMessageId: string;
  eventType: ResendDeliveryEventType;
  occurredAt: Date;
  data: Record<string, unknown>;
}

export interface ResendDeliveryEventRecordResult {
  created: boolean;
  notificationId: number | null;
}

export interface ResendDeliveryEventRecorder {
  record(
    event: ResendDeliveryEventInput,
  ): Promise<ResendDeliveryEventRecordResult>;
}

export class ResendWebhookVerificationError extends Error {}
export class ResendWebhookConfigurationError extends Error {}

function deliveryStatusForEvent(
  eventType: ResendDeliveryEventType,
): EmailDeliveryStatus {
  switch (eventType) {
    case RESEND_DELIVERY_EVENT_TYPES.DELIVERED:
      return EMAIL_DELIVERY_STATUS.DELIVERED;
    case RESEND_DELIVERY_EVENT_TYPES.DELAYED:
      return EMAIL_DELIVERY_STATUS.DELAYED;
    case RESEND_DELIVERY_EVENT_TYPES.BOUNCED:
      return EMAIL_DELIVERY_STATUS.BOUNCED;
    case RESEND_DELIVERY_EVENT_TYPES.COMPLAINED:
      return EMAIL_DELIVERY_STATUS.COMPLAINED;
  }
}

function eventPrioritySql() {
  return sql<number>`
    CASE ${emailDeliveryEvents.eventType}
      WHEN ${RESEND_DELIVERY_EVENT_TYPES.COMPLAINED} THEN 4
      WHEN ${RESEND_DELIVERY_EVENT_TYPES.BOUNCED} THEN 3
      WHEN ${RESEND_DELIVERY_EVENT_TYPES.DELIVERED} THEN 2
      WHEN ${RESEND_DELIVERY_EVENT_TYPES.DELAYED} THEN 1
      ELSE 0
    END
  `;
}

function statusCanAdvanceSql(occurredAt: Date, priority: number) {
  return sql`
    (
      ${emailNotifications.deliveryStatusAt} IS NULL
      OR ${priority} > (
        CASE ${emailNotifications.deliveryStatus}
          WHEN ${EMAIL_DELIVERY_STATUS.COMPLAINED} THEN 4
          WHEN ${EMAIL_DELIVERY_STATUS.BOUNCED} THEN 3
          WHEN ${EMAIL_DELIVERY_STATUS.DELIVERED} THEN 2
          WHEN ${EMAIL_DELIVERY_STATUS.DELAYED} THEN 1
          ELSE 0
        END
      )
      OR (
        ${priority} = (
          CASE ${emailNotifications.deliveryStatus}
            WHEN ${EMAIL_DELIVERY_STATUS.COMPLAINED} THEN 4
            WHEN ${EMAIL_DELIVERY_STATUS.BOUNCED} THEN 3
            WHEN ${EMAIL_DELIVERY_STATUS.DELIVERED} THEN 2
            WHEN ${EMAIL_DELIVERY_STATUS.DELAYED} THEN 1
            ELSE 0
          END
        )
        AND ${emailNotifications.deliveryStatusAt} <= ${occurredAt}
      )
    )
  `;
}

function decodeSigningSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith("whsec_")
    ? trimmed.slice("whsec_".length)
    : trimmed;
  const decoded = Buffer.from(encoded, "base64");
  if (!encoded || decoded.length === 0) {
    throw new ResendWebhookConfigurationError(
      "RESEND_WEBHOOK_SECRET is invalid",
    );
  }
  return decoded;
}

function signatureMatches(
  expected: Buffer,
  signatureHeader: string,
): boolean {
  return signatureHeader
    .split(/\s+/)
    .filter(Boolean)
    .some((versionedSignature) => {
      const [version, encodedSignature] = versionedSignature.split(",", 2);
      if (version !== "v1" || !encodedSignature) {
        return false;
      }

      const provided = Buffer.from(encodedSignature, "base64");
      return (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
      );
    });
}

function parseVerifiedEvent(
  rawBody: string,
): Omit<ResendDeliveryEventInput, "providerEventId"> | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new ResendWebhookVerificationError(
      "Webhook body is not valid JSON",
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new ResendWebhookVerificationError(
      "Webhook body must be an object",
    );
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.type !== "string" ||
    !SUPPORTED_EVENT_TYPES.has(record.type)
  ) {
    return null;
  }

  if (
    typeof record.created_at !== "string" ||
    !record.data ||
    typeof record.data !== "object" ||
    Array.isArray(record.data)
  ) {
    throw new ResendWebhookVerificationError(
      "Webhook delivery event is malformed",
    );
  }

  const occurredAt = new Date(record.created_at);
  const data = record.data as Record<string, unknown>;
  if (
    Number.isNaN(occurredAt.getTime()) ||
    typeof data.email_id !== "string" ||
    data.email_id.length === 0
  ) {
    throw new ResendWebhookVerificationError(
      "Webhook delivery event is malformed",
    );
  }

  return {
    providerMessageId: data.email_id,
    eventType: record.type as ResendDeliveryEventType,
    occurredAt,
    data,
  };
}

export function verifyResendWebhook(
  rawBody: string,
  headers: ResendWebhookHeaders,
  secret: string,
  now: () => Date = () => new Date(),
): Omit<ResendDeliveryEventInput, "providerEventId"> | null {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    throw new ResendWebhookVerificationError(
      "Required webhook signature headers are missing",
    );
  }

  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp)) {
    throw new ResendWebhookVerificationError(
      "Webhook timestamp is invalid",
    );
  }

  const currentTimestamp = Math.floor(now().getTime() / 1_000);
  if (
    Math.abs(currentTimestamp - timestamp) >
    SIGNATURE_TOLERANCE_SECONDS
  ) {
    throw new ResendWebhookVerificationError(
      "Webhook timestamp is outside the accepted window",
    );
  }

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", decodeSigningSecret(secret))
    .update(signedContent)
    .digest();
  if (!signatureMatches(expected, headers.signature)) {
    throw new ResendWebhookVerificationError(
      "Webhook signature is invalid",
    );
  }

  return parseVerifiedEvent(rawBody);
}

export class PostgresResendDeliveryEventRecorder
  implements ResendDeliveryEventRecorder
{
  async record(
    event: ResendDeliveryEventInput,
  ): Promise<ResendDeliveryEventRecordResult> {
    return db.transaction(async (tx) => {
      // The outbox writes this same provider ID immediately after Resend
      // accepts a send. A shared transaction lock makes either ordering safe:
      // the second transaction always observes and reconciles the first.
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${event.providerMessageId}, 0)
        )
      `);

      const [created] = await tx
        .insert(emailDeliveryEvents)
        .values({
          providerEventId: event.providerEventId,
          providerMessageId: event.providerMessageId,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          data: event.data,
        })
        .onConflictDoNothing({
          target: emailDeliveryEvents.providerEventId,
        })
        .returning({ id: emailDeliveryEvents.id });

      const [notification] = await tx
        .select({ id: emailNotifications.id })
        .from(emailNotifications)
        .where(
          eq(
            emailNotifications.providerMessageId,
            event.providerMessageId,
          ),
        )
        .limit(1);

      if (notification) {
        // Always reconcile from the full event history, including on duplicate
        // retries. This repairs a webhook that originally arrived before the
        // outbox had saved its provider message ID.
        const [latestEvent] = await tx
          .select({
            eventType: emailDeliveryEvents.eventType,
            occurredAt: emailDeliveryEvents.occurredAt,
            priority: eventPrioritySql(),
          })
          .from(emailDeliveryEvents)
          .where(
            eq(
              emailDeliveryEvents.providerMessageId,
              event.providerMessageId,
            ),
          )
          .orderBy(
            desc(eventPrioritySql()),
            desc(emailDeliveryEvents.occurredAt),
          )
          .limit(1);

        if (latestEvent) {
          await tx
            .update(emailNotifications)
            .set({
              deliveryStatus: deliveryStatusForEvent(
                latestEvent.eventType as ResendDeliveryEventType,
              ),
              deliveryStatusAt: latestEvent.occurredAt,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(emailNotifications.id, notification.id),
                statusCanAdvanceSql(
                  latestEvent.occurredAt,
                  latestEvent.priority,
                ),
              ),
            );
        }
      }

      return {
        created: Boolean(created),
        notificationId: notification?.id ?? null,
      };
    });
  }
}

const resendDeliveryEventRecorder =
  new PostgresResendDeliveryEventRecorder();

export interface ProcessResendWebhookDependencies {
  recorder?: ResendDeliveryEventRecorder;
  secret?: string;
  now?: () => Date;
}

export type ProcessResendWebhookResult =
  | { status: "recorded"; notificationId: number | null }
  | { status: "duplicate"; notificationId: number | null }
  | { status: "ignored"; notificationId: null };

export async function processResendWebhook(
  rawBody: string,
  headers: ResendWebhookHeaders,
  dependencies: ProcessResendWebhookDependencies = {},
): Promise<ProcessResendWebhookResult> {
  const secret =
    dependencies.secret ?? process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new ResendWebhookConfigurationError(
      "RESEND_WEBHOOK_SECRET is not configured",
    );
  }

  const verified = verifyResendWebhook(
    rawBody,
    headers,
    secret,
    dependencies.now,
  );
  if (!verified) {
    logger.info("Verified Resend webhook event ignored", {
      providerEventId: headers.id,
    });
    return { status: "ignored", notificationId: null };
  }

  const event: ResendDeliveryEventInput = {
    providerEventId: headers.id,
    ...verified,
  };
  const result = await (
    dependencies.recorder ?? resendDeliveryEventRecorder
  ).record(event);

  const context = {
    providerEventId: event.providerEventId,
    providerMessageId: event.providerMessageId,
    notificationId: result.notificationId ?? undefined,
    eventType: event.eventType,
    occurredAt: event.occurredAt.toISOString(),
  };

  if (!result.created) {
    logger.info("Duplicate Resend delivery event ignored", context);
    return {
      status: "duplicate",
      notificationId: result.notificationId,
    };
  }

  if (result.notificationId === null) {
    logger.warn("Resend delivery event did not match an outbox record", context);
  }

  if (event.eventType === RESEND_DELIVERY_EVENT_TYPES.DELIVERED) {
    logger.info("Email delivery confirmed", context);
  } else if (event.eventType === RESEND_DELIVERY_EVENT_TYPES.DELAYED) {
    logger.warn(
      "Email delivery remains delayed; manual follow-up may be required",
      context,
    );
  } else {
    logger.error(
      event.eventType === RESEND_DELIVERY_EVENT_TYPES.BOUNCED
        ? "Email delivery permanently failed"
        : "Email recipient reported the message as spam",
      context,
    );
  }

  return {
    status: "recorded",
    notificationId: result.notificationId,
  };
}