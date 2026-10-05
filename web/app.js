import { mountPlayer } from './player.js';
import { info as matureInfo, confirmAccess, getMode, setMode, flag, unflag, markConfirmed } from './maturity.js';
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
const titleUrl = (id) => `#/title/${encodeURIComponent(id)}`;
const TASTE_KEY = 'free.taste.v1';
const NOTICE_KEY = 'free.notice.v1';

function tasteSeeds() {
  return JSON.parse(localStorage.getItem(TASTE_KEY) || '[]').filter(Boolean).slice(0, 4);
}

function rememberTaste(value) {
  const next = [String(value || '').trim(), ...tasteSeeds()].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 4);
  if (next.length) localStorage.setItem(TASTE_KEY, JSON.stringify(next));
}

function noticeState() {
  return JSON.parse(localStorage.getItem(NOTICE_KEY) || '{}');
}

function saveNoticeState(value) {
  localStorage.setItem(NOTICE_KEY, JSON.stringify(value));
}

async function enableNotifications() {
  if (!('Notification' in window)) return false;
  const permission = await Notification.requestPermission();
  localStorage.setItem('free.notifications', permission === 'granted' ? 'on' : 'off');
  return permission === 'granted';
}

function recommendationToast(item, prefix = 'Because you watched') {
  const toast = document.createElement('aside');
  toast.className = 'recommendation-toast';
  const target = item.id ? `<a href="${titleUrl(item.id)}">${esc(item.title)} <small>›</small></a>` : `<span>${esc(item.title)}</span>`;
  toast.innerHTML = `<span class="eyebrow">For you</span><b>${esc(prefix)}</b>${target}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 9000);
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification('A new pick for you', { body: item.title, tag: `free-${item.id}` });
    n.onclick = () => { window.focus(); location.hash = titleUrl(item.id); n.close(); };
  }
}

async function maybeRecommend() {
  if (!navigator.onLine || !tasteSeeds().length) return;
  const hour = new Date().getHours();
  const slot = hour < 11 ? 'morning' : hour < 16 ? 'noon' : hour < 21 ? 'evening' : 'night';
  const day = new Date().toISOString().slice(0, 10);
  const state = noticeState();
  if (state.recommendation === `${day}:${slot}`) return;
  try {
    const data = await api('/api/recommendations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seeds: tasteSeeds() }) });
    const item = data.results?.find((r) => !matureInfo(r).mature);
    if (!item) return;
    saveNoticeState({ ...state, recommendation: `${day}:${slot}` });
    recommendationToast(item);
  } catch { /* recommendations never interrupt playback */ }
}

async function checkUpstreamUpdate() {
  const day = new Date().toISOString().slice(0, 10);
  const state = noticeState();
  if (state.upstream === day) return;
  saveNoticeState({ ...state, upstream: day });
  try {
    const data = await api('/api/upstream-status');
    if (data.updateAvailable) {
      recommendationToast({ id: '', title: 'The media core has a new upstream release.' }, 'Owner update');
    }
  } catch { /* status checks are best effort */ }
}

async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || `Request failed (${response.status})`), { code: body.error, status: response.status });
  return body;
}

function errBox(error) {
  const message = error.code === 'core_unavailable'
    ? 'Playback services are waking up. Try again in a moment.'
    : error.code === 'upstream_rejected'
      ? 'This source rejected the request. Choose another quality or try again later.'
      : error.message;
  return `<div class="notice error"><strong>Something went wrong</strong><span>${esc(message)}</span></div>`;
}

const resolveStream = (id, episode, resolution) => api('/api/resolve', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id, episode: episode || undefined, resolution: resolution || undefined }),
});

let adConfigPromise;
function getAdConfig() {
  adConfigPromise ||= api('/api/ad-config').catch(() => ({ enabled: false }));
  return adConfigPromise;
}

function showAdGate(reason = 'Continue') {
  return getAdConfig().then((ad) => new Promise((resolve) => {
    if (!ad.enabled || !ad.url) return resolve(true);
    const seconds = Math.min(9, Math.max(1, Number(ad.durationSeconds || 5)));
    const overlay = document.createElement('div');
    overlay.className = 'ad-layer';
    overlay.innerHTML = `<div class="ad-card"><div class="ad-label">Sponsored</div><p>${esc(reason)}</p><video id="ad-video" muted autoplay playsinline></video><div class="ad-timer">Ad · <b>${seconds}</b>s</div><button id="ad-continue" disabled>Continue</button></div>`;
    document.body.appendChild(overlay);
    const video = overlay.querySelector('#ad-video');
    const button = overlay.querySelector('#ad-continue');
    const timer = overlay.querySelector('b');
    video.src = ad.url;
    let left = seconds;
    const interval = setInterval(() => {
      left -= 1;
      timer.textContent = Math.max(left, 0);
      if (left <= 0) {
        clearInterval(interval);
        button.disabled = false;
        button.textContent = 'Continue';
      }
    }, 1000);
    const finish = () => { clearInterval(interval); overlay.remove(); resolve(true); };
    button.onclick = finish;
    video.onerror = () => { if (left <= 0) finish(); };
  }));
}

function qualitySelect(resolutions = [], selected) {
  if (!resolutions.length) return '';
  const labels = resolutions.map((r) => `<option value="${r}" ${Number(r) === Number(selected) ? 'selected' : ''}>${r >= 2160 ? '4K' : `${r}p`}</option>`).join('');
  return `<label class="quality">Quality<select id="quality">${labels}</select></label>`;
}

function subtitleCode(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('english') || value === 'en') return 'en';
  if (value.includes('bangla') || value.includes('bengali')) return 'bn';
  if (value.includes('hindi')) return 'hi';
  if (value.includes('spanish')) return 'es';
  if (value.includes('arabic')) return 'ar';
  if (value.includes('french')) return 'fr';
  if (value.includes('german')) return 'de';
  return 'und';
}

function renderCards(items, heading = '') {
  const all = items || [];
  const hideMode = getMode() === 'hide';
  const shown = hideMode ? all.filter((i) => !matureInfo(i).mature) : all;
  const hidden = all.length - shown.length;
  const note = hidden ? `<div class="notice subtle">${hidden} mature title${hidden > 1 ? 's are' : ' is'} hidden by your 18+ filter.</div>` : '';
  if (!shown.length) return `<div class="notice">${hidden ? '' : 'No titles found.'}</div>${note}`;
  const card = (item) => {
    const m = matureInfo(item);
    return `<a class="poster-card ${m.mature ? 'mature' : ''}" href="${titleUrl(item.id)}"><div class="poster-wrap">${item.poster ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(item.poster)}" alt="">` : '<div class="poster-placeholder"></div>'}${m.mature ? '<span class="age-tag">18+</span>' : ''}<span class="play-dot">▶</span></div><strong>${esc(item.title)}</strong><small>${esc(item.year || '')} ${esc(item.type || '')}</small></a>`;
  };
  return `${heading ? `<div class="row-heading"><h2>${esc(heading)}</h2><span>${shown.length} titles</span></div>` : ''}<div class="poster-row">${shown.map(card).join('')}</div>${note}`;
}

