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
  profile_tags?: string[];
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
  profile_tags: string[];
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
  const out: AuthorJSON & { profile_tags?: string[] } = {
    id: typeof rawId === "string" ? rawId : String(rawId ?? ""),
    username: String(a.username ?? ""),
    display_name: (a.displayName ?? a.display_name ?? null) as string | null,
    avatar_url: (a.avatarUrl ?? a.avatar_url ?? null) as string | null,
  };
  const tags = (a.profileTags ?? a.profile_tags) as unknown;
  if (Array.isArray(tags)) out.profile_tags = tags.filter((t) => typeof t === "string");
  return out;
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
    profile_tags: ((user.profileTags ?? user.profile_tags ?? []) as string[]).filter(
      (t) => typeof t === "string"
    ),
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
    post_type: post.post_type ?? "post",
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
    rules: ((c.rules ?? []) as unknown[]).filter((r) => typeof r === "string") as string[],
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    member_count: c.memberCount ?? c.member_count ?? 0,
    post_count: c.postCount ?? c.post_count ?? 0,
    last_post_at: c.lastPostAt ?? c.last_post_at ?? null,
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
    is_pinned: p.isPinned ?? p.is_pinned ?? false,
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
    community_id: toHexOrNull(c.communityId ?? c.community_id),
    channel_id: toHexOrNull(c.channelId ?? c.channel_id),
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
    edited_at: m.editedAt ?? m.edited_at ?? null,
    deleted_at: m.deletedAt ?? null,
    reactions: (m.reactions ?? {}) as Record<string, string[]>,
    mentions: Array.isArray(m.mentions) ? m.mentions : [],
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
  created_at: string;
  updated_at: unknown;
  creator: AuthorJSON | null;
  orientation: "horizontal" | "vertical";
  aspect_ratio: string | null;
  moderation_status: string;
  moderation_reason: string | null;
  moderation_media_analyzed: boolean;
  like_count: number;
  save_count: number;
  comment_count: number;
  liked_by_viewer: boolean;
}

export function toVideoJSON(v: Record<string, unknown>): VideoJSON {
  const orientation = (v.orientation as "horizontal" | "vertical") ?? "horizontal";
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
    created_at: isoOrEmpty(v.createdAt),
    updated_at: v.updatedAt,
    creator: pickAuthor(v.creator),
    orientation,
    aspect_ratio: (v.aspectRatio ?? null) as string | null,
    moderation_status: String(v.moderationStatus ?? v.moderation_status ?? "approved"),
    moderation_reason: (v.moderationReason ?? v.moderation_reason ?? null) as string | null,
    moderation_media_analyzed: Boolean(
      v.moderationMediaAnalyzed ?? v.moderation_media_analyzed ?? false
    ),
    like_count: Number(v.likeCount ?? 0),
    save_count: Number(v.saveCount ?? 0),
    comment_count: Number(v.commentCount ?? 0),
    liked_by_viewer: Boolean(v.likedByViewer ?? false),
  };
}

export interface ReelJSON {
  id: string;
  title: string;
  caption: string | null;
  video_url: string;
  thumbnail_url: string | null;
  creator_id: string;
  duration_seconds: number | null;
  view_count: number;
  like_count: number;
  save_count: number;
  share_count: number;
  comment_count: number;
  category: string | null;
  hashtags: string[];
  aspect_ratio: string | null;
  width: number | null;
  height: number | null;
  moderation_status: string;
  moderation_reason: string | null;
  moderation_media_analyzed: boolean;
  liked_by_viewer: boolean;
  created_at: string;
  published_at: string | null;
  creator: AuthorJSON | null;
}

