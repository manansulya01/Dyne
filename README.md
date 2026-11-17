# Dyne — Your Campus, Your Community, Your Network.

Dyne is a private campus social network for Macro Vision Academy built with
Next.js 16, React 19, TypeScript, Tailwind CSS 4, MongoDB, Zod, React Hook
Form, and Lucide icons.

Tagline (used consistently across landing, about, and settings):
**Your Campus, Your Community, Your Network.**

## Getting Started (fresh device)

Follow this section when setting Dyne up on a new Mac, Windows PC, or Linux
machine. A local MongoDB server does **not** need to be installed separately:
the `db:dev` script starts the project's bundled development MongoDB binary.

### 1. Install the prerequisites

- **Git** — install from [git-scm.com](https://git-scm.com/downloads).
- **Node.js 24 LTS** — install the current Node.js 24 release from
  [nodejs.org](https://nodejs.org/). npm is included with Node.
- **A terminal** — Terminal on macOS/Linux, PowerShell or Windows Terminal on
  Windows.
- Internet access for the first dependency install and the first MongoDB binary
  download.

Check the tools are available:

```bash
git --version
node --version
npm --version
```

The Node version should report `v24.x`. If a terminal was open during Node
installation, close it and open a new one before checking again.

### 2. Clone the repository

```bash
git clone https://github.com/manansulya01/Dyne.git
cd Dyne
```

If you are setting up the active feature branch rather than the default branch,
run:

```bash
git switch feature/youtube-curation-fast-material-library
```

### 3. Install packages and create your local environment

```bash
npm ci
```

Copy the example environment file to your private local config.

**macOS / Linux:**

```bash
cp .env.example .env.local
```

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env.local
```

The example file is already configured for local development:
- `MONGODB_URI=mongodb://127.0.0.1:27017/dyne_dev`
- `MONGODB_DB=dyne_dev`
- `STORAGE_DRIVER=local` (local uploads; no R2 credentials needed)
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`

Before using the app beyond a local throwaway demo, replace the example
`AUTH_SECRET` with a unique random secret of at least 32 characters. Generate
one with `openssl rand -base64 48` if OpenSSL is installed, or use a trusted
password manager's random generator. Keep `.env.local` private; it is
gitignored and must never be committed.

### 4. Start the local database

Open **Terminal 1** in the Dyne repository and run:

```bash
npm run db:dev
```

Wait for the `MongoDB ready` message. Keep this terminal running. The database
files are stored in `.dev-mongo-data/` and survive restarts. On first run,
the MongoDB binary may be downloaded by the package; allow it to finish.

### 5. Start Dyne

Open **Terminal 2**, also in the Dyne repository:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. If port
3000 is occupied, run `npm run dev -- -p 3001` and open
[http://localhost:3001](http://localhost:3001).

To stop the app, press Ctrl+C in Terminal 2. To stop the database, press Ctrl+C
in Terminal 1. Your local database data remains on disk.

### 6. Verify the setup (optional but recommended)

In a third terminal:

```bash
npx tsc --noEmit
npm run lint
npm test -- --run
npm run build
```

These commands check types, lint rules, tests, and the production build. The
first test run may take longer while the local test MongoDB binary is downloaded.

### Quick restart after the first setup

You do not need to clone or reinstall packages again. From the Dyne folder,
start the two terminals again:

```bash
# Terminal 1
npm run db:dev

# Terminal 2
npm run dev
```

### Troubleshooting a new machine

- **`node` or `npm` not found:** install Node.js 24, then open a new terminal.
- **`npm ci` fails:** confirm you are in the cloned `Dyne` directory and
  that Git/Node can access the internet; retry with `npm ci`.
- **MongoDB binary download fails:** check network/proxy restrictions and retry
  `npm run db:dev`. The script uses the bundled
  `mongodb-memory-server` binary cache; no Docker daemon is required.
- **Port 27017 is busy:** stop the other MongoDB process, or choose another port
  by setting `DYNE_DEV_DB_PORT` in the environment and matching the port in
  `MONGODB_URI` in `.env.local`.
- **Port 3000 is busy:** use `npm run dev -- -p 3001`.
- **App cannot connect to MongoDB:** make sure Terminal 1 still shows MongoDB
  ready, and check that `MONGODB_URI` and `MONGODB_DB` in `.env.local`
  match the local database settings above.
- **Local uploads are not working:** confirm `STORAGE_DRIVER=local` and that
  the app process can write to the project directory.

Local development uses isolated local data and local file storage. It does not
connect to the live school database or production object storage unless you
deliberately replace the local environment settings.

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

   - For the `study-materials` and `post-media` buckets, configure an R2 CORS rule for the exact Dyne app origins (production and any active preview origins): allow **PUT**, allow the **Content-Type** request header, expose **ETag**, and set a reasonable max age (for example 3600 seconds). Do not use a wildcard origin for authenticated school uploads.
   - Study-material downloads use short-lived signed R2 URLs, so large files bypass the app server and support byte-range requests. In production, study-material uploads also use short-lived direct browser-to-R2 PUT URLs; the app verifies object size, MIME metadata, ownership and file signatures before registering the material. Local development falls back to the local storage driver.
3. For the moderated YouTube library, create a Google Cloud API key with YouTube Data API v3 enabled and configure `YOUTUBE_API_KEY` as a server-only secret. Without it, video suggestions will show a clear configuration message; never expose this key in `NEXT_PUBLIC_*` variables.
4. Set a unique, randomly generated `AUTH_SECRET` of at least 32 characters and set `NEXT_PUBLIC_SITE_URL` to the production origin. Do not use the development fallback.
5. Deploy only after the CI checks pass. Then test signup, login, media upload, feed posting, and group chat against the intended production environment.
6. Bootstrap the first `super_admin` through the documented one-time flow and remove the bootstrap secret immediately.

## CTO demo data

Administrators can open **Admin console → CTO demo data → Load demo data** to add sample feed posts, campus announcements, Grade 10 study-material entries, and a curated video. The sample PDF is a public W3C test fixture, not a school document. Demo records are tagged with a batch identifier; **Restore / remove demo data** deletes only those tagged records. The seeder does not create fake login accounts, alter real users, or overwrite existing content. The action is admin-only and audited.

Load the sample content before a presentation, then use Restore / remove demo data afterward. Refresh the Feed, Announcements, Study Materials, and Videos pages to see the sample content.

## Instant study-material library opening

The dashboard prefetches the first page of the signed-in user's study-material library in the background and warms a short-lived `sessionStorage` cache. The cache is scoped to the authenticated account (important on shared campus iPads), contains metadata and same-origin gated download paths rather than raw file bytes or public storage keys, and expires after 45 seconds. On repeat visits the page paints cached materials immediately and refreshes them in the background; search/filter changes are debounced and pagination remains cursor-based. This improves perceived opening time but does not promise zero latency or replace load testing.

## File-transfer performance

- Study-material and announcement-attachment uploads use short-lived browser-to-R2 PUT URLs, followed by server-side metadata, ownership, and file-signature verification. The app server does not receive the file bytes.
- Study-material downloads redirect to short-lived signed R2 URLs. Large files therefore bypass the Next.js function and can use the object store's byte-range support.
- Configure R2 CORS for the exact app origins and allow PUT plus the Content-Type header; expose ETag.
- Announcement attachments use the same direct browser-to-R2 pattern (with a local-storage fallback): short-lived upload URL, owner-scoped key, server-side size/MIME/signature verification, then the announcement stores the resulting media URL.
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
