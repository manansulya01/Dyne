<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dyne — Engineering Rules

## Project Overview

Dyne is a private campus social network for Macro Vision Academy. Core concept: **"Your Campus. Your Community. Your Network."**

Stack:
- Next.js 16 (App Router)
- React 19
- TypeScript 5 (strict)
- Tailwind CSS 4
- Supabase (PostgreSQL, Auth, Storage, Realtime)
- Zod (validation)
- React Hook Form (forms)
- Lucide React (icons)
- date-fns (dates)

---

## Architecture Rules

### Separation of Concerns

```
src/
├── app/                    # Next.js App Router pages & layouts
│   ├── (auth)/            # Auth group (login, register, etc.)
│   ├── (dashboard)/       # Authenticated app routes
│   │   ├── feed/          # Social feed
│   │   ├── communities/   # Communities
│   │   ├── chat/          # Messaging
│   │   ├── events/        # Events
│   │   ├── campus/        # Campus info
│   │   ├── watch/         # Dyne Watch (videos)
│   │   ├── search/        # Search
│   │   ├── notifications/ # Notifications
│   │   ├── profile/       # User profiles
│   │   └── settings/      # User settings
│   ├── (admin)/           # Admin-only routes
│   └── api/               # API routes
├── components/
│   ├── ui/                # Reusable UI primitives (Button, Input, Card, etc.)
│   ├── forms/             # Form components with RHF + Zod
│   ├── feed/              # Feed-specific components
│   ├── communities/       # Community components
│   ├── chat/              # Chat components
│   ├── events/            # Event components
│   ├── campus/            # Campus components
│   ├── watch/             # Video components
│   ├── layout/            # Layout components (Navbar, Sidebar, etc.)
│   └── shared/            # Shared cross-domain components
├── lib/
│   ├── supabase/          # Supabase clients (server, browser, middleware)
│   ├── auth/              # Auth utilities
│   ├── db/                # Database queries (server-only)
│   ├── validation/        # Zod schemas
│   ├── permissions/       # Authorization logic
│   ├── utils/             # General utilities
│   └── constants/         # App constants
├── hooks/                 # Custom React hooks
├── types/                 # TypeScript types
└── middleware.ts          # Next.js middleware
```

### Key Principles

1. **Server-first**: Prefer Server Components, Server Actions, and Route Handlers over client-side fetching
2. **Database-level authorization**: Use Supabase RLS policies as the source of truth for permissions
3. **Type safety**: Strict TypeScript; share types between server and client via `types/`
4. **Validation**: Validate all user input with Zod schemas in `lib/validation/`
5. **No fake functionality**: Every feature must have real backend implementation
6. **Domain-oriented**: Organize code by feature/domain, not by technical layer

---

## Coding Conventions

### TypeScript

- Use `strict: true` (already configured)
- Prefer `interface` for object shapes, `type` for unions/utility types
- Export types from `src/types/` for cross-boundary sharing
- Use Zod schemas as source of truth; infer types with `z.infer<typeof schema>`
- Avoid `any`; use `unknown` when type is genuinely unknown

### React/Next.js

- Default to Server Components; add `"use client"` only when necessary
- Use Server Actions for mutations (forms, likes, follows, etc.)
- Use `next/navigation` for programmatic navigation
- Keep client components small and focused
- Use React 19 features (Actions, `useOptimistic`, `useFormStatus`) where appropriate

### Styling (Tailwind CSS 4)

