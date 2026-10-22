#!/usr/bin/env bash
# 004_probe.sh — read-only checks against production after running 004.
# Prints only HTTP status and row counts; never prints keys, tokens or row contents.
# Usage: bash supabase/004_probe.sh            (anon checks only)
#        bash supabase/004_probe.sh --owner    (also signs in; asks email/password, input hidden)
set -euo pipefail
cd "$(dirname "$0")/.."

URL=$(sed -n "s/^const SUPABASE_URL = '\(.*\)';$/\1/p" index.html)
ANON=$(sed -n "s/^const SUPABASE_KEY = '\(.*\)';$/\1/p" index.html)
[ -n "$URL" ] && [ -n "$ANON" ] || { echo "Could not read SUPABASE_URL/KEY from index.html"; exit 1; }
TABLES="dishes selected_menu menu_history settings menus_cerrados"

probe() { # $1 label, $2 bearer, $3 table
  local out code body
  out=$(curl -s -w '\n%{http_code}' "$URL/rest/v1/$3?select=id" \
    -H "apikey: $ANON" -H "Authorization: Bearer $2" -H 'Range: 0-999')
  code=$(tail -n1 <<<"$out"); body=$(sed '$d' <<<"$out")
  if [ "$code" = 200 ]; then
    echo "$1 $3: HTTP 200, rows=$(grep -o '"id"' <<<"$body" | wc -l | tr -d ' ')"
  else
    echo "$1 $3: HTTP $code"
  fi
}

echo "== anon (expected: HTTP 401/403 for every table)"
for t in $TABLES; do probe anon "$ANON" "$t"; done

echo "== anon write permission (expected: HTTP 401/403; before 004 it is 204)"
# Filter matches no row, so this never changes data even while anon still has write access.
curl -s -o /dev/null -w 'anon delete dishes (no-match filter): HTTP %{http_code}\n' -X DELETE \
  "$URL/rest/v1/dishes?id=eq.__probe_no_such_row__" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

echo "== settings.gemini_api_key column (expected: HTTP 400/401, column gone or no access)"
curl -s -o /dev/null -w 'anon settings.gemini_api_key: HTTP %{http_code}\n' \
  "$URL/rest/v1/settings?select=gemini_api_key" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

echo "== sign-up (expected: disable_signup true after you switch it off in the dashboard)"
curl -s "$URL/auth/v1/settings" -H "apikey: $ANON" | grep -o '"disable_signup":[a-z]*' || echo "unknown"

if [ "${1:-}" = "--owner" ]; then
  read -r -p "Owner email: " EMAIL
  read -r -s -p "Password (hidden): " PASS; echo
  TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
    -d "$(EMAIL="$EMAIL" PASS="$PASS" node -e 'process.stdout.write(JSON.stringify({email:process.env.EMAIL,password:process.env.PASS}))')" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch{}})')
  unset PASS
  [ -n "$TOKEN" ] || { echo "Sign-in failed"; exit 1; }
  echo "== owner (expected: HTTP 200; dishes ~635, menus_cerrados ~23, settings 1, selected_menu 1)"
  for t in $TABLES; do probe owner "$TOKEN" "$t"; done
  unset TOKEN
fi
