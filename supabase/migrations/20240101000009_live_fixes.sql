-- Dyne migration 09: fix soft-delete RLS trap, staged uploads, RSVP atomicity.
--
-- ROOT CAUSE (verified live): PostgreSQL enforces SELECT USING policies on the
-- NEW row of an UPDATE. Tables whose SELECT requires `deleted_at IS NULL`
-- therefore REJECT soft-delete updates (SET deleted_at = now()). The fix is to
-- let authors (and moderators where applicable) see their own deleted rows, so
-- the new row still passes SELECT. API routes keep filtering deleted rows out.

-- 1. posts: authors may see (and thus soft-delete) their own posts.
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
CREATE POLICY "Posts are viewable by everyone" ON posts
  FOR SELECT USING (deleted_at IS NULL OR auth.uid() = author_id);

-- 2. comments: same fix for comment authors.
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
CREATE POLICY "Comments are viewable by everyone" ON comments
  FOR SELECT USING (deleted_at IS NULL OR auth.uid() = author_id);

-- 3. community_posts: members see live posts; authors, moderators, and owners
-- can also see removed ones (required for moderation removal updates).
DROP POLICY IF EXISTS "Community posts viewable by members" ON community_posts;
CREATE POLICY "Community posts viewable by members" ON community_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM community_members
      WHERE community_members.community_id = community_posts.community_id
      AND community_members.user_id = auth.uid()
    )
    AND (
      community_posts.deleted_at IS NULL
      OR community_posts.author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM community_members mods
        WHERE mods.community_id = community_posts.community_id
        AND mods.user_id = auth.uid()
        AND mods.role IN ('owner', 'moderator')
      )
    )
  );

-- Moderators/owners can remove community posts (sets deleted_at).
DROP POLICY IF EXISTS "Moderators can remove community posts" ON community_posts;
CREATE POLICY "Moderators can remove community posts" ON community_posts
  FOR UPDATE USING (
    auth.uid() = community_posts.author_id
    OR EXISTS (
      SELECT 1 FROM community_members mods
      WHERE mods.community_id = community_posts.community_id
      AND mods.user_id = auth.uid()
      AND mods.role IN ('owner', 'moderator')
    )
  )
  WITH CHECK (
    auth.uid() = community_posts.author_id
    OR EXISTS (
      SELECT 1 FROM community_members mods
      WHERE mods.community_id = community_posts.community_id
      AND mods.user_id = auth.uid()
      AND mods.role IN ('owner', 'moderator')
    )
  );

-- 4. events: organizers must see (and therefore be able to edit, including
-- making private) their own events even when they are not attendees.
DROP POLICY IF EXISTS "Private events viewable by attendees" ON events;
CREATE POLICY "Private events viewable by attendees" ON events
  FOR SELECT USING (
    is_public = FALSE AND (
      auth.uid() = organizer_id
      OR EXISTS (
        SELECT 1 FROM event_attendees
        WHERE event_attendees.event_id = events.id
        AND event_attendees.user_id = auth.uid()
      )
    )
  );

-- 5. communities: owners (and admins) can view private communities so settings
-- updates (e.g. toggling visibility) are never blocked by RLS.
DROP POLICY IF EXISTS "Private communities viewable by members" ON communities;
CREATE POLICY "Private communities viewable by members" ON communities
  FOR SELECT USING (
    is_private = TRUE AND (
      auth.uid() = owner_id
      OR EXISTS (
        SELECT 1 FROM community_members
        WHERE community_members.community_id = communities.id
        AND community_members.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() AND r.name = 'admin'
      )
    )
  );

-- 6. Staged uploads: an authenticated user may insert unattached media
-- (post_id IS NULL); attaching it to a post is still governed by the UPDATE
-- policy, which requires owning the target post.
DROP POLICY IF EXISTS "Authenticated users can stage media" ON post_media;
CREATE POLICY "Authenticated users can stage media" ON post_media
  FOR INSERT WITH CHECK (post_id IS NULL AND auth.role() = 'authenticated');

-- 7. Video views: only authenticated users may record views (the app requires
-- auth everywhere videos are used; anonymous counting is not needed).
DROP POLICY IF EXISTS "Anyone can record a view" ON video_views;
CREATE POLICY "Authenticated users can record a view" ON video_views
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 8. Atomic RSVP: row-lock the event, enforce privacy + capacity, then upsert.
-- Eliminates the check-then-insert race and centralizes the privacy model:
-- private events accept RSVPs only from the organizer (no open invite path).
CREATE OR REPLACE FUNCTION rsvp_event(p_event_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_is_private boolean;
  v_organizer uuid;
  v_going int;
BEGIN
  IF p_status NOT IN ('going', 'interested', 'declined') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT max_attendees, is_public, organizer_id
    INTO v_max, v_is_private, v_organizer
    FROM events WHERE id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;

  IF v_is_private AND v_organizer IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PRIVATE_EVENT';
  END IF;

  IF p_status = 'going' AND v_max IS NOT NULL THEN
    SELECT count(*) INTO v_going FROM event_attendees
      WHERE event_id = p_event_id AND status = 'going' AND user_id IS DISTINCT FROM auth.uid();
    IF v_going >= v_max THEN
      RAISE EXCEPTION 'EVENT_FULL';
    END IF;
  END IF;

  INSERT INTO event_attendees (event_id, user_id, status)
    VALUES (p_event_id, auth.uid(), p_status)
    ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status;
END;
$$;

REVOKE ALL ON FUNCTION rsvp_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rsvp_event(uuid, text) TO authenticated;
