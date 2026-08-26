"use client";

import { useState } from "react";
import { cn } from "@/utils/cn";
import UserAvatar from "./ui/UserAvatar";
import { Button } from "./ui/button";

interface ThreadPost {
  id: string;
  title: string;
  content: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  commentCount: number;
  voteCount: number;
  userVote?: "upvote" | "downvote" | null;
  createdAt: string;
  tags?: string[];
}

interface DiscussionThreadProps {
  post: ThreadPost;
  onVote?: (postId: string, type: "upvote" | "downvote") => void;
  onOpenThread?: (postId: string) => void;
  onCommentClick?: (postId: string) => void;
}

/**
 * DiscussionThread component displaying a post/thread with voting and comments
 * Supports nested discussion viewing and voting from Threaddit
 */
export const DiscussionThread = ({
  post,
  onVote,
  onOpenThread,
  onCommentClick,
}: DiscussionThreadProps) => {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <UserAvatar
          src={post.author.avatar}
          fallback={post.author.name.substring(0, 2).toUpperCase()}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{post.author.name}</p>
          <p className="text-xs text-gray-500">
            {new Date(post.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900 mb-2">
          {post.title}
        </h3>
        <p className="text-sm text-gray-700 line-clamp-3">{post.content}</p>
      </div>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer - Actions */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          {/* Voting */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={post.userVote === "upvote" ? "default" : "ghost"}
              onClick={() => onVote?.(post.id, "upvote")}
              className={cn(
                "h-6 px-2 text-xs",
                post.userVote === "upvote"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              👍 {post.voteCount}
            </Button>
            <Button
              size="sm"
              variant={post.userVote === "downvote" ? "default" : "ghost"}
              onClick={() => onVote?.(post.id, "downvote")}
              className={cn(
                "h-6 px-2 text-xs",
                post.userVote === "downvote"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              👎
            </Button>
          </div>

          {/* Comments */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCommentClick?.(post.id)}
            className="h-6 px-2 text-xs text-gray-600 hover:bg-gray-100"
          >
            💬 {post.commentCount}
          </Button>
        </div>

        {showActions && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenThread?.(post.id)}
            className="h-6 px-2 text-xs text-purple-600 hover:bg-purple-100"
          >
            View Thread
          </Button>
        )}
      </div>
    </div>
  );
};
