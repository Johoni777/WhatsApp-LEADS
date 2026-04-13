import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import type { AgentPromptConfig, AgentTagRule } from '@/types/database';
import toast from 'react-hot-toast';
import {
  Bot, Save, Power, PowerOff, Sparkles, Key, Clock3, Tags, Plus, Trash2,
} from 'lucide-react';

const PROMPT_CONFIG_MARKER_START = '<!-- ZAPFLOW_PROMPT_CONFIG:';
const PROMPT_CONFIG_MARKER_END = ':END_ZAPFLOW_PROMPT_CONFIG -->';

const defaultTagRule = (): AgentTagRule => ({
  tag: '',
  mode: 'agent_off',
  prompt: '',
});

const defaultPromptConfig = (): AgentPromptConfig => ({
  agent_name: 'Marcela',
  company_name: 'Voauti Certificados',
  role_description: 'SDR da empresa. Faz prospecção via WhatsApp para vender certificado digital.',
  mission: 'Gerar interesse, entender a necessidade e conduzir para a emissão.',
  lead_context: 'Lead frio, não sabe o motivo do contato. Já houve saudação antes e ela nunca deve ser repetida. "Tudo bem?" é apenas educação, não interesse.',
  product_name: 'Certificado digital',
  product_price: 'R$ 125',
  product_uses: 'Nota fiscal\nAcesso gov\nAssinatura com validade jurídica',
  first_response_rule: 'Sempre responder o cliente, se identificar, explicar o motivo do contato, conectar com um benefício e fazer uma pergunta.',
  first_response_example: 'Tudo certo, obrigado.\nSou a Marcela da Voauti Certificados. Entrei em contato porque ajudamos empresas com certificado digital para emissão de notas, acesso a sistemas e assinaturas seguras.\n\nHoje vocês já utilizam certificado digital?',
  flow_steps: '1. Explicar rapidamente por que chamou.\n2. Diagnosticar se já usa, se é para empresa ou pessoal e se está válido.\n3. Ofertar certificado válido por 1 ano por R$ 125.\n4. Fechar propondo os próximos passos para emissão.',
  critical_rules: 'Não repetir saudação.\nNão assumir interesse.\nNão pressionar.\nNão insistir após "não".\nNão pedir CPF/CNPJ sem interesse claro.\nSe recusar: "Perfeito, fico à disposição."',
  safety_rules: 'Se perguntarem de onde veio o contato, responder que o número está em bases públicas de empresas.\nNão dar orientação jurídica ou contábil; orientar a validar com o contador.',
  style_rules: 'Mensagens curtas com no máximo 400 caracteres.\nTom natural e humano.\nSempre conduzir a conversa.\nNão parecer robô.',
  extra_instructions: '',
});

function encodePromptConfig(config: AgentPromptConfig) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary);
}

function decodePromptConfig(encoded: string) {
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as AgentPromptConfig;
  } catch {
    return null;
  }
}

