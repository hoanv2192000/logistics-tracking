// Lightweight global caches (sống theo vòng đời SPA)
// - detailCache: cache theo shipmentId với TTL
// - promiseCache: tránh trùng fetch cùng 1 key (de-dupe)
// - lruSearchCache: cache kết quả search gần đây

type DetailEntry<T> = { value: T; at: number };
const detailCache = new Map<string, DetailEntry<unknown>>();
const promiseCache = new Map<string, Promise<unknown>>();

// TTL mặc định cho chi tiết: 60s (tùy chỉnh nếu cần)
const DETAIL_TTL_MS = 60_000;

export function cacheGetDetail<T>(id: string): T | null {
  const hit = detailCache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > DETAIL_TTL_MS) return null;
  return hit.value as T;
}

export function cacheSetDetail<T>(id: string, value: T) {
  detailCache.set(id, { value, at: Date.now() });
}

export async function dedupe<T>(key: string, factory: () => Promise<T>): Promise<T> {
  if (promiseCache.has(key)) {
    return promiseCache.get(key)! as Promise<T>;
  }
  const p = factory().finally(() => promiseCache.delete(key));
  promiseCache.set(key, p);
  return p;
}

// ===== Simple LRU for search =====
type LruItem<V> = { key: string; value: V };
const LRU_CAP = 30;
const lru: Array<LruItem<unknown>> = [];

export function lruSearchGet<T>(key: string): T | undefined {
  const idx = lru.findIndex((x) => x.key === key);
  if (idx === -1) return;
  const removed = lru.splice(idx, 1);
  const it = removed[0];
  if (!it) return;
  lru.unshift(it);
  return it.value as T;
}

export function lruSearchSet<T>(key: string, value: T) {
  const existing = lru.findIndex((x) => x.key === key);
  if (existing !== -1) {
    lru.splice(existing, 1);
  }
  lru.unshift({ key, value });
  if (lru.length > LRU_CAP) {
    lru.pop();
  }
}
