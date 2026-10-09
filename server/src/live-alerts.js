// Closed-app goal/kick-off/full-time alerts for the Live Match Center, sent with the repo's existing Web Push setup.
// The browser tells the server what each push subscription follows; the server polls the (cached) scoreboards and
// pushes ONLY to the subscriptions that follow the match or one of its teams. Follows live in memory and are re-sent by
// the browser whenever it opens, so a restart/redeploy of the server loses nothing permanently.
import { fetchScoreboard } from './live-scores.js';

export const LEAGUES = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'eng.2', 'eng.fa', 'eng.league_cup', 'esp.copa_del_rey', 'ned.1', 'por.1', 'bel.1', 'tur.1', 'sco.1', 'usa.1', 'mex.1', 'bra.1', 'arg.1', 'conmebol.libertadores', 'sau.1', 'caf.nations', 'fifa.world', 'uefa.nations'];
const ID = /^\d{1,12}$/;
const follows = new Map();   // endpoint -> { m:Set, t:Set, at }
let snap = new Map();        // matchId -> { key, ... }
const reminded = new Set();
const ymd = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };

export function setFollows(endpoint, matches, teams, now = Date.now()) {
  const m = new Set((matches || []).map(String).filter((x) => ID.test(x)).slice(0, 200));
  const t = new Set((teams || []).map(String).filter((x) => ID.test(x)).slice(0, 100));
  if (!m.size && !t.size) follows.delete(endpoint); else follows.set(endpoint, { m, t, at: now });
  if (follows.size > 5000) follows.delete(follows.keys().next().value);
}
export const followCount = () => follows.size;

function lite(ev, leagueId) {
  const c = ev.competitions?.[0] || {};
  const comps = c.competitors || [];
  const h = comps.find((x) => x.homeAway === 'home') || comps[0] || {};
  const a = comps.find((x) => x.homeAway === 'away') || comps[1] || {};
  const t = c.status?.type || ev.status?.type || {};
  let status = t.state === 'in' ? 'live' : (t.completed || t.state === 'post') ? 'finished' : 'scheduled';
  if (/POSTPONED|CANCEL|ABANDON|SUSPEND/.test(String(t.name || ''))) status = 'postponed';
  const score = (x) => (Number.isFinite(Number(x.score)) && x.score !== '' && x.score != null ? Number(x.score) : 0);
  const goals = (c.details || []).filter((d) => d.scoringPlay);
  const last = goals[goals.length - 1];
  return {
    id: String(ev.id), leagueId, status, ht: /half/i.test(t.detail || ''), kickoff: ev.date || c.date || '',
    home: { id: String(h.team?.id || h.id || ''), name: h.team?.displayName || 'Home', score: score(h) },
    away: { id: String(a.team?.id || a.id || ''), name: a.team?.displayName || 'Away', score: score(a) },
    league: ev.league || leagueId,
    scorer: last ? `${last.clock?.displayValue || ''} ${last.athletesInvolved?.[0]?.displayName || ''}`.trim() : '',
  };
}
const line = (m) => `${m.home.name} ${m.home.score}–${m.away.score} ${m.away.name}`;

export function diff(prev, m, now = Date.now(), reminderMin = 15) {
  const out = [];
  if (prev) {
    if (prev.status === 'scheduled' && m.status === 'live') out.push(['Kick-off', `${m.home.name} vs ${m.away.name}`]);
    else if (m.status === 'finished' && prev.status !== 'finished') out.push(['Full time', line(m)]);
    else if (m.status === 'postponed' && prev.status !== 'postponed') out.push(['Match postponed', `${m.home.name} vs ${m.away.name}`]);
    else if (prev.home.score !== m.home.score || prev.away.score !== m.away.score) out.push([`GOAL! ${line(m)}`, m.scorer || '']);
    else if (m.ht && !prev.ht) out.push(['Half-time', line(m)]);
  }
  if (m.status === 'scheduled' && !reminded.has(m.id)) {
    const mins = (new Date(m.kickoff) - now) / 60000;
    if (mins > 0 && mins <= reminderMin) { reminded.add(m.id); out.push([`Starts in ${Math.ceil(mins)} min`, `${m.home.name} vs ${m.away.name}`]); }
  }
  return out;
}

export async function pollOnce({ fetchImpl, sendTo, now = Date.now, leagues = LEAGUES } = {}) {
  if (!follows.size) return { skipped: true };
  const dates = `${ymd(now() - 86400000)}-${ymd(now() + 86400000)}`;
  const next = new Map();
  let i = 0, fetched = 0;
  const alerts = [];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < leagues.length) {
      const league = leagues[i]; i += 1;
      let body;
      try { body = (await fetchScoreboard(league, dates, { fetchImpl, now })).body; } catch { continue; }
      fetched += 1;
      for (const ev of body.events || []) {
        const m = lite(ev, league);
        next.set(m.id, m);
        for (const [title, text] of diff(snap.get(m.id), m, now())) alerts.push({ m, title, text });
      }
    }
  }));
  if (!fetched) return { error: 'no scoreboard answered' };      // keep the old snapshot; try again next tick
  for (const [id, old] of snap) if (!next.has(id)) next.set(id, old);   // a league that failed this round keeps its last known state
  snap = next;
  let sent = 0;
  for (const { m, title, text } of alerts) {
    for (const [endpoint, f] of [...follows]) {
      if (!(f.m.has(m.id) || f.t.has(m.home.id) || f.t.has(m.away.id))) continue;
      const r = await sendTo(endpoint, { title, body: text ? `${text}` : m.league, url: '/#/live', tag: `lv-${m.id}` });
      if (r?.gone) follows.delete(endpoint); else if (r?.ok) sent += 1;
    }
  }
  const cutoff = now() - 14 * 86400000;
  for (const [e, f] of follows) if (f.at < cutoff) follows.delete(e);
  return { alerts: alerts.length, sent, matches: next.size };
}

export function registerLiveAlerts(app, { hasSubscription }) {
  app.post('/api/live/follow', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = req.body || {};
    const ep = String(b.endpoint || '');
    if (!ep.startsWith('https://') || ep.length > 700 || !Array.isArray(b.matches || []) || !Array.isArray(b.teams || [])) return reply.code(400).send({ error: 'bad_request', message: 'Invalid follow list' });
    if (!hasSubscription(ep)) return reply.code(404).send({ error: 'no_subscription', message: 'Push is not enabled for this browser' });
    setFollows(ep, b.matches || [], b.teams || []);
    return { ok: true, matches: Math.min((b.matches || []).length, 200), teams: Math.min((b.teams || []).length, 100) };
  });
}

let timer = null;
export function startLiveAlerts({ sendTo, log = console } = {}) {
  if (timer) return;
  timer = setInterval(() => { pollOnce({ sendTo }).then((r) => { if (r.error) log.error?.('[live-alerts]', r.error); }).catch((e) => log.error?.('[live-alerts] poll failed', e?.message)); }, 20000);
  timer.unref?.();
  log.log?.('[live-alerts] started');
}
