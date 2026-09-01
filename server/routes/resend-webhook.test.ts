import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";

import { handleResendWebhook } from "./resend-webhook";
import {
  PostgresEmailNotificationRepository,
} from "../services/email-notification-queue";
import {
  PostgresResendDeliveryEventRecorder,
  processResendWebhook,
  type ResendDeliveryEventInput,
  type ResendDeliveryEventRecorder,
} from "../services/resend-webhook";
import {
  EMAIL_DELIVERY_STATUS,
  EMAIL_NOTIFICATION_STATUS,
  EMAIL_NOTIFICATION_TYPES,
  RESEND_DELIVERY_EVENT_TYPES,
} from "@shared/schema";

const FIXED_NOW = new Date("2026-08-21T12:00:00.000Z");
const WEBHOOK_SECRET = `whsec_${Buffer.from(
  "resend-webhook-test-secret",
).toString("base64")}`;

function signatureFor(
  rawBody: string,
  id: string,
  timestamp: string,
): string {
  const key = Buffer.from(WEBHOOK_SECRET.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return `v1,${signature}`;
}

function makeRequest(
  rawBody: string,
  id: string,
  signature?: string,
) {
  const timestamp = String(Math.floor(FIXED_NOW.getTime() / 1_000));
  const headers: Record<string, string> = {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature":
      signature ?? signatureFor(rawBody, id, timestamp),
  };

  return {
    rawBody: Buffer.from(rawBody),
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function makeRecorder(): ResendDeliveryEventRecorder & {
  events: ResendDeliveryEventInput[];
} {
  const events: ResendDeliveryEventInput[] = [];
  const eventIds = new Set<string>();
  return {
    events,
    async record(event) {
      const created = !eventIds.has(event.providerEventId);
      if (created) {
        eventIds.add(event.providerEventId);
        events.push(event);
      }
      return { created, notificationId: 42 };
    },
  };
}

function makeRawBody(type: string, emailId = "resend-email-123"): string {
  return JSON.stringify({
    type,
    created_at: FIXED_NOW.toISOString(),
    data: {
      email_id: emailId,
      to: ["lead@example.com"],
      subject: "Your audit report",
    },
  });
}

function makeProcessor(recorder: ResendDeliveryEventRecorder) {
  return (rawBody: string, headers: any) =>
    processResendWebhook(rawBody, headers, {
      recorder,
      secret: WEBHOOK_SECRET,
      now: () => FIXED_NOW,
    });
}

test("valid signed delivery events are persisted against the Resend email id", async () => {
  const recorder = makeRecorder();

  for (const [index, eventType] of Object.values(
    RESEND_DELIVERY_EVENT_TYPES,
  ).entries()) {
    const rawBody = makeRawBody(eventType, `resend-email-${index}`);
    const req = makeRequest(rawBody, `event-valid-${index}`);
    const res = makeResponse();

    await handleResendWebhook(req as any, res as any, {
      processFn: makeProcessor(recorder),
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { received: true, status: "recorded" });
  }

  assert.equal(recorder.events.length, 4);
  assert.deepEqual(
    recorder.events.map((event) => event.eventType),
    Object.values(RESEND_DELIVERY_EVENT_TYPES),
  );
  assert.deepEqual(
    recorder.events.map((event) => event.providerMessageId),
    [
      "resend-email-0",
      "resend-email-1",
      "resend-email-2",
      "resend-email-3",
    ],
  );
});

test("duplicate signed events return success without a second persisted event", async () => {
  const recorder = makeRecorder();
  const rawBody = makeRawBody(RESEND_DELIVERY_EVENT_TYPES.DELAYED);
  const eventId = "event-duplicate-1";

  const firstResponse = makeResponse();
  await handleResendWebhook(
    makeRequest(rawBody, eventId) as any,
    firstResponse as any,
    { processFn: makeProcessor(recorder) },
  );

  const duplicateResponse = makeResponse();
  await handleResendWebhook(
    makeRequest(rawBody, eventId) as any,
    duplicateResponse as any,
    { processFn: makeProcessor(recorder) },
  );

  assert.equal(firstResponse.statusCode, 200);
  assert.deepEqual(firstResponse.body, {
    received: true,
    status: "recorded",
  });
  assert.equal(duplicateResponse.statusCode, 200);
  assert.deepEqual(duplicateResponse.body, {
    received: true,
    status: "duplicate",
  });
  assert.equal(recorder.events.length, 1);
});

test("invalid signatures are rejected before event persistence", async () => {
  const recorder = makeRecorder();
  const rawBody = makeRawBody(RESEND_DELIVERY_EVENT_TYPES.BOUNCED);
  const req = makeRequest(rawBody, "event-invalid-1", "v1,invalid");
  const res = makeResponse();

  await handleResendWebhook(req as any, res as any, {
    processFn: makeProcessor(recorder),
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Invalid webhook signature" });
  assert.equal(recorder.events.length, 0);
});

test("Postgres recorder deduplicates events and updates the matching outbox delivery state", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set; skipping Resend webhook integration test");
    return;
  }

  const { db, pool } = await import("../db");
  const { emailDeliveryEvents, emailNotifications } = await import(
    "@shared/schema"
  );
  const { eq } = await import("drizzle-orm");
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const providerMessageId = `resend-db-${unique}`;
  const providerEventId = `event-db-${unique}`;
  let notificationId: number | null = null;

  try {
    const [notification] = await db
      .insert(emailNotifications)
      .values({
        type: EMAIL_NOTIFICATION_TYPES.INITIAL_AUDIT_REQUEST,
        dedupeKey: `test-webhook:${unique}`,
        payload: { requestId: unique },
        status: EMAIL_NOTIFICATION_STATUS.SENT,
        providerStatus: 200,
        providerMessageId,
        sentAt: FIXED_NOW,
      })
      .returning({ id: emailNotifications.id });
    notificationId = notification.id;

    const recorder = new PostgresResendDeliveryEventRecorder();
    const event: ResendDeliveryEventInput = {
      providerEventId,
      providerMessageId,
      eventType: RESEND_DELIVERY_EVENT_TYPES.BOUNCED,
      occurredAt: FIXED_NOW,
      data: { email_id: providerMessageId },
    };

    const first = await recorder.record(event);
    const duplicate = await recorder.record(event);

    assert.deepEqual(first, { created: true, notificationId });
    assert.deepEqual(duplicate, { created: false, notificationId });

    const persistedEvents = await db
      .select()
      .from(emailDeliveryEvents)
      .where(eq(emailDeliveryEvents.providerEventId, providerEventId));
    assert.equal(persistedEvents.length, 1);
    assert.equal(persistedEvents[0].providerMessageId, providerMessageId);
    assert.equal(
      persistedEvents[0].eventType,
      RESEND_DELIVERY_EVENT_TYPES.BOUNCED,
    );

    const [updatedNotification] = await db
      .select({
        deliveryStatus: emailNotifications.deliveryStatus,
        deliveryStatusAt: emailNotifications.deliveryStatusAt,
      })
      .from(emailNotifications)
      .where(eq(emailNotifications.id, notificationId));
    assert.equal(
      updatedNotification.deliveryStatus,
      EMAIL_DELIVERY_STATUS.BOUNCED,
    );
    assert.equal(
      updatedNotification.deliveryStatusAt?.toISOString(),
      FIXED_NOW.toISOString(),
    );
  } finally {
    await db
      .delete(emailDeliveryEvents)
      .where(eq(emailDeliveryEvents.providerEventId, providerEventId));
    if (notificationId !== null) {
      await db
        .delete(emailNotifications)
        .where(eq(emailNotifications.id, notificationId));
    }
  }
});

test("outbox send completion reconciles a delivery event that arrived before the provider id was saved", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set; skipping send/webhook race integration test");
    return;
  }

  const { db, pool } = await import("../db");
  const { emailDeliveryEvents, emailNotifications } = await import(
    "@shared/schema"
  );
  const { eq } = await import("drizzle-orm");
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const providerMessageId = `resend-race-${unique}`;
  const providerEventId = `event-race-${unique}`;
  const leaseToken = `lease-${unique}`;
  let notificationId: number | null = null;

  try {
    const [notification] = await db
      .insert(emailNotifications)
      .values({
        type: EMAIL_NOTIFICATION_TYPES.FULL_REPORT_UNLOCK,
        dedupeKey: `test-webhook-race:${unique}`,
        payload: { requestId: unique },
        status: EMAIL_NOTIFICATION_STATUS.SENDING,
        attempts: 1,
        leaseToken,
        lockedAt: FIXED_NOW,
      })
      .returning({ id: emailNotifications.id });
    notificationId = notification.id;

    const deliveryRecorder = new PostgresResendDeliveryEventRecorder();
    const event: ResendDeliveryEventInput = {
      providerEventId,
      providerMessageId,
      eventType: RESEND_DELIVERY_EVENT_TYPES.BOUNCED,
      occurredAt: FIXED_NOW,
      data: { email_id: providerMessageId },
    };

    const outboxRepository = new PostgresEmailNotificationRepository();
    const [webhookResult, markedSent] = await Promise.all([
      deliveryRecorder.record(event),
      outboxRepository.markSent(notificationId, leaseToken, {
        provider: "resend",
        statusCode: 200,
        providerMessageId,
      }),
    ]);
    assert.equal(webhookResult.created, true);
    assert.equal(
      webhookResult.notificationId === null ||
        webhookResult.notificationId === notificationId,
      true,
    );
    assert.equal(markedSent, true);

    const [reconciled] = await db
      .select({
        status: emailNotifications.status,
        deliveryStatus: emailNotifications.deliveryStatus,
        deliveryStatusAt: emailNotifications.deliveryStatusAt,
      })
      .from(emailNotifications)
      .where(eq(emailNotifications.id, notificationId));
    assert.equal(reconciled.status, EMAIL_NOTIFICATION_STATUS.SENT);
    assert.equal(
      reconciled.deliveryStatus,
      EMAIL_DELIVERY_STATUS.BOUNCED,
    );
    assert.equal(
      reconciled.deliveryStatusAt?.toISOString(),
      FIXED_NOW.toISOString(),
    );

    const duplicate = await deliveryRecorder.record(event);
    assert.deepEqual(duplicate, { created: false, notificationId });
  } finally {
    await db
      .delete(emailDeliveryEvents)
      .where(eq(emailDeliveryEvents.providerEventId, providerEventId));
    if (notificationId !== null) {
      await db
        .delete(emailNotifications)
        .where(eq(emailNotifications.id, notificationId));
    }
  }
});

test("older and equal-time lower-priority events cannot overwrite a final delivery failure", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set; skipping event ordering integration test");
    return;
  }

  const { db, pool } = await import("../db");
  const { emailDeliveryEvents, emailNotifications } = await import(
    "@shared/schema"
  );
  const { eq, like } = await import("drizzle-orm");
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const providerMessageId = `resend-order-${unique}`;
  const eventIdPrefix = `event-order-${unique}`;
  let notificationId: number | null = null;

  try {
    const [notification] = await db
      .insert(emailNotifications)
      .values({
        type: EMAIL_NOTIFICATION_TYPES.INITIAL_AUDIT_REQUEST,
        dedupeKey: `test-webhook-order:${unique}`,
        payload: { requestId: unique },
        status: EMAIL_NOTIFICATION_STATUS.SENT,
        providerStatus: 200,
        providerMessageId,
        sentAt: FIXED_NOW,
      })
      .returning({ id: emailNotifications.id });
    notificationId = notification.id;

    const recorder = new PostgresResendDeliveryEventRecorder();
    await recorder.record({
      providerEventId: `${eventIdPrefix}-bounce`,
      providerMessageId,
      eventType: RESEND_DELIVERY_EVENT_TYPES.BOUNCED,
      occurredAt: FIXED_NOW,
      data: { email_id: providerMessageId },
    });
    await recorder.record({
      providerEventId: `${eventIdPrefix}-delivered`,
      providerMessageId,
      eventType: RESEND_DELIVERY_EVENT_TYPES.DELIVERED,
      occurredAt: FIXED_NOW,
      data: { email_id: providerMessageId },
    });
    await recorder.record({
      providerEventId: `${eventIdPrefix}-delayed`,
      providerMessageId,
      eventType: RESEND_DELIVERY_EVENT_TYPES.DELAYED,
      occurredAt: new Date(FIXED_NOW.getTime() + 60_000),
      data: { email_id: providerMessageId },
    });

    const [updatedNotification] = await db
      .select({
        deliveryStatus: emailNotifications.deliveryStatus,
        deliveryStatusAt: emailNotifications.deliveryStatusAt,
      })
      .from(emailNotifications)
      .where(eq(emailNotifications.id, notificationId));
    assert.equal(
      updatedNotification.deliveryStatus,
      EMAIL_DELIVERY_STATUS.BOUNCED,
    );
    assert.equal(
      updatedNotification.deliveryStatusAt?.toISOString(),
      FIXED_NOW.toISOString(),
    );
  } finally {
    await db
      .delete(emailDeliveryEvents)
      .where(like(emailDeliveryEvents.providerEventId, `${eventIdPrefix}%`));
    if (notificationId !== null) {
      await db
        .delete(emailNotifications)
        .where(eq(emailNotifications.id, notificationId));
    }
    await pool.end();
  }
});