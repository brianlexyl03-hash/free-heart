'use strict';

// Hypothetical scheduler: never hard-codes a particular movie or exact hour.
// Call chooseRecommendation() with your existing Trending/Most Watched/TYI titles.

const MESSAGES = [
  ['You might like this 🎬', 'A pick from what people are watching right now.'],
  ['A lot of people are watching this 👀', 'This one is getting attention right now.'],
  ['Something you might enjoy 🍿', 'We found a title worth checking out.'],
  ['This one is trending 🔥', 'Take a look before you miss it.'],
  ['Picked for you ✨', 'A fresh recommendation is waiting.']
];

function chooseRecommendation(candidates, recentIds = []) {
  const usable = candidates.filter(x => x && x.id && x.title && !recentIds.includes(String(x.id)));
  if (!usable.length) return null;
  const movie = usable[Math.floor(Math.random() * usable.length)];
  const [title, fallbackBody] = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  return { movie, title, body: movie.tagline || fallbackBody };
}

function randomDelayMs() {
  // Randomly lands in one of several daily windows instead of a fixed time.
  const windows = [[8,11],[12,15],[16,19],[19,23]];
  const [start, end] = windows[Math.floor(Math.random() * windows.length)];
  const hour = start + Math.random() * (end - start);
  const now = new Date();
  const target = new Date(now);
  target.setHours(Math.floor(hour), Math.floor((hour % 1) * 60), 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

module.exports = { chooseRecommendation, randomDelayMs };
