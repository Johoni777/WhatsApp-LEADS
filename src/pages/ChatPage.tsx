import { useEffect } from 'react';
import { ChatList } from '@/components/chat/ChatList';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';

export function ChatPage() {
  const { activeConversation, fetchConversations, subscribeToUpdates } = useChatStore();
  const { isMobile } = useUIStore();

  useEffect(() => {
    fetchConversations();
    const unsubscribe = subscribeToUpdates();
    return () => unsubscribe();
  }, [fetchConversations, subscribeToUpdates]);

  if (isMobile) {
    return (
      <div className="flex h-full">
        {activeConversation ? (
          <div className="flex-1 flex flex-col">
            <ChatWindow />
          </div>
        ) : (
          <div className="flex-1">
            <ChatList />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-[380px] shrink-0 border-r border-white/[0.04]">
        <ChatList />
      </div>
      <ChatWindow />
    </div>
  );
}
