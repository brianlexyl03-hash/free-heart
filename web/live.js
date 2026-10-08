// free❤️‍🔥 Live Match Center — scores, fixtures, match details, follow + notifications.
// Self-contained: owns the #/live route and never touches the movie/player/download code.
const app = document.getElementById('app');
const CFG = Object.assign({ liveRefreshMs: 20000, idleRefreshMs: 60000, reminderMinutes: 15, leagues: [] }, window.__FREE_LIVE_CONFIG || {});
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const K = { matches: 'free.live.follow.matches.v2', teams: 'free.live.follow.teams.v2', prefs: 'free.live.prefs.v2', snap: 'free.live.snap.v2', remind: 'free.live.remind.v2' };

// ---------- tiny helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const dayFromKey = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(4, 6)) - 1, Number(k.slice(6, 8)));
const shiftKey = (k, n) => { const d = dayFromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const todayKey = () => keyOf(new Date());
const fmtTime = (iso) => { try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); } catch { return ''; } };
const fmtDay = (iso) => { try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)); } catch { return ''; } };
const isLiveRoute = () => location.hash.replace(/^#\//, '').split('/')[0] === 'live';

// ---------- state ----------
const prefs = load(K.prefs, {});
const S = {
  pool: new Map(),                 // matchId -> normalized match (everything fetched so far)
  dayKey: todayKey(),
  filter: prefs.filter || 'all',   // all | live | upcoming | finished | following
  league: prefs.league || 'all',
  query: '',
  busy: false, error: '', stale: false, updatedAt: 0, firstLoad: true, offline: !navigator.onLine,
  fetchedAt: {},                   // dayKey -> ms
  followM: new Set(load(K.matches, [])),
  followT: new Map(load(K.teams, [])),   // teamId -> {name, logo}
  proxyMissing: false,
  openId: null,
};
let ctl = null, timer = 0, tick = 0, mounted = false, root = null;

// ---------- data: fetch + normalise ----------
async function getJson(url, tries = 2) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' }); // the server already shields ESPN; never reuse a stale browser copy
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
      return await r.json();
    } catch (e) { last = e; if (e.status && e.status < 500 && e.status !== 429) break; if (i + 1 < tries) await wait(500 * (i + 1)); }
  }
  throw last || new Error('Request failed');
}

async function fetchRange(dates) {
  const ids = CFG.leagues.map((l) => l[0]);
  if (!S.proxyMissing) {
    try {
      const data = await getJson(`/api/live/scoreboards?leagues=${encodeURIComponent(ids.join(','))}&dates=${dates}`);
      return { results: data.results || {}, stale: !!data.stale };
    } catch (e) { if (e.status === 404) S.proxyMissing = true; /* any other proxy failure: try ESPN directly below */ }
  }
  const results = {};
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < ids.length) {
      const id = ids[i]; i += 1;
      try { results[id] = await getJson(`${ESPN}/${encodeURIComponent(id)}/scoreboard?dates=${dates}&limit=300`, 1); } catch { /* skip league */ }
    }
  }));
  return { results, stale: false };
}

function names(c) {
  const out = new Set();
  for (const b of c.broadcasts || []) for (const n of b.names || []) out.add(String(n));
  for (const g of c.geoBroadcasts || []) { const n = g.media?.shortName || g.media?.name; if (n) out.add(String(n)); }
  return [...out].slice(0, 6);
}

