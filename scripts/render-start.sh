#!/bin/sh
# Start the web server immediately and keep the Rust core alive in the background.
# (Old version waited only ~15 s for the core and then killed the whole container -> Render showed 502.)
set -u

APP_DIR=${APP_DIR:-/app}
CORE_BIND=${CORE_BIND:-127.0.0.1:7070}
export CORE_BIND
export CORE_URL=${CORE_URL:-http://$CORE_BIND}
export HOST=${HOST:-0.0.0.0}
export PORT=${PORT:-3000}
# keep Node small so core + node fit in the free plan's 512 MB
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${NODE_HEAP_MB:-190}"

(
  while true; do
    "$APP_DIR/core/free-core" 2>&1 | sed -u 's/^/[core] /'
    echo "[start] free-core stopped, restarting in 2s" >&2
    sleep 2
  done
) &

cd "$APP_DIR/server"
exec node src/index.js
