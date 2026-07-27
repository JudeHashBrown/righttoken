\set ON_ERROR_STOP on

\if :{?recall_password}
\else
  \echo 'recall_password psql variable is required'
  \quit
\endif

SELECT format(
  'CREATE ROLE righttoken_recall_app LOGIN PASSWORD %L',
  :'recall_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'righttoken_recall_app'
)
\gexec

SELECT format(
  'ALTER ROLE righttoken_recall_app WITH LOGIN NOINHERIT PASSWORD %L',
  :'recall_password'
)
\gexec

SELECT format(
  'REVOKE %I FROM righttoken_recall_app',
  parent.rolname
)
FROM pg_auth_members membership
JOIN pg_roles child
  ON child.oid = membership.member
JOIN pg_roles parent
  ON parent.oid = membership.roleid
WHERE child.rolname = 'righttoken_recall_app'
\gexec

CREATE SCHEMA IF NOT EXISTS recall
  AUTHORIZATION righttoken_recall_app;
ALTER SCHEMA recall OWNER TO righttoken_recall_app;

CREATE SCHEMA IF NOT EXISTS pgboss
  AUTHORIZATION righttoken_recall_app;
ALTER SCHEMA pgboss OWNER TO righttoken_recall_app;

GRANT USAGE ON SCHEMA public TO righttoken_recall_app;
REVOKE ALL PRIVILEGES ON TABLE
  public.users,
  public.payment_orders,
  public.usage_logs,
  public.ops_error_logs
FROM righttoken_recall_app;
GRANT SELECT ON TABLE public.users, public.payment_orders, public.usage_logs, public.ops_error_logs TO righttoken_recall_app;

GRANT USAGE, CREATE ON SCHEMA recall TO righttoken_recall_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA recall TO righttoken_recall_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA recall TO righttoken_recall_app;

GRANT USAGE, CREATE ON SCHEMA pgboss TO righttoken_recall_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO righttoken_recall_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pgboss TO righttoken_recall_app;

ALTER DEFAULT PRIVILEGES FOR ROLE righttoken_recall_app
  IN SCHEMA recall
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO righttoken_recall_app;
ALTER DEFAULT PRIVILEGES FOR ROLE righttoken_recall_app
  IN SCHEMA recall
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO righttoken_recall_app;
ALTER DEFAULT PRIVILEGES FOR ROLE righttoken_recall_app
  IN SCHEMA pgboss
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO righttoken_recall_app;
ALTER DEFAULT PRIVILEGES FOR ROLE righttoken_recall_app
  IN SCHEMA pgboss
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO righttoken_recall_app;
