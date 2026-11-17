#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const mailbox = path.join(root, 'coordination', 'mailbox.jsonl');
const args = process.argv.slice(2);
const command = args[0] || 'read';
const value = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? String(args[index + 1] || fallback) : fallback;
};
const now = () => new Date().toISOString();
const id = () => `${now().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const readRows = async () => {
  try { return (await readFile(mailbox, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};
const append = async (row) => {
  await mkdir(path.dirname(mailbox), { recursive: true });
  await writeFile(mailbox, `${JSON.stringify(row)}\n`, { encoding: 'utf8', flag: 'a' });
};

if (command === 'post') {
  const agent = value('agent', 'anonymous-agent').slice(0, 80);
  const kind = value('kind', 'status').slice(0, 30);
  const text = value('text').trim().slice(0, 4000);
  if (!text) throw new Error('post requires --text');
  const row = { type: 'message', id: id(), at: now(), agent, kind, text };
  await append(row);
  console.log(JSON.stringify(row, null, 2));
} else if (command === 'ack') {
  const messageId = value('id');
  const agent = value('agent', 'anonymous-agent').slice(0, 80);
  if (!messageId) throw new Error('ack requires --id');
  const rows = await readRows();
  if (!rows.some((row) => row.id === messageId && row.type === 'message')) throw new Error(`message not found: ${messageId}`);
  const row = { type: 'ack', id: id(), at: now(), agent, messageId };
  await append(row);
  console.log(JSON.stringify(row, null, 2));
} else if (command === 'read') {
  const since = value('since');
  const rows = await readRows();
  const cutoff = since ? Date.parse(since) : 0;
  for (const row of rows) if (!cutoff || Date.parse(row.at) >= cutoff) console.log(JSON.stringify(row));
} else {
  console.error('Usage: agent-mail.mjs post|read|ack [--agent NAME] [--kind KIND] [--text TEXT] [--id ID] [--since ISO]');
  process.exitCode = 2;
}
