// Browser-side ABR policy for the native video player. It mirrors the useful
// HLS.js knobs without requiring HLS.js: native Safari/Android playback and
// server-generated quality switches use the same conservative decisions.
export const ABR_CONFIG = Object.freeze({
  abrEwmaFastVoD: 5,
  abrEwmaSlowVoD: 15,
  abrEwmaDefaultEstimate: 1_250_000,
  maxBufferLength: 45,
  maxMaxBufferLength: 60,
  abrSwitchInterval: 15_000,
  downBufferUrgent: 8,
  upBufferRequired: 35,
});

const BITRATES = new Map([[2160, 16_000_000], [1440, 10_000_000], [1080, 5_000_000], [720, 3_000_000], [540, 2_200_000], [480, 1_600_000], [360, 900_000]]);

export function networkProfile() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const type = String(c?.type || '').toLowerCase();
  const effective = String(c?.effectiveType || '').toLowerCase();
  const cellular = type === 'cellular' || ['slow-2g', '2g', '3g'].includes(effective);
  return {
    cellular,
    saveData: Boolean(c?.saveData),
    maxHeight: cellular ? 720 : c?.saveData ? 480 : 0,
    downlinkBps: Number(c?.downlink) > 0 ? Number(c.downlink) * 1_000_000 : 0,
  };
}

export function capLadder(values, profile) {
  const max = Number(profile?.maxHeight) || 0;
  return [...new Set((values || []).map(Number).filter((value) => value >= 144 && (!max || value <= max)))].sort((a, b) => b - a);
}

export function capQuality(value, profile) {
  const n = Number(value) || 0;
  const max = Number(profile?.maxHeight) || 0;
  return max && n > max ? max : n;
}

export function newAbrState(profile = networkProfile()) {
  const initial = profile.downlinkBps || ABR_CONFIG.abrEwmaDefaultEstimate;
  return { fast: initial, slow: initial, lastAt: 0, lastAhead: 0 };
}

export function updateEstimate(state, profile = networkProfile()) {
  const sample = Number(profile.downlinkBps) || state.slow || ABR_CONFIG.abrEwmaDefaultEstimate;
  // Larger smoothing windows calm oscillation; fast reacts sooner to sustained
  // drops while slow prevents one mobile-radio spike from jumping quality.
  const fastAlpha = 2 / (ABR_CONFIG.abrEwmaFastVoD + 1);
  const slowAlpha = 2 / (ABR_CONFIG.abrEwmaSlowVoD + 1);
  return {
    ...state,
    fast: state.fast + fastAlpha * (sample - state.fast),
    slow: state.slow + slowAlpha * (sample - state.slow),
  };
}

export function chooseNext({ ahead, current, ladder, estimateBps, profile, lastSwitchAt = 0, now = Date.now() }) {
  const levels = capLadder(ladder, profile);
  if (!levels.length) return null;
  const boundedCurrent = capQuality(current || levels[0], profile) || levels[levels.length - 1];
  const index = Math.max(0, levels.indexOf(boundedCurrent));
  const bitrate = BITRATES.get(boundedCurrent) || 1_500_000;
  const elapsed = now - lastSwitchAt;
  const urgentDown = ahead < ABR_CONFIG.downBufferUrgent || estimateBps < bitrate * 0.72;
  if (urgentDown && index < levels.length - 1) return { quality: levels[index + 1], reason: ahead < ABR_CONFIG.downBufferUrgent ? 'buffer_low' : 'bandwidth_low', urgent: true };
  if (elapsed < ABR_CONFIG.abrSwitchInterval) return null;
  // Up-switches require a large buffer and meaningful headroom, preventing flapping.
  if (ahead >= ABR_CONFIG.upBufferRequired && estimateBps > bitrate * 1.45 && index > 0) {
    return { quality: levels[index - 1], reason: 'bandwidth_headroom', urgent: false };
  }
  if (ahead < 14 && index < levels.length - 1 && estimateBps < bitrate * 0.9) {
    return { quality: levels[index + 1], reason: 'buffer_recovery', urgent: true };
  }
  return null;
}

export function logLevelSwitched(previous, next, reason, estimateBps, ahead) {
  console.info('[ABR] LEVEL_SWITCHED', { previous, next, reason, urgent: reason !== 'bandwidth_headroom', estimateBps: Math.round(estimateBps), bufferAhead: Math.round(ahead) });
}
