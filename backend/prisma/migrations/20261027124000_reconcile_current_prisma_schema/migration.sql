CREATE TABLE IF NOT EXISTS "automation_logs" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER,
    "email" TEXT,
    "level" TEXT,
    "action" TEXT,
    "message" TEXT,
    "source" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "lead_status" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER,
    "email" TEXT,
    "channel" TEXT,
    "action" TEXT,
    "status" TEXT,
    "clicked" BOOLEAN DEFAULT false,
    "click_count" INTEGER DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    CONSTRAINT "lead_status_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "leads" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "whatsapp_number" TEXT,
    "facebook_url" TEXT,
    "linkedin_url" TEXT,
    "company_name" TEXT,
    "phone_number" TEXT,
    "email" TEXT,
    "role" TEXT,
    "source" TEXT,
    "status" TEXT DEFAULT 'new',
    "note" TEXT,
    "email_status" TEXT NOT NULL DEFAULT 'not sent',
    "whatsapp_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "address" TEXT,
    "user_id" INTEGER,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailLeads" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "role" TEXT,
    "source" TEXT,
    "project" TEXT,
    "status" TEXT,
    "follow_up_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "demo_click_count" INTEGER NOT NULL DEFAULT 0,
    "video_click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    CONSTRAINT "EmailLeads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsAppLeads" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "whatsapp_number" TEXT,
    "email" TEXT,
    "company" TEXT,
    "role" TEXT,
    "source" TEXT,
    "project" TEXT,
    "status" TEXT,
    "whatsapp_status" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "demo_click_count" INTEGER NOT NULL DEFAULT 0,
    "video_click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    CONSTRAINT "WhatsAppLeads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "company" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "whatsapp_number" TEXT,
    "facebook_url" TEXT,
    "linkedin_url" TEXT,
    "company_name" TEXT,
    "phone_number" TEXT,
    "email" TEXT,
    "role" TEXT,
    "source" TEXT,
    "status" TEXT DEFAULT 'new',
    "note" TEXT,
    "email_status" TEXT NOT NULL DEFAULT 'not sent',
    "whatsapp_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "address" TEXT,
    "user_id" INTEGER,
    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL NOT NULL,
    "employee_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_history" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "lead_id" INTEGER,
    "company_id" INTEGER,
    "recipient_email" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'initial',
    "status" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    CONSTRAINT "email_history_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'leads' AND column_name = 'notes'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'leads' AND column_name = 'note'
    ) THEN
        ALTER TABLE "leads" RENAME COLUMN "notes" TO "note";
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'leads' AND column_name = 'notes'
    ) THEN
        EXECUTE 'UPDATE "leads" SET "note" = COALESCE("note", "notes")';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'company' AND column_name = 'name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'company' AND column_name = 'full_name'
    ) THEN
        ALTER TABLE "company" RENAME COLUMN "name" TO "full_name";
    END IF;
END $$;

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "leads" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "full_name" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "whatsapp_number" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "facebook_url" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "linkedin_url" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "company_name" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "phone_number" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "role" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'new';
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "email_status" TEXT NOT NULL DEFAULT 'not sent';
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "whatsapp_read" BOOLEAN DEFAULT false;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6);
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "user_id" INTEGER;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'company' AND column_name = 'name'
    ) THEN
        EXECUTE 'UPDATE "company" SET "full_name" = COALESCE("full_name", "name", "company_name", ''Unknown'')';
    ELSE
        UPDATE "company" SET "full_name" = COALESCE("full_name", "company_name", 'Unknown');
    END IF;
END $$;

ALTER TABLE "company" ALTER COLUMN "full_name" SET NOT NULL;
ALTER TABLE "company" ALTER COLUMN "company_name" DROP NOT NULL;
ALTER TABLE "company" ALTER COLUMN "phone_number" DROP NOT NULL;
ALTER TABLE "company" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "company" ALTER COLUMN "status" SET DEFAULT 'new';
ALTER TABLE "company" ALTER COLUMN "email_status" SET DEFAULT 'not sent';

CREATE UNIQUE INDEX IF NOT EXISTS "leads_email_key" ON "leads"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailLeads_email_key" ON "EmailLeads"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppLeads_whatsapp_number_key" ON "WhatsAppLeads"("whatsapp_number");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'leads_user_id_fkey' AND conrelid = '"leads"'::regclass
    ) THEN
        ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'company_user_id_fkey' AND conrelid = '"company"'::regclass
    ) THEN
        ALTER TABLE "company" ADD CONSTRAINT "company_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'email_history_user_id_fkey' AND conrelid = '"email_history"'::regclass
    ) THEN
        ALTER TABLE "email_history" ADD CONSTRAINT "email_history_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'email_history_lead_id_fkey' AND conrelid = '"email_history"'::regclass
    ) THEN
        ALTER TABLE "email_history" ADD CONSTRAINT "email_history_lead_id_fkey"
            FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'email_history_company_id_fkey' AND conrelid = '"email_history"'::regclass
    ) THEN
        ALTER TABLE "email_history" ADD CONSTRAINT "email_history_company_id_fkey"
            FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
