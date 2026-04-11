import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';
import {
  Bot, Save, Power, PowerOff, Sparkles, MessageSquare,
  Thermometer, Hash, AlertTriangle, Key,
} from 'lucide-react';

export function AgentPage() {
  const { workspace } = useAuthStore();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(500);
  const [apiKey, setApiKey] = useState('');
  const [fallbackMessage, setFallbackMessage] = useState('Um atendente irá te responder em breve. 😊');

  useEffect(() => {
    async function loadSettings() {
      if (!workspace) return;
      const { data, error } = await supabase
        .from('agent_settings')
        .select('*')
        .eq('workspace_id', workspace.id)
        .single();
        
      if (data) {
        setIsActive(data.is_active);
        if (data.system_prompt) setSystemPrompt(data.system_prompt);
        setModel(data.model || 'gemini-2.0-flash');
        setTemperature(data.temperature || 0.7);
        setMaxTokens(data.max_tokens || 500);
        setFallbackMessage(data.fallback_message || 'Um atendente irá te responder.');
        setApiKey(data.gemini_api_key || '');
      }
    }
    loadSettings();
  }, [workspace]);

  const handleSave = async () => {
    if (!workspace) return;
    setIsLoading(true);
    const { error } = await supabase
      .from('agent_settings')
      .upsert({
        workspace_id: workspace.id,
        is_active: isActive,
        system_prompt: systemPrompt,
        gemini_api_key: apiKey,
        model,
        temperature,
        max_tokens: maxTokens,
        fallback_message: fallbackMessage
      });
      
    setIsLoading(false);
    if (error) {
       console.error(error);
       toast.error("Erro ao salvar config IA.");
    }
    else toast.success("Configurações do Agente salvas!");
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-neon-purple to-purple-700 flex items-center justify-center shadow-lg shadow-neon-purple/20">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">Agente IA</h1>
            <p className="text-sm text-text-400 mt-0.5">Configure seu Google Gemini API</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isActive ? 'success' : 'warning'} dot={isActive}>
            {isActive ? 'Ativo' : 'Desativado'}
          </Badge>
          <Button
            variant={isActive ? 'danger' : 'primary'}
            icon={isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
            onClick={() => setIsActive(!isActive)}
          >
             Alternar
          </Button>
          <Button icon={<Save className="w-4 h-4" />} onClick={handleSave} loading={isLoading}>Salvar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
             <p className="text-xs text-text-400 mt-2">Você pode pegar sua chave gratuitamente no <a href="https://aistudio.google.com/" className="text-neon-blue hover:underline" target="_blank" rel="noreferrer">Google AI Studio</a>.</p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-neon-purple" />
              <h2 className="font-semibold text-white">System Prompt</h2>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className="w-full glass-input h-auto resize-none font-mono text-sm leading-relaxed"
              placeholder="Você é um excelente vendedor..."
            />
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
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
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
            <h3 className="font-medium text-white text-sm mb-3">Fallback (Erro IA)</h3>
            <textarea
              value={fallbackMessage}
              onChange={(e) => setFallbackMessage(e.target.value)}
              rows={3}
              className="glass-input w-full px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
