// Playback planner modelled on Jellyfin's StreamBuilder ladder:
//   Direct Play -> Direct Stream (remux; audio may be converted) -> Transcode.
// Only container / audio / HEVC-tag problems are fixed by remuxing. A video problem needs a transcode.
import { spawn, spawnSync } from 'node:child_process';

const SAFE_AUDIO = new Set(['aac', 'mp3']);            // always fine in MP4 for browsers
const COPY_IN_MP4 = new Set(['aac', 'mp3', 'ac3', 'eac3']); // can be stream-copied into MP4
const MAX_JOBS = 2;
let active = 0;
let toolsOk = null;

export function haveFfmpeg() {
  if (toolsOk === null) toolsOk = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
  return toolsOk;
}

// Device profile: what this browser can decode. The page sets it in the fh_caps cookie (see web/caps.js).
export function parseCaps(cookieHeader) {
  const m = /(?:^|;\s*)fh_caps=([^;]*)/.exec(String(cookieHeader || ''));
  return new Set(m ? m[1].split('.').filter(Boolean) : []);
}

export function inputArgs(url, headers = {}) {
  const ua = headers['user-agent'] || headers['User-Agent'] || 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
  const extra = Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'user-agent').map(([k, v]) => `${k}: ${v}`).join('\r\n');
  const a = ['-user_agent', ua];
  if (extra) a.push('-headers', extra + '\r\n');
  a.push('-i', url);
  return a;
}

export function probe(url, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const inp = inputArgs(url, headers);
    const a = ['-v', 'error', '-user_agent', inp[1]];
    const h = inp.indexOf('-headers');
    if (h >= 0) a.push('-headers', inp[h + 1]);
    a.push('-show_entries', 'format=format_name:stream=codec_type,codec_name,profile,pix_fmt,color_transfer,height', '-of', 'json', url);
    const p = spawn('ffprobe', a, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => { clearTimeout(t); resolve(null); });
    p.on('close', () => {
      clearTimeout(t);
      try {
        const j = JSON.parse(out);
        const v = (j.streams || []).find((s) => s.codec_type === 'video');
        const au = (j.streams || []).find((s) => s.codec_type === 'audio');
        resolve({ format: String(j.format?.format_name || ''), video: v?.codec_name || '', vprofile: v?.profile || '', pix: v?.pix_fmt || '', transfer: v?.color_transfer || '', height: v?.height || 0, audio: au?.codec_name || '' });
      } catch { resolve(null); }
    });
  });
}

function tenBit(info) { return /(10|12|14|16)(le|be)?$|p10|p12/.test(info.pix || '') || /10|12/.test(info.vprofile || ''); }

export function videoOk(info, caps) {
  switch (info.video) {
    case 'h264': return !tenBit(info) && !/4:2:2|4:4:4/i.test(info.vprofile);
    case 'hevc': return caps.has('hevc') && (!tenBit(info) || caps.has('hevc10'));
    case 'av1': return caps.has('av1');
    case 'vp9': return caps.has('vp9');
    default: return false;
  }
}

export function audioOk(info, caps) {
  const a = info.audio;
  if (!a) return true;
  if (SAFE_AUDIO.has(a)) return true;
  if (a === 'ac3') return caps.has('ac3');
  if (a === 'eac3') return caps.has('eac3');
  return false; // opus/flac/vorbis/dts/truehd in MP4 are not reliable: convert
}

// Returns { mode: 'direct' | 'remux' | 'transcode' | 'unplayable', ... }
export function choose(info, caps, allowTranscode = false) {
  if (!info || !info.video) return { mode: 'remux', tagHevc: false, audio: 'aac', why: 'probe failed: trying a safe remux' };
  const inMp4 = /(^|,)(mp4|mov)(,|$)/.test(info.format);
  const v = videoOk(info, caps);
  const a = audioOk(info, caps);
  if (v && a && inMp4) return { mode: 'direct' };
  if (v) {
    const copyAudio = a && COPY_IN_MP4.has(info.audio);
    return { mode: 'remux', tagHevc: info.video === 'hevc', audio: copyAudio ? 'copy' : 'aac', delayMoov: copyAudio && /^e?ac3$/.test(info.audio), why: !inMp4 ? 'container' : 'audio' };
  }
  const why = `${info.video}${tenBit(info) ? ' 10-bit' : ''} video is not playable on this device`;
  return allowTranscode ? { mode: 'transcode', audio: 'aac', why } : { mode: 'unplayable', why };
}

export function remuxArgs(url, headers, plan) {
  const a = ['-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', ...inputArgs(url, headers),
    '-map_metadata', '-1', '-map_chapters', '-1', '-map', '0:v:0', '-map', '0:a:0?', '-sn'];
  if (plan.mode === 'transcode') {
    a.push('-vf', 'scale=-2:min(720\\,ih)', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-g', '48', '-sc_threshold', '0');
  } else {
    a.push('-c:v', 'copy');
    if (plan.tagHevc) a.push('-tag:v', 'hvc1');
  }
  if (plan.audio === 'copy') a.push('-c:a', 'copy');
  else a.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
  a.push('-movflags', plan.delayMoov ? 'frag_keyframe+empty_moov+delay_moov+default_base_moof' : 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
  return a;
}

export function registerRemux(app, { tokens, TTL }) {
  app.get('/api/remux/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const token = String(req.params?.token || '');
    if (!/^[\w-]{20,40}$/.test(token)) return reply.code(400).send({ error: 'bad_token', message: 'Bad stream link' });
    const e = tokens.get(token);
    if (!e || e.exp < Date.now()) return reply.code(404).send({ error: 'expired', message: 'Stream link expired' });
    e.exp = Date.now() + TTL;
    if (!haveFfmpeg()) return reply.redirect(`/api/stream/${token}`, 302);
    const caps = parseCaps(req.headers.cookie);
    const info = await probe(e.url, e.headers || {});
    const plan = choose(info, caps, process.env.ALLOW_TRANSCODE === '1');
    req.log.info({ mode: plan.mode, why: plan.why, container: info?.format, video: info?.video, vprofile: info?.vprofile, pix: info?.pix, hdr: info?.transfer, audio: info?.audio, caps: [...caps].join('.') }, 'playback plan');
    if (plan.mode === 'direct') return reply.redirect(`/api/stream/${token}`, 302);
    if (plan.mode === 'unplayable') return reply.code(415).send({ error: 'unsupported_video', message: `This version (${plan.why}). Choose 1080p or lower.` });
    if (active >= MAX_JOBS) return reply.code(503).header('retry-after', '10').send({ error: 'busy', message: 'The converter is busy. Try again in a moment.' });
    const ff = spawn('ffmpeg', remuxArgs(e.url, e.headers || {}, plan), { stdio: ['ignore', 'pipe', 'ignore'] });
    active += 1;
    let done = false;
    const end = () => { if (!done) { done = true; active -= 1; } try { ff.kill('SIGKILL'); } catch {} };
    ff.on('error', end); ff.on('close', end); reply.raw.on('close', end);
    reply.header('content-type', 'video/mp4').header('cache-control', 'no-store').header('x-accel-buffering', 'no');
    return reply.send(ff.stdout);
  });
}
