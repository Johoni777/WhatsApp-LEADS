CREATE TABLE IF NOT EXISTS contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, name)
);

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES contact_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contact_groups_workspace ON contact_groups(workspace_id, name);
CREATE INDEX IF NOT EXISTS idx_contacts_group ON contacts(group_id);

ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_groups_access" ON contact_groups;
CREATE POLICY "contact_groups_access" ON contact_groups
  FOR ALL USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
      UNION
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
      UNION
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
