import { core } from './core.js';
import { sendToAll } from './push-notifications.js';

const MESSAGES = [
  ['You might like this 🎬', 'A fresh pick is waiting for you.'],
  ['Something worth watching 🍿', 'We found a title you may enjoy.'],
  ['This one is getting attention 🔥', 'Take a look at this pick.'],
  ['Your next watch 👀', 'Here is something worth checking out.'],
  ['A fresh pick for you ✨', 'Open free❤️‍🔥 and check it out.']
];

const used = new Set();
let running = false;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nextDelay() {
  // Random delay between 30 minutes and 3 hours.
  return (30 * 60 * 1000) + Math.floor(Math.random() * (150 * 60 * 1000));
}

function pick(items) {
  const available = items.filter(x => x?.id && x?.title && !used.has(String(x.id)));
  if (!available.length) {
    used.clear();
    return items.find(x => x?.id && x?.title) || null;
  }
  return available[Math.floor(Math.random() * available.length)];
}

async function getCandidates() {
  const queries = [
    'popular',
    'trending',
    'latest'
  ];

  const responses = await Promise.allSettled(
    queries.map(q => core.search(q, 1))
  );

  const results = [];
  const seen = new Set();

  for (const response of responses) {
    if (response.status !== 'fulfilled') continue;

    for (const item of response.value?.results || []) {
      if (!item?.id || !item?.title) continue;

      const id = String(item.id);
      if (seen.has(id)) continue;

      seen.add(id);
      results.push(item);
    }
  }

  return results;
}

function movieUrl(movie) {
  if (movie.url) return movie.url;
  if (movie.href) return movie.href;
  return `/#/title/${encodeURIComponent(movie.id)}`;
}

function movieImage(movie) {
  return movie.poster ||
    movie.posterUrl ||
    movie.image ||
    movie.imageUrl ||
    movie.backdrop ||
    undefined;
}

async function sendRecommendation() {
  if (running) return;
  running = true;

  try {
    const candidates = await getCandidates();
    const movie = pick(candidates);

    if (!movie) {
      console.log('[auto-push] No recommendation candidate available');
      return;
    }

    used.add(String(movie.id));

    const [title, fallback] =
      MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

    const result = await sendToAll({
      title,
      body: movie.tagline || `${movie.title} is waiting for you 🍿`,
      url: movieUrl(movie),
      image: movieImage(movie),
      tag: `free-heart-recommendation-${movie.id}`
    });

    console.log('[auto-push] Recommendation sent', {
      movie: movie.title,
      sent: result.sent,
      failed: result.failed,
      removed: result.removed
    });
  } catch (error) {
    console.error('[auto-push] Failed:', error);
  } finally {
    running = false;
  }
}

export function startAutomaticPush() {
  console.log('[auto-push] Automatic recommendation system started');

  const loop = async () => {
    // First automatic attempt after 60 seconds.
    await delay(60 * 1000);

    while (true) {
      await sendRecommendation();
      await delay(nextDelay());
    }
  };

  loop().catch(error => {
    console.error('[auto-push] Scheduler stopped:', error);
  });
}
