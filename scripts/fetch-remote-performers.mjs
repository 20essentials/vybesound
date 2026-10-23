import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const REMOTE_SOURCES_PATH = resolve(ROOT, 'src/utils/performers-1/remote-sources.ts');
const CACHE_PATH = resolve(ROOT, 'src/utils/performers-1/.remote-cache.json');
const GENERATED_PATH = resolve(ROOT, 'src/utils/performers-1/generated/remote-performers.generated.ts');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

async function readJsonFile(path) {
  try {
    const content = await readFile(path, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeJsonFile(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function writeGenerated(items) {
  await mkdir(dirname(GENERATED_PATH), { recursive: true });
  const content = `import type { ArrayItemPerformer } from '../../types';

export const REMOTE_PERFORMERS = ${JSON.stringify(items, null, 2)};
`;
  await writeFile(GENERATED_PATH, content, 'utf8');
}

function toPerformer(raw) {
  if (!isRecord(raw)) return null;
  const name = raw.name;
  const url = raw.url;
  const songs = raw.songs;
  if (typeof name !== 'string') return null;
  if (typeof url !== 'string') return null;
  if (!isStringArray(songs)) return null;
  if (songs.length === 0) return null;
  return [name, url, songs];
}

async function loadRemoteUrls() {
  try {
    const content = await readFile(REMOTE_SOURCES_PATH, 'utf8');
    const match = content.match(/REMOTE_JSON_URLS\s*:\s*string\[\]\s*=\s*(\[[\s\S]*?\])/);
    if (match) {
      try {
        // Use Function to eval safely in this controlled file
        const urls = new Function('return ' + match[1])();
        if (Array.isArray(urls)) {
          return urls.filter(u => typeof u === 'string');
        }
      } catch (e) {
        console.error('[fetch-remote-performers] parse error:', e.message);
      }
    }
  } catch (err) {
    console.error('[fetch-remote-performers] failed to read remote-sources:', err.message);
  }
  return [];
}

function extractItemsFromGenerated(gen) {
  if (Array.isArray(gen)) return gen;
  if (isRecord(gen)) {
    if (Array.isArray(gen.REMOTE_PERFORMERS)) return gen.REMOTE_PERFORMERS;
    if (Array.isArray(gen.default)) return gen.default;
  }
  return [];
}

async function main() {
  const cache = (await readJsonFile(CACHE_PATH)) ?? { version: 1, entries: {} };
  const urls = await loadRemoteUrls();

  if (urls.length === 0) {
    console.log('[fetch-remote-performers] no REMOTE_JSON_URLS found');
    return;
  }

  const newOkItems = [];
  let hasChanges = false;

  for (const url of urls) {
    const entry = cache.entries && cache.entries[url];
    if (entry && entry.permanent === true) {
      continue;
    }

    hasChanges = true;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (!cache.entries) cache.entries = {};
        cache.entries[url] = {
          url,
          status: 'skipped',
          permanent: true,
          fetchedAt: new Date().toISOString(),
          reason: `http_${res.status}`
        };
        continue;
      }
      const json = await res.json();
      const performer = toPerformer(json);
      if (!performer) {
        if (!cache.entries) cache.entries = {};
        cache.entries[url] = {
          url,
          status: 'skipped',
          permanent: true,
          fetchedAt: new Date().toISOString(),
          reason: 'invalid_shape'
        };
        continue;
      }
      newOkItems.push(performer);
      if (!cache.entries) cache.entries = {};
      cache.entries[url] = {
        url,
        status: 'ok',
        permanent: true,
        fetchedAt: new Date().toISOString()
      };
      console.log(`[fetch-remote-performers] ok: ${performer[0]} (${url})`);
    } catch (err) {
      if (!cache.entries) cache.entries = {};
      cache.entries[url] = {
        url,
        status: 'skipped',
        permanent: true,
        fetchedAt: new Date().toISOString(),
        reason: err instanceof Error ? err.message : 'unknown_error'
      };
      console.log(`[fetch-remote-performers] skipped (error): ${url}`);
    }
  }

  if (hasChanges || newOkItems.length > 0) {
    const existingGenRaw = await readJsonFile(GENERATED_PATH);
    const existingItems = extractItemsFromGenerated(existingGenRaw);

    const map = new Map();
    for (const it of existingItems) {
      if (Array.isArray(it) && it[1]) map.set(it[1], it);
    }
    for (const it of newOkItems) {
      if (Array.isArray(it) && it[1]) map.set(it[1], it);
    }
    const merged = Array.from(map.values());
    await writeGenerated(merged);
    console.log(`[fetch-remote-performers] generated updated: ${merged.length} remote performer(s)`);
  } else {
    console.log('[fetch-remote-performers] nothing to fetch (all permanent)');
  }

  await writeJsonFile(CACHE_PATH, cache);
}

main().catch(err => {
  console.error('[fetch-remote-performers] fatal:', err);
  process.exitCode = 1;
});
