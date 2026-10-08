// VLC-style mobile player for free. Gestures: left half vertical = brightness, right half vertical = volume,
// horizontal = seek, double-tap sides = +/-10s, double-tap centre / two-finger tap = play/pause, pinch = zoom.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
const fmtBytes = (n) => !n ? '—' : n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(`free.vp.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`free.vp.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const IC = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  fs: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  fsx: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  unlock: 'M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z',
  rotate: 'M16.48 2.52c3.27 1.55 5.61 4.72 5.97 8.48h1.5C23.44 4.84 18.29 0 12 0l-.66.03 3.81 3.81 1.33-1.32zm-6.25-.77c-.59-.59-1.54-.59-2.12 0L1.75 8.11c-.59.59-.59 1.54 0 2.12l12.02 12.02c.59.59 1.54.59 2.12 0l6.36-6.36c.59-.59.59-1.54 0-2.12L10.23 1.75zm4.6 19.44L2.81 9.17l6.36-6.36 12.02 12.02-6.36 6.36zm-7.31.29C4.25 19.94 1.91 16.76 1.55 13H.05C.56 19.16 5.71 24 12 24l.66-.03-3.81-3.81-1.33 1.32z',
  pip: 'M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z',
  info: 'M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  cc: 'M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z',
  aspect: 'M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z',
  vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  mute: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  sun: 'M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z',
  speed: 'M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.44zm-9.79 6.84a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z',
  seek: 'M6 6l8.5 6L6 18V6zm9 0h2v12h-2V6z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
};
const svg = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n]}"/></svg>`;
const ASPECTS = [['fit', 'Fit (original shape)'], ['fill', 'Fill (crop edges)'], ['stretch', 'Stretch to screen'], ['16:9', '16:9'], ['4:3', '4:3'], ['21:9', '21:9']];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const MAX_VOL = 2; // 200 % like VLC (above 100 % uses an audio gain stage)

