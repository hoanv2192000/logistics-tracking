// src/lib/detailCache.ts
type CacheEntry<T> = { value: T; at: number };
const MAX = 200;

// LRU Map: key càng mới càng nằm cuối
const store = new Map<string, CacheEntry<unknown>>();

function lruGet<T>(key: string): T | undefined {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (!hit) return undefined;
  // move to most-recent
  store.delete(key);
  store.set(key, hit);
  return hit.value;
}

function lruSet<T>(key: string, value: T) {
  if (store.has(key)) store.delete(key);
  store.set(key, { value, at: Date.now() });
  // evict oldest
  while (store.size > MAX) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

function lruDel(key: string) {
  store.delete(key);
}

function lruClear() {
  store.clear();
}

export const detailKey = (id: string | number) => `shipment:${String(id)}`;

export function detailCacheGet<T = unknown>(id: string | number): T | undefined {
  return lruGet<T>(detailKey(id));
}
export function detailCacheSet<T = unknown>(id: string | number, value: T) {
  lruSet<T>(detailKey(id), value);
}
export function detailCacheDel(id: string | number) {
  lruDel(detailKey(id));
}
export function detailCacheClear() {
  lruClear();
}
