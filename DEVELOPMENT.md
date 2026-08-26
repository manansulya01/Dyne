# Dyne Development Guide

## Integration Summary

This document describes how features from the three provided projects (discord-clone, telegram-clone, threaddit) have been integrated into Dyne while maintaining Dyne's unique branding and unified vision.

## Architecture Overview

Dyne is built as a monorepo with:
- **Frontend**: Next.js + TypeScript + Tailwind CSS
- **Backend**: Express.js + TypeScript + Prisma
- **Database**: PostgreSQL
- **Realtime**: Socket.io

## Feature Integration Map

### Discord-Clone Integration

**Features Adopted**:
1. **Server/Community Architecture**
   - `Server` model for creating server communities
   - `Channel` model with TEXT, VOICE, ANNOUNCEMENT types
   - `ServerMember` for membership management
   - Role-based permission system

2. **Message System**
   - Text messaging in channels
   - Message threading (parent-child relationships)
   - Message reactions with emoji support
   - File sharing with metadata

3. **User Engagement**
   - Emoji reactions on messages
   - User presence tracking
   - Typing indicators
   - Message read receipts

4. **Video/Voice**
   - LiveKit integration for voice and video calls
   - Voice note support in messages

**Adapted for Dyne**:
- Servers are rebranded as "Communities" for campus context
- Channels support academic categories
- Added university/campus-specific fields
- Integrated with Dyne's social and academic features

### Telegram-Clone Integration

**Features Adopted**:
1. **Direct Messaging**
   - `DirectMessage` model for 1-to-1 and group chats
   - Real-time message delivery via Socket.io
   - Message persistence and history

2. **Message Types**
   - Text messages
   - File attachments
   - Voice notes with duration tracking
   - Media file support

3. **Real-time Features**
   - Socket.io for instant message delivery
   - User online/offline status
   - Typing indicators
   - Message read status

4. **User Presence**
   - Online/offline status
   - Last seen timestamps
   - Presence broadcasting

**Adapted for Dyne**:
- Integrated with channel-based messaging
- Unified message model across direct and group chats
- Added support for both direct and community messaging
- Message features adapted for both personal and academic contexts

### Threaddit Integration

**Features Adopted**:
1. **Discussion Model**
   - `Thread` model for creating discussion posts
   - Nested commenting with `Comment` model
   - Reddit-style voting (upvotes/downvotes)
   - Comment threading and replies

2. **Content Organization**
   - Threads within communities
   - Multiple thread types (TEXT, IMAGE, VIDEO, LINK, POLL)
   - Content pinning and locking
   - View counting

3. **Engagement Metrics**
   - Vote counts (upvotes/downvotes)
   - Comment counts
   - View tracking
   - Reaction system

4. **Moderation**
   - Post deletion and editing
   - Soft deletes for content retention
   - Admin/Moderator roles

**Adapted for Dyne**:
- Threads are community-specific discussions
- Integrated with role-based permissions
- Added academic community support
- Enhanced with Dyne's notification system
- Unified with the overall social engagement model

## Unified Data Model

### User System
```
User
├── Profile (avatar, bio, display name)
├── University Info (campus, degree, department)
├── Social Graph (friends, following)
├── Notifications (preferences, history)
└── Roles (community, server roles)
```

### Community Structure
```
Community
├── Members (with roles)
├── Threads/Posts (discussions)
├── Events
└── Channels (if server-based)
```

### Message Types
```
Message
├── Channel Messages (server-based)
├── Direct Messages (1-to-1)
├── Voice Messages
└── Reactions
```

### Content
```
Post/Thread
├── Nested Comments
├── Reactions
├── Voting System
└── Moderation (lock, pin)
```

## Database Relationships

Key relationships that unify the features:

1. **User → Communities**: Users join communities with roles
2. **Communities → Content**: Communities contain threads/posts/events
3. **Content → Engagement**: Posts have comments, reactions, votes
4. **Messages → Threading**: Messages can have replies
5. **Users → Messages**: Users send/receive messages
6. **Events → RSVP**: Events track attendance

## Development Workflow

### Adding New Features

1. **Define Schema**: Update `apps/api/prisma/schema.prisma`
2. **Generate Types**: `pnpm run prisma:generate`
3. **Create API Routes**: Add endpoints in `apps/api/src/routes/`
4. **Add Frontend Components**: Create components in `apps/web/src/components/`
5. **Connect Frontend to API**: Use React Query for data fetching
6. **Add Real-time Updates**: Use Socket.io for live features