function normalize(event, meta) {
  const c = event.competitions?.[0] || {};
  const comps = c.competitors || [];
  const h = comps.find((x) => x.homeAway === 'home') || comps[0] || {};
  const a = comps.find((x) => x.homeAway === 'away') || comps[1] || {};
  const t = c.status?.type || event.status?.type || {};
  const nm = String(t.name || '');
  let status = t.state === 'in' ? 'live' : (t.completed || t.state === 'post') ? 'finished' : 'scheduled';
  if (/POSTPONED|CANCEL|ABANDON|SUSPEND/.test(nm)) status = 'postponed';
  const side = (id) => (String(id) === String(h.team?.id || h.id) ? 'home' : 'away');
  const events = [];
  for (const d of c.details || []) {
    let kind = null;
    if (d.scoringPlay) kind = d.ownGoal ? 'own' : d.penaltyKick ? 'pen' : 'goal';
    else if (d.redCard) kind = 'red';
    else if (d.yellowCard) kind = 'yellow';
    if (!kind) continue;
    const p = d.athletesInvolved?.[0];
    events.push({ kind, minute: d.clock?.displayValue || '', sec: Number(d.clock?.value || 0), player: p?.displayName || p?.shortName || '', side: side(d.team?.id) });
  }
  events.sort((x, y) => x.sec - y.sec);
  const team = (x) => ({ id: String(x.team?.id || x.id || ''), name: x.team?.displayName || x.team?.name || 'Team', short: x.team?.abbreviation || '', logo: x.team?.logo || '', score: Number.isFinite(Number(x.score)) && x.score !== '' && x.score != null ? Number(x.score) : null });
  return {
    id: String(event.id), leagueId: meta[0], league: meta[1], country: meta[2], status,
    detail: t.detail || t.description || '', short: t.shortDetail || '', clock: c.status?.displayClock || '', period: c.status?.period || 0,
    kickoff: event.date || c.date || c.startDate || '', venue: c.venue?.fullName || '', city: c.venue?.address?.city || '',
    home: team(h), away: team(a), watch: names(c), events,
  };
}

async function loadDay(force = false) {
  const need = [...new Set([todayKey(), S.dayKey])];
  const stale = need.filter((k) => force || !S.fetchedAt[k] || Date.now() - S.fetchedAt[k] > 10000);
  if (!stale.length) return;
  let anyOk = false, anyStale = false;
  for (const k of stale) {
    const dates = `${shiftKey(k, -1)}-${shiftKey(k, 1)}`;
    const { results, stale: st } = await fetchRange(dates);
    for (const meta of CFG.leagues) {
      const data = results[meta[0]];
      if (!data) continue;
      anyOk = true;
      for (const ev of data.events || []) S.pool.set(String(ev.id), normalize(ev, meta));
    }
    anyStale = anyStale || st;
    S.fetchedAt[k] = Date.now();
  }
  if (!anyOk) throw new Error('The score provider is not answering right now.');
  S.stale = anyStale; S.updatedAt = Date.now(); S.error = '';
}

// ---------- follow + notifications ----------
const isFollowing = (m) => S.followM.has(m.id) || S.followT.has(m.home.id) || S.followT.has(m.away.id);
const persistFollow = () => { save(K.matches, [...S.followM]); save(K.teams, [...S.followT]); };

async function askPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}
async function notify(title, body, tag) {
  toast(`${title}${body ? ` — ${body}` : ''}`);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: '/#/live' }, renotify: true };
  try {   // Android Chrome only allows notifications through the service worker
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) { await reg.showNotification(title, opts); return; }
  } catch { /* fall through */ }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch { /* unsupported */ }
}
function scoreLine(m) { return `${m.home.name} ${m.home.score ?? 0}–${m.away.score ?? 0} ${m.away.name}`; }

function detectChanges() {
  const prev = load(K.snap, null);
  const snap = {};
  const reminded = new Set(load(K.remind, []));
  for (const m of S.pool.values()) snap[m.id] = `${m.home.score ?? ''}-${m.away.score ?? ''}|${m.status}|${/half/i.test(m.detail) ? 'HT' : ''}`;
  if (prev) {
    for (const m of S.pool.values()) {
      if (!isFollowing(m)) continue;
      const before = prev[m.id], now = snap[m.id];
      if (before && before !== now) {
        const [bs, bst, bht] = before.split('|'), [ns, nst, nht] = now.split('|');
        if (bst === 'scheduled' && nst === 'live') notify('Kick-off', `${m.home.name} vs ${m.away.name} · ${m.league}`, `lv-${m.id}`);
        else if (nst === 'finished' && bst !== 'finished') notify('Full time', scoreLine(m), `lv-${m.id}`);
        else if (bs !== ns) { const last = [...m.events].reverse().find((e) => e.kind === 'goal' || e.kind === 'pen' || e.kind === 'own'); notify(`GOAL! ${scoreLine(m)}`, last ? `${last.minute} ${last.player}`.trim() : m.league, `lv-${m.id}`); }
        else if (nht === 'HT' && bht !== 'HT') notify('Half-time', scoreLine(m), `lv-${m.id}`);
        else if (nst === 'postponed' && bst !== 'postponed') notify('Match postponed', `${m.home.name} vs ${m.away.name}`, `lv-${m.id}`);
      }
      if (m.status === 'scheduled' && !reminded.has(m.id)) {
        const mins = (new Date(m.kickoff) - Date.now()) / 60000;
        if (mins > 0 && mins <= CFG.reminderMinutes) { reminded.add(m.id); notify(`Starts in ${Math.ceil(mins)} min`, `${m.home.name} vs ${m.away.name} · ${m.league}`, `lv-r-${m.id}`); }
      }
    }
  }
  save(K.snap, snap); save(K.remind, [...reminded].slice(-300));
}

