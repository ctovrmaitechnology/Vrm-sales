-- Migration: Add called status tracking to leads table
-- Run this on the Hetzner PostgreSQL database

-- 1. Add is_called column (defaults to false for all existing leads)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_called BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add called_by_user_id column (nullable FK to users table)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS called_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 3. Create index for fast filtering by called status
CREATE INDEX IF NOT EXISTS idx_leads_is_called ON leads(is_called);

-- 4. Create index for fast lookup by caller user
CREATE INDEX IF NOT EXISTS idx_leads_called_by_user_id ON leads(called_by_user_id);
