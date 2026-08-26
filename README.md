# Dyne - Student Life OS

Dyne is a unified digital environment for university life, combining the most useful concepts from Discord, Reddit, Telegram, Instagram, Facebook, Google Calendar, and productivity tools.

## Features

### Core Features (Integrated from Feature Projects)

- **Communities & Servers** (from discord-clone)
  - Create and manage communities/servers
  - Channels with different types (text, voice, announcements)
  - Role-based access control
  - Member management

- **Realtime Messaging** (from telegram-clone)
  - Direct messaging between users
  - Channel-based group messaging
  - Voice notes and file sharing
  - Voice and video call support via LiveKit
  - Read receipts and typing indicators

- **Discussion & Threads** (from threaddit)
  - Create discussion threads in communities
  - Reddit-style voting (upvote/downvote)
  - Nested comments and replies
  - Post moderation and management

- **Social Features** (from Dyne spec)
  - User profiles and social graphs
  - Feed system with posts and stories
  - Follow/Friend system
  - Reactions and engagement metrics

- **Calendar & Events** (from Dyne spec)
  - Event creation and management
  - Calendar view with scheduling
  - RSVP and attendance tracking
  - Event reminders and notifications

- **Academic Features** (from Dyne spec)
  - Course management
  - Attendance tracking
  - Academic schedule integration
  - University/campus information

- **Productivity** (from Dyne spec)
  - Task management with priorities
  - Note-taking capabilities
  - Workspace organization

### Branding & UI

- Dyne-specific branding and color scheme
- Modern, dark-mode-first design
- Responsive layout for all devices
- Accessible components following WCAG standards

## Tech Stack

### Frontend
- **Framework**: Next.js 13.4.12
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui with Radix UI
- **State Management**: Zustand
- **API Client**: Axios with React Query
- **Authentication**: Clerk
- **Realtime**: Socket.io client
- **Video/Voice**: LiveKit components

### Backend
- **Framework**: Express.js
- **Language**: TypeScript/Node.js
- **Database**: PostgreSQL with Prisma ORM
- **Realtime**: Socket.io
- **Authentication**: Clerk SDK
- **Caching**: Redis with ioredis
- **File Storage**: AWS S3 with Uploadthing

### Monorepo
- **Workspace Manager**: pnpm with workspaces
- **Build Orchestration**: Turborepo

## Project Structure

```
dyne/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── styles/
│   │   │   ├── utils/
│   │   │   └── types/
│   │   ├── public/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── api/                 # Express API backend
│       ├── src/
│       │   ├── routes/
│       │   ├── controllers/
│       │   ├── middleware/
│       │   ├── lib/
│       │   └── index.ts
│       ├── prisma/
│       │   └── schema.prisma
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared/             # Shared types and utilities
├── package.json            # Root package.json with workspaces
└── .gitignore
```

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm 8+
- PostgreSQL 14+
- Redis (optional, for realtime features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/manansulya01/Dyne.git
   cd Dyne
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   # Frontend
   cp apps/web/.env.example apps/web/.env.local

   # Backend
   cp apps/api/.env.example apps/api/.env
   ```

4. **Set up the database**
   ```bash
   cd apps/api
   pnpm run prisma:migrate
   ```

5. **Start development servers**
   ```bash
   pnpm run dev
   ```

   This will start:
   - Frontend: http://localhost:3000
   - API: http://localhost:3001

## Database Schema

The Dyne database combines features from all three projects:

### Users & Authentication
- User profiles with university info
- Social connections (friends, following)
- User preferences and settings

### Communities
- Community/server management
- Channel system
- Role-based permissions
- Member management

### Messaging
- Direct messages between users
- Channel-based group messaging
- Message reactions and metadata

### Content
- Discussion threads and posts
- Comments with nested replies
- Voting system (upvote/downvote)
- Reactions on posts/comments

### Events
- Event creation and management
- Calendar integration
- Attendance tracking
- Event invitations

### Academic
- Course management
- Attendance records
- Academic information

### Notifications
- Real-time notifications
- Notification preferences
- Delivery channels

See `apps/api/prisma/schema.prisma` for the complete database schema.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user profile
- `GET /api/users/:id/communities` - Get user's communities

### Communities
- `GET /api/communities` - Get all communities
- `POST /api/communities` - Create community
- `GET /api/communities/:id` - Get community
- `GET /api/communities/:id/threads` - Get threads
- `GET /api/communities/:id/members` - Get members

### Posts & Discussions
- `GET /api/posts` - Get posts feed
- `POST /api/posts` - Create post
- `GET /api/posts/:id` - Get post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/comments` - Add comment

### Messages
- `GET /api/messages` - Get messages
- `POST /api/messages` - Send message
- `DELETE /api/messages/:id` - Delete message

### Events
- `GET /api/events` - Get events
- `POST /api/events` - Create event
- `GET /api/events/:id` - Get event
- `POST /api/events/:id/attend` - RSVP to event

## Development

### Running Tests
```bash
pnpm run test
```

### Building for Production
```bash
pnpm run build
```

### Linting and Type Checking
```bash
pnpm run lint
pnpm run type-check
```

## Features Integration Details

### From discord-clone
- Server/Community architecture
- Channel system (text, voice, announcement)
- Role-based permissions
- Message threading
- Emoji reactions
- Live voice/video integration via LiveKit

### From telegram-clone
- Direct messaging system
- Voice notes capability
- Real-time messaging with Socket.io
- User presence and typing indicators
- Media file sharing

### From threaddit
- Discussion thread model
- Reddit-style voting (upvote/downvote)
- Nested comments
- Community-based organization
- Post moderation features

### From Dyne Specification
- University/Campus-specific features
- Academic calendar integration
- Student productivity tools
- Social feed and stories
- Events with RSVP
- Task management
- Notifications system

## Security

- Clerk-based authentication
- Role-based access control
- Input validation with Zod
- CORS configuration
- Environment variable protection
- Database encryption at rest

## Performance

- Database indexing for common queries
- Redis caching for real-time data
- CDN-ready asset serving
- Lazy loading of components
- Server-side rendering optimization
- WebSocket connection pooling

## Deployment

Ready for deployment on:
- Vercel (frontend)
- Railway, Render, or Heroku (backend)
- PostgreSQL hosting (Supabase, Railway, etc.)

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

MIT

## Acknowledgments

- Discord-Clone project for community/server architecture
- Telegram-Clone project for messaging foundations
- Threaddit project for discussion/threading model
- Dyne specification for comprehensive product vision

---

**Status**: Active Development

For questions or support, please open an issue on the GitHub repository.
