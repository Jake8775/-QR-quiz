-- Adds a REVEALED stage between QUESTION_OPEN and LEADERBOARD: after the
-- presenter clicks "결과 보기", the presenter screen shows a Kahoot-style
-- per-option respondent count + bar chart before the presenter separately
-- clicks "순위 보기" to advance to the existing ranking screen.
--
-- IMPORTANT: run this ALTER TYPE statement completely on its own in the
-- Supabase SQL Editor -- it must not be combined in the same execution/
-- transaction with any other statement that references the literal
-- 'REVEALED' (e.g. a test INSERT/UPDATE using it), or Postgres rejects it
-- with "unsafe use of new value of enum type".

ALTER TYPE quiz_run_status ADD VALUE 'REVEALED' AFTER 'QUESTION_OPEN';
