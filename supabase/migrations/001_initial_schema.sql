-- ================================================
-- ZapFlow — WhatsApp SaaS Database Schema
-- Supabase PostgreSQL Migration
-- ================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- WORKSPACES (Multi-tenant)
-- ================================================

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ================================================
-- WHATSAPP ACCOUNTS
-- ================================================

CREATE TABLE whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  phone_number_id TEXT NOT NULL,
  business_account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  display_name TEXT,
  phone_number TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  webhook_verify_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- CONTACTS
-- ================================================

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'google_sheets', 'csv', 'api')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, phone)
);

-- ================================================
-- CONVERSATIONS
-- ================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INT DEFAULT 0,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_ai_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, contact_id)
);

-- ================================================
-- MESSAGES
-- ================================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'image', 'audio', 'video', 'document', 'template', 'sticker', 'location', 'interactive')),
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  wamid TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_details JSONB,
  metadata JSONB DEFAULT '{}',
  is_from_ai BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- CAMPAIGNS
-- ================================================

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT DEFAULT 'pt_BR',
  template_components JSONB DEFAULT '[]',
  variable_mapping JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed')),
  total_contacts INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  read_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  rate_limit_per_second INT DEFAULT 80,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- CAMPAIGN LOGS
-- ================================================

CREATE TABLE campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'read', 'failed')),
  wamid TEXT,
  error_details JSONB,
  retry_count INT DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- AGENT SETTINGS
-- ================================================

CREATE TABLE agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE NOT NULL,
  system_prompt TEXT,
  model TEXT DEFAULT 'gemini-2.0-flash',
  temperature NUMERIC(3, 2) DEFAULT 0.70,
  max_tokens INT DEFAULT 500,
  is_active BOOLEAN DEFAULT false,
  fallback_message TEXT DEFAULT 'Um atendente irá te responder em breve.',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- MEDIA FILES
-- ================================================

CREATE TABLE media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  file_name TEXT,
  file_type TEXT,
  file_size INT,
  storage_path TEXT,
  public_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ================================================
-- INDEXES
-- ================================================

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_workspace ON messages(workspace_id);
CREATE INDEX idx_messages_wamid ON messages(wamid) WHERE wamid IS NOT NULL;
CREATE INDEX idx_messages_status ON messages(status) WHERE status != 'read';
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(workspace_id, phone);
CREATE INDEX idx_contacts_tags ON contacts USING gin(tags);
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id, last_message_at DESC);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_campaign_logs_campaign ON campaign_logs(campaign_id, status);
CREATE INDEX idx_campaign_logs_contact ON campaign_logs(contact_id);
CREATE INDEX idx_campaign_logs_wamid ON campaign_logs(wamid) WHERE wamid IS NOT NULL;

-- ================================================
-- ROW LEVEL SECURITY
-- ================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;

-- Helper function: check workspace membership
CREATE OR REPLACE FUNCTION auth.user_workspace_ids()
RETURNS SETOF UUID AS $$
  SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- RLS Policies —  Workspace access based on membership

CREATE POLICY "workspace_member_select" ON workspaces
  FOR SELECT USING (id IN (SELECT auth.user_workspace_ids()));

CREATE POLICY "workspace_owner_all" ON workspaces
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "members_select" ON workspace_members
  FOR SELECT USING (workspace_id IN (SELECT auth.user_workspace_ids()));

CREATE POLICY "members_manage" ON workspace_members
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Generic policy for all data tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN 
    SELECT unnest(ARRAY[
      'whatsapp_accounts', 'contacts', 'conversations', 'messages',
      'campaigns', 'campaign_logs', 'agent_settings', 'media_files'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "workspace_access" ON %I FOR ALL USING (workspace_id IN (SELECT auth.user_workspace_ids()))',
      tbl
    );
  END LOOP;
END $$;

-- ================================================
-- FUNCTIONS
-- ================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN 
    SELECT unnest(ARRAY[
      'workspaces', 'whatsapp_accounts', 'contacts', 'conversations',
      'campaigns', 'agent_settings'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      tbl
    );
  END LOOP;
END $$;

-- Function: Update conversation on new message
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(COALESCE(NEW.content, NEW.type), 100),
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- Function: Update campaign counters
CREATE OR REPLACE FUNCTION update_campaign_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    UPDATE campaigns SET
      sent_count = (SELECT COUNT(*) FROM campaign_logs WHERE campaign_id = NEW.campaign_id AND status IN ('sent', 'delivered', 'read')),
      delivered_count = (SELECT COUNT(*) FROM campaign_logs WHERE campaign_id = NEW.campaign_id AND status IN ('delivered', 'read')),
      read_count = (SELECT COUNT(*) FROM campaign_logs WHERE campaign_id = NEW.campaign_id AND status = 'read'),
      failed_count = (SELECT COUNT(*) FROM campaign_logs WHERE campaign_id = NEW.campaign_id AND status = 'failed'),
      updated_at = now()
    WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_campaign_log_update
  AFTER UPDATE ON campaign_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_counters();

-- ================================================
-- REALTIME (enable for key tables)
-- ================================================

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_logs;
