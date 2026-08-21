ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "submission_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "leads_submission_id_idx"
  ON "leads" USING btree ("submission_id");

CREATE TABLE IF NOT EXISTS "email_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "locked_at" timestamp,
  "lease_token" text,
  "last_error" text,
  "provider_status" integer,
  "provider_message_id" text,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_notifications_dedupe_key_idx"
  ON "email_notifications" USING btree ("dedupe_key");

CREATE INDEX IF NOT EXISTS "email_notifications_due_idx"
  ON "email_notifications" USING btree ("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "email_notifications_locked_idx"
  ON "email_notifications" USING btree ("status", "locked_at");