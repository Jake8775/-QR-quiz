-- Per-question max/min points: presenters can now set each question's
-- score range instead of a hardcoded 1000 (instant) -> 500 (at deadline)
-- linear decay. Default 1000/300 so existing questions keep scoring
-- close to before (deadline score moves from 500 to 300), and missing
-- an answer is always 0 regardless (unchanged, enforced in application
-- code, not here).
--
-- NORMAL/TEAM author per-question via questions/run_questions (same
-- pattern as time_limit_seconds). GROUP/SOLO fix one run-wide value in
-- their settings tables instead (same pattern as time_limit_seconds
-- there too) -- group_question_slots has no time-limit column either,
-- so it gets no points columns here.

alter table questions add column max_points int not null default 1000 check (max_points between 0 and 10000);
alter table questions add column min_points int not null default 300 check (min_points between 0 and 10000);
alter table questions add constraint questions_points_order check (min_points <= max_points);

alter table run_questions add column max_points int not null default 1000 check (max_points between 0 and 10000);
alter table run_questions add column min_points int not null default 300 check (min_points between 0 and 10000);
alter table run_questions add constraint run_questions_points_order check (min_points <= max_points);

alter table group_mode_settings add column max_points int not null default 1000 check (max_points between 0 and 10000);
alter table group_mode_settings add column min_points int not null default 300 check (min_points between 0 and 10000);
alter table group_mode_settings add constraint group_mode_settings_points_order check (min_points <= max_points);

alter table solo_mode_settings add column max_points int not null default 1000 check (max_points between 0 and 10000);
alter table solo_mode_settings add column min_points int not null default 300 check (min_points between 0 and 10000);
alter table solo_mode_settings add constraint solo_mode_settings_points_order check (min_points <= max_points);
