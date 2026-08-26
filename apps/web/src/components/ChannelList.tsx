"use client";

import { useState, useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { cn } from "@/utils/cn";
import UserAvatar from "./ui/UserAvatar";

interface Channel {
  id: string;
  name: string;
  description?: string;
  type: "text" | "voice" | "announcement";
  icon?: string;
}

interface ChannelListProps {
  channels: Channel[];
  activeChannelId?: string;
  onChannelSelect: (channelId: string) => void;
  onCreateChannel?: () => void;
}

/**
 * ChannelList component for displaying and managing channels in a community
 * Shows text, voice, and announcement channels with selection
 */
export const ChannelList = ({
  channels,
  activeChannelId,
  onChannelSelect,
  onCreateChannel,
}: ChannelListProps) => {
  const { socket } = useSocket();
  const [onlineMembers, setOnlineMembers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) return;

    const handleUserOnline = (userId: string) => {
      setOnlineMembers((prev) => new Set([...prev, userId]));
    };

    const handleUserOffline = (userId: string) => {
      setOnlineMembers((prev) => {
        const updated = new Set(prev);
        updated.delete(userId);
        return updated;
      });
    };

    socket.on("user:online", handleUserOnline);
    socket.on("user:offline", handleUserOffline);

    return () => {
      socket.off("user:online", handleUserOnline);
      socket.off("user:offline", handleUserOffline);
    };
  }, [socket]);

  // Group channels by type
  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const announcements = channels.filter((c) => c.type === "announcement");

  const renderChannelGroup = (
    title: string,
    groupChannels: Channel[],
    prefix: string
  ) => {
    if (groupChannels.length === 0) return null;

    return (
      <div key={title} className="mb-4">
        <h3 className="mb-2 px-2 text-xs font-semibold uppercase text-gray-500">
          {title}
        </h3>
        <div className="space-y-1">
          {groupChannels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onChannelSelect(channel.id)}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                activeChannelId === channel.id
                  ? "bg-purple-100 text-purple-900"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-gray-400">{prefix}</span>
                <span className="truncate">{channel.name}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-3">
      {renderChannelGroup("Text Channels", textChannels, "#")}
      {renderChannelGroup("Voice Channels", voiceChannels, "🔊")}
      {renderChannelGroup("Announcements", announcements, "📢")}

      {onCreateChannel && (
        <button
          onClick={onCreateChannel}
          className="mt-4 w-full rounded-lg bg-purple-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-purple-700"
        >
          + New Channel
        </button>
      )}
    </div>
  );
};
