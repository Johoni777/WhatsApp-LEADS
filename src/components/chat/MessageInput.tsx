import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Send, Mic, Square, Smile, File as FileIcon, Image as ImageIcon, X, Trash2, LayoutTemplate } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useTemplateStore } from '@/stores/templateStore';
import { TemplatePicker } from './TemplatePicker';
import { Modal } from '@/components/ui/Modal';
import type { Message } from '@/types/database';
import toast from 'react-hot-toast';
import lamejs from 'lamejs';

export function MessageInput() {
  const { sendMessage, isSending, activeConversation } = useChatStore();
  const { sendTemplate, isSending: isSendingTemplate } = useTemplateStore();
  const [message, setMessage] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ file: File; type: Message['type']; preview?: string } | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioReady, setAudioReady] = useState<File | null>(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (selectedFile?.preview) {
        URL.revokeObjectURL(selectedFile.preview);
      }
    };
  }, [selectedFile?.preview]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const transcodeAudioToMp3 = useCallback(async (blob: Blob) => {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error('AudioContext indisponivel');
    }

    const audioContext = new AudioContextCtor();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      const samples = new Float32Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        let total = 0;
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          total += decoded.getChannelData(ch)[i] || 0;
        }
        samples[i] = total / decoded.numberOfChannels;
      }

      const samples16 = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        samples16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const encoder = new lamejs.Mp3Encoder(1, decoded.sampleRate, 128);
      const blockSize = 1152;
      const mp3Chunks: Uint8Array[] = [];

      for (let i = 0; i < samples16.length; i += blockSize) {
        const sampleChunk = samples16.subarray(i, i + blockSize);
        const encoded = encoder.encodeBuffer(sampleChunk);
        if (encoded.length > 0) {
          mp3Chunks.push(new Uint8Array(encoded));
        }
      }

      const flushed = encoder.flush();
      if (flushed.length > 0) {
        mp3Chunks.push(new Uint8Array(flushed));
      }

      const mp3Blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
      return new File([mp3Blob], `audio_${Date.now()}.mp3`, { type: 'audio/mpeg' });
    } finally {
      await audioContext.close();
    }
  }, []);

  const handleSend = async () => {
    if (isSending) return;

    if (selectedFile) {
      const caption = message.trim() || undefined;
      await sendMessage(caption || selectedFile.file.name, selectedFile.type, selectedFile.file);
      setSelectedFile(null);
      setMessage('');
      return;
    }

    if (!message.trim()) return;
    const current = message;
    setMessage('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    await sendMessage(current, 'text');
  };

  const handleFileSelect = (accept: string, type: Message['type']) => {
    if (!fileInputRef.current) return;

    fileInputRef.current.accept = accept;
    fileInputRef.current.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const resolvedType =
        type === 'image' && file.type.startsWith('video/')
          ? 'video'
          : type;

      let preview: string | undefined;
      if (resolvedType === 'image' || resolvedType === 'video') {
        preview = URL.createObjectURL(file);
      }
      setSelectedFile({ file, type: resolvedType, preview });
      fileInputRef.current!.value = '';
    };

    setShowAttachmentModal(false);
    fileInputRef.current.click();
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      streamRef.current = stream;

      const preferredTypes = [
        'audio/ogg;codecs=opus',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/aac',
        'audio/mpeg',
        'audio/webm;codecs=opus',
        'audio/webm',
      ];
      const mimeType = preferredTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

        if (chunksRef.current.length > 0) {
          const actualMime = recorder.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: actualMime });
          setIsProcessingAudio(true);
          try {
            const file = await transcodeAudioToMp3(blob);
            setAudioReady(file);
          } catch (error) {
            console.error('Audio transcode failed, using original blob:', error);
            const ext = actualMime.includes('ogg')
              ? 'ogg'
              : actualMime.includes('mp4')
                ? 'mp4'
                : actualMime.includes('aac')
                  ? 'aac'
                  : actualMime.includes('mpeg')
                    ? 'mp3'
                    : 'webm';
            const fallbackFile = new File([blob], `audio_${Date.now()}.${ext}`, { type: actualMime });
            setAudioReady(fallbackFile);
          } finally {
            setIsProcessingAudio(false);
          }
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      setAudioReady(null);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch {
      alert('Permissao de microfone negada. Habilite nas configuracoes do navegador.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      chunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
    setAudioReady(null);
    setRecordingTime(0);
  }, []);

  const sendAudio = useCallback(async () => {
    if (!audioReady || isSending) return;
    const file = audioReady;
    toast.loading('Enviando audio...', { id: 'audio-send' });
    setAudioReady(null);
    setRecordingTime(0);
    try {
      await sendMessage('Audio', 'audio', file);
    } finally {
      toast.dismiss('audio-send');
    }
  }, [audioReady, isSending, sendMessage]);

  if (isProcessingAudio) {
    return (
      <div className="mobile-safe-bottom shrink-0 p-3 md:p-4 bg-surface-900 border-t border-white/[0.04]">
        <div className="flex items-center gap-3 max-w-4xl mx-auto bg-surface-800 border border-white/[0.06] rounded-3xl px-5 py-3">
          <Mic className="w-4 h-4 text-neon-green shrink-0 animate-pulse" />
          <span className="text-sm text-white font-medium">Processando audio...</span>
          <span className="text-xs text-text-400">Convertendo para formato compativel</span>
        </div>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="mobile-safe-bottom shrink-0 p-3 md:p-4 bg-surface-900 border-t border-white/[0.04]">
        <div className="flex items-center gap-2 md:gap-3 max-w-4xl mx-auto min-w-0">
          <button
            onClick={cancelRecording}
            className="p-3 rounded-full text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
            title="Cancelar"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <div className="flex-1 flex items-center gap-3 bg-surface-800 border border-red-400/30 rounded-3xl px-5 py-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-red-400 text-sm font-bold font-mono tracking-wider">{formatTime(recordingTime)}</span>
            <div className="flex-1 flex items-center gap-0.5 overflow-hidden">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-red-400/60 rounded-full shrink-0 animate-pulse"
                  style={{
                    height: `${8 + Math.random() * 16}px`,
                    animationDelay: `${i * 50}ms`,
                    animationDuration: `${400 + Math.random() * 400}ms`,
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-text-400">Gravando...</span>
          </div>

          <button
            onClick={stopRecording}
            className="p-3 bg-neon-green text-surface-900 rounded-full hover:bg-neon-teal transition-colors shadow-lg shadow-neon-green/20 shrink-0"
            title="Parar e enviar"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        </div>
      </div>
    );
  }

  if (audioReady) {
    return (
      <div className="mobile-safe-bottom shrink-0 p-3 md:p-4 bg-surface-900 border-t border-white/[0.04]">
        <div className="flex items-center gap-2 md:gap-3 max-w-4xl mx-auto min-w-0">
          <button
            onClick={cancelRecording}
            className="p-3 rounded-full text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
            title="Descartar"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <div className="flex-1 flex items-center gap-3 bg-surface-800 border border-white/[0.06] rounded-3xl px-5 py-3">
            <Mic className="w-4 h-4 text-neon-green shrink-0" />
            <span className="text-sm text-white font-medium">Audio gravado</span>
            <span className="text-xs text-text-400 font-mono">{formatTime(recordingTime)}</span>
          </div>

          <button
            onClick={sendAudio}
            disabled={isSending}
            className="p-3 bg-neon-green text-surface-900 rounded-full hover:bg-neon-teal transition-colors shadow-lg shadow-neon-green/20 shrink-0 disabled:opacity-50"
            title="Enviar audio"
          >
            <div className={isSending ? "animate-pulse" : ""}>
              <Send className="w-4 h-4 ml-0.5" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-safe-bottom shrink-0 p-3 md:p-4 bg-surface-900 border-t border-white/[0.04] relative overflow-x-hidden">
      <input ref={fileInputRef} type="file" className="hidden" />

      {selectedFile && (
        <div className="mb-3 p-3 bg-surface-800 rounded-xl border border-white/[0.06] flex items-center gap-3 max-w-md">
          {selectedFile.preview && selectedFile.type === 'image' ? (
            <img src={selectedFile.preview} alt="preview" className="w-16 h-16 rounded-lg object-cover" />
          ) : selectedFile.preview && selectedFile.type === 'video' ? (
            <video src={selectedFile.preview} className="w-16 h-16 rounded-lg object-cover" muted />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-surface-700 flex items-center justify-center">
              <FileIcon className="w-6 h-6 text-text-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">{selectedFile.file.name}</p>
            <p className="text-xs text-text-400">{(selectedFile.file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button onClick={() => setSelectedFile(null)} className="p-1.5 text-text-400 hover:text-white rounded-lg hover:bg-surface-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 max-w-4xl mx-auto min-w-0">
        <button
          onClick={() => setShowAttachmentModal(true)}
          className={`p-2.5 md:p-3 rounded-full transition-colors shrink-0 mb-1 ${showAttachmentModal ? 'bg-surface-700 text-white' : 'text-text-400 hover:text-white hover:bg-surface-800'}`}
          type="button"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0 relative bg-surface-800 border border-white/[0.06] rounded-[1.4rem] md:rounded-3xl flex items-end min-h-[48px] focus-within:border-neon-green/40 focus-within:ring-1 focus-within:ring-neon-green/20 transition-all shadow-sm">
          <button className="p-2.5 md:p-3 text-text-400 hover:text-white shrink-0 transition-colors">
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
            placeholder={selectedFile ? "Legenda (opcional)..." : "Digite uma mensagem..."}
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 px-1.5 md:px-2 text-white text-sm max-h-[120px] scrollbar-thin placeholder-text-400 disabled:opacity-50"
            rows={1}
          />

          {message.trim() || selectedFile ? (
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
            <button
              onClick={startRecording}
              className="p-2.5 md:p-3 text-text-400 hover:text-white shrink-0 transition-colors"
              title="Gravar audio"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <Modal
        isOpen={showAttachmentModal}
        onClose={() => setShowAttachmentModal(false)}
        title="Enviar Anexo"
        size="md"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleFileSelect('image/*', 'image')}
            className="flex items-center gap-3 p-4 rounded-2xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] hover:border-neon-purple/20 text-left transition-all"
          >
            <div className="p-2 rounded-xl bg-neon-purple/20 text-neon-purple">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Imagem</p>
              <p className="text-xs text-text-400">Fotos e prints</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleFileSelect('video/*', 'video')}
            className="flex items-center gap-3 p-4 rounded-2xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] hover:border-neon-blue/20 text-left transition-all"
          >
            <div className="p-2 rounded-xl bg-neon-blue/20 text-neon-blue">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Video</p>
              <p className="text-xs text-text-400">Arquivos de video</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleFileSelect('.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip', 'document')}
            className="flex items-center gap-3 p-4 rounded-2xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] hover:border-neon-green/20 text-left transition-all"
          >
            <div className="p-2 rounded-xl bg-neon-green/20 text-neon-green">
              <FileIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Documento</p>
              <p className="text-xs text-text-400">PDF, planilhas e outros</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAttachmentModal(false);
              setShowTemplatePicker(true);
            }}
            className="flex items-center gap-3 p-4 rounded-2xl bg-surface-800/50 hover:bg-surface-700 border border-white/[0.04] hover:border-neon-teal/20 text-left transition-all"
          >
            <div className="p-2 rounded-xl bg-neon-teal/20 text-neon-teal">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Template</p>
              <p className="text-xs text-text-400">Escolher template aprovado</p>
            </div>
          </button>
        </div>
      </Modal>

      <TemplatePicker
        isOpen={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        isSending={isSendingTemplate}
        onSend={async (templateName, language, components) => {
          const phone = activeConversation?.contact?.phone;
          if (!phone) { toast.error('Sem telefone no contato'); return; }
          const res = await sendTemplate(templateName, language, phone, components);
          if (res.success) {
            toast.success('Template enviado!');
            setShowTemplatePicker(false);
          } else {
            toast.error(res.error || 'Falha ao enviar template');
          }
        }}
      />
    </div>
  );
}
