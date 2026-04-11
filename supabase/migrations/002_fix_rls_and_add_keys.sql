-- ================================================
-- Correções RLS e Adição de Chaves - ZapFlow
-- Supabase PostgreSQL Migration
-- ================================================

-- 1. ADIÇÃO DA COLUNA DA API NO AGENTE IA
ALTER TABLE agent_settings 
ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;


-- 2. CORREÇÃO DA TRAVA DO RLS AO CRIAR WORKSPACE E USUÁRIO

-- Como os usuários acabaram de ser criados no auth.users, eles ainda não estão 
-- vinculados à workspace_members, então os INSERTs falham por conta do "USING".
-- Aqui, permitimos explicitamente o INSERT se a pessoa for ela mesma referenciada, 
-- e/ou permitimos as inserts se a workspace que eles manipulam for deles próprios.

-- Para Workspace:
DROP POLICY IF EXISTS "workspace_owner_all" ON workspaces;
CREATE POLICY "workspace_owner_all" ON workspaces
  FOR ALL USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Para Membros do Workspace (Permitindo INSERT para novos criadores):
DROP POLICY IF EXISTS "members_manage" ON workspace_members;
CREATE POLICY "members_manage" ON workspace_members
  FOR ALL USING (
    (user_id = auth.uid()) -- O user pode ver/manejar a própria fileira
    OR
    (workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ))
  )
  WITH CHECK (
    -- O user pode fazer INSERT de si próprio se a workspace foi criada por ele!
    (user_id = auth.uid() AND EXISTS (SELECT 1 FROM workspaces WHERE id = workspace_id AND owner_id = auth.uid()))
    OR
    (workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ))
  );

-- Garantir acesso ao agent_settings com nova policy completa:
DROP POLICY IF EXISTS "workspace_access" ON agent_settings;
CREATE POLICY "agent_settings_access" ON agent_settings 
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

-- Garantir acesso ao contacts:
DROP POLICY IF EXISTS "workspace_access" ON contacts;
CREATE POLICY "contacts_access" ON contacts 
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