async function home() {
  app.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">Your next obsession</span><h1>Watch something<br><em>unforgettable.</em></h1><p>Search a world of cinema and series, then press play.</p><div class="search-shell"><span>⌕</span><input id="q" type="search" placeholder="Search movies, shows, anime…" autocomplete="off"></div><button id="notify-me" class="ghost notify-button">⌁ Notify me of picks</button><button id="mature-mode" class="ghost notify-button"></button></div></section><section id="results" class="content-section"><div class="row-heading"><h2>Find your next story</h2><span>Search to explore</span></div><div class="notice">Start typing a title above.</div></section>`;
  const input = document.getElementById('q');
  const results = document.getElementById('results');
  document.getElementById('notify-me').onclick = async (event) => { event.currentTarget.textContent = (await enableNotifications()) ? '✓ Picks enabled' : 'Notifications blocked'; };
  let timer;
  async function search() {
    const query = input.value.trim();
    if (!query) { results.innerHTML = '<div class="row-heading"><h2>Find your next story</h2><span>Search to explore</span></div><div class="notice">Start typing a title above.</div>'; return; }
    results.innerHTML = '<div class="loading"><i></i><span>Finding your next watch…</span></div>';
    try { rememberTaste(query); const data = await api(`/api/search?q=${encodeURIComponent(query)}`); results.innerHTML = renderCards(data.results, `Results for “${query}”`); }
    catch (error) { results.innerHTML = errBox(error); }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
  const modeBtn = document.getElementById('mature-mode');
  const paintMode = () => { modeBtn.textContent = getMode() === 'hide' ? '🔞 18+ titles: hidden' : '🔞 18+ titles: labelled'; };
  paintMode();
  modeBtn.onclick = () => { setMode(getMode() === 'hide' ? 'label' : 'hide'); paintMode(); if (input.value.trim()) search(); };
  input.focus();
  maybeRecommend();
  checkUpstreamUpdate();
}

let activePlayer = null;
const stopPlayer = () => { if (activePlayer) { activePlayer.destroy(); activePlayer = null; } };
const parseEp = (key) => { const m = /^s(\d+)e(\d+)$/i.exec(String(key || '')); return m ? { s: Number(m[1]), e: Number(m[2]) } : { s: 0, e: 0 }; };
const shortEp = (label) => String(label || '').split(' — ')[0];
const epTitle = (ep) => ep.label.replace(/^S\d+E\d+\s*[—-]?\s*/i, '').trim() || `Episode ${parseEp(ep.key).e}`;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
function groupSeasons(episodes) {
  const map = new Map();
  for (const ep of episodes) { const { s } = parseEp(ep.key); if (!map.has(s)) map.set(s, []); map.get(s).push(ep); }
  for (const list of map.values()) list.sort((a, b) => parseEp(a.key).e - parseEp(b.key).e);
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}
const epTask = (id, ep) => [...dlTasks.values()].find((t) => t.groupId === id && (t.episode || null) === (ep || null));

function paintEpisodeStates(id) {
  document.querySelectorAll('#episodes [data-state]').forEach((el) => {
    const t = epTask(id, el.dataset.state);
    el.textContent = !t ? '' : t.status === 'done' ? '✓ Saved' : t.status === 'error' ? 'Failed' : t.status === 'downloading' ? `${pctOf(t)}%` : t.status === 'resolving' ? '…' : 'Queued';
    el.dataset.s = t?.status || '';
  });
}

async function titlePage(id) {
  app.innerHTML = '<div class="loading"><i></i><span>Loading title…</span></div>';
  try {
    const data = await api(`/api/title/${encodeURIComponent(id)}`);
    const mi = matureInfo({ id, title: data.title, overview: data.overview });
    if (mi.mature) {
      const ok = await confirmAccess({ id, title: data.title, reasons: mi.reasons });
      if (!ok) { location.hash = '#/'; return; }
    } else rememberTaste(data.title);
    const episodes = data.episodes || [];
    const seasons = groupSeasons(episodes);
    const isSeries = episodes.length > 0;
    let season = [...seasons.keys()][0];
    let current = isSeries ? seasons.get(season)[0].key : null;
    const seasonSelect = seasons.size > 1 ? `<label class="episode-picker">Season<select id="season">${[...seasons.entries()].map(([n, l]) => `<option value="${n}">Season ${n} · ${l.length} ep</option>`).join('')}</select></label>` : '';
    app.innerHTML = `<section class="detail-hero" style="--poster:url('${esc(data.poster || '')}')"><div class="detail-poster">${data.poster ? `<img src="${esc(data.poster)}" alt="">` : '<div class="poster-placeholder"></div>'}</div><div class="detail-copy"><span class="eyebrow">${esc(data.type || 'Feature')}</span><h1>${esc(data.title)}</h1><div class="meta"><span>${esc(data.year || '')}</span><span>HD</span>${mi.mature ? '<span class="age-chip">18+</span>' : '<span>Not rated</span>'}${isSeries ? `<span>${seasons.size} season${seasons.size > 1 ? 's' : ''} · ${episodes.length} episodes</span>` : ''}</div>${mi.mature ? `<div class="advisory"><b>18+</b><span>${esc(mi.reasons.join(' · '))}</span></div>` : ''}<p>${esc(data.overview || 'A new story is waiting for you.')}</p><button id="flag-18" class="linkish">${mi.mature ? 'Not 18+? Remove the label' : 'Mark this title as 18+'}</button><div class="actions"><button id="play" class="primary">▶ Play</button><button id="download" class="secondary">⇩ Download</button></div><div id="title-status"></div></div></section>${isSeries ? `<section class="content-section"><div class="row-heading"><h2>Episodes</h2>${seasonSelect}</div><div id="episodes" class="ep-list"></div></section>` : ''}<section class="content-section"><div class="row-heading"><h2>More details</h2></div><div class="detail-facts"><span><b>Title</b>${esc(data.title)}</span><span><b>Format</b>${esc(data.type || 'Movie')}</span><span><b>Offline</b>Private browser storage</span></div></section>`;
    const status = document.getElementById('title-status');
    const playBtn = document.getElementById('play');
    const watchHash = (ep) => `#/watch/${encodeURIComponent(id)}${ep ? `?ep=${encodeURIComponent(ep)}` : ''}`;
    const paintPlay = () => { playBtn.textContent = isSeries ? `▶ Play ${shortEp(episodes.find((e) => e.key === current)?.label || current)}` : '▶ Play'; };
    const box = document.getElementById('episodes');
    const paintEpisodes = () => {
      if (!box) return;
      box.innerHTML = (seasons.get(season) || []).map((ep) => `<div class="ep-row ${ep.key === current ? 'sel' : ''}"><button class="ep-main" data-pick="${esc(ep.key)}"><b>${parseEp(ep.key).e}</b><span>${esc(epTitle(ep))}</span></button><span class="ep-state" data-state="${esc(ep.key)}"></span><button class="ep-btn" data-play="${esc(ep.key)}" aria-label="Play episode">▶</button><button class="ep-btn" data-dl="${esc(ep.key)}" aria-label="Download episode">⇩</button></div>`).join('');
      paintEpisodeStates(id);
    };
    paintPlay(); paintEpisodes();
    box?.addEventListener('click', (event) => {
      const el = event.target.closest('[data-pick],[data-play],[data-dl]');
      if (!el) return;
      if (el.dataset.pick) { current = el.dataset.pick; paintPlay(); paintEpisodes(); }
      else if (el.dataset.play) location.hash = watchHash(el.dataset.play);
      else if (el.dataset.dl) { const ep = episodes.find((e) => e.key === el.dataset.dl); queueDownloads({ id, data, items: [{ key: ep.key, label: ep.label }], resolution: Number(localStorage.getItem('free.dlq')) || null, out: status }); }
    });
    document.getElementById('season')?.addEventListener('change', (event) => { season = Number(event.target.value); current = seasons.get(season)[0].key; paintPlay(); paintEpisodes(); });
    playBtn.onclick = () => { location.hash = watchHash(current); };
    document.getElementById('flag-18').onclick = () => { if (mi.mature) unflag(id); else { flag(id); markConfirmed(id); } titlePage(id); };
    document.getElementById('download').onclick = () => openDownloadSheet({ id, data, seasons, season, current, out: status });
  } catch (error) { app.innerHTML = errBox(error); }
}

function openDownloadSheet({ id, data, seasons, season, current, out }) {
  document.querySelector('.sheet-backdrop')?.remove();
  const episodes = data.episodes || [];
  const isSeries = episodes.length > 0;
  const cur = episodes.find((e) => e.key === current) || episodes[0];
  const options = [];
  if (!isSeries) options.push({ head: 'Movie' }, { t: data.title, s: 'Full movie · 1 file', items: [{ key: null, label: '' }] });
  else {
    options.push({ head: 'This episode' }, { t: cur.label, s: 'Only this episode', items: [{ key: cur.key, label: cur.label }] });
    options.push({ head: 'Season' });
    for (const [n, list] of seasons) options.push({ t: `Season ${n}`, s: `${list.length} episode${list.length > 1 ? 's' : ''}${n === season ? ' · currently open' : ''}`, items: list.map((e) => ({ key: e.key, label: e.label })) });
    options.push({ head: 'Entire series' }, { t: `All ${seasons.size} season${seasons.size > 1 ? 's' : ''}`, s: `${episodes.length} episodes · downloaded one after another, 3 at a time`, items: episodes.map((e) => ({ key: e.key, label: e.label })) });
  }
  const qs = [['', 'Best available'], ['2160', '4K · 2160p'], ['1080', 'Full HD · 1080p'], ['720', 'HD · 720p'], ['480', 'SD · 480p'], ['360', 'Low · 360p (saves data)']];
  const savedQ = localStorage.getItem('free.dlq') || '';
  const sheet = document.createElement('div');
  sheet.className = 'sheet-backdrop';
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-label="Download options"><div class="sheet-grab"></div><h3>Download</h3><p class="sheet-sub">${esc(data.title)}</p><label class="sheet-field">Quality<select id="dl-quality">${qs.map(([v, l]) => `<option value="${v}" ${v === savedQ ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${options.map((o, i) => o.head ? `<div class="sheet-head">${esc(o.head)}</div>` : `<button class="sheet-opt" data-i="${i}"><b>${esc(o.t)}</b><small>${esc(o.s)}</small><span>⇩</span></button>`).join('')}<p class="sheet-foot" id="sheet-foot">Items already saved are skipped.</p><button class="ghost sheet-cancel">Cancel</button></div>`;
  document.body.appendChild(sheet);
  navigator.storage?.estimate?.().then(({ usage, quota }) => { const f = document.getElementById('sheet-foot'); if (f && quota) f.textContent = `Free space about ${fmt(Math.max(0, quota - usage))}. Items already saved are skipped.`; }).catch(() => {});
  const close = () => sheet.remove();
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('.sheet-cancel')) return close();
    const b = event.target.closest('.sheet-opt');
    if (!b) return;
    const quality = document.getElementById('dl-quality').value;
    localStorage.setItem('free.dlq', quality);
    close();
    queueDownloads({ id, data, items: options[Number(b.dataset.i)].items, resolution: Number(quality) || null, out });
  });
}

