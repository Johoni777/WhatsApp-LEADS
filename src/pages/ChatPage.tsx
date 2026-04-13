import { useEffect, useCallback } from 'react';
import { ChatList } from '@/components/chat/ChatList';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';

export function ChatPage() {
  const workspaceId = useAuthStore((state) => state.workspace?.id);
  const { activeConversation, fetchConversations, fetchMessages, subscribeToUpdates } = useChatStore();
  const { isMobile } = useUIStore();

  const refresh = useCallback(() => {
    if (!workspaceId) return;

    void fetchConversations();
    if (activeConversation?.id) {
      void fetchMessages(activeConversation.id);
    }
  }, [workspaceId, activeConversation?.id, fetchConversations, fetchMessages]);

  useRefreshOnFocus(refresh, '/chat');

  useEffect(() => {
    if (!workspaceId) return;

    const unsubscribe = subscribeToUpdates();
    return () => unsubscribe();
  }, [workspaceId, subscribeToUpdates]);

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
        {activeConversation ? (
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
            <ChatWindow />
          </div>
        ) : (
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <ChatList />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
      <div className="w-[360px] xl:w-[380px] shrink-0 border-r border-white/[0.04]">
        <ChatList />
      </div>
      <ChatWindow />
    </div>
  );
}
