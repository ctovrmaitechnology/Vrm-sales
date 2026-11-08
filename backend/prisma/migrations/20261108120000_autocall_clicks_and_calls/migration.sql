ALTER TABLE leads ADD COLUMN IF NOT EXISTS called_at timestamptz;

CREATE TABLE IF NOT EXISTS call_history (
  id SERIAL PRIMARY KEY, vapi_call_id TEXT UNIQUE, lead_id INTEGER, company_id INTEGER,
  phone_number TEXT, contact_name TEXT, contact_type TEXT, status TEXT DEFAULT 'queued',
  duration INTEGER, transcript JSONB, recording_url TEXT, summary TEXT, cost DOUBLE PRECISION,
  ended_reason TEXT, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ
);
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'manual';

ALTER TABLE "WhatsAppLeads"
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_call_status text,
  ADD COLUMN IF NOT EXISTS auto_call_at timestamptz;

UPDATE "WhatsAppLeads" SET clicked_at = updated_at
  WHERE (click_count > 0 OR whatsapp_status = 'clicked') AND clicked_at IS NULL;
UPDATE "WhatsAppLeads" SET auto_call_status = 'skipped'
  WHERE (click_count > 0 OR whatsapp_status = 'clicked') AND auto_call_status IS NULL;
