ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS followup_note_clean text,
  ADD COLUMN IF NOT EXISTS followup_mode text,
  ADD COLUMN IF NOT EXISTS interested_at timestamptz;