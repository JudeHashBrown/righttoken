#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || -z "${1}" || "${1}" == "/" ]]; then
  echo "usage: $0 /absolute/path/to/recall-backups" >&2
  exit 2
fi

backup_dir="${1}"
if [[ "${backup_dir}" != /* ]]; then
  echo "backup directory must be an absolute path" >&2
  exit 2
fi

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
base_env="${deploy_dir}/.env"
recall_env="${deploy_dir}/recall.env"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="${backup_dir}/righttoken-recall-${timestamp}.dump"

if [[ ! -f "${base_env}" || ! -f "${recall_env}" ]]; then
  echo "deploy/.env and deploy/recall.env are required" >&2
  exit 1
fi

umask 077
mkdir -p "${backup_dir}"

docker compose \
  --env-file "${base_env}" \
  --env-file "${recall_env}" \
  -f "${deploy_dir}/docker-compose.yml" \
  -f "${deploy_dir}/docker-compose.recall.yml" \
  exec -T postgres \
  sh -c 'pg_dump --format=custom --no-owner --schema=recall --schema=pgboss --username="$POSTGRES_USER" "$POSTGRES_DB"' \
  > "${backup_path}"

find "${backup_dir}" \
  -type f \
  -name 'righttoken-recall-*.dump' \
  -mtime +14 \
  -delete

echo "${backup_path}"
