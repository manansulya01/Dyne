# Phase 2: Comprehensive Feature Inventory Audit

**Project**: Dyne — Student Life OS  
**Audit Date**: August 2026  
**Auditor**: Lead Software Architect & Senior Full-Stack Engineer  
**Branch**: `main` / `rebuild/dyne-foundation` (`d4645df`)

---

## 1. Executive Feature Matrix (40 Capability Areas)

| # | Feature Area | Exists? | Actually Functional? | Frontend | Backend | Database | Persistence | Realtime | Auth Check | Authz Check | Tests | Status / Classification |
|---|--------------|---------|----------------------|----------|---------|----------|-------------|----------|------------|-------------|-------|-------------------------|
| 1 | **Authentication** | Partial | ❌ No | Stub | Stub | Partial | ❌ No | ❌ No | ❌ Broken | ❌ None | ❌ None | Broken (Fake middleware, stub routes) |
| 2 | **Users** | Partial | ❌ No | ❌ None | Stub | Model | ❌ No | ❌ No | ❌ Broken | ❌ None | ❌ None | Stubbed Backend / No Frontend |
| 3 | **Profiles** | Partial | ❌ No | 1 Avatar UI | Stub | Model | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | UI Primitive Only / No Pages |
| 4 | **University/Campus** | Partial | ❌ No | ❌ None | ❌ None | Fields | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Schema Fields Only |
| 5 | **Departments** | Partial | ❌ No | ❌ None | ❌ None | String Field | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Unmodeled String Field |
| 6 | **Courses** | Partial | ❌ No | ❌ None | ❌ None | Model | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Orphaned DB Model (No routes/UI) |
| 7 | **Attendance** | Partial | ❌ No | ❌ None | ❌ None | Model | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Orphaned DB Model (No routes/UI) |
| 8 | **Academic Schedules** | Partial | ❌ No | ❌ None | ❌ None | String Field | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Course.schedule String Only |
| 9 | **Social Graph** | Partial | ❌ No | ❌ None | ❌ None | Relations | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Schema Self-Relations Only |
| 10 | **Feed** | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Missing Entirely |
| 11 | **Posts** | Partial | ❌ No | 1 Card UI | Broken | Model | ❌ Broken | Partial | ❌ Broken | ❌ None | ❌ None | Broken (Schema vs Controller mismatch) |
| 12 | **Comments** | Partial | ❌ No | ❌ None | Broken | Model | ❌ Broken | Partial | ❌ Broken | ❌ None | ❌ None | Broken Controller / No Frontend |
| 13 | **Voting** | Partial | ❌ No | Button UI | Broken | Enum/Counts | ❌ Broken | Partial | ❌ Broken | ❌ None | ❌ None | Broken (Controller uses non-existent Vote model) |
| 14 | **Communities** | Partial | ❌ No | 1 Sidebar | Broken | Model | ❌ Broken | ❌ No | ❌ Broken | ❌ None | ❌ None | Broken (Controller uses non-existent ownerId) |
| 15 | **Servers** | Partial | ❌ No | ❌ None | ❌ None | Model | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Discord Clone Duplicate Model |
| 16 | **Channels** | Partial | ❌ No | 1 List UI | Broken | Model | ❌ No | Partial | ❌ Broken | ❌ None | ❌ None | Belongs to Server in DB, Community in UI |
| 17 | **Roles** | Partial | ❌ No | ❌ None | ❌ None | Models/Enums | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Dual Models (MemberRole vs Role) |
| 18 | **Permissions** | Partial | ❌ No | ❌ None | ❌ None | Model | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Orphaned Model (Zero RBAC middleware) |
| 19 | **Direct Messages** | Partial | ❌ No | ❌ None | Broken | Broken Model | ❌ Broken | Partial | ❌ Broken | ❌ None | ❌ None | Broken (Message.channelId required in DB) |
| 20 | **Group Messages** | Partial | ❌ No | 1 Chat UI | Broken | Model | ❌ Broken | Partial | ❌ Broken | ❌ None | ❌ None | Broken Realtime / Broken DB write |
| 21 | **Message Reactions**| Partial | ❌ No | ❌ None | Broken | Model | ❌ Broken | Partial | ❌ Broken | ❌ None | ❌ None | Broken Controller / Global socket broadcast |
| 22 | **Threads** | Partial | ❌ No | 1 Card UI | Broken | Model | ❌ Broken | ❌ No | ❌ Broken | ❌ None | ❌ None | Dual Concept with Post / Broken API |
| 23 | **Presence** | Partial | ❌ No | Dot UI | Mock | ❌ In-Memory | ❌ No | Partial | ❌ Broken | ❌ None | ❌ None | In-Memory Map / Global Broadcast |
| 24 | **Typing Indicators**| Partial | ❌ No | ❌ None | Mock | ❌ None | ❌ No | Partial | ❌ Broken | ❌ None | ❌ None | Global Broadcast (No room scoping) |
| 25 | **Voice / Video** | Partial | ❌ No | ❌ None | Mock Events | ❌ None | ❌ No | Mock | ❌ None | ❌ None | ❌ None | Package installed; zero LiveKit backend |
| 26 | **Voice Notes** | Partial | ❌ No | ❌ None | Broken | Fields | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Message fields only (voiceUrl, duration) |
| 27 | **File Uploads** | Partial | ❌ No | ❌ None | ❌ None | Fields | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Package installed; zero upload endpoints |
| 28 | **Media** | Partial | ❌ No | ❌ None | ❌ None | Fields | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Schema fields only (imageUrl, videoUrl) |
| 29 | **Events** | Partial | ❌ No | ❌ None | Stub | Model | ❌ No | ❌ No | ❌ Broken | ❌ None | ❌ None | Stubbed Backend / No Frontend |
| 30 | **Calendar** | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | No calendar view or recurrence logic |
| 31 | **RSVP** | Partial | ❌ No | ❌ None | Stub | Model | ❌ No | ❌ No | ❌ Broken | ❌ None | ❌ None | EventAttendee model exists; route stubbed |
| 32 | **Tasks** | Partial | ❌ No | ❌ None | ❌ None | Model | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Orphaned DB Model (No routes/UI) |
| 33 | **Notes** | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Missing Entirely |
| 34 | **Notifications** | Partial | ❌ No | ❌ None | ❌ None | Model | ❌ No | Mock Event | ❌ None | ❌ None | ❌ None | Model and Socket handler stub only |
| 35 | **Search** | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Missing Entirely |
| 36 | **Moderation** | Partial | ❌ No | ❌ None | ❌ None | Model (Ban) | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Ban model & soft-delete flags only |
| 37 | **Reporting** | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Missing Entirely |
| 38 | **Admin** | Partial | ❌ No | ❌ None | ❌ None | Enum | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | MemberRole.ADMIN enum only |
| 39 | **AI** | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | Missing Entirely |
| 40 | **Settings** | Partial | ❌ No | ❌ None | ❌ None | Model | ❌ No | ❌ No | ❌ None | ❌ None | ❌ None | UserPreferences model only |