### Code Organization

**API Routes Structure**:
```
routes/
├── auth.ts         # Authentication
├── users.ts        # User profiles
├── communities.ts  # Communities/servers
├── posts.ts        # Posts/threads
├── messages.ts     # Messaging
└── events.ts       # Events
```

**Frontend Structure**:
```
apps/web/src/
├── pages/          # Page components
├── components/     # Reusable components
├── hooks/          # Custom React hooks
├── styles/         # CSS and theming
├── utils/          # Helper functions
└── types/          # TypeScript types
```

## Feature-Specific Implementation Notes

### Real-time Messaging
- Socket.io events: `message:send`, `user:typing`, `user:online`
- Message delivery confirmation
- Read receipt tracking
- Typing indicator broadcast

### Communities & Channels
- Hierarchical organization (Server → Channels)
- Role-based access control (Admin, Moderator, Member)
- Permission checking on channel operations
- Member invitation system

### Discussions & Voting
- Thread creation in communities
- Comment threading with infinite nesting
- Vote tracking (upvote/downvote per user)
- Vote aggregation for sorting/ranking

### Events & Calendar
- Event creation with date/time
- Community-specific or global events
- RSVP tracking with status (Pending, Accepted, Declined, Maybe)
- Event reminders and notifications

### Academic Features
- Course enrollment tracking
- Attendance record keeping
- Schedule management
- Grade/result integration (future)

## Branding Customization

### Color Scheme
- Primary: Dyne blue (from tailwind theme)
- Secondary: Campus-friendly neutrals
- Dark mode by default
- Customizable per user preference

### Typography
- Modern sans-serif (system fonts)
- Hierarchy through size and weight
- Consistent spacing (Tailwind)

### Components
- shadcn/ui base components
- Dyne-specific customizations
- Campus-relevant imagery
- Academic-focused terminology

## Testing Strategy

### Unit Tests
- API route handlers
- Utility functions
- Type definitions

### Integration Tests
- Database operations
- API endpoint workflows
- Authentication flows

### E2E Tests
- User signup and login
- Creating communities
- Posting content
- Real-time messaging
- Event RSVP

## Performance Considerations

1. **Database**
   - Proper indexing on frequently queried fields
   - Connection pooling
   - Query optimization

2. **Frontend**
   - Code splitting by route
   - Image optimization
   - CSS-in-JS minimization
   - Component lazy loading

3. **Real-time**
   - Socket.io connection pooling
   - Message batching
   - Rate limiting

4. **Caching**
   - Redis for frequently accessed data
   - Client-side React Query cache
   - HTTP cache headers

## Security Implementation

1. **Authentication**
   - Clerk for auth management
   - JWT token validation
   - Session management

2. **Authorization**
   - Role-based access control
   - Community membership checks
   - Resource ownership verification

3. **Data Protection**
   - Input validation with Zod
   - SQL injection prevention (Prisma)
   - CORS configuration
   - Rate limiting

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Clerk application set up
- [ ] AWS S3 bucket configured
- [ ] Redis instance ready
- [ ] HTTPS enabled
- [ ] CORS properly configured
- [ ] Logging configured
- [ ] Error tracking set up
- [ ] Backup strategy in place

## Future Enhancements

1. **Video Features**
   - Screen sharing
   - Recording capability
   - Live streaming

2. **AI Integration**
   - Smart search
   - Content recommendations
   - Auto-moderation

3. **Mobile Apps**
   - React Native or Flutter
   - Offline support
   - Push notifications

4. **Advanced Academic Features**
   - GPA tracking
   - Course recommendations
   - Study group matching
   - Exam preparation tools

## Common Tasks

### Creating a New API Endpoint
1. Add route in `apps/api/src/routes/`
2. Export from route file
3. Import and use in `apps/api/src/index.ts`
4. Update frontend to call endpoint

### Adding a New Component
1. Create in `apps/web/src/components/`
2. Import shadcn/ui primitives as needed
3. Style with Tailwind classes
4. Export from component file

### Updating Database Schema
1. Modify `apps/api/prisma/schema.prisma`
2. Run `pnpm run prisma:migrate`
3. Update TypeScript types if needed
4. Update API endpoints

## Support & Issues

For development issues, check:
1. Discord-clone documentation
2. Telegram-clone documentation
3. Threaddit documentation
4. Dyne specification document
5. Project GitHub issues

---

**Last Updated**: 2026-08-26
**Version**: 1.0.0-alpha
