CREATE TABLE IF NOT EXISTS agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  contact_name TEXT,
  latest_message TEXT,
  message_id TEXT,
  batch_started_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'retry', 'completed', 'fallback_sent', 'failed', 'cancelled')),
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  last_error_code TEXT,
  last_error_details JSONB DEFAULT '{}'::jsonb,
  fallback_reason TEXT,
  fallback_sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES agent_jobs(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_status_next_attempt
  ON agent_jobs(status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_conversation_created
  ON agent_jobs(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_job_logs_job_created
  ON agent_job_logs(job_id, created_at DESC);

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_job_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_jobs' AND policyname = 'workspace_access'
  ) THEN
    CREATE POLICY "workspace_access" ON agent_jobs
      FOR ALL USING (workspace_id IN (SELECT public.user_workspace_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_job_logs' AND policyname = 'workspace_access'
  ) THEN
    CREATE POLICY "workspace_access" ON agent_job_logs
      FOR ALL USING (workspace_id IN (SELECT public.user_workspace_ids()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_agent_jobs'
  ) THEN
    CREATE TRIGGER set_updated_at_agent_jobs
      BEFORE UPDATE ON agent_jobs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
