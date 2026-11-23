-- Fix: table-level GRANTs are a separate gate from RLS in Postgres. RLS
-- policies restrict WHICH rows a role can see/touch, but the role still
-- needs a baseline GRANT on the table itself, or every query is rejected
-- before RLS even runs. Supabase's dashboard/CLI normally sets these up
-- automatically on `public` schema objects; applying migrations via a raw
-- psql connection (as done here, since Docker/CLI login weren't available)
-- skipped that step. This migration adds it back, keeping RLS as the only
-- row-level gate.
--
-- question_answer_keys and run_answer_keys deliberately do NOT get
-- authenticated/anon grants here -- only service_role, which already
-- bypasses RLS. This preserves the "answer key is structurally
-- unreadable outside server-only code" guarantee.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  quizzes,
  questions,
  options,
  rooms,
  quiz_runs
to authenticated;

grant select on
  run_questions,
  run_options,
  run_question_states,
  participants,
  answers
to authenticated;

-- service_role already bypasses RLS entirely, but still needs the
-- baseline table grant to be reachable at all.
grant select, insert, update, delete on
  quizzes,
  questions,
  options,
  question_answer_keys,
  rooms,
  quiz_runs,
  run_questions,
  run_options,
  run_answer_keys,
  run_question_states,
  participants,
  answers
to service_role;

-- Default privileges for any future table created by this role, so the
-- same gap doesn't reappear in a later migration.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
