import { format } from 'date-fns';
import { Check, CheckCheck, Bot } from 'lucide-react';
import type { Message } from '@/types/database';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const time = format(new Date(message.created_at), 'HH:mm');

  return (
    <div className={`flex w-full mb-4 px-4 ${isOutbound ? 'justify-end' : 'justify-start'} animate-slide-up`} style={{ animationDuration: '0.3s' }}>
      <div 
        className={`
          relative max-w-[85%] md:max-w-[70%] lg:max-w-[60%] px-4 py-3 
          ${isOutbound ? 'bubble-out' : 'bubble-in'}
        `}
      >
        {/* Indicators for AI */}
        {isOutbound && message.is_from_ai && (
          <div className="flex items-center gap-1 mb-1 opacity-80">
            <Bot className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold tracking-wider uppercase">IA Automática</span>
          </div>
        )}

        {/* Content */}
        <div className="text-sm font-medium leading-relaxed break-words whitespace-pre-wrap">
          {message.type === 'text' || message.type === 'template' ? (
            message.content
          ) : (
            <div className="flex flex-col gap-2">
              <span className="italic opacity-80">[Mídia: {message.type}]</span>
              {message.content && <span>{message.content}</span>}
            </div>
          )}
        </div>

        {/* Footer (Time & Status) */}
        <div className={`flex items-center justify-end gap-1 mt-1.5 ${isOutbound ? 'text-neon-green/80' : 'text-text-400'}`}>
          <span className="text-[10px] font-medium">{time}</span>
          {isOutbound && (
             <span className="ml-0.5">
               {message.status === 'read' ? (
                 <CheckCheck className="w-3.5 h-3.5 text-neon-blue drop-shadow-sm" />
               ) : message.status === 'delivered' ? (
                 <CheckCheck className="w-3.5 h-3.5 opacity-70" />
               ) : message.status === 'failed' ? (
                 <span className="text-[10px] text-red-400 font-bold">Erro</span>
               ) : (
                 <Check className="w-3.5 h-3.5 opacity-70" />
               )}
             </span>
          )}
        </div>
      </div>
    </div>
  );
}
