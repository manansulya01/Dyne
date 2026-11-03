# Supabase migration status

## Current state

This branch introduces the Supabase client foundation. It does **not** yet
switch application data or authentication away from MongoDB. The active app
still uses MongoDB collections and a custom `dyne_session` cookie.

Existing SQL migrations were created for an earlier schema and must be
reconciled with the active application model before being applied to Cloud.

## Environment

Set in local `.env.local` and Vercel Preview:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: optional server-only privileged key. Never
  expose it to browser code, commit it, or prefix it with `NEXT_PUBLIC_`.

Enable Row Level Security on every exposed table and write explicit policies
before enabling client-side data access.

## Required migration sequence

1. Reconcile SQL schema with active Mongo document types and indexes.
2. Additive SQL migrations with RLS policies and indexes.
3. Migrate authentication and route/session guards to Supabase Auth.
4. Migrate profiles, feed, reactions, comments, follows, communities, chat,
   events, notifications, moderation and admin APIs.
5. Move uploads to Supabase Storage with private buckets, signed access,
   MIME/size validation and authorization.
6. Add integration tests against a disposable Supabase project/local stack.
7. Verify feature tests and production build.
8. Configure Vercel Preview variables and verify before production cutover.

## Safety

Do not run historical migrations against production without reviewing the
complete schema and current Cloud migration history. Do not remove MongoDB
dependencies or data until migration and rollback checks pass. Do not promote
this branch to production until preview verification passes.
