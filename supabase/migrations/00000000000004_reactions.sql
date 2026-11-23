-- Stage: participant emoji reactions, shown as a floating overlay on the
-- presenter screen. Polling-based like every other participant/presenter
-- channel in this app (no websockets -- see run-status/state routes).

create table reactions (
  id uuid primary key default gen_random_uuid(),
  -- Monotonic cursor for polling -- created_at alone isn't safe to page by
  -- under concurrent inserts (ties, clock skew).
  seq bigserial not null,
  run_id uuid not null references quiz_runs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now()
);

alter table reactions add constraint reactions_emoji_allowed
  check (emoji in ('👍', '❤️', '😂', '😮', '👏', '🔥'));

create unique index idx_reactions_seq on reactions(seq);
create index idx_reactions_run_seq on reactions(run_id, seq);

-- Server-side rate limiting cursor for the react route (reject re-sends
-- within a short window), same spirit as the heartbeat's last_seen_at.
alter table participants add column last_reaction_at timestamptz;

alter table reactions enable row level security;

create policy "owner_select" on reactions for select
  using (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = reactions.run_id and r.owner_id = auth.uid()
  ));

grant select on reactions to authenticated;
grant select, insert, update, delete on reactions to service_role;
