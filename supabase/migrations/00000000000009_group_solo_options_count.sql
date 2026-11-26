-- GROUP/SOLO mode fairness: the presenter now fixes how many options
-- (지선다) every participant-authored question must have, instead of
-- letting each author pick their own count via QuestionCard's add/
-- remove-option buttons. Purely additive -- existing rows backfill to 4.

alter table group_mode_settings add column options_count int not null default 4
  check (options_count between 2 and 6);

alter table solo_mode_settings add column options_count int not null default 4
  check (options_count between 2 and 6);