---

## 2. Detailed Feature Breakdown & Evidence

### 1. Authentication
- **Status**: Broken / Fake Implementation
- **Frontend**: Clerk provider wrapped in `src/pages/_app.tsx`, but landing page (`src/pages/index.tsx`) hardcodes redirect to `/auth/sign-in` which does not exist.
- **Backend**: `src/routes/auth.ts` has 3 stub handlers (`/register`, `/login`, `/me`) returning `{ message: "..." }`.
- **Middleware**: `src/middleware/index.ts` lines 10-60 does NOT verify any token; it extracts `req.headers["x-user-id"]` and looks up the user in Prisma directly.
- **Evidence**: [middleware/index.ts:L10-L60](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/middleware/index.ts#L10-L60), [routes/auth.ts:L1-L45](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/routes/auth.ts#L1-L45).

### 2. Users & 3. Profiles
- **Status**: Backend Stubs / DB Model Only
- **Frontend**: Only `UserAvatar.tsx` UI widget exists (broken import). No profile page, no user settings page, no user edit form.
- **Backend**: `src/routes/users.ts` has 4 stub routes (`GET /`, `GET /:id`, `PUT /:id`, `GET /:id/communities`) with hardcoded JSON.
- **Database**: `User` model exists in `schema.prisma:L17-L66` with profile fields (`displayName`, `avatar`, `bio`, `coverImage`).
- **Evidence**: [routes/users.ts:L1-L54](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/routes/users.ts#L1-L54), [prisma/schema.prisma:L17-L66](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/prisma/schema.prisma#L17-L66).

### 4. University/Campus, 5. Departments, 6. Courses, 7. Attendance, 8. Academic Schedules
- **Status**: Schema Definitions Only / Zero Business Logic / Zero UI
- **Database**:
  - `User.university`, `User.campus`, `User.enrollmentYear`, `User.degree`, `User.department` exist as plain nullable strings.
  - `Community.university`, `Community.department` exist as plain nullable strings.
  - `Course` model exists (`id`, `code`, `name`, `semester`, `credits`, `instructor`, `schedule`).
  - `Attendance` model exists (`id`, `courseId`, `userId`, `date`, `status`).
- **Backend & Frontend**: Zero API routes, zero controllers, zero UI components.
- **Evidence**: [prisma/schema.prisma:L561-L596](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/prisma/schema.prisma#L561-L596).

### 9. Social Graph & 10. Feed
- **Status**: Schema Self-Relations Only / Feed Missing
- **Database**: `User.friends`, `User.friendOf`, `User.following`, `User.followers` self-relations exist on `User`.
- **Backend & Frontend**: No friend request flow, no follower endpoints, no social feed generator, no timeline queries.

### 11. Posts, 12. Comments, 13. Voting, 22. Threads
- **Status**: Broken Backend / Missing UI Pages
- **Database Disconnect**:
  - `schema.prisma` defines `Thread` (with `title`, `type`, `communityId`) and `Post` (with `content`, `threadId`).
  - `postController.ts` assumes `Post` has `title`, `communityId`, `tags`, and a `votes` relation.
  - `postController.ts:L262` calls `prisma.vote.findFirst(...)`, but the `Vote` model does NOT exist in Prisma (only `Reaction` exists).
  - Calling any voting or post creation endpoint crashes at runtime with Prisma client errors.
- **Realtime Leak**: `postController.ts` emits `io.emit("post:vote")` and `io.emit("comment:new")` globally to all clients on the server.
- **Frontend**: Only 1 standalone card component exists (`DiscussionThread.tsx`), which fails to compile due to missing `./ui/button`.
- **Evidence**: [controllers/postController.ts:L8-L74](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/controllers/postController.ts#L8-L74), [controllers/postController.ts:L252-L382](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/controllers/postController.ts#L252-L382).

### 14. Communities, 15. Servers, 16. Channels, 17. Roles, 18. Permissions
- **Status**: Dual Architectural Models / Controller Broken
- **Architectural Schism**:
  - The repo contains two disconnected community systems: `Community` (from Dyne/Threaddit) and `Server` (from Discord-clone).
  - `Server` has `channels`, `roles`, `invites`, `ownerId`.
  - `Community` has `threads`, `events`, `members` (`CommunityMember[]`), but NO channels, NO roles, NO ownerId.
  - `communityController.ts` queries `Community` as if it has `channels`, `ownerId`, and direct `User[]` members. It crashes on execution.
- **Frontend**: `CommunitySidebar.tsx` and `ChannelList.tsx` exist as unmounted components with broken imports.
- **Evidence**: [prisma/schema.prisma:L86-L195](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/prisma/schema.prisma#L86-L195), [controllers/communityController.ts:L20-L141](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/controllers/communityController.ts#L20-L141).

### 19. Direct Messages, 20. Group Messages, 21. Message Reactions
- **Status**: Broken DB Constraint / Global Realtime Leak
- **Database Disconnect**:
  - `Message.channelId` is a REQUIRED non-nullable string in `schema.prisma:L202-L203`.
  - `messageController.ts:L54-L55` attempts to create DMs with `channelId: undefined` and `recipientId: recipientId`, which violates PostgreSQL NOT NULL constraints and writes non-existent fields.
  - `DirectMessage` model in `schema.prisma:L254-L263` has `participantIds String[]` and `messages Message[]`, but `Message` has no relation pointing back to `DirectMessage`.
- **Realtime Leak**: `messageController.ts:L71` calls `req.app.get("io").emit("message:new", message)`, broadcasting every direct message to all users on the server.
- **Evidence**: [controllers/messageController.ts:L23-L80](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/controllers/messageController.ts#L23-L80), [prisma/schema.prisma:L196-L249](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/prisma/schema.prisma#L196-L249).

### 23. Presence, 24. Typing Indicators, 25. Voice/Video, 26. Voice Notes
- **Status**: In-Memory Mock Handlers / No SFU Backend
- **Realtime Handlers**: `src/socket/handlers.ts` uses an in-memory `Map` (`activeUsers`). It performs unauthenticated presence updates and broadcasts typing indicators globally across the server without room scoping.
- **Voice/Video**: Web package installs `@livekit/components-react`, but there is zero LiveKit token generation, webhook handler, or server connection on the API backend. Socket call events (`call:initiate`, `call:accept`) are basic event forwards with no media capability.
- **Evidence**: [socket/handlers.ts:L18-L152](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/socket/handlers.ts#L18-L152).

### 27. File Uploads & 28. Media
- **Status**: Dependencies Installed / Zero Backend Routes
- **Frontend**: `@uploadthing/react`, `uploadthing`, and AWS S3 variables exist in `.env.example`.
- **Backend**: Zero upload endpoints, no presigned URL service, no S3 SDK client configured.

### 29. Events, 30. Calendar, 31. RSVP
- **Status**: Backend Stubs / DB Model Only / No Calendar UI
- **Backend**: `src/routes/events.ts` has 4 stub routes (`GET /`, `POST /`, `GET /:id`, `POST /:id/attend`) returning placeholder strings.
- **Database**: `Event` and `EventAttendee` models exist in `schema.prisma:L400-L456`.
- **Frontend**: Zero calendar components, zero event cards, zero RSVP buttons.

### 32. Tasks & 33. Notes
- **Status**: Task DB Model Only / Notes Missing
- **Database**: `Task` model exists in `schema.prisma:L461-L491` (`title`, `description`, `dueDate`, `priority`, `status`, `tags`).
- **Notes**: Zero models, routes, or components exist for notes or Notion-like productivity.

### 34. Notifications
- **Status**: DB Model & Socket Stub Only
- **Database**: `Notification` model exists in `schema.prisma:L601-L628`.
- **Socket**: Handlers include `notification:read`, but there is no notification dispatch service, queue, or inbox API.

### 35. Search, 36. Moderation, 37. Reporting, 38. Admin, 39. AI, 40. Settings
- **Search / Reporting / AI**: Zero models, zero routes, zero code.
- **Moderation**: `Ban` model and boolean flags (`isDeleted`, `isEdited`, `isLocked`, `isPinned`) exist in Prisma.
- **Admin**: `MemberRole.ADMIN` enum exists.
- **Settings**: `UserPreferences` model exists in `schema.prisma:L68-L80` (`theme`, `emailNotifications`, `pushNotifications`, `privateProfile`).
