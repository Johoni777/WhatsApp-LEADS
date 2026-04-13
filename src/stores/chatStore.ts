import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import type { Conversation, Message } from '@/types/database';
import { useAuthStore } from './authStore';

function matchesPersistedMessage(current: Message, incoming: Message) {
  return current.id === incoming.id || (!!current.wamid && !!incoming.wamid && current.wamid === incoming.wamid);
}

function matchesTempOutbound(current: Message, incoming: Message) {
  return (
    current.id.startsWith('temp-') &&
    current.direction === 'outbound' &&
    incoming.direction === 'outbound' &&
    (
      (!!current.wamid && !!incoming.wamid && current.wamid === incoming.wamid) ||
      (!current.wamid && current.type === incoming.type && current.content === incoming.content)
    )
  );
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isAgentTyping: boolean;
  searchQuery: string;
  filterStatus: 'all' | 'unread' | 'ai';
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;

  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (content: string, type?: Message['type'], mediaFile?: File) => Promise<void>;
  setActiveConversation: (conversation: Conversation | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterStatus: (status: 'all' | 'unread' | 'ai') => void;
  subscribeToUpdates: () => () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  isAgentTyping: false,
  searchQuery: '',
  filterStatus: 'all',
  isLoadingConversations: false,
  isLoadingMessages: false,
  isSending: false,

  fetchConversations: async () => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return;

    set({ isLoadingConversations: true });
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*)')
        .eq('workspace_id', workspaceId)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (!error && data) {
        set({ conversations: data as any });
      }
    } finally {
      set({ isLoadingConversations: false });
    }
  },

  fetchMessages: async (conversationId) => {
    set({ isLoadingMessages: true, messages: [], isAgentTyping: false });
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      if (!data) return;

      set({ messages: data as Message[] });
      await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId);

      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c
        )
      }));
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (content, type = 'text', mediaFile) => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    const { activeConversation } = get();
    if (!workspaceId || !activeConversation) return;

    set({ isSending: true });
    let tempId: string | null = null;

    try {
      const contactPhone = activeConversation.contact?.phone;
      if (!contactPhone) throw new Error("Sem telefone");

      let mediaUrl: string | undefined;

      if (mediaFile && type !== 'text') {
        const ext = mediaFile.name.split('.').pop();
        const path = `${workspaceId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(path, mediaFile, { contentType: mediaFile.type });

        if (uploadError) throw new Error("Falha no upload: " + uploadError.message);

        const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
        mediaUrl = urlData.publicUrl;
      }

      tempId = `temp-${Date.now()}`;
      const newMsg: Message = {
        id: tempId,
        conversation_id: activeConversation.id,
        workspace_id: workspaceId,
        direction: 'outbound',
        type,
        content,
        media_url: mediaUrl || null,
        media_type: mediaFile?.type || null,
        wamid: null,
        status: 'pending',
        error_details: null,
        metadata: {},
        created_at: new Date().toISOString()
      };
      set(state => ({ messages: [...state.messages, newMsg] }));

      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          workspace_id: workspaceId,
          to: contactPhone,
          type,
          content: type === 'document' ? (mediaFile?.name || content) : content,
          media_url: mediaUrl,
          media_mime: mediaFile?.type || undefined,
          conversation_id: activeConversation.id
        }
      });

      if (error) {
        throw new Error(error.message || "Failed to send");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      set(state => ({
        messages: state.messages.map(message =>
          message.id === tempId
            ? {
                ...message,
                status: 'sent',
                wamid: data?.wamid || message.wamid,
                error_details: null,
              }
            : message
        )
      }));
    } catch (err) {
      console.error('Send error:', err);
      set(state => ({
        messages: state.messages.map(message =>
          message.id === tempId
            ? {
                ...message,
                status: 'failed',
                error_details: {
                  message: err instanceof Error ? err.message : 'Falha ao enviar mensagem',
                },
              }
            : message
        )
      }));
      set({ isAgentTyping: false });
    } finally {
      set({ isSending: false });
    }
  },

  setActiveConversation: (conversation) => {
    set({ activeConversation: conversation, isAgentTyping: false });
    if (conversation) {
      get().fetchMessages(conversation.id);
    } else {
      set({ messages: [], isAgentTyping: false });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterStatus: (filterStatus) => set({ filterStatus }),

  subscribeToUpdates: () => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return () => {};

    const messageChannel = supabase.channel('rt-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const { activeConversation, messages } = get();

          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as Message;
            if (activeConversation?.id === newMsg.conversation_id) {
              if (
                newMsg.direction === 'inbound' &&
                activeConversation.is_ai_active &&
                newMsg.type === 'text'
              ) {
                set({ isAgentTyping: true });
              }

              const isDuplicate = messages.some(m =>
                matchesPersistedMessage(m, newMsg) || matchesTempOutbound(m, newMsg)
              );
              if (isDuplicate) {
                set(state => ({
                  messages: state.messages.map(m =>
                    matchesPersistedMessage(m, newMsg) || matchesTempOutbound(m, newMsg)
                      ? { ...m, ...newMsg }
                      : m
                  )
                }));
              } else {
                set(state => ({ messages: [...state.messages, newMsg] }));
              }

              if (newMsg.direction === 'outbound' && newMsg.is_from_ai) {
                set({ isAgentTyping: false });
              }
            }
            get().fetchConversations();
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new as Message;
            if (activeConversation?.id === updatedMsg.conversation_id) {
              const hasMatchingMessage = messages.some(m =>
                matchesPersistedMessage(m, updatedMsg) || matchesTempOutbound(m, updatedMsg)
              );

              set(state => ({
                messages: hasMatchingMessage
                  ? state.messages.map(m =>
                      matchesPersistedMessage(m, updatedMsg) || matchesTempOutbound(m, updatedMsg)
                        ? { ...m, ...updatedMsg }
                        : m
                    )
                  : [...state.messages, updatedMsg]
              }));
              if (updatedMsg.direction === 'outbound' && updatedMsg.is_from_ai) {
                set({ isAgentTyping: false });
              }
            }
          }
        }
      ).subscribe();

    const convChannel = supabase.channel('rt-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${workspaceId}` },
        () => {
          get().fetchConversations();
        }
      ).subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(convChannel);
    };
  }
}));
