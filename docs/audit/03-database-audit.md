# Phase 3: Prisma Database Schema Audit

**Project**: Dyne — Student Life OS  
**Audit Date**: August 2026  
**Auditor**: Lead Software Architect & Senior Full-Stack Engineer  
**Source File**: [`apps/api/prisma/schema.prisma`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/prisma/schema.prisma) (629 lines)

---

## 1. Schema Overview

The database schema is defined using **Prisma ORM** targeting **PostgreSQL**.
It contains **25 Models** and **11 Enums**.

```
Datasource: PostgreSQL (env("DATABASE_URL"))
Generator: prisma-client-js
Total Models: 25
Total Enums: 11
Migrations Applied: None (No prisma/migrations directory exists)
```

---

## 2. Exhaustive Model Audit

### 2.1 User & Preferences Domain

#### `User` (Lines 17–66)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Unique Fields**: `clerkId` (`String @unique`), `email` (`String @unique`), `username` (`String @unique`)
- **Profile Fields**: `displayName` (`String?`), `avatar` (`String?`), `bio` (`String?`), `coverImage` (`String?`)
- **Campus Fields**: `university` (`String?`), `campus` (`String?`), `enrollmentYear` (`String?`), `degree` (`String?`), `department` (`String?`)
- **Status & Moderation**: `isActive` (`Boolean @default(true)`), `banFrom` (`Ban[]`)
- **Timestamps**: `createdAt` (`DateTime @default(now())`), `updatedAt` (`DateTime @updatedAt`)
- **Relations**:
  - `friends` / `friendOf`: `User[] @relation("Friends")` (Self-relation many-to-many; lacks metadata/status)
  - `following` / `followers`: `User[] @relation("Following")` (Self-relation many-to-many; lacks metadata/status)
  - `roles`: `Role[]` (Implicit many-to-many with `Role`)
  - `posts`: `Post[]` (1:N)
  - `comments`: `Comment[]` (1:N)
  - `reactions`: `Reaction[]` (1:N)
  - `directMessages`: `DirectMessage[]` (Implicit many-to-many, but broken in `DirectMessage` definition)
  - `messagesSent`: `Message[]` (1:N as author)
  - `messagesRead`: `MessageRead[]` (1:N)
  - `communityMemberships`: `CommunityMember[]` (1:N)
  - `serverMemberships`: `ServerMember[]` (1:N)
  - `preferences`: `UserPreferences?` (1:1 optional)
- **Integrity Risks**:
  - `name` does not exist on `User`, but all controllers and frontend components query `user.name`.
  - Self-relations `Friends` and `Following` do not have timestamped junction models, preventing request tracking (Pending, Accepted, Blocked).

#### `UserPreferences` (Lines 68–80)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Key**: `userId` (`String @unique` -> `User.id`, `onDelete: Cascade`)
- **Settings**: `theme` (`String @default("dark")`), `emailNotifications` (`Boolean @default(true)`), `pushNotifications` (`Boolean @default(true)`), `privateProfile` (`Boolean @default(false)`)
- **Timestamps**: `createdAt`, `updatedAt`

---

### 2.2 Communities vs Servers Domain (The Dual Model Problem)

#### `Community` (Lines 86–110)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Attributes**: `name` (`String`), `slug` (`String @unique`), `description` (`String?`), `icon` (`String?`), `coverImage` (`String?`), `university` (`String?`), `department` (`String?`), `category` (`CommunityCategory @default(GENERAL)`), `isPublic` (`Boolean @default(true)`), `isVerified` (`Boolean @default(false)`)
- **Relations**: `members` (`CommunityMember[]`), `threads` (`Thread[]`), `events` (`Event[]`)
- **Timestamps**: `createdAt`, `updatedAt`
- **Critical Flaws**:
  - Has NO `ownerId` or creator foreign key.
  - Has NO `channels` relation (Channels belong to `Server`).
  - Has NO role/permission relation (Roles belong to `Server`).

#### `CommunityMember` (Lines 123–134)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Keys**: `userId` (`User.id`, `onDelete: Cascade`), `communityId` (`Community.id`, `onDelete: Cascade`)
- **Role**: `role` (`MemberRole @default(MEMBER)` — enum: `ADMIN`, `MODERATOR`, `MEMBER`)
- **Timestamp**: `joinedAt` (`DateTime @default(now())`)
- **Constraints**: `@@unique([userId, communityId])`

