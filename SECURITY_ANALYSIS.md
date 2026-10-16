# Security and Permissions Analysis - Dyne-Run

## Overview
This document analyzes the security and permissions implementation in the Dyne-Run codebase, focusing on authentication, authorization, input validation, and other security measures.

## Authentication System

### Session Management
- **Session Storage**: HTTP-only cookies (`dyne_session`) with MongoDB-backed storage
- **Token Security**: SHA-256 hashed tokens stored in database (never raw tokens)
- **Session Lifetime**: 30 days TTL
- **Security Flags**:
  - `httpOnly: true` (prevents XSS access)
  - `sameSite: "lax"` (CSRF protection)
  - `secure: true` in production (HTTPS-only)
  - Proper path scoping (`/`)

### Authentication Helpers
1. `requireSessionUser()` - Basic authentication check (throws 401 if unauthenticated)
2. `requireAuth()` - Page helper that redirects to `/login` if unauthenticated
3. `requireProfile()` - Ensures user profile exists after authentication
4. `requireAdminUser()` - Admin-specific authentication (checks for admin/super_admin roles)
5. `requirePermUser()` - Permission-based authentication

### Account Security
- **Enumeration Protection**: Same error message for invalid email vs wrong password
- **Account Status Checks**: Validates against suspended/banned accounts during login
- **Password Change Requirements**: Flagged accounts (bootstrap, forced reset) must change password on first login
- **Session Invalidation**: Functions to destroy user sessions on password change or admin action

## Authorization System

### Role-Based Access Control (RBAC)
Defined in `src/lib/permissions/index.ts` with these roles:
- **student**: Basic member permissions
- **teacher**: Member + teaching capabilities (moderation, content creation, etc.)
- **staff**: Member + limited teaching capabilities + user moderation
- **club**: Member + community/blog/event creation capabilities
- **moderator**: Member + content moderation capabilities
- **admin**: Member + teacher + full platform administration
- **super_admin**: All permissions

### Permission Model
- **Fine-grained permissions**: Specific strings like `"posts.create"`, `"users.manage"`, `"moderation.queue"`
- **Hierarchical inheritance**:
  - Admin inherits all teacher capabilities
  - Super admin inherits all permissions
  - Staff gets teaching capabilities except academic grading/publishing
- **Helper functions**:
  - `hasPermission(role, permission)` - Check if role has permission
  - `requirePermission(role, permission)` - Throw 403 if missing
  - `requireAnyPermission/requireAllPermission` - Multiple permission checks
  - Role predicates: `isAdminRole()`, `isTeachingRole()`, `isModerationRole()`

### Implementation in API Routes
- **Basic auth**: `const { db, user } = await authed()` pattern
- **Permission checks**: `requirePermission(user.role, "posts.remove")`
- **Admin routes**: Use `requireAdminUser()` followed by permission checks
- **Granular gates**: `requirePermUser(db, permission)` for specific permissions

## Input Validation

### Zod Schema Validation
Centralized in `src/lib/validation/index.ts` with schemas for:
- **Authentication**: login, signup, password reset/update
- **Content**: posts, comments, communities, events, messages
- **Academic**: assignments, exams, goals, tasks
- **Media**: study materials, blogs, announcements
- **Reports**: feedback, reports
- **Settings**: preferences, timetable

### Validation Features
- **Type safety**: Automatic TypeScript type inference (`z.infer<typeof schema>`)
- **Constraints**:
  - Length limits (username: 3-30 chars, displayName: 1-50 chars)
  - Format validation (email, URLs, ObjectId, datetime)
  - Regex patterns (username: alphanumeric + underscore, slug: lowercase + hyphen)
  - Custom refinements (password confirmation, date ranges)
- **Error handling**: Field-specific error messages returned to clients

### Usage Pattern in API Routes
```typescript
const validated = schema.safeParse({
  field1: formData.get("field1"),
  field2: formData.get("field2"),
});

if (!validated.success) {
  return NextResponse.json(
    { error: validated.error.flatten().fieldErrors },
    { status: 400 }
  );
}
```

