// 18+ labelling, prior-notice gate and optional hide filter.
// The media source sends no age ratings, so labels come from (1) keywords in the title/synopsis and (2) the viewer's own marks.
const SEXUAL = [/\b(porn\w*|xxx|hentai|erotic\w*|softcore|nudity|nude|naked|orgy|orgies|sex|sexual\w*|sexy|stripper\w*|striptease|fetish\w*|bdsm|milf|onlyfans|playboy|kamasutra|lust|seduc\w*|uncensored|unrated|nc-17|explicit)\b/i, /\b(adult|adults|call) (film|films|video|videos|movie|movies|only|girl|girls)\b/i, /(^|\s)18\+/, /\brated r\b|\br-rated\b|\btv-ma\b/i];
const VIOLENT = [/\b(gore|gory|slasher|torture|massacre|bloodbath|cannibal\w*|mutilat\w*)\b/i, /\bgraphic violence\b/i];
const K_MODE = 'free.mature.mode', K_FLAG = 'free.18.flag', K_SAFE = 'free.18.safe', K_OK = 'free.18.ok';
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

// Prior-notice dialog. Resolves true only if the viewer confirms they are 18+ and want to continue.
export function confirmAccess({ id, title, reasons = [] }) {
  const hide = getMode() === 'hide';
  if (!hide && isConfirmed(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    document.querySelector('.age-gate')?.remove();
    const el = document.createElement('div');
    el.className = 'age-gate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="age-card"><div class="age-badge">18+</div><h3>${hide ? 'Hidden by your 18+ filter' : 'Mature content ahead'}</h3><p class="age-title">“${esc(title)}”</p><p>${hide ? 'You asked to hide mature titles. Turn the filter off to open this one.' : 'This title is labelled 18+ and may not be suitable for everyone.'}</p>${reasons.length ? `<ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}<p class="age-small">Only continue if you are 18 or older and choose to see this. Labels are automatic and can be wrong.</p><div class="age-actions"><button class="primary" data-go="1">${hide ? 'Turn filter off &amp; continue' : 'I’m 18 or older — continue'}</button><button class="secondary" data-go="0">Go back</button></div></div>`;
    document.body.appendChild(el);
    const done = (ok) => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      if (ok) { if (hide) setMode('label'); markConfirmed(id); }
      resolve(ok);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', (e) => { if (e.target === el) return done(false); const b = e.target.closest('[data-go]'); if (b) done(b.dataset.go === '1'); });
    el.querySelector('[data-go="0"]').focus();
  });
}