#### `Server` (Lines 142–155)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Attributes**: `name` (`String`), `icon` (`String?`), `ownerId` (`String @db.VarChar(255)`)
- **Relations**: `members` (`ServerMember[]`), `channels` (`Channel[]`), `roles` (`Role[]`), `invites` (`Invite[]`)
- **Timestamps**: `createdAt`, `updatedAt`
- **Critical Flaws**:
  - Direct duplicate of `Community`.
  - `ownerId` is a raw unconstrained string without a foreign key relation to `User.id`.

#### `ServerMember` (Lines 157–169)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Keys**: `serverId` (`Server.id`, `onDelete: Cascade`), `userId` (`User.id`, `onDelete: Cascade`)
- **Attributes**: `nickname` (`String?`), `joinedAt` (`DateTime @default(now())`)
- **Relations**: `roles` (`Role[]`), `Channel` (via implicit relation)
- **Constraints**: `@@unique([serverId, userId])`

#### `Channel` (Lines 171–189)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Attributes**: `name` (`String`), `serverId` (`String` -> `Server.id`, `onDelete: Cascade`), `type` (`ChannelType` — `TEXT`, `VOICE`, `ANNOUNCEMENT`), `topic` (`String?`), `isPrivate` (`Boolean @default(false)`)
- **Relations**: `messages` (`Message[]`), `members` (`ServerMember[]`)
- **Constraints**: `@@unique([name, serverId])`
- **Critical Flaws**:
  - `Channel` links to `Server`, NOT `Community`. But the frontend sidebar and API routes navigate through `Community`.

---

### 2.3 Messaging & Realtime Domain

#### `Message` (Lines 196–225)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Content**: `content` (`String?`), `fileUrl` (`String?`), `fileName` (`String?`), `fileSize` (`Int?`), `voiceUrl` (`String?`), `voiceDuration` (`Int?`)
- **State**: `isEdited` (`Boolean @default(false)`), `isDeleted` (`Boolean @default(false)`)
- **Foreign Keys**:
  - `authorId` (`String` -> `User.id`, `onDelete: Cascade`)
  - `channelId` (`String` -> `Channel.id`, `onDelete: Cascade`) — **CRITICAL: REQUIRED NON-NULL**
  - `parentMessageId` (`String?` -> `Message.id`, self-relation for threading)
- **Relations**: `reactions` (`MessageReaction[]`), `replies` (`Message[]`), `messagesRead` (`MessageRead[]`)
- **Timestamps**: `createdAt`, `updatedAt`
- **Critical Flaws**:
  - `channelId` is required (`String`), making it impossible to store Direct Messages in the `Message` table.
  - No `recipientId`, `conversationId`, or `directMessageId` field exists on `Message`.

#### `MessageRead` (Lines 227–237)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Keys**: `userId` (`User.id`, `onDelete: Cascade`), `messageId` (`Message.id`, `onDelete: Cascade`)
- **Timestamp**: `readAt` (`DateTime @default(now())`)
- **Constraints**: `@@unique([userId, messageId])`

#### `MessageReaction` (Lines 239–248)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Key**: `messageId` (`Message.id`, `onDelete: Cascade`)
- **Fields**: `emoji` (`String`), `count` (`Int @default(1)`)
- **Constraints**: `@@unique([messageId, emoji])`
- **Critical Flaw**:
  - Lacks `userId`. Does not track WHICH user reacted with which emoji, making it impossible to check if a user already reacted or allow them to toggle their reaction off.

#### `DirectMessage` (Lines 254–263)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Fields**: `participantIds` (`String[]`), `lastMessageAt` (`DateTime?`)
- **Relations**: `messages` (`Message[]`)
- **Timestamps**: `createdAt`, `updatedAt`
- **Critical Flaws**:
  - `participantIds` is an unindexed raw PostgreSQL array with no foreign key integrity to `User`.
  - `messages Message[]` relation in `DirectMessage` has NO corresponding `directMessageId` foreign key on `Message`. Prisma schema validation will fail or treat it as an unreferenced virtual field.

---

### 2.4 Posts, Threads, Comments & Voting Domain

