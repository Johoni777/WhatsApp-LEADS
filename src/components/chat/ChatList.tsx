import { useMemo, useState } from 'react';
import { Search, Filter, MessageCircle, X } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { ChatListItem } from './ChatListItem';

const FILTER_OPTIONS = [
  { value: 'all' as const, label: 'Todos' },
  { value: 'unread' as const, label: 'Nao lidos' },
  { value: 'ai' as const, label: 'IA Ativa' },
];

export function ChatList() {
  const { conversations, searchQuery, setSearchQuery, filterStatus, setFilterStatus, fetchConversations } = useChatStore();
  const [showFilters, setShowFilters] = useState(true);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filterStatus === 'unread') {
      result = result.filter(c => c.unread_count > 0);
    } else if (filterStatus === 'ai') {
      result = result.filter(c => c.is_ai_active);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => {
        const name = c.contact?.name?.toLowerCase() || '';
        const phone = c.contact?.phone || '';
        const preview = c.last_message_preview?.toLowerCase() || '';
        return name.includes(q) || phone.includes(q) || preview.includes(q);
      });
    }

    return result;
  }, [conversations, searchQuery, filterStatus]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-surface-900 border-r border-white/[0.04]">
      <div className="p-3 md:p-4 bg-surface-900/95 backdrop-blur-md sticky top-0 z-10 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-display font-bold text-white tracking-tight">Inbox</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors border ${showFilters || filterStatus !== 'all' ? 'text-neon-green bg-neon-green/10 border-neon-green/20' : 'text-text-400 hover:text-white bg-surface-800 border-white/[0.04]'}`}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="flex gap-1.5 mb-3 animate-fade-in overflow-x-auto pb-1">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  setFilterStatus(opt.value);
                  fetchConversations();
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${filterStatus === opt.value ? 'bg-white text-surface-900' : 'bg-surface-800 text-text-300 hover:text-white border border-white/[0.04]'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-text-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-800 border border-white/[0.04] text-white text-sm rounded-xl focus:ring-1 focus:ring-neon-green focus:border-neon-green/50 block pl-10 pr-8 p-2.5 placeholder-text-400 transition-all duration-200"
            placeholder="Buscar por nome, telefone..."
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 h-0 overflow-y-auto px-2 pb-4 mobile-scroll-y">
        {filtered.map((conv) => (
          <ChatListItem key={conv.id} conversation={conv} />
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-400 p-4 text-center">
            <MessageCircle className="w-8 h-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">
              {searchQuery || filterStatus !== 'all' ? 'Nenhum resultado encontrado' : 'Nenhuma conversa ainda'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
