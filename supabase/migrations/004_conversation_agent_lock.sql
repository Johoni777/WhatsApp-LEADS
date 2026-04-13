ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS ai_pending_message_wamid TEXT,
ADD COLUMN IF NOT EXISTS ai_pending_since TIMESTAMPTZ;