// ---------- derived lists ----------
const localDay = (m) => keyOf(new Date(m.kickoff || 0));
function dayMatches() { return [...S.pool.values()].filter((m) => m.kickoff && localDay(m) === S.dayKey); }
function visible() {
  const q = S.query.trim().toLowerCase();
  return dayMatches().filter((m) => {
    if (S.league !== 'all' && m.leagueId !== S.league) return false;
    if (S.filter === 'live' && m.status !== 'live') return false;
    if (S.filter === 'upcoming' && m.status !== 'scheduled') return false;
    if (S.filter === 'finished' && m.status !== 'finished') return false;
    if (S.filter === 'following' && !isFollowing(m)) return false;
    if (q && !`${m.home.name} ${m.away.name} ${m.league} ${m.country}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
const rank = (m) => (m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : m.status === 'postponed' ? 2 : 3);

// ---------- view ----------
function statusCell(m) {
  if (m.status === 'live') return `<span class="lv-live"><i></i>${esc(/half/i.test(m.detail) ? 'HT' : (m.clock || 'LIVE'))}</span>`;
  if (m.status === 'finished') return '<span class="lv-ft">FT</span>';
  if (m.status === 'postponed') return '<span class="lv-ft warn">PPD</span>';
  return `<span class="lv-time">${esc(fmtTime(m.kickoff))}</span>`;
}
const crest = (t) => (t.logo ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(t.logo)}" alt="">` : '<span class="lv-crest-fb">⚽</span>');
function row(m) {
  const f = isFollowing(m);
  const sc = (t) => (m.status === 'scheduled' || m.status === 'postponed' ? '' : t.score ?? 0);
  return `<article class="lv-row ${m.status}" data-open="${esc(m.id)}" tabindex="0" role="button" aria-label="${esc(`${m.home.name} versus ${m.away.name}, open details`)}"><div class="lv-st">${statusCell(m)}</div><div class="lv-teams"><div class="lv-team">${crest(m.home)}<span>${esc(m.home.name)}</span><b>${sc(m.home)}</b></div><div class="lv-team">${crest(m.away)}<span>${esc(m.away.name)}</span><b>${sc(m.away)}</b></div></div><button class="lv-star ${f ? 'on' : ''}" data-follow="${esc(m.id)}" aria-pressed="${f}" aria-label="${f ? 'Unfollow' : 'Follow'} ${esc(m.home.name)} vs ${esc(m.away.name)}">${f ? '★' : '☆'}</button></article>`;
}
function groups(list) {
  const order = new Map(CFG.leagues.map((l, i) => [l[0], i]));
  const by = new Map();
  for (const m of list) { if (!by.has(m.leagueId)) by.set(m.leagueId, []); by.get(m.leagueId).push(m); }
  return [...by.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99)).map(([id, ms]) => {
    ms.sort((a, b) => rank(a) - rank(b) || new Date(a.kickoff) - new Date(b.kickoff));
    return `<section class="lv-group"><header><b>${esc(ms[0].league)}</b><span>${esc(ms[0].country)} · ${ms.length}</span></header>${ms.map(row).join('')}</section>`;
  }).join('');
}
function renderDates() {
  const today = todayKey();
  const days = Array.from({ length: 9 }, (_, i) => shiftKey(today, i - 2));
  if (!days.includes(S.dayKey)) days.push(S.dayKey);
  root.querySelector('#lv-dates').innerHTML = days.sort().map((k) => {
    const d = dayFromKey(k);
    const lab = k === today ? 'Today' : k === shiftKey(today, -1) ? 'Yesterday' : k === shiftKey(today, 1) ? 'Tomorrow' : new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
    return `<button class="${k === S.dayKey ? 'active' : ''}" data-day="${k}"><small>${esc(lab)}</small><b>${d.getDate()}</b></button>`;
  }).join('') + `<label class="lv-cal" title="Pick a date">📅<input type="date" id="lv-datepick" value="${S.dayKey.slice(0, 4)}-${S.dayKey.slice(4, 6)}-${S.dayKey.slice(6, 8)}"></label>`;
  root.querySelector('#lv-dates .active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function renderHero() {
  const el = root.querySelector('#lv-hero');
  const all = dayMatches();
  const live = all.filter((m) => m.status === 'live').sort((a, b) => Number(isFollowing(b)) - Number(isFollowing(a)));
  if (S.dayKey === todayKey() && live[0]) {
    const m = live[0], last = [...m.events].reverse()[0];
    const ico = { goal: '⚽', pen: '⚽', own: '⚽', yellow: '🟨', red: '🟥' };
    el.innerHTML = `<section class="lv-hero live" data-open="${esc(m.id)}" tabindex="0" role="button"><div class="lv-hero-top"><span>${esc(m.league)}</span>${statusCell(m)}</div><div class="lv-hero-score"><div>${crest(m.home)}<small>${esc(m.home.name)}</small></div><strong>${m.home.score ?? 0}<em>–</em>${m.away.score ?? 0}</strong><div>${crest(m.away)}<small>${esc(m.away.name)}</small></div></div>${last ? `<p class="lv-hero-last">${ico[last.kind] || ''} ${esc(last.minute)} ${esc(last.player)}</p>` : '<p class="lv-hero-last">Tap for match details</p>'}</section>`;
    return;
  }
  const next = all.filter((m) => m.status === 'scheduled').sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
  if (S.dayKey === todayKey() && next) {
    el.innerHTML = `<section class="lv-hero" data-open="${esc(next.id)}" tabindex="0" role="button"><div class="lv-hero-top"><span>NEXT UP · ${esc(next.league)}</span><span class="lv-time">${esc(fmtTime(next.kickoff))}</span></div><div class="lv-hero-score"><div>${crest(next.home)}<small>${esc(next.home.name)}</small></div><strong class="vs">vs</strong><div>${crest(next.away)}<small>${esc(next.away.name)}</small></div></div><p class="lv-hero-last" data-count="${esc(next.kickoff)}">${esc(countdown(next.kickoff))}</p></section>`;
    return;
  }
  el.innerHTML = '';
}
function countdown(iso) {
  const ms = new Date(iso) - Date.now();
  if (!(ms > 0)) return 'Starting now';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h >= 24 ? `Kicks off ${fmtDay(iso)}` : h ? `Kicks off in ${h}h ${m % 60}m` : `Kicks off in ${m}m`;
}
function renderKpi() {
  const all = dayMatches();
  const c = (s) => all.filter((m) => m.status === s).length;
  root.querySelector('#lv-kpi').innerHTML = `<div><b>${c('live')}</b><span>Live</span></div><div><b>${c('scheduled')}</b><span>Upcoming</span></div><div><b>${c('finished')}</b><span>Finished</span></div><div><b>${all.filter(isFollowing).length}</b><span>Following</span></div>`;
}
function renderTabs() {
  const all = dayMatches();
  const cnt = { live: all.filter((m) => m.status === 'live').length, following: all.filter(isFollowing).length };
  const tab = (id, label, n) => `<button class="${S.filter === id ? 'active' : ''}" data-filter="${id}" role="tab" aria-selected="${S.filter === id}">${label}${n ? ` <span>${n}</span>` : ''}</button>`;
  root.querySelector('#lv-tabs').innerHTML = tab('all', 'All') + tab('live', 'Live', cnt.live) + tab('upcoming', 'Upcoming') + tab('finished', 'Finished') + tab('following', '★ Following', cnt.following);
  const present = new Set(all.map((m) => m.leagueId));
  root.querySelector('#lv-chips').innerHTML = `<button class="${S.league === 'all' ? 'active' : ''}" data-league="all">All leagues</button>` + CFG.leagues.filter((l) => present.has(l[0]) || S.league === l[0]).map((l) => `<button class="${S.league === l[0] ? 'active' : ''}" data-league="${esc(l[0])}">${esc(l[1])}</button>`).join('');
}
function renderList() {
  const el = root.querySelector('#lv-list');
  if (S.firstLoad && !S.pool.size) { el.innerHTML = Array.from({ length: 6 }, () => '<div class="lv-skel"><i></i><div><b></b><b></b></div></div>').join(''); return; }
  if (S.error && !S.pool.size) { el.innerHTML = `<div class="lv-empty"><div>📡</div><h2>Scores are unavailable</h2><p>${esc(S.error)}</p><button class="primary" data-refresh>Try again</button></div>`; return; }
  const list = visible();
  if (!list.length) {
    const msg = S.filter === 'following' ? 'Tap ☆ on any match, or “Follow team” inside a match, to see it here and get goal alerts.' : S.filter === 'live' ? 'Nothing is live right now. Check Upcoming for what is next.' : 'No matches for these filters on this day.';
    el.innerHTML = `<div class="lv-empty"><div>⚽</div><h2>No matches here</h2><p>${esc(msg)}</p></div>`; return;
  }
  el.innerHTML = groups(list);
}
function renderFoot() {
  const el = root.querySelector('#lv-foot');
  const ago = S.updatedAt ? Math.max(0, Math.round((Date.now() - S.updatedAt) / 1000)) : null;
  const when = ago == null ? 'Loading…' : ago < 5 ? 'Updated just now' : ago < 90 ? `Updated ${ago}s ago` : `Updated ${Math.round(ago / 60)} min ago`;
  el.innerHTML = `<span>${S.offline ? '⚠ You are offline — showing the last scores.' : S.error ? `⚠ ${esc(S.error)}` : S.stale ? `⚠ Provider slow — showing recent data. ${when}` : when}</span><span>Scores by ESPN</span>`;
}
function renderAll() { if (!mounted) return; renderDates(); renderHero(); renderKpi(); renderTabs(); renderList(); renderFoot(); if (S.openId) renderSheet(); }

function shell() {
  return `<div class="lv"><section class="lv-head"><div><span class="eyebrow">FREE · LIVE</span><h1>Matchday</h1></div><div class="lv-head-actions"><button class="ghost" data-notif id="lv-notif" aria-label="Notification settings">🔔</button><button class="ghost" data-refresh aria-label="Refresh scores">↻</button></div></section><div class="lv-dates" id="lv-dates" role="tablist" aria-label="Choose a day"></div><div id="lv-hero"></div><div class="lv-kpi" id="lv-kpi"></div><section class="lv-controls"><div class="lv-tabs" id="lv-tabs" role="tablist"></div><label class="lv-search"><span>⌕</span><input id="lv-search" placeholder="Search teams or leagues" autocomplete="off" value="${esc(S.query)}"></label></section><div class="lv-chips" id="lv-chips"></div><div id="lv-list"></div><div class="lv-foot" id="lv-foot"></div><div class="lv-toasts" id="lv-toasts" role="status" aria-live="polite"></div></div>`;
}

// ---------- match sheet ----------
function icsEscape(s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
function downloadIcs(m) {
  const z = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const s = new Date(m.kickoff), e = new Date(s.getTime() + 115 * 60000);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//free//live//EN', 'BEGIN:VEVENT', `UID:${m.id}@free-live`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(s)}`, `DTEND:${z(e)}`, `SUMMARY:${icsEscape(`${m.home.name} vs ${m.away.name}`)}`, `DESCRIPTION:${icsEscape(m.league)}`, m.venue ? `LOCATION:${icsEscape(m.venue)}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${m.home.short || 'match'}-vs-${m.away.short || 'match'}.ics`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function shareMatch(m) {
  const text = m.status === 'scheduled' ? `${m.home.name} vs ${m.away.name} — ${fmtDay(m.kickoff)} ${fmtTime(m.kickoff)}` : scoreLine(m);
  try { if (navigator.share) { await navigator.share({ title: 'free · Live', text, url: location.href }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${location.href}`); toast('Copied to clipboard'); } catch { toast(text); }
}
function sheetHtml(m) {
  const ico = { goal: '⚽', pen: '⚽', own: '⚽', yellow: '🟨', red: '🟥' };
  const lab = { goal: 'Goal', pen: 'Penalty', own: 'Own goal', yellow: 'Yellow card', red: 'Red card' };
  const ev = m.events.length ? m.events.map((e) => `<li class="${e.side}"><span class="min">${esc(e.minute)}</span><span class="ic" title="${lab[e.kind]}">${ico[e.kind]}</span><span class="who">${esc(e.player || lab[e.kind])}</span></li>`).join('') : `<li class="none">${m.status === 'scheduled' ? 'Events appear here once the match starts.' : 'No goals or cards recorded.'}</li>`;
  const f = isFollowing(m);
  const tf = (t) => S.followT.has(t.id);
  return `<div class="lv-sheet-card" role="dialog" aria-modal="true" aria-label="${esc(`${m.home.name} vs ${m.away.name}`)}"><div class="sheet-grab"></div><div class="lv-sheet-top"><span>${esc(m.league)} · ${esc(fmtDay(m.kickoff))}</span><button class="ghost" data-close aria-label="Close">✕</button></div><div class="lv-sheet-score"><div>${crest(m.home)}<b>${esc(m.home.name)}</b></div><strong>${m.status === 'scheduled' ? esc(fmtTime(m.kickoff)) : `${m.home.score ?? 0} – ${m.away.score ?? 0}`}</strong><div>${crest(m.away)}<b>${esc(m.away.name)}</b></div></div><p class="lv-sheet-status">${m.status === 'live' ? `<span class="lv-live"><i></i>${esc(m.detail || m.clock || 'LIVE')}</span>` : m.status === 'finished' ? 'Full time' : m.status === 'postponed' ? esc(m.detail || 'Postponed') : esc(countdown(m.kickoff))}</p><h3>Key events</h3><ul class="lv-events">${ev}</ul><h3>Where to watch</h3><div class="lv-watch">${m.watch.length ? m.watch.map((w) => `<span>📺 ${esc(w)}</span>`).join('') : '<small>The score provider lists no broadcaster for this match. Check your local sports channel or the competition’s official app.</small>'}</div>${m.venue ? `<h3>Venue</h3><p class="lv-venue">${esc(m.venue)}${m.city ? ` · ${esc(m.city)}` : ''}</p>` : ''}<div class="lv-sheet-actions"><button class="primary" data-follow="${esc(m.id)}">${f && S.followM.has(m.id) ? '★ Following match' : '☆ Follow match'}</button><button class="secondary" data-team="${esc(m.home.id)}">${tf(m.home) ? '★' : '☆'} ${esc(m.home.short || m.home.name)}</button><button class="secondary" data-team="${esc(m.away.id)}">${tf(m.away) ? '★' : '☆'} ${esc(m.away.short || m.away.name)}</button>${m.status === 'scheduled' ? '<button class="secondary" data-ics>📅 Add to calendar</button>' : ''}<button class="ghost" data-share>↗ Share</button></div></div>`;
}
function renderSheet() {
  const m = S.pool.get(S.openId);
  let el = document.querySelector('.lv-sheet');
  if (!m) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'lv-sheet'; document.body.appendChild(el); el.addEventListener('click', onSheetClick); }
  el.innerHTML = sheetHtml(m);
  if (!el.dataset.focused) { el.dataset.focused = '1'; el.querySelector('[data-close]')?.focus(); }
}
function closeSheet() { S.openId = null; document.querySelector('.lv-sheet')?.remove(); }
async function onSheetClick(e) {
  const el = e.currentTarget;
  if (e.target === el || e.target.closest('[data-close]')) return closeSheet();
  const m = S.pool.get(S.openId);
  if (!m) return;
  if (e.target.closest('[data-ics]')) return downloadIcs(m);
  if (e.target.closest('[data-share]')) return shareMatch(m);
  const fm = e.target.closest('[data-follow]');
  if (fm) return toggleMatch(m.id);
  const ft = e.target.closest('[data-team]');
  if (ft) return toggleTeam(ft.dataset.team, m);
}

// ---------- follow actions ----------
async function ensureAlerts() {
  const p = await askPermission();
  if (p === 'granted') return true;
  toast(p === 'denied' ? 'Notifications are blocked in your browser settings. You will still see in-app alerts while this page is open.' : p === 'unsupported' ? 'This browser has no notifications. You will see in-app alerts while this page is open.' : 'Notifications not enabled. You will see in-app alerts while this page is open.', 5200);
  return false;
}
async function toggleMatch(id) {
  if (S.followM.has(id)) S.followM.delete(id); else { S.followM.add(id); if (S.followM.size + S.followT.size === 1) await ensureAlerts(); toast('Following — you will get goal, kick-off and full-time alerts'); }
  persistFollow(); renderAll();
}
async function toggleTeam(teamId, m) {
  const t = m.home.id === teamId ? m.home : m.away;
  if (S.followT.has(teamId)) S.followT.delete(teamId); else { S.followT.set(teamId, { name: t.name, logo: t.logo }); if (S.followM.size + S.followT.size === 1) await ensureAlerts(); toast(`Following ${t.name}`); }
  persistFollow(); renderAll();
}

// ---------- toasts ----------
function toast(msg, ms = 4200) {
  const host = document.getElementById('lv-toasts') || (() => { const d = document.createElement('div'); d.className = 'lv-toasts'; d.id = 'lv-toasts'; d.setAttribute('role', 'status'); document.body.appendChild(d); return d; })();
  const t = document.createElement('div');
  t.className = 'lv-toast'; t.textContent = msg; host.appendChild(t);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

// ---------- events ----------
function onClick(e) {
  const t = e.target;
  const day = t.closest('[data-day]'); if (day) { S.dayKey = day.dataset.day; refresh(); renderAll(); return; }
  const flt = t.closest('[data-filter]'); if (flt) { S.filter = flt.dataset.filter; save(K.prefs, { filter: S.filter, league: S.league }); renderAll(); return; }
  const lg = t.closest('[data-league]'); if (lg) { S.league = lg.dataset.league; save(K.prefs, { filter: S.filter, league: S.league }); renderAll(); return; }
  if (t.closest('[data-refresh]')) { refresh(true); return; }
  if (t.closest('[data-notif]')) { ensureAlerts().then((ok) => ok && toast('Alerts are on for followed matches and teams')); return; }
  const fol = t.closest('[data-follow]'); if (fol) { e.stopPropagation(); toggleMatch(fol.dataset.follow); return; }
  const open = t.closest('[data-open]'); if (open) { S.openId = open.dataset.open; const old = document.querySelector('.lv-sheet'); if (old) { old.removeAttribute('data-focused'); } renderSheet(); }
}
function onKey(e) {
  if (e.key === 'Escape' && S.openId) return closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-open]')) { e.preventDefault(); S.openId = e.target.dataset.open; renderSheet(); }
}
function onInput(e) {
  if (e.target.id === 'lv-search') { S.query = e.target.value; renderList(); renderHero(); }
  if (e.target.id === 'lv-datepick' && e.target.value) { S.dayKey = e.target.value.replace(/-/g, ''); refresh(); renderAll(); }
}

// ---------- refresh loop ----------
async function refresh(force = false) {
  if (S.busy && !force) return;
  S.busy = true;
  try { await loadDay(force); S.offline = !navigator.onLine; detectChanges(); }
  catch (e) { S.error = navigator.onLine ? (e.message || 'Could not load scores.') : ''; S.offline = !navigator.onLine; }
  finally { S.busy = false; S.firstLoad = false; renderAll(); }
}
function nextDelay() {
  const live = [...S.pool.values()].some((m) => m.status === 'live');
  return live ? CFG.liveRefreshMs : CFG.idleRefreshMs;
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const watching = S.followM.size + S.followT.size > 0;
    if (!document.hidden || watching) await refresh(true);
    if (mounted) schedule();
  }, nextDelay());
}

// ---------- mount / unmount ----------
function mount() {
  if (mounted) return;
  mounted = true;
  document.title = 'Live · free❤️‍🔥';
  app.innerHTML = shell();
  root = app.querySelector('.lv');
  ctl = new AbortController();
  const o = { signal: ctl.signal };
  root.addEventListener('click', onClick, o);
  root.addEventListener('input', onInput, o);
  root.addEventListener('change', onInput, o);
  document.addEventListener('keydown', onKey, o);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); }, o);
  addEventListener('online', () => { S.offline = false; refresh(true); }, o);
  addEventListener('offline', () => { S.offline = true; renderFoot(); }, o);
  tick = setInterval(() => { renderFoot(); root.querySelectorAll('[data-count]').forEach((n) => { n.textContent = countdown(n.dataset.count); }); }, 15000);
  S.firstLoad = !S.pool.size;
  renderAll();
  refresh(true).then(schedule);
}
function unmount() {
  if (!mounted) return;
  mounted = false; ctl?.abort(); clearTimeout(timer); clearInterval(tick); closeSheet(); root = null;
  document.title = 'free❤️‍🔥';
}
function route() { if (isLiveRoute()) mount(); else unmount(); }
addEventListener('hashchange', route);
route();

// test hook (harmless in production)
window.__freeLive = { state: S, refresh, normalize };
