#!/usr/bin/env bash
# Sets Surka's secrets on the Vercel project linked to this folder.
# Run it yourself, once:  npm run setup:vercel
# It generates fresh random values and shows your operator password once.
set -euo pipefail

command -v vercel >/dev/null || { echo "Install the Vercel CLI first: npm i -g vercel"; exit 1; }
[ -f .vercel/project.json ] || { echo "Link this folder to your Vercel project first: vercel link"; exit 1; }

set_env() {
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
  echo "Set $1"
}

password="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
set_env ADMIN_PASSWORD "$password"
set_env SESSION_SECRET "$(openssl rand -hex 32)"
set_env CRON_SECRET "$(openssl rand -hex 24)"

echo
echo "Your operator password. Save it in your password manager now; it isn't shown again:"
echo "  $password"
echo
echo "Redeploy so the new values take effect: vercel deploy --prod"
