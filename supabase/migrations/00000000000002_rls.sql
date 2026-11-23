-- Stage 1: Row Level Security
--
-- Default posture: RLS enabled on every table, including the two
-- answer-key tables which intentionally receive ZERO policies. In Postgres,
-- enabling RLS with no policies means default-deny for every role except
-- the service role used server-side (which bypasses RLS entirely by
-- Supabase design). This is how the answer key stays unreadable through
-- any client-facing path, including the owning presenter's own session.

alter table quizzes enable row level security;
alter table questions enable row level security;
alter table options enable row level security;
alter table question_answer_keys enable row level security;
alter table rooms enable row level security;
alter table quiz_runs enable row level security;
alter table run_questions enable row level security;
alter table run_options enable row level security;
alter table run_answer_keys enable row level security;
alter table run_question_states enable row level security;
alter table participants enable row level security;
alter table answers enable row level security;

-- ---------------------------------------------------------------------------
-- Presenter-owned tables: owner_id = auth.uid(), direct or via join
-- ---------------------------------------------------------------------------

create policy "owner_all" on quizzes for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner_all" on questions for all
  using (exists (
    select 1 from quizzes q
    where q.id = questions.quiz_id and q.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from quizzes q
    where q.id = questions.quiz_id and q.owner_id = auth.uid()
  ));

create policy "owner_all" on options for all
  using (exists (
    select 1 from questions qu
    join quizzes q on q.id = qu.quiz_id
    where qu.id = options.question_id and q.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from questions qu
    join quizzes q on q.id = qu.quiz_id
    where qu.id = options.question_id and q.owner_id = auth.uid()
  ));

create policy "owner_all" on rooms for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner_all" on quiz_runs for all
  using (exists (
    select 1 from rooms r
    where r.id = quiz_runs.room_id and r.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from rooms r
    where r.id = quiz_runs.room_id and r.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Run snapshot / participant / answer tables: presenter gets SELECT only.
-- Mutations are driven by server-side (service-role) run-engine logic in a
-- later stage, never directly by the presenter's browser session.
-- ---------------------------------------------------------------------------

create policy "owner_select" on run_questions for select
  using (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = run_questions.run_id and r.owner_id = auth.uid()
  ));

create policy "owner_select" on run_options for select
  using (exists (
    select 1 from run_questions rq
    join quiz_runs qr on qr.id = rq.run_id
    join rooms r on r.id = qr.room_id
    where rq.id = run_options.run_question_id and r.owner_id = auth.uid()
  ));

create policy "owner_select" on run_question_states for select
  using (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = run_question_states.run_id and r.owner_id = auth.uid()
  ));

create policy "owner_select" on participants for select
  using (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = participants.run_id and r.owner_id = auth.uid()
  ));

create policy "owner_select" on answers for select
  using (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = answers.run_id and r.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- question_answer_keys / run_answer_keys: NO policies for any role.
-- RLS is enabled above with zero policies attached, which denies all access
-- to anon, authenticated, and the presenter's own session alike. Only the
-- service-role key (used exclusively in server-only code, see
-- src/lib/supabase/admin.ts) can read or write these two tables, since the
-- service role bypasses RLS entirely by Supabase design.
--
-- Participants have no Supabase Auth identity at all, so no anon policy is
-- granted on run_questions / run_options / run_question_states /
-- participants / answers either -- all participant-facing reads and writes
-- go through server-side API routes using the service-role client, which
-- re-derives and checks participant_session_id per request. This keeps the
-- "can an answer key ever leak" boundary singular and auditable.
-- ---------------------------------------------------------------------------
