import { Avatar } from '@/components/ui/Avatar';
import { formatPhone } from '@/utils/formatters';
import { ArrowLeft, Phone, MoreVertical, Bot } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import type { Conversation } from '@/types/database';

interface ChatHeaderProps {
  conversation: Conversation;
  onOpenContact?: () => void;
}

export function ChatHeader({ conversation, onOpenContact }: ChatHeaderProps) {
  const { isMobile } = useUIStore();
  const { setActiveConversation } = useChatStore();
  const contact = conversation.contact;

  return (
    <div className="h-[68px] md:h-[72px] shrink-0 bg-surface-900/80 backdrop-blur-xl border-b border-white/[0.04] px-2.5 md:px-4 flex items-center justify-between gap-2 z-10 sticky top-0 shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 md:gap-3">
        {isMobile && (
          <button
            onClick={() => setActiveConversation(null)}
            className="p-2 -ml-2 text-text-300 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <div className="relative group cursor-pointer" onClick={onOpenContact}>
          <Avatar name={contact?.name || conversation.contact_id} size="md" />
          <div className="absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-white/20 transition-all" />
        </div>

        <div className="min-w-0">
          <h2
            className="truncate font-semibold text-white text-sm md:text-base leading-tight cursor-pointer hover:underline"
            onClick={onOpenContact}
          >
            {contact?.name || formatPhone(contact?.phone || '') || 'Desconhecido'}
          </h2>
          <div className="mt-0.5 flex items-center gap-2 overflow-hidden">
            {conversation.is_ai_active ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-neon-purple bg-neon-purple/10 px-2 py-0.5 rounded-full border border-neon-purple/20">
                <Bot className="w-3 h-3" />
                IA Ativa
              </span>
            ) : (
              <span className="text-[11px] text-text-400">Atendimento Manual</span>
            )}
            
            {contact?.tags && contact.tags.length > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-surface-600" />
                <div className="flex gap-1 min-w-0 overflow-hidden">
                  {contact.tags.slice(0, 2).map((tag, i) => (
                    <span key={i} className="truncate text-[10px] text-text-300 uppercase tracking-wider">
                      {tag}
                      {i < 1 && contact.tags!.length > 1 ? ',' : ''}
                    </span>
                  ))}
                  {contact.tags.length > 2 && <span className="text-[10px] text-text-300">+{contact.tags.length - 2}</span>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 md:gap-1">
        <button className="p-2 text-text-300 hover:text-white hover:bg-surface-800 rounded-xl transition-all">
          <Phone className="w-4 h-4" />
        </button>
        <button className="p-2 text-text-300 hover:text-white hover:bg-surface-800 rounded-xl transition-all">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
