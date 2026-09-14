export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  class_grade: string | null;
  house: string | null;
  interests: string[];
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
}

export type UserRole = "student" | "teacher" | "staff" | "club" | "admin";

export interface Role {
  id: string;
  name: UserRole;
  description: string | null;
  created_at: string;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PostWithRelations extends Post {
  author: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
  media: PostMedia[];
  reaction_count: number;
  comment_count: number;
}

export interface PostMedia {
  id: string;
  post_id: string;
  media_type: "image" | "video";
  url: string;
  thumbnail_url: string | null;
  order_index: number;
  created_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Reaction {
  id: string;
  user_id: string;
  target_type: "post" | "comment" | "video";
  target_id: string;
  reaction_type: string;
  created_at: string;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface SavedPost {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  owner_id: string;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  role: "owner" | "moderator" | "member";
  joined_at: string;
}

export interface CommunityPost {
  id: string;
  community_id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Conversation {
  id: string;
  type: "direct" | "group";
  name: string | null;
  image_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_url: string;
  file_type: string;
  file_name: string;
  file_size: number;
  created_at: string;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  location_id: string | null;
  start_time: string;
  end_time: string;
  organizer_id: string;
  is_public: boolean;
  max_attendees: number | null;
  created_at: string;
  updated_at: string;
}

export interface EventAttendee {
  id: string;
  event_id: string;
  user_id: string;
  status: "going" | "interested" | "declined";
  created_at: string;
}

export interface CampusBuilding {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  floor_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface Club {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  is_official: boolean;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  creator_id: string;
  duration: number | null;
  view_count: number;
  category: string | null;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}

export interface VideoView {
  id: string;
  video_id: string;
  user_id: string | null;
  watched_duration: number;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  message: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export type NotificationType =
  | "follow"
  | "like"
  | "comment"
  | "mention"
  | "community_join"
  | "message"
  | "event_reminder"
  | "moderation_action"
  | "event_rsvp";

export interface Report {
  id: string;
  reporter_id: string;
  target_type: "post" | "comment" | "user" | "community" | "video";
  target_id: string;
  reason: string;
  description: string | null;
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ModerationAction {
  id: string;
  moderator_id: string;
  target_type: "post" | "comment" | "user" | "community" | "video";
  target_id: string;
  action: "warning" | "content_removal" | "temp_ban" | "perm_ban" | "dismiss";
  reason: string | null;
  created_at: string;
}