#### `Thread` (Lines 269–297)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Keys**: `authorId` (`User.id`), `communityId` (`Community.id`, `onDelete: Cascade`)
- **Attributes**: `title` (`String`), `content` (`String?`), `type` (`ThreadType @default(TEXT)`), `isPinned` (`Boolean @default(false)`), `isLocked` (`Boolean @default(false)`), `imageUrl` (`String?`), `videoUrl` (`String?`)
- **Counters**: `upvotes` (`Int @default(0)`), `downvotes` (`Int @default(0)`), `commentCount` (`Int @default(0)`), `viewCount` (`Int @default(0)`)
- **Relations**: `posts` (`Post[]`), `comments` (`Comment[]`), `reactions` (`Reaction[]`)
- **Timestamps**: `createdAt`, `updatedAt`

#### `Post` (Lines 307–331)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Keys**: `authorId` (`User.id`, `onDelete: Cascade`), `threadId` (`Thread.id?`, `onDelete: Cascade`)
- **Attributes**: `content` (`String`), `imageUrl` (`String?`), `videoUrl` (`String?`), `upvotes` (`Int @default(0)`), `downvotes` (`Int @default(0)`), `isEdited` (`Boolean`), `isDeleted` (`Boolean`)
- **Relations**: `comments` (`Comment[]`), `reactions` (`Reaction[]`)
- **Timestamps**: `createdAt`, `updatedAt`
- **Critical Conceptual Confusion**:
  - `Thread` and `Post` represent duplicate concepts. In Reddit models, a thread IS a submission/post. Having `Thread` contain `Post[]`, which both contain `Comment[]` and `Reaction[]`, creates nested relational ambiguity.

#### `Comment` (Lines 333–360)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Keys**: `authorId` (`User.id`, `onDelete: Cascade`), `postId` (`Post.id?`, `onDelete: Cascade`), `threadId` (`Thread.id?`, `onDelete: Cascade`), `parentCommentId` (`Comment.id?`, self-relation `CommentReplies`)
- **Attributes**: `content` (`String`), `upvotes` (`Int @default(0)`), `downvotes` (`Int @default(0)`), `isEdited` (`Boolean`), `isDeleted` (`Boolean`)
- **Relations**: `replies` (`Comment[]`), `reactions` (`Reaction[]`)

#### `Reaction` (Lines 362–384)
- **Primary Key**: `id` (`String @id @default(cuid())`)
- **Foreign Keys**: `userId` (`User.id`, `onDelete: Cascade`), `threadId` (`Thread.id?`), `postId` (`Post.id?`), `commentId` (`Comment.id?`)
- **Fields**: `type` (`ReactionType` — `UPVOTE`, `DOWNVOTE`, `LIKE`, `HAHA`, `WOW`, `SAD`, `ANGRY`), `emoji` (`String?`), `createdAt` (`DateTime @default(now())`)
- **Constraints**: `@@unique([userId, threadId])`, `@@unique([userId, postId])`, `@@unique([userId, commentId])`
- **Critical Flaw**:
  - Tri-nullable polymorphic design. `postController.ts` ignores this model and attempts to query non-existent `prisma.vote`.

---

### 2.5 Events, Tasks, Academic & System Domain

#### `Event` & `EventAttendee` (Lines 400–455)
- `Event`: `id`, `title`, `description`, `startTime`, `endTime`, `location`, `imageUrl`, `communityId` (`Community.id?`, `onDelete: SetNull`), `eventType` (`EventType`), `isPublic`, `isCancelled`.
- `EventAttendee`: `id`, `eventId` (`Event.id`, `onDelete: Cascade`), `userId` (`String`), `status` (`AttendeeStatus` — `PENDING`, `ACCEPTED`, `DECLINED`, `MAYBE`).
- **Integrity Risk**: `EventAttendee.userId` is a raw unconstrained string without a foreign key to `User.id`.

#### `Task` (Lines 461–476)
- `id`, `title`, `description`, `dueDate`, `priority` (`TaskPriority`), `status` (`TaskStatus`), `userId` (`String`), `tags` (`String[]`), `createdAt`, `updatedAt`.
- **Integrity Risk**: `Task.userId` has no foreign key relation to `User.id`.

