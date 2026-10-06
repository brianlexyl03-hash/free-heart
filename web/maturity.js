// 18+ labelling, prior-notice gate and optional hide filter.
// The media source sends no age ratings, so labels come from (1) keywords in the title/synopsis and (2) the viewer's own marks.
// STRICT MODE: Adult content is ALWAYS detected and ALWAYS requires confirmation before access.

const SEXUAL = [
  /\b(porn\w*|xxx|hentai|erotic\w*|softcore|nudity|nude|naked|orgy|orgies|sex|sexual\w*|sexy|stripper\w*|striptease|fetish\w*|bdsm|milf|onlyfans|playboy|kamasutra|lust|seduc\w*|uncens\w*)\b/i,
  /\b(adult (film|films|video|videos|movie|movies|only)|adults only)\b/i,
  /(^|\s)18\+/,
  /\b(adult content|explicit|mature content|x-rated|rated r|nc-17)\b/i,
  /\b(escort|prostitut\w*|brothel|call girl|sex worker)\b/i,
  /\b(intercourse|copulat\w*|penetrat\w*|arousal|climax|fornication)\b/i,
  /\b(nipple|genitalia|genitals|vulva|penis|testicle)\b/i,
];

const VIOLENT = [
  /\b(gore|gory|slasher|torture|massacre|bloodbath|cannibal\w*|mutilat\w*)\b/i,
  /\bgraphic violence\b/i,
  /\b(extreme violence|slaughter|dismember\w*|decapitat\w*)\b/i,
];

const K_MODE = 'free.mature.mode';
const K_FLAG = 'free.18.flag';
const K_SAFE = 'free.18.safe';
const K_OK = 'free.18.ok';
const K_AGE_VERIFIED = 'free.18.verified';
const K_VERIFICATION_TIME = 'free.18.verified.time';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const read = (store, key) => {
  try {
    return JSON.parse(store.getItem(key) || '[]');
  } catch {
    return [];
  }
};

const write = (store, key, v) => {
  try {
    store.setItem(key, JSON.stringify(v));
  } catch { /* private mode */ }
};

const add = (store, key, id) => {
  const a = read(store, key);
  if (id != null && !a.includes(id)) {
    a.push(id);
    write(store, key, a.slice(-500));
  }
};

const drop = (store, key, id) => write(store, key, read(store, key).filter((x) => x !== id));

export const getMode = () => (localStorage.getItem(K_MODE) === 'hide' ? 'hide' : 'label');
export const setMode = (m) => {
  try {
    localStorage.setItem(K_MODE, m === 'hide' ? 'hide' : 'label');
  } catch { /* ignore */ }
};

export const markConfirmed = (id) => add(sessionStorage, K_OK, id);
export const isConfirmed = (id) => read(sessionStorage, K_OK).includes(id);

export function flag(id) {
  drop(localStorage, K_SAFE, id);
  add(localStorage, K_FLAG, id);
}

export function unflag(id) {
  drop(localStorage, K_FLAG, id);
  add(localStorage, K_SAFE, id);
}

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

// STRICT MODE: Analyze content and ALWAYS flag mature content
// Returns { mature, reasons, auto, manual, safe, blurred, adultOnly }
export function info(item = {}) {
  const id = item.id;
  const text = `${item.title || ''} ${item.overview || ''}`.toLowerCase();

  // If user explicitly marked safe, respect that
  if (id != null && read(localStorage, K_SAFE).includes(id)) {
    return { mature: false, reasons: [], auto: false, manual: false, safe: true, blurred: false, adultOnly: false };
  }

  const reasons = [];
  const detectedReasons = [];

  // Auto-detect sexual content
  if (SEXUAL.some((r) => r.test(text))) {
    detectedReasons.push('Sexual content or nudity');
    reasons.push('Sexual content or nudity');
  }

  // Auto-detect violence
  if (VIOLENT.some((r) => r.test(text))) {
    detectedReasons.push('Graphic violence');
    reasons.push('Graphic violence');
  }

  // Check for manual user flag
  const manual = id != null && read(localStorage, K_FLAG).includes(id);
  if (manual) {
    reasons.push('Marked 18+ by you');
  }

  // Determine if content should be in adult-only section
  const adultOnly = detectedReasons.length > 0 && !manual;

  return {
    mature: reasons.length > 0,
    reasons,
    auto: detectedReasons.length > 0 && !manual,
    manual,
    safe: false,
    blurred: reasons.length > 0, // Always blur if mature
    adultOnly: adultOnly, // Flag for adult section
  };
}

