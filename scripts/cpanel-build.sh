#!/usr/bin/env bash
# Builds the dashboard for the cPanel server (README, "Hosting on cPanel"): Next's standalone server, made from the
# committed code in a clean clone with a flat node_modules, since pnpm's links don't survive an SFTP upload.
# Reads AUTH_MODE, ENGINE_MODE, TWO_FACTOR and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from .env.cpanel, or the file named by
# CPANEL_SETTINGS (the build bakes them in); nothing secret goes into the build.
# Usage: scripts/cpanel-build.sh   → dist/cpanel/<commit>/
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit your changes first: the build uses the committed code." >&2
  exit 1
fi
SETTINGS=${CPANEL_SETTINGS:-$ROOT/.env.cpanel}
[ -f "$SETTINGS" ] || { echo "Missing $SETTINGS (README, Hosting on cPanel)." >&2; exit 1; }
setting() { sed -n "s/^$1=//p" "$SETTINGS" | tail -1; }
PUBLISHABLE_KEY=$(setting NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
AUTH=$(setting AUTH_MODE)
[ "$AUTH" = "clerk" ] || { echo "AUTH_MODE must be clerk in $SETTINGS: test logins never go on a server." >&2; exit 1; }
[ -n "$PUBLISHABLE_KEY" ] || { echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is empty in $SETTINGS." >&2; exit 1; }

SHA=$(git rev-parse --short HEAD)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
git clone --quiet "$ROOT" "$WORK/app"
cd "$WORK/app"
git checkout --quiet "$SHA"
pnpm install --frozen-lockfile --config.node-linker=hoisted --reporter=silent
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone \
  AUTH_MODE=clerk ENGINE_MODE="$(setting ENGINE_MODE)" TWO_FACTOR="$(setting TWO_FACTOR)" \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \
  pnpm build

OUT="$ROOT/dist/cpanel/$SHA"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R .next/standalone/. "$OUT/"
cp -R .next/static "$OUT/.next/static"
cp -R public "$OUT/public"
cp deploy/cpanel/app.cjs "$OUT/app.cjs"
mkdir -p "$OUT/tmp"
echo "$SHA" > "$OUT/REVISION"
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
