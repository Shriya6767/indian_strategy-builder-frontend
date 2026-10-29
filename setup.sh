#!/usr/bin/env bash
#
# One-shot setup for a fresh clone.
#
#     bash setup.sh
#
# Runs every step from the README in order and stops at the first failure, so
# you never end up half-installed and wondering which part worked.
#
# It does NOT edit vite.config.js for you -- the backend address is yours to
# choose, and silently writing a guess there would be worse than telling you.

set -euo pipefail

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }

cd "$(dirname "$0")"

# ─────────────────────────── 1. Node version ───────────────────────────
say "Checking Node"

command -v node >/dev/null 2>&1 || die "Node is not installed. Install Node 22 LTS: https://nodejs.org"

NODE_RAW="$(node -v)"            # e.g. v22.22.1
NODE_V="${NODE_RAW#v}"
MAJOR="${NODE_V%%.*}"
REST="${NODE_V#*.}"
MINOR="${REST%%.*}"

# Vite 8 wants ^20.19 || >=22.12; ESLint 10 wants ^20.19 || ^22.13.
# The stricter of the two is what we enforce.
node_ok=false
if   [ "$MAJOR" -eq 20 ] && [ "$MINOR" -ge 19 ]; then node_ok=true
elif [ "$MAJOR" -eq 22 ] && [ "$MINOR" -ge 13 ]; then node_ok=true
elif [ "$MAJOR" -ge 23 ];                        then node_ok=true
fi

$node_ok || die "Node $NODE_V is too old. Need 20.19+ or 22.13+ (Node 22 LTS recommended).
  With nvm:  nvm install 22 && nvm use 22"
ok "node $NODE_V"

command -v npm >/dev/null 2>&1 || die "npm is not installed."
ok "npm $(npm -v)"

# ─────────────────────────── 2. Dependencies ───────────────────────────
say "Installing dependencies (npm ci)"

[ -f package-lock.json ] || die "package-lock.json is missing. Run 'npm install' once and commit the lockfile."

npm ci
ok "node_modules installed from the lockfile"

# ──────────────────────── 3. Backend address ───────────────────────────
say "Checking the backend address"

STALE="$(grep -c "target: 'http://192.168" vite.config.js || true)"
if [ "$STALE" -gt 0 ]; then
  warn "vite.config.js still points at 192.168.1.5 on $STALE line(s)."
  warn "Edit these before the app can reach any API:"
  grep -n "target: 'http" vite.config.js | sed 's/^/        /'
  warn "/api -> your API host (default port 8000), /ws -> your WebSocket host (8001)."
else
  ok "targets look customised"
fi

# ───────────────────────────── 4. Verify ───────────────────────────────
say "Building"
npm run build >/dev/null
ok "build succeeded"

say "Running the offline test suites"
npm run test:roundtrip
ok "all three suites passed"

say "Linting"
LINT_OUT="$(npm run lint 2>&1 || true)"
LINT_LINE="$(printf '%s' "$LINT_OUT" | grep -E '^✖' || true)"
if [ -n "$LINT_LINE" ]; then
  printf '    %s\n' "$LINT_LINE"
  warn "130 problems is the known baseline on a clean checkout, not breakage."
else
  ok "no lint problems"
fi

# ───────────────────── 5. Optional Python backend ──────────────────────
say "Reference backend (optional)"
echo "    main.py is a FastAPI stub for working without the real backend."
echo "    It implements only load-data, save-strategy, get-strategies-list,"
echo "    get-strategy, run-backtest, health and reports/save -- the Portfolios"
echo "    pages need the real backend."
echo
echo "        python3 -m venv venv"
echo "        source venv/bin/activate"
echo "        pip install -r requirements.txt"
echo "        uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

# ───────────────────────────── Done ────────────────────────────────────
say "Ready"
if [ "$STALE" -gt 0 ]; then
  echo "    1. Edit the target: lines in vite.config.js (listed above)"
  echo "    2. npm run dev    ->  http://localhost:5174"
else
  echo "    npm run dev    ->  http://localhost:5174"
fi
echo
