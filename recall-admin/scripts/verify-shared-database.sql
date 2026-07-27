\set ON_ERROR_STOP on

SELECT current_user AS recall_database_role;

SELECT
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active_main_users
FROM public.users;

SELECT COUNT(*) AS payment_rows FROM public.payment_orders;
SELECT COUNT(*) AS successful_usage_rows FROM public.usage_logs;
SELECT COUNT(*) AS operations_error_rows FROM public.ops_error_logs;

DO $$
DECLARE
  public_table text;
  forbidden_privilege text;
BEGIN
  FOREACH public_table IN ARRAY ARRAY[
    'public.users',
    'public.payment_orders',
    'public.usage_logs',
    'public.ops_error_logs'
  ] LOOP
    FOREACH forbidden_privilege IN ARRAY ARRAY[
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ] LOOP
      IF has_table_privilege(
        current_user,
        public_table,
        forbidden_privilege
      ) THEN
        RAISE EXCEPTION
          'Recall database role has forbidden % privilege on %',
          forbidden_privilege,
          public_table;
      END IF;
    END LOOP;
  END LOOP;

  IF has_schema_privilege(current_user, 'public', 'CREATE') THEN
    RAISE EXCEPTION
      'Recall database role must not create objects in public';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles child ON child.oid = membership.member
    WHERE child.rolname = current_user
  ) THEN
    RAISE EXCEPTION
      'Recall database role must not inherit or assume another role';
  END IF;

  IF NOT has_schema_privilege(current_user, 'recall', 'USAGE')
     OR NOT has_schema_privilege(current_user, 'pgboss', 'USAGE') THEN
    RAISE EXCEPTION
      'Recall database role cannot access recall or pgboss schema';
  END IF;
END
$$;

SELECT COUNT(*) AS orphaned_member_identities
FROM recall."Member" member
LEFT JOIN public.users main_user
  ON main_user.id::text = member."rightTokenUserId"
  AND main_user.deleted_at IS NULL
WHERE member."rightTokenUserId" IS NOT NULL
  AND main_user.id IS NULL;

SELECT
  (SELECT COUNT(*) FROM public.users WHERE deleted_at IS NULL)
    AS active_main_users,
  (
    SELECT COUNT(*)
    FROM recall."UserProfile"
    WHERE "sourceDeletedAt" IS NULL
  )
    AS recall_state_rows,
  (
    SELECT COUNT(*)
    FROM recall."UserProfile" state
    LEFT JOIN public.users main_user
      ON main_user.id::text = state."externalUserId"
      AND main_user.deleted_at IS NULL
    WHERE state."sourceDeletedAt" IS NULL
      AND main_user.id IS NULL
  ) AS orphaned_recall_state_rows;
