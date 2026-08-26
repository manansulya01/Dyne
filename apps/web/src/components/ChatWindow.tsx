"use client";

import { useState, useCallback } from "react";
import axios from "@/utils/api";
import UserAvatar from "../ui/UserAvatar";
import { Button } from "../ui/button";
import { cn } from "@/utils/cn";

interface Message {
  id: string;
  content?: string;
  mediaUrl?: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  currentUserId: string;
}

/**
 * ChatWindow component for displaying messages in a channel or DM
 * Displays messages with proper styling and user info
 */
export const ChatWindow = ({
  messages,
  onSendMessage,
  isLoading = false,
  currentUserId,
}: ChatWindowProps) => {
  const [messageInput, setMessageInput] = useState("");

  const handleSend = useCallback(() => {
    if (messageInput.trim()) {
      onSendMessage(messageInput);
      setMessageInput("");
    }
  }, [messageInput, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-3", {
                "flex-row-reverse": message.authorId === currentUserId,
              })}
            >
              <UserAvatar
                src={message.author.avatar}
                fallback={message.author.name.substring(0, 2).toUpperCase()}
              />
              <div
                className={cn(
                  "flex flex-col gap-1",
                  message.authorId === currentUserId
                    ? "items-end"
                    : "items-start"
                )}
              >
                <p className="text-sm font-medium text-gray-700">
                  {message.author.name}
                </p>
                <div
                  className={cn(
                    "max-w-xs rounded-lg px-4 py-2",
                    message.authorId === currentUserId
                      ? "bg-purple-600 text-white"
                      : "bg-gray-200 text-gray-900"
                  )}
                >
                  {message.content && <p>{message.content}</p>}
                  {message.mediaUrl && (
                    <img
                      src={message.mediaUrl}
                      alt="message media"
                      className="max-w-sm rounded"
                    />
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-600 disabled:bg-gray-100"
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !messageInput.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};
