#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${LEGACY_RECALL_DATABASE_URL:-}" || -z "${RIGHTTOKEN_DATABASE_OWNER_URL:-}" ]]; then
  echo "LEGACY_RECALL_DATABASE_URL and RIGHTTOKEN_DATABASE_OWNER_URL are required" >&2
  exit 2
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT
legacy_dump="${work_dir}/legacy-recall-data.sql"
mapped_dump="${work_dir}/shared-recall-data.sql"
queue_dump="${work_dir}/legacy-pgboss.sql"
combined_dump="${work_dir}/shared-recall-and-pgboss.sql"

tables=(
  Member
  SsoTicketRedemption
  Session
  UserProfile
  UserEvent
  SegmentHistory
  SegmentOverride
  UserNote
  AutomationRuleVersion
  SegmentRecalculationRun
  AssignmentRule
  AssignmentRecalculationRun
  LocationAttributionRule
  LocationRecalculationRun
  RecallTask
  TaskActivity
  AuditLog
  LoginAttempt
  Invitation
  RecoveryCode
  Mailbox
  MailTemplate
  MailThread
  MailMessage
  SuppressionEntry
  NotificationIntent
  IntegrationCredential
)

table_args=()
for table in "${tables[@]}"; do
  table_args+=(--table="public.\"${table}\"")
done

psql "${RIGHTTOKEN_DATABASE_OWNER_URL}" \
  --set=ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  candidate record;
  contains_rows boolean;
BEGIN
  FOR candidate IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'recall'
      AND tablename <> '_prisma_migrations'
      AND tablename <> 'LocationAttributionRule'
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM recall.%I LIMIT 1)',
      candidate.tablename
    )
    INTO contains_rows;
    IF contains_rows THEN
      RAISE EXCEPTION
        'Target recall schema is not empty (table %)',
        candidate.tablename;
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'pgboss'
  ) THEN
    RAISE EXCEPTION
      'Target pgboss schema already contains queue tables';
  END IF;
END
$$;
SQL

pg_dump "${LEGACY_RECALL_DATABASE_URL}" \
  --data-only \
  --column-inserts \
  --no-owner \
  --no-privileges \
  "${table_args[@]}" \
  > "${legacy_dump}"

pg_dump "${LEGACY_RECALL_DATABASE_URL}" \
  --schema=pgboss \
  --no-owner \
  --no-privileges \
  > "${queue_dump}"

{
  echo 'DELETE FROM recall."LocationAttributionRule";'
  sed -E \
    's/^INSERT INTO public\./INSERT INTO recall./' \
    "${legacy_dump}"
  echo 'DROP SCHEMA IF EXISTS pgboss CASCADE;'
  cat "${queue_dump}"
} > "${combined_dump}"

psql "${RIGHTTOKEN_DATABASE_OWNER_URL}" \
  --set=ON_ERROR_STOP=1 \
  --single-transaction \
  --file="${combined_dump}"

echo "Legacy recall state and pgboss queue migrated into the shared database."