// MANDATORY age gate on app load
export function initialAgeGate() {
  if (isAgeVerified()) return Promise.resolve(true);
  
  return new Promise((resolve) => {
    document.querySelector('.age-gate')?.remove();
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const el = document.createElement('div');
    el.className = 'age-gate age-gate-initial';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = `
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #e94560;
      border-radius: 12px;
      padding: 40px;
      max-width: 500px;
      text-align: center;
      color: #fff;
      box-shadow: 0 10px 40px rgba(233, 69, 96, 0.3);
    `;
    
    el.innerHTML = `
      <div class="age-badge" style="font-size: 60px; color: #e94560; margin-bottom: 20px;">⚠️ 18+</div>
      <h3 style="font-size: 28px; margin: 20px 0; color: #fff;">Age Verification Required</h3>
      <p style="font-size: 16px; margin: 15px 0; color: #ccc;">
        This service contains mature content including sexual and violent material.
      </p>
      <p style="font-size: 16px; margin: 15px 0; color: #e94560; font-weight: bold;">
        You must be at least 18 years old to continue.
      </p>
      <p style="font-size: 14px; margin: 20px 0; color: #999;">
        By continuing, you confirm you are 18+ and accept full responsibility for your viewing.
      </p>
      <div class="age-buttons" style="display: flex; gap: 10px; margin-top: 30px;">
        <button class="age-btn age-no" data-go="0" style="
          flex: 1;
          padding: 12px;
          background: #555;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
        ">I am under 18 — Exit</button>
        <button class="age-btn age-yes" data-go="1" style="
          flex: 1;
          padding: 12px;
          background: #e94560;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
        ">I am 18+ — Continue</button>
      </div>
    `;
    
    overlay.appendChild(el);
    document.body.appendChild(overlay);
    
    const done = (ok) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (ok) {
        setAgeVerified(true);
      } else {
        // Redirect to a safe exit page
        window.location.href = 'about:blank';
      }
      resolve(ok);
    };
    
    const onKey = (e) => {
      if (e.key === 'Escape') return;
    };
    
    document.addEventListener('keydown', onKey);
    
    el.addEventListener('click', (e) => {
      if (e.target === el) return;
      const b = e.target.closest('[data-go]');
      if (b) done(b.dataset.go === '1');
    });
    
    el.querySelector('[data-go="0"]').focus();
  });
}

// Per-title confirmation gate (with blurred preview)
export function confirmAccess({ id, title, reasons = [], poster = null }) {
  const hide = getMode() === 'hide';
  
  // If in 'label' mode and already confirmed this session, allow instant access
  if (!hide && isConfirmed(id)) {
    return Promise.resolve(true);
  }
  
  return new Promise((resolve) => {
    document.querySelector('.age-gate')?.remove();
    
    const el = document.createElement('div');
    el.className = 'age-gate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9000;
    `;
    
    const card = document.createElement('div');
    card.className = 'age-card';
    card.style.cssText = `
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #e94560;
      border-radius: 12px;
      padding: 30px;
      max-width: 600px;
      color: #fff;
      box-shadow: 0 10px 40px rgba(233, 69, 96, 0.3);
    `;
    
    const reasonsList = reasons.length
      ? `<ul class="age-reasons" style="text-align: left; margin: 15px 0; padding-left: 20px;">
          ${reasons.map((r) => `<li style="margin: 8px 0; color: #e94560;">⚠️ ${esc(r)}</li>`).join('')}
        </ul>`
      : '';
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;">
        <div class="age-badge" style="font-size: 48px; color: #e94560;">🔞</div>
        <div>
          <h3 style="margin: 0; font-size: 24px; color: #e94560;">${hide ? 'Hidden by 18+ Filter' : 'Mature Content'}</h3>
          <p class="age-title" style="margin: 5px 0; font-size: 16px; color: #ccc;">"${esc(title)}"</p>
        </div>
      </div>
      ${reasonsList}
      <p style="font-size: 14px; color: #999; margin: 15px 0;">
        ${hide ? 'This title is blocked by your safety filter.' : 'This title contains mature content and requires confirmation.'}
      </p>
      <div class="age-buttons" style="display: flex; gap: 10px; margin-top: 20px;">
        <button class="age-btn age-no" data-go="0" style="
          flex: 1;
          padding: 10px;
          background: #555;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
        ">Cancel</button>
        <button class="age-btn age-yes" data-go="1" style="
          flex: 1;
          padding: 10px;
          background: #e94560;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
        ">I am 18+ — Continue</button>
      </div>
      <div class="age-footer" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #444;">
        <label class="age-toggle" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="age-toggle-hide" ${hide ? 'checked' : ''} style="cursor: pointer;" />
          <span style="font-size: 14px; color: #999;">Hide mature titles (strict mode)</span>
        </label>
      </div>
    `;
    
    el.appendChild(card);
    document.body.appendChild(el);
    
    const done = (ok) => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      if (ok) {
        if (hide) setMode('label');
        markConfirmed(id);
        setAgeVerified(true);
      }
      resolve(ok);
    };
    
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
    };
    
    document.addEventListener('keydown', onKey);
    
    card.addEventListener('click', (e) => {
      const checkbox = e.target.closest('#age-toggle-hide');
      if (checkbox) {
        setMode(checkbox.checked ? 'hide' : 'label');
        return;
      }
      const b = e.target.closest('[data-go]');
      if (b) done(b.dataset.go === '1');
    });
    
    card.querySelector('[data-go="0"]').focus();
  });
}

// Blur adult content poster images
export function getBlurredPosterStyle(isMature) {
  if (!isMature) return '';
  return 'filter: blur(15px) brightness(0.5); cursor: not-allowed;';
}

// Mark content for adult-only section
export function shouldShowInAdultSection(item) {
  return info(item).adultOnly;
}
