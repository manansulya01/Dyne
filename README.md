# Dyne — Your Campus, Your Community, Your Network.

Dyne is a private campus social network for Macro Vision Academy built with
Next.js 16, React 19, TypeScript, Tailwind CSS 4, MongoDB, Zod, React Hook
Form, and Lucide icons.

Tagline (used consistently across landing, about, and settings):
**Your Campus, Your Community, Your Network.**

## Getting Started

1. Copy `.env.example` to `.env.local`. Its defaults are for local development only:
   - `MONGODB_URI=mongodb://127.0.0.1:27017/dyne_dev`
   - `MONGODB_DB=dyne_dev`
   - `AUTH_SECRET` (set a unique random value; use at least 32 characters for production)
   - `NEXT_PUBLIC_SITE_URL` (optional; defaults to the local origin)
   - `STORAGE_DRIVER=local` for development (no cloud credentials needed)
2. Install dependencies, start the local database, then the app in separate terminals:

```bash
npm ci
npm run db:dev   # local MongoDB on 127.0.0.1:27017; data stays in .dev-mongo-data/
npm run dev      # in a second terminal
```

Open [http://localhost:3000](http://localhost:3000). If port 3000 is already occupied,
start the app on another port with `npm run dev -- -p 3001`.

## First administrator (secure bootstrap)

There are no default passwords and no hardcoded admin credentials.

1. Create your own account through the normal signup flow.
2. Set a one-time `ADMIN_BOOTSTRAP_SECRET` (minimum 16 characters) in the local environment.
3. Send `POST /api/admin/bootstrap` with `{ "email": "<your-email>", "secret": "<secret>" }`.
4. The first successful call promotes that account to `super_admin` and writes an audit record. Once any administrator exists, bootstrap refuses to promote another account.
5. Unset `ADMIN_BOOTSTRAP_SECRET` immediately after use.

Never commit real environment values or share bootstrap secrets.

## Production deployment

Dyne is a Next.js App Router application. Before deploying:

1. Create a dedicated production MongoDB database and configure `MONGODB_URI` and `MONGODB_DB` in the host's secret environment settings. Never use `dyne_dev` in production.
2. Configure object storage: `STORAGE_DRIVER=r2` and the required `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PUBLIC_BASE_URL` values.

   - For the `study-materials` bucket, configure an R2 CORS rule for the exact Dyne app origins (production and any active preview origins): allow **PUT**, allow the **Content-Type** request header, expose **ETag**, and set a reasonable max age (for example 3600 seconds). Do not use a wildcard origin for authenticated school uploads.
   - Study-material downloads use short-lived signed R2 URLs, so large files bypass the app server and support byte-range requests. In production, study-material uploads also use short-lived direct browser-to-R2 PUT URLs; the app verifies object size, MIME metadata, ownership and file signatures before registering the material. Local development falls back to the local storage driver.
3. For the moderated YouTube library, create a Google Cloud API key with YouTube Data API v3 enabled and configure `YOUTUBE_API_KEY` as a server-only secret. Without it, video suggestions will show a clear configuration message; never expose this key in `NEXT_PUBLIC_*` variables.
4. Set a unique, randomly generated `AUTH_SECRET` of at least 32 characters and set `NEXT_PUBLIC_SITE_URL` to the production origin. Do not use the development fallback.
5. Deploy only after the CI checks pass. Then test signup, login, media upload, feed posting, and group chat against the intended production environment.
6. Bootstrap the first `super_admin` through the documented one-time flow and remove the bootstrap secret immediately.

## CTO demo data

Administrators can open **Admin console → CTO demo data → Load demo data** to add sample feed posts, campus announcements, Grade 10 study-material entries, and a curated video. The sample PDF is a public W3C test fixture, not a school document. Demo records are tagged with a batch identifier; **Restore / remove demo data** deletes only those tagged records. The seeder does not create fake login accounts, alter real users, or overwrite existing content. The action is admin-only and audited.

Load the sample content before a presentation, then use Restore / remove demo data afterward. Refresh the Feed, Announcements, Study Materials, and Videos pages to see the sample content.

## File-transfer performance

- Study-material uploads use short-lived browser-to-R2 PUT URLs, followed by server-side metadata, ownership, and file-signature verification. The app server does not receive the file bytes.
- Study-material downloads redirect to short-lived signed R2 URLs. Large files therefore bypass the Next.js function and can use the object store's byte-range support.
- Configure R2 CORS for the exact app origins and allow PUT plus the Content-Type header; expose ETag.
- Announcement attachments currently render as links when an attachment URL is present. Their authoring/upload experience still needs the same direct-to-R2 presign/complete flow before announcement files can be considered optimized end-to-end.
- Do not treat the architecture as proof of 3,000-user capacity. Run authenticated concurrent upload/download and announcement-feed load tests against the deployed MongoDB, Vercel, and R2 tiers before making a capacity or latency commitment.

## Verification commands

```bash
npx tsc --noEmit
npm run lint
npm test -- --run
npm run build
```

The GitHub Actions workflow runs these checks on pushes to `main` and pull requests.

## Key product rules

- **No student-to-student DMs.** Direct conversations are rejected server-side (403). Community group chats remain supported with membership enforcement.
- **Roles**: `student`, `teacher`, `staff`, `club`, `moderator`, `admin`, and `super_admin`; authorization is enforced server-side.
- **Moderation**: reports support defined reasons and review states; moderation actions must be audited, and private moderator notes must not be exposed to ordinary users.
- **Study materials** live at `/study-materials`, with upload validation and gated downloads.
- **Profile tags** use a controlled allow-list and appear on profiles and discovery surfaces.

## Security model

- Cookie sessions use `HttpOnly`, `SameSite=Lax`, and `Secure` in production; only session-token hashes are stored.
- Never trust client-supplied `userId`, `role`, permissions, or ownership. Every mutation must re-check authorization server-side.
- Rate limits currently run in process and are per replica. Multi-instance production deployments should use a shared rate-limit store and trusted proxy configuration.
- Security headers are configured in `next.config.ts`.

Keep local environment files, bootstrap scripts containing credentials, and private media out of Git.