- Use CSS variables for theming (see `globals.css`)
- Prefer utility classes over custom CSS
- Use `clsx` + `tailwind-merge` for conditional classes
- Design mobile-first; use responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`)
- Support dark mode via `dark:` prefix

### File Naming

- Components: PascalCase (`UserCard.tsx`)
- Hooks: camelCase with `use` prefix (`useAuth.ts`)
- Utilities: camelCase (`formatDate.ts`)
- Types: PascalCase (`UserProfile.ts`)
- Zod schemas: camelCase with `Schema` suffix (`postSchema.ts`)
- Server Actions: camelCase with `Action` suffix (`createPostAction.ts`)

---

## Security Requirements

### Authentication & Authorization

- **Never** expose service-role key to browser
- **Never** commit secrets to Git
- Use `@supabase/ssr` for cookie-based auth in Next.js
- Create Supabase clients:
  - `lib/supabase/server.ts` — Server Components/Actions (uses cookies)
  - `lib/supabase/browser.ts` — Client Components (uses cookies)
  - `lib/supabase/middleware.ts` — Middleware (refreshes session)
  - `lib/supabase/admin.ts` — Server-only admin operations (service role)
- All database mutations must go through Server Actions or Route Handlers
- Validate authorization in database (RLS) AND in Server Actions

### Row Level Security (RLS)

- Enable RLS on **every** table
- Policies must cover: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- Use `auth.uid()` for user identity
- Use helper functions for role checks (e.g., `is_admin()`, `is_moderator()`)
- Test policies with different user roles

### Input Validation

- Validate all external input with Zod
- Define schemas in `lib/validation/`
- Use schemas in Server Actions and API routes
- Sanitize file uploads (type, size, name)

### Environment Variables

- `.env.local` for local development (gitignored)
- `.env.example` documents required variables (committed)
- Required variables:
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=     # Server-only
  ```
- Access via `process.env` only in server code
- Use `NEXT_PUBLIC_` prefix only for values needed in browser

---

## Database Rules

### Schema Design

- Use UUID primary keys (`uuid_generate_v4()`)
- Add `created_at` / `updated_at` timestamps on all tables
- Use foreign keys with appropriate `ON DELETE` behavior
- Add indexes for common query patterns
- Use `text` for variable-length strings; `varchar(n)` only when length is constrained
- Use `timestamptz` for timestamps

### Migrations

- Create migrations via Supabase CLI: `supabase migration new <name>`
- Apply locally: `supabase db reset`
- Commit migration files to Git
- Never edit applied migrations; create new ones for changes

### Key Tables (Dependency Order)

1. `profiles` — extends `auth.users`
2. `roles` — user roles (student, teacher, staff, club, admin)
3. `user_roles` — many-to-many user ↔ role
4. `posts` — feed posts
5. `post_media` — images/videos for posts
6. `comments` — post comments
7. `reactions` — likes/reactions
8. `follows` — user follows
9. `saved_posts` — bookmarked posts
10. `communities` — communities/groups
11. `community_members` — community membership
12. `community_moderators` — community moderators
13. `community_posts` — posts within communities
14. `messages` — direct/group messages
15. `conversations` — conversation metadata
16. `conversation_members` — conversation participants
17. `message_attachments` — file attachments
18. `events` — events
19. `event_attendees` — RSVPs
20. `campus_buildings` — buildings
21. `clubs` — clubs/organizations
22. `videos` — Dyne Watch videos
23. `video_views` — view tracking
24. `notifications` — user notifications
25. `reports` — content/user reports
26. `moderation_actions` — moderation log

### Relationships

- `profiles.id` references `auth.users.id` (PK, FK)
- `user_roles` links `profiles` ↔ `roles`
- `posts.author_id` → `profiles.id`
- `comments.post_id` → `posts.id`, `comments.author_id` → `profiles.id`
- `reactions` polymorphic: `target_type` (post|comment|video), `target_id`
- `follows` self-referential: `follower_id` → `profiles.id`, `following_id` → `profiles.id`
- `community_members` links `profiles` ↔ `communities`
- `messages.conversation_id` → `conversations.id`
- `events.organizer_id` → `profiles.id`, `events.location_id` → `campus_buildings.id`

---

## Supabase Rules

### Client Creation

```typescript
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll, setAll } }
  );
}
```

### Realtime

- Enable Realtime on tables needing live updates: `messages`, `notifications`, `reactions`
- Subscribe in Client Components only
- Clean up subscriptions in `useEffect` return

### Storage

- Buckets: `avatars`, `post-media`, `community-images`, `event-images`, `message-attachments`, `video-thumbnails`, `watch-videos`
- Private buckets by default; public access via signed URLs or public policies for specific folders
- RLS policies on `storage.objects` for access control

