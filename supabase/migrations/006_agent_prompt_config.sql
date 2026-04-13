ALTER TABLE agent_settings
ADD COLUMN IF NOT EXISTS prompt_config JSONB DEFAULT '{}'::jsonb;
