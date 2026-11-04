# Supabase migration status

## Current state

This branch introduces a Supabase client foundation. It does **not** yet
switch application data or authentication away from MongoDB. The active app
still uses MongoDB collections and a custom `dyne_session` cookie.

Existing SQL migrations were created for an earlier schema and must be
reconciled with the active application model before being applied to Cloud.
The target Cloud project is the Dyne project
(`pnldqzokdvlgdtyvjcwd`, Tokyo). Its live migration history has not been
verified from this workspace.

## Verified engineering status

- Supabase browser and request-scoped server clients exist.
- The privileged admin client is isolated in a `server-only` module.
- A readiness endpoint checks whether the configured public client can query
  the expected `profiles` table without returning rows, credentials, or raw
  provider errors.
- CI passed on the migration branch at commit
  `45ff5016efed3a08104818dfdf75b092125abe3e`: type-check, lint, tests and
  production build.
- The committed `package-lock.json` root dependency list does not yet include
  the two Supabase packages declared in `package.json`. CI currently runs
  `npm install`; regenerate and commit the lockfile before switching CI or
  deployment installs to `npm ci`.

## Environment

Set in local `.env.local` and Vercel Preview:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: optional server-only privileged key. Never
  expose it to browser code, commit it, or prefix it with `NEXT_PUBLIC_`.

Enable Row Level Security on every exposed table and write explicit policies
before enabling client-side data access.

## Required migration sequence

1. Connect to the intended Supabase Cloud project and inspect its actual
   migration history, tables, extensions, functions, triggers and policies.
2. Reconcile SQL schema with active Mongo document types and indexes.
3. Add additive SQL migrations with RLS policies and indexes; test them on a
   disposable/local Supabase database first.
4. Migrate authentication and route/session guards to Supabase Auth.
5. Migrate profiles, feed, reactions, comments, follows, communities, chat,
   events, notifications, moderation and admin APIs.
6. Move uploads to Supabase Storage with private buckets, signed access,
   MIME/size validation and authorization.
7. Migrate and reconcile existing Mongo data, with counts and integrity checks.
8. Add integration tests against Supabase and verify every feature.
9. Configure Vercel Preview variables and verify the preview before production
   cutover.
10. Document rollback and explicitly approve the cutover before switching the
    stable branch or production.

## Current blockers

- No live Supabase database/MCP connection is available to this coding
  workspace, so the Cloud schema and migration history cannot be inspected.
- The historical SQL does not fully represent the active Mongo model.
- Existing login, signup, session and feature APIs still use MongoDB.
- Preview Supabase environment variables and Auth redirect configuration have
  not been verified.
- No full data migration, Supabase-backed end-to-end run, or rollback drill
  has been completed.

## Safety

Do not run historical migrations against production without reviewing the
complete schema and current Cloud migration history. Do not remove MongoDB
dependencies or data until migration and rollback checks pass. Do not promote
this branch to production until preview verification passes.
