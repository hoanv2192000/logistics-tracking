"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SearchRow } from "@/types";

// escape regex special chars
function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// highlight matched text with <mark>
function Highlight({ text, q }: { text?: string | null; q: string }) {
  if (!text) return null;
  if (!q || q.length < 2) return <>{text}</>;
  const re = new RegExp(escapeReg(q), "ig");
  const parts = text.split(re);
  const matches = text.match(re);
  if (!matches) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && <mark>{matches[i]}</mark>}
        </span>
      ))}
    </>
  );
}

type Mode = "ALL" | "SEA" | "AIR";

export default function Page() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("ALL");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [touched, setTouched] = useState(false);

  // chỉ cho phép tìm khi q.length >= 2
  const canSearch = useMemo(() => q.trim().length >= 2, [q]);

  async function doSearch(query: string, m: Mode) {
    if (!query || query.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=${m}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  // debounce 300ms khi gõ
  useEffect(() => {
    if (!touched || !canSearch) return;
    const t = setTimeout(() => doSearch(q.trim(), mode), 300);
    return () => clearTimeout(t);
  }, [q, mode, touched, canSearch]);

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1>Logistics Tracking</h1>
      <p>Nhập Shipment / Container / MBL / HBL / Tracking…</p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setTouched(true); }}
          onKeyDown={(e) => { if (e.key === "Enter") { setTouched(true); doSearch(q.trim(), mode); } }}
          placeholder="VD: SHP0001, CONT-ABC1234, MBL123..."
          style={{ flex: 1, minWidth: 260, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />
        <select
          value={mode}
          onChange={(e) => { const m = e.target.value as Mode; setMode(m); setTouched(true); if (canSearch) doSearch(q.trim(), m); }}
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          aria-label="Mode"
        >
          <option value="ALL">All</option>
          <option value="SEA">SEA</option>
          <option value="AIR">AIR</option>
        </select>
        <button onClick={() => { setTouched(true); doSearch(q.trim(), mode); }}>
          Tìm
        </button>
      </div>

      {!touched ? (
        <p style={{ marginTop: 16, color: "#666" }}>Hãy nhập mã để bắt đầu.</p>
      ) : !canSearch ? (
        <p style={{ marginTop: 16, color: "#666" }}>Nhập ít nhất <b>2 ký tự</b> để tìm.</p>
      ) : loading ? (
        <p style={{ marginTop: 16 }}>Đang tìm…</p>
      ) : rows.length === 0 ? (
        <p style={{ marginTop: 16 }}>Không tìm thấy dữ liệu phù hợp.</p>
      ) : (
        <>
          <div style={{ marginTop: 12, color: "#555" }}>
            Tìm thấy <b>{rows.length}</b> kết quả {mode !== "ALL" ? `(${mode})` : ""}.
          </div>
          <ul style={{ marginTop: 12, listStyle: "none", padding: 0 }}>
            {rows.map((r) => (
              <li key={r.shipment_id} style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  <Link href={`/shipment/${r.shipment_id}`}>
                    <Highlight text={r.shipment_id} q={q} />
                  </Link>{" "}
                  — {r.mode}
                </div>
                <div style={{ fontSize: 14 }}>
                  {r.tracking_id && <>Tracking: <Highlight text={r.tracking_id} q={q} /> · </>}
                  {r.mbl_number && <>MBL: <Highlight text={r.mbl_number} q={q} /> · </>}
                  {r.hbl_number && <>HBL: <Highlight text={r.hbl_number} q={q} /> · </>}
                  {r.containers && <>Containers: <Highlight text={r.containers} q={q} /></>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
