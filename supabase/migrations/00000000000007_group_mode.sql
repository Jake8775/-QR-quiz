-- Group mode (조별모드): group members author their own group's questions,
-- every participant answers every OTHER group's confirmed questions, and
-- is a spectator (excluded from scoring/stats) on their own group's
-- questions. This migration is purely additive -- no existing table,
-- column, or constraint is altered or removed. See the project plan for
-- the full design rationale.
--
-- quiz_runs.status (LOBBY/QUESTION_OPEN/REVEALED/LEADERBOARD/FINISHED) is
-- deliberately left untouched -- group mode's own DRAFTING/SUBMITTED/
-- CONFIRMED lifecycle lives entirely on the new `groups.status` column,
-- so the run state machine and its routes (start/reveal/show-ranking/next)
-- never need to know group mode exists.

-- ---------------------------------------------------------------------------
-- Additive columns on existing tables
-- ---------------------------------------------------------------------------

alter table quizzes add column mode text not null default 'NORMAL';
alter table quizzes add constraint quizzes_mode_allowed check (mode in ('NORMAL', 'GROUP'));

alter table participants add column group_id uuid;
alter table participants add column pin_attempt_count int not null default 0;
alter table participants add column pin_locked_until timestamptz;

-- ---------------------------------------------------------------------------
-- groups: one row per group within a GROUP-mode run.
-- ---------------------------------------------------------------------------

create table groups (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references quiz_runs(id) on delete cascade,
  name text not null,
  -- 4-digit numeric PIN, plaintext. Hashing buys nothing against a 4-digit
  -- (10,000 value) search space -- the actual brute-force defense is the
  -- attempt counter/lockout on participants, not secrecy of a hash -- and
  -- the presenter needs to view/copy this value on demand.
  pin text not null,
  status text not null default 'DRAFTING',
  status_version bigint not null default 0,
  -- Membership snapshot taken once, at game start (see run_questions.
  -- source_group_id usage in the start route) -- members who leave mid-game
  -- must not change the authoring-group display or the group-score average
  -- denominator.
  member_snapshot jsonb,
  created_at timestamptz not null default now(),
  constraint groups_status_allowed check (status in ('DRAFTING', 'SUBMITTED', 'CONFIRMED')),
  constraint groups_run_name_unique unique (run_id, name),
  constraint groups_run_pin_unique unique (run_id, pin)
);

create index idx_groups_run_id on groups(run_id);

-- Now that `groups` exists, wire up the two forward references that
-- participants/run_questions needed it for.
alter table participants add constraint participants_group_fk
  foreign key (group_id) references groups(id) on delete set null;
create index idx_participants_group_id on participants(group_id);

alter table run_questions add column source_group_id uuid references groups(id) on delete set null;
create index idx_run_questions_source_group_id on run_questions(source_group_id);

-- ---------------------------------------------------------------------------
-- group_question_slots: the K fixed question slots per group. Stored as
-- jsonb (not normalized options/answer-key tables like the source/run
-- question tables) so the existing QuestionCard/OptionRow editing UI and
-- questionDraftSchema can be reused unmodified -- the slot round-trips as
-- one object, matching how that UI already works, which keeps the
-- editing-lock + version-check story to "one row per slot" instead of
-- needing option-row-level bookkeeping during edits.
-- ---------------------------------------------------------------------------

create table group_question_slots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  slot_index int not null,
  question_text text not null default '',
  options jsonb not null default '[]'::jsonb,
  correct_option_temp_id text,
  last_edited_by_participant_id uuid references participants(id) on delete set null,
  last_edited_at timestamptz,
  presenter_comment text,
  presenter_edited boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint group_question_slots_group_slot_unique unique (group_id, slot_index)
);

create index idx_group_question_slots_group_id on group_question_slots(group_id);

-- ---------------------------------------------------------------------------
-- group_question_locks: one row per slot, only while held. unique(slot_id)
-- is what makes "exactly one concurrent acquirer succeeds" hold under a
-- race -- the acquire route does delete-expired-then-insert-on-conflict.
-- ---------------------------------------------------------------------------

create table group_question_locks (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique references group_question_slots(id) on delete cascade,
  holder_participant_id uuid not null references participants(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lock_version bigint not null default 1
);

-- ---------------------------------------------------------------------------
-- group_mode_settings: one row per GROUP-mode run, holding the run-level
-- config that doesn't fit `quizzes`/`questions` (which assume
-- presenter-authored content).
-- ---------------------------------------------------------------------------

create table group_mode_settings (
  run_id uuid primary key references quiz_runs(id) on delete cascade,
  topic text not null,
  questions_per_group int not null check (questions_per_group between 1 and 50),
  time_limit_seconds int not null check (time_limit_seconds between 5 and 300),
  group_count int not null check (group_count >= 2)
);

-- ---------------------------------------------------------------------------
-- group_status_history / group_slot_edit_events: append-only audit trails.
-- ---------------------------------------------------------------------------

create table group_status_history (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  actor text not null,
  actor_participant_id uuid references participants(id) on delete set null,
  from_status text not null,
  to_status text not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint group_status_history_actor_allowed check (actor in ('MEMBER', 'PRESENTER'))
);

create index idx_group_status_history_group_id on group_status_history(group_id);

create table group_slot_edit_events (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references group_question_slots(id) on delete cascade,
  edited_by text not null,
  editor_participant_id uuid references participants(id) on delete set null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint group_slot_edit_events_edited_by_allowed check (edited_by in ('MEMBER', 'PRESENTER'))
);

create index idx_group_slot_edit_events_slot_id on group_slot_edit_events(slot_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table groups enable row level security;
alter table group_mode_settings enable row level security;
alter table group_status_history enable row level security;
alter table group_slot_edit_events enable row level security;
-- group_question_slots and group_question_locks get RLS enabled with ZERO
-- policies, same posture as question_answer_keys/run_answer_keys -- this is
-- what makes "before game start, no participant-facing path may ever
-- expose another group's question content" structurally true rather than
-- a property every new query has to remember to uphold. All access goes
-- through service-role routes that explicitly check the caller's own
-- group_id/ownership first.
alter table group_question_slots enable row level security;
alter table group_question_locks enable row level security;

create policy "owner_select" on groups for select
  using (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = groups.run_id and r.owner_id = auth.uid()
  ));

-- Not secret (unlike groups/slots) -- owner_all so the presenter's own
-- RLS-scoped client can create/read this directly, matching the
-- quizzes/rooms pattern rather than groups' read-only posture.
create policy "owner_all" on group_mode_settings for all
  using (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = group_mode_settings.run_id and r.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = group_mode_settings.run_id and r.owner_id = auth.uid()
  ));

create policy "owner_select" on group_status_history for select
  using (exists (
    select 1 from groups g
    join quiz_runs qr on qr.id = g.run_id
    join rooms r on r.id = qr.room_id
    where g.id = group_status_history.group_id and r.owner_id = auth.uid()
  ));

create policy "owner_select" on group_slot_edit_events for select
  using (exists (
    select 1 from group_question_slots s
    join groups g on g.id = s.group_id
    join quiz_runs qr on qr.id = g.run_id
    join rooms r on r.id = qr.room_id
    where s.id = group_slot_edit_events.slot_id and r.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on groups, group_status_history, group_slot_edit_events to authenticated;
grant select, insert, update, delete on group_mode_settings to authenticated;
grant select, insert, update, delete on
  groups, group_question_slots, group_question_locks, group_mode_settings,
  group_status_history, group_slot_edit_events
to service_role;
