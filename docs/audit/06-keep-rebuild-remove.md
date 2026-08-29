# Phase 6: System Classification (Keep / Rebuild / Remove / Reference)

**Project**: Dyne — Student Life OS  
**Audit Date**: August 2026  
**Auditor**: Lead Software Architect & Senior Full-Stack Engineer  
**Branch**: `main` / `rebuild/dyne-foundation` (`d4645df`)

---

## 1. Classification Methodology

To establish an unshakeable foundation for Project Dyne, every component, file, and subsystem in the repository is evaluated using four strict evidence-based classifications:

- **🟢 KEEP**: Sound architectural design, syntactically and logically correct, reusable as-is or with minimal standard configuration.
- **🔄 REBUILD**: Core domain concept is valuable and essential to Dyne, but the existing implementation is fundamentally broken, insecure, disconnected from the schema, or non-functional.
- **❌ REMOVE**: Redundant files, duplicate models, conflicting entrypoints, dead code, or antipatterns that cause build errors or architectural confusion.
- **📖 REFERENCE ONLY**: High-level design assets, schemas, or documentation that provide valuable product inspiration and domain requirements, but cannot be run directly.

---

## 2. Exhaustive System Classification Matrix

| Component / Subsystem | Current File(s) | Classification | Rationale & Evidence |
|-----------------------|-----------------|----------------|----------------------|
| **Monorepo Workspace Config** | `package.json` (root) | 🟢 **KEEP** | Workspace layout (`apps/*`, `packages/*`) and Turbo scripts are clean and correct. Needs only `turbo.json`. |
| **Git Configuration** | `.gitignore` | 🟢 **KEEP** | Comprehensive ignore rules for Node, Next, Prisma, envs. |
| **Tailwind & Design System Tokens** | `apps/web/tailwind.config.js`, `apps/web/src/styles/globals.css`, `apps/web/src/utils/cn.ts` | 🟢 **KEEP** | Complete HSL color palette (dark-mode first, shadcn design tokens), animation keyframes, and class merging utility. |
| **Chat Auto-Scroll Hook** | `apps/web/src/hooks/useChatScroll.ts` | 🟢 **KEEP** | Clean, self-contained React scroll-to-bottom and reverse pagination trigger logic. |
| **Duplicate App Entrypoint** | `apps/web/src/_app.tsx` | ❌ **REMOVE** | Conflicting duplicate entrypoint outside `pages/`. `apps/web/src/pages/_app.tsx` is the real entrypoint. |
| **Next.js Pages Wrapper** | `apps/web/src/pages/_app.tsx` | 🔄 **REBUILD** | Fix React Query v5 property `gcTime` -> `cacheTime` (v4), integrate proper theme provider, toaster, and authenticated socket provider. |
| **Frontend Axios Client** | `apps/web/src/utils/api.ts` | 🔄 **REBUILD** | Add Clerk token interceptor to attach `Authorization: Bearer <token>` to all outbound API requests. |
| **Frontend UI Primitives** | `apps/web/src/components/ui/*` | 🔄 **REBUILD** | Add genuine shadcn/ui primitives (`button.tsx`, `avatar.tsx`, `dialog.tsx`, `input.tsx`, `dropdown-menu.tsx`, etc.) to resolve missing import build failures. |
| **Frontend Feature Components** | `ChannelList.tsx`, `ChatWindow.tsx`, `CommunitySidebar.tsx`, `DiscussionThread.tsx` | 🔄 **REBUILD** | Fix component imports, align props with unified data models, connect to authenticated real-time hooks and React Query mutations. |
| **Modal Store & Modals** | `apps/web/src/hooks/useModal.ts` | 🔄 **REBUILD** | Retain modal types, remove client-side `@prisma/client` direct import, implement actual modal dialog components. |
| **Realtime Chat Socket Hook** | `apps/web/src/hooks/useChatSocket.ts` | 🔄 **REBUILD** | Rewrite to properly handle scoped channel and DM cache mutations without race conditions. |
| **Socket Provider & Hook** | `apps/web/src/components/providers/SocketProvider.tsx`, `apps/web/src/hooks/useSocket.ts` | 🔄 **REBUILD** | Pass Clerk authentication token on Socket.io handshake and handle reconnection/auth refresh. |
| **Frontend Pages & Routing** | `apps/web/src/pages/*` | 🔄 **REBUILD** | Build actual authenticated pages: `/auth/sign-in`, `/auth/sign-up`, `/dashboard`, `/communities/[id]`, `/messages`, `/calendar`, `/courses`. |
| **Shared Workspace Package** | `packages/shared/` | 🔄 **REBUILD** | Create `src/index.ts`, shared TypeScript types, and shared Zod validation schemas for all domain entities. |
| **Prisma Database Schema** | `apps/api/prisma/schema.prisma` | 🔄 **REBUILD** | Unify `Community` and `Server` into one coherent campus community model; fix `Message` DM constraints; add missing relations and foreign keys; add performance indexes. |
| **Backend Express Server Entry** | `apps/api/src/index.ts` | 🔄 **REBUILD** | Fix CJS/ESM module loading; add rate limiting; restrict JSON body size to 1MB; mount proper authenticated routes. |
| **Authentication Middleware** | `apps/api/src/middleware/index.ts` | 🔄 **REBUILD** | Replace fake `x-user-id` lookup with genuine Clerk JWT verification (`@clerk/backend`). |
| **Authorization & RBAC Layer** | (Non-existent) | 🔄 **REBUILD** | Create permission-checking middleware enforcing community roles (Admin, Moderator, Member) and channel access controls. |
| **API Route Handlers** | `apps/api/src/routes/*` | 🔄 **REBUILD** | Replace placeholder stub routes with validated controller/service invocations. |
| **Backend Controllers** | `communityController.ts`, `postController.ts`, `messageController.ts` | 🔄 **REBUILD** | Rewrite controllers to match the unified Prisma schema, eliminate invalid queries (`prisma.vote`), and enforce data isolation. |
| **Backend Service Layer** | (Non-existent) | 🔄 **REBUILD** | Introduce dedicated domain services (`CommunityService`, `MessageService`, `PostService`, `AcademicService`, `EventService`). |
| **Socket.io Event Handlers** | `apps/api/src/socket/handlers.ts` | 🔄 **REBUILD** | Authenticate socket handshake; enforce room membership checks; eliminate global `io.emit` leakage; connect Redis adapter for scaling. |
| **File Storage & Upload Layer** | (Non-existent) | 🔄 **REBUILD** | Implement secure S3/Uploadthing presigned upload handlers with MIME validation and size quotas. |
| **Voice / Video Call Service** | (Non-existent) | 🔄 **REBUILD** | Implement LiveKit server SDK room creation and token generation endpoints. |
| **Architecture & Dev Docs** | `ARCHITECTURE.md`, `DEVELOPMENT.md`, `README.md` | 📖 **REFERENCE ONLY** | Treat existing documents as conceptual product specs and domain maps. |

