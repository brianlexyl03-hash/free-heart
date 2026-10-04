#!/bin/sh
# Pins upstream, copies its license files, records the commit. Run on a machine with network.
set -e
REPO=https://github.com/mesamirh/MovieBox-Tui
DEST=third_party/moviebox-tui/src
[ -d "$DEST/.git" ] || git clone "$REPO" "$DEST"
HASH=$(git -C "$DEST" rev-parse HEAD)
for f in LICENSE-MIT LICENSE-APACHE NOTICE; do [ -f "$DEST/$f" ] && cp "$DEST/$f" "./$f"; done
printf '# Provenance\n\nUpstream: %s\nCommit: %s\nRecorded: %s\n' "$REPO" "$HASH" "$(date -u +%F)" > PROVENANCE.md
echo "Pinned $HASH"
