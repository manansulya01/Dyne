/**
 * API contract mappers: repository domain objects (camelCase) -> the stable
 * snake_case JSON shapes the frontend consumes.
 *
 * Keeping these contracts stable means the UI works unchanged against the
 * MongoDB backend.
 */

interface Doc {
  _id?: { toHexString(): string };
  id?: string;
}

export interface AuthorJSON {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ProfileJSON {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  accent: string | null;
  bio: string | null;
  role: string;
  class_grade: string | null;
  house: string | null;
  interests: string[];
  created_at: unknown;
  updated_at: unknown;
}

function idOf(doc: Doc): string {
  if (typeof doc.id === "string") return doc.id;
  if (doc._id) return doc._id.toHexString();
  throw new Error("Document without id");
}

function pickAuthor(author: unknown): AuthorJSON | null {
  if (!author || typeof author !== "object") return null;
  const a = author as Record<string, unknown>;
  const rawId = a.id ?? a._id;
  return {
    id: typeof rawId === "string" ? rawId : String(rawId ?? ""),
    username: String(a.username ?? ""),
    display_name: (a.displayName ?? a.display_name ?? null) as string | null,
    avatar_url: (a.avatarUrl ?? a.avatar_url ?? null) as string | null,
  };
}

export function toProfileJSON(user: Record<string, unknown>): ProfileJSON {
  return {
    id: idOf(user as Doc),
    username: String(user.username ?? ""),
    display_name: (user.displayName ?? null) as string | null,
    avatar_url: (user.avatarUrl ?? null) as string | null,
    cover_image_url: (user.coverImageUrl ?? null) as string | null,
    accent: (user.accent ?? null) as string | null,
    bio: (user.bio ?? null) as string | null,
    role: String(user.role ?? "student"),
    class_grade: (user.classGrade ?? null) as string | null,
    house: (user.house ?? null) as string | null,
    interests: (user.interests ?? []) as string[],
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

export function toPostJSON(post: Record<string, unknown>) {
  const media = ((post.media ?? []) as Array<Record<string, unknown>>).map((m, i) => ({
    id: typeof m.id === "string" ? m.id : `${idOf(post as Doc)}-${i}`,
    post_id: idOf(post as Doc),
    media_type: m.mediaType ?? m.media_type ?? "image",
    url: m.url,
    thumbnail_url: m.thumbnailUrl ?? m.thumbnail_url ?? null,
    order_index: m.orderIndex ?? m.order_index ?? i,
    created_at: post.createdAt,
  }));
  return {
    id: idOf(post as Doc),
    author_id: toHex(post.authorId ?? post.author_id),
    content: post.content ?? null,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    deleted_at: post.deletedAt ?? null,
    author: pickAuthor(post.author),
    media,
    reaction_count: post.reactionCount ?? post.reaction_count ?? 0,
    comment_count: post.commentCount ?? post.comment_count ?? 0,
  };
}

export function toCommentJSON(comment: Record<string, unknown>) {
  return {
    id: idOf(comment as Doc),
    post_id: toHex(comment.postId ?? comment.post_id),
    author_id: toHex(comment.authorId ?? comment.author_id),
    content: comment.content,
    parent_comment_id: toHexOrNull(comment.parentId ?? comment.parent_comment_id),
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
    deleted_at: comment.deletedAt ?? null,
    author: pickAuthor(comment.author),
    reaction_count: comment.reactionCount ?? comment.reaction_count ?? 0,
    reply_count: comment.replyCount ?? comment.reply_count ?? 0,
  };
}

export function toCommunityJSON(c: Record<string, unknown>) {
  return {
    id: idOf(c as Doc),
    slug: c.slug,
    name: c.name,
    description: c.description ?? null,
    image_url: c.imageUrl ?? c.image_url ?? null,
    owner_id: toHex(c.ownerId ?? c.owner_id),
    owner: pickAuthor(c.owner),
    is_private: c.isPrivate ?? c.is_private ?? false,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    member_count: c.memberCount ?? c.member_count ?? 0,
    is_member: c.isMember ?? c.is_member ?? false,
    is_owner: c.isOwner ?? c.is_owner ?? false,
    member_role: c.memberRole ?? c.member_role ?? "none",
  };
}

export function toCommunityPostJSON(p: Record<string, unknown>) {
  return {
    id: idOf(p as Doc),
    community_id: toHex(p.communityId ?? p.community_id),
    author_id: toHex(p.authorId ?? p.author_id),
    content: p.content ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt ?? null,
    author: pickAuthor(p.author),
    media: [],
    reaction_count: 0,
    comment_count: 0,
  };
}

export function toConversationJSON(c: Record<string, unknown>) {
  const members = ((c.otherMembers ?? []) as unknown[]).map(pickAuthor);
  return {
    id: idOf(c as Doc),
    type: c.type,
    name: c.name ?? null,
    image_url: c.imageUrl ?? c.image_url ?? null,
    created_by: toHex(c.createdBy ?? c.created_by),
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    members: c.members ?? members.length,
    other_member: members[0] ?? null,
    unread_count: c.unread ? 1 : 0,
    last_message: c.lastMessage
      ? {
          id: idOf(c.lastMessage as Doc),
          content: (c.lastMessage as Record<string, unknown>).content ?? null,
          sender_id: toHex(
            (c.lastMessage as Record<string, unknown>).senderId ??
              (c.lastMessage as Record<string, unknown>).sender_id
          ),
          created_at: (c.lastMessage as Record<string, unknown>).createdAt,
        }
      : null,
  };
}

export function toMessageJSON(m: Record<string, unknown>) {
  return {
    id: idOf(m as Doc),
    conversation_id: toHex(m.conversationId ?? m.conversation_id),
    sender_id: toHex(m.senderId ?? m.sender_id),
    content: m.content ?? null,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    deleted_at: m.deletedAt ?? null,
    sender: pickAuthor(m.sender),
    attachments: ((m.attachments ?? []) as Array<Record<string, unknown>>).map((a, i) => ({
      id: typeof a.id === "string" ? a.id : `${idOf(m as Doc)}-${i}`,
      message_id: idOf(m as Doc),
      file_url: a.url ?? a.file_url,
      file_type: a.mime ?? a.file_type,
      file_name: a.fileName ?? a.file_name,
      file_size: a.size ?? a.file_size ?? 0,
      created_at: m.createdAt,
    })),
  };
}

export function toEventJSON(e: Record<string, unknown>) {
  return {
    id: idOf(e as Doc),
    title: e.title,
    description: e.description ?? null,
    image_url: e.imageUrl ?? e.image_url ?? null,
    location_id: toHexOrNull(e.locationId ?? e.location_id),
    start_time: e.startTime ?? e.start_time,
    end_time: e.endTime ?? e.end_time,
    organizer_id: toHex(e.organizerId ?? e.organizer_id),
    is_public: e.isPublic ?? e.is_public ?? true,
    max_attendees: e.maxAttendees ?? e.max_attendees ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    attendee_count: e.attendeeCount ?? e.attendee_count ?? 0,
    user_rsvp: e.userRsvp ?? e.user_rsvp ?? null,
    is_organizer: e.isOrganizer ?? e.is_organizer ?? false,
    organizer: pickAuthor(e.organizer),
    location: e.locationName ?? e.location ?? null,
  };
}

export interface VideoJSON {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  creator_id: string;
  duration: number | null;
  view_count: number;
  category: string | null;
  created_at: unknown;
  updated_at: unknown;
  creator: AuthorJSON | null;
}

export function toVideoJSON(v: Record<string, unknown>): VideoJSON {
  return {
    id: idOf(v as Doc),
    title: String(v.title ?? ""),
    description: (v.description ?? null) as string | null,
    video_url: String(v.videoUrl ?? v.video_url ?? ""),
    thumbnail_url: (v.thumbnailUrl ?? v.thumbnail_url ?? null) as string | null,
    creator_id: toHex(v.creatorId ?? v.creator_id),
    duration: (v.duration ?? null) as number | null,
    view_count: Number(v.viewCount ?? v.view_count ?? 0),
    category: (v.category ?? null) as string | null,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
    creator: pickAuthor(v.creator),
  };
}

export function toNotificationJSON(n: Record<string, unknown>) {
  return {
    id: idOf(n as Doc),
    recipient_id: toHex(n.recipientId ?? n.recipient_id),
    actor_id: toHexOrNull(n.actorId ?? n.actor_id),
    type: n.type,
    title: n.title,
    message: n.message ?? null,
    data: n.data ?? null,
    read_at: n.readAt ?? n.read_at ?? null,
    created_at: n.createdAt,
    actor: pickAuthor(n.actor),
  };
}

export function toReportJSON(r: Record<string, unknown>) {
  return {
    id: idOf(r as Doc),
    reporter_id: toHex(r.reporterId ?? r.reporter_id),
    target_type: r.targetType ?? r.target_type,
    target_id: toHex(r.targetId ?? r.target_id),
    reason: r.reason,
    description: r.description ?? null,
    status: r.status,
    reviewed_by: toHexOrNull(r.reviewedBy ?? r.reviewed_by),
    reviewed_at: r.reviewedAt ?? r.reviewed_at ?? null,
    created_at: r.createdAt,
    reporter: pickAuthor(r.reporter),
  };
}

export function toBuildingJSON(b: Record<string, unknown>) {
  return {
    id: idOf(b as Doc),
    name: b.name,
    description: b.description ?? null,
    image_url: b.imageUrl ?? b.image_url ?? null,
    latitude: b.latitude ?? null,
    longitude: b.longitude ?? null,
    floor_count: b.floorCount ?? b.floor_count ?? null,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  };
}

export function toClubJSON(c: Record<string, unknown>) {
  return {
    id: idOf(c as Doc),
    name: c.name,
    description: c.description ?? null,
    image_url: c.imageUrl ?? c.image_url ?? null,
    category: c.category ?? null,
    is_official: c.isOfficial ?? c.is_official ?? false,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function toMemberJSON(m: Record<string, unknown>) {  const user = pickAuthor(m.user);
  return {
    ...(user ?? {}),
    role: m.role,
    joined_at: m.joinedAt ?? m.joined_at,
  };
}

function toHex(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toHexString" in value) {
    return (value as { toHexString(): string }).toHexString();
  }
  return String(value ?? "");
}

function toHexOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toHex(value);
}
