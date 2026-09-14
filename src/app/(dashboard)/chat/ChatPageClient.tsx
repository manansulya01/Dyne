"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Separator } from "@/components/ui/Separator";
import { Textarea } from "@/components/ui/Textarea";
import {
  Search,
  Send,
  Plus,
  MessageSquare,
} from "lucide-react";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

interface ConversationData {
  id: string;
  type: "direct" | "group";
  name: string | null;
  image_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  members: Array<{
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
  last_message: {
    id: string;
    content: string | null;
    sender_id: string;
    created_at: string;
    sender: {
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
  other_member: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  unread_count: number;
}

interface MessageData {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  sender: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  attachments: Array<{
    id: string;
    file_url: string;
    file_type: string;
    file_name: string;
  }>;
}

interface ChatPageClientProps {
  currentUserId: string | null;
}

export function ChatPageClient({ currentUserId }: ChatPageClientProps) {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/chat/conversations");
      const data = await response.json();
      if (data.conversations) {
        setConversations(data.conversations);
        // Auto-select first conversation if none selected
        if (!activeConversationId && data.conversations.length > 0) {
          setActiveConversationId(data.conversations[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeConversationId]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`);
      const data = await response.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  }, []);

  useEffect(() => {
    // Initial conversations load only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (activeConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, fetchMessages]);

  // Realtime subscriptions
  useEffect(() => {
    if (!activeConversationId) return;

    const convoId = activeConversationId;
    const messagesChannel = supabase
      .channel(`messages:${convoId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${convoId}`,
        },
        async (payload) => {
          const incoming = payload.new as { id: string };
          // Dedup: skip if we already have this message (reconnect replays).
          let alreadyHave = false;
          setMessages((prev) => {
            alreadyHave = prev.some((m) => m.id === incoming.id);
            return prev;
          });
          if (alreadyHave) return;
          const response = await fetch(`/api/chat/conversations/${convoId}/messages?limit=1`);
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            const latest = data.messages[data.messages.length - 1] as MessageData;
            setMessages((prev) => (prev.some((m) => m.id === latest.id) ? prev : [...prev, latest]));
          }
        }
      )
      .subscribe();

    const conversationsChannel = supabase
      .channel("conversations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
    };
  }, [activeConversationId, fetchConversations, supabase]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConversationId || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch(`/api/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMessage, conversationId: activeConversationId }),
      });

      const data = await response.json();
      if (data.message) {
        // Realtime will deliver the message; append immediately as well
        // (deduped by id) so sending feels instant.
        setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
        setNewMessage("");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleNewConversation = async (participantIds: string[]) => {
    if (participantIds.length === 0) return;

    try {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds, type: participantIds.length > 1 ? "group" : "direct" }),
      });

      const data = await response.json();
      if (data.conversation) {
        setShowNewChat(false);
        await fetchConversations();
        setActiveConversationId(data.conversation.id);
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const formatMessageTime = (dateString: string) => {
    const date = parseISO(dateString);
    if (isToday(date)) return format(date, "h:mm a");
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMM d");
  };

  const getConversationTitle = (conv: ConversationData) => {
    if (conv.type === "group") return conv.name || "Group Chat";
    if (conv.other_member) return conv.other_member.display_name || conv.other_member.username;
    return "Unknown";
  };

  const getConversationAvatar = (conv: ConversationData) => {
    if (conv.type === "group") return conv.image_url;
    if (conv.other_member) return conv.other_member.avatar_url;
    return null;
  };

  const filteredConversations = conversations.filter(c => {
    const title = getConversationTitle(c).toLowerCase();
    return title.includes(searchQuery.toLowerCase());
  });

  if (!currentUserId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Please sign in to view messages</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Mobile conversation picker */}
      <div className="md:hidden border-b p-2">
        <label htmlFor="mobile-conversation" className="sr-only">Select conversation</label>
        <select
          id="mobile-conversation"
          value={activeConversationId ?? ""}
          onChange={(e) => setActiveConversationId(e.target.value || null)}
          className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select a conversation…</option>
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>{getConversationTitle(c)}</option>
          ))}
        </select>
      </div>
      <div className="flex h-full flex-1 overflow-hidden">
        {/* Conversations Sidebar */}
        <aside className="w-80 border-r flex flex-col hidden md:flex">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Messages</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowNewChat(true)}>
                <Plus className="h-5 w-5" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-2 space-y-1">
              {filteredConversations.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={activeConversationId === conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                />
              ))}
              {filteredConversations.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No conversations yet</p>
                  <Button variant="outline" className="mt-4" onClick={() => setShowNewChat(true)}>
                    Start a conversation
                  </Button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeConversationId ? (
            <ChatWindow
              conversation={conversations.find(c => c.id === activeConversationId)!}
              messages={messages}
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              onSendMessage={handleSendMessage}
              isSending={isSending}
              currentUserId={currentUserId}
              messagesEndRef={messagesEndRef}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted/30">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No conversation selected</h3>
                <p className="text-muted-foreground mb-6">Select a conversation or start a new one</p>
                <Button onClick={() => setShowNewChat(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Conversation
                </Button>
              </div>
            </div>
          )}
        </div>

        {showNewChat && (
          <NewChatModal onClose={() => setShowNewChat(false)} onCreate={handleNewConversation} currentUserId={currentUserId} />
        )}
      </div>
    </div>
  );
}

