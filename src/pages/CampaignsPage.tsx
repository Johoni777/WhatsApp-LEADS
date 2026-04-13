import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Megaphone, Play, Search, Plus, Send, LayoutTemplate, CheckCircle2, XCircle } from 'lucide-react';
import { formatNumber } from '@/utils/formatters';
import { useCampaignStore } from '@/stores/campaignStore';
import { useContactStore } from '@/stores/contactStore';
import { useTemplateStore, WhatsAppTemplate } from '@/stores/templateStore';
import { useAuthStore } from '@/stores/authStore';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import toast from 'react-hot-toast';

export function CampaignsPage() {
  const { workspace } = useAuthStore();
  const { campaigns, fetchCampaigns, createCampaign, updateCampaignMetrics, isLoading } = useCampaignStore();
  const { contacts, groups, fetchContacts, fetchGroups } = useContactStore();
  const { templates, fetchTemplates, sendBulkTemplateChunk } = useTemplateStore();

  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [step, setStep] = useState<'template' | 'contacts' | 'params' | 'sending' | 'done'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [params, setParams] = useState<Record<string, string>>({});
  const [sendResult, setSendResult] = useState<{
    lastSent: number;
    lastFailed: number;
    totalSent: number;
    totalFailed: number;
    hasMore: boolean;
    remaining: number;
    errors?: Record<string, string>;
  } | null>(null);
  const [bulkSession, setBulkSession] = useState<{
    phones: string[];
    nextOffset: number;
    perRound: number;
    templateName: string;
    language: string;
    components?: unknown[];
  } | null>(null);
  const [batchLimitInput, setBatchLimitInput] = useState('');
  const [chunkLoading, setChunkLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | 'all' | 'ungrouped'>('all');
  const [campaignName, setCampaignName] = useState('');
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);

  const loadCampaignsPage = useCallback(async () => {
    if (!workspace?.id) return;
    await fetchCampaigns();
  }, [workspace?.id, fetchCampaigns]);

  useRefreshOnFocus(loadCampaignsPage, '/campaigns');

  useEffect(() => {
    if (showCreateModal && templates.length === 0) fetchTemplates();
    if (showCreateModal && contacts.length === 0) fetchContacts();
    if (showCreateModal && groups.length === 0) fetchGroups();
  }, [showCreateModal, templates.length, contacts.length, groups.length, fetchTemplates, fetchContacts, fetchGroups]);

  const filtered = campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const getBodyText = (t: WhatsAppTemplate) => t.components?.find(c => c.type === 'BODY')?.text || '';
  const getVarCount = (t: WhatsAppTemplate) => (getBodyText(t).match(/\{\{(\d+)\}\}/g) || []).length;

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );
  
  const filteredContacts = contacts.filter(c => {
    const matchesSearch = !contactSearch || c.name?.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone.includes(contactSearch);
    const matchesGroup = selectedGroupId === 'all' 
      ? true 
      : selectedGroupId === 'ungrouped' 
        ? !c.group_id 
        : c.group_id === selectedGroupId;
    
    return matchesSearch && matchesGroup;
  });

  const toggleContact = (id: string, phone: string) => {
    const next = new Set(selectedContacts);
    if (next.has(phone)) next.delete(phone); else next.add(phone);
    setSelectedContacts(next);
  };

  const selectAllContacts = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.phone)));
    }
  };

  const buildComponents = useCallback(() => {
    if (!selectedTemplate) return undefined;
    const varCount = getVarCount(selectedTemplate);
    if (varCount <= 0) return undefined;
    return [{
      type: "body",
      parameters: Array.from({ length: varCount }, (_, i) => ({
        type: "text", text: params[String(i + 1)] || "",
      })),
    }];
  }, [selectedTemplate, params]);

  const runBulkChunk = useCallback(
    async (phones: string[], offset: number, perRound: number, templateName: string, language: string, components?: unknown[]) => {
      setChunkLoading(true);
      try {
        return await sendBulkTemplateChunk(
          templateName,
          language,
          phones,
          offset,
          perRound,
          components
        );
      } finally {
        setChunkLoading(false);
      }
    },
    [sendBulkTemplateChunk]
  );

  const persistCampaignProgress = useCallback(
    async (campaignId: string, result: { totalSent: number; totalFailed: number; hasMore: boolean }) => {
      const status =
        result.hasMore ? 'running' : result.totalSent > 0 ? 'completed' : 'failed';

      const update = await updateCampaignMetrics(campaignId, {
        status,
        sent_count: result.totalSent,
        failed_count: result.totalFailed,
        started_at: status === 'running' ? new Date().toISOString() : undefined,
        completed_at: status === 'running' ? undefined : new Date().toISOString(),
      });

      if (update.error) {
        toast.error(update.error);
      }
    },
    [updateCampaignMetrics]
  );

  const handleStartSend = async () => {
    if (!selectedTemplate || selectedContacts.size === 0) return;
    if (!campaignName.trim()) {
      toast.error('Informe um nome para a campanha.');
      setStep('template');
      return;
    }
    setStep('sending');

    const components = buildComponents();
    const phones = Array.from(selectedContacts);
    const parsed = parseInt(batchLimitInput.trim(), 10);
    const perRound =
      batchLimitInput.trim() === '' || Number.isNaN(parsed) || parsed < 1
        ? phones.length
        : Math.min(parsed, phones.length);

    const created = await createCampaign({
      name: campaignName.trim(),
      template_name: selectedTemplate.name,
      template_language: selectedTemplate.language || 'pt_BR',
      template_components: (components as never[]) || [],
      variable_mapping: params,
      status: 'running',
      total_contacts: phones.length,
      sent_count: 0,
      failed_count: 0,
      delivered_count: 0,
      read_count: 0,
      started_at: new Date().toISOString(),
      completed_at: null,
      scheduled_at: null,
    });

    if (created.error || !created.campaignId) {
      toast.error(created.error || 'Nao foi possivel criar a campanha.');
      setStep('contacts');
      return;
    }

    setCurrentCampaignId(created.campaignId);

    const r = await runBulkChunk(
      phones,
      0,
      perRound,
      selectedTemplate.name,
      selectedTemplate.language || 'pt_BR',
      components
    );

    if (r.error) {
      await persistCampaignProgress(created.campaignId, {
        totalSent: 0,
        totalFailed: phones.length,
        hasMore: false,
      });
      toast.error(r.error);
      setStep('contacts');
      return;
    }

    setBulkSession({
      phones,
      nextOffset: r.next_offset,
      perRound,
      templateName: selectedTemplate.name,
      language: selectedTemplate.language || 'pt_BR',
      components,
    });

    setSendResult({
      lastSent: r.sent,
      lastFailed: r.failed,
      totalSent: r.sent,
      totalFailed: r.failed,
      hasMore: r.has_more,
      remaining: Math.max(0, phones.length - r.next_offset),
      errors: r.errors,
    });

    await persistCampaignProgress(created.campaignId, {
      totalSent: r.sent,
      totalFailed: r.failed,
      hasMore: r.has_more,
    });
    setStep('done');
  };

  const handleContinueBulk = async () => {
    if (!bulkSession || !currentCampaignId) return;
    setStep('sending');
    const s = bulkSession;
    const r = await runBulkChunk(
      s.phones,
      s.nextOffset,
      s.perRound,
      s.templateName,
      s.language,
      s.components
    );

    if (r.error) {
      await persistCampaignProgress(currentCampaignId, {
        totalSent: sendResult?.totalSent || 0,
        totalFailed: (sendResult?.totalFailed || 0) + (s.phones.length - s.nextOffset),
        hasMore: false,
      });
      toast.error(r.error);
      setStep('done');
      return;
    }

    setBulkSession({
      ...s,
      nextOffset: r.next_offset,
    });

    const nextResult = {
      lastSent: r.sent,
      lastFailed: r.failed,
      totalSent: 0,
      totalFailed: 0,
      hasMore: r.has_more,
      remaining: Math.max(0, s.phones.length - r.next_offset),
      errors: r.errors,
    };

    setSendResult((prev) => {
      if (!prev) {
        return {
          ...nextResult,
          totalSent: r.sent,
          totalFailed: r.failed,
        };
      }
      return {
        ...nextResult,
        totalSent: prev.totalSent + r.sent,
        totalFailed: prev.totalFailed + r.failed,
      };
    });

    const totalSent = (sendResult?.totalSent || 0) + r.sent;
    const totalFailed = (sendResult?.totalFailed || 0) + r.failed;
    await persistCampaignProgress(currentCampaignId, {
      totalSent,
      totalFailed,
      hasMore: r.has_more,
    });
    setStep('done');
  };

  const closeAndReset = () => {
    setShowCreateModal(false);
    setStep('template');
    setSelectedTemplate(null);
    setSelectedContacts(new Set());
    setParams({});
    setSendResult(null);
    setBulkSession(null);
    setBatchLimitInput('');
    setTemplateSearch('');
    setContactSearch('');
    setSelectedGroupId('all');
    setCampaignName('');
    setCurrentCampaignId(null);
    fetchCampaigns();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge variant="success" dot>Executando</Badge>;
      case 'completed': return <Badge variant="info">Concluida</Badge>;
      case 'paused': return <Badge variant="warning">Pausada</Badge>;
      case 'scheduled': return <Badge variant="purple">Agendada</Badge>;
      default: return <Badge variant="default">Rascunho</Badge>;
    }
  };

  const renderModalContent = () => {
    if (step === 'template') {
      return (
        <div className="space-y-4">
          <Input
            label="Nome da campanha"
            placeholder="Ex: Certificado digital abril"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
          <p className="text-sm text-text-300 font-medium">Selecione um template aprovado da Meta:</p>
          <Input placeholder="Buscar template..." value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
          {templates.length === 0 ? (
            <div className="text-center py-6 text-text-400 text-sm">
              <LayoutTemplate className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Carregando templates...</p>
              <Button variant="ghost" size="sm" onClick={fetchTemplates} className="mt-2">Recarregar</Button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {filteredTemplates.map(t => (
                <button
                  key={`${t.name}-${t.language}`}
                  onClick={() => {
                    if (!campaignName.trim()) {
                      toast.error('Informe um nome para a campanha.');
                      return;
                    }
                    setSelectedTemplate(t);
                    setStep(getVarCount(t) > 0 ? 'params' : 'contacts');
                  }}
                  className="w-full text-left p-3 rounded-xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] hover:border-neon-green/20 transition-all"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-white">{t.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-neon-green/10 text-neon-green font-bold uppercase">{t.category}</span>
                  </div>
                  <p className="text-xs text-text-400 line-clamp-2">{getBodyText(t)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (step === 'params') {
      const varCount = selectedTemplate ? getVarCount(selectedTemplate) : 0;
      return (
        <div className="space-y-4">
          <div className="p-3 bg-surface-800 rounded-xl border border-white/[0.06]">
            <p className="text-xs text-neon-green font-bold uppercase mb-1">{selectedTemplate?.name}</p>
            <p className="text-sm text-text-300 whitespace-pre-wrap">{selectedTemplate ? getBodyText(selectedTemplate) : ''}</p>
          </div>
          <p className="text-sm font-semibold text-text-200">Preencha as variaveis ({varCount}):</p>
          {Array.from({ length: varCount }, (_, i) => (
            <Input key={i} label={`{{${i + 1}}}`} placeholder={`Valor para {{${i + 1}}}`} value={params[String(i + 1)] || ''} onChange={e => setParams(prev => ({ ...prev, [String(i + 1)]: e.target.value }))} />
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep('template')}>Voltar</Button>
            <Button onClick={() => setStep('contacts')}>Proximo: Selecionar Contatos</Button>
          </div>
        </div>
      );
    }

    if (step === 'contacts') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-300 font-medium">Selecione os contatos ({selectedContacts.size} selecionados):</p>
            <Button variant="ghost" size="sm" onClick={selectAllContacts}>
              {selectedContacts.size === filteredContacts.length ? 'Limpar' : 'Selecionar Todos'}
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Input placeholder="Buscar contato..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
            </div>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="glass-input h-10 outline-none sm:w-48"
            >
              <option value="all">Todas as pastas</option>
              <option value="ungrouped">Sem pasta</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Input
              label="Maximo por rodada (vazio = todos de uma vez)"
              placeholder="Ex: 150"
              value={batchLimitInput}
              onChange={e => setBatchLimitInput(e.target.value.replace(/\D/g, ''))}
            />
            <p className="text-xs text-text-400 mt-1">
              Envie em lotes para respeitar limites. Use &quot;Continuar disparo&quot; para seguir do ponto em que parou.
            </p>
          </div>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {filteredContacts.map(c => (
              <button
                key={c.id}
                onClick={() => toggleContact(c.id, c.phone)}
                className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors ${selectedContacts.has(c.phone) ? 'bg-neon-green/10 border border-neon-green/20' : 'bg-surface-800/30 hover:bg-surface-700 border border-transparent'}`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selectedContacts.has(c.phone) ? 'bg-neon-green border-neon-green' : 'border-text-400'}`}>
                  {selectedContacts.has(c.phone) && <CheckCircle2 className="w-3.5 h-3.5 text-surface-900" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{c.name || 'Sem nome'}</p>
                  <p className="text-xs text-text-400">{c.phone}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep(selectedTemplate && getVarCount(selectedTemplate) > 0 ? 'params' : 'template')}>Voltar</Button>
            <Button icon={<Send className="w-4 h-4" />} onClick={handleStartSend} disabled={selectedContacts.size === 0}>
              Disparar para {selectedContacts.size} contatos
            </Button>
          </div>
        </div>
      );
    }

    if (step === 'sending') {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Spinner />
          <p className="text-white font-semibold mt-4">Enviando templates...</p>
          <p className="text-sm text-text-400 mt-1">Aguarde enquanto os disparos sao processados.</p>
          {chunkLoading && (
            <p className="text-sm text-neon-green/80 mt-4">Processando lote na API do WhatsApp...</p>
          )}
        </div>
      );
    }

    if (step === 'done' && sendResult) {
      const { lastSent, lastFailed, totalSent, totalFailed, hasMore, remaining } = sendResult;
      const roundOk = lastFailed === 0;
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center px-2">
          {roundOk ? (
            <CheckCircle2 className="w-16 h-16 text-neon-green mb-4" />
          ) : (
            <XCircle className="w-16 h-16 text-yellow-400 mb-4" />
          )}
          <h3 className="text-xl font-bold text-white mb-2">
            {hasMore ? 'Rodada concluida' : 'Disparo concluido'}
          </h3>
          <p className="text-sm text-text-400 mb-4">
            Esta rodada: {lastSent} enviados, {lastFailed} falhas.
            {hasMore && (
              <span className="block mt-1">Faltam {remaining} contato(s) na fila.</span>
            )}
          </p>
          <div className="flex gap-6 mt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-neon-green">{totalSent}</p>
              <p className="text-xs text-text-400">Total enviados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">{totalFailed}</p>
              <p className="text-xs text-text-400">Total falhas</p>
            </div>
          </div>
          {sendResult.errors && Object.keys(sendResult.errors).length > 0 && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-left max-w-sm w-full text-xs text-red-400 max-h-32 overflow-y-auto">
              <p className="font-bold mb-1">Motivo das falhas:</p>
              {Object.entries(sendResult.errors).slice(0, 3).map(([phone, err]) => (
                <div key={phone} className="mb-1">
                  <span className="font-semibold">{phone}:</span> {err}
                </div>
              ))}
              {Object.keys(sendResult.errors).length > 3 && (
                <p className="mt-1 italic">+ {Object.keys(sendResult.errors).length - 3} outros erros</p>
              )}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 mt-8 w-full sm:justify-center">
            {hasMore && bulkSession && (
              <Button icon={<Play className="w-4 h-4" />} onClick={handleContinueBulk}>
                Continuar disparo
              </Button>
            )}
            <Button variant={hasMore ? 'secondary' : 'primary'} onClick={closeAndReset}>
              {hasMore ? 'Encerrar e fechar' : 'Fechar'}
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="page-shell page-stack mobile-safe-bottom animate-fade-in relative z-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="section-title">Campanhas</h1>
          <p className="section-subtitle">Disparos em massa com templates da Meta</p>
        </div>
        <Button className="w-full sm:w-auto" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
          Novo Disparo
        </Button>
      </div>

      <div className="w-full max-w-md">
        <Input placeholder="Buscar campanhas..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} />
      </div>

      <div className="mobile-card-grid md:gap-6">
        {filtered.map(campaign => (
          <div key={campaign.id} className="glass-card p-6 flex flex-col group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-800 border border-white/5 flex items-center justify-center text-neon-green">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{campaign.name}</h3>
                  <div className="text-xs text-text-400 mt-0.5">{getStatusBadge(campaign.status)}</div>
                </div>
              </div>
            </div>
            <div className="space-y-4 flex-1">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-text-200">Progresso</span>
                  <span className="text-text-400">{formatNumber(campaign.sent_count)} / {formatNumber(campaign.total_contacts)}</span>
                </div>
                <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full rounded-full bg-neon-green transition-all"
                    style={{ width: `${campaign.total_contacts > 0 ? (campaign.sent_count / campaign.total_contacts) * 100 : 0}%` }}
                  />
                </div>
              </div>
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
              <span className="text-[11px] text-text-400 font-medium">
                Template: {campaign.template_name} · {formatNumber(campaign.total_contacts)} contatos
              </span>
            </div>
          </div>
        ))}
        {campaigns.length === 0 && !isLoading && (
          <div className="col-span-full py-12 text-center text-text-400">
            Nenhuma campanha ainda. Clique em &quot;Novo Disparo&quot; para comecar.
          </div>
        )}
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={closeAndReset}
        title={step === 'template' ? 'Selecionar Template' : step === 'params' ? 'Variaveis do Template' : step === 'contacts' ? 'Selecionar Contatos' : step === 'sending' ? 'Enviando...' : 'Resultado'}
        size="lg"
      >
        {renderModalContent()}
      </Modal>
    </div>
  );
}