function playerHint(kind) {
  return kind === 'hls'
    ? 'HLS playback depends on browser support. Safari and many mobile browsers support it natively.'
    : 'Swipe up/down on the left half for brightness and on the right half for volume. Swipe sideways to seek. Double-tap the left or right side to skip 10 s. Pinch to zoom. Tap once for controls.';
}

async function watchPage(id, episode) {
  app.innerHTML = '<div class="loading"><i></i><span>Preparing your stream…</span></div>';
  try {
    const [first, meta] = await Promise.all([resolveStream(id, episode), api(`/api/title/${encodeURIComponent(id)}`).catch(() => null)]);
    const wi = matureInfo({ id, title: meta?.title, overview: meta?.overview });
    if (wi.mature && !(await confirmAccess({ id, title: meta?.title || 'This title', reasons: wi.reasons }))) { location.hash = '#/'; return; }
    let resolved = first;
    const epLabel = episode ? ((meta?.episodes || []).find((e) => e.key === episode)?.label || episode) : '';
    const title = meta ? `${meta.title}${epLabel ? ` · ${epLabel}` : ''}` : (epLabel || 'Now playing');
    let res = resolved.selectedResolution;
    app.innerHTML = `<div class="player-top"><a href="${titleUrl(id)}" class="back">← Back to title</a><span class="player-badge">${resolved.kind === 'hls' ? 'LIVE STREAM' : 'STREAMING'}</span></div><div id="vp-host" class="vp-host"></div><div class="player-controls"><div><span class="eyebrow">Now playing</span><h2>${esc(title)}</h2></div>${qualitySelect(resolved.resolutions, res)}</div><div id="player-message" class="notice subtle">${playerHint(resolved.kind)}</div>`;
    const message = document.getElementById('player-message');
    const posKey = `free.pos.${id}|${episode || ''}`;
    const subs = (r) => (r.subtitles || []).map((s) => ({ src: s.src, label: s.label, srclang: subtitleCode(s.lang) }));
    let adShown = false;
    let vp;
    const switchQuality = async (r) => {
      message.textContent = 'Switching quality…';
      try {
        resolved = await resolveStream(id, episode, r);
        res = resolved.selectedResolution || r;
        vp.setSource(resolved.stream, { startAt: vp.video.currentTime, tracks: subs(resolved), qualities: resolved.resolutions || [], selectedQuality: res });
        const sel = document.getElementById('quality'); if (sel) sel.value = String(res);
        message.textContent = 'Quality switched.';
      } catch (error) { message.innerHTML = errBox(error); }
    };
    vp = mountPlayer(document.getElementById('vp-host'), {
      src: resolved.stream, title, kind: resolved.kind, tracks: subs(resolved), qualities: resolved.resolutions || [], selectedQuality: res,
      startAt: Number(localStorage.getItem(posKey) || 0),
      onProgress: async (t, d) => {
        try { if (Number.isFinite(d) && d - t < 60) localStorage.removeItem(posKey); else localStorage.setItem(posKey, String(Math.floor(t))); } catch { /* ignore */ }
        if (!adShown && t >= 3000) {
          adShown = true;
          vp.video.pause();
          if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
          await showAdGate('Thanks for watching. Continue when you’re ready.');
          await vp.video.play().catch(() => {});
        }
      },
      onQuality: switchQuality,
      onRetry: async () => { resolved = await resolveStream(id, episode, res); return { src: resolved.stream, tracks: subs(resolved) }; },
    });
    activePlayer = vp;
    document.getElementById('quality')?.addEventListener('change', (event) => switchQuality(Number(event.target.value)));
  } catch (error) { app.innerHTML = errBox(error) + `<a class="secondary back-button" href="${titleUrl(id)}">← Back to title</a>`; }
}

