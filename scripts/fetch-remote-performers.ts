import type { ArrayItemPerformer } from '../src/utils/types';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type CacheEntry =
  | { url: string; status: 'ok'; permanent: true; fetchedAt: string }
  | { url: string; status: 'skipped'; permanent: true; fetchedAt: string; reason: string };

type RemoteCache = {
  version: 1;
  entries: Record<string, CacheEntry>;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const REMOTE_SOURCES_PATH = resolve(ROOT, 'src/utils/performers-1/remote-sources.ts');
const CACHE_PATH = resolve(ROOT, 'src/utils/performers-1/.remote-cache.json');
const GENERATED_PATH = resolve(ROOT, 'src/utils/performers-1/generated/remote-performers.generated.ts');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function writeGenerated(items: ArrayItemPerformer[]): Promise<void> {
  await mkdir(dirname(GENERATED_PATH), { recursive: true });
  const content = `import type { ArrayItemPerformer } from '../../types';

export const REMOTE_PERFORMERS: ArrayItemPerformer[] = ${JSON.stringify(items, null, 2)} as ArrayItemPerformer[];
`;
  await writeFile(GENERATED_PATH, content, 'utf8');
}

function toPerformer(raw: unknown): ArrayItemPerformer | null {
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

async function loadRemoteUrls(): Promise<string[]> {
  try {
    const mod = await import(`file://${REMOTE_SOURCES_PATH.replace(/\\/g, '/')}`);
    if (mod && Array.isArray((mod as any).REMOTE_JSON_URLS)) {
      return (mod as any).REMOTE_JSON_URLS.filter((u: unknown) => typeof u === 'string');
    }
  } catch (err) {
    console.error('[fetch-remote-performers] failed to load remote-sources:', err);
  }
  return [];
}

function extractItemsFromGenerated(gen: unknown): ArrayItemPerformer[] {
  if (Array.isArray(gen)) return gen as ArrayItemPerformer[];
  if (isRecord(gen)) {
    if (Array.isArray((gen as any).REMOTE_PERFORMERS)) return (gen as any).REMOTE_PERFORMERS;
    if (Array.isArray((gen as any).default)) return (gen as any).default;
  }
  return [];
}

async function main() {
  const cache = (await readJsonFile<RemoteCache>(CACHE_PATH)) ?? { version: 1, entries: {} };
  const urls = await loadRemoteUrls();

  if (urls.length === 0) {
    console.log('[fetch-remote-performers] no REMOTE_JSON_URLS found');
    return;
  }

  const newOkItems: ArrayItemPerformer[] = [];
  let hasChanges = false;

  for (const url of urls) {
    const entry = cache.entries[url];
    if (entry && entry.permanent === true) {
      // permanente: nunca fetchear
      continue;
    }

    // intentar UNA SOLA VEZ
    hasChanges = true;
    try {
      const res = await fetch(url);
      if (!res.ok) {
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
      cache.entries[url] = {
        url,
        status: 'ok',
        permanent: true,
        fetchedAt: new Date().toISOString()
      };
      console.log(`[fetch-remote-performers] ok: ${performer[0]} (${url})`);
    } catch (err) {
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
    const existingGenRaw = await readJsonFile<unknown>(GENERATED_PATH);
    const existingItems = extractItemsFromGenerated(existingGenRaw);

    const map = new Map<string, ArrayItemPerformer>();
    for (const it of existingItems) {
      // key por baseUrl (it[1])
      map.set(it[1], it);
    }
    for (const it of newOkItems) {
      map.set(it[1], it);
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
