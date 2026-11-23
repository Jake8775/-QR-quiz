-- Fix: a `bigserial` column's underlying sequence is a separate grantable
-- object from its table in Postgres. 00000000000004_reactions.sql granted
-- table-level privileges on `reactions` but never granted USAGE on the
-- sequence backing `reactions.seq`, so every insert failed with
-- "permission denied for sequence reactions_seq_seq" even though the
-- table grant looked correct -- same class of gap as the one fixed for
-- table grants in 00000000000003_grants.sql.

grant usage, select on sequence reactions_seq_seq to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
