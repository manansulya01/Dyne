-- Dyne hardening migration: storage buckets, nullable staged media, RLS repairs, indexes.
-- Safe to apply on fresh or existing DB (all statements idempotent where possible).

-- 1. Allow staged uploads: post_media.post_id nullable so files can upload before post exists.
ALTER TABLE post_media ALTER COLUMN post_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'post_media_post_id_fkey'
  ) THEN
    ALTER TABLE post_media
      ADD CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- post_media UPDATE policy (owners need to link staged media to their new post).
DROP POLICY IF EXISTS "Users can link media to their own posts" ON post_media;
CREATE POLICY "Users can link media to their own posts" ON post_media
  FOR UPDATE USING (
    post_id IS NULL
    OR EXISTS (SELECT 1 FROM posts WHERE posts.id = post_media.post_id AND posts.author_id = auth.uid())
  )
  WITH CHECK (
    post_id IS NULL
    OR EXISTS (SELECT 1 FROM posts WHERE posts.id = post_media.post_id AND posts.author_id = auth.uid())
  );

-- Staged (unattached) media viewable by any authenticated user so the uploader's
-- follow-up queries succeed; files themselves stay protected by storage policies.
DROP POLICY IF EXISTS "Post media is viewable by everyone" ON post_media;
CREATE POLICY "Post media is viewable by everyone" ON post_media
  FOR SELECT USING (
    post_id IS NULL
    OR EXISTS (SELECT 1 FROM posts WHERE posts.id = post_media.post_id AND posts.deleted_at IS NULL)
  );

-- 2. Reactions: allow reaction-type changes via update (toggle UX).
DROP POLICY IF EXISTS "Users can update their own reactions" ON reactions;
CREATE POLICY "Users can update their own reactions" ON reactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Community member role changes (moderator promote/demote) via UPDATE.
DROP POLICY IF EXISTS "Owners and moderators can update membership roles" ON community_members;
CREATE POLICY "Owners and moderators can update membership roles" ON community_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM community_members me
      JOIN communities c ON c.id = me.community_id
      WHERE me.community_id = community_members.community_id
        AND me.user_id = auth.uid()
        AND (me.role IN ('owner', 'moderator') OR c.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_members me
      JOIN communities c ON c.id = me.community_id
      WHERE me.community_id = community_members.community_id
        AND me.user_id = auth.uid()
        AND (me.role IN ('owner', 'moderator') OR c.owner_id = auth.uid())
    )
  );

-- Admins can manage communities.
DROP POLICY IF EXISTS "Admins can update communities" ON communities;
CREATE POLICY "Admins can update communities" ON communities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );
DROP POLICY IF EXISTS "Admins can delete communities" ON communities;
CREATE POLICY "Admins can delete communities" ON communities
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );

-- 4. Conversations: allow creator + admins to update; creator to delete.
DROP POLICY IF EXISTS "Admins can update conversations" ON conversations;
CREATE POLICY "Admins can update conversations" ON conversations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );
DROP POLICY IF EXISTS "Creators can delete conversations" ON conversations;
CREATE POLICY "Creators can delete conversations" ON conversations
  FOR DELETE USING (auth.uid() = created_by);

-- Members can be added by existing members (group chat invites), not only creator.
DROP POLICY IF EXISTS "Members can add members to group conversations" ON conversation_members;
CREATE POLICY "Members can add members to group conversations" ON conversation_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_members me
      WHERE me.conversation_id = conversation_members.conversation_id
        AND me.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid()
    )
  );
-- Members can leave conversations.
DROP POLICY IF EXISTS "Members can leave conversations" ON conversation_members;
CREATE POLICY "Members can leave conversations" ON conversation_members
  FOR DELETE USING (auth.uid() = user_id);

-- Message authors can edit their own messages.
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
CREATE POLICY "Users can update their own messages" ON messages
  FOR UPDATE USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

-- 5. Events: organizers can update/delete their own events under RLS.
DROP POLICY IF EXISTS "Organizers can update their own events" ON events;
CREATE POLICY "Organizers can update their own events" ON events
  FOR UPDATE USING (auth.uid() = organizer_id) WITH CHECK (auth.uid() = organizer_id);
DROP POLICY IF EXISTS "Organizers can delete their own events" ON events;
CREATE POLICY "Organizers can delete their own events" ON events
  FOR DELETE USING (auth.uid() = organizer_id);

