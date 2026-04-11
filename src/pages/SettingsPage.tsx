import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';
import {
  Settings, MessageSquare, Key, Globe, Shield, Save,
  ExternalLink, CheckCircle2, XCircle, Webhook,
} from 'lucide-react';

export function SettingsPage() {
  const { workspace } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'google' | 'workspace'>('whatsapp');

  // WhatsApp config
  const [waConfig, setWaConfig] = useState({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    webhookVerifyToken: `zapflow_${Math.random().toString(36).slice(2, 10)}`,
  });
  
  const [waConfigId, setWaConfigId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Workspace
  const [wsName, setWsName] = useState(workspace?.name || '');

  useEffect(() => {
    async function loadConfig() {
      if (!workspace) return;
      const { data } = await supabase
        .from('whatsapp_accounts')
        .select('*')
        .eq('workspace_id', workspace.id)
        .single();
        
      if (data) {
        setWaConfigId(data.id);
        setWaConfig({
          phoneNumberId: data.phone_number_id || '',
          businessAccountId: data.business_account_id || '',
          accessToken: data.access_token || '',
          webhookVerifyToken: data.display_name || waConfig.webhookVerifyToken, // reusing display_name for verify token as hack for now
        });
      }
    }
    loadConfig();
  }, [workspace]);

  const saveWhatsAppConfig = async () => {
    if (!workspace) return;
    setIsSaving(true);
    
    // Check if we insert or update
    const payload = {
      workspace_id: workspace.id,
      phone_number_id: waConfig.phoneNumberId,
      business_account_id: waConfig.businessAccountId,
      access_token: waConfig.accessToken,
      display_name: waConfig.webhookVerifyToken,
      status: 'active' as const
    };

    if (waConfigId) {
      const { error } = await supabase.from('whatsapp_accounts').update(payload).eq('id', waConfigId);
      if (error) toast.error("Falha ao atualizar");
      else toast.success("Configuração da Meta atualizada");
    } else {
      const { data, error } = await supabase.from('whatsapp_accounts').insert(payload).select().single();
      if (error) toast.error("Falha ao salvar");
      else {
        toast.success("Credenciais da Meta vinculadas");
        setWaConfigId(data.id);
      }
    }
    
    setIsSaving(false);
  };

  const saveWorkspaceConfig = async () => {
    if (!workspace) return;
    setIsSaving(true);
    const { error } = await supabase.from('workspaces').update({ name: wsName }).eq('id', workspace.id);
    if (!error) toast.success("Organização atualizada");
    else toast.error("Falha ao atualizar");
    setIsSaving(false);
  };

  const tabs = [
    { id: 'whatsapp' as const, label: 'WhatsApp API', icon: MessageSquare },
    { id: 'workspace' as const, label: 'Workspace', icon: Settings },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-white tracking-tight">Configurações</h1>
        <p className="text-sm text-text-400 mt-0.5">Gerencie suas integrações e conta</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-800 rounded-xl w-fit border border-white/[0.04]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.id
                ? 'bg-surface-700 text-white shadow-sm'
                : 'text-text-400 hover:text-white'
              }
            `}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* WhatsApp Config */}
      {activeTab === 'whatsapp' && (
         <div className="space-y-4 animate-fade-in">
         <div className="glass-panel p-6">
           <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-neon-green/10 flex items-center justify-center border border-neon-green/20">
                 <MessageSquare className="w-5 h-5 text-neon-green" />
               </div>
               <div>
                 <h2 className="font-semibold text-white">WhatsApp Cloud API</h2>
                 <p className="text-xs text-text-400">Configuração da API Oficial da Meta</p>
               </div>
             </div>
             <Badge variant={waConfig.accessToken ? 'success' : 'warning'} dot>
               {waConfig.accessToken ? 'Vinculado' : 'Aguardando Credenciais'}
             </Badge>
           </div>

           <div className="space-y-4">
             <Input
               label="Phone Number ID"
               placeholder="Ex: 123456789012345"
               value={waConfig.phoneNumberId}
               onChange={(e) => setWaConfig({ ...waConfig, phoneNumberId: e.target.value })}
               icon={<Key className="w-4 h-4" />}
             />
             <Input
               label="Business Account ID"
               placeholder="Ex: 987654321098765"
               value={waConfig.businessAccountId}
               onChange={(e) => setWaConfig({ ...waConfig, businessAccountId: e.target.value })}
               icon={<Key className="w-4 h-4" />}
             />
             <Input
               label="Access Token (permanente)"
               type="password"
               placeholder="EAABs..."
               value={waConfig.accessToken}
               onChange={(e) => setWaConfig({ ...waConfig, accessToken: e.target.value })}
               icon={<Shield className="w-4 h-4" />}
             />
           </div>

           <div className="mt-6 flex justify-end">
             <Button icon={<Save className="w-4 h-4" />} loading={isSaving} onClick={saveWhatsAppConfig}>Salvar Credenciais da Meta</Button>
           </div>
         </div>

         {/* Webhook config */}
         <div className="glass-panel p-6">
           <div className="flex items-center gap-2 mb-4">
             <Webhook className="w-5 h-5 text-neon-blue" />
             <h2 className="font-semibold text-white">Webhook</h2>
           </div>
           <div className="space-y-3">
             <div>
               <label className="block text-sm text-text-200 mb-1">Callback URL</label>
               <div className="flex items-center gap-2">
                 <code className="flex-1 px-3 py-2 bg-surface-800 rounded-lg text-[13px] text-neon-green font-mono break-all border border-white/5">
                   {window.location.origin}/api/whatsapp-webhook
                 </code>
               </div>
             </div>
             <Input
               label="Verify Token (Gere um e cole na Meta)"
               value={waConfig.webhookVerifyToken}
               onChange={(e) => setWaConfig({ ...waConfig, webhookVerifyToken: e.target.value })}
               icon={<Shield className="w-4 h-4" />}
             />
           </div>
         </div>
       </div>
      )}

      {/* Removed Google Sheets config section */}

      {/* Workspace Config */}
      {activeTab === 'workspace' && (
        <div className="glass-panel p-6 animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-neon-blue/10 flex items-center justify-center border border-neon-blue/20">
              <Settings className="w-5 h-5 text-neon-blue" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Workspace</h2>
              <p className="text-xs text-text-400">Informações da organização</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              label="Nome da organização"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
            />
            <div className="pt-4 flex justify-end">
              <Button icon={<Save className="w-4 h-4" />} onClick={saveWorkspaceConfig} loading={isSaving}>Alterar Organização</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
