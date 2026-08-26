"use client";

import { useState } from "react";
import { cn } from "@/utils/cn";
import { Button } from "./button";

interface MessageInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

/**
 * MessageInput component for sending messages
 * Integrated with Dyne design system
 */
export const MessageInput = ({
  onSend,
  isLoading = false,
  placeholder = "Type a message...",
}: MessageInputProps) => {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 p-4 border-t border-gray-200 bg-white">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        className={cn(
          "flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-600",
          "disabled:bg-gray-100 disabled:text-gray-500"
        )}
        rows={1}
      />
      <Button
        onClick={handleSend}
        disabled={isLoading || !message.trim()}
        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
      >
        {isLoading ? "Sending..." : "Send"}
      </Button>
    </div>
  );
};
