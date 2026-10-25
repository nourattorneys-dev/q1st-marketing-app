#!/usr/bin/env bash
# Puts a build from scripts/cpanel-build.sh live on the cPanel server (README, "Hosting on cPanel").
# The account has no shell, so this is file operations over SFTP only: the release is uploaded to
# ~/dashboard-releases/<commit>, ~/dashboard-app is pointed at it, and a fresh tmp/restart.txt makes Passenger restart.
# The previous release stays on the server, so going back is: scripts/cpanel-deploy.sh <its commit>.
# Usage: scripts/cpanel-deploy.sh [--settings] [commit]
#   --settings  also uploads .env.cpanel (or the file named by CPANEL_SETTINGS) as ~/dashboard-shared/settings.env,
#               readable only by the account
#   commit      a folder in dist/cpanel (default: the newest build)
set -euo pipefail

HOST=${CPANEL_SFTP_HOST:-fakher} # an entry in ~/.ssh/config
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

SETTINGS=false
SETTINGS_FILE=${CPANEL_SETTINGS:-.env.cpanel}
if [ "${1:-}" = "--settings" ]; then
  SETTINGS=true
  shift
fi
SHA=${1:-$(ls -t dist/cpanel 2>/dev/null | head -1)}
[ -n "$SHA" ] && [ -f "dist/cpanel/$SHA/app.cjs" ] || { echo "No build in dist/cpanel/${SHA:-…}: run scripts/cpanel-build.sh first." >&2; exit 1; }
if $SETTINGS && [ ! -f "$SETTINGS_FILE" ]; then
  echo "Missing $SETTINGS_FILE." >&2
  exit 1
fi

RESTART=$(mktemp)
trap 'rm -f "$RESTART"' EXIT
date -u +%FT%TZ > "$RESTART"

{
  echo "-mkdir dashboard-releases"
  echo "-mkdir dashboard-shared"
  echo "chmod 700 dashboard-shared"
  echo "put -r dist/cpanel/$SHA dashboard-releases"
  if $SETTINGS; then
    echo "put $SETTINGS_FILE dashboard-shared/settings.env"
    echo "chmod 600 dashboard-shared/settings.env"
  fi
  echo "-rm dashboard-app"
  echo "ln -s /home/fakhernco/dashboard-releases/$SHA dashboard-app"
  echo "put $RESTART dashboard-releases/$SHA/tmp/restart.txt"
} | sftp -q -o BatchMode=yes -b - "$HOST" > /dev/null

echo "Release $SHA is live: the app restarts on its next request."
