# Dyne — Your Campus. Your Community. Your Network.

Dyne is a private campus social network for Macro Vision Academy built with
Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase (PostgreSQL, Auth,
Storage, Realtime), Zod, React Hook Form, and Lucide icons.

## Getting Started

1. Copy `.env.example` to `.env.local` and fill in your Supabase project values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose to the browser)
   - `NEXT_PUBLIC_SITE_URL` (optional; falls back to the request origin)
2. Apply the database migrations in `supabase/migrations/` (in order) to your
   Supabase project, e.g. with the Supabase CLI (`supabase db push`) after
   linking the project.
3. Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Realtime setup (required for live chat/notifications)

Current Realtime servers stream the `supabase_realtime_messages_publication`
publication (not the legacy `supabase_realtime` one). After deploying — and
after every fresh `supabase db reset` / `supabase start` — run once against
the live database (or enable the tables in the Supabase Dashboard under
Database > Replication):

```sql
ALTER PUBLICATION supabase_realtime_messages_publication
  ADD TABLE messages, conversation_members, notifications;
```

Without this step, realtime subscriptions connect successfully but no
`postgres_changes` events are delivered. Migration
`20240101000013_realtime_publication.sql` documents the same step and applies
it automatically whenever the publication already exists.

## Production deployment

Dyne is a standard Next.js App Router application and deploys to any
Next.js-capable host (e.g. Vercel). No Docker image or extra infrastructure
is required.

1. **Create a Supabase Cloud project** at <https://supabase.com/dashboard>.
2. **Apply migrations**: link the project with the Supabase CLI and push
   `supabase/migrations/` (01–13) — never use `db reset` against Cloud:
   `supabase link` then `supabase db push`.
3. **Enable Realtime** for `messages`, `conversation_members`, and
   `notifications` (Dashboard > Database > Replication), or run the SQL in
   `20240101000013_realtime_publication.sql` against the Cloud database.
4. **Auth settings** (Dashboard > Authentication):
   - Site URL = your production origin (e.g. `https://dyne.example.com`).
   - Additional Redirect URLs must include
     `https://dyne.example.com/api/auth/callback` and
     `https://dyne.example.com/reset-password`.
5. **Storage**: buckets and policies are created by migration 08; verify them
   under Dashboard > Storage.
6. **Environment variables** on the host (never commit these):
   - `NEXT_PUBLIC_SUPABASE_URL` = Cloud project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Cloud anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` = Cloud service-role key (server-only)
   - `NEXT_PUBLIC_SITE_URL` = production origin (required in production)
7. Deploy (`vercel --prod` or connect the GitHub repo in the Vercel
   dashboard) and smoke-test signup → post → chat against Cloud.

## Scripts

```bash
npm run dev     # development server
npm run lint    # ESLint (must report 0 errors)
npm run build   # production build with type checking
```

## Security model

- Supabase Auth with cookie sessions (`@supabase/ssr`); protected routes
  redirect unauthenticated users to `/login`.
- Row Level Security on every table; server-side role checks via `user_roles`
  (roles are never trusted from client input).
- Private storage buckets by default with per-folder RLS policies.
- All user input validated with Zod on the server.

See `AGENTS.md` for the full engineering rules.
