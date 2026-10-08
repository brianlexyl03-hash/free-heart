import { AI_PRESETS, loadAIConnector, saveAIConnector, generateCaption, testAIConnector } from './ai-connectors.js';
import { loadPostiz, savePostiz, listPostizIntegrations, publishWithPostiz } from './postiz.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
const fmt = (s) => { s = Math.max(0, Math.floor(Number(s) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function recorderMime() {
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((x) => MediaRecorder.isTypeSupported?.(x)) || '';
}

function suggestion(title, caption) {
  const clean = String(title || 'this scene').replace(/[\n#]+/g, ' ').trim();
  return caption || `The moment from ${clean} that stays with you. Watch the full story on free. #shorts #reels #fyp`;
}

export function mountClipEditor(host, { video, title = 'Untitled clip', onStatus } = {}) {
  if (!host || !video) return null;
  const max = Number.isFinite(video.duration) ? Math.min(60, Math.max(1, video.duration)) : 60;
  const initialEnd = Math.min(max, Math.max(1, (video.currentTime || 0) + 15));
  host.innerHTML = `<section class="clip-editor">
    <div class="clip-head"><div><span class="eyebrow">Clip studio</span><h3>Make a short from this video</h3></div><span class="clip-badge">Max 60s</span></div>
    <p class="clip-note">Clips are rendered in your browser. Your source stays local; use only media you own or have permission to republish.</p>
    <div class="clip-grid"><label>Start <input id="clip-start" type="number" min="0" max="${Math.floor(max)}" step="0.1" value="${Math.max(0, Math.floor((video.currentTime || 0) - 5))}"></label><label>End <input id="clip-end" type="number" min="1" max="${Math.floor(max)}" step="0.1" value="${Math.floor(initialEnd)}"></label></div>
    <div class="clip-grid"><label>Title <input id="clip-title" maxlength="100" value="${esc(title)}"></label><label>Caption &amp; hashtags <textarea id="clip-caption" maxlength="500" rows="2">${esc(suggestion(title))}</textarea></label></div>
    <details class="ai-connector"><summary>AI captions &amp; connected models</summary><div class="clip-grid"><label>Provider<select id="ai-provider">${Object.entries(AI_PRESETS).map(([key, item]) => `<option value="${key}">${esc(item.label)}</option>`).join('')}</select></label><label>Model <input id="ai-model" autocomplete="off" placeholder="gpt-4o-mini"></label><label>OpenAI-compatible URL <input id="ai-base-url" type="url" autocomplete="url" placeholder="https://api.openai.com/v1"></label></div><div class="clip-grid"><label>API key <input id="ai-key" type="password" autocomplete="off" placeholder="Stored only in this browser"></label><label>Style<select id="ai-style"><option>punchy</option><option>cinematic</option><option>funny</option><option>educational</option><option>minimal</option></select></label><label>Language <input id="ai-language" value="English"></label></div><div class="actions"><button class="secondary" data-clip-act="save-ai">Save connector</button><button class="secondary" data-clip-act="test-ai">Test connection</button><button class="primary" data-clip-act="caption-ai">Generate caption</button></div><small class="clip-note">Works with OpenAI, xAI/Grok, OpenRouter, Ollama, LM Studio, or any OpenAI-compatible gateway. Your key is sent only over HTTPS to this app and is never logged.</small></details>
    <div class="clip-preview"><video id="clip-preview-video" muted playsinline></video><div class="clip-progress"><i></i></div><span id="clip-time">Ready to render</span></div>
    <details class="postiz-connector"><summary>Publish with Postiz</summary><div class="clip-grid"><label>Postiz API URL <input id="postiz-url" type="url" value="https://api.postiz.com/public/v1"></label><label>Postiz API key <input id="postiz-key" type="password" autocomplete="off" placeholder="Stored only in this browser"></label><label>Channel <select id="postiz-channel"><option value="">Load channels first</option></select></label></div><div class="actions"><button class="secondary" data-clip-act="postiz-load">Load channels</button><button class="primary" data-clip-act="postiz-post" disabled>Post now</button></div><small class="clip-note">Postiz supports Instagram, YouTube, TikTok, Facebook, and many more through its official API. The API is beta-limited, so review the post in Postiz before enabling automation.</small></details>
    <div class="actions"><button class="primary" data-clip-act="render">Render clip</button><button class="secondary" data-clip-act="share" disabled>Share / publish</button><button class="ghost" data-clip-act="copy" disabled>Copy caption</button></div>
    <div class="clip-status" role="status"></div>
  </section>`;
  const q = (s) => host.querySelector(s);
  const preview = q('#clip-preview-video');
  const status = q('.clip-status');
  const renderButton = q('[data-clip-act="render"]');
  const shareButton = q('[data-clip-act="share"]');
  const copyButton = q('[data-clip-act="copy"]');
  const aiConfig = loadAIConnector();
  const providerSelect = q('#ai-provider');
  const modelInput = q('#ai-model');
  const baseUrlInput = q('#ai-base-url');
  const keyInput = q('#ai-key');
  const styleInput = q('#ai-style');
  const languageInput = q('#ai-language');
  const postizConfig = loadPostiz();
  const postizUrl = q('#postiz-url');
  const postizKey = q('#postiz-key');
  const postizChannel = q('#postiz-channel');
  const postizLoad = q('[data-clip-act="postiz-load"]');
  const postizPost = q('[data-clip-act="postiz-post"]');
  postizUrl.value = postizConfig.baseUrl;
  postizKey.value = postizConfig.apiKey || '';
  providerSelect.value = Object.entries(AI_PRESETS).find(([, item]) => item.baseUrl === aiConfig.baseUrl)?.[0] || 'custom';
  modelInput.value = aiConfig.model || '';
  baseUrlInput.value = aiConfig.baseUrl || '';
  keyInput.value = aiConfig.apiKey || '';
  let output = null;
  let rendering = false;
  try { preview.src = video.currentSrc || video.src; preview.currentTime = video.currentTime || 0; } catch {}
  const setStatus = (message, tone = '') => { status.className = `clip-status ${tone}`; status.textContent = message; onStatus?.(message); };
  const values = () => {
    const start = clamp(q('#clip-start').value, 0, max);
    const end = clamp(q('#clip-end').value, start + 1, max);
    return { start, end: Math.min(end, start + 60), title: q('#clip-title').value.trim() || 'free clip', caption: q('#clip-caption').value.trim() || suggestion(title) };
  };
  const paintPreview = () => { const { start, end } = values(); preview.currentTime = start; q('#clip-time').textContent = `${fmt(start)} — ${fmt(end)} · ${fmt(end - start)}`; };
  providerSelect.onchange = () => { const next = AI_PRESETS[providerSelect.value]; if (next) { baseUrlInput.value = next.baseUrl; modelInput.value = next.model; } };
  ['#clip-start', '#clip-end'].forEach((s) => q(s).addEventListener('input', paintPreview));
  paintPreview();

  async function render() {
    if (rendering) return;
    if (!video.captureStream || !window.MediaRecorder) { setStatus('This browser cannot render clips. Try the latest Chrome, Edge, or Firefox.', 'error'); return; }
    const { start, end, title: clipTitle, caption } = values();
    if (end <= start || end - start > 60) { setStatus('Choose a clip between 1 and 60 seconds.', 'error'); return; }
    rendering = true; renderButton.disabled = true; shareButton.disabled = true; copyButton.disabled = true; output = null;
    setStatus('Rendering in real time — keep this tab open…');
    const oldTime = video.currentTime; const oldPaused = video.paused; const stream = video.captureStream();
    const mimeType = recorderMime(); const chunks = []; const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const stopAt = end; let timer;
    const finish = () => { clearInterval(timer); try { if (oldPaused) video.pause(); else video.play().catch(() => {}); video.currentTime = oldTime; } catch {} };
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { finish(); rendering = false; renderButton.disabled = false; setStatus('The browser could not encode this clip.', 'error'); };
    recorder.onstop = () => {
      finish(); output = new File([new Blob(chunks, { type: recorder.mimeType || 'video/webm' })], `${clipTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'free-clip'}.webm`, { type: recorder.mimeType || 'video/webm' });
      rendering = false; renderButton.disabled = false; shareButton.disabled = false; copyButton.disabled = false;
      setStatus(`Ready — ${fmt(end - start)} clip rendered. Download it or share it to your connected workflow.`, 'success');
    };
    try { video.currentTime = start; await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true })); recorder.start(250); await video.play(); timer = setInterval(() => { const elapsed = Math.max(0, video.currentTime - start); q('.clip-progress i').style.width = `${Math.min(100, elapsed / (end - start) * 100)}%`; q('#clip-time').textContent = `Rendering ${fmt(elapsed)} / ${fmt(end - start)}`; if (video.currentTime >= stopAt - 0.05) { clearInterval(timer); if (recorder.state !== 'inactive') recorder.stop(); } }, 100); } catch { try { recorder.stop(); } catch {} finish(); setStatus('Could not seek or play this source for rendering.', 'error'); rendering = false; renderButton.disabled = false; }
  }
  async function share() {
    if (!output) return;
    const { title: clipTitle, caption } = values();
    try {
      if (navigator.share) await navigator.share({ title: clipTitle, text: caption, files: [output] });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(output); a.download = output.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); setStatus('Clip downloaded. Upload it in the official Instagram, YouTube, TikTok, or Facebook creator tool.', 'success'); }
    } catch (e) { if (e.name !== 'AbortError') setStatus('Share was not completed. Use Download from the share button again.', 'error'); }
  }
  function persistPostiz() { return savePostiz({ baseUrl: postizUrl.value, apiKey: postizKey.value, integrationId: postizChannel.value }); }
  q('[data-clip-act="render"]').onclick = render;
  shareButton.onclick = share;
  copyButton.onclick = async () => { try { await navigator.clipboard.writeText(values().caption); setStatus('Caption copied.', 'success'); } catch { setStatus('Clipboard access is unavailable.', 'error'); } };
  q('[data-clip-act="save-ai"]').onclick = () => { saveAIConnector({ label: providerSelect.options[providerSelect.selectedIndex]?.text, baseUrl: baseUrlInput.value, model: modelInput.value, apiKey: keyInput.value }); setStatus('AI connector saved in this browser.', 'success'); };
  q('[data-clip-act="test-ai"]').onclick = async () => { try { saveAIConnector({ label: providerSelect.options[providerSelect.selectedIndex]?.text, baseUrl: baseUrlInput.value, model: modelInput.value, apiKey: keyInput.value }); setStatus(`Testing ${providerSelect.options[providerSelect.selectedIndex]?.text}…`); const result = await testAIConnector(); setStatus(`Connected. Test caption: ${result}`, 'success'); } catch (e) { setStatus(e.message, 'error'); } };
  q('[data-clip-act="caption-ai"]').onclick = async () => { try { saveAIConnector({ label: providerSelect.options[providerSelect.selectedIndex]?.text, baseUrl: baseUrlInput.value, model: modelInput.value, apiKey: keyInput.value }); setStatus('Generating an AI caption…'); const result = await generateCaption({ title: q('#clip-title').value || title, context: `Clip length ${Math.round(values().end - values().start)} seconds. ${q('#clip-caption').value}`, style: styleInput.value, language: languageInput.value }); if (result.caption) q('#clip-caption').value = result.caption; if (result.title) q('#clip-title').value = result.title; setStatus(`Caption generated with ${result.model || modelInput.value}.`, 'success'); } catch (e) { setStatus(e.message, 'error'); } };
  postizLoad.onclick = async () => { try { persistPostiz(); setStatus('Loading your Postiz channels…'); const channels = await listPostizIntegrations(); postizChannel.innerHTML = channels.length ? channels.map((x) => `<option value="${esc(x.id)}">${esc(x.name || x.profile || x.identifier || x.id)} · ${esc(x.identifier || 'channel')}</option>`).join('') : '<option value="">No channels connected</option>'; const saved = loadPostiz(); if (saved.integrationId) postizChannel.value = saved.integrationId; postizPost.disabled = !channels.length; setStatus(`${channels.length} Postiz channel${channels.length === 1 ? '' : 's'} loaded.`, 'success'); } catch (e) { setStatus(e.message, 'error'); } };
  postizPost.onclick = async () => { if (!output) { setStatus('Render the clip before posting.', 'error'); return; } try { persistPostiz(); setStatus('Uploading clip to Postiz…'); await publishWithPostiz(output, q('#clip-caption').value.trim() || suggestion(title)); setStatus('Posted through Postiz. Check the connected channel for its publishing status.', 'success'); } catch (e) { setStatus(e.message, 'error'); } };
  return { destroy() { try { preview.pause(); } catch {} host.replaceChildren(); } };
}
