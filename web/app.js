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
    const item = data.results?.[0];
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
  if (!items?.length) return `<div class="notice">No titles found.</div>`;
  return `${heading ? `<div class="row-heading"><h2>${esc(heading)}</h2><span>${items.length} titles</span></div>` : ''}<div class="poster-row">${items.map((item) => `<a class="poster-card" href="${titleUrl(item.id)}"><div class="poster-wrap">${item.poster ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(item.poster)}" alt="">` : '<div class="poster-placeholder"></div>'}<span class="play-dot">▶</span></div><strong>${esc(item.title)}</strong><small>${esc(item.year || '')} ${esc(item.type || '')}</small></a>`).join('')}</div>`;
}

async function home() {
  app.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">Your next obsession</span><h1>Watch something<br><em>unforgettable.</em></h1><p>Search a world of cinema and series, then press play.</p><div class="search-shell"><span>⌕</span><input id="q" type="search" placeholder="Search movies, shows, anime…" autocomplete="off"></div><button id="notify-me" class="ghost notify-button">⌁ Notify me of picks</button></div></section><section id="results" class="content-section"><div class="row-heading"><h2>Find your next story</h2><span>Search to explore</span></div><div class="notice">Start typing a title above.</div></section>`;
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
  input.focus();
  maybeRecommend();
  checkUpstreamUpdate();
}

async function titlePage(id) {
  app.innerHTML = '<div class="loading"><i></i><span>Loading title…</span></div>';
  try {
    const data = await api(`/api/title/${encodeURIComponent(id)}`);
    rememberTaste(data.title);
    const episodes = data.episodes || [];
    app.innerHTML = `<section class="detail-hero" style="--poster:url('${esc(data.poster || '')}')"><div class="detail-poster">${data.poster ? `<img src="${esc(data.poster)}" alt="">` : '<div class="poster-placeholder"></div>'}</div><div class="detail-copy"><span class="eyebrow">${esc(data.type || 'Feature')}</span><h1>${esc(data.title)}</h1><div class="meta"><span>${esc(data.year || '')}</span><span>HD</span><span>16+</span></div><p>${esc(data.overview || 'A new story is waiting for you.')}</p><div class="actions"><button id="play" class="primary">▶ Play</button><button id="download" class="secondary">⇩ Download</button></div>${episodes.length ? `<label class="episode-picker">Episode<select id="episode">${episodes.map((ep) => `<option value="${esc(ep.key)}">${esc(ep.label)}</option>`).join('')}</select></label>` : ''}<div id="title-status"></div></div></section><section class="content-section"><div class="row-heading"><h2>More details</h2></div><div class="detail-facts"><span><b>Title</b>${esc(data.title)}</span><span><b>Format</b>${esc(data.type || 'Movie')}</span><span><b>Offline</b>Private browser storage</span></div></section>`;
    const episode = () => document.getElementById('episode')?.value;
    document.getElementById('play').onclick = () => { location.hash = `#/watch/${encodeURIComponent(id)}${episode() ? `?ep=${encodeURIComponent(episode())}` : ''}`; };
    document.getElementById('download').onclick = () => download(id, episode(), data.title + (episode() ? ` · ${episode()}` : ''), document.getElementById('title-status'));
  } catch (error) { app.innerHTML = errBox(error); }
}

function playerMarkup(id, episode, resolved) {
  const tracks = (resolved.subtitles || []).map((s, i) => `<track kind="subtitles" srclang="${subtitleCode(s.lang)}" label="${esc(s.label)}" src="${esc(s.src)}" ${i ? '' : 'default'}>`).join('');
  return `<div class="player-top"><a href="${titleUrl(id)}" class="back">← Back to title</a><span class="player-badge">${resolved.kind === 'hls' ? 'LIVE STREAM' : 'STREAMING'}</span></div><div id="video-stage" class="video-shell"><video id="player" controls playsinline autoplay src="${esc(resolved.stream)}">${tracks}</video></div><div class="vlc-controls"><button id="mute" class="secondary" title="Mute">🔊</button><label class="range-control">Volume <input id="volume" type="range" min="0" max="1" step="0.01" value="1"></label><label class="range-control">Brightness <input id="brightness" type="range" min="60" max="140" step="1" value="100"></label><label class="range-control">Fit <select id="fit"><option value="contain">Fit</option><option value="cover">Fill</option></select></label><button id="fullscreen" class="secondary">⛶ Fullscreen</button><button id="pip" class="secondary">▣ PiP</button><button id="wake" class="secondary">☀ Keep awake</button></div><div class="player-controls"><div><span class="eyebrow">Now playing</span><h2>Choose your quality</h2></div>${qualitySelect(resolved.resolutions, resolved.selectedResolution)}</div><div id="player-message" class="notice subtle">${resolved.kind === 'hls' ? 'HLS playback depends on browser support. Safari and many mobile browsers support it natively.' : 'VLC-style controls are available below: volume, visual brightness, fit, fullscreen, PiP and keep-awake.'}</div>`;
}

