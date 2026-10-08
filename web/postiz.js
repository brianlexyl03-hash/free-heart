const KEY = 'free.postiz.connector.v1';
const DEFAULT_URL = 'https://api.postiz.com/public/v1';

export function loadPostiz() {
  try { return { baseUrl: DEFAULT_URL, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { baseUrl: DEFAULT_URL, apiKey: '', integrationId: '' }; }
}
export function savePostiz(value) {
  const next = { baseUrl: String(value.baseUrl || DEFAULT_URL).replace(/\/$/, ''), apiKey: String(value.apiKey || ''), integrationId: String(value.integrationId || '') };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
async function postizFetch(path, config, options = {}) {
  if (!config.apiKey) throw new Error('Add your Postiz API key first.');
  const response = await fetch(`${config.baseUrl}${path}`, { ...options, headers: { ...(options.headers || {}), authorization: config.apiKey } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Postiz request failed (HTTP ${response.status})`);
  return body;
}
export async function listPostizIntegrations() {
  const config = loadPostiz();
  const data = await postizFetch('/integrations', config);
  return Array.isArray(data) ? data : data.integrations || [];
}
export async function publishWithPostiz(file, caption) {
  const config = loadPostiz();
  if (!config.integrationId) throw new Error('Load channels and choose a Postiz channel first.');
  const form = new FormData(); form.append('file', file, file.name || 'free-clip.webm');
  const media = await postizFetch('/upload', config, { method: 'POST', body: form });
  const result = await postizFetch('/posts', config, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'now', posts: [{ integration: { id: config.integrationId }, value: [{ content: caption, image: [{ id: media.id, path: media.path }] }] }] }) });
  return result;
}
