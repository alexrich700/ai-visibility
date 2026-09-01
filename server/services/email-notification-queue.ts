import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  EMAIL_DELIVERY_STATUS,
  EMAIL_NOTIFICATION_STATUS,
  EMAIL_NOTIFICATION_TYPES,
  RESEND_DELIVERY_EVENT_TYPES,
  emailDeliveryEvents,
  emailNotifications,
  leads,
  type DbLead,
  type EmailNotification,
  type EmailNotificationType,
  type ResendDeliveryEventType,
  type InsertLead,
} from "@shared/schema";
import { db, pool } from "../db";
import {
  sendAuditNotification,
  sendSoftLeadNotification,
  type AuditNotificationData,
  type EmailSendResult,
  type SoftLeadNotificationData,
} from "../email";
import { createLogger } from "../utils/logger";

const logger = createLogger("email-notifications");

const DEFAULT_MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_MINUTES = 5;
const LEASE_HEARTBEAT_MS = 15_000;
const POLL_INTERVAL_MS = 5_000;
const MAX_JOBS_PER_POLL = 10;
const MAX_BACKOFF_MS = 15 * 60 * 1_000;

function deliveryStatusForEvent(
  eventType: ResendDeliveryEventType,
): string {
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

export interface InitialAuditNotificationPayload extends SoftLeadNotificationData {
  requestId: string;
}

export interface FullReportUnlockNotificationPayload extends AuditNotificationData {
  requestId: string;
  leadId: number;
}

export interface CreateLeadWithUnlockNotificationInput {
  requestId: string;
  lead: Omit<InsertLead, "submissionId">;
  notification: Omit<
    FullReportUnlockNotificationPayload,
    "requestId" | "leadId"
  >;
}

export type AuditEmailNotificationPayload =
  | InitialAuditNotificationPayload
  | FullReportUnlockNotificationPayload;

export interface EnqueueNotificationInput {
  type: EmailNotificationType;
  dedupeKey: string;
  payload: AuditEmailNotificationPayload;
  maxAttempts?: number;
  nextAttemptAt?: Date;
}

export interface EnqueueNotificationResult {
  notification: EmailNotification;
  created: boolean;
}

export interface EmailNotificationRepository {
  enqueue(input: EnqueueNotificationInput): Promise<EnqueueNotificationResult>;
  claimNext(): Promise<EmailNotification | null>;
  renewLease(id: number, leaseToken: string): Promise<boolean>;
  markSent(
    id: number,
    leaseToken: string,
    result: EmailSendResult,
  ): Promise<boolean>;
  markFailed(
    id: number,
    leaseToken: string,
    errorMessage: string,
    providerStatus: number | null,
    finalFailure: boolean,
    nextAttemptAt: Date,
  ): Promise<boolean>;
}

function mapNotificationRow(row: any): EmailNotification {
  return {
    id: row.id,
    type: row.type,
    dedupeKey: row.dedupe_key ?? row.dedupeKey,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts ?? row.maxAttempts,
    nextAttemptAt: row.next_attempt_at ?? row.nextAttemptAt,
    lockedAt: row.locked_at ?? row.lockedAt,
    leaseToken: row.lease_token ?? row.leaseToken,
    lastError: row.last_error ?? row.lastError,
    providerStatus: row.provider_status ?? row.providerStatus,
    providerMessageId: row.provider_message_id ?? row.providerMessageId,
    deliveryStatus: row.delivery_status ?? row.deliveryStatus,
    deliveryStatusAt: row.delivery_status_at ?? row.deliveryStatusAt,
    sentAt: row.sent_at ?? row.sentAt,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

export class PostgresEmailNotificationRepository implements EmailNotificationRepository {
  async enqueue(input: EnqueueNotificationInput): Promise<EnqueueNotificationResult> {
    const [created] = await db
      .insert(emailNotifications)
      .values({
        type: input.type,
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        nextAttemptAt: input.nextAttemptAt,
      })
      .onConflictDoNothing({ target: emailNotifications.dedupeKey })
      .returning();

    if (created) {
      return { notification: created, created: true };
    }

    const [existing] = await db
      .select()
      .from(emailNotifications)
      .where(eq(emailNotifications.dedupeKey, input.dedupeKey))
      .limit(1);

    if (!existing) {
      throw new Error("Notification deduplication lookup failed");
    }

    return { notification: existing, created: false };
  }

  async claimNext(): Promise<EmailNotification | null> {
    const client = await pool.connect();
    const leaseToken = randomUUID();
    try {
      await client.query("BEGIN");

      // A worker that died after taking its final allowed attempt must not
      // leave a row stuck in "sending" forever.
      await client.query(`
        UPDATE email_notifications
        SET status = 'failed',
            locked_at = NULL,
            lease_token = NULL,
            last_error = COALESCE(last_error, 'Worker lease expired after final attempt'),
            updated_at = NOW()
        WHERE status = 'sending'
          AND attempts >= max_attempts
          AND locked_at < NOW() - INTERVAL '${LOCK_TIMEOUT_MINUTES} minutes'
      `);

      const result = await client.query(`
        WITH candidate AS (
          SELECT id
          FROM email_notifications
          WHERE attempts < max_attempts
            AND (
              (status = 'pending' AND next_attempt_at <= NOW())
              OR (
                status = 'sending'
                AND locked_at < NOW() - INTERVAL '${LOCK_TIMEOUT_MINUTES} minutes'
              )
            )
          ORDER BY next_attempt_at ASC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE email_notifications AS notifications
        SET status = 'sending',
            attempts = notifications.attempts + 1,
            locked_at = NOW(),
            lease_token = $1,
            updated_at = NOW()
        FROM candidate
        WHERE notifications.id = candidate.id
        RETURNING notifications.*
      `, [leaseToken]);
      await client.query("COMMIT");
      return result.rows[0] ? mapNotificationRow(result.rows[0]) : null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markSent(
    id: number,
    leaseToken: string,
    result: EmailSendResult,
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      // Serialize this commit with delivery-webhook processing for the same
      // provider message. Without a shared lock, both transactions could miss
      // the other's uncommitted row and leave delivery state unreconciled.
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${result.providerMessageId}, 0)
        )
      `);

      const rows = await tx
        .update(emailNotifications)
        .set({
          status: EMAIL_NOTIFICATION_STATUS.SENT,
          providerStatus: result.statusCode,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          lockedAt: null,
          leaseToken: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(emailNotifications.id, id),
          eq(emailNotifications.status, EMAIL_NOTIFICATION_STATUS.SENDING),
          eq(emailNotifications.leaseToken, leaseToken),
        ))
        .returning({ id: emailNotifications.id });
      if (rows.length !== 1) {
        return false;
      }

      // A delivery webhook can beat this provider-message-id write. Reconcile
      // any already-persisted event in the same transaction so that race does
      // not leave a bounced or delayed message looking merely "sent".
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
            result.providerMessageId,
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
              eq(emailNotifications.id, id),
              statusCanAdvanceSql(
                latestEvent.occurredAt,
                latestEvent.priority,
              ),
            ),
          );
      }

      return true;
    });
  }

  async renewLease(id: number, leaseToken: string): Promise<boolean> {
    const rows = await db
      .update(emailNotifications)
      .set({
        lockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(emailNotifications.id, id),
        eq(emailNotifications.status, EMAIL_NOTIFICATION_STATUS.SENDING),
        eq(emailNotifications.leaseToken, leaseToken),
      ))
      .returning({ id: emailNotifications.id });
    return rows.length === 1;
  }

  async markFailed(
    id: number,
    leaseToken: string,
    errorMessage: string,
    providerStatus: number | null,
    finalFailure: boolean,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    const rows = await db
      .update(emailNotifications)
      .set({
        status: finalFailure
          ? EMAIL_NOTIFICATION_STATUS.FAILED
          : EMAIL_NOTIFICATION_STATUS.PENDING,
        nextAttemptAt,
        lockedAt: null,
        leaseToken: null,
        lastError: errorMessage,
        providerStatus,
        updatedAt: new Date(),
      })
      .where(and(
        eq(emailNotifications.id, id),
        eq(emailNotifications.status, EMAIL_NOTIFICATION_STATUS.SENDING),
        eq(emailNotifications.leaseToken, leaseToken),
      ))
      .returning({ id: emailNotifications.id });
    return rows.length === 1;
  }
}

export type EmailNotificationSender = (
  notification: EmailNotification,
) => Promise<EmailSendResult>;

function providerStatusFromError(error: unknown): number | null {
  const rawStatus =
    (error as any)?.code ??
    (error as any)?.response?.statusCode ??
    (error as any)?.response?.status;
  const status = Number(rawStatus);
  return Number.isFinite(status) ? status : null;
}

function isRetryableError(error: unknown): boolean {
  const status = providerStatusFromError(error);
  if (status === null) {
    return true;
  }
  if (status === 408 || status === 429) {
    return true;
  }
  return status >= 500;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 500);
}

function nextRetryAt(attempt: number, now: Date): Date {
  const delayMs = Math.min(5_000 * Math.pow(2, Math.max(0, attempt - 1)), MAX_BACKOFF_MS);
  return new Date(now.getTime() + delayMs);
}

export async function sendQueuedEmailNotification(
  notification: EmailNotification,
): Promise<EmailSendResult> {
  if (notification.type === EMAIL_NOTIFICATION_TYPES.INITIAL_AUDIT_REQUEST) {
    return sendSoftLeadNotification(
      {
        ...(notification.payload as InitialAuditNotificationPayload),
        notificationKey: notification.dedupeKey,
      },
    );
  }

  if (notification.type === EMAIL_NOTIFICATION_TYPES.FULL_REPORT_UNLOCK) {
    return sendAuditNotification(
      {
        ...(notification.payload as FullReportUnlockNotificationPayload),
        notificationKey: notification.dedupeKey,
      },
    );
  }

  const error = new Error(`Unsupported notification type: ${notification.type}`);
  (error as any).code = 400;
  throw error;
}

export class EmailNotificationWorker {
  private processing = false;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: EmailNotificationRepository,
    private readonly sender: EmailNotificationSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processOne(): Promise<boolean> {
    const notification = await this.repository.claimNext();
    if (!notification) {
      return false;
    }

    const leaseToken = notification.leaseToken;
    if (!leaseToken) {
      logger.error("Claimed notification has no lease token", {
        notificationId: notification.id,
        type: notification.type,
      });
      return true;
    }

    const ownsLease = await this.repository.renewLease(
      notification.id,
      leaseToken,
    );
    if (!ownsLease) {
      logger.warn("Notification send skipped after lease ownership changed", {
        notificationId: notification.id,
        type: notification.type,
      });
      return true;
    }

    let renewalInFlight = false;
    const leaseHeartbeat = setInterval(() => {
      if (renewalInFlight) {
        return;
      }
      renewalInFlight = true;
      void this.repository
        .renewLease(notification.id, leaseToken)
        .then((renewed) => {
          if (!renewed) {
            logger.warn("Notification lease heartbeat lost ownership", {
              notificationId: notification.id,
              type: notification.type,
            });
          }
        })
        .catch((error) => {
          logger.warn("Notification lease heartbeat failed", {
            notificationId: notification.id,
            type: notification.type,
            error: safeErrorMessage(error),
          });
        })
        .finally(() => {
          renewalInFlight = false;
        });
    }, LEASE_HEARTBEAT_MS);

    let result: EmailSendResult;
    try {
      result = await this.sender(notification);
    } catch (error) {
      clearInterval(leaseHeartbeat);
      const message = safeErrorMessage(error);
      const providerStatus = providerStatusFromError(error);
      const retryable = isRetryableError(error);
      const finalFailure =
        !retryable || notification.attempts >= notification.maxAttempts;
      const retryAt = finalFailure
        ? this.now()
        : nextRetryAt(notification.attempts, this.now());

      const updated = await this.repository.markFailed(
        notification.id,
        leaseToken,
        message,
        providerStatus,
        finalFailure,
        retryAt,
      );

      const context = {
        notificationId: notification.id,
        type: notification.type,
        attempt: notification.attempts,
        maxAttempts: notification.maxAttempts,
        providerStatus: providerStatus ?? undefined,
        retryAt: finalFailure ? undefined : retryAt.toISOString(),
        error: message,
      };
      if (!updated) {
        logger.warn("Notification failure ignored after lease ownership changed", context);
      } else if (finalFailure) {
        logger.error("Notification permanently failed", context);
      } else {
        logger.warn("Notification send failed; retry scheduled", context);
      }
      return true;
    }
    clearInterval(leaseHeartbeat);

    const updated = await this.repository.markSent(
      notification.id,
      leaseToken,
      result,
    );
    if (updated) {
      logger.info("Notification accepted by email provider", {
        notificationId: notification.id,
        type: notification.type,
        attempt: notification.attempts,
        provider: result.provider,
        providerStatus: result.statusCode,
        providerMessageId: result.providerMessageId,
      });
    } else {
      logger.warn("Email provider accepted notification after lease ownership changed", {
        notificationId: notification.id,
        type: notification.type,
        attempt: notification.attempts,
        provider: result.provider,
        providerStatus: result.statusCode,
        providerMessageId: result.providerMessageId,
      });
    }

    return true;
  }

  async poll(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      for (let processed = 0; processed < MAX_JOBS_PER_POLL; processed += 1) {
        const didProcess = await this.processOne();
        if (!didProcess) {
          break;
        }
      }
    } catch (error) {
      logger.error("Notification queue polling failed", {
        error: safeErrorMessage(error),
      });
    } finally {
      this.processing = false;
    }
  }

  start(): void {
    if (this.interval) {
      return;
    }
    logger.info("Starting email notification worker");
    void this.poll();
    this.interval = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (!this.interval) {
      return;
    }
    clearInterval(this.interval);
    this.interval = null;
    logger.info("Stopped email notification worker");
  }
}

export const emailNotificationRepository =
  new PostgresEmailNotificationRepository();

export async function createLeadWithUnlockNotification(
  input: CreateLeadWithUnlockNotificationInput,
): Promise<DbLead> {
  return db.transaction(async (tx) => {
    const [createdLead] = await tx
      .insert(leads)
      .values({
        ...input.lead,
        submissionId: input.requestId,
      })
      .onConflictDoNothing({ target: leads.submissionId })
      .returning();

    const lead = createdLead ?? (
      await tx
        .select()
        .from(leads)
        .where(eq(leads.submissionId, input.requestId))
        .limit(1)
    )[0];

    if (!lead) {
      throw new Error("Lead idempotency lookup failed");
    }

    const payload: FullReportUnlockNotificationPayload = {
      ...input.notification,
      requestId: input.requestId,
      leadId: lead.id,
    };

    await tx
      .insert(emailNotifications)
      .values({
        type: EMAIL_NOTIFICATION_TYPES.FULL_REPORT_UNLOCK,
        dedupeKey: `full-report-unlock:lead:${lead.id}`,
        payload,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      })
      .onConflictDoNothing({ target: emailNotifications.dedupeKey });

    return lead;
  });
}

const emailNotificationWorker = new EmailNotificationWorker(
  emailNotificationRepository,
  sendQueuedEmailNotification,
);

export async function enqueueInitialAuditNotification(
  payload: InitialAuditNotificationPayload,
): Promise<EnqueueNotificationResult> {
  const result = await emailNotificationRepository.enqueue({
    type: EMAIL_NOTIFICATION_TYPES.INITIAL_AUDIT_REQUEST,
    dedupeKey: `initial-audit:${payload.requestId}`,
    payload,
  });
  logger.info(result.created ? "Initial audit notification queued" : "Duplicate initial audit notification ignored", {
    notificationId: result.notification.id,
  });
  return result;
}

export async function enqueueFullReportUnlockNotification(
  payload: FullReportUnlockNotificationPayload,
): Promise<EnqueueNotificationResult> {
  const result = await emailNotificationRepository.enqueue({
    type: EMAIL_NOTIFICATION_TYPES.FULL_REPORT_UNLOCK,
    dedupeKey: `full-report-unlock:${payload.requestId}`,
    payload,
  });
  logger.info(result.created ? "Full-report unlock notification queued" : "Duplicate full-report unlock notification ignored", {
    notificationId: result.notification.id,
    leadId: payload.leadId,
  });
  return result;
}

export function startEmailNotificationWorker(): void {
  emailNotificationWorker.start();
}

export function stopEmailNotificationWorker(): void {
  emailNotificationWorker.stop();
}