export function mountPlayer(host, opts) {
  host.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'vp vp-show';
  root.tabIndex = 0;
  root.innerHTML = `
    <video class="vp-video" playsinline preload="auto"></video>
    <div class="vp-touch"></div>
    <div class="vp-hud" hidden><span class="vp-hud-ico"></span><div class="vp-hud-bar"><i></i></div><b class="vp-hud-val"></b></div>
    <div class="vp-ripple vp-ripple-l"><span></span></div><div class="vp-ripple vp-ripple-r"><span></span></div>
    <div class="vp-spinner" hidden></div>
    <div class="vp-err" hidden><b class="vp-err-title">Playback problem</b><span class="vp-err-msg"></span><div class="vp-err-actions"><button class="vp-pill" data-act="retry">Try again</button></div></div>
    <div class="vp-ui">
      <div class="vp-top">
        <span class="vp-title"></span>
        <button class="vp-btn" data-act="quality" hidden><b class="vp-qlabel">HD</b><span>Quality</span></button>
        <button class="vp-btn" data-act="speed">${svg('speed')}<span class="vp-speed-label">1×</span></button>
        <button class="vp-btn" data-act="subs">${svg('cc')}<span>Subtitles</span></button>
        <button class="vp-btn" data-act="info">${svg('info')}<span>Info</span></button>
        <button class="vp-btn" data-act="clip"><span class="vp-clip-icon">✂</span><span>Clip</span></button>
      </div>
      <div class="vp-center">
        <button class="vp-round" data-act="back">−10</button>
        <button class="vp-round vp-big" data-act="play" aria-label="Play or pause"></button>
        <button class="vp-round" data-act="fwd">+10</button>
      </div>
      <div class="vp-bottom">
        <div class="vp-seekrow"><span class="vp-cur">0:00</span><div class="vp-bar" role="slider" aria-label="Seek"><div class="vp-buf"></div><div class="vp-prog"></div><div class="vp-thumb"></div></div><span class="vp-dur">0:00</span></div>
        <div class="vp-btns">
          <button class="vp-btn" data-act="touchlock">${svg('lock')}<span>Lock controls</span></button>
          <button class="vp-btn" data-act="rotlock"><span class="vp-rot-ico"></span><span class="vp-rot-label">Auto-rotate</span></button>
          <button class="vp-btn" data-act="rotate">${svg('rotate')}<span>Rotate</span></button>
          <button class="vp-btn" data-act="aspect">${svg('aspect')}<span class="vp-aspect-label">Fit</span></button>
          <button class="vp-btn" data-act="pip">${svg('pip')}<span>PiP</span></button>
          <button class="vp-btn" data-act="fs"><span class="vp-fs-ico"></span><span>Fullscreen</span></button>
        </div>
      </div>
    </div>
    <button class="vp-pill vp-unlock" data-act="untouchlock" hidden>${svg('unlock')} Tap to unlock controls</button>
    <div class="vp-toast" hidden></div>
    <div class="vp-menu" hidden><div class="vp-menu-card"><div class="vp-menu-head"><b></b><button class="vp-x" data-act="menuclose" aria-label="Close">${svg('close')}</button></div><div class="vp-menu-list"></div></div></div>
    <div class="vp-infop" hidden><div class="vp-menu-card"><div class="vp-menu-head"><b>Media information</b><button class="vp-x" data-act="infoclose" aria-label="Close">${svg('close')}</button></div><div class="vp-info-body"></div></div></div>`;
  host.appendChild(root);

  const q = (s) => root.querySelector(s);
  const video = q('.vp-video');
  const touch = q('.vp-touch');
  const hudEl = q('.vp-hud');
  const spinner = q('.vp-spinner');
  const errBox = q('.vp-err');
  const toastEl = q('.vp-toast');
  const menuEl = q('.vp-menu');
  const infoEl = q('.vp-infop');
  const bar = q('.vp-bar');
  video.controls = false;
  q('.vp-title').textContent = opts.title || '';

  // ---------- state ----------
  let src = opts.src;
  let tracks = opts.tracks || [];
  let qualities = opts.qualities || [];
  let qualitySel = opts.selectedQuality;
  let startAt = opts.startAt || 0;
  let level = clamp(store.get('volume', 1), 0, MAX_VOL);
  let brightness = clamp(store.get('brightness', 1), 0.2, 1.5);
  let aspect = 'fit';
  let zoom = 1;
  let locked = false;
  let rotLocked = false;
  let autoRetried = false;
  let destroyed = false;
  let hideTimer = 0, hudTimer = 0, toastTimer = 0, unlockTimer = 0, infoTimer = 0, lastProgress = 0;
  let probeInfo = opts.info ? { ...opts.info } : null;
  let ctx = null, gain = null, wl = null;

  // ---------- small helpers ----------
  const toast = (msg, ms = 2400) => { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms); };
  const menuOpen = () => !menuEl.hidden || !infoEl.hidden;
  function showUI(auto = true) {
    if (locked) return;
    root.classList.add('vp-show');
    clearTimeout(hideTimer);
    if (auto && !video.paused && !menuOpen()) hideTimer = setTimeout(() => root.classList.remove('vp-show'), 3500);
  }
  function hideUI() { if (!video.paused && !menuOpen()) root.classList.remove('vp-show'); }
  function toggleUI() { if (root.classList.contains('vp-show') && !video.paused) { clearTimeout(hideTimer); root.classList.remove('vp-show'); } else showUI(true); }
  const togglePlay = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); showUI(true); };

  function hud(kind, text, frac) {
    const side = kind === 'brightness' ? 'l' : kind === 'volume' ? 'r' : 'c';
    hudEl.className = `vp-hud vp-hud-${side}`;
    hudEl.hidden = false;
    const icon = kind === 'brightness' ? 'sun' : kind === 'volume' ? (level === 0 ? 'mute' : 'vol') : kind === 'seek' ? 'seek' : 'aspect';
    q('.vp-hud-ico').innerHTML = svg(icon);
    q('.vp-hud-val').textContent = text;
    const f = clamp(frac, 0, 1) * 100;
    q('.vp-hud-bar i').style.cssText = side === 'c' ? `left:0;top:0;height:100%;width:${f}%` : `left:0;bottom:0;width:100%;height:${f}%`;
    clearTimeout(hudTimer);
  }
  const hideHud = (ms = 600) => { clearTimeout(hudTimer); hudTimer = setTimeout(() => { hudEl.hidden = true; }, ms); };

  // ---------- volume (0-200 %) and brightness (20-150 %) ----------
  function ensureGain() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      const node = ctx.createMediaElementSource(video);
      gain = ctx.createGain();
      node.connect(gain).connect(ctx.destination);
      return true;
    } catch { ctx = null; gain = null; return false; }
  }
  function setVolume(v, show) {
    level = clamp(v, 0, MAX_VOL);
    video.muted = level === 0;
    video.volume = Math.min(1, level);
    if (level > 1 || gain) {
      if (ensureGain()) { gain.gain.value = Math.max(1, level); ctx.state === 'suspended' && ctx.resume().catch(() => {}); }
    }
    store.set('volume', level);
    if (show) hud('volume', `${Math.round(level * 100)}%`, level / MAX_VOL);
  }
  function setBrightness(b, show) {
    brightness = clamp(b, 0.2, 1.5);
    video.style.filter = `brightness(${brightness})`;
    store.set('brightness', brightness);
    if (show) hud('brightness', `${Math.round(brightness * 100)}%`, (brightness - 0.2) / 1.3);
  }

  // ---------- aspect / stretch / zoom ----------
  function applyAspect() {
    const W = root.clientWidth, H = root.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
    let sx = 1, sy = 1, fit = 'contain';
    if (aspect === 'fill') fit = 'cover';
    else if (aspect === 'stretch') fit = 'fill';
    else if (aspect.includes(':') && vw && vh && W && H) {
      const [a, b] = aspect.split(':').map(Number);
      const tr = a / b, vr = vw / vh;
      const [dw, dh] = W / H > vr ? [H * vr, H] : [W, W / vr];
      const [tw, th] = W / H > tr ? [H * tr, H] : [W, W / tr];
      sx = tw / dw; sy = th / dh;
    }
    video.style.objectFit = fit;
    video.style.transform = `scale(${sx * zoom},${sy * zoom})`;
    const label = ASPECTS.find((a) => a[0] === aspect)?.[0] || 'fit';
    q('.vp-aspect-label').textContent = label === 'fit' ? 'Fit' : label === 'fill' ? 'Fill' : label === 'stretch' ? 'Stretch' : label;
  }
  function setAspect(a) { aspect = a; applyAspect(); const nm = ASPECTS.find((x) => x[0] === a)?.[1] || a; hud('aspect', nm, 1); hideHud(900); }

  // ---------- rotation / touch lock / fullscreen ----------
  const orient = () => screen.orientation;
  function paintRot() {
    q('.vp-rot-ico').innerHTML = svg(rotLocked ? 'lock' : 'unlock');
    q('.vp-rot-label').textContent = rotLocked ? 'Rotation locked' : 'Auto-rotate';
    q('[data-act="rotlock"]').classList.toggle('vp-on', rotLocked);
  }
  async function lockOrientation(type) {
    const o = orient();
    if (!o?.lock) { toast('Rotation lock needs Chrome on Android (not supported here)'); return false; }
    try {
      if (!document.fullscreenElement) await root.requestFullscreen();
      await o.lock(type);
      rotLocked = true; paintRot(); return true;
    } catch (e) { toast(`Rotation lock unavailable: ${e.message || e.name}`); return false; }
  }
  function unlockOrientation() { try { orient()?.unlock?.(); } catch { /* ignore */ } rotLocked = false; paintRot(); }
  function paintFs() { const on = document.fullscreenElement === root; q('.vp-fs-ico').innerHTML = svg(on ? 'fsx' : 'fs'); root.classList.toggle('vp-fs', on); }
  async function toggleFs() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.requestFullscreen(); }
    catch { toast('Fullscreen is not available in this browser'); }
  }
  function setTouchLock(on) {
    locked = on;
    root.classList.toggle('vp-locked', on);
    q('.vp-unlock').hidden = !on;
    q('.vp-unlock').classList.remove('vp-unlock-show');
    if (on) { root.classList.remove('vp-show'); hideHud(0); toast('Controls locked. Tap the screen, then tap unlock.', 2600); } else showUI(true);
  }
  function flashUnlock() {
    const u = q('.vp-unlock'); u.classList.add('vp-unlock-show');
    clearTimeout(unlockTimer); unlockTimer = setTimeout(() => u.classList.remove('vp-unlock-show'), 3000);
  }

  // ---------- seeking ----------
  function skip(sec, side) {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = clamp(video.currentTime + sec, 0, video.duration);
    const r = q(`.vp-ripple-${side}`);
    r.querySelector('span').textContent = `${sec > 0 ? '+' : '−'}${Math.abs(sec)}s`;
    r.classList.remove('go'); void r.offsetWidth; r.classList.add('go');
  }
  const setProg = (p) => { q('.vp-prog').style.width = `${p * 100}%`; q('.vp-thumb').style.left = `${p * 100}%`; };
  let scrubbing = false;
  const barPos = (e) => { const r = bar.getBoundingClientRect(); return clamp((e.clientX - r.left) / (r.width || 1), 0, 1); };
  bar.addEventListener('pointerdown', (e) => { if (!Number.isFinite(video.duration)) return; scrubbing = true; bar.setPointerCapture(e.pointerId); const p = barPos(e); setProg(p); q('.vp-cur').textContent = fmtT(p * video.duration); showUI(false); e.stopPropagation(); });
  bar.addEventListener('pointermove', (e) => { if (!scrubbing) return; const p = barPos(e); setProg(p); q('.vp-cur').textContent = fmtT(p * video.duration); });
  const endScrub = (e) => { if (!scrubbing) return; scrubbing = false; video.currentTime = barPos(e) * video.duration; showUI(true); };
  bar.addEventListener('pointerup', endScrub);
  bar.addEventListener('pointercancel', () => { scrubbing = false; });

  // ---------- touch gestures ----------
  const pointers = new Map();
  let g = null, pinch = null, suppress = false, twoAt = 0, twoMoved = false, lastTap = null, tapTimer = 0;
  touch.addEventListener('pointerdown', (e) => {
    try { touch.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (locked) return;
    if (pointers.size === 2) {
      twoAt = Date.now(); twoMoved = false; g = null; suppress = true; clearTimeout(tapTimer); lastTap = null;
      const [a, b] = [...pointers.values()];
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom };
      return;
    }
    if (pointers.size > 2) return;
    const r = root.getBoundingClientRect();
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), left: e.clientX - r.left < r.width / 2, mode: null, b0: brightness, v0: level, c0: video.currentTime, target: null, r };
  });
  touch.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (locked) return;
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (Math.abs(d - pinch.d0) > 10) twoMoved = true;
      if (twoMoved) { zoom = clamp(pinch.z0 * (d / pinch.d0), 1, 4); applyAspect(); hud('aspect', `Zoom ${Math.round(zoom * 100)}%`, (zoom - 1) / 3); }
      return;
    }
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.mode) {
      if (Math.hypot(dx, dy) < 14) return;
      g.mode = Math.abs(dy) > Math.abs(dx) ? 'v' : (Number.isFinite(video.duration) ? 'h' : 'x');
      root.classList.remove('vp-show');
    }
    if (g.mode === 'v') {
      const delta = -dy / (g.r.height * 0.8);
      if (g.left) setBrightness(g.b0 + delta * 1.3, true); else setVolume(g.v0 + delta * 1.5, true);
    } else if (g.mode === 'h') {
      const secs = (dx / g.r.width) * 120;
      g.target = clamp(g.c0 + secs, 0, video.duration);
      const diff = g.target - g.c0;
      hud('seek', `${diff >= 0 ? '+' : '−'}${fmtT(Math.abs(diff))}  →  ${fmtT(g.target)}`, g.target / video.duration);
    }
  });
  function endTouch(e) {
    if (!pointers.delete(e.pointerId)) return;
    if (locked) { if (!pointers.size) flashUnlock(); return; }
    if (pinch) {
      if (pointers.size < 2) { const quick = Date.now() - twoAt < 300 && !twoMoved; pinch = null; hideHud(700); if (quick) togglePlay(); }
      if (!pointers.size) suppress = false;
      return;
    }
    if (suppress) { if (!pointers.size) suppress = false; return; }
    if (!g || g.id !== e.pointerId) return;
    const gg = g; g = null;
    if (gg.mode === 'h') { if (gg.target != null) video.currentTime = gg.target; hideHud(500); return; }
    if (gg.mode === 'v') { hideHud(700); return; }
    if (gg.mode === 'x') return;
    if (Date.now() - gg.t0 > 400) return;
    const now = Date.now();
    if (lastTap && now - lastTap.t < 300 && Math.abs(e.clientX - lastTap.x) < 70) {
      clearTimeout(tapTimer); lastTap = null;
      const x = e.clientX - gg.r.left;
      if (x < gg.r.width * 0.35) skip(-10, 'l'); else if (x > gg.r.width * 0.65) skip(10, 'r'); else togglePlay();
    } else {
      lastTap = { t: now, x: e.clientX };
      tapTimer = setTimeout(() => { lastTap = null; toggleUI(); }, 300);
    }
  }
  touch.addEventListener('pointerup', endTouch);
  touch.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); g = null; if (!pointers.size) { pinch = null; suppress = false; } });
  touch.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- menus & info ----------
  function openMenu(title, items) {
    q('.vp-menu-head b').textContent = title;
    const list = q('.vp-menu-list');
    list.innerHTML = items.map((it, i) => `<button class="vp-item ${it.on ? 'vp-on' : ''}" data-i="${i}"><span>${esc(it.label)}</span>${it.on ? '<em>✓</em>' : ''}</button>`).join('') || '<div class="vp-empty">Nothing available</div>';
    list.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const it = items[Number(b.dataset.i)]; menuEl.hidden = true; it.pick(); showUI(true); };
    menuEl.hidden = false; clearTimeout(hideTimer); root.classList.add('vp-show');
  }
  const closeMenu = () => { menuEl.hidden = true; showUI(true); };
  function subsMenu() {
    const list = [...video.textTracks];
    const items = [{ label: 'Off', on: list.every((t) => t.mode !== 'showing'), pick: () => list.forEach((t) => { t.mode = 'disabled'; }) }]
      .concat(list.map((t, i) => ({ label: t.label || `Track ${i + 1}`, on: t.mode === 'showing', pick: () => list.forEach((x) => { x.mode = x === t ? 'showing' : 'disabled'; }) })));
    openMenu('Subtitles', items);
  }
  const speedMenu = () => openMenu('Playback speed', SPEEDS.map((s) => ({ label: `${s}×`, on: video.playbackRate === s, pick: () => { video.playbackRate = s; q('.vp-speed-label').textContent = `${s}×`; toast(`Speed ${s}×`, 1200); } })));
  const aspectMenu = () => openMenu('Aspect ratio / stretch', ASPECTS.map((a) => ({ label: a[1], on: aspect === a[0], pick: () => setAspect(a[0]) })).concat([{ label: `Reset zoom (now ${Math.round(zoom * 100)}%)`, on: false, pick: () => { zoom = 1; applyAspect(); } }]));
  const qualityMenu = () => openMenu('Quality', qualities.map((r) => ({ label: r >= 2160 ? '4K (2160p)' : `${r}p`, on: Number(r) === Number(qualitySel), pick: () => opts.onQuality?.(r) })));

  async function probe() {
    if (probeInfo || opts.probe === false || !src || src.startsWith('blob:')) return;
    probeInfo = {};
    try {
      const r = await fetch(src, { headers: { range: 'bytes=0-0' } });
      probeInfo.status = r.status;
      probeInfo.mime = r.headers.get('content-type') || '';
      const cr = r.headers.get('content-range');
      probeInfo.size = cr ? Number(cr.split('/')[1]) || 0 : Number(r.headers.get('content-length')) || 0;
      probeInfo.ranges = r.headers.get('accept-ranges') === 'bytes' || r.status === 206;
      try { await r.body?.cancel(); } catch { /* ignore */ }
    } catch { /* leave empty */ }
  }
  function infoRows() {
    const vw = video.videoWidth, vh = video.videoHeight, d = video.duration;
    const bufEnd = (() => { for (let i = 0; i < video.buffered.length; i++) if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) return video.buffered.end(i); return video.currentTime; })();
    const qlt = video.getVideoPlaybackQuality?.();
    const size = probeInfo?.size || 0;
    const mbps = size && Number.isFinite(d) && d > 0 ? ((size * 8) / d / 1e6).toFixed(2) : '';
    const ratio = vw && vh ? (vw / vh).toFixed(2) + ':1' : '—';
    const audio = video.audioTracks?.length ? [...video.audioTracks].map((t) => t.label || t.language || 'track').join(', ') : 'Default track';
    const texts = [...video.textTracks];
    return [
      ['Title', opts.title || '—'],
      ['Source type', opts.kind === 'hls' ? 'HLS adaptive stream' : opts.kind === 'local' ? 'Saved offline file' : 'Direct file (progressive)'],
      ['Container / MIME', (probeInfo?.mime || '—').split(';')[0] || '—'],
      ['File size', fmtBytes(size)],
      ['Video resolution', vw ? `${vw} × ${vh}` : 'Not loaded'],
      ['Chosen quality', qualitySel ? `${qualitySel}p` : '—'],
      ['Source aspect ratio', ratio],
      ['Display mode', `${ASPECTS.find((a) => a[0] === aspect)?.[1]} · zoom ${Math.round(zoom * 100)}%`],
      ['Duration', Number.isFinite(d) ? fmtT(d) : 'Live / unknown'],
      ['Position', fmtT(video.currentTime)],
      ['Buffered ahead', `${Math.max(0, Math.round(bufEnd - video.currentTime))} s`],
      ['Average bitrate', mbps ? `${mbps} Mbps` : '—'],
      ['Frames shown / dropped', qlt ? `${qlt.totalVideoFrames} / ${qlt.droppedVideoFrames}` : 'Not reported'],
      ['Speed', `${video.playbackRate}×`],
      ['Volume', `${Math.round(level * 100)}%${level > 1 ? ' (boosted)' : ''}`],
      ['Brightness', `${Math.round(brightness * 100)}% (screen filter)`],
      ['Audio tracks', audio],
      ['Subtitle tracks', texts.length ? texts.map((t) => `${t.label || 'Track'}${t.mode === 'showing' ? ' ✓' : ''}`).join(', ') : 'None'],
      ['Range requests (seeking)', probeInfo?.ranges === undefined ? '—' : probeInfo.ranges ? 'Supported' : 'Not supported'],
    ];
  }
  function paintInfo() { q('.vp-info-body').innerHTML = `<table>${infoRows().map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`; }
  async function openInfo() {
    infoEl.hidden = false; clearTimeout(hideTimer); root.classList.add('vp-show'); paintInfo();
    clearInterval(infoTimer); infoTimer = setInterval(paintInfo, 1000);
    await probe(); paintInfo();
  }
  function closeInfo() { infoEl.hidden = true; clearInterval(infoTimer); showUI(true); }

  // ---------- errors / retry ----------
  async function explain() {
    const codes = { 1: 'Playback was cancelled.', 2: 'The network dropped while loading the video.', 3: 'The video could not be decoded.', 4: 'The video source could not be loaded.' };
    let msg = codes[video.error?.code] || 'The video could not be played.';
    if (src && src.startsWith('blob:')) return 'This saved file uses a format or codec this browser cannot play (common with .mkv). Delete it and download another quality, or open it in VLC.';
    if (src && !src.startsWith('blob:')) {
      try {
        const r = await fetch(src, { headers: { range: 'bytes=0-0' } });
        if (!r.ok) { const b = await r.json().catch(() => ({})); msg = `${b.message || 'The source refused the request'} (HTTP ${r.status})`; }
        try { await r.body?.cancel(); } catch { /* ignore */ }
      } catch { msg = 'Could not reach the server. Check your connection and try again.'; }
    }
    return msg;
  }
  async function retry(auto) {
    errBox.hidden = true; spinner.hidden = false;
    try {
      const next = opts.onRetry ? await opts.onRetry() : null;
      if (next?.src) { setSource(next.src, { startAt: video.currentTime || startAt, tracks: next.tracks }); return; }
      video.load();
    } catch (e) { showError(e.message || 'Could not refresh the stream.'); }
  }
  function showError(msg) { spinner.hidden = true; errBox.hidden = false; q('.vp-err-msg').textContent = msg; root.classList.add('vp-show'); }
  video.addEventListener('error', async () => {
    if (destroyed || !video.getAttribute('src')) return;
    if (!autoRetried && opts.onRetry) { autoRetried = true; await retry(true); return; }
    showError(await explain());
  });

  // ---------- media element wiring ----------
  const paintPlay = () => { q('.vp-big').innerHTML = svg(video.paused ? 'play' : 'pause'); };
  function paintTime() {
    const d = video.duration;
    if (!scrubbing) { q('.vp-cur').textContent = fmtT(video.currentTime); setProg(Number.isFinite(d) && d > 0 ? video.currentTime / d : 0); }
    q('.vp-dur').textContent = Number.isFinite(d) ? fmtT(d) : 'LIVE';
    let end = 0;
    for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime + 0.5) end = Math.max(end, video.buffered.end(i));
    q('.vp-buf').style.width = `${Number.isFinite(d) && d > 0 ? (end / d) * 100 : 0}%`;
  }
  async function wake() { try { if ('wakeLock' in navigator && !wl && !video.paused) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } } catch { /* denied */ } }
  const unwake = () => { try { wl?.release(); } catch { /* ignore */ } wl = null; };
  video.addEventListener('play', () => { paintPlay(); showUI(true); wake(); if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); });
  video.addEventListener('pause', () => { paintPlay(); showUI(false); unwake(); });
  video.addEventListener('ended', () => { paintPlay(); showUI(false); unwake(); });
  video.addEventListener('waiting', () => { spinner.hidden = false; });
  video.addEventListener('seeking', () => { spinner.hidden = false; });
  for (const ev of ['playing', 'canplay', 'seeked']) video.addEventListener(ev, () => { spinner.hidden = true; errBox.hidden = true; });
  video.addEventListener('loadedmetadata', () => {
    applyAspect();
    if (startAt > 5 && Number.isFinite(video.duration) && startAt < video.duration - 30) video.currentTime = startAt;
    startAt = 0; paintTime();
  });
  video.addEventListener('durationchange', paintTime);
  video.addEventListener('progress', paintTime);
  video.addEventListener('timeupdate', () => {
    paintTime();
    const now = Date.now();
    if (now - lastProgress > 4000) { lastProgress = now; opts.onProgress?.(video.currentTime, video.duration); }
  });
  document.addEventListener('visibilitychange', onVis);
  function onVis() { if (document.visibilityState === 'visible') wake(); }
  const onFs = () => { paintFs(); if (!document.fullscreenElement && rotLocked) { rotLocked = false; paintRot(); } applyAspect(); };
  document.addEventListener('fullscreenchange', onFs);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(applyAspect) : null;
  ro?.observe(root);

  function loadTracks() {
    video.querySelectorAll('track').forEach((t) => t.remove());
    tracks.forEach((s, i) => {
      const t = document.createElement('track');
      t.kind = 'subtitles'; t.label = s.label || s.lang || `Track ${i + 1}`; t.srclang = s.srclang || 'und'; t.src = s.src;
      if (i === 0) t.default = true;
      video.appendChild(t);
    });
  }
  function setSource(next, o = {}) {
    src = next; startAt = o.startAt || 0;
    if (o.tracks) tracks = o.tracks;
    if (o.qualities) qualities = o.qualities;
    if ('selectedQuality' in o) qualitySel = o.selectedQuality;
    q('[data-act="quality"]').hidden = !qualities.length;
    q('.vp-qlabel').textContent = qualitySel ? (qualitySel >= 2160 ? '4K' : `${qualitySel}p`) : 'HD';
    probeInfo = opts.info && next.startsWith('blob:') ? probeInfo : null;
    errBox.hidden = true; spinner.hidden = false;
    video.pause(); loadTracks();
    video.src = src; video.load();
    video.play().catch(() => { spinner.hidden = true; showUI(false); });
  }

  // ---------- buttons ----------
  const actions = {
    play: togglePlay,
    back: () => { skip(-10, 'l'); showUI(true); },
    fwd: () => { skip(10, 'r'); showUI(true); },
    quality: qualityMenu, speed: speedMenu, subs: subsMenu, info: openInfo, infoclose: closeInfo,
    aspect: aspectMenu, menuclose: closeMenu,
    fs: toggleFs,
    pip: async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else if (document.pictureInPictureEnabled) await video.requestPictureInPicture(); else throw new Error(); } catch { toast('Picture-in-Picture is not available here'); } },
    touchlock: () => setTouchLock(true),
    untouchlock: () => setTouchLock(false),
    rotlock: async () => { if (rotLocked) { unlockOrientation(); toast('Auto-rotate on — the screen can turn again'); } else if (await lockOrientation(orient()?.type || 'any')) toast('Rotation locked — the screen will not turn'); },
    rotate: async () => { const land = (orient()?.type || '').startsWith('landscape'); if (await lockOrientation(land ? 'portrait' : 'landscape')) toast(land ? 'Portrait (locked)' : 'Landscape (locked)'); },
    retry: () => retry(false),
    clip: () => opts.onClip?.(video),
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    e.stopPropagation();
    actions[b.dataset.act]?.();
  });
  root.addEventListener('keydown', onKey);
  function onKey(e) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const k = e.key;
    if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
    else if (k === 'f') toggleFs();
    else if (k === 'm') setVolume(level === 0 ? 1 : 0, true);
    else if (k === 'ArrowRight') { skip(10, 'r'); showUI(true); }
    else if (k === 'ArrowLeft') { skip(-10, 'l'); showUI(true); }
    else if (k === 'ArrowUp') { e.preventDefault(); setVolume(level + 0.05, true); hideHud(600); }
    else if (k === 'ArrowDown') { e.preventDefault(); setVolume(level - 0.05, true); hideHud(600); }
    else if (k === 'Escape' && menuOpen()) { closeMenu(); closeInfo(); }
  }
  root.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !locked) showUI(true); });

  // ---------- go ----------
  q('.vp-fs-ico').innerHTML = svg('fs'); paintPlay(); paintRot();
  setBrightness(brightness, false); setVolume(level, false); applyAspect();
  setSource(src, { startAt, tracks, qualities, selectedQuality: qualitySel });
  root.focus({ preventScroll: true });

  return {
    video, root,
    setSource,
    setQuality(list, sel) { qualities = list || qualities; qualitySel = sel; q('[data-act="quality"]').hidden = !qualities.length; q('.vp-qlabel').textContent = sel ? (sel >= 2160 ? '4K' : `${sel}p`) : 'HD'; },
    destroy() {
      destroyed = true;
      clearTimeout(hideTimer); clearTimeout(hudTimer); clearTimeout(toastTimer); clearTimeout(unlockTimer); clearTimeout(tapTimer); clearInterval(infoTimer);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onFs);
      ro?.disconnect(); unwake();
      try { if (rotLocked) orient()?.unlock?.(); } catch { /* ignore */ }
      try { if (document.fullscreenElement === root) document.exitFullscreen(); } catch { /* ignore */ }
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
      try { ctx?.close(); } catch { /* ignore */ }
      if (src?.startsWith('blob:')) URL.revokeObjectURL(src);
    },
  };
}