---

## User Roles & Permissions

### Roles

| Role | Description |
|------|-------------|
| `student` | Default role for students |
| `teacher` | Faculty members |
| `staff` | Non-teaching staff |
| `club` | Club/organization accounts |
| `admin` | Platform administrators |

### Permission Model

- Centralized in `lib/permissions/`
- Functions: `canCreatePost(user, context)`, `canModerateCommunity(user, communityId)`, etc.
- Check permissions in Server Actions before mutations
- RLS policies enforce at database level
- UI hides unauthorized actions but **never** relies on UI alone

---

## Testing Requirements

### Commands

```bash
npm run lint        # ESLint
npm run build       # Production build (includes type check)
```

### Test Strategy

- Unit tests for: validation schemas, permission functions, utilities
- Integration tests for: Server Actions, API routes, database queries
- E2E tests for: auth flows, critical user journeys
- Run tests before committing

### What to Test

- Authentication flows
- Authorization/permission checks
- Database operations (CRUD + RLS)
- Validation schemas
- Social interactions (follow, like, comment)
- Messaging
- Events
- Moderation actions

---

## Accessibility Requirements

- Semantic HTML (`<main>`, `<nav>`, `<article>`, `<section>`, headings)
- All interactive elements: focus-visible styles, keyboard accessible
- Labels on all form inputs
- Sufficient color contrast (WCAG AA)
- ARIA only when native HTML insufficient
- Screen reader friendly: alt text, aria-labels, live regions for dynamic content

---

## Responsive Requirements

- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Touch targets: min 44×44px
- iPad portrait/landscape
- Desktop (Windows/macOS)
- Mobile browsers

---

## Git/Commit Rules

- Commit after each logical milestone
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Never commit: `.env*`, `node_modules/`, `.next/`, `*.log`, build artifacts
- Keep history clean; no force-push without approval

---

## Development Milestones

1. **Foundation** — Config, Supabase clients, middleware, types, UI primitives
2. **Auth + Profiles + Roles** — Sign up, login, profile creation, role assignment
3. **Database Foundation** — Migrations for core tables, RLS policies
4. **Posts + Feed + Reactions + Comments** — Feed, create post, like, comment
5. **Communities** — CRUD, membership, moderation, community posts
6. **Campus + Buildings + Clubs** — Campus map data, buildings, clubs
7. **Events** — Create, RSVP, discovery
8. **Chat + Realtime** — Conversations, messages, realtime
9. **Dyne Watch** — Video upload, playback, discovery
10. **Search** — Unified search across entities
11. **Notifications** — In-app notifications, realtime
12. **Moderation + Admin** — Reports, queues, admin dashboard
13. **Testing + Security Audit** — Test coverage, penetration testing
14. **Final UI/UX** — Polish, animations, campus branding

---

## No-Fake-Functionality Rule

**Never**:
- Use hardcoded mock data instead of database queries
- Fake authentication (bypass Supabase Auth)
- Fake chat with local state
- Fake likes/comments/counters
- Fake search that filters client-side only
- Placeholder Server Actions that return static data

**Always**:
- Implement real database queries
- Use real Supabase Auth
- Persist all data to PostgreSQL
- Use Realtime for live features
- Validate with Zod
- Enforce permissions via RLS

---

## Environment Setup Checklist

- [ ] `.env.example` created with all required variables
- [ ] Supabase project created
- [ ] Supabase CLI installed locally
- [ ] Database migrations created for Milestone 1
- [ ] Storage buckets configured
- [ ] Realtime enabled on relevant tables
- [ ] RLS policies applied
- [ ] Auth providers configured (email/password minimum)
- [ ] `.env.local` populated (not committed)

---

## Quick Reference: Common Commands

```bash
# Development
npm run dev

# Linting
npm run lint

# Type checking + build
npm run build

# Supabase
supabase start           # Local dev (if using Docker)
supabase db reset        # Apply migrations locally
supabase migration new   # Create migration
supabase gen types       # Generate TypeScript types

# Git
git add -A
git commit -m "feat: description"
git push
```