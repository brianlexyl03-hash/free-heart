const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
const titleUrl = (id) => `#/title/${encodeURIComponent(id)}`;

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
  app.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">Your next obsession</span><h1>Watch something<br><em>unforgettable.</em></h1><p>Search a world of cinema and series, then press play.</p><div class="search-shell"><span>⌕</span><input id="q" type="search" placeholder="Search movies, shows, anime…" autocomplete="off"></div></div></section><section id="results" class="content-section"><div class="row-heading"><h2>Find your next story</h2><span>Search to explore</span></div><div class="notice">Start typing a title above.</div></section>`;
  const input = document.getElementById('q');
  const results = document.getElementById('results');
  let timer;
  async function search() {
    const query = input.value.trim();
    if (!query) { results.innerHTML = '<div class="row-heading"><h2>Find your next story</h2><span>Search to explore</span></div><div class="notice">Start typing a title above.</div>'; return; }
    results.innerHTML = '<div class="loading"><i></i><span>Finding your next watch…</span></div>';
    try { const data = await api(`/api/search?q=${encodeURIComponent(query)}`); results.innerHTML = renderCards(data.results, `Results for “${query}”`); }
    catch (error) { results.innerHTML = errBox(error); }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
  input.focus();
}

async function titlePage(id) {
  app.innerHTML = '<div class="loading"><i></i><span>Loading title…</span></div>';
  try {
    const data = await api(`/api/title/${encodeURIComponent(id)}`);
    const episodes = data.episodes || [];
    app.innerHTML = `<section class="detail-hero" style="--poster:url('${esc(data.poster || '')}')"><div class="detail-poster">${data.poster ? `<img src="${esc(data.poster)}" alt="">` : '<div class="poster-placeholder"></div>'}</div><div class="detail-copy"><span class="eyebrow">${esc(data.type || 'Feature')}</span><h1>${esc(data.title)}</h1><div class="meta"><span>${esc(data.year || '')}</span><span>HD</span><span>16+</span></div><p>${esc(data.overview || 'A new story is waiting for you.')}</p><div class="actions"><button id="play" class="primary">▶ Play</button><button id="download" class="secondary">⇩ Download</button></div>${episodes.length ? `<label class="episode-picker">Episode<select id="episode">${episodes.map((ep) => `<option value="${esc(ep.key)}">${esc(ep.label)}</option>`).join('')}</select></label>` : ''}<div id="title-status"></div></div></section><section class="content-section"><div class="row-heading"><h2>More details</h2></div><div class="detail-facts"><span><b>Title</b>${esc(data.title)}</span><span><b>Format</b>${esc(data.type || 'Movie')}</span><span><b>Offline</b>Private browser storage</span></div></section>`;
    const episode = () => document.getElementById('episode')?.value;
    document.getElementById('play').onclick = () => { location.hash = `#/watch/${encodeURIComponent(id)}${episode() ? `?ep=${encodeURIComponent(episode())}` : ''}`; };
    document.getElementById('download').onclick = () => download(id, episode(), data.title + (episode() ? ` · ${episode()}` : ''), document.getElementById('title-status'));
  } catch (error) { app.innerHTML = errBox(error); }
}

function playerMarkup(id, episode, resolved) {
  const tracks = (resolved.subtitles || []).map((s, i) => `<track kind="subtitles" srclang="${subtitleCode(s.lang)}" label="${esc(s.label)}" src="${esc(s.src)}" ${i ? '' : 'default'}>`).join('');
  return `<div class="player-top"><a href="${titleUrl(id)}" class="back">← Back to title</a><span class="player-badge">${resolved.kind === 'hls' ? 'LIVE STREAM' : 'STREAMING'}</span></div><div class="video-shell"><video id="player" controls playsinline autoplay src="${esc(resolved.stream)}">${tracks}</video></div><div class="player-controls"><div><span class="eyebrow">Now playing</span><h2>Choose your quality</h2></div>${qualitySelect(resolved.resolutions, resolved.selectedResolution)}</div><div id="player-message" class="notice subtle">${resolved.kind === 'hls' ? 'HLS playback depends on browser support. Safari and many mobile browsers support it natively.' : 'Quality selection changes the upstream stream without exposing its URL.'}</div>`;
}

