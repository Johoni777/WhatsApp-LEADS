import { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, Mic, Smile, File, Image as ImageIcon } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';

export function MessageInput() {
  const { sendMessage, isSending } = useChatStore();
  const [message, setMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    const current = message;
    setMessage('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    
    await sendMessage(current, 'text');
  };

  return (
    <div className="p-4 bg-surface-900 border-t border-white/[0.04] relative">
      {/* Attachment Menu Popover */}
      {showAttachMenu && (
        <div 
          ref={menuRef}
          className="absolute bottom-full left-4 mb-2 p-2 bg-surface-800 border border-white/[0.06] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col gap-1 animate-slide-up origin-bottom-left"
        >
          <button className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-surface-700 text-sm font-medium text-white transition-colors">
            <div className="p-2 rounded-lg bg-neon-purple/20 text-neon-purple">
              <ImageIcon className="w-5 h-5" />
            </div>
            Fotos e Vídeos
          </button>
          <button className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-surface-700 text-sm font-medium text-white transition-colors">
            <div className="p-2 rounded-lg bg-neon-blue/20 text-neon-blue">
              <File className="w-5 h-5" />
            </div>
            Documento
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <button 
          onClick={() => setShowAttachMenu(!showAttachMenu)}
          className={`
            p-3 rounded-full transition-colors shrink-0 mb-1
            ${showAttachMenu ? 'bg-surface-700 text-white' : 'text-text-400 hover:text-white hover:bg-surface-800'}
          `}
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <div className="flex-1 relative bg-surface-800 border border-white/[0.06] rounded-3xl flex items-end min-h-[48px] focus-within:border-neon-green/40 focus-within:ring-1 focus-within:ring-neon-green/20 transition-all shadow-sm">
          <button className="p-3 text-text-400 hover:text-white shrink-0 transition-colors">
            <Smile className="w-5 h-5" />
          </button>
          
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isSending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Digite uma mensagem..."
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 px-2 text-white text-sm max-h-[120px] scrollbar-thin placeholder-text-400 disabled:opacity-50"
            rows={1}
          />

          {message.trim() ? (
            <button 
              onClick={handleSend}
              disabled={isSending}
              className="p-2.5 m-1.5 shrink-0 bg-neon-green text-surface-900 rounded-full hover:bg-neon-teal transition-colors shadow-lg shadow-neon-green/20 disabled:opacity-50"
            >
               <div className={isSending ? "animate-pulse" : ""}>
                 <Send className="w-4 h-4 ml-0.5" />
               </div>
            </button>
          ) : (
            <button className="p-3 text-text-400 hover:text-white shrink-0 transition-colors">
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
