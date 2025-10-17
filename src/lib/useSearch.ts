// src/lib/useSearch.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { lruSearchGet, lruSearchSet } from "./cache";

export type SearchRow = {
  shipment_id: string | number | null;
  tracking_id: string | null;
  mode: string | null;
  mbl_number: string | null;
  hbl_number: string | null;
  scope_of_service: string | null;
  carrier: string | null;
  containers: string | null;
  etd_date: string | null;
  atd_date: string | null;
  eta_date: string | null;
  ata_date: string | null;
  pol_aol: string | null;
  pod_aod: string | null;
};

export type SearchParams = {
  q: string;
  pol?: string; // "ALL" | actual code
  pod?: string; // "ALL" | actual code
  sortBy?: "ETD" | "ETA";
  dir?: "ASC" | "DESC";
};

// Debounce cho gõ phím
const DEBOUNCE_MS = 250;

function buildKey(p: SearchParams) {
  const pol = (p.pol ?? "ALL").trim().toUpperCase();
  const pod = (p.pod ?? "ALL").trim().toUpperCase();
  const sortBy = (p.sortBy ?? "ETD").toUpperCase();
  const dir = (p.dir ?? "DESC").toUpperCase();
  const q = (p.q ?? "").trim();
  return `search:q=${q}|pol=${pol}|pod=${pod}|sort=${sortBy}|dir=${dir}`;
}

async function fetchSearch(p: SearchParams, signal?: AbortSignal) {
  // Build query string (dùng relative URL)
  const qs = new URLSearchParams();
  qs.set("q", p.q);
  qs.set("pol", (p.pol ?? "ALL").toUpperCase());
  qs.set("pod", (p.pod ?? "ALL").toUpperCase());
  qs.set("sortBy", (p.sortBy ?? "ETD").toUpperCase());
  qs.set("dir", (p.dir ?? "DESC").toUpperCase());
  // cache-buster để luôn lấy dữ liệu mới
  qs.set("_t", String(Date.now()));

  const url = `/api/search?${qs.toString()}`;

  // Không set "cache" để tránh lỗi type; chỉ truyền AbortSignal
  const res = await fetch(url, { signal } as RequestInit);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  const json = (await res.json()) as { ok: boolean; data: SearchRow[] };
  return json.data ?? [];
}

/**
 * Hook tối ưu tìm kiếm:
 * - Debounce
 * - LRU cache: hiển thị tức thì nếu đã có
 * - Refetch nền để làm tươi
 * - Hủy request cũ khi gõ tiếp (tránh race)
 */
export function useSearch(initial: SearchParams) {
  const [params, setParams] = useState<SearchParams>(initial);
  const [data, setData] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // debounce timer & abort controller refs
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // key dùng cho cache
  const key = useMemo(() => buildKey(params), [params]);

  // show cached instantly + background refetch
  useEffect(() => {
    // 1) Show cache (nếu có) ngay lập tức
    const cached = lruSearchGet<SearchRow[]>(key);
    if (cached) setData(cached);

    // 2) Debounce + hủy request cũ
    if (tRef.current) clearTimeout(tRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!params.q.trim()) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    tRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const fresh = await fetchSearch(params, ctrl.signal);
        // lưu cache và cập nhật UI
        lruSearchSet(key, fresh);
        setData(fresh);
        setLoading(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // bị hủy vì user gõ tiếp
        setError((e as Error).message || "search error");
        setLoading(false);
      } finally {
        abortRef.current = null;
      }
    }, DEBOUNCE_MS);

    return () => {
      if (tRef.current) clearTimeout(tRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [key, params]);

  return {
    data,
    loading,
    error,
    params,
    setParams, // UI giữ nguyên, chỉ gọi setParams khi filter/input đổi
  };
}