async function watchPage(id, episode) {
  app.innerHTML = '<div class="loading"><i></i><span>Preparing your stream…</span></div>';
  try {
    let resolved = await resolveStream(id, episode);
    app.innerHTML = playerMarkup(id, episode, resolved);
    const player = document.getElementById('player');
    const message = document.getElementById('player-message');
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
  output.innerHTML = '<div class="loading compact"><i></i><span>Preparing download…</span></div>';
  try {
    const resolved = await resolveStream(id, episode, resolution);
    if (resolved.kind !== 'file') throw new Error('This source is HLS and cannot be saved as one file. Use Play instead.');
    const response = await fetch(resolved.stream);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || `The source rejected the download (HTTP ${response.status}). Try another quality.`);
    }
    const total = Number(response.headers.get('content-length')) || 0;
    const root = await navigator.storage.getDirectory();
    const file = `${Date.now()}.bin`;
    const writable = await (await root.getFileHandle(file, { create: true })).createWritable();
    output.innerHTML = '<div class="progress"><i></i></div><small id="progress-text">Starting…</small>';
    const bar = output.querySelector('i'), text = output.querySelector('#progress-text');
    const reader = response.body.getReader(); let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value); received += value.length;
        if (total) bar.style.width = `${(received / total * 100).toFixed(1)}%`;
        text.textContent = `${fmt(received)}${total ? ` / ${fmt(total)}` : ''}`;
      }
      await writable.close();
    } catch (error) { await writable.abort().catch(() => {}); await root.removeEntry(file).catch(() => {}); throw error; }
    saveMetas([...metas(), { name, file, size: received, date: Date.now(), type: response.headers.get('content-type') || 'video/mp4' }]);
    output.innerHTML = '<div class="notice success">Saved privately to Downloads.</div>';
  } catch (error) { output.innerHTML = errBox(error); }
}

async function downloadsPage() {
  const items = metas();
  app.innerHTML = `<section class="page-heading"><span class="eyebrow">Your library</span><h1>Downloads</h1><p>Private files saved in this browser only.</p></section>${items.length ? `<div class="download-list">${items.map((item, i) => `<div class="download-item"><div><b>${esc(item.name)}</b><small>${fmt(item.size)} · ${new Date(item.date).toLocaleDateString()}</small></div><div class="actions"><button data-play="${i}" class="secondary">Play</button><button data-delete="${i}" class="ghost">Delete</button></div></div>`).join('')}</div><div id="download-player"></div>` : '<div class="notice">No private downloads yet.</div>'}`;
  app.onclick = async (event) => {
    const play = event.target.dataset.play, remove = event.target.dataset.delete;
    if (play == null && remove == null) return;
    const root = await navigator.storage.getDirectory();
    if (play != null) {
      const file = await (await root.getFileHandle(items[play].file)).getFile();
      document.getElementById('download-player').innerHTML = `<video controls playsinline autoplay src="${URL.createObjectURL(new Blob([file], { type: items[play].type }))}"></video>`;
    } else {
      await root.removeEntry(items[remove].file).catch(() => {});
      saveMetas(items.filter((_, index) => index !== Number(remove)));
      downloadsPage();
    }
  };
}

function aboutPage() {
  app.innerHTML = `<section class="page-heading"><span class="eyebrow">The way you watch</span><h1>Stories, on your terms.</h1><p>A cinematic web app for browsing, streaming and saving titles for private offline playback.</p></section><div class="feature-grid"><div><b>Watch</b><span>Quality controls, subtitles and browser-native playback.</span></div><div><b>Save</b><span>Downloads stay inside your browser’s private storage.</span></div><div><b>Every screen</b><span>Designed for phones first, with desktop room to breathe.</span></div></div>`;
}

async function adminPage() {
  app.innerHTML = `<section class="page-heading"><span class="eyebrow">Owner controls</span><h1>Ad controls</h1><p>Set one short ad that is shown to all visitors before downloads and after long playback sessions.</p></section><form id="ad-form" class="admin-form"><input id="admin-password" type="password" placeholder="Admin password" required><input id="ad-url" type="url" placeholder="https://your-domain.example/ad.mp4" required><label>Duration<select id="ad-duration"><option value="1">1 second</option><option value="3">3 seconds</option><option value="5" selected>5 seconds</option><option value="7">7 seconds</option><option value="9">9 seconds</option></select></label><button class="primary">Publish ad to everyone</button><div id="admin-status"></div></form>`;
  document.getElementById('ad-form').onsubmit = async (event) => {
    event.preventDefault();
    const status = document.getElementById('admin-status');
    try {
      await api('/api/admin/ad', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': document.getElementById('admin-password').value }, body: JSON.stringify({ enabled: true, url: document.getElementById('ad-url').value, durationSeconds: Number(document.getElementById('ad-duration').value) }) });
      adConfigPromise = Promise.resolve({ enabled: true, url: document.getElementById('ad-url').value, durationSeconds: Number(document.getElementById('ad-duration').value) });
      status.innerHTML = '<div class="notice success">Ad published globally.</div>';
    } catch (error) { status.innerHTML = errBox(error); }
  };
}

function route() {
  app.onclick = null;
  const [segment, rawTail = ''] = location.hash.replace(/^#\//, '').split('/');
  if (segment === 'title') return titlePage(decodeURIComponent(rawTail));
  if (segment === 'watch') { const [rawId, query] = rawTail.split('?'); return watchPage(decodeURIComponent(rawId), new URLSearchParams(query).get('ep')); }
  if (segment === 'downloads') return downloadsPage();
  if (segment === 'about') return aboutPage();
  if (segment === 'admin') return adminPage();
  home();
}

addEventListener('hashchange', route);
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
