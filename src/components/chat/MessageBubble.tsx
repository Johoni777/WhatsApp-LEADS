import { format } from 'date-fns';
import { Check, CheckCheck, Bot, FileText, Download, Play, Clock3 } from 'lucide-react';
import type { Message } from '@/types/database';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const time = format(new Date(message.created_at), 'HH:mm');

  const renderMedia = () => {
    switch (message.type) {
      case 'image':
        return (
          <div className="mb-2 -mx-1 -mt-1">
            {message.media_url ? (
              <img
                src={message.media_url}
                alt="image"
                className="rounded-xl max-w-full max-h-[300px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(message.media_url!, '_blank')}
              />
            ) : (
              <div className="h-32 rounded-xl bg-surface-700/50 flex items-center justify-center text-text-400 text-xs">Imagem</div>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="mb-2 -mx-1 -mt-1">
            {message.media_url ? (
              <video src={message.media_url} controls className="rounded-xl max-w-full max-h-[300px]" />
            ) : (
              <div className="h-32 rounded-xl bg-surface-700/50 flex items-center justify-center text-text-400">
                <Play className="w-8 h-8" />
              </div>
            )}
          </div>
        );

      case 'audio':
        return (
          <div className="mb-2">
            {message.media_url ? (
              <audio src={message.media_url} controls className="w-full max-w-[280px] h-10" />
            ) : (
              <div className="h-10 rounded-lg bg-surface-700/50 flex items-center justify-center text-text-400 text-xs px-3">Audio</div>
            )}
          </div>
        );

      case 'document':
        return (
          <a
            href={message.media_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 flex items-center gap-3 p-3 rounded-xl bg-surface-700/30 hover:bg-surface-700/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-neon-blue/20 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-neon-blue" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.content || 'Documento'}</p>
            </div>
            <Download className="w-4 h-4 text-text-400 shrink-0" />
          </a>
        );

      case 'sticker':
        return <div className="mb-2 text-4xl">🏷️</div>;

      case 'location':
        return (
          <div className="mb-2 p-3 rounded-xl bg-surface-700/30 text-xs">
            📍 {message.content}
          </div>
        );

      default:
        return null;
    }
  };

  const hasTextContent = message.type === 'text' || message.type === 'template';
  const hasCaption = !hasTextContent && message.content && message.type !== 'document' && message.type !== 'location';

  return (
    <div className={`flex w-full mb-4 px-4 ${isOutbound ? 'justify-end' : 'justify-start'} animate-slide-up`} style={{ animationDuration: '0.3s' }}>
      <div
        className={`relative max-w-[85%] md:max-w-[70%] lg:max-w-[60%] px-4 py-3 ${isOutbound ? 'bubble-out' : 'bubble-in'}`}
      >
        {isOutbound && message.is_from_ai && (
          <div className="flex items-center gap-1 mb-1 opacity-80">
            <Bot className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold tracking-wider uppercase">IA Automatica</span>
          </div>
        )}

        {!hasTextContent && renderMedia()}

        {hasTextContent && (
          <div className="text-sm font-medium leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
          </div>
        )}

        {hasCaption && (
          <div className="text-sm font-medium leading-relaxed break-words whitespace-pre-wrap mt-1">
            {message.content}
          </div>
        )}

        <div className={`flex items-center justify-end gap-1 mt-1.5 ${isOutbound ? 'text-neon-green/80' : 'text-text-400'}`}>
          <span className="text-[10px] font-medium">{time}</span>
          {isOutbound && (
            <span className="ml-0.5">
              {message.status === 'read' ? (
                <CheckCheck className="w-3.5 h-3.5 text-neon-blue drop-shadow-sm" />
              ) : message.status === 'delivered' ? (
                <CheckCheck className="w-3.5 h-3.5 opacity-70" />
              ) : message.status === 'sent' ? (
                <Check className="w-3.5 h-3.5 opacity-70" />
              ) : message.status === 'pending' ? (
                <Clock3 className="w-3.5 h-3.5 opacity-60" />
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
