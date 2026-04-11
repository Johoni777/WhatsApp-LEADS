import { Search, Filter, MessageCircle } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { ChatListItem } from './ChatListItem';

export function ChatList() {
  const { conversations } = useChatStore();

  return (
    <div className="h-full flex flex-col bg-surface-900 border-r border-white/[0.04]">
      {/* Header limpo e minimalista */}
      <div className="p-4 bg-surface-900/95 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold text-white tracking-tight">Inbox</h2>
          <div className="flex items-center gap-2">
            <button className="p-2 text-text-400 hover:text-white bg-surface-800 rounded-lg transition-colors border border-white/[0.04]">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 text-surface-900 hover:bg-white bg-white/90 rounded-lg transition-colors font-semibold shadow-sm">
              <MessageCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Input Premium */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-text-400" />
          </div>
          <input
            type="text"
            className="w-full bg-surface-800 border border-white/[0.04] text-white text-sm rounded-xl focus:ring-1 focus:ring-neon-green focus:border-neon-green/50 block pl-10 p-2.5 placeholder-text-400 transition-all duration-200"
            placeholder="Buscar mensagens..."
          />
        </div>
      </div>

      {/* Lista Flow */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-4">
        {conversations.map((conv) => (
          <ChatListItem key={conv.id} conversation={conv} />
        ))}
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-400 p-4 text-center">
            <MessageCircle className="w-8 h-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhuma conversa encontrada</p>
          </div>
        )}
      </div>
    </div>
  );
}
