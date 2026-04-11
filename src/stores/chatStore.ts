// Update Chats store to fetch from supabase DB and use Realtime subscriptions
import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import type { Conversation, Message } from '@/types/database';
import { useAuthStore } from './authStore';

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  searchQuery: string;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;

  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (content: string, type?: Message['type']) => Promise<void>;
  setActiveConversation: (conversation: Conversation | null) => void;
  setSearchQuery: (query: string) => void;
  subscribeToUpdates: () => () => void; // Returns unsubscribe fn
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  searchQuery: '',
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
        .order('last_message_at', { ascending: false });

      if (!error && data) {
        set({ conversations: data as any });
      }
    } finally {
      set({ isLoadingConversations: false });
    }
  },

  fetchMessages: async (conversationId) => {
    set({ isLoadingMessages: true, messages: [] });
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        set({ messages: data as Message[] });
        // Mark as read locally and DB
        await supabase
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversationId);
          
        set(state => ({
          conversations: state.conversations.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c)
        }));
      }
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (content, type = 'text') => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    const { activeConversation } = get();
    if (!workspaceId || !activeConversation) return;

    set({ isSending: true });
    
    // Insert Outbound message. Our Edge Function / DB Triggers will handle sending it
    // Actually, to make it send via cloud API we can just insert and let a webhook listen
    // OR we trigger the edge function directly. For now, since setup says "Edge function sends it", let's hit the Edge Function or insert in the DB.
    // The previous plan showed `whatsapp-send` handles it if we POST, but directly inserting into DB doesn't trigger the API unless we have a pg_net trigger.
    // Let's call the Edge Function!

    try {
      // First optimistic update
      const tempId = `temp-${Date.now()}`;
      const newMsg: Message = {
        id: tempId,
        conversation_id: activeConversation.id,
        workspace_id: workspaceId,
        direction: 'outbound',
        type,
        content,
        media_url: null,
        media_type: null,
        wamid: null,
        status: 'pending',
        error_details: null,
        metadata: {},
        created_at: new Date().toISOString()
      };
      set(state => ({ messages: [...state.messages, newMsg] }));

      // Call Edge Function
      const contactPhone = activeConversation.contact?.phone;
      if (!contactPhone) throw new Error("Sem telefone");

      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          to: contactPhone,
          type,
          content,
          conversation_id: activeConversation.id
        })
      });

      if (!res.ok) {
         throw new Error("Failed to send");
      }
      
      // We rely on Realtime to give us the final sent message from DB
    } catch (err) {
      console.error(err);
      // Remove optimistic if failed (simplified)
      get().fetchMessages(activeConversation.id);
    } finally {
      set({ isSending: false });
    }
  },

  setActiveConversation: (conversation) => {
    set({ activeConversation: conversation });
    if (conversation) {
      get().fetchMessages(conversation.id);
    } else {
      set({ messages: [] });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  subscribeToUpdates: () => {
    const workspaceId = useAuthStore.getState().workspace?.id;
    if (!workspaceId) return () => {};

    // Listen to new messages
    const messageChannel = supabase.channel('public:messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const { activeConversation, messages } = get();
          
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as Message;
            // Add to current chat window if open
            if (activeConversation?.id === newMsg.conversation_id) {
               // Avoid duplicating if we optimistically added (simplified checking)
               if (!messages.find(m => m.id === newMsg.id && m.created_at === newMsg.created_at)) {
                 set(state => ({ messages: [...state.messages, newMsg] }));
               }
            }
            // Update conversation list
            get().fetchConversations(); // easier than manual merging for now
          }
          else if (payload.eventType === 'UPDATE') {
             // Status update
             const updatedMsg = payload.new as Message;
             if (activeConversation?.id === updatedMsg.conversation_id) {
               set(state => ({
                 messages: state.messages.map(m => m.id === updatedMsg.id ? updatedMsg : m)
               }));
             }
          }
        }
      ).subscribe();

    // Listen to new conversations
    const convChannel = supabase.channel('public:conversations')
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
