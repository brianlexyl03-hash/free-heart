#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$HOME/.cargo/env" 2>/dev/null || true

CORE_BIND=${CORE_BIND:-127.0.0.1:7070}
export CORE_URL=${CORE_URL:-http://$CORE_BIND}
export HOST=${HOST:-0.0.0.0}
export PORT=${PORT:-3000}

if [ "${SKIP_CORE_BUILD:-0}" != "1" ]; then
  (cd "$ROOT/core" && cargo build --release)
fi

"$ROOT/core/target/release/free-core" >"${TMPDIR:-/tmp}/free-core.$$.log" 2>&1 &
CORE_PID=$!
cleanup() { kill "$CORE_PID" 2>/dev/null || true; wait "$CORE_PID" 2>/dev/null || true; }
trap cleanup INT TERM EXIT

ready=0
for _ in $(seq 1 60); do
  if curl -fsS "$CORE_URL/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.25
done
if [ "$ready" -ne 1 ]; then
  cat "${TMPDIR:-/tmp}/free-core.$$.log" >&2 || true
  echo "free-core did not become ready" >&2
  exit 1
fi

cd "$ROOT/server"
exec npm start
