-- Dyne migration 11: break user_roles recursion; allow signup student-role claim.
--
-- ROOT CAUSE (verified live): the "Admins can manage user roles" FOR ALL policy
-- queries user_roles itself. FOR ALL applies to SELECT too, so EVERY user_roles
-- read re-triggers the policy -> "infinite recursion detected". This silently
-- broke every server-side role check (they saw empty rows and denied access).
-- Fix: SECURITY DEFINER role helpers, used by this and other policies.
-- Also: new users must be able to claim ONLY the student role at signup
-- (previously the insert silently failed, leaving users with no role row).

CREATE OR REPLACE FUNCTION is_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id AND r.name = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_moderator(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id AND r.name IN ('admin', 'teacher', 'staff')
  );
$$;

REVOKE ALL ON FUNCTION is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_moderator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_moderator(uuid) TO authenticated;

-- user_roles: admin manage (via helper) + users may claim student role only.
DROP POLICY IF EXISTS "Admins can manage user roles" ON user_roles;
CREATE POLICY "Admins can manage user roles" ON user_roles
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can claim student role" ON user_roles;
CREATE POLICY "Users can claim student role" ON user_roles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND role_id = (SELECT id FROM roles WHERE name = 'student')
  );

-- communities private visibility: use helper for the admin branch.
DROP POLICY IF EXISTS "Private communities viewable by members" ON communities;
CREATE POLICY "Private communities viewable by members" ON communities
  FOR SELECT USING (
    is_private = TRUE AND (
      auth.uid() = owner_id
      OR is_community_member(communities.id, auth.uid())
      OR is_admin(auth.uid())
    )
  );

-- reports/moderation: route moderator checks through the helper (same shape,
-- no self-query, future-proof against the recursion class).
DROP POLICY IF EXISTS "Moderators can view all reports" ON reports;
CREATE POLICY "Moderators can view all reports" ON reports
  FOR SELECT USING (is_moderator(auth.uid()));

DROP POLICY IF EXISTS "Moderators can update reports" ON reports;
CREATE POLICY "Moderators can update reports" ON reports
  FOR UPDATE USING (is_moderator(auth.uid())) WITH CHECK (is_moderator(auth.uid()));

DROP POLICY IF EXISTS "Moderators can view moderation actions" ON moderation_actions;
CREATE POLICY "Moderators can view moderation actions" ON moderation_actions
  FOR SELECT USING (is_moderator(auth.uid()));

DROP POLICY IF EXISTS "Moderators can create moderation actions" ON moderation_actions;
CREATE POLICY "Moderators can create moderation actions" ON moderation_actions
  FOR INSERT WITH CHECK (is_moderator(auth.uid()));
