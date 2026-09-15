-- Dyne migration 12: fix rsvp_event inverted privacy flag, conversation creator
-- visibility, staged-media ownership.
--
-- 1. rsvp_event read is_public into a variable named v_is_private and tested
-- it directly, inverting the privacy model (public events rejected, private
-- events open). Fixed by testing NOT v_is_public. (Caught by live E2E.)
CREATE OR REPLACE FUNCTION rsvp_event(p_event_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_is_public boolean;
  v_organizer uuid;
  v_going int;
BEGIN
  IF p_status NOT IN ('going', 'interested', 'declined') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT max_attendees, is_public, organizer_id
    INTO v_max, v_is_public, v_organizer
    FROM events WHERE id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;

  IF NOT v_is_public AND v_organizer IS DISTINCT FROM auth.uid() THEN
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

-- 2. Conversations must be selectable by their creator: the INSERT in the
-- create-conversation flow returns the row, and new rows must pass SELECT,
-- but membership rows are only added afterwards. (Caught by live E2E: every
-- conversation creation failed RLS.)
DROP POLICY IF EXISTS "Conversations viewable by members" ON conversations;
CREATE POLICY "Conversations viewable by members" ON conversations
  FOR SELECT USING (
    auth.uid() = created_by
    OR is_conversation_member(conversations.id, auth.uid())
  );

-- 3. Staged media ownership: record the uploader so strangers cannot delete
-- staged uploads. (Caught by live E2E: any user could delete staged media.)
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_post_media_uploaded_by ON post_media(uploaded_by);