async function watchPage(id, episode) {
  app.innerHTML = '<div class="loading"><i></i><span>Preparing your stream…</span></div>';
  try {
    let resolved = await resolveStream(id, episode);
    app.innerHTML = playerMarkup(id, episode, resolved);
    const player = document.getElementById('player');
    const stage = document.getElementById('video-stage');
    const message = document.getElementById('player-message');
    let wakeLock = null;
    const acquireWakeLock = async () => {
      if (!('wakeLock' in navigator)) { message.textContent = 'Keep-awake is not supported by this browser.'; return; }
      try { wakeLock = await navigator.wakeLock.request('screen'); document.getElementById('wake').textContent = '☀ Awake on'; wakeLock.addEventListener('release', () => { wakeLock = null; document.getElementById('wake').textContent = '☀ Keep awake'; }); }
      catch { message.textContent = 'The browser blocked keep-awake; tap the button again while the player is active.'; }
    };
    document.getElementById('volume').oninput = (event) => { player.volume = Number(event.target.value); player.muted = player.volume === 0; document.getElementById('mute').textContent = player.muted ? '🔇' : '🔊'; };
    document.getElementById('mute').onclick = () => { player.muted = !player.muted; document.getElementById('mute').textContent = player.muted ? '🔇' : '🔊'; };
    document.getElementById('brightness').oninput = (event) => { player.style.filter = `brightness(${Number(event.target.value) / 100})`; };
    document.getElementById('fit').onchange = (event) => { player.style.objectFit = event.target.value; };
    document.getElementById('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen(); } catch { message.textContent = 'Fullscreen is not available in this browser.'; } };
    document.getElementById('pip').onclick = async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else if (document.pictureInPictureEnabled) await player.requestPictureInPicture(); else throw new Error(); } catch { message.textContent = 'Picture-in-Picture is not available in this browser.'; } };
    document.getElementById('wake').onclick = async () => { if (wakeLock) { await wakeLock.release(); wakeLock = null; localStorage.setItem('free.keepAwake', 'off'); document.getElementById('wake').textContent = '☀ Keep awake'; } else { await acquireWakeLock(); localStorage.setItem('free.keepAwake', wakeLock ? 'on' : 'off'); } };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wakeLock === null && !player.paused) acquireWakeLock(); }, { once: false });
    player.addEventListener('play', () => { if (localStorage.getItem('free.keepAwake') === 'on') acquireWakeLock(); });
    player.addEventListener('pause', () => { if (wakeLock) wakeLock.release().catch(() => {}); });
    player.addEventListener('ended', () => { if (wakeLock) wakeLock.release().catch(() => {}); });
    document.addEventListener('keydown', (event) => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; if (event.key === 'f') document.getElementById('fullscreen').click(); if (event.key === 'm') document.getElementById('mute').click(); if (event.key === ' ') { event.preventDefault(); player.paused ? player.play() : player.pause(); } }, { once: true });
    let adShown = false;
    document.getElementById('quality')?.addEventListener('change', async (event) => {
      const previous = player.currentTime;
      message.textContent = 'Switching quality…';
      try {
        resolved = await resolveStream(id, episode, Number(event.target.value));
        player.src = resolved.stream;
        player.load();
        player.currentTime = previous;
        await player.play().catch(() => {});
        message.textContent = 'Quality switched.';
      } catch (error) { message.innerHTML = errBox(error); }
    });
    player.addEventListener('timeupdate', async () => {
      if (!adShown && player.currentTime >= 3000) {
        adShown = true;
        player.pause();
        await showAdGate('Thanks for watching. Continue when you’re ready.');
        await player.play().catch(() => {});
      }
    });
  } catch (error) { app.innerHTML = errBox(error) + `<a class="secondary back-button" href="${titleUrl(id)}">← Back to title</a>`; }
}

const META = 'free.downloads';
const metas = () => JSON.parse(localStorage.getItem(META) || '[]');
const saveMetas = (items) => localStorage.setItem(META, JSON.stringify(items));

