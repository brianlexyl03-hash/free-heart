#!/bin/sh
# Pin the vendored MovieBox-TUI source to a reviewed upstream release.
# Run from the repository root on a machine with network access.
set -eu
REPO=https://github.com/mesamirh/MovieBox-Tui
REF=v0.1.29
DEST=third_party/moviebox-tui/src

if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch --tags --prune origin
  git -C "$DEST" checkout --detach "$REF"
else
  mkdir -p "$(dirname "$DEST")"
  git clone --depth 1 --branch "$REF" "$REPO" "$DEST"
fi

HASH=$(git -C "$DEST" rev-parse HEAD)
for f in LICENSE-MIT LICENSE-APACHE NOTICE; do
  [ ! -f "$DEST/$f" ] || cp "$DEST/$f" "./$f"
done
printf '# Provenance\n\nUpstream: %s\nRelease: %s\nCommit: %s\nRecorded: %s\n' \
  "$REPO" "$REF" "$HASH" "$(date -u +%F)" > PROVENANCE.md
echo "Pinned $REF ($HASH)"