export function toReelJSON(r: Record<string, unknown>): ReelJSON {
  return {
    id: idOf(r as Doc),
    title: String(r.title ?? ""),
    caption: (r.caption ?? null) as string | null,
    video_url: String(r.videoUrl ?? ""),
    thumbnail_url: (r.thumbnailUrl ?? null) as string | null,
    creator_id: toHex(r.creatorId ?? r.creator_id),
    duration_seconds: (r.durationSeconds ?? null) as number | null,
    view_count: Number(r.viewCount ?? 0),
    like_count: Number(r.likeCount ?? 0),
    save_count: Number(r.saveCount ?? 0),
    share_count: Number(r.shareCount ?? 0),
    comment_count: Number(r.commentCount ?? 0),
    category: (r.category ?? null) as string | null,
    hashtags: ((r.hashtags ?? []) as unknown[]).filter((h): h is string => typeof h === "string"),
    aspect_ratio: (r.aspectRatio ?? null) as string | null,
    width: (r.width ?? null) as number | null,
    height: (r.height ?? null) as number | null,
    moderation_status: String(r.moderationStatus ?? "pending"),
    moderation_reason: (r.moderationReason ?? null) as string | null,
    moderation_media_analyzed: Boolean(r.moderationMediaAnalyzed ?? false),
    liked_by_viewer: Boolean(r.likedByViewer ?? false),
    created_at: isoOrEmpty(r.createdAt),
    published_at: isoOrNull(r.publishedAt),
    creator: pickAuthor(r.creator),
  };
}

export interface StoryJSON {
  id: string;
  author_id: string;
  author: AuthorJSON | null;
  media_type: "image" | "video" | "text";
  media_url: string | null;
  thumbnail_url: string | null;
  text: string | null;
  background: string | null;
  caption: string | null;
  expires_at: string | null;
  view_count: number;
  moderation_status: string;
  created_at: string;
}