function ConversationItem({ conversation, isActive, onClick }: { conversation: ConversationData; isActive: boolean; onClick: () => void }) {
  const title = conversation.type === "group" 
    ? conversation.name || "Group Chat"
    : conversation.other_member?.display_name || conversation.other_member?.username || "Unknown";

  const avatar = conversation.type === "group"
    ? conversation.image_url
    : conversation.other_member?.avatar_url;

  const lastMessage = conversation.last_message?.content 
    ? (conversation.last_message.sender_id === conversation.other_member?.id 
      ? conversation.last_message.content 
      : `You: ${conversation.last_message.content}`)
    : "No messages yet";

  const time = conversation.last_message?.created_at 
    ? formatMessageTime(conversation.last_message.created_at)
    : "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
        isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={avatar || ""} alt="" />
        <AvatarFallback name={title} />
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className={cn("font-medium truncate", isActive ? "text-primary-foreground" : "")}>{title}</p>
          {time && <span className={cn("text-xs whitespace-nowrap", isActive ? "text-primary-foreground/70" : "text-muted-foreground")}>{time}</span>}
        </div>
        <p className={cn("text-sm truncate", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {lastMessage}
        </p>
      </div>
    </button>
  );
}

function ChatWindow({ 
  conversation, 
  messages, 
  newMessage, 
  setNewMessage, 
  onSendMessage, 
  isSending, 
  currentUserId,
  messagesEndRef 
}: { 
  conversation: ConversationData; 
  messages: MessageData[]; 
  newMessage: string; 
  setNewMessage: (v: string) => void; 
  onSendMessage: (e: React.FormEvent) => void;
  isSending: boolean;
  currentUserId: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const title = conversation.type === "group" 
    ? conversation.name || "Group Chat"
    : conversation.other_member?.display_name || conversation.other_member?.username || "Unknown";

  const avatar = conversation.type === "group"
    ? conversation.image_url
    : conversation.other_member?.avatar_url;

  return (
    <div className="flex flex-col h-full border-l">
      <div className="flex items-center gap-3 p-4 border-b">
        <Avatar className="h-10 w-10">
          <AvatarImage src={avatar || ""} alt="" />
          <AvatarFallback name={title} />
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{title}</p>
          <p className="text-xs text-muted-foreground">
            {conversation.type === "group" 
              ? `${conversation.members?.length || 0} members`
              : "Direct message"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-label="Messages" aria-live="polite">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} currentUserId={currentUserId} isGroup={conversation.type === "group"} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <Separator />
      <form onSubmit={onSendMessage} className="p-4 space-y-2">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <label htmlFor="chat-message" className="sr-only">Type a message</label>
            <Textarea
              id="chat-message"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="min-h-[44px] max-h-32 resize-none"
              disabled={isSending}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </div>
          <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending} className="min-h-[44px] min-w-[44px]" aria-label="Send message">
            <Send className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message, currentUserId, isGroup }: { message: MessageData; currentUserId: string; isGroup: boolean }) {
  const isOwn = message.sender_id === currentUserId;

  return (
    <div className={cn("flex gap-2 max-w-[70%]", isOwn ? "ml-auto flex-row-reverse" : "")}>
      {!isOwn && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={message.sender?.avatar_url || ""} alt="" />
          <AvatarFallback name={message.sender?.display_name || message.sender?.username} />
        </Avatar>
      )}
      <div className={cn(
        "relative rounded-2xl px-4 py-2 max-w-xs",
        isOwn 
          ? "bg-primary text-primary-foreground rounded-br-none" 
          : "bg-muted rounded-bl-none"
      )}>
        {!isOwn && isGroup && (
          <p className="text-xs font-medium mb-1">{message.sender?.display_name || message.sender?.username}</p>
        )}
        {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2 text-sm">
                {att.file_type.startsWith("image/") ? (
                  <img src={att.file_url} alt={att.file_name} className="h-12 w-12 rounded object-cover" />
                ) : (
                  <a href={att.file_url} target="_blank" className="flex items-center gap-1 text-primary hover:underline">
                    {att.file_name}
                  </a>
                )}
              </div>
            ))}
          </div>
          )}
        <p className={cn("text-xs mt-1 opacity-60", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {formatMessageTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}

function NewChatModal({ onClose, onCreate, currentUserId }: { onClose: () => void; onCreate: (ids: string[]) => void; currentUserId: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([]);

  useEffect(() => {
    // Fetch all users except current
    fetch("/api/people?limit=50")
      .then(res => res.json())
      .then(data => setUsers((data.profiles ?? []).filter((u: { id: string }) => u.id !== currentUserId)))
      .catch(console.error);
  }, [currentUserId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">New Conversation</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {users
            .filter(u => 
              u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              u.username.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map(user => (
              <label key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={e => setSelectedUsers(prev => 
                    e.target.checked ? [...prev, user.id] : prev.filter(id => id !== user.id)
                  )}
                  className="rounded"
                />
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar_url || ""} alt="" />
                  <AvatarFallback name={user.display_name || user.username} />
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.display_name || user.username}</p>
                  <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                </div>
              </label>
            ))}
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="flex-1 min-h-[44px]">Cancel</Button>
          <Button onClick={() => onCreate(selectedUsers)} disabled={selectedUsers.length === 0} className="flex-1 min-h-[44px]">
            Start Chat ({selectedUsers.length})
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatMessageTime(dateString: string) {
  const date = parseISO(dateString);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}