import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useTemplateStore, WhatsAppTemplate } from '@/stores/templateStore';
import { Search, Send, FileText, MessageSquare } from 'lucide-react';

interface TemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (templateName: string, language: string, components?: unknown[]) => void;
  isSending?: boolean;
}

export function TemplatePicker({ isOpen, onClose, onSend, isSending }: TemplatePickerProps) {
  const { templates, isLoading, fetchTemplates } = useTemplateStore();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<WhatsAppTemplate | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && templates.length === 0) {
      fetchTemplates();
    }
  }, [isOpen, templates.length, fetchTemplates]);

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setParams({});
      setSearch('');
    }
  }, [isOpen]);

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category?.toLowerCase().includes(search.toLowerCase())
  );

  const getBodyText = (template: WhatsAppTemplate) => {
    const bodyComp = template.components?.find((c) => c.type === 'BODY');
    return bodyComp?.text || '';
  };

  const getVariableCount = (template: WhatsAppTemplate) => {
    const body = getBodyText(template);
    const matches = body.match(/\{\{(\d+)\}\}/g);
    return matches ? matches.length : 0;
  };

  const handleSend = () => {
    if (!selected) return;

    const varCount = getVariableCount(selected);
    let components: unknown[] | undefined;

    if (varCount > 0) {
      const parameters = Array.from({ length: varCount }, (_, i) => ({
        type: "text",
        text: params[String(i + 1)] || "",
      }));
      components = [{ type: "body", parameters }];
    }

    onSend(selected.name, selected.language || 'pt_BR', components);
  };

  if (selected) {
    const body = getBodyText(selected);
    const varCount = getVariableCount(selected);

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Enviar Template" size="md" footer={
        <>
          <Button variant="ghost" onClick={() => setSelected(null)}>Voltar</Button>
          <Button icon={<Send className="w-4 h-4" />} onClick={handleSend} loading={isSending}>Enviar</Button>
        </>
      }>
        <div className="space-y-4">
          <div className="p-4 bg-surface-800 rounded-xl border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-neon-green uppercase tracking-wider">{selected.category}</span>
              <span className="text-xs text-text-400">{selected.language}</span>
            </div>
            <h3 className="text-white font-semibold mb-2">{selected.name}</h3>
            <p className="text-sm text-text-300 whitespace-pre-wrap">{body || 'Sem texto no body'}</p>
          </div>

          {varCount > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-text-200">Preencha as variaveis ({varCount}):</p>
              {Array.from({ length: varCount }, (_, i) => (
                <Input
                  key={i}
                  label={`Variavel {{${i + 1}}}`}
                  placeholder={`Valor para {{${i + 1}}}`}
                  value={params[String(i + 1)] || ''}
                  onChange={(e) => setParams(prev => ({ ...prev, [String(i + 1)]: e.target.value }))}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Templates WhatsApp" size="lg">
      <div className="space-y-4">
        <Input
          placeholder="Buscar template..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="w-4 h-4" />}
        />

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-text-400">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{templates.length === 0 ? 'Nenhum template aprovado encontrado na sua conta Meta.' : 'Nenhum resultado.'}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filtered.map(t => (
              <button
                key={`${t.name}-${t.language}`}
                onClick={() => setSelected(t)}
                className="w-full text-left p-4 rounded-xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] hover:border-neon-green/20 transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-white group-hover:text-neon-green transition-colors">{t.name}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neon-green/10 text-neon-green uppercase">
                    {t.category}
                  </span>
                </div>
                <p className="text-xs text-text-400 line-clamp-2">{getBodyText(t) || 'Template sem body text'}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-text-400">{t.language}</span>
                  {getVariableCount(t) > 0 && (
                    <span className="text-[10px] text-text-400">{getVariableCount(t)} variavel(is)</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => fetchTemplates()} loading={isLoading}>Recarregar Templates</Button>
        </div>
      </div>
    </Modal>
  );
}
