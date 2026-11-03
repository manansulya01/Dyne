# Dyne domain mapping for the Supabase migration

The active MongoDB model is substantially richer than the original Supabase
SQL schema. This is a migration inventory, not a claim that these tables
already exist in Supabase.

| Mongo collection | Supabase target | Important migration details |
|---|---|---|
| users | auth.users + profiles | Move password ownership to Supabase Auth; preserve role, suspension, profile tags, verification metadata. Never copy password hashes into profiles. |
| sessions | Supabase Auth sessions | Replace custom hashed-token sessions and cookie handling; revoke old sessions at cutover. |
| passwordResets | Supabase Auth recovery | Replace custom reset tokens with Supabase recovery flow. |
| posts, pendingMedia | posts, post_media, storage | Preserve post_type, soft deletion, staged-upload ownership and max-four-media validation. |
| comments | comments | Preserve parent threading and soft deletion. |
| reactions | reactions | Preserve post/comment/video/reel target types and unique user-target-kind key. |
| savedPosts, savedReels | saved_posts, saved_reels | Owner-only read/write policies. |
| follows | follows | Unique follower/following pair; prevent self-follow. |
| communities, communityMembers, communityPosts, communityChannels | communities and related tables | Preserve private membership, owner/admin/moderator/member roles, rules, pins and channel ordering. |
| chatConversations, chatMembers, chatMessages | conversations, conversation_members, messages | Preserve group-only policy, membership authorization, attachment metadata, mentions and moderation verdicts. |
| events, eventAttendees | events, event_attendees | Preserve RSVP status, capacity enforcement and atomic going counts. |
| buildings, clubs | campus_buildings, clubs | Public read; admin-managed writes. |
| videos, videoViews, reels, reelViews, stories, storyViews | videos, reels, stories and view tables | Preserve orientation, moderation, hourly view de-duplication, expiry and counters. |
| notifications | notifications | Recipient-only reads, idempotent fan-out, read state and current notification types. |
| reports, moderationReviews, moderationActions, auditLogs | reports, moderation_reviews, moderation_actions, audit_logs | Strict moderator/admin policies; protect internal notes and private-message excerpts. |
| blogs, announcements | blogs, announcements | Preserve publish state, audience targeting, pinning and moderation. |
| studyMaterials, savedStudyMaterials | study_materials, saved_study_materials | Preserve approval state, class/subject scoping and private file access. |
| classAssignments, assignmentSubmissions, classExams, examAttempts | class_assignments, assignment_submissions, class_exams, exam_attempts | Preserve class targeting, grading, attempt limits and unique open-attempt constraint. |
| timetableEntries, polls, pollVotes, feedback, settings | matching relational tables | Preserve unique vote rules, audience, statuses and admin-only settings. |
| tasks, assignments, courses, exams, notes, goals, habits, habitLogs, studySessions | user-owned academic tables | All rows must be owner-scoped by RLS; notes must never enter global search. |

## Cutover rule

Do not point existing routes at Supabase until the matching schema, RLS,
indexes, server-side authorization, integration tests and rollback path exist.
The existing MongoDB backend remains authoritative until the migration is
complete and explicitly switched.
