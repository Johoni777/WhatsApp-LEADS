import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Megaphone, Play, Pause, Search, Plus, Calendar, Settings2, BarChart2 } from 'lucide-react';
import { formatNumber } from '@/utils/formatters';
import { useCampaignStore } from '@/stores/campaignStore';
import toast from 'react-hot-toast';

export function CampaignsPage() {
  const { campaigns, fetchCampaigns, createCampaign, isLoading } = useCampaignStore();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: '', template_name: 'boas_vindas' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const filtered = campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    if (!newCampaign.name) return toast.error("Nome da campanha é obrigatório");
    setIsSaving(true);
    
    const res = await createCampaign({
      name: newCampaign.name,
      template_name: newCampaign.template_name,
      template_language: 'pt_BR',
      status: 'draft',
      total_contacts: 0 // In real scenario, user would select a list
    });

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Campanha criada");
      setShowCreateModal(false);
      setNewCampaign({ name: '', template_name: 'boas_vindas' });
    }
    setIsSaving(false);
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'running': return <Badge variant="success" dot>Executando</Badge>;
      case 'completed': return <Badge variant="info">Concluída</Badge>;
      case 'paused': return <Badge variant="warning">Pausada</Badge>;
      case 'scheduled': return <Badge variant="purple">Agendada</Badge>;
      default: return <Badge variant="default">Rascunho</Badge>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 animate-fade-in relative z-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Campanhas Ativas</h1>
          <p className="text-sm text-text-400 mt-1">Gerencie seus disparos em massa</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
          Nova Campanha
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Buscar campanhas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Calendar className="w-4 h-4" />}>Data</Button>
          <Button variant="secondary" icon={<Settings2 className="w-4 h-4" />}>Filtros</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((campaign) => (
          <div key={campaign.id} className="glass-card p-6 flex flex-col group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-800 border border-white/5 flex items-center justify-center text-neon-green group-hover:border-neon-green/30 transition-colors shadow-inner">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{campaign.name}</h3>
                  <div className="text-xs text-text-400 mt-0.5 font-medium">{getStatusBadge(campaign.status)}</div>
                </div>
              </div>
              <div className="flex gap-1">
                {campaign.status === 'running' ? (
                  <button className="p-2 text-text-400 hover:text-white bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors">
                    <Pause className="w-4 h-4" />
                  </button>
                ) : campaign.status === 'draft' || campaign.status === 'paused' ? (
                  <button className="p-2 text-text-400 hover:text-white bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors">
                    <Play className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 flex-1">
              {/* Progress */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-text-200">Progresso</span>
                  <span className="text-text-400">{formatNumber(campaign.sent_count)} / {formatNumber(campaign.total_contacts)}</span>
                </div>
                <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${campaign.status === 'running' ? 'bg-gradient-to-r from-neon-green/80 to-neon-green animate-pulse' : 'bg-neon-blue'}`}
                    style={{ width: `${campaign.total_contacts > 0 ? (campaign.sent_count / campaign.total_contacts) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-surface-800/50 p-3 rounded-xl border border-white/[0.02]">
                  <div className="text-[10px] text-text-400 uppercase font-bold tracking-wider mb-1">Enviadas</div>
                  <div className="text-sm font-semibold text-white">{formatNumber(campaign.sent_count)}</div>
                </div>
                <div className="bg-surface-800/50 p-3 rounded-xl border border-white/[0.02]">
                  <div className="text-[10px] text-text-400 uppercase font-bold tracking-wider mb-1">Entregues</div>
                  <div className="text-sm font-semibold text-neon-teal">{formatNumber(campaign.delivered_count)}</div>
                </div>
                <div className="bg-surface-800/50 p-3 rounded-xl border border-white/[0.02]">
                  <div className="text-[10px] text-text-400 uppercase font-bold tracking-wider mb-1">Lidas</div>
                  <div className="text-sm font-semibold text-neon-blue">{formatNumber(campaign.read_count)}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.04] flex justify-between items-center">
              <span className="text-[11px] text-text-400 font-medium">Template: {campaign.template_name}</span>
              <Button variant="ghost" size="sm" icon={<BarChart2 className="w-4 h-4" />}>Métricas</Button>
            </div>
          </div>
        ))}
        {campaigns.length === 0 && !isLoading && (
          <div className="col-span-full py-12 text-center text-text-400">
             Não há campanhas cadastradas ainda.
          </div>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Nova Campanha de Disparo"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
            <Button icon={<Play className="w-4 h-4" />} onClick={handleCreate} loading={isSaving}>Criar Campanha</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome da Campanha"
            placeholder="Ex: Oferta Black Friday 2026"
            value={newCampaign.name}
            onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
          />
          <div>
            <label className="block text-xs font-semibold text-text-300 mb-1.5 ml-1">Template de Mensagem</label>
            <select
              className="glass-input w-full h-11 px-4 cursor-pointer outline-none"
              value={newCampaign.template_name}
              onChange={(e) => setNewCampaign({ ...newCampaign, template_name: e.target.value })}
            >
              <option value="boas_vindas">boas_vindas (Texto Simples)</option>
              <option value="promo_anual">promo_anual (Texto + Botão de Link)</option>
              <option value="lembrete_boleto">lembrete_boleto (Varíavel Nome + Data)</option>
            </select>
          </div>
          <p className="text-xs text-text-400 ml-1">Para adicionar mais templates, aprove-os no painel da Meta.</p>
        </div>
      </Modal>

    </div>
  );
}
