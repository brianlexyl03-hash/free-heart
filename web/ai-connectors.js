const KEY = 'free.ai.connector.v1';

export const AI_PRESETS = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  grok: { label: 'Grok via xAI', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini' },
  gemini: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
  claude: { label: 'Claude via OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-haiku' },
  openrouter: { label: 'OpenRouter (many models)', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  ollama: { label: 'Ollama local', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  lmstudio: { label: 'LM Studio local', baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
  custom: { label: 'Custom / gateway', baseUrl: '', model: '' },
};

export function loadAIConnector() {
  try { return { ...AI_PRESETS.openrouter, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { ...AI_PRESETS.openrouter }; }
}
export function saveAIConnector(value) {
  const next = { label: String(value.label || 'Custom'), baseUrl: String(value.baseUrl || '').replace(/\/$/, ''), model: String(value.model || ''), apiKey: String(value.apiKey || '') };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
export async function generateCaption({ title, context, style, language }) {
  const config = loadAIConnector();
  if (!config.baseUrl || !config.model) throw new Error('Connect an AI provider and model first.');
  const payload = { title, context, style, language, baseUrl: config.baseUrl, model: config.model };
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(`${config.baseUrl}/`);
  const response = await fetch(local ? `${config.baseUrl}/chat/completions` : '/api/ai/caption', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(config.apiKey ? (local ? { authorization: `Bearer ${config.apiKey}` } : { 'x-ai-api-key': config.apiKey }) : {}) },
    body: local ? JSON.stringify({ model: config.model, temperature: 0.8, messages: [{ role: 'system', content: 'Write concise, platform-safe social video metadata. Return JSON with title and caption.' }, { role: 'user', content: `Language: ${language}. Style: ${style}. Video title: ${title}. Context: ${context}` }] }) : JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `AI request failed (HTTP ${response.status})`);
  if (local) {
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('The local model returned no caption.');
    try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { return { title, caption: content }; }
  }
  return body;
}
export async function testAIConnector() {
  const result = await generateCaption({ title: 'Connection test', context: 'Write one short test caption.', style: 'minimal', language: 'English' });
  return result.caption;
}