// ---------- downloads: IndexedDB is the single source of truth, the service worker does the work ----------
const DB_NAME = 'free-downloads-v1';
const STORE = 'tasks';
let dbp;
const openDb = () => (dbp ||= new Promise((resolve, reject) => {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'taskId' });
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
}));
const dbTx = async (mode, fn) => {
  const db = await openDb();
  return new Promise((resolve, reject) => { const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); t.oncomplete = () => resolve(req?.result); t.onerror = () => reject(t.error); });
};
const dbAll = () => dbTx('readonly', (s) => s.getAll());
const dbPut = (task) => dbTx('readwrite', (s) => s.put(task));
const dbDel = (id) => dbTx('readwrite', (s) => s.delete(id));

const dlTasks = new Map();
const removed = new Set();
const isActive = (s) => s === 'queued' || s === 'resolving' || s === 'downloading';
const pctOf = (t) => (t.status === 'done' ? 100 : t.total ? Math.min(99, Math.floor(((t.received || 0) / t.total) * 100)) : 0);
function counts() {
  const c = { downloading: 0, queued: 0, done: 0, error: 0 };
  for (const t of dlTasks.values()) { if (t.status === 'downloading' || t.status === 'resolving') c.downloading += 1; else if (t.status === 'queued') c.queued += 1; else if (t.status === 'done') c.done += 1; else c.error += 1; }
  return c;
}
function paintBadge() {
  const badge = document.querySelector('#nav-dl .nav-badge');
  if (!badge) return;
  const c = counts(); const n = c.downloading + c.queued;
  badge.hidden = n === 0; badge.textContent = String(n);
  document.title = n ? `(${n}↓) free❤️‍🔥` : 'free❤️‍🔥';
}
async function swPost(message) {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  const worker = reg.active || navigator.serviceWorker.controller;
  if (!worker) return false;
  worker.postMessage(message);
  return true;
}
function syncDownloads() {
  const open = [...dlTasks.values()].filter((t) => isActive(t.status));
  if (open.length) swPost({ type: 'SYNC', tasks: open }).catch(() => {});
}
async function removeFile(file) { if (!file || !navigator.storage?.getDirectory) return; try { const root = await navigator.storage.getDirectory(); await root.removeEntry(file); } catch { /* already gone */ } }

