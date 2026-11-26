#!/usr/bin/env bash
# Frontend load test: build the demo app (fake backend inside), serve it, run k6, stop the server.
#   pnpm load-test                  # full 30 min
#   DURATION_MIN=5 pnpm load-test   # short run
# While it runs: live dashboard at http://localhost:5665
# After: load-tests/results/ has the dashboard report (k6-fe-dashboard-*.html), a second HTML
# report, the JSON and the text summary.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${K6_BROWSER_EXECUTABLE_PATH:-$HOME/.cache/ms-playwright/chromium-1140/chrome-linux/chrome}"
if [ ! -x "$CHROME" ]; then
  echo "No Chromium at $CHROME. Install one (npx playwright install chromium) or set K6_BROWSER_EXECUTABLE_PATH." >&2
  exit 1
fi

pnpm -s build:demo
# own process group, so stopping it also stops the vite process pnpm starts
setsid pnpm -s preview:demo >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill -- -$PREVIEW 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -sf -o /dev/null http://localhost:4173/ && break
  sleep 0.5
done

mkdir -p load-tests/results
STAMP=$(date -u +%Y-%m-%dT%H-%M-%S)
K6_BROWSER_EXECUTABLE_PATH="$CHROME" \
K6_BROWSER_HEADLESS=true \
K6_WEB_DASHBOARD=true \
K6_WEB_DASHBOARD_PERIOD=10s \
K6_WEB_DASHBOARD_EXPORT="load-tests/results/k6-fe-dashboard-$STAMP.html" \
  k6 run load-tests/main.js
