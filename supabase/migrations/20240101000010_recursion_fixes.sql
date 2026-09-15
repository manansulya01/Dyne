-- Dyne migration 10: eliminate RLS infinite recursion via SECURITY DEFINER helpers.
--
-- ROOT CAUSE (verified live): policies whose expressions query their OWN table
-- (e.g. community_members SELECT checking community_members) recurse forever:
-- evaluating the policy runs a query that re-triggers the same policy.
-- Postgres aborts with "infinite recursion detected in policy".
-- The standard fix is a SECURITY DEFINER lookup function (runs as owner,
-- bypasses RLS) used inside the policies instead of direct self-queries.
-- This also fixes the mutual events <-> event_attendees recursion for private
-- events, and makes rsvp_event SECURITY DEFINER so privacy checks are exact.

-- ---------- helper functions (bypass RLS by design; scoped to one row) ----------
CREATE OR REPLACE FUNCTION is_community_member(p_community_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION community_member_role(p_community_id uuid, p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM community_members
  WHERE community_id = p_community_id AND user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION is_conversation_member(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_event_attendee(p_event_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_attendees
    WHERE event_id = p_event_id AND user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION is_community_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION community_member_role(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_conversation_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_event_attendee(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_community_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION community_member_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_event_attendee(uuid, uuid) TO authenticated;

-- ---------- community_members ----------
DROP POLICY IF EXISTS "Community members are viewable by members" ON community_members;
CREATE POLICY "Community members are viewable by members" ON community_members
  FOR SELECT USING (is_community_member(community_id, auth.uid()));

DROP POLICY IF EXISTS "Moderators can remove members" ON community_members;
CREATE POLICY "Moderators can remove members" ON community_members
  FOR DELETE USING (
    community_member_role(community_id, auth.uid()) IN ('owner', 'moderator')
    AND community_members.user_id != auth.uid()
  );

DROP POLICY IF EXISTS "Owners and moderators can update membership roles" ON community_members;
CREATE POLICY "Owners and moderators can update membership roles" ON community_members
  FOR UPDATE USING (
    community_member_role(community_id, auth.uid()) IN ('owner', 'moderator')
  )
  WITH CHECK (
    community_member_role(community_id, auth.uid()) IN ('owner', 'moderator')
  );

-- ---------- communities (private visibility via helper) ----------
DROP POLICY IF EXISTS "Private communities viewable by members" ON communities;
CREATE POLICY "Private communities viewable by members" ON communities
  FOR SELECT USING (
    is_private = TRUE AND (
      auth.uid() = owner_id
      OR is_community_member(communities.id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() AND r.name = 'admin'
      )
    )
  );

-- ---------- community_posts (via helpers) ----------
DROP POLICY IF EXISTS "Community posts viewable by members" ON community_posts;
CREATE POLICY "Community posts viewable by members" ON community_posts
  FOR SELECT USING (
    is_community_member(community_posts.community_id, auth.uid())
    AND (
      community_posts.deleted_at IS NULL
      OR community_posts.author_id = auth.uid()
      OR community_member_role(community_posts.community_id, auth.uid()) IN ('owner', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Members can create community posts" ON community_posts;
CREATE POLICY "Members can create community posts" ON community_posts
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND is_community_member(community_id, auth.uid())
  );

DROP POLICY IF EXISTS "Moderators can remove community posts" ON community_posts;
CREATE POLICY "Moderators can remove community posts" ON community_posts
  FOR UPDATE USING (
    auth.uid() = community_posts.author_id
    OR community_member_role(community_posts.community_id, auth.uid()) IN ('owner', 'moderator')
  )
  WITH CHECK (
    auth.uid() = community_posts.author_id
    OR community_member_role(community_posts.community_id, auth.uid()) IN ('owner', 'moderator')
  );

-- ---------- conversations ----------
DROP POLICY IF EXISTS "Conversations viewable by members" ON conversations;
CREATE POLICY "Conversations viewable by members" ON conversations
  FOR SELECT USING (is_conversation_member(conversations.id, auth.uid()));

-- ---------- conversation_members ----------
DROP POLICY IF EXISTS "Members viewable by conversation participants" ON conversation_members;
CREATE POLICY "Members viewable by conversation participants" ON conversation_members
  FOR SELECT USING (is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members can add members to group conversations" ON conversation_members;
CREATE POLICY "Members can add members to group conversations" ON conversation_members
  FOR INSERT WITH CHECK (
    is_conversation_member(conversation_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid()
    )
  );

-- ---------- messages (membership checks via helper) ----------
DROP POLICY IF EXISTS "Messages viewable by conversation members" ON messages;
CREATE POLICY "Messages viewable by conversation members" ON messages
  FOR SELECT USING (
    deleted_at IS NULL AND is_conversation_member(messages.conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Members can send messages" ON messages;
CREATE POLICY "Members can send messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND is_conversation_member(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Attachments viewable by conversation members" ON message_attachments;
CREATE POLICY "Attachments viewable by conversation members" ON message_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages
      WHERE messages.id = message_attachments.message_id
      AND is_conversation_member(messages.conversation_id, auth.uid())
    )
  );

-- ---------- events (private visibility via helper; breaks events<->attendees recursion) ----------
DROP POLICY IF EXISTS "Private events viewable by attendees" ON events;
CREATE POLICY "Private events viewable by attendees" ON events
  FOR SELECT USING (
    is_public = FALSE AND (
      auth.uid() = organizer_id
      OR is_event_attendee(events.id, auth.uid())
    )
  );

-- ---------- rsvp_event becomes SECURITY DEFINER for exact privacy errors ----------
CREATE OR REPLACE FUNCTION rsvp_event(p_event_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
