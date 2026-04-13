import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { Avatar } from '@/components/ui/Avatar';
import type { Conversation } from '@/types/database';

interface ChatListItemProps {
  conversation: Conversation;
}

export function ChatListItem({ conversation }: ChatListItemProps) {
  const { activeConversation, setActiveConversation } = useChatStore();

  const isActive = activeConversation?.id === conversation.id;
  const contact = conversation.contact;

  return (
    <div
      onClick={() => setActiveConversation(conversation)}
      className={`
        relative p-3 flex items-center gap-3 cursor-pointer rounded-xl transition-all duration-200 group
        ${isActive
          ? 'bg-surface-800 shadow-sm border border-white/[0.06] transform scale-[1.01]'
          : 'hover:bg-surface-800/50 border border-transparent hover:border-white/[0.02]'
        }
      `}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-neon-green rounded-r-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
      )}

      <div className="relative shrink-0 ml-1">
        <Avatar name={contact?.name || conversation.contact_id} size="md" />
        {conversation.is_ai_active && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-neon-purple rounded-lg border-2 border-surface-900 flex items-center justify-center shadow-sm">
            <Bot className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <h3 className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-text-100 group-hover:text-white'}`}>
            {contact?.name || 'Desconhecido'}
          </h3>
          {conversation.last_message_at && (
            <span className={`text-[10px] font-medium shrink-0 ml-2 ${conversation.unread_count > 0 ? 'text-neon-green' : 'text-text-400'}`}>
              {formatDistanceToNow(new Date(conversation.last_message_at), { locale: ptBR, addSuffix: true }).replace('cerca de ', '')}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs truncate flex-1 ${isActive ? 'text-text-200' : 'text-text-400 group-hover:text-text-300'} ${conversation.unread_count > 0 ? 'font-semibold text-white' : ''}`}>
            {conversation.last_message_preview || 'Nova conversa'}
          </p>

          {conversation.unread_count > 0 && (
            <span className="shrink-0 w-5 h-5 bg-neon-green rounded-full flex items-center justify-center text-[10px] font-bold text-surface-900 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
