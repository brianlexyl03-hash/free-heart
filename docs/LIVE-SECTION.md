# free❤️‍🔥 Live Match Center (v3)

Route: `#/live`. Isolated from movies, player, downloads and the owner controls — the installer only adds a nav link,
a stylesheet, two script tags, a one-line route guard in `app.js`, and one route registration in the server.

## What it does

* **Matchday dashboard** — scores for ~26 competitions (edit `web/live-config.js`), grouped by league.
* **Day navigation** — yesterday … next week plus a date picker. "Today" is *your* local day in every time zone
  (the app asks for a ±1 day window and filters by your local kickoff date).
* **Tabs** — All · Live · Upcoming · Finished · Following, league chips, team/league search.
* **Match sheet** (tap any match) — score, minute, key events timeline (goals, penalties, own goals, cards),
  **Where to watch** (the official broadcasters the score provider lists), venue, countdown, add-to-calendar (.ics), share.
* **Follow** a match or a team → goal, kick-off, half-time, full-time, postponed and "starts in 15 min" alerts.
* **Smart refresh** — every 20 s while something is live, 60 s otherwise, refresh on tab focus and when the network
  returns, "offline / provider slow" notices, skeleton loading, empty and error states.
* Keyboard + screen-reader friendly (focus rings, roles, live region for alerts), respects *reduce motion*.

## Server

`server/src/live-scores.js` registers `GET /api/live/scoreboards?leagues=a,b,c&dates=YYYYMMDD-YYYYMMDD`.
It fetches ESPN's public scoreboard once per league per ~15 s (5 min for older/future dates), shares one request between
simultaneous users, serves the last good answer for up to 30 min if ESPN fails, and validates every parameter. One browser
refresh = one request. If the route is missing the page falls back to calling ESPN directly.

## Notifications — honest limits

* Alerts fire while the app is open (including in a background tab/PWA window). Closed-app push needs a push server with
  VAPID keys, which is **not** part of this package.
* On Android, alerts go through the service worker (Chrome blocks `new Notification()` there).
* If notifications are blocked, the same alerts appear as in-app toasts.

## Data source

Scores come from ESPN's public, undocumented scoreboard endpoints (the same ones the first version used). They can change
without notice and ESPN's terms limit commercial use; if you ever need a guaranteed feed, swap the fetch in
`live-scores.js` for a licensed provider — the browser code only depends on the normalised shape.

## Streams

This version contains **no stream finder**. The previous package connected a CNCVerse Bridge (CloudStream providers such as
Cricify/Sportzx) to find live channels; those re-stream sports channels without the rights-holders' permission, so that part
was not built on. "Where to watch" shows the legitimate broadcasters instead. If you hold rights to a stream, add it as a
plain link in your own page — the Match Center does not need to know about it.
