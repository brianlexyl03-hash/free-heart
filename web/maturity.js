// 18+ labelling, prior-notice gate and optional hide filter.
// The media source sends no age ratings, so labels come from (1) keywords in the title/synopsis and (2) the viewer's own marks.

const SEXUAL = [
  /\b(porn\w*|xxx|hentai|erotic\w*|softcore|nudity|nude|naked|orgy|orgies|sex|sexual\w*|sexy|stripper\w*|striptease|fetish\w*|bdsm|milf|onlyfans|playboy|kamasutra|lust|seduc\w*|uncens\w*)\b/i,
  /\b(adult content|explicit|mature content|18\+|x-rated|rated r)\b/i,
  /\b(escort|prostitut\w*|brothel|call girl)\b/i,
  /\b(intercourse|copulat\w*|penetrat\w*|arousal|climax)\b/i,
];

const VIOLENT = [
  /\b(gore|gory|slasher|torture|massacre|bloodbath|cannibal\w*|mutilat\w*)\b/i,
  /\bgraphic violence\b/i,
  /\b(extreme violence|brutal|slaughter|dismember\w*)\b/i,
];

const K_MODE = 'free.mature.mode', K_FLAG = 'free.18.flag', K_SAFE = 'free.18.safe', K_OK = 'free.18.ok';
const K_AGE_VERIFIED = 'free.18.verified';
const K_VERIFICATION_TIME = 'free.18.verified.time';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (store, key) => { try { return JSON.parse(store.getItem(key) || '[]'); } catch { return []; } };
const write = (store, key, v) => { try { store.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };
const add = (store, key, id) => { const a = read(store, key); if (id != null && !a.includes(id)) { a.push(id); write(store, key, a.slice(-500)); } };
const drop = (store, key, id) => write(store, key, read(store, key).filter((x) => x !== id));

export const getMode = () => (localStorage.getItem(K_MODE) === 'hide' ? 'hide' : 'label');
export const setMode = (m) => { try { localStorage.setItem(K_MODE, m === 'hide' ? 'hide' : 'label'); } catch { /* ignore */ } };
export const markConfirmed = (id) => add(sessionStorage, K_OK, id);
export const isConfirmed = (id) => read(sessionStorage, K_OK).includes(id);
export function flag(id) { drop(localStorage, K_SAFE, id); add(localStorage, K_FLAG, id); }
export function unflag(id) { drop(localStorage, K_FLAG, id); add(localStorage, K_SAFE, id); }

export const setAgeVerified = (verified = true) => {
  try {
    if (verified) {
      localStorage.setItem(K_AGE_VERIFIED, 'true');
      localStorage.setItem(K_VERIFICATION_TIME, String(Date.now()));
    } else {
      localStorage.removeItem(K_AGE_VERIFIED);
      localStorage.removeItem(K_VERIFICATION_TIME);
    }
  } catch { /* ignore */ }
};

export const isAgeVerified = () => {
  try {
    return localStorage.getItem(K_AGE_VERIFIED) === 'true';
  } catch {
    return false;
  }
};

// item: { id, title, overview }
export function info(item = {}) {
  const id = item.id;
  const text = `${item.title || ''} ${item.overview || ''}`;
  if (id != null && read(localStorage, K_SAFE).includes(id)) return { mature: false, reasons: [], auto: false, manual: false, safe: true };
  const reasons = [];
  if (SEXUAL.some((r) => r.test(text))) reasons.push('Sexual content or nudity');
  if (VIOLENT.some((r) => r.test(text))) reasons.push('Graphic violence');
  const manual = id != null && read(localStorage, K_FLAG).includes(id);
  if (manual) reasons.push('Marked 18+ by you');
  return { mature: reasons.length > 0, reasons, auto: reasons.length > 0 && !manual, manual, safe: false };
}

export function confirmAccess({ id, title, reasons = [] }) {
  const hide = getMode() === 'hide';
  if (!hide && isConfirmed(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    document.querySelector('.age-gate')?.remove();
    const el = document.createElement('div');
    el.className = 'age-gate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const reasonsList = reasons.length ? `<ul class="age-reasons">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
    el.innerHTML = `<div class="age-card"><div class="age-badge">18+</div><h3>${hide ? 'Hidden by your 18+ filter' : 'Mature content ahead'}</h3><p class="age-title">“${esc(title)}”</p><p>${hide ? 'This title is hidden by your safety filter.' : 'This title contains mature content:'}</p>${reasonsList}<p class="age-confirm">Please confirm that you are 18 years or older and wish to continue.</p><div class="age-buttons"><button class="age-btn age-no" data-go="0">Cancel</button><button class="age-btn age-yes" data-go="1">I am 18+, Continue</button></div><div class="age-footer"><label class="age-toggle"><input type="checkbox" id="age-toggle-hide" ${hide ? 'checked' : ''} /><span>Hide mature titles (strict mode)</span></label></div></div>`;
    document.body.appendChild(el);
    const done = (ok) => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      if (ok) { if (hide) setMode('label'); markConfirmed(id); setAgeVerified(true); }
      resolve(ok);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => {
      if (e.target === el) return done(false);
      const checkbox = e.target.closest('#age-toggle-hide');
      if (checkbox) {
        setMode(checkbox.checked ? 'hide' : 'label');
        return;
      }
      const b = e.target.closest('[data-go]');
      if (b) done(b.dataset.go === '1');
    });
    el.querySelector('[data-go="0"]').focus();
  });
}

export function initialAgeGate() {
  if (isAgeVerified()) return Promise.resolve(true);
  return new Promise((resolve) => {
    document.querySelector('.age-gate')?.remove();
    const el = document.createElement('div');
    el.className = 'age-gate age-gate-initial';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="age-card"><div class="age-badge large">18+</div><h3>Age Verification Required</h3><p>This service may contain mature content including sexual and violent material.</p><p>You must be at least 18 years old to continue.</p><div class="age-buttons"><button class="age-btn age-no" data-go="0">I am under 18</button><button class="age-btn age-yes" data-go="1">I am 18 or older</button></div></div>`;
    document.body.appendChild(el);
    const done = (ok) => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      if (ok) setAgeVerified(true);
      resolve(ok);
    };
    const onKey = (e) => { if (e.key === 'Escape') return; if (e.key === 'Enter') done(true); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => {
      if (e.target === el) return;
      const b = e.target.closest('[data-go]');
      if (b) done(b.dataset.go === '1');
    });
    el.querySelector('[data-go="0"]').focus();
  });
}
