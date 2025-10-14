"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { SearchRow } from "@/types";
import { lruSearchGet, lruSearchSet } from "@/lib/cache";

/* ===== Utils ===== */
function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
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
          {i < parts.length - 1 && <mark className="hl">{matches[i]}</mark>}
        </span>
      ))}
    </>
  );
}

// an toàn hơn any
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

type SortBy = "ETD" | "ETA";
type Dir = "ASC" | "DESC";

/* ===== Page ===== */
export default function Page() {
  const [q, setQ] = useState<string>("");
  const [pol, setPol] = useState<string>("ALL");
  const [pod, setPod] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("ETD");
  const [dir, setDir] = useState<Dir>("DESC");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [touched, setTouched] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);
  const canSearch = useMemo(() => q.trim().length >= 2, [q]);

  // unique (case-insensitive) cho POL/POD
  function uniqueCaseInsensitive(values: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
      const k = v.toLowerCase();
      if (v && !seen.has(k)) {
        seen.add(k);
        out.push(v);
      }
    }
    return out;
  }

  const polOptions = useMemo(() => {
    const list = rows
      .map((r) => String((r as Record<string, unknown>)["pol_aol"] ?? "").trim())
      .filter(Boolean);
    return uniqueCaseInsensitive(list);
  }, [rows]);

  const podOptions = useMemo(() => {
    const list = rows
      .map((r) => String((r as Record<string, unknown>)["pod_aod"] ?? "").trim())
      .filter(Boolean);
    return uniqueCaseInsensitive(list);
  }, [rows]);

  function buildKey() {
    return JSON.stringify({
      q: q.trim(),
      pol: pol.trim() === "" ? "ALL" : pol,
      pod: pod.trim() === "" ? "ALL" : pod,
      sortBy,
      dir,
    });
  }

  async function doSearch() {
    if (!canSearch) {
      setRows([]);
      return;
    }
    const key = buildKey();

    const cached = lruSearchGet<SearchRow[]>(key);
    if (cached) {
      setRows(cached);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: q.trim(),
        pol: pol.trim() === "" ? "ALL" : pol,
        pod: pod.trim() === "" ? "ALL" : pod,
        sortBy,
        dir,
      });
      const res = await fetch(`/api/search?${params.toString()}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      const json: { ok: boolean; data?: SearchRow[] } = await res.json();
      const data = (json.data || []) as SearchRow[];
      setRows(data);
      lruSearchSet(key, data);
    } catch (e: unknown) {
      // chỉ log nếu không phải AbortError
      if (!(e && typeof e === "object" && (e as { name?: string }).name === "AbortError")) {
        console.error("search error:", e);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!touched || !canSearch) return;
    const t = setTimeout(() => void doSearch(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pol, pod, sortBy, dir, touched, canSearch]);

  // Esc để huỷ khi đang loading
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && loading) {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = null;
        setLoading(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading]);

  function clearAll() {
    setQ("");
    setPol("ALL");
    setPod("ALL");
    setSortBy("ETD");
    setDir("DESC");
    setTouched(false);
    setRows([]);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }

  return (
    <main className="page">
      {/* Header */}
      <div className="header-row">
        <h1 className="title">End-to-End Visibility & Real-Time Tracking</h1>
        <div className="total">
          Total: <b>{rows.length}</b>
        </div>
      </div>

      {/* Filter card */}
      <section className="filter-card">
        <div className="row row-top">
          <div className="field field--search">
            <label>Search</label>
            <div className="search-wrap">
              <span className="icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 20 L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <input
                value={q}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setQ(e.target.value);
                  setTouched(true);
                }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    setTouched(true);
                    void doSearch();
                  }
                }}
                placeholder="Enter Shipment / Container / MBL / HBL / Tracking ID"
              />
            </div>
          </div>

          <div className="field">
            <label>POL</label>
            <select
              value={pol}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setPol(e.target.value);
                setTouched(true);
              }}
            >
              <option value="ALL">ALL</option>
              {polOptions.map((v, i) => (
                <option key={`${v}-${i}`} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>POD</label>
            <select
              value={pod}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setPod(e.target.value);
                setTouched(true);
              }}
            >
              <option value="ALL">ALL</option>
              {podOptions.map((v, i) => (
                <option key={`${v}-${i}`} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="row row-bottom">
          <div className="actions">
            <select
              value={sortBy}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setSortBy(e.target.value as SortBy);
                setTouched(true);
              }}
              aria-label="Sort by"
            >
              <option value="ETD">Sort by ETD</option>
              <option value="ETA">Sort by ETA</option>
            </select>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setDir((d) => (d === "DESC" ? "ASC" : "DESC"));
                setTouched(true);
              }}
            >
              {dir}
            </button>
            <button type="button" className="btn btn-dark" onClick={clearAll}>
              Clear
            </button>
          </div>
          <div aria-hidden />
          <div aria-hidden />
        </div>
      </section>

      {/* Results */}
      {touched && canSearch && (
        <>
          {!loading && rows.length === 0 ? (
            // ===== Empty (Trắng tinh khiết – CTA rõ ràng)
            <section className="empty-wrap">
              <div className="empty-card">
                <h3>No matching records found.</h3>
                <p className="empty-sub">
                  💡Tip: Please verify the spelling or provide a more precise 
                  <b>Tracking ID</b>, <b>MBL number</b>, <b>HBL number</b>, or <b>Container number</b> for better accuracy.
                </p>
                <div className="empty-actions">
                  <button className="btn-cta" onClick={clearAll}>Clear filters</button>
                </div>
              </div>
            </section>
          ) : !loading && rows.length > 0 ? (
            <section className="table-wrap">
              <div className="table-scroll">
                <div className="table">
                  {/* Header */}
                  <div className="tr th">
                    <div className="td td-actions td-sticky">Detail</div>
                    <div className="td">MODE</div>
                    <div className="td">SCOPE OF SERVICE</div>
                    <div className="td">MBL</div>
                    <div className="td">HBL</div>
                    <div className="td">POL/AOL</div>
                    <div className="td">POD/AOD</div>
                    <div className="td">ETD</div>
                    <div className="td">ATD</div>
                    <div className="td">ETA</div>
                    <div className="td">ATA</div>
                  </div>

                  {/* Rows */}
                  {rows.map((r, idx) => {
                    const x = r as SearchRow & Record<string, unknown>;
                    const sx = x as Record<string, unknown>;
                    return (
                      <div className="tr" key={idx}>
                        <div className="td td-actions td-sticky">
                          {/* Nút Premium */}
                          <Link
                            href={`/shipment/${x.shipment_id || ""}`}
                            className="btn-premium"
                            title="View details"
                            aria-label="View details"
                          >
                            <svg
                              className="btn-premium-ico"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden
                            >
                              <path
                                d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            <span className="btn-premium-txt">View</span>
                          </Link>
                        </div>

                        <div className="td">{fmt(sx["mode"])}</div>
                        <div className="td">
                          {fmt(
                            sx["scope_of_service"] ??
                              sx["scope_of_servie"] ??
                              sx["scopeService"] ??
                              sx["scope"] ??
                              sx["service_scope"]
                          )}
                        </div>
                        <div className="td">
                          <Highlight text={fmt(sx["mbl_number"])} q={q} />
                        </div>
                        <div className="td">
                          <Highlight text={fmt(sx["hbl_number"])} q={q} />
                        </div>
                        <div className="td">{fmt(sx["pol_aol"])}</div>
                        <div className="td">{fmt(sx["pod_aod"])}</div>
                        <div className="td">{fmt(sx["etd_date"])}</div>
                        <div className="td">{fmt(sx["atd_date"])}</div>
                        <div className="td">{fmt(sx["eta_date"])}</div>
                        <div className="td">{fmt(sx["ata_date"])}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      {/* ===== Loading Overlay (Style A – Glassmorphism + Soft Motion) */}
      {loading && (
        <div className="overlay" role="status" aria-live="polite" aria-label="Searching">
          <div className="glass">
            <div className="ring">
              <span className="dot" />
            </div>
            <div className="loading-text">Searching…</div>
            <button
              className="cancel"
              onClick={() => {
                if (abortRef.current) abortRef.current.abort();
                abortRef.current = null;
                setLoading(false);
              }}
              aria-label="Cancel searching (Esc)"
              title="Esc"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Styles */}
      <style jsx>{`
        :root {
          --bg: #f4f6fb;
          --card: #fff;
          --text: #0f172a;
          --muted: #475569;
          --border: #cdd6e1;
          --ring: #2563eb33;
        }

        .page {
          min-height: 100vh;
          background: var(--bg);
          padding: 28px 16px 64px;
        }
        .header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1200px;
          margin: 0 auto 12px;
        }
        .title {
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          color: var(--text);
        }
        .total {
          font-size: 12px;
          color: #334155;
          background: #eef2ff;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid #dbeafe;
          font-weight: 700;
        }

        .filter-card {
          max-width: 1200px;
          margin: 0 auto;
          background: linear-gradient(180deg, #ffffff, #f7f9fc);
          border: 1px solid #e6eaf2;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 300px 300px;
          gap: 16px;
        }
        .row-top {
          margin-bottom: 14px;
        }

        .field {
          display: flex;
          flex-direction: column;
        }
        .field label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 6px;
          font-weight: 700;
          letter-spacing: 0.06em;
        }
        .field input,
        .field select {
          height: 40px;
          border: 1.5px solid #9aa7b8;
          border-radius: 10px;
          background: #fff;
          color: #0f172a;
          padding: 8px 12px;
          font-size: 14px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .field input:focus,
        .field select:focus {
          border-color: #64748b;
          box-shadow: 0 0 0 3px var(--ring);
        }

        .search-wrap {
          position: relative;
        }
        .icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #6b7280;
        }
        .search-wrap input {
          padding-left: 38px;
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .actions select {
          width: 150px;
          height: 38px;
          border-radius: 8px;
          border: 1.5px solid #9aa7b8;
          background: #fff;
        }
        .btn {
          height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          border: 1.5px solid #1e293b;
          transition: all 0.15s ease;
        }
        .btn.btn-outline {
          background: #fff;
          color: #0f172a;
        }
        .btn.btn-dark {
          background: #0f172a;
          color: #fff;
          border-color: #0f172a;
        }

        /* ===== Table ===== */
        .table-wrap {
          max-width: 1200px;
          margin: 16px auto 0;
        }
        .table-scroll {
          border: 1px solid #e6eaf2;
          border-radius: 16px;
          background: #fff;
          overflow-x: auto;
          position: relative;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
        }
        .table {
          min-width: 1280px;
          position: relative;
        }
        .tr {
          display: grid;
          grid-template-columns: 80px 90px 180px 160px 140px 120px 120px 110px 110px 110px 110px;
          column-gap: 16px;
          align-items: center;
          padding: 12px 14px;
        }
        .tr.th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #fff;
          border-bottom: 1px solid #e9edf5;
        }
        .tr.th .td {
          font-weight: 800;
          color: #475569;
          font-size: 13px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .td {
          font-size: 14px;
          color: #0f172a;
        }
        .td-actions {
          display: flex;
          align-items: center;
        }
        .td-sticky {
          position: sticky;
          left: 0;
          z-index: 3;
          background: #fff;
        }
        .tr.th .td-sticky {
          z-index: 4;
          background: #fff;
        }
        .td-sticky::after {
          content: "";
          position: absolute;
          top: 0;
          right: -8px;
          width: 8px;
          height: 100%;
          box-shadow: 6px 0 10px rgba(15, 23, 42, 0.06);
          pointer-events: none;
        }
        .table .tr + .tr {
          border-top: 1px solid #eef2f7;
        }
        .table .tr:not(.th):hover {
          background: #f9fbff;
        }

        /* ===== Premium View button ===== */
        .btn-premium {
          --grad-a: #ffffff;
          --grad-b: #f4f7ff;
          --stroke: rgba(15, 23, 42, 0.18);
          --glow: rgba(59, 130, 246, 0.35);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          background: linear-gradient(180deg, var(--grad-a), var(--grad-b));
          border: 1px solid var(--stroke);
          color: #0f172a;
          text-decoration: none;
          font-weight: 800;
          letter-spacing: 0.02em;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 20px rgba(15, 23, 42, 0.08);
          transition: transform 0.12s ease, box-shadow 0.18s ease, border-color 0.18s ease;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
        .btn-premium-ico {
          filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.7));
        }
        .btn-premium:hover {
          transform: translateY(-1px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 1), 0 12px 26px rgba(15, 23, 42, 0.12), 0 0 0 4px var(--glow);
          border-color: rgba(15, 23, 42, 0.25);
        }
        .btn-premium:active {
          transform: translateY(0);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 8px 18px rgba(15, 23, 42, 0.12), 0 0 0 3px var(--glow);
        }
        .btn-premium:focus-visible {
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 0 0 3px rgba(255, 255, 255, 0.85), 0 0 0 5px var(--glow);
        }

        .hl {
          background: #fff1a6;
          padding: 0 2px;
          border-radius: 3px;
        }

        /* ===== Empty – Trắng tinh khiết */
        .empty-wrap {
          max-width: 980px;
          margin: 24px auto 0;
          padding: 0 8px;
        }
        .empty-card {
          background: #ffffff;
          border: 1px solid #e6eaf2;
          border-radius: 16px;
          padding: 28px 24px;
          text-align: center;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
        }
        .empty-card h3 {
          margin: 0 0 8px;
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
        }
        .empty-sub {
          color: #475569;
          margin: 0 auto 16px;
          max-width: 720px;
          line-height: 1.6;
        }
        .empty-actions {
          display: flex;
          justify-content: center;
        }
        .btn-cta {
          height: 40px;
          padding: 0 18px;
          border-radius: 12px;
          border: none;
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
          background: #3b82f6;
          color: white;
          box-shadow: 0 10px 18px rgba(59, 130, 246, 0.25);
          transition: transform 0.1s ease, box-shadow 0.15s ease;
        }
        .btn-cta:hover { transform: translateY(-1px); box-shadow: 0 14px 24px rgba(59,130,246,.28); }
        .btn-cta:active { transform: translateY(0); }

        /* ===== Loading Overlay – Glassmorphism */
        .overlay {
          position: fixed;
          inset: 0;
          background: radial-gradient(1200px 600px at 50% -10%, rgba(59,130,246,0.12), transparent 60%),
                      rgba(248, 250, 252, 0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: grid;
          place-items: center;
          z-index: 50;
        }
        .glass {
          width: 360px;
          max-width: calc(100% - 32px);
          background: linear-gradient(180deg, rgba(255,255,255,0.85), rgba(246,248,252,0.9));
          border: 1px solid rgba(15,23,42,0.08);
          border-radius: 20px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.9),
            0 18px 48px rgba(15, 23, 42, 0.16),
            0 0 0 8px rgba(59,130,246,0.10);
          padding: 24px 20px 18px;
          text-align: center;
        }

        .ring {
          width: 72px;
          height: 72px;
          margin: 2px auto 12px;
          border-radius: 50%;
          position: relative;
          background:
            conic-gradient(from 0deg, rgba(59,130,246,0.9), rgba(59,130,246,0.35) 40%, rgba(59,130,246,0.12) 60%, transparent 80%);
          mask: radial-gradient(circle 32px at 50% 50%, transparent 61%, black 62%);
          animation: spin 1.6s linear infinite;
          filter: drop-shadow(0 6px 14px rgba(59,130,246,0.35));
        }
        .dot {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #3b82f6;
          top: -2px;
          left: 50%;
          transform: translateX(-50%);
          box-shadow: 0 0 10px rgba(59,130,246,0.6);
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .loading-text {
          font-weight: 900;
          letter-spacing: 0.02em;
          color: #0f172a;
          margin-bottom: 10px;
        }
        .cancel {
          height: 36px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.25);
          background: linear-gradient(180deg, #ffffff, #f3f6fc);
          cursor: pointer;
          font-weight: 800;
          color: #0f172a;
        }
        .cancel:hover { box-shadow: 0 8px 18px rgba(15,23,42,0.08); }
      `}</style>
    </main>
  );
}
