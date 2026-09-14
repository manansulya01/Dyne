"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { postCreateSchema, type PostCreateInput } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import Image from "next/image";
import { formatRelativeTime } from "@/lib/utils";

import { PostWithRelations, PostMedia } from "@/types";

interface FeedClientProps {
  initialPosts: PostWithRelations[];
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export function FeedClient({ initialPosts, profile }: FeedClientProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [isCreating, setIsCreating] = useState(false);

  const { register, handleSubmit, reset } = useForm<PostCreateInput>({
    resolver: zodResolver(postCreateSchema),
  });

  const onSubmit = async (data: PostCreateInput) => {
    setIsCreating(true);
    const formData = new FormData();
    formData.append("content", data.content || "");
    if (data.mediaIds) {
      data.mediaIds.forEach(id => formData.append("mediaIds", id));
    }

    const response = await fetch("/api/posts", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (result.error) {
      console.error("Failed to create post:", result.error);
      setIsCreating(false);
      return;
    }

    setPosts([result.post, ...posts]);
    reset();
    setIsCreating(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
      {profile && (
        <Card className="border border-dashed">
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div className="flex gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={profile.avatar_url || ""} alt="" />
                  <AvatarFallback name={profile.display_name || profile.username} />
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Textarea
                    placeholder="What's on your mind?"
                    {...register("content")}
                    className="min-h-[80px] resize-none"
                    disabled={isCreating}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" disabled>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </Button>
                    </div>
                    <Button type="submit" disabled={isCreating}>
                      {isCreating ? "Posting..." : "Post"}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        {posts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No posts yet. Be the first to share!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PostCard({ post }: { post: PostWithRelations }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.author?.avatar_url || ""} alt="" />
            <AvatarFallback name={post.author?.display_name || post.author?.username} />
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{post.author?.display_name || post.author?.username}</span>
              <span className="text-muted-foreground text-sm">@{post.author?.username}</span>
              <span className="text-muted-foreground text-sm">·</span>
              <time className="text-muted-foreground text-sm">{formatRelativeTime(post.created_at)}</time>
            </div>
            {post.content && <p className="mt-1 whitespace-pre-wrap">{post.content}</p>}
            {post.media && post.media.length > 0 && (
              <div className="mt-2 grid gap-2 grid-cols-2">
                {post.media.map((m: PostMedia, i: number) => (
                  <div key={i} className="aspect-video rounded-lg overflow-hidden bg-muted">
                    {m.media_type === "image" ? (
                      <Image src={m.url} alt="" fill className="object-cover" sizes="50vw" />
                    ) : (
                      <video src={m.url} controls className="h-full w-full" />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t">
              <Button variant="ghost" size="sm" className="gap-1">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span>{post.reaction_count || 0}</span>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>{post.comment_count || 0}</span>
              </Button>
              <Button variant="ghost" size="sm" className="gap-1 ml-auto">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}