function extractStoredPromptConfig(systemPrompt?: string | null) {
  if (!systemPrompt) return null;

  const startIndex = systemPrompt.indexOf(PROMPT_CONFIG_MARKER_START);
  const endIndex = systemPrompt.indexOf(PROMPT_CONFIG_MARKER_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return null;

  const encoded = systemPrompt
    .slice(startIndex + PROMPT_CONFIG_MARKER_START.length, endIndex)
    .trim();

  return decodePromptConfig(encoded);
}

function stripStoredPromptConfig(systemPrompt?: string | null) {
  if (!systemPrompt) return '';

  const startIndex = systemPrompt.indexOf(PROMPT_CONFIG_MARKER_START);
  const endIndex = systemPrompt.indexOf(PROMPT_CONFIG_MARKER_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return systemPrompt.trim();

  return `${systemPrompt.slice(0, startIndex)}${systemPrompt.slice(endIndex + PROMPT_CONFIG_MARKER_END.length)}`.trim();
}

function buildStructuredSystemPrompt(config: AgentPromptConfig) {
  return `
HOJE É: {{ $now.format('FFFF') }}
TELEFONE: {{ $('Info').item.json.telefone }}
ID: {{ $('Info').item.json.id_conversa }}

## PAPEL
Você é ${config.agent_name}, ${config.role_description}
Você representa ${config.company_name}.

## MISSAO
${config.mission}

## CONTEXTO
${config.lead_context}

## PRODUTO
${config.product_name} - ${config.product_price}

Usos:
${config.product_uses}

## PRIMEIRA RESPOSTA (OBRIGATORIO)
${config.first_response_rule}

Exemplo:
${config.first_response_example}

## FLUXO
${config.flow_steps}

## REGRAS CRITICAS
${config.critical_rules}

## SEGURANCA
${config.safety_rules}

## ESTILO
${config.style_rules}
${config.extra_instructions ? `\n## INSTRUCOES EXTRAS\n${config.extra_instructions}` : ''}
`.trim();
}

function buildStoredSystemPrompt(config: AgentPromptConfig) {
  return `${buildStructuredSystemPrompt(config)}\n\n${PROMPT_CONFIG_MARKER_START}${encodePromptConfig(config)}${PROMPT_CONFIG_MARKER_END}`;
}

export function AgentPage() {
  const { workspace } = useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'timing' | 'tags'>('general');
  const [isActive, setIsActive] = useState(false);
  const [promptConfig, setPromptConfig] = useState<AgentPromptConfig>(defaultPromptConfig());
  const [model, setModel] = useState('gemini-2.5-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);
  const [apiKey, setApiKey] = useState('');
  const [fallbackMessage, setFallbackMessage] = useState('Um atendente irá te responder em breve. 😊');
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(2);
  const [messageGapSeconds, setMessageGapSeconds] = useState(1);
  const [quietWindowSeconds, setQuietWindowSeconds] = useState(15);
  const [contextMessageLimit, setContextMessageLimit] = useState(40);
  const [tagRules, setTagRules] = useState<AgentTagRule[]>([]);

  const loadSettings = useCallback(async () => {
    if (!workspace) return;
    const { data } = await supabase
      .from('agent_settings')
      .select('*')
      .eq('workspace_id', workspace.id)
      .single();

    if (data) {
      const savedPromptConfig = data.prompt_config || extractStoredPromptConfig(data.system_prompt);

      setIsActive(Boolean(data.is_active));
      setPromptConfig(
        savedPromptConfig
          ? { ...defaultPromptConfig(), ...savedPromptConfig }
          : {
              ...defaultPromptConfig(),
              extra_instructions: stripStoredPromptConfig(data.system_prompt),
            }
      );
      setModel(data.model || 'gemini-2.5-flash');
      setTemperature(Number(data.temperature || 0.7));
      setMaxTokens(Number(data.max_tokens || 500));
      setFallbackMessage(data.fallback_message || 'Um atendente ira te responder.');
      setApiKey(data.gemini_api_key || '');
      setResponseDelaySeconds(Number(data.response_delay_seconds || 2));
      setMessageGapSeconds(Number(data.message_gap_seconds || 1));
      setQuietWindowSeconds(Number(data.quiet_window_seconds || 15));
      setContextMessageLimit(Number(data.context_message_limit || 40));
      setTagRules(Array.isArray(data.tag_rules) ? data.tag_rules : []);
    }
  }, [workspace]);

  useRefreshOnFocus(loadSettings, '/agent');

  const handleSave = async () => {
    if (!workspace) return;
    setIsLoading(true);

    const sanitizedRules = tagRules
      .map((rule) => ({
        tag: rule.tag.trim(),
        mode: rule.mode,
        prompt: rule.mode === 'prompt_append' ? (rule.prompt || '').trim() : null,
      }))
      .filter((rule) => rule.tag);

    const baseRow = {
      workspace_id: workspace.id,
      is_active: isActive,
      system_prompt: buildStoredSystemPrompt(promptConfig),
      gemini_api_key: apiKey || null,
      model,
      temperature,
      max_tokens: maxTokens,
      fallback_message: fallbackMessage,
      response_delay_seconds: Math.max(0, responseDelaySeconds),
      message_gap_seconds: Math.max(0, messageGapSeconds),
      quiet_window_seconds: Math.max(0, quietWindowSeconds),
      context_message_limit: Math.max(1, contextMessageLimit),
      tag_rules: sanitizedRules,
    };
    const rowWithPromptConfig = {
      ...baseRow,
      prompt_config: promptConfig,
    };

    const { data: existing } = await supabase
      .from('agent_settings')
      .select('id')
      .eq('workspace_id', workspace.id)
      .maybeSingle();

    let error = null;

    const saveWithRow = async (row: typeof baseRow | typeof rowWithPromptConfig) => (
      existing?.id
        ? await supabase.from('agent_settings').update(row).eq('id', existing.id)
        : await supabase.from('agent_settings').insert(row)
    );

    const primaryResult = await saveWithRow(rowWithPromptConfig);
    error = primaryResult.error;

    if (error?.message?.includes('prompt_config')) {
      const fallbackResult = await saveWithRow(baseRow);
      error = fallbackResult.error;
      if (!error) {
        setIsLoading(false);
        toast.success('Configurações salvas! A estrutura nova será ativada após aplicar a migration do banco.');
        return;
      }
    }

    setIsLoading(false);
    if (error) {
      console.error(error);
      toast.error('Erro ao salvar config IA.');
      return;
    }
    toast.success('Configurações do Agente salvas!');
  };

  const updateTagRule = (index: number, patch: Partial<AgentTagRule>) => {
    setTagRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  const updatePromptConfig = (field: keyof AgentPromptConfig, value: string) => {
    setPromptConfig((current) => ({ ...current, [field]: value }));
  };

  const tabs = [
    { id: 'general' as const, label: 'Geral', icon: Sparkles },
    { id: 'timing' as const, label: 'Timing', icon: Clock3 },
    { id: 'tags' as const, label: 'Tags', icon: Tags },
  ];

  return (
    <div className="page-shell page-stack mobile-safe-bottom animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-neon-purple to-purple-700 flex items-center justify-center shadow-lg shadow-neon-purple/20">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="section-title text-2xl md:text-3xl">Agente IA</h1>
            <p className="section-subtitle mt-0.5">Prompt, regras por tag, delay e contexto</p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Badge variant={isActive ? 'success' : 'warning'} dot={isActive}>
            {isActive ? 'Ativo' : 'Desativado'}
          </Badge>
          <Button
            className="w-full sm:w-auto"
            variant={isActive ? 'danger' : 'primary'}
            icon={isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
            onClick={() => setIsActive(!isActive)}
          >
            Alternar
          </Button>
          <Button className="w-full sm:w-auto" icon={<Save className="w-4 h-4" />} onClick={handleSave} loading={isLoading}>
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex w-full gap-1 overflow-x-auto p-1 bg-surface-800 rounded-xl border border-white/[0.04] sm:w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-surface-700 text-white shadow-sm' : 'text-text-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2 glass-panel p-5 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-5 h-5 text-neon-green" />
                <h2 className="font-semibold text-white">Chave API do Google Gemini</h2>
              </div>
              <Input
                type="password"
                placeholder="AIzaSyA..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-text-400 mt-2">
                Você pode pegar sua chave gratuitamente no{' '}
                <a href="https://aistudio.google.com/" className="text-neon-blue hover:underline" target="_blank" rel="noreferrer">
                  Google AI Studio
                </a>.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Nome do agente" value={promptConfig.agent_name} onChange={(e) => updatePromptConfig('agent_name', e.target.value)} />
              <Input label="Empresa" value={promptConfig.company_name} onChange={(e) => updatePromptConfig('company_name', e.target.value)} />
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Papel do agente</label>
                <textarea value={promptConfig.role_description} onChange={(e) => updatePromptConfig('role_description', e.target.value)} rows={3} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Missão</label>
                <textarea value={promptConfig.mission} onChange={(e) => updatePromptConfig('mission', e.target.value)} rows={3} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Contexto do lead</label>
                <textarea value={promptConfig.lead_context} onChange={(e) => updatePromptConfig('lead_context', e.target.value)} rows={4} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <Input label="Produto" value={promptConfig.product_name} onChange={(e) => updatePromptConfig('product_name', e.target.value)} />
              <Input label="Preco" value={promptConfig.product_price} onChange={(e) => updatePromptConfig('product_price', e.target.value)} />
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Usos do produto</label>
                <textarea value={promptConfig.product_uses} onChange={(e) => updatePromptConfig('product_uses', e.target.value)} rows={4} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Regra da primeira resposta</label>
                <textarea value={promptConfig.first_response_rule} onChange={(e) => updatePromptConfig('first_response_rule', e.target.value)} rows={4} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Exemplo da primeira resposta</label>
                <textarea value={promptConfig.first_response_example} onChange={(e) => updatePromptConfig('first_response_example', e.target.value)} rows={6} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Fluxo da conversa</label>
                <textarea value={promptConfig.flow_steps} onChange={(e) => updatePromptConfig('flow_steps', e.target.value)} rows={5} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Regras críticas</label>
                <textarea value={promptConfig.critical_rules} onChange={(e) => updatePromptConfig('critical_rules', e.target.value)} rows={5} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Segurança</label>
                <textarea value={promptConfig.safety_rules} onChange={(e) => updatePromptConfig('safety_rules', e.target.value)} rows={4} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Estilo</label>
                <textarea value={promptConfig.style_rules} onChange={(e) => updatePromptConfig('style_rules', e.target.value)} rows={4} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-text-200 mb-1">Instruções extras</label>
                <textarea value={promptConfig.extra_instructions} onChange={(e) => updatePromptConfig('extra_instructions', e.target.value)} rows={4} className="w-full glass-input h-auto resize-none text-sm leading-relaxed" placeholder="Regras complementares opcionais." />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="glass-panel p-5">
              <h3 className="font-medium text-white text-sm mb-3">Modelo</h3>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="glass-input w-full h-10 outline-none"
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              </select>
            </div>

            <div className="glass-panel p-5">
              <div className="flex justify-between mb-3">
                <h3 className="font-medium text-white text-sm">Temperatura</h3>
                <span className="text-neon-green text-sm">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-neon-green cursor-pointer"
              />
            </div>

            <div className="glass-panel p-5">
              <Input
                label="Maximo de tokens"
                type="number"
                value={String(maxTokens)}
                onChange={(e) => setMaxTokens(Number(e.target.value) || 500)}
              />
            </div>

            <div className="glass-panel p-5">
              <h3 className="font-medium text-white text-sm mb-3">Fallback (Erro IA)</h3>
              <textarea
                value={fallbackMessage}
                onChange={(e) => setFallbackMessage(e.target.value)}
                rows={3}
                className="glass-input w-full px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="glass-panel p-5">
              <h3 className="font-medium text-white text-sm mb-3">Preview do prompt gerado</h3>
              <textarea
                value={buildStructuredSystemPrompt(promptConfig)}
                readOnly
                rows={14}
                className="glass-input w-full px-3 py-2 text-xs resize-none font-mono text-text-300"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timing' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
          <div className="glass-panel p-5 space-y-4">
            <h2 className="font-semibold text-white">Tempos do Agente</h2>
            <Input
              label="Tempo de resposta apos a janela silenciosa (segundos)"
              type="number"
              value={String(responseDelaySeconds)}
              onChange={(e) => setResponseDelaySeconds(Number(e.target.value) || 0)}
            />
            <Input
              label="Janela para juntar novas mensagens antes de responder (segundos)"
              type="number"
              value={String(quietWindowSeconds)}
              onChange={(e) => setQuietWindowSeconds(Number(e.target.value) || 0)}
            />
            <Input
              label="Delay entre uma mensagem do agente e a proxima (segundos)"
              type="number"
              value={String(messageGapSeconds)}
              onChange={(e) => setMessageGapSeconds(Number(e.target.value) || 0)}
            />
            <Input
              label="Quantidade maxima de mensagens no contexto"
              type="number"
              value={String(contextMessageLimit)}
              onChange={(e) => setContextMessageLimit(Number(e.target.value) || 1)}
            />
          </div>

          <div className="glass-panel p-5 space-y-3">
            <h2 className="font-semibold text-white">Como funciona</h2>
            <p className="text-sm text-text-300">
              O agente espera a janela silenciosa para ver se o contato manda mais mensagens. Se entrar mais de uma
              mensagem nessa janela, ele responde considerando todas juntas.
            </p>
            <p className="text-sm text-text-300">
              Depois disso, respeita o tempo de resposta e quebra a resposta em blocos menores, com o delay configurado
              entre eles.
            </p>
            <p className="text-sm text-text-300">
              O limite de contexto define quantas mensagens mais recentes entram no raciocínio do agente.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'tags' && (
        <div className="glass-panel p-5 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Regras por Tag</h2>
              <p className="text-sm text-text-400">Exemplo: `agente-off` desliga a resposta automatica.</p>
            </div>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setTagRules((current) => [...current, defaultTagRule()])}>
              Nova Regra
            </Button>
          </div>

          {tagRules.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-text-400">
              Nenhuma regra criada ainda. Adicione uma regra para desligar o agente por tag ou anexar instruções
              específicas ao prompt.
            </div>
          )}

          <div className="space-y-4">
            {tagRules.map((rule, index) => (
              <div key={`${index}-${rule.tag}`} className="rounded-2xl border border-white/[0.06] bg-surface-800/40 p-4 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_auto] gap-3 items-start">
                  <Input
                    label="Tag"
                    placeholder="agente-off"
                    value={rule.tag}
                    onChange={(e) => updateTagRule(index, { tag: e.target.value })}
                  />
                  <div>
                    <label className="block text-sm text-text-200 mb-1">Comportamento</label>
                    <select
                      value={rule.mode}
                      onChange={(e) => updateTagRule(index, { mode: e.target.value as AgentTagRule['mode'] })}
                      className="glass-input w-full h-10 outline-none"
                    >
                      <option value="agent_off">Desligar agente</option>
                      <option value="prompt_append">Acrescentar instrução ao prompt</option>
                    </select>
                  </div>
                  <div className="pt-6">
                    <Button
                      variant="ghost"
                      icon={<Trash2 className="w-4 h-4" />}
                      onClick={() => setTagRules((current) => current.filter((_, i) => i !== index))}
                    >
                      Remover
                    </Button>
                  </div>
                </div>

                {rule.mode === 'prompt_append' && (
                  <div>
                    <label className="block text-sm text-text-200 mb-1">Instrução adicional</label>
                    <textarea
                      value={rule.prompt || ''}
                      onChange={(e) => updateTagRule(index, { prompt: e.target.value })}
                      rows={4}
                      className="w-full glass-input h-auto resize-none text-sm leading-relaxed"
                      placeholder="Quando o contato tiver essa tag, acrescente esta instrução ao comportamento do agente."
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
