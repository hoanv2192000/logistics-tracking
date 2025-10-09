"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SearchRow } from "@/types";

export default function Page() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [touched, setTouched] = useState(false);

  async function doSearch(query: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const json = await res.json();
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!touched || q.trim().length === 0) return;
    const t = setTimeout(() => doSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, touched]);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Logistics Tracking</h1>
      <p>Nhập Shipment / Container / MBL / HBL / Tracking…</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setTouched(true); }}
          onKeyDown={(e) => { if (e.key === "Enter") { setTouched(true); doSearch(q.trim()); } }}
          placeholder="VD: SHP0001, CONT-ABC1234, MBL123..."
          style={{ flex: 1, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />
        <button onClick={() => { setTouched(true); doSearch(q.trim()); }}>
          Tìm
        </button>
      </div>

      {!touched ? (
        <p style={{ marginTop: 16, color: "#666" }}>Hãy nhập mã để bắt đầu.</p>
      ) : loading ? (
        <p style={{ marginTop: 16 }}>Đang tìm…</p>
      ) : rows.length === 0 ? (
        <p style={{ marginTop: 16 }}>Không tìm thấy dữ liệu phù hợp.</p>
      ) : (
        <ul style={{ marginTop: 16, listStyle: "none", padding: 0 }}>
          {rows.map((r) => (
            <li key={r.shipment_id} style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>
                <Link href={`/shipment/${r.shipment_id}`}>{r.shipment_id}</Link> — {r.mode}
              </div>
              <div style={{ fontSize: 14 }}>
                {r.tracking_id && <>Tracking: {r.tracking_id} · </>}
                {r.mbl_number && <>MBL: {r.mbl_number} · </>}
                {r.hbl_number && <>HBL: {r.hbl_number} · </>}
                {r.containers && <>Containers: {r.containers}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
