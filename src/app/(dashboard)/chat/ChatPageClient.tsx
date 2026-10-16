"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { usePolling, POLL_INTERVALS } from "@/hooks/usePolling";
import { useDialogA11y } from "@/hooks/useDialogA11y";
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
  Paperclip,
  Pencil,
  Trash2,
  SmilePlus,
  X,
} from "lucide-react";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

interface ConversationData {
  id: string;
  type: "direct" | "group";
  name: string | null;
  image_url: string | null;
  created_by: string;
  community_id: string | null;
  channel_id: string | null;
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
  edited_at?: string | null;
  reactions?: Record<string, string[]>;
  mentions?: string[];
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
  const searchParams = useSearchParams();
  const deepConversation = searchParams.get("conversation");
  const deepCommunity = searchParams.get("community");
  const deepChannel = searchParams.get("channel");
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [staged, setStaged] = useState<Array<{ id: string; url: string; name: string; mime: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [channelName, setChannelName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-select guard lives in a ref so fetchConversations keeps a stable
  // identity (no refetch loop when selection changes).
  const autoSelectedRef = useRef(false);
  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/chat/conversations");
      const data = await response.json();
      if (data.conversations) {
        setConversations(data.conversations);
        // Deep links (?conversation=) and channel views (?community=&channel=)
        // take precedence over the default first-conversation selection, but
        // never clobber an explicit selection afterwards.
        if (!autoSelectedRef.current) {
          autoSelectedRef.current = true;
          setActiveConversationId((current) => {
            if (current) return current;
            const list = data.conversations as ConversationData[];
            if (deepConversation && list.some((c) => c.id === deepConversation)) {
              return deepConversation;
            }
            if (deepChannel) {
              const inChannel = list.find((c) => c.channel_id === deepChannel);
              if (inChannel) return inChannel.id;
            }
            return list.length > 0 ? list[0].id : null;
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setIsLoading(false);
    }
  }, [deepChannel, deepConversation]);

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

  // Clear a stale selection (conversation deleted elsewhere) instead of
  // rendering a missing thread.
  useEffect(() => {
    if (
      activeConversationId &&
      conversations.length > 0 &&
      !conversations.some((c) => c.id === activeConversationId)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveConversationId(null);
      setMessages([]);
    }
  }, [conversations, activeConversationId]);

  // Live updates via polling (see hooks/usePolling): refresh the active
  // thread and the conversation list on a tick. Newly arrived messages merge
  // by id so optimistic sends never duplicate. Structured so a push provider
  // can replace the ticks without touching this component.
  const pollActiveThread = useCallback(async () => {
    if (!activeConversationId) return;
    try {
      const response = await fetch(`/api/chat/conversations/${activeConversationId}/messages`);
      const data = await response.json();
      if (data.messages) {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const fresh = (data.messages as MessageData[]).filter((m) => !known.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }
    } catch {
      /* transient failures resolve on the next tick */
    }
  }, [activeConversationId]);

  const pollConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/conversations");
      const data = await response.json();
      if (data.conversations) setConversations(data.conversations);
    } catch {
      /* transient failures resolve on the next tick */
    }
  }, []);

  // Both threads are fetched once on mount above, so skip each hook's first tick.
  usePolling(pollActiveThread, POLL_INTERVALS.chat, !!activeConversationId, false);
  usePolling(pollConversations, POLL_INTERVALS.conversations, true, false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && staged.length === 0) || !activeConversationId || isSending) return;

    setIsSending(true);
    setSendError(null);
    try {
      const response = await fetch(`/api/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMessage,
          conversationId: activeConversationId,
          attachmentIds: staged.map((s) => s.id),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to send");
      if (data.message) {
        // Realtime will deliver the message; append immediately as well
        // (deduped by id) so sending feels instant.
        setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
        setNewMessage("");
        setStaged([]);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const patchMessage = (id: string, patch: Partial<MessageData>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleEditMessage = async (id: string, content: string) => {
    const prev = messages.find((m) => m.id === id);
    patchMessage(id, { content });
    try {
      const res = await fetch(`/api/chat/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
    } catch {
      if (prev) patchMessage(id, { content: prev.content });
      setSendError("Could not save your edit. Please try again.");
    }
  };

