-- 0082_chat_message_sender_role
--
-- WHY: chat attribution (coach vs athlete bubble side) was inferred at read time
-- by matching chat_messages.sender_user_id against the thread's coach.user_id /
-- athlete.user_id. That breaks when ONE person is BOTH the coach AND an athlete
-- (the dogfood account: user 6 is coach id=4 AND athlete id=2). On that thread
-- coach_user_id == athlete_user_id, so every message resolves to 'coach' and the
-- athlete's messages render on the coach side.
--
-- FIX: persist the sender's ROLE on the message at write time (the auth context
-- always knows whether the sender is acting as coach or athlete). Reads then use
-- the stored role directly — bulletproof regardless of any user_id overlap.
--
-- Additive + backfilled; safe to re-run (guards below).

begin;

-- Orphaned trigger repair: 0001_init blanket-attached `set_updated_at` (which does
-- `new.updated_at = now()`) to a table list that wrongly included chat_messages —
-- but chat_messages has NO updated_at column. So EVERY update on chat_messages has
-- errored since day 1 (read receipts via markRead, edits, soft-deletes). Drop the
-- always-failing trigger: chat_messages tracks its own mutations via read_at /
-- edited_at / deleted_at and needs no updated_at. This also unblocks the backfill
-- below.
drop trigger if exists chat_messages_set_updated_at on chat_messages;

alter table chat_messages
  add column if not exists sender_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_sender_role_check'
  ) then
    alter table chat_messages
      add constraint chat_messages_sender_role_check
      check (sender_role is null or sender_role in ('coach', 'athlete'));
  end if;
end $$;

-- Backfill existing rows from the thread owners. For normal threads the
-- sender_user_id ↔ coach.user_id match is exact. For the dogfood collision
-- thread (coach.user_id = athlete.user_id) the user_id cannot disambiguate, and
-- the historical messages there are athlete-authored test data → mark 'athlete'.
update chat_messages m
set sender_role = case
  when c.user_id = a.user_id then 'athlete'
  when m.sender_user_id = c.user_id then 'coach'
  else 'athlete'
end
from chat_threads t
join coaches c on c.id = t.coach_id
join athletes a on a.id = t.athlete_id
where m.thread_id = t.id
  and m.sender_role is null;

commit;
