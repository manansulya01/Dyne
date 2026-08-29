\# DYNE — ONE DAY BUILD INSTRUCTIONS



You are the primary implementation agent for Project Dyne.



Do not ask me to manually implement routine code.



You have authority to inspect, modify, create, delete, test and refactor files inside this repository.



\## PRODUCT



Dyne is a Student Life OS.



It combines:



\- university identity

\- campus communities

\- Discord-style channels

\- Telegram-style messaging

\- Reddit-style social discussion

\- academic management

\- events/calendar

\- productivity

\- notifications



Dyne is NOT a collection of clones.



It is one unified application.



\## REFERENCE PROJECTS



The `references/` directory contains reference implementations:



references/discord

references/telegram

references/threaddit



Use them to understand proven implementation patterns.



Do NOT blindly merge their architectures.



Do NOT create duplicate domain models.



Do NOT copy code whose license does not permit reuse.



\## CORE DOMAIN



Use one identity system:



User

Profile

University

Campus

Department

Course

Enrollment



Use one community system:



Community

CommunityMember

CommunityRole

Channel

ChannelMember



Use one messaging system:



Conversation

ConversationMember

Message

MessageReaction

MessageReadState

Attachment



Conversation types:



DM

GROUP

CHANNEL

COURSE

EVENT



Use one social system:



Post

Comment

Vote

SavedPost



Use:



parentCommentId



for nested comments.



Academic:



Course

CourseSection

Enrollment

Attendance



Events:



Event

EventAttendee



Productivity:



Task



Notifications:



Notification



\## ARCHITECTURE



Frontend:

Next.js + TypeScript



Backend:

Express + TypeScript



Database:

PostgreSQL + Prisma



Realtime:

Socket.io



Authentication:

Clerk



Validation:

Zod



Shared:

TypeScript contracts and schemas



\## NON-NEGOTIABLE SECURITY



Never trust x-user-id.



Every authenticated HTTP request must use verified authentication.



Every protected resource must enforce authorization.



Never allow arbitrary users to access:



\- private conversations

\- private channels

\- communities they don't belong to

\- other users' private resources



Socket connections must authenticate.



Socket rooms must be scoped.



Never use global broadcasts for private data.



\## NON-NEGOTIABLE ENGINEERING



Do not leave fake implementations.



Do not create endpoints that return hardcoded demo data.



Do not claim a feature works unless it is tested.



Do not duplicate Prisma clients.



Do not put database logic directly in controllers.



Use:



route

→ controller

→ service

→ repository/database



Use Zod at API boundaries.



Use transactions for multi-step mutations where necessary.



Add indexes to frequently queried fields.



Use foreign keys and relations.



Use unique constraints where domain rules require them.



\## FRONTEND



Build a usable authenticated application.



Required areas:



/login

/dashboard

/feed

/communities

/messages

/events

/courses

/tasks

/profile



Build responsive navigation.



Every page needs:



loading state

empty state

error state



Do not build dozens of decorative pages.



Prioritize working flows.



\## REQUIRED WORKING FLOWS



1\. Register/login

2\. View profile

3\. Create/join community

4\. View community channels

5\. Send channel message

6\. Receive realtime message

7\. Start DM

8\. Send DM

9\. Create post

10\. Comment

11\. Vote

12\. Create event

13\. RSVP

14\. View course

15\. Record/view attendance

16\. Create task

17\. View notifications



\## TESTING



After every major subsystem:



typecheck

lint

unit tests

integration tests



At minimum test:



authentication

authorization

community membership

message access

DM privacy

post voting

event RSVP



Run production builds before completion.



\## EXECUTION ORDER



PHASE 1

Foundation + database + auth



PHASE 2

Communities + channels + permissions



PHASE 3

Messaging + realtime



PHASE 4

Social + academic + events + tasks



PHASE 5

Integration + testing + polish



\## IMPORTANT



Prioritize working functionality over visual perfection.



Do not spend hours redesigning the UI.



Do not stop after creating files.



Implement → run → inspect errors → fix → test → repeat.



Continue until the repository builds successfully and the required flows work.



At every phase report:



WHAT CHANGED

WHAT WORKS

WHAT FAILED

WHAT WAS FIXED

WHAT TESTS PASSED

WHAT REMAINS