async function loadDownloads() {
  try {
    const all = await dbAll();
    dlTasks.clear();
    (all || []).forEach((t) => dlTasks.set(t.taskId, t));
    // one-time import of the old localStorage list (finished files only)
    const legacy = JSON.parse(localStorage.getItem('free.downloads') || '[]');
    for (const l of legacy) {
      if (l.taskId && l.file && l.status === 'done' && !dlTasks.has(l.taskId)) {
        const t = { ...l, groupId: l.taskId, groupName: l.name, id: null, received: l.size || 0, total: l.size || 0, pct: 100 };
        dlTasks.set(t.taskId, t); await dbPut(t);
      }
    }
    if (legacy.length) localStorage.removeItem('free.downloads');
  } catch { /* storage unavailable */ }
  onTasksChanged();
  syncDownloads();
}

async function queueDownloads({ id, data, items, resolution, out }) {
  if (!navigator.storage?.getDirectory) { out.innerHTML = '<div class="notice error">This browser does not support private downloads.</div>'; return; }
  if (!('serviceWorker' in navigator)) { out.innerHTML = '<div class="notice error">Background downloads are not supported by this browser.</div>'; return; }
  const di = matureInfo({ id, title: data.title, overview: data.overview });
  if (di.mature && !(await confirmAccess({ id, title: data.title, reasons: di.reasons }))) return;
  await showAdGate('Watch this short ad before your download starts.');
  const fresh = [];
  let skipped = 0;
  const base = Date.now();
  for (const [index, item] of items.entries()) {
    const key = item.key || null;
    const dup = [...dlTasks.values()].find((t) => t.groupId === id && (t.episode || null) === key);
    if (dup && dup.status !== 'error') { skipped += 1; continue; }
    if (dup) { removed.add(dup.taskId); dlTasks.delete(dup.taskId); await dbDel(dup.taskId).catch(() => {}); await removeFile(dup.file); }
    fresh.push({
      taskId: uuid(), groupId: id, groupName: data.title, id, episode: key, epLabel: item.label || '',
      name: key ? `${data.title} · ${shortEp(item.label || key)}` : data.title,
      resolution: resolution || null, kind: 'file', file: null, received: 0, total: 0, pct: 0, size: 0,
      date: base + index, status: 'queued', type: 'video/mp4', error: null, mature: di.mature, reasons: di.reasons,
    });
  }
  if (!fresh.length) { out.innerHTML = `<div class="notice">Nothing new to download — ${skipped} item${skipped === 1 ? ' is' : 's are'} already saved or queued. <a href="#/downloads">Open downloads →</a></div>`; return; }
  for (const t of fresh) { dlTasks.set(t.taskId, t); await dbPut(t); }
  onTasksChanged();
  const ok = await swPost({ type: 'DOWNLOAD_BATCH', tasks: fresh });
  out.innerHTML = ok
    ? `<div class="notice success">Queued ${fresh.length} download${fresh.length > 1 ? 's' : ''}${skipped ? ` · ${skipped} already saved` : ''}. Up to three run together. <a href="#/downloads">Watch progress →</a></div>`
    : '<div class="notice error">The background worker is not ready yet. Reload the page and try again.</div>';
}

