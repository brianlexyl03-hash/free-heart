#!/bin/sh
set -e
for f in web/app.js web/player.js web/maturity.js; do node --input-type=module --check < "$f"; done
node --check web/sw.js && echo "syntax OK"
rm -f apply-18plus.sh
git add -A && git commit -m "18+ labels, blurred posters, prior-notice gate, hide filter" && git push
