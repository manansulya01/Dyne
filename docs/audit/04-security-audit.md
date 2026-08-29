# Phase 4: Security & Vulnerability Audit

**Project**: Dyne — Student Life OS  
**Audit Date**: August 2026  
**Auditor**: Lead Software Architect & Senior Full-Stack Engineer  
**Severity Scale**: 🔴 Critical | 🟠 High | 🟡 Medium | 🔵 Low

---

## 1. Executive Security Summary

The codebase has severe, foundational security vulnerabilities in authentication, authorization, and real-time communication. As currently structured, the API cannot be safely exposed to any network environment.

```
🔴 Critical Vulnerabilities: 5
🟠 High Vulnerabilities:     6
🟡 Medium Vulnerabilities:   4
🔵 Low / Informational:      3
```

---

## 2. Detailed Vulnerability Findings

### 🔴 SEC-01: Critical Authentication Bypass via Unverified `x-user-id` Header
- **Location**: [`apps/api/src/middleware/index.ts:L10-L60`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/middleware/index.ts#L10-L60)
- **Severity**: 🔴 Critical
- **Description**: The `authenticateUser` middleware checks for the presence of an `Authorization` header, but completely skips signature verification or Clerk JWT validation. Instead, it reads `req.headers["x-user-id"]` directly and performs a DB lookup:
  ```typescript
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401)...;
  
  const userId = req.headers["x-user-id"] as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  (req as any).userId = userId;
  (req as any).user = user;
  ```
- **Impact**: Any attacker can pass `Authorization: Bearer dummy` and `x-user-id: <victim-user-id>` to authenticate as any user in the system (including admins), gaining complete control over victim accounts and data.

---

### 🔴 SEC-02: Socket.io Realtime Broadcast Leakage & Zero Room Isolation
- **Location**: [`apps/api/src/controllers/messageController.ts:L71`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/controllers/messageController.ts#L71), [`apps/api/src/controllers/postController.ts:L237`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/controllers/postController.ts#L237), [`apps/api/src/socket/handlers.ts:L29-L155`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/socket/handlers.ts#L29-L155)
- **Severity**: 🔴 Critical
- **Description**:
  1. In `messageController.ts`, when a message is sent (including private Direct Messages), the backend calls `req.app.get("io").emit("message:new", message)`. This broadcasts every single private direct message and channel message globally to every connected user.
  2. In `socket/handlers.ts`, events like `typing:start`, `message:reaction`, `presence:update`, and `notification:read` use `socket.broadcast.emit(...)`, broadcasting channel/DM activity platform-wide without checking channel membership or friend relations.
- **Impact**: Absolute failure of privacy and data isolation; all direct messages, typing indicators, and user activity are leaked to any active socket connection.

---

### 🔴 SEC-03: Unauthenticated Socket Handshake & Arbitrary User Impersonation
- **Location**: [`apps/api/src/socket/handlers.ts:L19-L26`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/socket/handlers.ts#L19-L26)
- **Severity**: 🔴 Critical
- **Description**:
  ```typescript
  io.on("connection", (socket: Socket) => {
    const userId = socket.handshake.auth.userId;
    if (userId) {
      activeUsers.set(socket.id, { userId, socketId: socket.id });
    }
  ```
  The Socket.io server performs zero handshake authentication or token verification. It blindly trusts the client-provided `auth.userId` string.
- **Impact**: Attackers can spoof any user's presence, intercept direct calls, receive directed user events, and trigger actions on their behalf.

---

### 🔴 SEC-04: Unauthorized Channel Joining (Zero Permission Check)
- **Location**: [`apps/api/src/socket/handlers.ts:L45-L56`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/socket/handlers.ts#L45-L56)
- **Severity**: 🔴 Critical
- **Description**:
  ```typescript
  socket.on("channel:join", ({ channelId }: any) => {
    socket.join(`channel:${channelId}`);
  });
  ```
  There is no database check to verify if the requesting user is a member of the community/server, or whether the channel is private (`isPrivate: true`).
- **Impact**: Any user can join any private or restricted channel and receive live real-time messages.

---

### 🔴 SEC-05: Insecure Direct Object References (IDOR) & Broken Authorization
- **Location**: [`apps/api/src/controllers/communityController.ts:L225-L289`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/controllers/communityController.ts#L225-L289), [`apps/api/src/controllers/messageController.ts:L220-L299`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/controllers/messageController.ts#L220-L299)
- **Severity**: 🔴 Critical
- **Description**:
  - In `communityController.ts`, adding/removing members (`addMember`, `removeMember`) does NOT check if the requester is an admin or moderator. Any user can add or remove any other user to/from any community.
  - Role-based permissions (`Role`, `Permission`) defined in the Prisma schema are completely unreferenced in all route handlers. No RBAC middleware exists.
- **Impact**: Privilege escalation, unauthorized membership manipulation, and data destruction.

---

### 🟠 SEC-06: Unauthenticated Frontend API Client
- **Location**: [`apps/web/src/utils/api.ts:L11-L17`](file:///c:/Users/manan/Desktop/Dyne-2/apps/web/src/utils/api.ts#L11-L17)
- **Severity**: 🟠 High
- **Description**: The Axios interceptor sets `Accept: application/json` but fails to retrieve the Clerk JWT token or attach `Authorization: Bearer <token>`.
- **Impact**: Frontend requests will fail standard auth guards once real authentication is implemented.

---

### 🟠 SEC-07: Unbounded Request Body Size (DoS Vulnerability)
- **Location**: [`apps/api/src/index.ts:L31-L32`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/index.ts#L31-L32)
- **Severity**: 🟠 High
- **Description**:
  ```typescript
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  ```
  A global 50MB JSON body limit allows attackers to flood the server with large JSON payloads, exhausting Node.js heap memory and triggering Denial of Service.
- **Impact**: Memory exhaustion and API crashes.

---

### 🟠 SEC-08: Complete Absence of Rate Limiting
- **Location**: Backend entrypoint (`apps/api/src/index.ts`)
- **Severity**: 🟠 High
- **Description**: Neither Express routes nor Socket.io event listeners implement rate limiting.
- **Impact**: Susceptible to brute-force attacks, spam messaging, bot voting, and socket connection flooding.

---

### 🟠 SEC-09: Uncontrolled File Upload Surface
- **Location**: `apps/web/package.json` vs `apps/api/`
- **Severity**: 🟠 High
- **Description**: File upload dependencies (`@uploadthing/react`, `uploadthing`) are added, and S3 credentials are in `.env.example`, but zero backend validation exists (no MIME-type whitelist, no antivirus/malware scanning, no file size checks per media type, no bucket ACL controls).
- **Impact**: Risk of arbitrary file execution, malicious script uploads, and storage cost inflation.

---

### 🟠 SEC-10: In-Memory Presence State Desynchronization & Leaks
- **Location**: [`apps/api/src/socket/handlers.ts:L12`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/socket/handlers.ts#L12)
- **Severity**: 🟠 High
- **Description**: `activeUsers` is stored in a Node.js `Map`. In a multi-replica or clustered environment (or when server restarts), all socket mappings and presence states are lost. No Redis pub/sub adapter is connected.
- **Impact**: State inconsistency and inability to scale horizontally.

---

### 🟡 SEC-11: Permissive CORS Configuration
- **Location**: [`apps/api/src/index.ts:L20-L25`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/index.ts#L20-L25), [`apps/api/src/index.ts:L33-L38`](file:///c:/Users/manan/Desktop/Dyne-2/apps/api/src/index.ts#L33-L38)
- **Severity**: 🟡 Medium
- **Description**: Fallback default is `http://localhost:3000` with `credentials: true`. If `FRONTEND_URL` is misconfigured in production or omitted, local origins remain active.

---

### 🟡 SEC-12: Stored XSS Risk in Markdown & Content Fields
- **Location**: `apps/web/package.json` (`react-markdown`), `DiscussionThread.tsx`
- **Severity**: 🟡 Medium
- **Description**: Post content, comments, and messages accept arbitrary strings without backend HTML sanitization (e.g. `DOMPurify` / `sanitize-html`).
- **Impact**: Potential Cross-Site Scripting when rendering rich text or markdown.

---

### 🟡 SEC-13: Missing Database Migration History & Constraints
- **Location**: `apps/api/prisma/`
- **Severity**: 🟡 Medium
- **Description**: Schema relies on raw strings for critical foreign relationships (`EventAttendee.userId`, `Task.userId`, `Attendance.userId`), bypassing database-level referential integrity.
- **Impact**: Orphaned data rows, integrity corruption, and inability to enforce GDPR deletion compliance.

---

### 🔵 SEC-14: Hardcoded Secrets in Example Files
- **Location**: `apps/api/.env.example`, `apps/web/.env.example`
- **Severity**: 🔵 Low
- **Description**: Placeholder strings (`your_clerk_secret_key`, `your_access_key`) are provided.

---

## 3. Required Security Remediation Checklist (For Rebuild Phase)

- [ ] Implement real Clerk JWT token verification middleware using `@clerk/backend`.
- [ ] Implement Socket.io authentication middleware verifying Clerk tokens on handshake.
- [ ] Enforce strict room scoping (`io.to(channelId).emit(...)`) for all chat and typing events.
- [ ] Enforce membership verification before allowing sockets to join channels or rooms.
- [ ] Implement an RBAC authorization layer (checking `Role` and `Permission` models).
- [ ] Implement `express-rate-limit` on API routes and token bucket limiters on Socket events.
- [ ] Restrict Express JSON body limit to `1mb` for standard routes, with dedicated streaming for uploads.
- [ ] Connect `ioredis` with `@socket.io/redis-adapter` for scalable presence and room management.
- [ ] Introduce input sanitization for posts, comments, and messages to eliminate XSS vectors.