const statusText = (t) => t.status === 'done' ? `Ready · ${fmt(t.size || t.received || 0)}`
  : t.status === 'error' ? `Failed · ${t.error || 'Download failed'}`
    : t.status === 'downloading' ? `Downloading · ${fmt(t.received || 0)}${t.total ? ` / ${fmt(t.total)}` : ''}`
      : t.status === 'resolving' ? 'Preparing stream…' : 'Waiting in queue';
const pctLabel = (t) => (t.status === 'done' ? '✓' : t.status === 'queued' ? '—' : t.status === 'resolving' ? '…' : t.status === 'error' ? '!' : `${pctOf(t)}%`);
const rowButtons = (t) => t.status === 'done' ? `<button data-act="play" data-id="${esc(t.taskId)}" class="secondary">▶ Play</button><button data-act="delete" data-id="${esc(t.taskId)}" class="ghost">Delete</button>`
  : t.status === 'error' ? `${t.id ? `<button data-act="retry" data-id="${esc(t.taskId)}" class="secondary">↻ Retry</button>` : ''}<button data-act="delete" data-id="${esc(t.taskId)}" class="ghost">Delete</button>`
    : `<button data-act="cancel" data-id="${esc(t.taskId)}" class="ghost">Cancel</button>`;
function rowHTML(t, grouped) {
  const title = grouped && t.epLabel ? t.epLabel : t.name;
  return `<div class="download-item dl-row" data-task="${esc(t.taskId)}" data-status="${esc(t.status)}"><div class="dl-main"><b>${t.mature ? '<span class="age-chip sm">18+</span> ' : ''}${esc(title)}</b><small class="dl-status">${esc(statusText(t))}</small>${t.status === 'done' ? '' : `<div class="progress"><i style="width:${pctOf(t)}%"></i></div>`}</div><span class="dl-pct">${pctLabel(t)}</span><div class="actions">${rowButtons(t)}</div></div>`;
}
function renderDownloadList() {
  const list = document.getElementById('dl-list');
  if (!list) return;
  const all = [...dlTasks.values()];
  if (!all.length) { list.innerHTML = '<div class="notice">No downloads yet. Open a title and tap Download — for series you can save an episode, a season or everything.</div>'; return; }
  const groups = new Map();
  for (const t of all) { const g = t.groupId || t.taskId; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(t); }
  const ordered = [...groups.entries()].map(([gid, tasks]) => {
    tasks.sort((a, b) => { const x = parseEp(a.episode), y = parseEp(b.episode); return x.s - y.s || x.e - y.e || a.date - b.date; });
    return [gid, tasks, Math.max(...tasks.map((t) => t.date || 0))];
  }).sort((a, b) => b[2] - a[2]);
  list.innerHTML = ordered.map(([gid, tasks]) => {
    const series = tasks.some((t) => t.episode);
    if (!series) return tasks.map((t) => rowHTML(t, false)).join('');
    return `<section class="dl-group" data-group="${esc(gid)}"><header class="dl-group-head"><div><b>${tasks.some((x) => x.mature) ? '<span class="age-chip sm">18+</span> ' : ''}${esc(tasks[0].groupName)}</b><small class="dl-g-sub"></small></div><span class="dl-g-pct"></span><div class="actions"><button data-act="group-delete" data-group="${esc(gid)}" class="ghost">Delete all</button></div></header><div class="progress"><i class="dl-g-bar"></i></div>${tasks.map((t) => rowHTML(t, true)).join('')}</section>`;
  }).join('');
  paintAll();
}
function paintAll() {
  const list = document.getElementById('dl-list');
  if (!list) return;
  list.querySelectorAll('.dl-row').forEach((row) => {
    const t = dlTasks.get(row.dataset.task);
    if (!t) return;
    row.querySelector('.dl-status').textContent = statusText(t);
    row.querySelector('.dl-pct').textContent = pctLabel(t);
    const bar = row.querySelector('.progress i'); if (bar) bar.style.width = `${pctOf(t)}%`;
  });
  list.querySelectorAll('.dl-group').forEach((g) => {
    const tasks = [...dlTasks.values()].filter((t) => (t.groupId || t.taskId) === g.dataset.group);
    if (!tasks.length) return;
    const done = tasks.filter((t) => t.status === 'done').length;
    const act = tasks.filter((t) => t.status === 'downloading' || t.status === 'resolving').length;
    const waiting = tasks.filter((t) => t.status === 'queued').length;
    const failed = tasks.filter((t) => t.status === 'error').length;
    const pct = Math.round(tasks.reduce((a, t) => a + pctOf(t), 0) / tasks.length);
    g.querySelector('.dl-g-sub').textContent = `${done} of ${tasks.length} episode${tasks.length > 1 ? 's' : ''} ready${act ? ` · ${act} downloading` : ''}${waiting ? ` · ${waiting} waiting` : ''}${failed ? ` · ${failed} failed` : ''}`;
    g.querySelector('.dl-g-pct').textContent = `${pct}%`;
    g.querySelector('.dl-g-bar').style.width = `${pct}%`;
  });
  paintSummary();
}
function renderSummary() {
  const box = document.getElementById('dl-summary');
  if (!box) return;
  box.innerHTML = '<div class="dl-sum-top"><span class="dl-chip live"><b id="sum-act">0</b> downloading</span><span class="dl-chip"><b id="sum-q">0</b> queued</span><span class="dl-chip"><b id="sum-done">0</b> ready</span><span class="dl-chip bad" id="sum-bad-chip" hidden><b id="sum-bad">0</b> failed</span></div><div class="progress"><i id="sum-bar"></i></div><small id="sum-line"></small><div class="actions"><button class="secondary" data-act="retry-all" id="sum-retry" hidden>↻ Retry failed</button><button class="ghost" data-act="cancel-all" id="sum-cancel" hidden>Cancel all</button><button class="ghost" data-act="clear-done" id="sum-clear" hidden>Clear finished</button></div>';
  navigator.storage?.estimate?.().then(({ usage, quota }) => { const el = document.getElementById('sum-line'); if (el) el.dataset.storage = quota ? `Storage ${fmt(usage)} of ${fmt(quota)}` : ''; paintSummary(); }).catch(() => {});
}
function paintSummary() {
  const el = document.getElementById('sum-act');
  if (!el) return;
  const c = counts();
  el.textContent = c.downloading;
  document.getElementById('sum-q').textContent = c.queued;
  document.getElementById('sum-done').textContent = c.done;
  document.getElementById('sum-bad').textContent = c.error;
  document.getElementById('sum-bad-chip').hidden = !c.error;
  const active = [...dlTasks.values()].filter((t) => t.status === 'downloading' && t.total);
  const rec = active.reduce((a, t) => a + (t.received || 0), 0), tot = active.reduce((a, t) => a + t.total, 0);
  const pct = tot ? Math.floor((rec / tot) * 100) : 0;
  document.getElementById('sum-bar').style.width = `${pct}%`;
  const line = document.getElementById('sum-line');
  line.textContent = [tot ? `Overall ${pct}% · ${fmt(rec)} of ${fmt(tot)}` : (c.downloading + c.queued ? 'Starting…' : 'Nothing downloading'), line.dataset.storage].filter(Boolean).join(' · ');
  document.getElementById('sum-retry').hidden = !c.error;
  document.getElementById('sum-cancel').hidden = !(c.downloading + c.queued);
  document.getElementById('sum-clear').hidden = !c.done;
}
function onTasksChanged() {
  paintBadge();
  if (location.hash.startsWith('#/downloads')) renderDownloadList();
  const m = /^#\/title\/(.+)$/.exec(location.hash);
  if (m) paintEpisodeStates(decodeURIComponent(m[1]));
}
function onTaskUpdate(task, prevStatus) {
  paintBadge();
  const m = /^#\/title\/(.+)$/.exec(location.hash);
  if (m) paintEpisodeStates(decodeURIComponent(m[1]));
  if (!location.hash.startsWith('#/downloads')) return;
  const row = document.querySelector(`.dl-row[data-task="${task.taskId}"]`);
  if (!row || prevStatus !== task.status) renderDownloadList(); else paintAll();
}

