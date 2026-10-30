#!/usr/bin/env bash
# Daily backup of the hosted app's database (systemd timer q1st-app-backup). Keeps BACKUP_KEEP_DAYS days (app.env).
set -euo pipefail
setting() { sed -n "s/^$1=//p" /opt/q1st-app/app.env | tail -1 | sed "s/^'//; s/'$//"; }
KEEP=$(setting BACKUP_KEEP_DAYS); KEEP=${KEEP:-14}
DB=$(setting DATABASE_URL | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
mkdir -p /opt/q1st-app/backups
OUT=/opt/q1st-app/backups/$DB-$(date +%Y%m%d-%H%M).sql.gz
docker exec nour-postgres pg_dump -U nour_user --no-owner "$DB" | gzip > "$OUT.part" && mv "$OUT.part" "$OUT"
find /opt/q1st-app/backups -name "$DB-*.sql.gz" -mtime +"$KEEP" -delete
echo "Backup $OUT ($(du -h "$OUT" | cut -f1))"
