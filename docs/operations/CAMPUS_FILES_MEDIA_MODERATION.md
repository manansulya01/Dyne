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

Create private buckets matching the configured names (with the optional prefix applied): `message-attachments`, `announcement-attachments`, `watch-videos`, `reel-videos`, `story-media`, and `study-materials`. Public buckets are `avatars`, `post-media`, `community-images`, `event-images`, and `video-thumbnails`. Keep study materials, announcement attachments, message attachments and private video buckets private; deliver them through the app's authenticated file route. Announcement attachment reads are checked against the announcement's audience and active time window, and responses are not stored in browser caches. Apply least-privilege R2 credentials scoped to the required buckets.

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


## Student YouTube suggestions

Dyne Watch now has a school-curated YouTube library at `/videos/youtube`.

- Students submit a YouTube watch/share URL; the server extracts only a valid 11-character video ID.
- The server validates the video with the YouTube Data API before saving it. Private, unavailable, or non-embeddable videos are refused.
- Every student suggestion starts as `pending`; it is not visible in the student library.
- Teachers and administrators review the queue and approve it for explicit grade(s), or use `*` for the whole school. Rejections require a reason.
- Students see their own submission status; the general library returns only approved videos allowed for the student's enrolled grade.
- Playback uses YouTube's privacy-enhanced `youtube-nocookie.com` embed. Dyne does not download, proxy, or re-host YouTube videos.

Set `YOUTUBE_API_KEY` as a server-side encrypted environment variable in Vercel Preview and Production. Restrict the key to the YouTube Data API v3 and appropriate application restrictions. Never expose it as a `NEXT_PUBLIC_*` variable.

## Study-material delivery and concurrency

Study-material binaries live in private R2 object storage; MongoDB stores only searchable metadata and opaque object keys. The app must not expose an FTP daemon or storage credentials.

- The student library uses indexed status/grade/time filters and a MongoDB text index for title, description, subject and tags.
- Student listing and download authorization are scoped to the grade stored on the authenticated MongoDB user record; client-supplied grade filters cannot broaden access.
- In production, the download endpoint returns a short-lived (5-minute) signed R2 URL. The browser downloads directly from R2, so large files do not pass through a Vercel function, consume its memory, or hold its MongoDB connection while bytes transfer. The signed URL supports normal object-store HTTP range behavior.
- MongoDB clients are cached per warm app instance. A request no longer performs an extra `ping` round trip before its actual query. `MONGODB_MAX_POOL_SIZE` controls the per-instance pool (default 20, clamped to 5–50); tune it against the actual Atlas tier and Vercel instance count, not just the number of students.
- Use small metadata pages (20–30 items), lazy-load previews, and fetch file bytes only when a student opens or downloads a resource.

**Capacity boundary:** These changes reduce avoidable database round trips and keep file transfer off the app server, but they do not prove a 3,000-user capacity target. Before school-wide launch, run a realistic load test against the deployed Vercel + Atlas + R2 stack (including simultaneous sign-ins, library searches and file downloads), inspect Atlas connection/CPU/IOPS and Vercel function concurrency, and tune pool size and CDN behavior to the observed results. A file's download time still depends on its size and the student's network.


## Announcement attachment privacy

Announcement uploads use the dedicated private `announcement-attachments` bucket. The completion endpoint returns an app URL, not a public R2 URL. On each read, the server checks the authenticated viewer against the same audience and start/end-time filter used by the announcement listing. Do not make this bucket public or add it to `publicBuckets`.

## Load testing

A read-only k6 scenario is available at `tests/load/dyne.js`. Follow `tests/load/README.md` and run it only against staging with synthetic accounts. The default profile reaches 100 virtual users; the opt-in profile ramps to 3,300. A completed run is required before claiming that the 3,300-account capacity target is met. The scenario does not cover writes, realtime fan-out or large concurrent downloads, which require separate controlled tests.
