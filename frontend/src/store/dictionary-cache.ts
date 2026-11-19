import AsyncStorage from "@react-native-async-storage/async-storage";

import { DictionaryHistoryItem, SemanticDictionaryData } from "@/src/types/user-api";

const MAX_CACHE_ENTRIES = 120;
const MAX_HISTORY_ITEMS = 40;

type CacheBucket = {
  entries: Record<string, SemanticDictionaryData>;
  aliases: Record<string, string>;
  history: DictionaryHistoryItem[];
  hydrated: boolean;
};

const buckets = new Map<string, CacheBucket>();

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function getBucket(userScope: string): CacheBucket {
  const key = userScope || "guest";
  let b = buckets.get(key);
  if (!b) {
    b = { entries: {}, aliases: {}, history: [], hydrated: false };
    buckets.set(key, b);
  }
  return b;
}

function cacheStorageKey(userScope: string) {
  return `toeic_dict_cache_v1_${userScope || "guest"}`;
}

function historyStorageKey(userScope: string) {
  return `toeic_dict_history_v1_${userScope || "guest"}`;
}

function persistEntries(userScope: string, b: CacheBucket) {
  const keys = Object.keys(b.entries);
  if (keys.length > MAX_CACHE_ENTRIES) {
    const allowed = new Set(b.history.map((h) => normalizeKey(h.normalizedWord)));
    const nextEntries: Record<string, SemanticDictionaryData> = {};
    for (const k of keys) {
      if (allowed.has(k) || Object.keys(nextEntries).length < MAX_CACHE_ENTRIES) {
        nextEntries[k] = b.entries[k];
      }
    }
    b.entries = nextEntries;
  }
  void AsyncStorage.setItem(
    cacheStorageKey(userScope),
    JSON.stringify({ entries: b.entries, aliases: b.aliases }),
  ).catch(() => {});
}

function persistHistory(userScope: string, b: CacheBucket) {
  const compact = b.history.slice(0, MAX_HISTORY_ITEMS).map((item) => ({
    ...item,
    entry: undefined,
  }));
  void AsyncStorage.setItem(historyStorageKey(userScope), JSON.stringify(compact)).catch(() => {});
}

export async function hydrateDictionaryCache(userScope: string): Promise<{
  history: DictionaryHistoryItem[];
  hasEntries: boolean;
}> {
  const b = getBucket(userScope);
  if (b.hydrated) {
    return { history: b.history, hasEntries: Object.keys(b.entries).length > 0 };
  }
  try {
    const [rawCache, rawHist] = await Promise.all([
      AsyncStorage.getItem(cacheStorageKey(userScope)),
      AsyncStorage.getItem(historyStorageKey(userScope)),
    ]);
    if (rawCache) {
      const parsed = JSON.parse(rawCache) as {
        entries?: Record<string, SemanticDictionaryData>;
        aliases?: Record<string, string>;
      };
      if (parsed.entries && typeof parsed.entries === "object") {
        b.entries = { ...parsed.entries, ...b.entries };
      }
      if (parsed.aliases && typeof parsed.aliases === "object") {
        b.aliases = { ...parsed.aliases, ...b.aliases };
      }
    }
    if (rawHist) {
      const parsedHist = JSON.parse(rawHist) as DictionaryHistoryItem[];
      if (Array.isArray(parsedHist)) {
        const existingKeys = new Set(b.history.map((h) => normalizeKey(h.normalizedWord)));
        const merged = [...b.history];
        for (const item of parsedHist) {
          if (!item?.normalizedWord) continue;
          const nk = normalizeKey(item.normalizedWord);
          if (!existingKeys.has(nk)) {
            existingKeys.add(nk);
            merged.push(item);
          }
        }
        b.history = merged.slice(0, MAX_HISTORY_ITEMS);
      }
    }
  } catch {
    // Corrupted or unavailable storage falls back seamlessly to memory
  } finally {
    b.hydrated = true;
  }
  return { history: b.history, hasEntries: Object.keys(b.entries).length > 0 };
}