async function download(id, episode, name, output, resolution) {
  if (!navigator.storage?.getDirectory) { output.innerHTML = '<div class="notice error">This browser does not support private downloads.</div>'; return; }
  await showAdGate('Watch this short ad before your download starts.');
  output.innerHTML = '<div class="loading compact"><i></i><span>Adding to background queue…</span></div>';
  try {
    const resolved = await resolveStream(id, episode, resolution);
    if (resolved.kind !== 'file') throw new Error('This source is HLS and cannot be saved as one file. Use Play instead.');
    if (!('serviceWorker' in navigator)) throw new Error('Background downloads are not supported by this browser.');
    const taskId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const task = { taskId, name, stream: resolved.stream, kind: resolved.kind, file: null, size: 0, date: Date.now(), status: 'queued', type: 'video/mp4' };
    saveMetas([...metas(), task]);
    const registration = await navigator.serviceWorker.ready;
    registration.active.postMessage({ type: 'DOWNLOAD', task });
    output.innerHTML = '<div class="notice success">Queued. You can leave this screen; up to three downloads run together.</div>';
  } catch (error) { output.innerHTML = errBox(error); }
}

async function downloadsPage() {
  const items = metas();
  const status = (item) => item.status === 'done' ? `${fmt(item.size || 0)} · Ready` : item.status === 'error' ? `Error · ${item.error || 'Download failed'}` : item.status === 'downloading' ? `Downloading · ${fmt(item.received || 0)}${item.total ? ` / ${fmt(item.total)}` : ''}` : 'Queued for background download';
  app.innerHTML = `<section class="page-heading"><span class="eyebrow">Your library</span><h1>Downloads</h1><p>Private files saved in this browser only. Three downloads can run at once, including while this screen is in the background.</p></section>${items.length ? `<div class="download-list">${items.map((item, i) => `<div class="download-item" data-task="${esc(item.taskId || '')}"><div><b>${esc(item.name)}</b><small>${esc(status(item))} · ${new Date(item.date).toLocaleDateString()}</small></div><div class="actions">${item.status === 'done' ? `<button data-play="${i}" class="secondary">Play</button>` : ''}<button data-delete="${i}" class="ghost">Delete</button></div></div>`).join('')}</div><div id="download-player"></div>` : '<div class="notice">No private downloads yet.</div>'}`;
  app.onclick = async (event) => {
    const play = event.target.dataset.play, remove = event.target.dataset.delete;
    if (play == null && remove == null) return;
    if (play != null) {
      const root = await navigator.storage.getDirectory();
      const file = await (await root.getFileHandle(items[play].file)).getFile();
      document.getElementById('download-player').innerHTML = `<video controls playsinline autoplay src="${URL.createObjectURL(new Blob([file], { type: items[play].type }))}"></video>`;
    } else {
      if (items[remove].file) { const root = await navigator.storage.getDirectory(); await root.removeEntry(items[remove].file).catch(() => {}); }
      saveMetas(items.filter((_, index) => index !== Number(remove)));
      downloadsPage();
    }
  };
}

addEventListener('message', (event) => {
  if (event.data?.type !== 'DOWNLOAD_UPDATE') return;
  const task = event.data.task;
  const next = metas().map((item) => item.taskId === task.taskId ? { ...item, ...task, size: task.received || item.size || 0 } : item);
  saveMetas(next);
  const row = document.querySelector(`[data-task="${task.taskId}"]`);
  if (row) {
    const small = row.querySelector('small');
    if (small) small.textContent = task.status === 'done' ? `${fmt(task.received || 0)} · Ready` : task.status === 'error' ? `Error · ${task.error || 'Download failed'}` : `${task.status === 'downloading' ? 'Downloading' : 'Queued'} · ${fmt(task.received || 0)}${task.total ? ` / ${fmt(task.total)}` : ''}`;
  }
  if ((task.status === 'done' || task.status === 'error') && location.hash === '#/downloads') downloadsPage();
});

function aboutPage() {
  app.innerHTML = `<section class="page-heading"><span class="eyebrow">The way you watch</span><h1>Stories, on your terms.</h1><p>A cinematic web app for browsing, streaming and saving titles for private offline playback.</p></section><div class="feature-grid"><div><b>Watch</b><span>Quality controls, subtitles and browser-native playback.</span></div><div><b>Save</b><span>Downloads stay inside your browser’s private storage.</span></div><div><b>Every screen</b><span>Designed for phones first, with desktop room to breathe.</span></div></div><div class="social-row"><a href="https://instagram.com/try_it_nah" target="_blank" rel="noreferrer">◎ Instagram · @try_it_nah</a><span id="whatsapp-link"></span></div>`;
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
addEventListener('online', maybeRecommend);
setTimeout(maybeRecommend, 2500);
