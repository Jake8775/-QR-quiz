-- Adds two more quiz modes alongside NORMAL (individual, presenter-authored)
-- and GROUP (team-authored, team-reviewed):
--   TEAM -- presenter authors the questions (exactly like NORMAL), but
--   participants join a team via the same group+PIN flow as GROUP mode,
--   and scoring reports both individual and team-average rankings.
--   SOLO -- participants author their own single-person "group" (no PIN,
--   no team selection), reviewed by the presenter exactly like GROUP mode.
--
-- This is purely additive: widen the mode CHECK constraint, and add one
-- new settings table for SOLO (mirrors group_mode_settings but without
-- group_count, since SOLO groups are created dynamically per participant
-- rather than fixed at room-creation time).

alter table quizzes drop constraint quizzes_mode_allowed;
alter table quizzes add constraint quizzes_mode_allowed
  check (mode in ('NORMAL', 'GROUP', 'TEAM', 'SOLO'));

create table solo_mode_settings (
  run_id uuid primary key references quiz_runs(id) on delete cascade,
  topic text not null,
  questions_per_person int not null check (questions_per_person between 1 and 50),
  time_limit_seconds int not null check (time_limit_seconds between 5 and 300)
);

-- Not secret (unlike groups/slots) -- owner_all so the presenter's own
-- RLS-scoped client can create/read this directly, same posture as
-- group_mode_settings.
alter table solo_mode_settings enable row level security;

create policy "owner_all" on solo_mode_settings for all
  using (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = solo_mode_settings.run_id and r.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from quiz_runs qr
    join rooms r on r.id = qr.room_id
    where qr.id = solo_mode_settings.run_id and r.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Grants (same rationale as 00000000000003_grants.sql -- RLS is the only
-- row-level gate, but the baseline table GRANT is still required first)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on solo_mode_settings to authenticated;
grant select, insert, update, delete on solo_mode_settings to service_role;