---

## 3. Detailed Actions by Classification

### 3.1 🟢 KEEP (Assets to Preserve)
1. **Monorepo Workspace Structure**: `package.json` root workspace configuration with `pnpm` and `turbo`.
2. **Tailwind Design System**: `apps/web/tailwind.config.js`, `apps/web/src/styles/globals.css`, and `apps/web/src/utils/cn.ts`. Provides an excellent, production-grade dark/light HSL design foundation.
3. **Chat Scroll Utility**: `apps/web/src/hooks/useChatScroll.ts`. Well-written DOM scrolling logic for chat streams.

### 3.2 ❌ REMOVE (Cruft to Eliminate)
1. `apps/web/src/_app.tsx`: Orphaned duplicate file causing confusion with `apps/web/src/pages/_app.tsx`.
2. Discord clone duplicate models in Prisma (`Server`, `ServerMember`) that duplicate `Community` and `CommunityMember`.
3. Ad-hoc in-memory socket state tracking in `handlers.ts`.

### 3.3 🔄 REBUILD (Core Domain Logic to Refactor & Implement)
1. **Schema Unification**: Merge `Server` and `Community` into a single, cohesive entity with channels, members, roles, threads, events, and academic metadata.
2. **True Clerk Authentication**: Enforce cryptographic JWT signature verification on every protected Express endpoint and Socket.io handshake.
3. **Layered Backend Architecture**: Establish Route -> Validation -> Controller -> Service -> Repository/Prisma pipeline.
4. **Complete UI Component Library**: Populate `apps/web/src/components/ui/` with genuine Radix/shadcn primitives (`button.tsx`, `avatar.tsx`, `dialog.tsx`, `input.tsx`, etc.).
5. **Scoped Realtime Rooms**: Restrict all WebSocket events to verified room subscribers (`io.to(roomId).emit(...)`).
6. **Shared DTOs & Schemas**: Populate `packages/shared/src` with type-safe contracts shared across web and API.
