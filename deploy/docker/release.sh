#!/usr/bin/env bash
# One release of the hosted app, run ON THE SERVER (README, "Hosting on the server").
# Usage: deploy/docker/release.sh /tmp/q1st-app-<rev>.tgz
# Builds the image from the source archive, starts it, and waits until it answers; the previous image stays for rollback.
set -euo pipefail
ARCHIVE=${1:?give the source archive made on the Mac (git archive)}
REV=$(basename "$ARCHIVE" .tgz | sed 's/^q1st-app-//')
[ -f /opt/q1st-app/app.env ] || { echo "Missing /opt/q1st-app/app.env (one-time setup)." >&2; exit 1; }
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"
docker build -t "q1st-app:$REV" --build-arg REVISION="$REV" "$WORK"
mkdir -p /opt/q1st-app/release
cp "$WORK/deploy/docker/compose.yml" /opt/q1st-app/release/compose.yml
PREV=$(cat /opt/q1st-app/release/REVISION 2>/dev/null || echo none)
PORT=$(sed -n 's/^APP_PORT=//p' /opt/q1st-app/app.env | tail -1)
PORT=${PORT:-3200}
REVISION=$REV APP_PORT=$PORT docker compose -f /opt/q1st-app/release/compose.yml up -d
for i in $(seq 1 60); do
  if curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    echo "$REV" > /opt/q1st-app/release/REVISION
    echo "Release $REV is up (previous: $PREV)."
    echo "Roll back: REVISION=$PREV APP_PORT=$PORT docker compose -f /opt/q1st-app/release/compose.yml up -d"
    exit 0
  fi
  sleep 2
done
echo "Release $REV did not answer on /api/health within 2 minutes. Logs:" >&2
docker compose -f /opt/q1st-app/release/compose.yml logs --tail 50 >&2
exit 1
