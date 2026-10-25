#!/usr/bin/env bash
# Puts a build from scripts/cpanel-build.sh live on the cPanel server (README, "Hosting on cPanel").
# The account has no shell, so this is file operations over SFTP only: the release is uploaded to
# ~/dashboard-releases/<commit>, ~/dashboard-app is pointed at it, and a fresh tmp/restart.txt makes Passenger restart.
# The web root's .htaccess goes up every time, matching the build: a preview with test logins (AUTH_MODE=mock) gets
# deploy/cpanel/htaccess-preview, which asks for the password in ~/.htpasswds/dashboard.fakhernco.com/passwd first.
# The previous release stays on the server, so going back is: scripts/cpanel-deploy.sh <its commit>.
# Usage: scripts/cpanel-deploy.sh [--settings] [commit]
#   --settings  also uploads .env.cpanel (or the file named by CPANEL_SETTINGS) as ~/dashboard-shared/settings.env,
#               readable only by the account
#   commit      a folder in dist/cpanel (default: the newest build)
set -euo pipefail

HOST=${CPANEL_SFTP_HOST:-fakher} # an entry in ~/.ssh/config
SETTINGS_FILE=$(realpath "${CPANEL_SETTINGS:-$(git rev-parse --show-toplevel)/.env.cpanel}" 2>/dev/null || true)
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

SETTINGS=false
if [ "${1:-}" = "--settings" ]; then
  SETTINGS=true
  shift
fi
SHA=${1:-$(ls -t dist/cpanel 2>/dev/null | head -1)}
[ -n "$SHA" ] && [ -f "dist/cpanel/$SHA/app.cjs" ] || { echo "No build in dist/cpanel/${SHA:-…}: run scripts/cpanel-build.sh first." >&2; exit 1; }
case "$(cat "dist/cpanel/$SHA/AUTH_MODE" 2>/dev/null)" in
  clerk) HTACCESS=deploy/cpanel/htaccess ;;
  mock) HTACCESS=deploy/cpanel/htaccess-preview ;;
  *) echo "dist/cpanel/$SHA has no AUTH_MODE: rebuild it with scripts/cpanel-build.sh." >&2; exit 1 ;;
esac
if $SETTINGS && [ ! -f "$SETTINGS_FILE" ]; then
  echo "Missing ${CPANEL_SETTINGS:-.env.cpanel}." >&2
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
  # The password goes up before a preview is live, and comes off only once a Clerk build is.
  [ "$HTACCESS" = deploy/cpanel/htaccess-preview ] && echo "put $HTACCESS dashboard.fakhernco.com/.htaccess"
  echo "-rm dashboard-app"
  echo "ln -s /home/fakhernco/dashboard-releases/$SHA dashboard-app"
  [ "$HTACCESS" = deploy/cpanel/htaccess ] && echo "put $HTACCESS dashboard.fakhernco.com/.htaccess"
  echo "put $RESTART dashboard-releases/$SHA/tmp/restart.txt"
} | sftp -q -o BatchMode=yes -b - "$HOST" > /dev/null

echo "Release $SHA is live: the app restarts on its next request."
