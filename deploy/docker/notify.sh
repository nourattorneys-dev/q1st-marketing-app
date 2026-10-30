#!/usr/bin/env bash
# Sends the notification emails that are due (systemd timer q1st-app-notify, every 15 minutes).
set -euo pipefail
setting() { sed -n "s/^$1=//p" /opt/q1st-app/app.env | tail -1 | sed "s/^'//; s/'$//"; }
PORT=$(setting APP_PORT); PORT=${PORT:-3200}
curl -fsS --max-time 120 -H "Authorization: Bearer $(setting CRON_SECRET)" "http://127.0.0.1:$PORT/api/cron/notifications"
echo