  const handleDeleteMessage = async (id: string) => {
    const prev = messages;
    setMessages((list) => list.filter((m) => m.id !== id));
    try {
      const res = await fetch(`/api/chat/messages/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setMessages(prev);
      setSendError("Could not delete the message. Please try again.");
    }
  };

  const handleToggleReaction = async (id: string, emoji: string) => {
    if (!currentUserId) return;
    const prev = messages.find((m) => m.id === id);
    const users = prev?.reactions?.[emoji] ?? [];
    const has = users.includes(currentUserId);
    const next = has ? users.filter((u) => u !== currentUserId) : [...users, currentUserId];
    patchMessage(id, { reactions: { ...(prev?.reactions ?? {}), [emoji]: next } });
    try {
      const res = await fetch(`/api/chat/messages/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error();
    } catch {
      if (prev) patchMessage(id, { reactions: prev.reactions });
    }
  };

  // Stage attachments through the existing secure upload pipeline
  // (message-attachments bucket: type + size validated server-side too).
  const handleAttachFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSendError(null);
    setIsUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5 - staged.length)) {
        const form = new FormData();
        form.set("file", file);
        form.set("bucket", "message-attachments");
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Could not upload ${file.name}`);
        setStaged((prev) => [...prev, { id: data.media.id, url: data.media.url, name: file.name, mime: file.type }]);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveStaged = async (id: string) => {
    setStaged((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`/api/upload?mediaId=${id}&bucket=message-attachments`, { method: "DELETE" });
    } catch { /* staged row TTL-cleans itself */ }
  };

  const handleNewConversation = async (participantIds: string[]) => {
    if (participantIds.length === 0) return;
    setCreateError(null);

    try {
      // DMs are disabled: every conversation is a community group chat.
      // When opened from a channel deep-link, the new chat is scoped there.
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds,
          type: "group",
          name: channelName ? `#${channelName} chat` : "Group chat",
          ...(deepCommunity ? { communityId: deepCommunity } : {}),
          ...(deepChannel ? { channelId: deepChannel } : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        // Keep the dialog open so the user sees why creation failed
        // (e.g. one-to-one DMs are disabled) instead of failing silently.
        setCreateError(typeof data.error === "string" ? data.error : "Could not create conversation");
        return;
      }
      if (data.conversation) {
        setShowNewChat(false);
        await fetchConversations();
        setActiveConversationId(data.conversation.id);
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
      setCreateError("Could not create conversation. Please try again.");
    }
  };

  const getConversationTitle = (conv: ConversationData) => {
    if (conv.name) return conv.name;
    return "Group Chat";
  };

  const filteredConversations = conversations.filter(c => {
    if (deepChannel && c.channel_id !== deepChannel) return false;
    const title = getConversationTitle(c).toLowerCase();
    return title.includes(searchQuery.toLowerCase());
  });

  // Resolve the channel name for the deep-link chip (best effort).
  // The chip label must reset the moment the deep link is removed (otherwise a
  // stale "#general chat" name would leak into newly created chats), so the
  // synchronous reset below is intentional render-state synchronisation, not
  // derivable render output — the fetch itself is async external-system sync.
  useEffect(() => {
    if (!deepCommunity || !deepChannel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset (see above)
      setChannelName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/communities/${deepCommunity}/channels`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const match = (data.channels ?? []).find((c: { id: string; name: string }) => c.id === deepChannel);
        if (match && !cancelled) setChannelName(match.name);
      } catch { /* chip falls back to generic label */ }
    })();
    return () => { cancelled = true; };
  }, [deepCommunity, deepChannel]);

  // Stale ids (e.g. a conversation deleted elsewhere) resolve to undefined
  // instead of crashing the non-null assertion that was here before.
  const activeConversation = activeConversationId
    ? conversations.find(c => c.id === activeConversationId) ?? null
    : null;

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
      <div className="lg:hidden border-b p-2">
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
        <aside className="w-80 border-r flex flex-col hidden lg:flex">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Community Chats</h2>
                <p className="text-xs text-muted-foreground">Group conversations only — DMs are disabled</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowNewChat(true)} aria-label="Start a group chat">
                <Plus className="h-5 w-5" />
              </Button>
            </div>
            {deepChannel && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm">
                <span className="font-bold text-primary" aria-hidden="true">#</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {channelName ?? "Channel view"}
                </span>
                <Link
                  href="/chat"
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Show all
                </Link>
              </div>
            )}
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
              {isLoading && filteredConversations.length === 0 ? (
                <div className="space-y-2 p-1" role="status" aria-label="Loading conversations">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl p-2">
                      <div className="dyne-skeleton h-11 w-11 shrink-0 rounded-full" aria-hidden="true" />
                      <div className="min-w-0 flex-1 space-y-1.5" aria-hidden="true">
                        <div className="dyne-skeleton h-3.5 w-2/3" />
                        <div className="dyne-skeleton h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                  <span className="sr-only">Loading conversations…</span>
                </div>
              ) : (
                filteredConversations.map(conv => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={activeConversationId === conv.id}
                    onClick={() => setActiveConversationId(conv.id)}
                  />
                ))
              )}
              {!isLoading && filteredConversations.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No group chats yet</p>
                  <p className="mt-1 text-xs">Create a community group chat to start talking.</p>
                  <Button variant="outline" className="mt-4" onClick={() => setShowNewChat(true)}>
                    Start a group chat
                  </Button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeConversation ? (
            <ChatWindow
              conversation={activeConversation}
              messages={messages}
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              onSendMessage={handleSendMessage}
              isSending={isSending}
              sendError={sendError}
              staged={staged}
              isUploading={isUploading}
              onAttach={handleAttachFiles}
              onRemoveStaged={handleRemoveStaged}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onToggleReaction={handleToggleReaction}
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
          <NewChatModal onClose={() => { setShowNewChat(false); setCreateError(null); }} onCreate={handleNewConversation} currentUserId={currentUserId} createError={createError} />
        )}
      </div>
    </div>
  );
}

function ConversationItem({ conversation, isActive, onClick }: { conversation: ConversationData; isActive: boolean; onClick: () => void }) {
  const title = conversation.name || "Group Chat";

  const avatar = conversation.image_url;

  const lastMessage = conversation.last_message?.content ?? "No messages yet";

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
        <div className="flex items-center justify-between gap-2">
          <p className={cn("font-medium truncate", isActive ? "text-primary-foreground" : "")}>{title}</p>
          <span className="flex shrink-0 items-center gap-1.5">
            {conversation.unread_count > 0 && !isActive && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground" aria-label={`${conversation.unread_count} unread`}>
                {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
              </span>
            )}
            {time && <span className={cn("text-xs whitespace-nowrap", isActive ? "text-primary-foreground/70" : "text-muted-foreground")}>{time}</span>}
          </span>
        </div>
        <p className={cn("text-sm truncate", isActive ? "text-primary-foreground/80" : "text-muted-foreground", conversation.unread_count > 0 && !isActive && "font-semibold text-foreground")}>
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
  sendError,
  staged,
  isUploading,
  onAttach,
  onRemoveStaged,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  currentUserId,
  messagesEndRef
}: {
  conversation: ConversationData;
  messages: MessageData[];
  newMessage: string;
  setNewMessage: (v: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  isSending: boolean;
  sendError: string | null;
  staged: Array<{ id: string; url: string; name: string; mime: string }>;
  isUploading: boolean;
  onAttach: (files: FileList | null) => void;
  onRemoveStaged: (id: string) => void;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  currentUserId: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const title = conversation.name || "Group Chat";

  const avatar = conversation.image_url;

  const [msgSearch, setMsgSearch] = useState("");
  const q = msgSearch.trim().toLowerCase();
  const visibleMessages = q
    ? messages.filter((m) => (m.content ?? "").toLowerCase().includes(q))
    : messages;
  // Group consecutive messages from the same sender (5-min window) for
  // Discord-style density; date separators keep long histories scannable.
  const groups: Array<{ key: string; day: string; items: typeof messages }> = [];
  let lastKey = "";
  for (const m of visibleMessages) {
    const day = new Date(m.created_at).toDateString();
    const k = `${day}|${m.sender_id}`;
    const prev = visibleMessages[visibleMessages.indexOf(m) - 1];
    const gap = prev ? +new Date(m.created_at) - +new Date(prev.created_at) : Infinity;
    if (k !== lastKey || gap > 5 * 60 * 1000 || groups.length === 0) {
      groups.push({ key: `${k}-${m.id}`, day, items: [m] });
      lastKey = k;
    } else {
      groups[groups.length - 1].items.push(m);
    }
  }

  return (
    <div className="flex h-full flex-col border-l">
      <div className="flex items-center gap-3 border-b p-4">
        <Avatar className="h-10 w-10">
          <AvatarImage src={avatar || ""} alt="" />
          <AvatarFallback name={title} />
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {conversation.members.length} member{conversation.members.length === 1 ? "" : "s"} · Community chat
          </p>
        </div>
        <div className="relative hidden sm:block">
          <label htmlFor="msg-search" className="sr-only">Search in conversation</label>
          <input
            id="msg-search"
            value={msgSearch}
            onChange={(e) => setMsgSearch(e.target.value)}
            placeholder="Search messages…"
            maxLength={100}
            className="min-h-[44px] w-44 rounded-xl border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4" role="log" aria-label="Messages" aria-live="polite">
        {q && (
          <p className="text-xs text-muted-foreground" role="status">
            {visibleMessages.length} of {messages.length} messages match “{msgSearch.trim()}”
            {visibleMessages.length === 0 && " — try a different keyword."}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.key}>
            <GroupBubble
              group={g.items}
              currentUserId={currentUserId}
              isGroup
              onEditMessage={onEditMessage}
              onDeleteMessage={onDeleteMessage}
              onToggleReaction={onToggleReaction}
            />
          </div>
        ))}
        {visibleMessages.length === 0 && !q && (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello to start the conversation.</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      <Separator />
      <form onSubmit={onSendMessage} className="space-y-2 p-4">
        {(staged.length > 0 || isUploading) && (
          <div className="flex flex-wrap gap-2" aria-label="Attachments to send">
            {staged.map((s) => (
              <span key={s.id} className="flex min-h-[44px] max-w-full items-center gap-2 rounded-xl bg-muted px-2.5 py-1.5 text-xs">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="max-w-40 truncate font-medium">{s.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveStaged(s.id)}
                  aria-label={`Remove ${s.name}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-card"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {isUploading && <span className="text-xs text-muted-foreground" role="status">Uploading…</span>}
          </div>
        )}
        {sendError && <p role="alert" className="text-xs text-destructive">{sendError}</p>}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <label htmlFor="chat-message" className="sr-only">Type a message</label>
            <Textarea
              id="chat-message"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Type a message... (@username to mention)"
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
          <label className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Attach a file">
            <Paperclip className="h-5 w-5" aria-hidden="true" />
            <input
              type="file"
              className="sr-only"
              multiple
              accept="image/*,video/*,.pdf,.txt"
              disabled={isSending || isUploading || staged.length >= 5}
              onChange={(e) => { onAttach(e.target.files); e.target.value = ""; }}
            />
          </label>
          <Button type="submit" size="icon" disabled={(!newMessage.trim() && staged.length === 0) || isSending || isUploading} className="min-h-[44px] min-w-[44px]" aria-label="Send message">
            <Send className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢"];

function MessageBubble({ message, currentUserId, isGroup, onEdit, onDelete, onReact }: {
  message: MessageData;
  currentUserId: string;
  isGroup: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
}) {
  const isOwn = message.sender_id === currentUserId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content ?? "");
  const [showReactions, setShowReactions] = useState(false);
  const reactions = message.reactions ?? {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const saveEdit = () => {
    const text = draft.trim();
    setEditing(false);
    if (text && text !== (message.content ?? "")) onEdit(message.id, text);
    else setDraft(message.content ?? "");
  };

  return (
    <div className={cn("group flex max-w-[70%] gap-2", isOwn ? "ml-auto flex-row-reverse" : "")}>
      {!isOwn && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={message.sender?.avatar_url || ""} alt="" />
          <AvatarFallback name={message.sender?.display_name || message.sender?.username} />
        </Avatar>
      )}
      <div className={cn(
        "relative max-w-xs rounded-2xl px-4 py-2",
        isOwn
          ? "rounded-br-none bg-primary text-primary-foreground"
          : "rounded-bl-none bg-muted"
      )}>
        {!isOwn && isGroup && (
          <p className="mb-1 text-xs font-medium">{message.sender?.display_name || message.sender?.username}</p>
        )}
        {editing ? (
          <form
            onSubmit={(e) => { e.preventDefault(); saveEdit(); }}
            className="flex items-center gap-1.5"
          >
            <label htmlFor={`edit-${message.id}`} className="sr-only">Edit message</label>
            <input
              id={`edit-${message.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={10000}
              autoFocus
              className="min-h-[44px] w-full rounded-lg bg-background/20 px-2 text-sm text-inherit outline-none placeholder:text-current/70"
            />
            <Button type="submit" size="sm" className="min-h-[44px]" disabled={!draft.trim()}>Save</Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-[44px]" onClick={() => { setEditing(false); setDraft(message.content ?? ""); }}>Cancel</Button>
          </form>
        ) : (
          message.content && <p className="whitespace-pre-wrap">{message.content}</p>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2 text-sm">
                {att.file_type.startsWith("image/") ? (
                  <Image src={att.file_url} alt={att.file_name} width={48} height={48} className="h-12 w-12 rounded object-cover" loading="lazy" />
                ) : (
                  <a href={att.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    {att.file_name}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        {reactionEntries.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Reactions">
            {reactionEntries.map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(message.id, emoji)}
                aria-pressed={users.includes(currentUserId)}
                aria-label={`React ${emoji}, ${users.length}`}
                className={cn(
                  "flex min-h-[28px] items-center gap-1 rounded-full border px-2 text-xs",
                  users.includes(currentUserId) ? "border-primary bg-primary/15" : "border-border bg-background/40"
                )}
              >
                <span aria-hidden="true">{emoji}</span>
                <span>{users.length}</span>
              </button>
            ))}
          </div>
        )}
        <p className={cn("mt-1 text-xs opacity-60", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {formatMessageTime(message.created_at)}
          {message.edited_at && <span> · edited</span>}
        </p>
        {/* Hover actions — always visible on touch (no hover-only reliance). */}
        <div className="mt-1 flex items-center gap-0.5">
          <button
            onClick={() => setShowReactions((v) => !v)}
            aria-expanded={showReactions}
            aria-label="Add reaction"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg opacity-70 hover:bg-background/30 hover:opacity-100"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
          {isOwn && message.content && (
            <button
              onClick={() => { setDraft(message.content ?? ""); setEditing(true); }}
              aria-label="Edit message"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg opacity-70 hover:bg-background/30 hover:opacity-100"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {isOwn && (
            <button
              onClick={() => { if (window.confirm("Delete this message?")) onDelete(message.id); }}
              aria-label="Delete message"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg opacity-70 hover:bg-background/30 hover:text-destructive hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {showReactions && (
          <div className="mt-1 flex gap-1 rounded-xl border border-border bg-background p-1.5 shadow-lg" role="group" aria-label="Choose a reaction">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { onReact(message.id, emoji); setShowReactions(false); }}
                aria-label={`React with ${emoji}`}
                className="flex min-h-[44px] min-w-[40px] items-center justify-center rounded-lg text-lg hover:bg-muted"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupBubble({ group, currentUserId, isGroup, onEditMessage, onDeleteMessage, onToggleReaction }: {
  group: MessageData[];
  currentUserId: string;
  isGroup: boolean;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
}) {
  const first = group[0];
  const isOwn = first.sender_id === currentUserId;
  return (
    <div className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={first.sender?.avatar_url || ""} alt="" />
          <AvatarFallback name={first.sender?.display_name || first.sender?.username} />
        </Avatar>
      )}
      <div className={cn("max-w-[78%] space-y-1", isOwn && "items-end")}>
        {!isOwn && isGroup && (
          <p className="px-1 text-xs font-semibold text-muted-foreground">{first.sender?.display_name || first.sender?.username}</p>
        )}
        {group.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            currentUserId={currentUserId}
            isGroup={false}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
            onReact={onToggleReaction}
          />
        ))}
      </div>
    </div>
  );
}

function NewChatModal({ onClose, onCreate, currentUserId, createError }: { onClose: () => void; onCreate: (ids: string[]) => void; currentUserId: string; createError: string | null }) {
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

  // Escape closes, background scroll locks, focus is trapped and restored.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(true, onClose, dialogRef);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} aria-hidden="true">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="New group chat"
        className="bg-background rounded-lg p-6 w-full max-w-md mx-4 max-h-[90svh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">New Group Chat</h2>
            <p className="text-xs text-muted-foreground">Community messaging — DMs are disabled</p>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Select at least 2 people — one-to-one direct messages are disabled. Or start the chat from a community or channel.</p>
        {createError && (
          <p role="alert" className="text-sm text-red-500 mb-3">{createError}</p>
        )}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="chat-people-search"
            aria-label="Search people"
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
            Start Group Chat ({selectedUsers.length})
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