async function removeTask(t, cancelling) {
  removed.add(t.taskId);
  if (cancelling || isActive(t.status)) await swPost({ type: 'CANCEL', taskId: t.taskId }).catch(() => {});
  await removeFile(t.file);
  dlTasks.delete(t.taskId);
  await dbDel(t.taskId).catch(() => {});
}
async function retryTask(t) {
  removed.delete(t.taskId);
  const next = { ...t, status: 'queued', error: null };
  dlTasks.set(t.taskId, next);
  await dbPut(next);
  await swPost({ type: 'DOWNLOAD', task: next });
}
async function playDownload(t) {
  if (t.mature && !(await confirmAccess({ id: t.groupId || t.taskId, title: t.groupName || t.name, reasons: t.reasons || [] }))) return;
  try {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(t.file)).getFile();
    stopPlayer();
    const host = document.getElementById('download-player');
    const key = `free.pos.dl.${t.taskId}`;
    activePlayer = mountPlayer(host, {
      src: URL.createObjectURL(file.slice(0, file.size, t.type || 'video/mp4')), title: t.name, kind: 'local', probe: false,
      info: { size: file.size, mime: t.type || 'video/mp4', ranges: true }, startAt: Number(localStorage.getItem(key) || 0),
      onProgress: (x, d) => { try { if (Number.isFinite(d) && d - x < 60) localStorage.removeItem(key); else localStorage.setItem(key, String(Math.floor(x))); } catch { /* ignore */ } },
    });
    host.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch { alert('This file is no longer in browser storage. Download it again.'); }
}
async function downloadsClick(event) {
  const b = event.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, t = dlTasks.get(b.dataset.id);
  if (act === 'play' && t) return playDownload(t);
  if (act === 'cancel' && t) await removeTask(t, true);
  else if (act === 'delete' && t) await removeTask(t, false);
  else if (act === 'retry' && t) await retryTask(t);
  else if (act === 'group-delete') {
    const list = [...dlTasks.values()].filter((x) => (x.groupId || x.taskId) === b.dataset.group);
    if (!confirm(`Delete ${list.length} download${list.length > 1 ? 's' : ''}?`)) return;
    for (const x of list) await removeTask(x, false);
  } else if (act === 'retry-all') { for (const x of [...dlTasks.values()].filter((y) => y.status === 'error' && y.id)) await retryTask(x); }
  else if (act === 'cancel-all') { if (!confirm('Cancel every active download?')) return; for (const x of [...dlTasks.values()].filter((y) => isActive(y.status))) await removeTask(x, true); }
  else if (act === 'clear-done') { for (const x of [...dlTasks.values()].filter((y) => y.status === 'done')) await removeTask(x, false); }
  else return;
  onTasksChanged();
}
function downloadsPage() {
  app.innerHTML = '<section class="page-heading"><span class="eyebrow">Your library</span><h1>Downloads</h1><p>Private files saved in this browser only. Up to three download at once, even while you browse.</p></section><div class="dl-summary" id="dl-summary"></div><div id="dl-list" class="download-list"></div><div id="download-player" class="dl-player"></div>';
  renderSummary();
  renderDownloadList();
  app.onclick = downloadsClick;
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const d = event.data || {};
    if (d.type === 'DOWNLOAD_UPDATE') {
      const task = d.task;
      if (removed.has(task.taskId)) return;
      const prev = dlTasks.get(task.taskId)?.status;
      dlTasks.set(task.taskId, task);
      onTaskUpdate(task, prev);
    } else if (d.type === 'DOWNLOAD_REMOVED') {
      removed.add(d.taskId); dlTasks.delete(d.taskId); onTasksChanged();
    }
  });
}

