#!/usr/bin/env node
/**
 * Auto-seed Redis from JSON files on first startup.
 * Called by entrypoint.sh before the server starts.
 *
 * - Waits for Redis to be reachable (up to 30 s)
 * - Checks sentinel key `seed:version` — skips if already seeded
 * - Loads psms:* and protein:summary:* keys from JSON seed files
 * - Sets sentinel key so subsequent restarts are instant
 */

const fs = require('fs');
const path = require('path');
const redis = require('redis');

const SEED_VERSION = '3.0';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const DATA_DIR = path.join(__dirname, '..', 'data');
const PSM_FILE = path.join(DATA_DIR, 'redis-seed-psms.json');
const SUMMARY_FILE = path.join(DATA_DIR, 'redis-seed-summaries.json');
const PAGE_FILE = path.join(DATA_DIR, 'redis-seed-pages.json');

function log(msg) {
  console.log(`[seed] ${msg}`);
}

async function waitForRedis(client, maxRetries = 15, intervalMs = 2000) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await client.connect();
      return;
    } catch {
      log(`Redis not ready, retrying (${i}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error('Redis did not become ready in time');
}

async function loadFile(client, filePath, prefix, label) {
  if (!fs.existsSync(filePath)) {
    log(`Warning: ${filePath} not found — skipping ${label}`);
    return 0;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const map = JSON.parse(raw);
  const entries = Object.entries(map);
  log(`Loading ${entries.length} ${label} entries...`);

  // Pipeline in batches of 500 for efficiency
  const BATCH = 500;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const multi = client.multi();
    for (const [id, value] of batch) {
      multi.set(`${prefix}${id}`, JSON.stringify(value));
    }
    await multi.exec();
  }

  return entries.length;
}

async function main() {
  const client = redis.createClient({
    socket: { host: REDIS_HOST, port: REDIS_PORT },
  });

  client.on('error', () => {}); // suppress during retries

  await waitForRedis(client);
  log('Connected to Redis');

  // Check sentinel
  const current = await client.get('seed:version');
  if (current === SEED_VERSION) {
    log('Redis already seeded (v' + SEED_VERSION + '). Skipping.');
    await client.quit();
    return;
  }

  const start = Date.now();
  const psmCount = await loadFile(client, PSM_FILE, 'psms:', 'PSM');
  const sumCount = await loadFile(client, SUMMARY_FILE, 'protein:summary:', 'summary');
  const pageCount = await loadFile(client, PAGE_FILE, 'protein:page:', 'page');

  await client.set('seed:version', SEED_VERSION);

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  log(`Redis seeding complete — ${psmCount} PSM + ${sumCount} summary + ${pageCount} page entries in ${elapsed}s`);

  await client.quit();
}

main().catch((err) => {
  console.error('[seed] Fatal:', err.message);
  process.exit(1);
});
