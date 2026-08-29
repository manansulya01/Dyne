# Phase 5: Architecture & Systems Audit

**Project**: Dyne — Student Life OS  
**Audit Date**: August 2026  
**Auditor**: Lead Software Architect & Senior Full-Stack Engineer  
**Branch**: `main` / `rebuild/dyne-foundation` (`d4645df`)

---

## 1. System Architecture: As Claimed vs As Built

### Claimed Architecture (from `ARCHITECTURE.md` & `README.md`)
```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 13 Client                        │
│   Pages: Auth, Dashboard, Communities, Channels, Threads   │
│   State: Zustand + React Query + Clerk Auth + LiveKit UI    │
└─────────────────────────────────────────────────────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
       ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │ Express REST │ │  Socket.io   │ │    Clerk     │
       │ API (Routes) │ │ (Realtime)   │ │    (Auth)    │
       └──────────────┘ └──────────────┘ └──────────────┘
               │               │               │
       ┌───────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
       ▼              ▼ ▼             ▼ ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Prisma ORM  │ │ Redis Cache  │ │ AWS S3 / UT  │ │ LiveKit SFU  │
│  PostgreSQL  │ │   Pub/Sub    │ │ File Storage │ │ Voice/Video  │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Actual As-Built Architecture (Discovered via Inspection)
```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js 13 Client                      │
│   - Pages: index.tsx only (Redirects to 404 routes)         │
│   - Duplicate entrypoints: src/_app.tsx vs src/pages/_app   │
│   - Broken UI Components: Missing button.tsx, avatar.tsx    │
│   - Data Client: Axios instance sending unauthenticated req │
└─────────────────────────────────────────────────────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼ (Unauthenticated REST)        ▼ (Unverified Socket)
       ┌──────────────┐                ┌──────────────┐
       │ Express API  │                │  Socket.io   │
       │ (CJS/ESM mix)│                │  (In-Memory) │
       └──────────────┘                └──────────────┘
               │                               │
       ┌───────┴───────────────────────────────┴──────┐
       │ - Fake Auth Middleware (reads raw x-user-id)  │
       │ - Controllers mismatching Prisma Schema       │
       │ - Global io.emit leakage across all channels │
       │ - Zero Redis, Zero S3, Zero LiveKit backend  │
       └──────────────────────────────────────────────┘
                               │
                               ▼
               ┌──────────────────────────────┐
               │    Prisma Schema (v5.2.0)    │
               │  - Never migrated / tested   │
               │  - Dual Discord/Dyne models  │
               │  - Broken DM constraints     │
               └──────────────────────────────┘
