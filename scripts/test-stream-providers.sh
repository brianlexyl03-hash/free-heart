#!/bin/sh
set -eu

BASE_URL=${BASE_URL:-https://free-heart.de.deplexo.com}
BASE_URL=${BASE_URL%/}
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

printf '%s\n' '[1/4] Checking health...'
curl -fsS --max-time 15 "$BASE_URL/api/health" -o "$TMP_DIR/health.json"
node -e 'const x=require(process.argv[1]); if(!x.ok) process.exit(1); console.log(JSON.stringify(x))' "$TMP_DIR/health.json"

printf '%s\n' '[2/4] Searching for the open-licensed playback test item...'
curl -fsS --max-time 20 --get --data-urlencode 'q=Big Buck Bunny' --data-urlencode 'page=1' "$BASE_URL/api/search" -o "$TMP_DIR/search.json"
ID=$(node -e 'const x=require(process.argv[1]); const i=(x.results||[]).find(r=>String(r.id)==="addons:movie:tt1254207"); if(!i) process.exit(2); console.log(i.id)' "$TMP_DIR/search.json")
printf 'Found item: %s\n' "$ID"

printf '%s\n' '[3/4] Resolving its stream...'
node -e 'process.stdout.write(JSON.stringify({id:process.argv[1]}))' "$ID" > "$TMP_DIR/request.json"
curl -fsS --max-time 25 -H 'content-type: application/json' --data-binary "@$TMP_DIR/request.json" "$BASE_URL/api/resolve" -o "$TMP_DIR/resolve.json"
node -e 'const x=require(process.argv[1]); const a=(x.candidates||[]).map(c=>c.stream).filter(s=>typeof s==="string"&&s.startsWith("/api/stream/")); if(x.stream&&x.stream.startsWith("/api/stream/")&&!a.includes(x.stream)) a.unshift(x.stream); if(!a.length) process.exit(2); console.log([...new Set(a)].join("\n"))' "$TMP_DIR/resolve.json" > "$TMP_DIR/streams.txt"
printf 'Found %s candidate route(s).\n' "$(wc -l < "$TMP_DIR/streams.txt" | tr -d ' ')"

printf '%s\n' '[4/4] Checking byte-range streaming through each candidate...'
while IFS= read -r STREAM; do
  [ -n "$STREAM" ] || continue
  STATUS=$(curl -sS --max-time 25 -H 'Range: bytes=0-65535' -o "$TMP_DIR/range.bin" -w '%{http_code}' "$BASE_URL$STREAM" || true)
  BYTES=$(wc -c < "$TMP_DIR/range.bin" | tr -d ' ')
  printf '%s -> HTTP %s, received %s bytes\n' "$STREAM" "$STATUS" "$BYTES"
  if [ "$STATUS" = '206' ] && [ "$BYTES" -gt 0 ]; then
    printf '%s\n' 'Smoke test passed for at least one candidate. Full playback and >20-second playback still need a browser/device test.'
    exit 0
  fi
done < "$TMP_DIR/streams.txt"
echo 'No candidate returned a non-empty HTTP 206 byte-range response.' >&2
exit 1
