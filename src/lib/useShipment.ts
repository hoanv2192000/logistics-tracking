// src/lib/useShipment.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { detailCacheGet, detailCacheSet } from "./detailCache";

export type ShipmentDetail = Record<string, unknown>; // giữ generic để không đụng UI hiện tại

async function fetchDetail(id: string | number, signal?: AbortSignal) {
  // ✅ ĐÚNG endpoint API của dự án: /api/detail/[id]
  const url = `/api/detail/${encodeURIComponent(String(id))}?_t=${Date.now()}`;
  const res = await fetch(url, { signal } as RequestInit);
  if (!res.ok) throw new Error(`detail failed: ${res.status}`);
  const json = (await res.json()) as { ok: boolean; data?: ShipmentDetail | null };
  return (json.data ?? null) as ShipmentDetail | null;
}

/** Hook dùng ở trang details
 * - Hiển thị cache nếu có (instant)
 * - Luôn refetch nền để cập nhật
 * - Có prefetch(id) cho list (hover/click)
 * - Có refetch() thủ công
 */
export function useShipment(id?: string | number | null) {
  const [data, setData] = useState<ShipmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (currId: string | number, background = false) => {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (!background) setLoading(true);
      setError(null);

      try {
        const fresh = await fetchDetail(currId, ac.signal);
        if (fresh) {
          detailCacheSet(currId, fresh);
          setData(fresh);
        } else {
          setData(null);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message || "detail error");
        }
      } finally {
        if (!background) setLoading(false);
        if (abortRef.current === ac) abortRef.current = null;
      }
    },
    []
  );

  // mount / id change: show cache ngay, rồi làm tươi nền
  useEffect(() => {
    if (id === undefined || id === null) return;

    const cached = detailCacheGet<ShipmentDetail>(id);
    if (cached) {
      setData(cached);
      setLoading(false);
      void load(id, true); // refetch nền
    } else {
      void load(id, false); // foreground
    }

    return () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;
    };
  }, [id, load]);

  // Revalidate khi tab quay lại foreground
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible" && (id || id === 0)) {
        void load(id as string | number, true);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [id, load]);

  const refetch = useCallback(() => {
    if (id || id === 0) void load(id as string | number, false);
  }, [id, load]);

  return { data, loading, error, refetch };
}

/** Prefetch cho list: gọi khi hover/focus/beforeNavigate để lần mở 2 hiển thị tức thì */
export async function prefetchShipment(id: string | number) {
  const cached = detailCacheGet<ShipmentDetail>(id);
  if (cached) return;
  try {
    const fresh = await fetchDetail(id);
    if (fresh) detailCacheSet(id, fresh);
  } catch {
    // im lặng, prefetch fail không ảnh hưởng UX
  }
}
