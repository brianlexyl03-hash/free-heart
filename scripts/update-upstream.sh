#!/usr/bin/env bash
# Update the vendored MovieBox-Tui copy to the latest upstream commit.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK="$HOME/.mbt"
VENDOR="third_party/moviebox-tui/src"

rm -rf "$WORK"; mkdir -p "$WORK"
git clone -q https://github.com/mesamirh/MovieBox-Tui "$WORK/up"

# 1. Compare the pinned commit with our vendored copy, so we never overwrite hand edits.
OLD=$(grep -i '^Commit' PROVENANCE.md | awk '{print $2}')
echo "Old pinned commit: $OLD"
git -C "$WORK/up" checkout -q "$OLD"
CHANGED=$(diff -rq --exclude=.git --exclude=target "$WORK/up" "$VENDOR" | grep -E 'differ$|^Only in third_party' || true)
if [ -n "$CHANGED" ]; then
  echo "STOP: local changes found, not updating:"; echo "$CHANGED" | head -20; exit 1
fi

# 2. Move to the newest upstream and copy over the files we already vendor.
git -C "$WORK/up" checkout -q main 2>/dev/null || git -C "$WORK/up" checkout -q master
NEW=$(git -C "$WORK/up" rev-parse HEAD)
echo "New commit: $NEW"
for f in $(ls -A "$VENDOR"); do
  if [ -e "$WORK/up/$f" ]; then rm -rf "$VENDOR/$f"; cp -a "$WORK/up/$f" "$VENDOR/$f"; fi
done

# 3. Record it and commit.
sed -i "s/^Commit:.*/Commit: $NEW/; s/^Recorded:.*/Recorded: $(date +%F)/" PROVENANCE.md
git add -A third_party PROVENANCE.md
git commit -q -m "update vendored MovieBox-Tui to $NEW"
echo "DONE: committed locally."