export function toStoryJSON(s: Record<string, unknown>): StoryJSON {
  return {
    id: idOf(s as Doc),
    author_id: toHex(s.authorId ?? s.author_id),
    author: pickAuthor(s.author),
    media_type: (s.mediaType ?? s.media_type ?? "text") as "image" | "video" | "text",
    media_url: (s.mediaUrl ?? s.media_url ?? null) as string | null,
    thumbnail_url: (s.thumbnailUrl ?? s.thumbnail_url ?? null) as string | null,
    text: (s.text ?? null) as string | null,
    background: (s.background ?? null) as string | null,
    caption: (s.caption ?? null) as string | null,
    expires_at: isoOrNull(s.expiresAt ?? s.expires_at ?? null),
    view_count: Number(s.viewCount ?? 0),
    moderation_status: String(s.moderationStatus ?? "pending"),
    created_at: isoOrEmpty(s.createdAt),
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
  const out: Record<string, unknown> = {
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
  // Moderator notes are only included when explicitly present (server strips
  // them for ordinary users in listReports).
  if ("moderatorNotes" in r && r.moderatorNotes !== undefined) {
    out.moderator_notes = r.moderatorNotes ?? null;
  }
  if ("moderator_notes" in r && r.moderator_notes !== undefined) {
    out.moderator_notes = r.moderator_notes ?? null;
  }
  return out;
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

export function toFeedbackJSON(f: Record<string, unknown>) {
  const out: Record<string, unknown> = {
    id: idOf(f as Doc),
    reporter_id: toHex(f.reporterId ?? f.reporter_id),
    title: f.title,
    description: f.description,
    category: f.category,
    page: f.page ?? null,
    status: f.status,
    priority: f.priority,
    admin_response: f.adminResponse ?? f.admin_response ?? null,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
    reporter: pickAuthor(f.reporter),
  };
  if ("internalNotes" in f && f.internalNotes !== undefined) {
    out.internal_notes = f.internalNotes ?? null;
  }
  return out;
}

export function toStudyMaterialJSON(s: Record<string, unknown>) {
  return {
    id: idOf(s as Doc),
    title: s.title,
    description: s.description ?? null,
    subject: s.subject,
    class_grade: s.classGrade ?? s.class_grade,
    topic: s.topic ?? null,
    material_type: s.materialType ?? s.material_type,
    tags: (s.tags ?? []) as string[],
    teacher: s.teacher ?? null,
    semester: s.semester ?? null,
    academic_year: s.academicYear ?? s.academic_year ?? null,
    uploader_id: toHex(s.uploaderId ?? s.uploader_id),
    uploader: pickAuthor(s.uploader),
    mime: s.mime,
    size: s.size,
    file_name: s.fileName ?? s.file_name,
    download_url: `/api/study-materials/${idOf(s as Doc)}/download`,
    is_featured: s.isFeatured ?? s.is_featured ?? false,
    is_removed: s.isRemoved ?? s.is_removed ?? false,
    status: s.status,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

/** ISO string for a date-ish value; empty string when absent. */
function isoOrEmpty(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toISOString" in value) {
    return (value as { toISOString(): string }).toISOString();
  }
  return "";
}

/** ISO string or null for a nullable date-ish value. */
function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = isoOrEmpty(value);
  return s || null;
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

/* ---------------- Academic / productivity contracts ---------------- */

export function toTaskJSON(t: Record<string, unknown>) {
  return {
    id: idOf(t as Doc),
    title: t.title,
    description: t.description ?? null,
    priority: t.priority,
    due_date: t.dueDate ?? t.due_date ?? null,
    course_id: toHexOrNull(t.courseId ?? t.course_id),
    course: (t.course ?? null) as { id: string; name: string; color: string } | null,
    tags: (t.tags ?? []) as string[],
    completed_at: t.completedAt ?? t.completed_at ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

export function toAssignmentJSON(a: Record<string, unknown>) {
  return {
    id: idOf(a as Doc),
    title: a.title,
    description: a.description ?? null,
    course_id: toHexOrNull(a.courseId ?? a.course_id),
    course: (a.course ?? null) as { id: string; name: string; color: string } | null,
    due_date: a.dueDate ?? a.due_date ?? null,
    priority: a.priority,
    status: a.status,
    progress: a.progress ?? 0,
    completed_at: a.completedAt ?? a.completed_at ?? null,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

export function toCourseJSON(c: Record<string, unknown>) {
  return {
    id: idOf(c as Doc),
    name: c.name,
    code: c.code ?? null,
    instructor: c.instructor ?? null,
    color: c.color ?? "green",
    room: c.room ?? null,
    description: c.description ?? null,
    semester: c.semester ?? null,
    schedule: (c.schedule ?? []) as Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
    counts: (c.counts ?? null) as {
      open_tasks: number; open_assignments: number; upcoming_exams: number; notes: number;
    } | null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function toExamJSON(e: Record<string, unknown>) {
  return {
    id: idOf(e as Doc),
    title: e.title,
    course_id: toHexOrNull(e.courseId ?? e.course_id),
    course: (e.course ?? null) as { id: string; name: string; color: string } | null,
    date: e.date ?? e.start_time ?? null,
    end_time: e.endTime ?? e.end_time ?? null,
    location: e.location ?? null,
    topics: (e.topics ?? []) as string[],
    preparation: e.preparation ?? 0,
    notes: e.notes ?? null,
    status: e.status,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

export function toNoteJSON(n: Record<string, unknown>) {
  return {
    id: idOf(n as Doc),
    title: n.title,
    body: n.body ?? "",
    course_id: toHexOrNull(n.courseId ?? n.course_id),
    course: (n.course ?? null) as { id: string; name: string; color: string } | null,
    tags: (n.tags ?? []) as string[],
    created_at: n.createdAt,
    updated_at: n.updatedAt,
  };
}

export function toGoalJSON(g: Record<string, unknown>) {
  return {
    id: idOf(g as Doc),
    title: g.title,
    description: g.description ?? null,
    target: g.target,
    current: g.current ?? 0,
    unit: g.unit ?? "units",
    deadline: g.deadline ?? null,
    status: g.status,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
  };
}

export function toHabitJSON(h: Record<string, unknown>) {
  return {
    id: idOf(h as Doc),
    name: h.name,
    frequency: h.frequency,
    target: h.target ?? 1,
    is_active: h.isActive ?? h.is_active ?? true,
    today_count: (h.todayCount ?? h.today_count ?? 0) as number,
    streak: (h.streak ?? 0) as number,
    created_at: h.createdAt,
    updated_at: h.updatedAt,
  };
}

export function toStudySessionJSON(s: Record<string, unknown>) {
  return {
    id: idOf(s as Doc),
    course_id: toHexOrNull(s.courseId ?? s.course_id),
    course: (s.course ?? null) as { id: string; name: string; color: string } | null,
    subject: s.subject ?? null,
    note: s.note ?? null,
    started_at: s.startedAt ?? s.started_at ?? null,
    ended_at: s.endedAt ?? s.ended_at ?? null,
    status: s.status,
    duration_seconds: (s.durationSeconds ?? s.duration_seconds ?? 0) as number,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

/* ---------------- Teacher-authored academic contracts ---------------- */

export interface TeacherAssignmentJSON {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  class_grade: string;
  instructions: string | null;
  status: string;
  due_date: string | null;
  publish_at: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  max_marks: number | null;
  assigned_count: number;
  completed_count: number;
  created_by: string;
  creator: AuthorJSON | null;
  created_at: unknown;
  updated_at: unknown;
}

export function toTeacherAssignmentJSON(a: Record<string, unknown>): TeacherAssignmentJSON {
  return {
    id: idOf(a as Doc),
    title: String(a.title ?? ""),
    description: (a.description ?? null) as string | null,
    subject: String(a.subject ?? ""),
    class_grade: String(a.classGrade ?? a.class_grade ?? ""),
    instructions: (a.instructions ?? null) as string | null,
    status: String(a.status ?? "draft"),
    due_date: isoOrNull(a.dueDate ?? a.due_date ?? null),
    publish_at: isoOrNull(a.publishAt ?? a.publish_at ?? null),
    attachment_url: (a.attachmentUrl ?? a.attachment_url ?? null) as string | null,
    attachment_name: (a.attachmentName ?? a.attachment_name ?? null) as string | null,
    max_marks: (a.maxMarks ?? a.max_marks ?? null) as number | null,
    assigned_count: Number(a.assignedCount ?? a.assigned_count ?? 0),
    completed_count: Number(a.completedCount ?? a.completed_count ?? 0),
    created_by: toHex(a.createdBy ?? a.created_by),
    creator: pickAuthor(a.creator),
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

export function toSubmissionJSON(s: Record<string, unknown>) {
  return {
    id: idOf(s as Doc),
    assignment_id: toHex(s.assignmentId ?? s.assignment_id),
    student_id: toHex(s.studentId ?? s.student_id),
    status: String(s.status ?? "not_started"),
    progress: Number(s.progress ?? 0),
    submitted_at: s.submittedAt ?? s.submitted_at ?? null,
    submission_url: (s.submissionUrl ?? s.submission_url ?? null) as string | null,
    submission_name: (s.submissionName ?? s.submission_name ?? null) as string | null,
    submission_text: (s.submissionText ?? s.submission_text ?? null) as string | null,
    score: (s.score ?? null) as number | null,
    feedback: (s.feedback ?? null) as string | null,
    graded_at: s.gradedAt ?? s.graded_at ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

export interface ExamQuestionJSON {
  id: string;
  type: string;
  prompt: string;
  marks: number;
  difficulty: string;
  options: Array<{ id: string; text: string }>;
  pairs: Array<{ id: string; left: string; right: string }>;
  explanation: string | null;
  attachment_url: string | null;
  auto_gradable: boolean;
  case_study_text: string | null;
  /** Only present for teacher/owner views. */
  correct_option_ids?: string[];
  correct_answers?: string[];
  numeric_range?: { min: number; max: number } | null;
}

export interface ClassExamJSON {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  class_grade: string;
  mode: string;
  status: string;
  instructions: string | null;
  duration_minutes: number | null;
  starts_at: string | null;
  ends_at: string | null;
  total_marks: number;
  passing_marks: number;
  attempt_limit: number;
  question_count: number;
  results_released: boolean;
  created_by: string;
  creator: AuthorJSON | null;
  created_at: unknown;
  updated_at: unknown;
}

export function toExamQuestionJSON(
  q: Record<string, unknown>,
  includeAnswers = false
): ExamQuestionJSON {
  const out: ExamQuestionJSON = {
    id: String(q.id ?? ""),
    type: String(q.type ?? "short_answer"),
    prompt: String(q.prompt ?? ""),
    marks: Number(q.marks ?? 0),
    difficulty: String(q.difficulty ?? "medium"),
    options: ((q.options ?? []) as Array<Record<string, unknown>>).map((o) => ({
      id: String(o.id ?? ""),
      text: String(o.text ?? ""),
    })),
    pairs: ((q.pairs ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id ?? ""),
      left: String(p.left ?? ""),
      right: String(p.right ?? ""),
    })),
    explanation: (q.explanation ?? null) as string | null,
    attachment_url: (q.attachmentUrl ?? q.attachment_url ?? null) as string | null,
    auto_gradable: Boolean(q.autoGraded ?? q.auto_gradable ?? false),
    case_study_text: (q.caseStudyText ?? q.case_study_text ?? null) as string | null,
  };
  if (includeAnswers) {
    const options = (q.options ?? []) as Array<Record<string, unknown>>;
    out.correct_option_ids = options.filter((o) => o.isCorrect).map((o) => String(o.id));
    out.correct_answers = ((q.correctAnswers ?? []) as unknown[]).map(String);
    const range = (q.numericRange ?? null) as { min: number; max: number } | null;
    out.numeric_range = range;
  }
  return out;
}

export function toClassExamJSON(e: Record<string, unknown>): ClassExamJSON {
  return {
    id: idOf(e as Doc),
    title: String(e.title ?? ""),
    description: (e.description ?? null) as string | null,
    subject: String(e.subject ?? ""),
    class_grade: String(e.classGrade ?? e.class_grade ?? ""),
    mode: String(e.mode ?? "timed"),
    status: String(e.status ?? "draft"),
    instructions: (e.instructions ?? null) as string | null,
    duration_minutes: (e.durationMinutes ?? e.duration_minutes ?? null) as number | null,
    starts_at: isoOrNull(e.startsAt ?? e.starts_at ?? null),
    ends_at: isoOrNull(e.endsAt ?? e.ends_at ?? null),
    total_marks: Number(e.totalMarks ?? e.total_marks ?? 0),
    passing_marks: Number(e.passingMarks ?? e.passing_marks ?? 0),
    attempt_limit: Number(e.attemptLimit ?? e.attempt_limit ?? 1),
    question_count: Array.isArray(e.questions)
      ? (e.questions as unknown[]).length
      : Number(e.questionCount ?? e.question_count ?? 0),
    results_released: Boolean(e.resultsReleased ?? e.results_released ?? false),
    created_by: toHex(e.createdBy ?? e.created_by),
    creator: pickAuthor(e.creator),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/**
 * Student-visible attempt payload.
 *
 * `revealScores: false` blanks every score-bearing field (total, per-question
 * awarded marks, pass flag, grader notes) so an unreleased exam cannot leak
 * results through the attempt endpoints. Managers always pass `true`.
 */
export function toExamAttemptJSON(
  a: Record<string, unknown>,
  options: { revealScores?: boolean } = {}
) {
  const reveal = options.revealScores !== false;
  const blank = (value: unknown) => (reveal ? (value as number | null) : null);
  return {
    id: idOf(a as Doc),
    exam_id: toHex(a.examId ?? a.exam_id),
    student_id: toHex(a.studentId ?? a.student_id),
    attempt_number: Number(a.attemptNumber ?? a.attempt_number ?? 1),
    status: String(a.status ?? "in_progress"),
    answers: ((a.answers ?? []) as Array<Record<string, unknown>>).map((ans) => ({
      question_id: String(ans.questionId ?? ""),
      option_ids: (ans.optionIds ?? []) as string[],
      text: String(ans.text ?? ""),
      awarded_marks: blank(ans.awardedMarks ?? null),
      auto_graded: Boolean(ans.autoGraded ?? false),
      grader_notes: reveal ? ((ans.graderNotes ?? null) as string | null) : null,
    })),
    started_at: a.startedAt ?? a.started_at ?? null,
    submitted_at: a.submittedAt ?? a.submitted_at ?? null,
    score: blank(a.score ?? null),
    auto_score: blank(a.autoScore ?? a.auto_score ?? null),
    manual_score: blank(a.manualScore ?? a.manual_score ?? null),
    max_score: Number(a.maxScore ?? a.max_score ?? 0),
    percentage: blank(a.percentage ?? null),
    passed: reveal ? ((a.passed ?? null) as boolean | null) : null,
    grader_notes: reveal ? ((a.graderNotes ?? a.grader_notes ?? null) as string | null) : null,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}