## Additional Security Measures

### Rate Limiting
- **Implementation**: In-memory sliding window (`src/lib/security/rateLimit.ts`)
- **Key generation**: `${userId ?? "anon"}:${IP address}` (with X-Forwarded-For support)
- **Presets**: Different limits for different endpoints:
  - Login: 10 attempts/minute
  - Signup: 30 attempts/10 minutes
  - Posts: 30 attempts/10 minutes
  - Comments: 60 attempts/10 minutes
  - More restrictive for sensitive operations (password reset: 5 attempts/10 minutes)

### Password Security
- **Hashing**: bcrypt (inferred from auth/password.ts references)
- **Requirements**: Minimum 8 characters
- **Confirmation**: Required for signup and password change
- **Reset tokens**: Secure token handling for password reset flows

### CSRF Protection
- **Next.js API Routes**: Inherently protected (require proper HTTP methods)
- **Cookie Security**: HTTP-only session cookies prevent JavaScript access
- **SameSite Policy**: Lax mode provides CSRF protection for navigation

### Database Security (MongoDB)
- **Connection Security**: Environment variable configuration with validation
- **Input Sanitization**:
  - ObjectId validation prevents injection
  - Parameterized queries in MongoDB operations
  - No observed string concatenation in queries
- **Connection Pooling**: Configured timeouts and pool limits

## Environment Configuration
Required variables (per `.env.example`):
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB` - Database name (defaults to "dyne")
- `AUTH_SECRET` - Session signing secret (min 32 chars in production)
- `NEXT_PUBLIC_SITE_URL` - Public app URL
- `STORAGE_DRIVER` - local (dev) or r2 (prod)
- Optional: AI moderation, admin bootstrap, R2 credentials

## Observations and Recommendations

### Strengths
1. **Defense in Depth**: Multiple layers (auth → authorization → validation → rate limiting)
2. **Centralized Security Logic**: Auth helpers, permissions, validation in dedicated libs
3. **Proper Error Handling**: Generic error messages prevent information leakage
4. **Comprehensive Validation**: Zod schemas cover all input surfaces
5. **Role Hierarchy**: Logical inheritance reduces permission duplication

### Areas for Improvement
1. **Rate Limiting Storage**: Consider Redis for multi-instance production deployments
2. **Security Headers**: Consider adding helmet.js or similar for:
   - X-Content-Type-Options
   - X-Frame-Options
   - Strict-Transport-Security (HSTS)
   - Content Security Policy (CSP)
3. **Audit Logging**: Enhance audit tracking for sensitive operations (permission changes, admin actions)
4. **Dependency Scanning**: Regular vulnerability scanning of npm dependencies
5. **Secrets Management**: Ensure .env.local is properly gitignored and never committed
6. **CORS Configuration**: Verify API routes have appropriate CORS restrictions if needed
7. **Input Sanitization**: Consider additional sanitization for HTML content where applicable
8. **Logging Security**: Ensure error logs don't leak sensitive information (tokens, passwords)

### Compliance with Project Instructions
The implementation aligns well with the project's security requirements:
- ✅ Server-first approach (auth/validation in route handlers)
- ✅ Database-level authorization (RLS concepts applied via permission checks)
- ✅ Type safety (TypeScript + Zod validation)
- ✅ Input validation (Zod schemas for all external input)
- ✅ No fake functionality (real database queries, proper auth)
- ✅ Password security (bcrypt, minimum strength requirements)
- ✅ Environment variable separation (.env.example vs .env.local)

## Conclusion
The Dyne-Run project demonstrates a solid security foundation with proper authentication, authorization, input validation, and protection against common web vulnerabilities. The codebase follows security best practices and aligns with the project's stated security requirements. With some enhancements to production deployment considerations (rate limiting storage, security headers), the security posture would be even stronger for production use.