#### `Role`, `Permission`, `Invite`, `Ban` (Lines 496–555)
- `Role`: `id`, `name`, `serverId` (`Server.id`, `onDelete: Cascade`), `color`, `isDefault`, `permissions` (`Permission[]`), `users` (`User[]`), `members` (`ServerMember[]`).
- `Permission`: `id`, `roleId` (`Role.id`), `name`, `value` (`Int`), `@@unique([roleId, name])`.
- `Invite`: `id`, `code` (`String @unique`), `serverId` (`Server.id`), `expiresAt`, `maxUses`, `uses`.
- `Ban`: `id`, `userId` (`User.id`), `reason`, `bannedAt`, `unbannedAt`.

#### `Course` & `Attendance` (Lines 561–589)
- `Course`: `id`, `code` (`String @unique`), `name`, `description`, `semester`, `credits`, `instructor`, `schedule`. `@@index([code])`.
- `Attendance`: `id`, `courseId` (`String`), `userId` (`String`), `date` (`DateTime`), `status` (`AttendanceStatus`).
- **Integrity Risks**: Neither `courseId` nor `userId` in `Attendance` have foreign key relationships to `Course` or `User`.

#### `Notification` (Lines 601–628)
- `id`, `userId` (`String`), `type` (`NotificationType`), `title`, `description`, `actionUrl`, `actionType`, `isRead` (`Boolean @default(false)`).
- **Integrity Risk**: `Notification.userId` has no foreign key relation to `User.id`.

---

## 3. Comprehensive Enums Reference

| Enum Name | Values | Used In |
|-----------|--------|---------|
| `CommunityCategory` | `GENERAL`, `ACADEMIC`, `CLUBS`, `SPORTS`, `SOCIAL`, `EVENTS`, `STUDY_GROUPS`, `ALUMNI` | `Community.category` |
| `MemberRole` | `ADMIN`, `MODERATOR`, `MEMBER` | `CommunityMember.role` |
| `ChannelType` | `TEXT`, `VOICE`, `ANNOUNCEMENT` | `Channel.type` |
| `ThreadType` | `TEXT`, `IMAGE`, `VIDEO`, `LINK`, `POLL` | `Thread.type` |
| `ReactionType` | `UPVOTE`, `DOWNVOTE`, `LIKE`, `HAHA`, `WOW`, `SAD`, `ANGRY` | `Reaction.type` |
| `EventType` | `SOCIAL`, `ACADEMIC`, `CLUB`, `SPORTS`, `WORKSHOP`, `SEMINAR`, `CONCERT`, `OTHER` | `Event.eventType` |
| `AttendeeStatus` | `PENDING`, `ACCEPTED`, `DECLINED`, `MAYBE` | `EventAttendee.status` |
| `TaskPriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | `Task.priority` |
| `TaskStatus` | `TODO`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` | `Task.status` |
| `AttendanceStatus` | `PRESENT`, `ABSENT`, `LATE`, `EXCUSED` | `Attendance.status` |
| `NotificationType` | `MESSAGE`, `MENTION`, `REPLY`, `EVENT_REMINDER`, `COMMUNITY_UPDATE`, `FRIEND_REQUEST`, `POST_UPVOTE`, `COMMENT_REPLY`, `EVENT_INVITATION` | `Notification.type` |

---

## 4. Key Database Disconnects & Architectural Flaws

1. **Disconnected Community vs Server Models**: Discord clone entities (`Server`, `ServerMember`, `Channel`, `Role`, `Permission`, `Invite`) exist in parallel with Dyne entities (`Community`, `CommunityMember`, `Thread`, `Event`). The API controllers try to merge them illegally (e.g. asking Prisma for `community.channels`).
2. **Missing `Vote` Model**: `postController.ts` relies on `prisma.vote`, but the schema only defines `Reaction`.
3. **Broken DM Relational Mapping**: `Message.channelId` is mandatory, blocking direct messages. `DirectMessage` lacks foreign key backreferences.
4. **Orphaned String User IDs**: `EventAttendee.userId`, `Task.userId`, `Attendance.userId`, `Attendance.courseId`, `Notification.userId`, and `Server.ownerId` are plain strings without `@relation` foreign keys or cascade constraints.
5. **No Indexes on Foreign Keys**: Almost all foreign key fields (`channelId`, `authorId`, `communityId`, `threadId`, `postId`, `eventId`) lack `@@index` annotations, which will cause severe performance degradation on PostgreSQL table scans as data grows.
