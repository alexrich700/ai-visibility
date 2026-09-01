ALTER TABLE "email_notifications"
  ADD COLUMN IF NOT EXISTS "delivery_status" text;

ALTER TABLE "email_notifications"
  ADD COLUMN IF NOT EXISTS "delivery_status_at" timestamp;

CREATE INDEX IF NOT EXISTS "email_notifications_provider_message_id_idx"
  ON "email_notifications" USING btree ("provider_message_id");

CREATE TABLE IF NOT EXISTS "email_delivery_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider_event_id" text NOT NULL,
  "provider_message_id" text NOT NULL,
  "event_type" text NOT NULL,
  "occurred_at" timestamp NOT NULL,
  "data" jsonb NOT NULL,
  "received_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_delivery_events_provider_event_id_idx"
  ON "email_delivery_events" USING btree ("provider_event_id");

CREATE INDEX IF NOT EXISTS "email_delivery_events_provider_message_id_idx"
  ON "email_delivery_events" USING btree ("provider_message_id");

CREATE INDEX IF NOT EXISTS "email_delivery_events_type_occurred_idx"
  ON "email_delivery_events" USING btree ("event_type", "occurred_at");