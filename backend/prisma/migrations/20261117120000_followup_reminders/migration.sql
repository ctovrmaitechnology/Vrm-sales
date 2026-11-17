ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "followup_time" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "followup_priority" TEXT;

CREATE TABLE IF NOT EXISTS "followup_reminders" (
  "id" SERIAL PRIMARY KEY,
  "dedupe_key" TEXT NOT NULL,
  "reminder_type" TEXT NOT NULL,
  "lead_id" INTEGER,
  "user_id" INTEGER,
  "recipient_email" TEXT,
  "followup_date" DATE,
  "followup_time" TEXT,
  "priority" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "scheduled_for" TIMESTAMPTZ(6),
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "followup_reminders_dedupe_key_key" ON "followup_reminders"("dedupe_key");
CREATE INDEX IF NOT EXISTS "followup_reminders_status_idx" ON "followup_reminders"("status");
CREATE INDEX IF NOT EXISTS "followup_reminders_lead_id_idx" ON "followup_reminders"("lead_id");

GRANT ALL ON TABLE "followup_reminders" TO vrm_sales_user;
GRANT USAGE, SELECT ON SEQUENCE "followup_reminders_id_seq" TO vrm_sales_user;