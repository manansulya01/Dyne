-- Dyne migration 13: replicate app tables to the publication the Realtime
-- server actually streams.
--
-- ROOT CAUSE (verified live): migrations 04/07 added tables to the legacy
-- `supabase_realtime` publication, but current Realtime servers stream
-- `supabase_realtime_messages_publication`. Subscriptions succeeded yet no
-- postgres_changes events were ever delivered.
--
-- NOTE: that publication is created and owned by the Realtime server at
-- runtime, so it may not exist when migrations run (fresh `db reset`). This
-- migration therefore only adds tables when the publication already exists
-- and never fails. After deploying (or after `supabase start` / `db reset`),
-- run once against the LIVE database (or toggle the tables in the Supabase
-- Dashboard under Database > Replication):
--
--   ALTER PUBLICATION supabase_realtime_messages_publication
--     ADD TABLE messages, conversation_members, notifications;
--
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime_messages_publication') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime_messages_publication' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE messages;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime_messages_publication' AND tablename = 'conversation_members'
    ) THEN
      ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE conversation_members;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime_messages_publication' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE notifications;
    END IF;
  END IF;
END
$$;
