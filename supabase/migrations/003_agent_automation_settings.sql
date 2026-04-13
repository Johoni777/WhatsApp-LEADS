ALTER TABLE agent_settings
ADD COLUMN IF NOT EXISTS response_delay_seconds INT DEFAULT 2 CHECK (response_delay_seconds >= 0),
ADD COLUMN IF NOT EXISTS message_gap_seconds NUMERIC(5, 2) DEFAULT 1.00 CHECK (message_gap_seconds >= 0),
ADD COLUMN IF NOT EXISTS quiet_window_seconds INT DEFAULT 15 CHECK (quiet_window_seconds >= 0),
ADD COLUMN IF NOT EXISTS context_message_limit INT DEFAULT 40 CHECK (context_message_limit > 0),
ADD COLUMN IF NOT EXISTS tag_rules JSONB DEFAULT '[]'::jsonb;

UPDATE agent_settings
SET
  response_delay_seconds = COALESCE(response_delay_seconds, 2),
  message_gap_seconds = COALESCE(message_gap_seconds, 1.00),
  quiet_window_seconds = COALESCE(quiet_window_seconds, 15),
  context_message_limit = COALESCE(context_message_limit, 40),
  tag_rules = COALESCE(tag_rules, '[]'::jsonb);
