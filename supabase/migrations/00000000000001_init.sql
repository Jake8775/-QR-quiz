-- Stage 1: core schema for QR quiz app
-- Design principle: correct-answer data lives in physically separate tables
-- (question_answer_keys, run_answer_keys) that never get an RLS policy for
-- anon/authenticated roles, so they are structurally unreadable by anyone
-- except the service-role key used server-side.

create extension if not exists "pgcrypto";

create type quiz_run_status as enum ('LOBBY', 'QUESTION_OPEN', 'LEADERBOARD', 'FINISHED');

-- ---------------------------------------------------------------------------
-- Source tables (presenter-authored quiz content, edited in a later stage)
-- ---------------------------------------------------------------------------

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  order_index int not null,
  question_text text not null,
  time_limit_seconds int not null check (time_limit_seconds between 5 and 300),
  constraint questions_quiz_order_unique unique (quiz_id, order_index)
);

create table options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  order_index int not null,
  option_text text not null,
  constraint options_question_order_unique unique (question_id, order_index)
);

-- Server-only: correctness mapping for source questions. Deliberately kept
-- out of `options` so no client-facing query can ever select a column that
-- reveals the answer.
create table question_answer_keys (
  question_id uuid primary key references questions(id) on delete cascade,
  correct_option_id uuid not null references options(id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Room / run tables
-- ---------------------------------------------------------------------------

-- rooms.active_run_id and quiz_runs.room_id are mutually referential, so
-- rooms is created first without that FK; the constraint is added after
-- quiz_runs exists (see below).
create table rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references quizzes(id) on delete restrict,
  public_join_code text not null unique,
  active_run_id uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table quiz_runs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  run_number int not null,
  status quiz_run_status not null default 'LOBBY',
  current_question_index int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  state_version bigint not null default 0,
  constraint quiz_runs_room_run_number_unique unique (room_id, run_number)
);

alter table rooms
  add constraint rooms_active_run_fk foreign key (active_run_id) references quiz_runs(id);

-- ---------------------------------------------------------------------------
-- Run snapshot tables (consumed starting Stage 3, designed now so the schema
-- isn't a blocker later). When a run starts, the engine copies the quiz's
-- current questions/options/answer-key into these run-scoped rows so later
-- edits to the source quiz never change the meaning of a run already
-- in progress or finished.
-- ---------------------------------------------------------------------------

create table run_questions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references quiz_runs(id) on delete cascade,
  source_question_id uuid references questions(id) on delete set null,
  order_index int not null,
  question_text text not null,
  time_limit_seconds int not null check (time_limit_seconds between 5 and 300),
  constraint run_questions_run_order_unique unique (run_id, order_index)
);

create table run_options (
  id uuid primary key default gen_random_uuid(),
  run_question_id uuid not null references run_questions(id) on delete cascade,
  order_index int not null,
  option_text text not null,
  constraint run_options_question_order_unique unique (run_question_id, order_index)
);

-- Server-only: same isolation rationale as question_answer_keys.
create table run_answer_keys (
  run_question_id uuid primary key references run_questions(id) on delete cascade,
  correct_option_id uuid not null references run_options(id) on delete restrict
);

create table run_question_states (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references quiz_runs(id) on delete cascade,
  run_question_id uuid not null references run_questions(id) on delete cascade,
  opened_at timestamptz,
  closes_at timestamptz,
  closed_at timestamptz,
  constraint run_question_states_run_question_unique unique (run_id, run_question_id)
);

-- ---------------------------------------------------------------------------
-- Participant / answer tables
-- ---------------------------------------------------------------------------

create table participants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references quiz_runs(id) on delete cascade,
  nickname text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  participant_session_id uuid not null unique default gen_random_uuid(),
  constraint participants_run_nickname_unique unique (run_id, nickname)
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references quiz_runs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  run_question_id uuid not null references run_questions(id) on delete cascade,
  selected_option_id uuid not null references run_options(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  is_correct boolean not null,
  awarded_points int not null default 0,
  constraint answers_participant_run_question_unique unique (participant_id, run_question_id)
);

-- ---------------------------------------------------------------------------
-- Indexes (FK lookup paths not already covered by a unique constraint)
-- ---------------------------------------------------------------------------

create index idx_questions_quiz_id on questions(quiz_id);
create index idx_options_question_id on options(question_id);
create index idx_rooms_owner_id on rooms(owner_id);
create index idx_rooms_quiz_id on rooms(quiz_id);
create index idx_quiz_runs_room_id on quiz_runs(room_id);
create index idx_run_questions_run_id on run_questions(run_id);
create index idx_run_options_run_question_id on run_options(run_question_id);
create index idx_run_question_states_run_id on run_question_states(run_id);
create index idx_participants_run_id on participants(run_id);
create index idx_answers_run_id on answers(run_id);
create index idx_answers_run_question_id on answers(run_question_id);
create index idx_answers_participant_id on answers(participant_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for quizzes
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger quizzes_set_updated_at
  before update on quizzes
  for each row
  execute function set_updated_at();
