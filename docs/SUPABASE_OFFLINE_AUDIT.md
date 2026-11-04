# Offline Supabase migration audit

**Scope:** static review of the committed SQL migrations on
`migration/supabase-backend`. The intended Cloud project could not be
queried by the connected Supabase account, so this is not a live-database
audit and does not establish which migrations have been applied.

**Safety:** findings below are reasons to test and harden the migration on a
disposable Supabase project. Do not apply these changes to the live project
until its migration history and current schema are inspected.

## Findings

### High: private attachment buckets are readable by every signed-in user

In `20240101000008_hardening.sql`, the SELECT policies for
`message-attachments` and `watch-videos` check only
`auth.role() = 'authenticated'`. They do not verify conversation membership,
video entitlement, or object ownership. The bucket is private at the Storage
level, but any signed-in account can still read objects through the policy.

**Required fix:** make message-attachment reads verify the associated message's
conversation membership (or use a narrowly scoped server-issued signed URL
after the same check). For Watch videos, define the intended visibility model
and enforce it in the object policy or signed-URL endpoint. Test with two
unrelated student accounts.

### High: upload policies do not bind object paths to the uploader

The same migration allows any authenticated user to INSERT into
`post-media`, `community-images`, `event-images`, `message-attachments`,
and `watch-videos` without checking that the first folder segment equals
`auth.uid()`. Some DELETE policies do check the folder, so the write and
delete rules are inconsistent.

**Required fix:** standardize object keys as
`<auth.uid()>/<object-name>` and require that exact first path segment for
INSERT, UPDATE and DELETE. Add resource-level authorization before attaching
an uploaded object to a post, community, event, message, or video. Validate
MIME type and size in the server upload path as well; RLS is not a substitute
for validation.

### Medium: the migration history contains production-learned corrections

Migrations 09–12 document and fix real defects discovered by prior live E2E
runs: soft-delete RLS behavior, recursive policies, role lookup recursion,
event RSVP privacy inversion, conversation creator visibility, and staged
media ownership. This is useful history, but it means the earlier migrations
must be treated as a sequence, not as individually safe schema snapshots.

**Required fix:** run the complete ordered migration set on a clean disposable
project, then run negative authorization tests as well as happy-path tests.
Do not stop at successful DDL execution.

### Medium: the role and membership policy surface needs adversarial tests

Migration 10 introduces SECURITY DEFINER helpers to avoid recursive RLS.
Migration 11 introduces `is_admin` and `is_moderator` and permits a user to
claim the student role. Review function ownership, EXECUTE grants, search
paths, and role mutation paths against the actual deployed database. Verify
that a student cannot self-assign teacher, staff, or admin roles and that
moderators cannot promote themselves.

### Medium: the schema is not yet a complete representation of the active app

The domain mapping document lists more Mongo collections and behaviors than
the early SQL migrations represent. In particular, reactions in migration 02
allow `post`, `comment`, and `video` targets only; the active application
also has reels and stories. The migration inventory must be compared against
the current route-level data model before any cutover.

## Verification still required

- Confirm the actual Cloud project's migration ledger and schema.
- Run all migrations in order on a disposable Supabase project.
- Run Supabase Security Advisor and Performance Advisor.
- Add two-user negative tests for private messages, Watch videos, staged
  uploads, community membership, role escalation, and deleted content.
- Validate every Mongo collection and API route against a target table,
  constraint, index, RLS policy, and migration/import rule.
- Reconcile record counts and foreign-key integrity after a dry-run import.
- Verify Storage object ownership and signed URL expiry.
- Complete auth, upload, realtime, moderation, and rollback E2E tests before
  promoting the branch.

## What this audit does not do

It does not modify SQL, touch the production branch, connect to or change the
Cloud database, migrate user data, or claim the Supabase cutover is complete.
