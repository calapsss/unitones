#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  python3 -c "import secrets; from pathlib import Path; Path('.env').write_text('SESSION_SECRET='+secrets.token_urlsafe(48)+'\n')"
fi
docker compose up -d --build
printf 'Unit Readiness: http://127.0.0.1:3200\nAPI docs: http://127.0.0.1:8200/docs\n'
