import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useContactStore } from '@/stores/contactStore';
import type { Contact } from '@/types/database';
import { supabase } from '@/services/supabase';
import { Bot, Save, Phone, Tag, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface ContactDetailModalProps {
  contact: Contact | null;
  workspaceId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ContactDetailModal({
  contact,
  workspaceId,
  isOpen,
  onClose,
}: ContactDetailModalProps) {
  const { updateContact, bulkSetAI } = useContactStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [aiActive, setAiActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const lastContactRef = useRef<Contact | null>(null);

  if (contact) {
    lastContactRef.current = contact;
  }
  const displayContact = contact ?? lastContactRef.current;

  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!contact || !isOpen || !workspaceId) return;
    setName(contact.name || '');
    setPhone(contact.phone);
    setEmail(contact.email || '');
    setTagsStr((contact.tags || []).join(', '));
    setSaving(false);

    supabase
      .from('conversations')
      .select('is_ai_active')
      .eq('workspace_id', workspaceId)
      .eq('contact_id', contact.id)
      .maybeSingle()
      .then(({ data }) => {
        setAiActive(Boolean(data?.is_ai_active));
      });
  }, [contact?.id, isOpen, workspaceId]);

  const handleSave = async () => {
    if (!displayContact || !workspaceId) return;
    setSaving(true);
    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const rawPhone = phone.replace(/\D/g, '');
    const finalPhone =
      rawPhone.length <= 11 && rawPhone.length >= 10 ? '55' + rawPhone : rawPhone;

    if (!finalPhone || finalPhone.length < 10) {
      toast.error('Telefone invalido');
      setSaving(false);
      return;
    }

    const u = await updateContact(displayContact.id, {
      name: name.trim() || null,
      phone: finalPhone,
      email: email.trim() || null,
      tags,
    });
    if (u.error) {
      toast.error(u.error);
      setSaving(false);
      return;
    }

    const aiRes = await bulkSetAI([displayContact.id], aiActive);
    if (aiRes.error) {
      toast.error(aiRes.error);
      setSaving(false);
      return;
    }

    toast.success('Contato atualizado');
    setSaving(false);
    onClose();
  };

  if (!rendered) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center p-0 sm:items-center sm:p-6">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`
          relative w-full max-w-md max-h-[92vh] sm:max-h-[calc(100vh-48px)]
          bg-surface-900 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]
          transition-all duration-300 transform
          rounded-t-3xl sm:rounded-2xl overflow-hidden
          ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 md:p-6 border-b border-white/[0.06]">
          <h2 className="min-w-0 text-base md:text-lg font-bold text-white truncate">
            Configuracoes do contato
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-text-400 hover:text-white bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 max-h-[calc(92vh-132px)] sm:max-h-[calc(100vh-200px)] overflow-y-auto space-y-4">
          {displayContact && (
            <>
              <Input
                label="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do contato"
              />
              <Input
                label="Telefone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                icon={<Phone className="w-4 h-4" />}
              />
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
              <Input
                label="Tags"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="vip, lead, cliente"
                icon={<Tag className="w-4 h-4" />}
              />
              <p className="text-xs text-text-400 -mt-2">Separe varias tags por virgula.</p>

              <label className="flex items-start gap-3 p-3 rounded-xl bg-surface-800/50 border border-white/[0.06] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={aiActive}
                  onChange={(e) => setAiActive(e.target.checked)}
                  className="mt-1 rounded border-white/20 accent-neon-purple"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium text-white">
                    <Bot className="w-4 h-4 text-neon-purple" />
                    Atendimento com agente IA
                  </span>
                  <span className="text-xs text-text-400 block mt-0.5">
                    Quando ativo, mensagens deste contato serao respondidas automaticamente pelo
                    agente (se configurado no workspace).
                  </span>
                </span>
              </label>

              <p className="text-xs text-text-500">
                Origem:{' '}
                {displayContact.source === 'google_sheets' ? 'Planilha' : displayContact.source} ·
                Criado em {new Date(displayContact.created_at).toLocaleString('pt-BR')}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 p-4 md:p-6 border-t border-white/[0.06] bg-surface-800/30">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={<Save className="w-4 h-4" />} onClick={handleSave} loading={saving}>
            Salvar
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
