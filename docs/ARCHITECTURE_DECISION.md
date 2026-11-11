# Dyne production architecture decision

**Status:** Adopted for the current release
**Decision:** Keep MongoDB as the single source of truth; do not block release on the unfinished Supabase migration.

## Runtime architecture

- Next.js App Router on Vercel.
- MongoDB Atlas for users, sessions, profiles, feed, reactions, comments, communities, chat, events, notifications, moderation, school features and application metadata.
- MongoDB GridFS for persistent file storage when `STORAGE_DRIVER=mongodb-gridfs` (the production default).
- Local filesystem storage only for local development and tests.
- Cloudflare R2 remains an optional storage adapter, not a required dependency.
- Supabase SQL migrations and clients are retained as migration research only; they are not the production runtime dependency.

## Why

The active application already has a coherent MongoDB domain model, authentication/session implementation, API routes, indexes and tests. The connected Vercel project has a MongoDB integration variable. The Supabase migration is incomplete: it does not yet replace active MongoDB auth and data routes, and its own offline security audit identifies unresolved student-profile and storage authorization risks.

Completing a provider migration without verifying its Cloud schema, migration ledger, data import, RLS policies and rollback would put student data and existing features at risk. The lower-risk release path is to complete the existing MongoDB architecture.

## Storage behavior

Production defaults to MongoDB GridFS so media is persistent across Vercel deployments and does not rely on ephemeral function files. The existing `/api/files` route remains the authorization boundary: private content is authorized before storage reads. Never expose GridFS directly to the browser.

For large video uploads, verify the deployed platform's request-body limits and use a direct-to-object-storage upload flow where required. Do not claim 500 MB uploads are production-ready solely because GridFS supports large files internally.

## Required production checks

- Confirm `MONGODB_URI` and `AUTH_SECRET` exist in both Preview and Production.
- Confirm the MongoDB Atlas network access policy permits the Vercel runtime and the application database user has least-privilege access.
- Run the complete CI suite and the HTTP authorization matrix.
- Exercise upload/download/delete for each bucket, including negative tests for unrelated student accounts.
- Test feed, messaging, community membership, moderation, notifications, events, and school workflows against a disposable database.
- Verify backups and restore procedure before real student data is used.
- Keep the current production deployment available for rollback until the candidate passes smoke tests.

## Rollback

Revert the storage driver selection to the previously deployed driver and redeploy. GridFS data remains in MongoDB and is not deleted by application rollback. Do not drop GridFS collections or MongoDB records as part of a rollback.

## Explicit non-goals for this release

- No production Supabase cutover.
- No destructive migration or MongoDB data deletion.
- No public access to private attachments, videos, messages or study materials.
