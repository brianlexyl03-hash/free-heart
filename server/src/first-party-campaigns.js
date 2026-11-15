const DEFAULT_CAMPAIGNS = [
  { id: 'match-center', title: 'Live Match Center', description: 'Follow teams, fixtures, scores, and match alerts in one installable app.', url: '/#/live', image: '/icon-192.png', weight: 3 },
  { id: 'clip-studio', title: 'Clip Studio', description: 'Trim a 1–60 second moment and draft captions for sharing.', url: '/#/about', image: '/icon-192.png', weight: 2 },
  { id: 'offline-saves', title: 'Offline Saves', description: 'Save authorized videos in this browser and watch when your signal drops.', url: '/#/downloads', image: '/icon-192.png', weight: 2 },
  { id: 'ai-captions', title: 'AI captions and hashtags', description: 'Turn a clip into a ready-to-edit caption without leaving free-heart.', url: '/#/about', image: '/icon-192.png', weight: 1 },
];

const stats = new Map();
let cursor = 0;

function safeUrl(value) {
  const text = String(value || '').trim();
  if (/^\/(?!\/)[^\s<>]{1,500}$/.test(text)) return text;
  try { const url = new URL(text); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
function safeImage(value) { return safeUrl(value); }
function cleanCampaign(item, index) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || `campaign-${index + 1}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 50);
  const url = safeUrl(item.url);
  if (!id || !url) return null;
  return {
    id, title: String(item.title || 'Featured from free-heart').slice(0, 120), description: String(item.description || '').slice(0, 220),
    label: String(item.label || 'From free-heart').slice(0, 40), url, image: safeImage(item.image),
    weight: Math.min(10, Math.max(1, Number(item.weight) || 1)), enabled: item.enabled !== false,
  };
}
function configuredCampaigns() {
  try {
    const parsed = JSON.parse(process.env.FIRST_PARTY_CAMPAIGNS_JSON || 'null');
    if (Array.isArray(parsed)) {
      const custom = parsed.map(cleanCampaign).filter((campaign) => campaign?.enabled);
      if (custom.length) return custom;
    }
  } catch { /* fall back to the built-in first-party feature campaigns */ }
  return DEFAULT_CAMPAIGNS.map(cleanCampaign).filter(Boolean);
}
function choose(campaigns) {
  const weighted = campaigns.flatMap((campaign) => Array.from({ length: campaign.weight }, () => campaign));
  const selected = weighted[cursor % weighted.length];
  cursor += 1;
  return selected;
}
export function nextCampaign() {
  if (String(process.env.FIRST_PARTY_CAMPAIGNS_ENABLED || 'true').toLowerCase() === 'false') return null;
  const campaigns = configuredCampaigns();
  return campaigns.length ? { ...choose(campaigns) } : null;
}
export function recordCampaignEvent(campaignId, event) {
  const id = String(campaignId || '').slice(0, 50);
  if (!id || !['impression', 'click'].includes(event)) return false;
  const current = stats.get(id) || { impressions: 0, clicks: 0 };
  current[`${event}s`] += 1;
  stats.set(id, current);
  return true;
}
export function campaignStats() {
  return [...stats.entries()].map(([id, values]) => ({ id, ...values }));
}
