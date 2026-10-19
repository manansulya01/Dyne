# Dyne campus files, media and moderation deployment

This repository already has a browser-based file/storage layer; do not expose a raw FTP daemon from the Next.js/Vercel app. FTP credentials and an internet-facing FTP service are a poor fit for a serverless deployment. Use the authenticated Dyne file portal and private object storage instead.

## Existing product surfaces

- **Study materials:** `/study-materials` and `/api/study-materials`. Uploads are permission-gated to staff roles with study-upload permissions, metadata is stored in MongoDB, and pending/rejected materials are not included in the normal approved library.
- **Videos:** `/watch`, `/api/videos`, and private `watch-videos` object storage.
- **Short-form videos/reels:** `/reels`, `/api/reels`, and private `reel-videos` object storage.
- **File delivery:** `/api/files/[bucket]/[...key]`; private buckets require authenticated delivery.
- **Moderation:** `/admin/moderation` and `/api/moderation/queue` support a unified review queue for posts, messages, videos, reels, stories, blogs and announcements. Message queue entries should expose only short excerpts, not full private conversations.
- **Chat:** `/chat` and `/api/chat`; message moderation should be enforced server-side when messages are created, not only by hiding content in the client.

## Production object storage (Cloudflare R2)

Set these variables in the deployment provider's encrypted environment settings (Production and Preview only where appropriate). Never commit real credentials:

- `STORAGE_DRIVER=r2`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL` (only needed for public buckets such as thumbnails/avatars; use a configured R2 custom domain or public bucket URL)
- `R2_BUCKET_PREFIX` (optional; use only if every configured bucket has that prefix)

Create private buckets matching the configured names (with the optional prefix applied): `message-attachments`, `watch-videos`, `reel-videos`, `story-media`, and `study-materials`. Public buckets are `avatars`, `post-media`, `community-images`, `event-images`, and `video-thumbnails`. Keep study materials and private video/attachment buckets private; deliver them through the app's authenticated file route. Apply least-privilege R2 credentials scoped to the required buckets.

The application now fails closed in production if the storage driver is not set to R2, instead of silently writing user files to ephemeral serverless disk. Local filesystem storage remains intended for local development and tests.

## Rollout checklist

1. Configure the R2 buckets and encrypted deployment environment variables.
2. Redeploy and verify `/api/health/db` plus an authenticated upload/download round-trip for a harmless PDF.
3. Verify a student cannot upload study material, while an authorized teacher/admin can.
4. Verify a private study-material URL returns no bytes to an anonymous request and works for an authorized session.
5. Upload a test video and reel; confirm they remain pending until the configured moderation pipeline approves them.
6. Send a benign test message and a policy-violating test message in a private test conversation; confirm the server moderation verdict is recorded and flagged content is held/handled according to the policy.
7. Test approve/reject/dismiss from `/admin/moderation` with an authorized moderator account and confirm the audit record.
8. Verify oversized and disallowed file types are rejected, and remove all test uploads after validation.

## Important verification boundary

Adding the R2 configuration does not provision cloud buckets or create credentials automatically. A project owner must configure those values in the cloud dashboard. Do not declare production uploads or moderation fully verified until the checklist has been run against the deployed app.
