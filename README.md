# Dyne — Your Campus, Your Community, Your Connection.

Dyne is a private campus social network for Macro Vision Academy built with
Next.js 16, React 19, TypeScript, Tailwind CSS 4, MongoDB, Zod, React Hook
Form, and Lucide icons.

Tagline (used consistently across landing, about, and settings):
**Your Campus, Your Community, Your Connection.**

## Getting Started

1. Copy `.env.example` to `.env.local` and fill in:
   - `MONGODB_URI` (dev example: `mongodb://127.0.0.1:27017/dyne_dev`)
   - `MONGODB_DB` (dedicated development database, e.g. `dyne_dev`)
   - `AUTH_SECRET` (min 32 chars in production; generate with `openssl rand -base64 48`)
   - `NEXT_PUBLIC_SITE_URL` (optional; defaults to request origin)
   - `STORAGE_DRIVER=local` for development (no credentials)
2. Install dependencies, start the local database, then the app:

```bash
npm install
npm run db:dev   # local MongoDB on 127.0.0.1:27017 (no Docker required)
npm run dev      # in a second terminal
```

Open [http://localhost:3000](http://localhost:3000) with your browser
(or `npm run dev -- -p 3001` if port 3000 is taken by another project).

## First administrator (secure bootstrap)

There are no default passwords and no hardcoded admin credentials.

1. Sign up normally, then set a one-time secret in the environment:
   `ADMIN_BOOTSTRAP_SECRET` (min 16 chars, e.g. `openssl rand -base64 32`).
2. `POST /api/admin/bootstrap` with `{ "email": "<your-email>", "secret": "<secret>" }`.
3. The first call promotes that user to `super_admin` and is written to the
   audit log. Once any admin exists, bootstrap refuses (403) — it cannot
   silently recreate admins.
4. Unset `ADMIN_BOOTSTRAP_SECRET` afterwards.

## Production deployment

Dyne is a standard Next.js App Router application and deploys to any
Next.js-capable host (e.g. Vercel).

1. **Create a MongoDB database** (e.g. MongoDB Atlas) and set `MONGODB_URI` /
   `MONGODB_DB` on the host (never commit these).
2. **Storage**: set `STORAGE_DRIVER=r2` plus `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`
   (optionally `R2_BUCKET_PREFIX`). The `local` driver is for development only.
3. **Auth**: set `AUTH_SECRET` (min 32 chars) and `NEXT_PUBLIC_SITE_URL` to the
   production origin.
4. Deploy and smoke-test signup → post → community chat against production.
5. Bootstrap the first `super_admin` as above, then unset the secret.

## Scripts

```bash
npm run dev     # development server
npm run db:dev  # local development MongoDB (persistent, no Docker)
npm run lint    # ESLint (must report 0 errors)
npm run build   # production build with type checking
npm test        # Vitest suite (must be all green)
```

## Key product rules

- **No student-to-student DMs.** Direct conversations are rejected server-side
  (403). Community **group chats** remain fully supported (send/edit/delete,
  reactions, mentions, attachments, unread state) with membership enforcement.
- **Roles**: `student`, `teacher`, `staff`, `club`, `moderator`, `admin`,
  `super_admin` with granular server-side permission checks. Only
  `super_admin` can grant `admin`/`super_admin` or touch another super-admin.
- **Moderation**: report reasons (spam, harassment, bullying, hate,
  sexual_content, violence, self_harm, impersonation, privacy, copyright,
  misinformation, other); statuses
  `OPEN`/`UNDER_REVIEW`/`ACTION_TAKEN`/`DISMISSED`/`ESCALATED` (legacy
  lowercase values still accepted on read); every action writes an immutable
  audit record; moderator notes are never exposed to ordinary users.
- **Study materials** live at `/study-materials` with safe uploads (MIME +
  extension validation, 50MB limit, no executables, traversal-proof keys,
  gated downloads).
- **Profile tags** are a controlled allow-list (TECH, SPORTS, MUSIC, ART,
  GAMING, SCIENCE, MATHEMATICS, LEADERSHIP, PHOTOGRAPHY, CODING, …) shown on
  profiles, discovery, and community member lists.

## Security model

- Cookie sessions (`HttpOnly`, `SameSite=Lax`, `Secure` in production);
  only token hashes stored; suspended/banned users lose access immediately.
- Never trust client-supplied `userId`, `role`, permissions, or ownership —
  every mutation re-checks authorization server-side.
- Rate limits on login, signup, password reset, feedback, reports, search,
  group-space creation, and uploads. Presets live in one place
  (`src/lib/security/rateLimit.ts`); all routes return a friendly `429`.
- **Rate limiting is in-process and single-instance.** Buckets live in module
  memory, so they reset on deploy and are per replica. Before running more
  than one instance (or behind multiple proxies), move `rateLimit()` to a
  shared store (Redis) and take the client IP from a trusted proxy header
  rather than the client-supplied `x-forwarded-for`. This is a deliberate,
  documented limitation, not distributed protection.
- Security headers (nosniff, DENY framing, CSP, referrer policy) in
  `next.config.ts`.

See `AGENTS.md` for the full engineering rules.
