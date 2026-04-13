import { useEffect, useRef } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useChatStore } from '@/stores/chatStore';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Bot, MessageCircle } from 'lucide-react';
import { ContactDetailModal } from '@/components/contacts/ContactDetailModal';
import { useAuthStore } from '@/stores/authStore';
import { useState } from 'react';

export function ChatWindow() {
  const { activeConversation, messages, isAgentTyping } = useChatStore();
  const { workspace } = useAuthStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showContactModal, setShowContactModal] = useState(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!activeConversation) {
    return (
      <div className="flex-1 min-h-0 min-w-0 flex flex-col items-center justify-center p-6 md:p-8 bg-surface-900 chat-mesh-bg text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900/80 to-transparent pointer-events-none" />
        <div className="w-24 h-24 rounded-3xl bg-surface-800 border border-white/[0.04] flex items-center justify-center mb-6 shadow-2xl relative z-10 animate-slide-up pt-1">
          <MessageCircle className="w-10 h-10 text-neon-green" />
        </div>
        <h2 className="text-2xl font-display font-bold text-white mb-2 relative z-10 animate-slide-up" style={{ animationDelay: '100ms' }}>
          ZapFlow Premium
        </h2>
        <p className="text-sm text-text-400 max-w-sm relative z-10 animate-slide-up" style={{ animationDelay: '200ms' }}>
          Selecione uma conversa para começar o atendimento. Responda manualmente ou deixe a IA cuidar disso.
        </p>
      </div>
    );
  }

  // Group messages by date
  const groupedMessages: Record<string, typeof messages> = {};
  messages.forEach((msg) => {
    const date = new Date(msg.created_at);
    const dateStr = format(date, 'yyyy-MM-dd');
    if (!groupedMessages[dateStr]) {
      groupedMessages[dateStr] = [];
    }
    groupedMessages[dateStr].push(msg);
  });

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-surface-900 border-l border-white/[0.04] relative">
      <ChatHeader conversation={activeConversation} onOpenContact={() => setShowContactModal(true)} />

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 h-0 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto chat-mesh-bg relative scroll-smooth mobile-scroll-y"
      >
        <div className="min-h-full py-4 md:py-6 flex flex-col">
          
          {/* Empty state for active chat */}
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-text-400 p-8">
              <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mb-4">
                <MessageCircle className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-center text-sm font-medium">Nenhuma mensagem ainda.</p>
              <p className="text-center text-xs mt-1">Envie uma mensagem para iniciar a conversa.</p>
            </div>
          )}

          {/* Messages grouped by date */}
          {Object.entries(groupedMessages).map(([dateStr, msgs]) => {
            const date = new Date(dateStr);
            const isToday = isSameDay(date, new Date());
            
            return (
              <div key={dateStr} className="flex flex-col">
                {/* Date separator */}
                <div className="flex justify-center my-6 sticky top-2 z-10">
                  <span className="px-3 py-1 bg-surface-800/80 backdrop-blur-md rounded-full text-[11px] font-bold text-text-200 border border-white/[0.04] shadow-sm uppercase tracking-wider">
                    {isToday ? 'Hoje' : format(date, "d 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>

                {/* Messages */}
                {msgs.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
              </div>
            );
          })}

          {isAgentTyping && (
            <div className="px-4 md:px-6 py-2">
              <div className="max-w-[80%] md:max-w-[70%] rounded-2xl bg-surface-800 border border-white/[0.06] px-4 py-3 text-sm text-text-300 inline-flex items-center gap-3">
                <span className="text-neon-purple text-xs font-medium">Digitando...</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-neon-purple/70 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-2 h-2 rounded-full bg-neon-purple/70 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-2 h-2 rounded-full bg-neon-purple/70 animate-bounce" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <MessageInput />

      <ContactDetailModal
        contact={activeConversation.contact || null}
        workspaceId={workspace?.id ?? null}
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
    </div>
  );
}