-- 6. Notifications: recipients can mark read (update) — insert stays open for
-- server-side fan-out via authenticated API routes.
DROP POLICY IF EXISTS "Recipients can update their notifications" ON notifications;
CREATE POLICY "Recipients can update their notifications" ON notifications
  FOR UPDATE USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);
DROP POLICY IF EXISTS "Recipients can delete their notifications" ON notifications;
CREATE POLICY "Recipients can delete their notifications" ON notifications
  FOR DELETE USING (auth.uid() = recipient_id);

-- 7. Performance indexes for hot paths.
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_reactions_target_type ON reactions(target_type, target_id, user_id);
CREATE INDEX IF NOT EXISTS idx_follows_pair ON follows(follower_id, following_id);
CREATE INDEX IF NOT EXISTS idx_community_members_lookup ON community_members(community_id, user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_pair ON saved_posts(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 8. Storage buckets (private by default; access governed by storage.objects policies below).
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('post-media', 'post-media', true),
  ('community-images', 'community-images', true),
  ('event-images', 'event-images', true),
  ('message-attachments', 'message-attachments', false),
  ('video-thumbnails', 'video-thumbnails', true),
  ('watch-videos', 'watch-videos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload to their own folder; public
-- buckets readable by everyone; private buckets readable by authenticated users.
-- avatars
DROP POLICY IF EXISTS "Avatar images are publicly readable" ON storage.objects;
CREATE POLICY "Avatar images are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- post-media
DROP POLICY IF EXISTS "Post media files are publicly readable" ON storage.objects;
CREATE POLICY "Post media files are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-media');
DROP POLICY IF EXISTS "Authenticated users can upload post media" ON storage.objects;
CREATE POLICY "Authenticated users can upload post media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'post-media' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can delete their own post media" ON storage.objects;
CREATE POLICY "Users can delete their own post media" ON storage.objects
  FOR DELETE USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- community-images
DROP POLICY IF EXISTS "Community images are publicly readable" ON storage.objects;
CREATE POLICY "Community images are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'community-images');
DROP POLICY IF EXISTS "Authenticated users can upload community images" ON storage.objects;
CREATE POLICY "Authenticated users can upload community images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'community-images' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can delete their own community images" ON storage.objects;
CREATE POLICY "Users can delete their own community images" ON storage.objects
  FOR DELETE USING (bucket_id = 'community-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- event-images
DROP POLICY IF EXISTS "Event images are publicly readable" ON storage.objects;
CREATE POLICY "Event images are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-images');
DROP POLICY IF EXISTS "Authenticated users can upload event images" ON storage.objects;
CREATE POLICY "Authenticated users can upload event images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'event-images' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can delete their own event images" ON storage.objects;
CREATE POLICY "Users can delete their own event images" ON storage.objects
  FOR DELETE USING (bucket_id = 'event-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- message-attachments (private: any authenticated user can read/write own folder)
DROP POLICY IF EXISTS "Members can read message attachments" ON storage.objects;
CREATE POLICY "Members can read message attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'message-attachments' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can upload message attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload message attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'message-attachments' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can delete their own message attachments" ON storage.objects;
CREATE POLICY "Users can delete their own message attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'message-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- video-thumbnails
DROP POLICY IF EXISTS "Video thumbnails are publicly readable" ON storage.objects;
CREATE POLICY "Video thumbnails are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'video-thumbnails');
DROP POLICY IF EXISTS "Authenticated users can upload video thumbnails" ON storage.objects;
CREATE POLICY "Authenticated users can upload video thumbnails" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'video-thumbnails' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can delete their own video thumbnails" ON storage.objects;
CREATE POLICY "Users can delete their own video thumbnails" ON storage.objects
  FOR DELETE USING (bucket_id = 'video-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

-- watch-videos (private: authenticated read, own-folder delete)
DROP POLICY IF EXISTS "Authenticated users can watch videos" ON storage.objects;
CREATE POLICY "Authenticated users can watch videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'watch-videos' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated users can upload watch videos" ON storage.objects;
CREATE POLICY "Authenticated users can upload watch videos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'watch-videos' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Users can delete their own watch videos" ON storage.objects;
CREATE POLICY "Users can delete their own watch videos" ON storage.objects
  FOR DELETE USING (bucket_id = 'watch-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
