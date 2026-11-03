# Connecting an AI coding agent to Dyne's Supabase project

An AI coding agent can help inspect the Supabase schema, draft SQL, run
read-only checks, and apply reviewed migrations through the official Supabase
MCP server. This repository does not contain an MCP access token or database
password, and those secrets must not be committed.

## Recommended safe setup

1. In the Supabase dashboard, open the Dyne project
   (`pnldqzokdvlgdtyvjcwd`) and verify it is the intended project.
2. Configure the official Supabase MCP server in the coding agent that will
   operate on the project. Use the project-scoped server option if available.
3. Start with read-only mode. Ask the agent to inspect migration history,
   tables, columns, indexes, RLS policies, storage buckets and realtime
   publication membership.
4. Compare that live schema with `src/lib/mongo/collections.ts` and the
   current API contracts. Do not infer that old SQL migrations were applied
   successfully.
5. Only after review, enable write access for a narrowly scoped task and
   apply one reviewed additive migration at a time.
6. Run verification queries and record the migration version and outcome.

## Secret handling

- Never put a Supabase access token, database password, or service-role key in
  chat, Git, source code, screenshots, or a client-side environment variable.
- Store MCP credentials in the coding agent's secure secret store.
- Store `SUPABASE_SERVICE_ROLE_KEY` only in server-side deployment secrets.
- The browser should use only the project URL and publishable/anon key, with
  Row Level Security enabled on exposed tables.

## Current limitation

This ChatGPT session has GitHub and Vercel repository/deployment tools, but no
connected Supabase MCP/database action. It can prepare and review repository
changes; it cannot inspect or execute SQL against the live Supabase project
until a Supabase connection is explicitly made available to the coding agent.
