ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_status text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_date date,
  ADD COLUMN IF NOT EXISTS followup_note text,
  ADD COLUMN IF NOT EXISTS followup_set_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_leads_followup_date ON leads (followup_date) WHERE followup_date IS NOT NULL;