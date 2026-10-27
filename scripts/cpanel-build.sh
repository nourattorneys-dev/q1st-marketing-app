#!/usr/bin/env bash
# Builds the dashboard for the cPanel server (README, "Hosting on cPanel"): Next's standalone server, made from the
# committed code in a clean clone with a flat node_modules, since pnpm's links don't survive an SFTP upload.
# Reads AUTH_MODE, ENGINE_MODE, TWO_FACTOR and ALLOW_TEST_LOGINS from .env.cpanel, or
# the file named by CPANEL_SETTINGS (the build bakes them in); nothing secret goes into the build.
# AUTH_MODE=mock makes a preview with test logins, which scripts/cpanel-deploy.sh always puts behind a password.
# Usage: scripts/cpanel-build.sh   → dist/cpanel/<commit>/ (or <commit>-preview/)
set -euo pipefail

# Resolved before any cd: the build runs in a clone elsewhere.
SETTINGS=$(realpath "${CPANEL_SETTINGS:-$(git rev-parse --show-toplevel)/.env.cpanel}" 2>/dev/null || true)
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit your changes first: the build uses the committed code." >&2
  exit 1
fi
[ -f "$SETTINGS" ] || { echo "Missing ${CPANEL_SETTINGS:-.env.cpanel} (README, Hosting on cPanel)." >&2; exit 1; }
setting() { sed -n "s/^$1=//p" "$SETTINGS" | tail -1; }
AUTH=$(setting AUTH_MODE)
case "$AUTH" in
  password)
    # Test logins would show reset and invitation links on a page anyone can open.
    [ "$(setting ALLOW_TEST_LOGINS)" != "1" ] || { echo "Remove ALLOW_TEST_LOGINS=1 from $SETTINGS: it's for previews (AUTH_MODE=mock) only." >&2; exit 1; }
    SUFFIX=""
    ;;
  mock)
    [ "$(setting ALLOW_TEST_LOGINS)" = "1" ] || { echo "A preview with test logins needs ALLOW_TEST_LOGINS=1 in $SETTINGS." >&2; exit 1; }
    SUFFIX="-preview"
    ;;
  *)
    echo "AUTH_MODE must be password or mock in $SETTINGS." >&2
    exit 1
    ;;
esac

SHA=$(git rev-parse --short HEAD)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
git clone --quiet "$ROOT" "$WORK/app"
cd "$WORK/app"
git checkout --quiet "$SHA"
pnpm install --frozen-lockfile --config.node-linker=hoisted --reporter=silent
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone \
  AUTH_MODE="$AUTH" ALLOW_TEST_LOGINS="$(setting ALLOW_TEST_LOGINS)" ENGINE_MODE="$(setting ENGINE_MODE)" TWO_FACTOR="$(setting TWO_FACTOR)" \
  pnpm build

OUT="$ROOT/dist/cpanel/$SHA$SUFFIX"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R .next/standalone/. "$OUT/"
cp -R .next/static "$OUT/.next/static"
cp -R public "$OUT/public"
cp deploy/cpanel/app.cjs "$OUT/app.cjs"
# The app creates and updates its MySQL tables from these on first use (src/lib/db/mysql.ts). Next's file tracing
# usually brings them already; copying makes it certain, and the check stops a release that would lack them.
mkdir -p "$OUT/drizzle"
cp -R drizzle/. "$OUT/drizzle/"
[ -f "$OUT/drizzle/meta/_journal.json" ] || { echo "The release has no drizzle/meta/_journal.json." >&2; exit 1; }
mkdir -p "$OUT/tmp"
echo "$SHA" > "$OUT/REVISION"
echo "$AUTH" > "$OUT/AUTH_MODE" # scripts/cpanel-deploy.sh picks the web root's .htaccess from it
# The standalone copy brings no .env files; make sure, as the old CMS leaked one.
find "$OUT" -name ".env*" -delete
# Next brings sharp for next/image, which the dashboard doesn't use; its macOS binary couldn't load on the server.
rm -rf "$OUT/node_modules/sharp" "$OUT/node_modules/@img"

# The upload can't carry links, and the server can't load macOS-only native modules.
if [ -n "$(find "$OUT" -type l | head -1)" ]; then
  echo "The build contains symbolic links; the upload would break them:" >&2
  find "$OUT" -type l | head >&2
  exit 1
fi
if [ -n "$(find "$OUT" -name '*.node' | head -1)" ]; then
  echo "The build contains native modules built for this Mac, which won't load on the server:" >&2
  find "$OUT" -name '*.node' >&2
  exit 1
fi
echo "Built $OUT ($(du -sh "$OUT" | cut -f1), $(find "$OUT" -type f | wc -l | tr -d ' ') files)"