function aboutPage() {
  app.innerHTML = `<section class="page-heading"><span class="eyebrow">The way you watch</span><h1>Stories, on your terms.</h1><p>A cinematic web app for browsing, streaming and saving titles for private offline playback.</p></section><div class="feature-grid"><div><b>Watch</b><span>Quality controls, subtitles and browser-native playback.</span></div><div><b>Save</b><span>Downloads stay inside your browser’s private storage.</span></div><div><b>Every screen</b><span>Designed for phones first, with desktop room to breathe.</span></div><div><b>18+ labels</b><span>Titles that look mature get an 18+ tag and ask you to confirm first. Use the 18+ switch on the home screen to hide them completely.</span></div></div><div class="social-row"><a href="https://instagram.com/try_it_nah" target="_blank" rel="noreferrer">◎ Instagram · @try_it_nah</a><span id="whatsapp-link"></span></div>`;
  api('/api/social').then((social) => { if (social.whatsapp) document.getElementById('whatsapp-link').innerHTML = `<a href="${esc(social.whatsapp)}" target="_blank" rel="noreferrer">◉ WhatsApp</a>`; }).catch(() => {});
}

async function adminPage() {
  app.innerHTML = `<section class="page-heading"><span class="eyebrow">Private area</span><h1>Owner controls</h1><p>This area is hidden from normal navigation. Enter the owner password to manage the global ad.</p></section><form id="admin-login" class="admin-form"><input id="admin-password" type="password" placeholder="Owner password" required autocomplete="current-password"><button class="primary">Unlock owner controls</button><div id="admin-status"></div></form>`;
  document.getElementById('admin-login').onsubmit = async (event) => {
    event.preventDefault();
    const status = document.getElementById('admin-status');
    const password = document.getElementById('admin-password').value;
    try {
      await api('/api/admin/check', { method: 'POST', headers: { 'x-admin-password': password } });
      app.innerHTML = `<section class="page-heading"><span class="eyebrow">Owner controls</span><h1>Ad controls</h1><p>Only the verified owner can publish the global ad.</p></section><form id="ad-form" class="admin-form"><input id="ad-url" type="url" placeholder="https://your-domain.example/ad.mp4" required><label>Duration<select id="ad-duration"><option value="1">1 second</option><option value="3">3 seconds</option><option value="5" selected>5 seconds</option><option value="7">7 seconds</option><option value="9">9 seconds</option></select></label><button class="primary">Publish ad to everyone</button><div id="admin-status"></div></form>`;
      document.getElementById('ad-form').onsubmit = async (publishEvent) => {
        publishEvent.preventDefault();
        const publishStatus = document.getElementById('admin-status');
        try {
          const url = document.getElementById('ad-url').value;
          const durationSeconds = Number(document.getElementById('ad-duration').value);
          await api('/api/admin/ad', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': password }, body: JSON.stringify({ enabled: true, url, durationSeconds }) });
          adConfigPromise = Promise.resolve({ enabled: true, url, durationSeconds });
          publishStatus.innerHTML = '<div class="notice success">Ad published globally.</div>';
        } catch (error) { publishStatus.innerHTML = errBox(error); }
      };
    } catch (error) { status.innerHTML = errBox(error); }
  };
}

function route() {
  app.onclick = null;
  stopPlayer();
  const [segment, rawTail = ''] = location.hash.replace(/^#\//, '').split('/');
  if (segment === 'title') return titlePage(decodeURIComponent(rawTail));
  if (segment === 'watch') { const [rawId, query] = rawTail.split('?'); return watchPage(decodeURIComponent(rawId), new URLSearchParams(query).get('ep')); }
  if (segment === 'downloads') return downloadsPage();
  if (segment === 'about') { checkUpstreamUpdate(); return aboutPage(); }
  if (segment === 'admin') return adminPage();
  home();
}

addEventListener('hashchange', route);
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
loadDownloads();
setInterval(syncDownloads, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncDownloads(); });
addEventListener('online', maybeRecommend);
setTimeout(maybeRecommend, 2500);