```

---

## 2. Frontend Architecture Assessment (`apps/web`)

### 2.1 Framework & Routing
- **Framework**: Next.js `13.4.12` running React `18.2.0`.
- **Router Mode**: Pages Router (`appDir: false` in `next.config.js`).
- **Actual Pages**:
  - `src/pages/index.tsx`: Splash redirector that pushes to `/auth/sign-in` or `/dashboard`.
  - `src/pages/api/health.ts`: Static health check JSON endpoint.
  - `src/pages/_app.tsx`: Pages router wrapper.
  - **Critical Gap**: `/auth/sign-in`, `/auth/sign-up`, `/dashboard`, `/communities`, `/messages`, `/calendar`, `/courses`, and `/tasks` do not exist. Any user interaction leads immediately to a Next.js 404.

### 2.2 Entrypoint Conflict
- `src/_app.tsx` exists at the root of `src/` (wrapping `ThemeProvider` and `Toaster`).
- `src/pages/_app.tsx` exists in `src/pages/` (wrapping `ClerkProvider`, `QueryClientProvider`, and `SocketProvider`).
- **Diagnosis**: Duplicate configuration with divergent providers. `src/_app.tsx` is an orphaned leftover.

### 2.3 State Management & Data Fetching
- **Zustand**: `src/hooks/useModal.ts` implements a modal manager with 17 modal types (`createCommunity`, `joinCommunity`, `createChannel`, `incomingCall`, `createEvent`, etc.), but **zero modal UI components exist**.
- **React Query**: `src/pages/_app.tsx` initializes `QueryClient` with `gcTime` (a React Query v5 property), but package dependency is `@tanstack/react-query: ^4.35.3` (where the option is `cacheTime`).
- **Axios**: `src/utils/api.ts` creates an Axios client but does not inject authentication credentials or headers into requests.

### 2.4 Component Architecture & Broken Imports
- The design system claims to use `shadcn/ui` with Radix UI.
- Only 2 component files exist in `src/components/ui/`: `MessageInput.tsx` and `UserAvatar.tsx`.
- Critical primitives are missing:
  - `ChatWindow.tsx`, `CommunitySidebar.tsx`, `DiscussionThread.tsx`, and `MessageInput.tsx` all import `Button` from `./button` or `../ui/button`. **`button.tsx` does not exist.**
  - `UserAvatar.tsx` imports `Avatar, AvatarImage, AvatarFallback` from `@/components/ui/avatar`. **`avatar.tsx` does not exist.**
- **Diagnosis**: The frontend cannot build (`next build` fails immediately on unresolved imports).

---

## 3. Backend Architecture Assessment (`apps/api`)

### 3.1 Framework & Module System
- **Framework**: Express `4.18.2` on Node.js `20.x` with TypeScript `5.2.2`.
- **Module Resolution Conflict**: `tsconfig.json` specifies `"module": "commonjs"`, while `package.json` script runs `node --loader ts-node/esm src/index.ts`. Inside `src/index.ts`, standard ES imports are used alongside `require("./routes/auth").default`.
- **Layering Flaws**:
  - **No Service Layer**: Zero domain services exist (`CommunityService`, `MessageService`, `PostService`).
  - **No Repository Layer**: Controllers execute raw Prisma queries directly.
  - **No DTO / Serialization Layer**: Prisma database entities (including internal IDs, deleted flags, and raw dates) are returned directly over HTTP.

### 3.2 Routing & Controller Mismatch
- Routes are organized into 6 resource files in `src/routes/`:
  - `auth.ts`: Stubs returning hardcoded JSON.
  - `users.ts`: Stubs returning hardcoded JSON.
  - `events.ts`: Stubs returning hardcoded JSON.
  - `communities.ts`, `posts.ts`, `messages.ts`: Mapped to controllers.
- Controllers (`communityController.ts`, `postController.ts`, `messageController.ts`) were written against an imaginary or outdated version of the Prisma schema:
  - `communityController.ts` queries `prisma.community` expecting `ownerId`, `channels`, and direct many-to-many `members.connect`, none of which exist on `Community`.
  - `postController.ts` calls `prisma.vote` (does not exist) and expects `title`, `communityId`, `tags` on `Post` (these belong to `Thread`).
  - `messageController.ts` creates `Message` records with `channelId: undefined` and `recipientId: ...`, violating PostgreSQL NOT NULL constraints on `channelId`.

---

## 4. Realtime Architecture Assessment (`Socket.io`)

- **Server Setup**: Socket.io server is initialized directly on the Node.js HTTP server in `src/index.ts`.
- **State Storage**: Connected users are tracked in a module-scoped `Map<string, SocketUser>` in `src/socket/handlers.ts`.
- **Adapter**: Zero Redis adapter integration exists. If the application scales to 2 or more instances behind a load balancer, users connected to different instances cannot communicate.
- **Room Isolation**:
  - Direct messages are broadcast platform-wide via `io.emit("message:new", message)`.
  - Post and comment updates are broadcast platform-wide via `io.emit("post:vote")`, `io.emit("comment:new")`.
  - Typing indicators are broadcast platform-wide via `socket.broadcast.emit("typing:indicator")`.
- **Diagnosis**: The realtime implementation is an unisolated prototype that leaks all user actions and cannot scale.

---

## 5. Shared Package Assessment (`packages/shared`)

- `packages/shared/package.json` exists in the monorepo workspace.
- `apps/api/tsconfig.json` and `apps/web/tsconfig.json` define path aliases for `@dyne/shared`.
- **Reality**: `packages/shared` has no `src/` directory, no `index.ts`, no types, and no validation schemas. It is completely empty.

---

## 6. Infrastructure & Deployment Assessment

| Component | Intended Tool | Actual Status |
|-----------|---------------|---------------|
| **Database** | PostgreSQL + Prisma | Unmigrated schema file only; 0 migrations exist. |
| **Cache & Pub/Sub** | Redis (`ioredis`) | Package installed; 0 lines of code connect to Redis. |
| **Realtime Gateway** | Socket.io | In-memory instance; no clustering/adapter. |
| **Media / File Storage** | AWS S3 / Uploadthing | Packages & envs present; 0 upload endpoints exist. |
| **Voice / Video SFU** | LiveKit | Client packages installed; 0 server integration. |
| **Background Jobs / Queues** | BullMQ / Redis | None. |
| **Email Service** | SMTP / Nodemailer | Envs present; 0 mailer services implemented. |
| **Containerization** | Docker / Compose | Zero Dockerfiles or Compose files exist. |
| **CI/CD** | GitHub Actions | Zero workflow files exist. |
| **Test Suite** | Jest / Vitest | Zero test configurations or test files exist. |
