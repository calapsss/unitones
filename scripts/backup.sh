#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p .local/backups
stamp=$(date +%Y%m%d-%H%M%S)
docker compose exec -T db pg_dump -U readiness -Fc readiness > ".local/backups/readiness-$stamp.dump"
printf 'Backup saved in .local/backups/readiness-%s.dump\n' "$stamp"