export function getCachedDictionaryEntrySync(
  userScope: string,
  rawQuery: string,
): SemanticDictionaryData | null {
  const key = normalizeKey(rawQuery);
  if (!key) return null;
  const b = getBucket(userScope);
  const direct = b.entries[key];
  if (direct) return direct;
  const aliasTarget = b.aliases[key];
  if (aliasTarget && b.entries[aliasTarget]) {
    return b.entries[aliasTarget];
  }
  return null;
}

export function getCachedDictionaryHistorySync(userScope: string): DictionaryHistoryItem[] {
  return getBucket(userScope).history;
}

export function saveDictionaryLookupToCache(
  userScope: string,
  rawQuery: string,
  data: SemanticDictionaryData,
): DictionaryHistoryItem[] {
  const b = getBucket(userScope);
  const norm = normalizeKey(data.normalizedWord || data.word || rawQuery);
  const rawKey = normalizeKey(rawQuery);
  const existing = b.entries[norm];

  // Never overwrite an already-enriched entry with a partial preview
  if (!data.partial || !existing || existing.partial) {
    b.entries[norm] = { ...data, cached: true };
  }
  if (rawKey && rawKey !== norm) {
    b.aliases[rawKey] = norm;
  }

  const prevItem = b.history.find((h) => normalizeKey(h.normalizedWord) === norm);
  const nextItem: DictionaryHistoryItem = {
    word: data.word,
    normalizedWord: norm,
    ipa: data.ipa,
    partOfSpeech: data.partOfSpeech,
    cefrLevel: data.cefrLevel,
    meaningVi: data.meaningVi,
    source: data.source,
    lookupCount: (prevItem?.lookupCount ?? 0) + 1,
    lastLookedUpAt: new Date().toISOString(),
  };

  b.history = [
    nextItem,
    ...b.history.filter((h) => normalizeKey(h.normalizedWord) !== norm),
  ].slice(0, MAX_HISTORY_ITEMS);

  persistEntries(userScope, b);
  persistHistory(userScope, b);
  return b.history;
}

export function mergeServerDictionaryHistory(
  userScope: string,
  serverItems: DictionaryHistoryItem[],
): DictionaryHistoryItem[] {
  const b = getBucket(userScope);
  const byKey = new Map<string, DictionaryHistoryItem>();

  for (const item of serverItems) {
    const nk = normalizeKey(item.normalizedWord || item.word);
    if (!nk) continue;
    byKey.set(nk, {
      ...item,
      normalizedWord: nk,
      entry: undefined,
    });
    if (item.entry) {
      const existing = b.entries[nk];
      if (!item.entry.partial || !existing || existing.partial) {
        b.entries[nk] = { ...item.entry, cached: true };
      }
    }
  }

  for (const localItem of b.history) {
    const nk = normalizeKey(localItem.normalizedWord);
    if (nk && !byKey.has(nk)) {
      byKey.set(nk, localItem);
    }
  }

  b.history = Array.from(byKey.values())
    .sort((a, bItem) =>
      String(bItem.lastLookedUpAt ?? "").localeCompare(String(a.lastLookedUpAt ?? "")),
    )
    .slice(0, MAX_HISTORY_ITEMS);

  persistEntries(userScope, b);
  persistHistory(userScope, b);
  return b.history;
}

export function removeCachedHistoryWord(userScope: string, rawWord: string): DictionaryHistoryItem[] {
  const b = getBucket(userScope);
  const nk = normalizeKey(rawWord);
  b.history = b.history.filter((h) => normalizeKey(h.normalizedWord) !== nk);
  persistHistory(userScope, b);
  return b.history;
}

export function clearCachedHistory(userScope: string): DictionaryHistoryItem[] {
  const b = getBucket(userScope);
  b.history = [];
  persistHistory(userScope, b);
  return [];
}
