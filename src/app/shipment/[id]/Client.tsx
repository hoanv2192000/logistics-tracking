"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import type { Shipment, InputSea, InputAir, MilestoneAny, Note } from "@/types";
import { useShipment } from "@/lib/useShipment";

/* ================= Types ================= */
type Detail = {
  shipment: Shipment;
  input_sea: InputSea[];
  input_air: InputAir[];
  milestones: MilestoneAny | null;
  notes: Note[];
};

/* ================= Labels ================= */
const SEA_STEPS: Record<string, string> = {
  step1: "Pickup at Shipper",
  step2: "Received at Origin Warehouse / CY",
  step3: "Export Customs Clearance",
  step4: "Place of Receipt (if different)",
  step5: "Port of Loading (POL)",
  step6: "Transshipment Port(s)",
  step7: "Port of Discharge (POD)",
  step8: "Import Customs Clearance",
  step9: "Place of Delivery (if different)",
  step10: "Final Delivery to Consignee",
};
const AIR_STEPS: Record<string, string> = {
  step1: "Pickup at Shipper",
  step2: "Received at Origin Warehouse / CY",
  step3: "Export Customs Clearance",
  step4: "Airport of Loading (AOL)",
  step5: "Transit Airport(s)",
  step6: "Airport of Destination (AOD)",
  step7: "Import Customs Clearance",
  step8: "Final Delivery to Consignee",
};
const EXTRA_STEPS_SEA: Record<string, string> = {
  "step6.1": "(Optional) Extra Transshipment",
  "step6.2": "(Optional) Extra Transshipment",
  "step6.3": "(Optional) Extra Transshipment",
  step6_1: "(Optional) Extra Transshipment",
  step6_2: "(Optional) Extra Transshipment",
  step6_3: "(Optional) Extra Transshipment",
};
const EXTRA_STEPS_AIR: Record<string, string> = {
  "step5.1": "(Optional) Extra Transshipment",
  "step5.2": "(Optional) Extra Transshipment",
  "step5.3": "(Optional) Extra Transshipment",
  "step5.4": "(Optional) Extra Transshipment",
  step5_1: "(Optional) Extra Transshipment",
  step5_2: "(Optional) Extra Transshipment",
  step5_3: "(Optional) Extra Transshipment",
  step5_4: "(Optional) Extra Transshipment",
};

/* ================= Helpers ================= */
function normalizeStepKey(raw: string | number | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "step?";
  if (/^\d+(\.|_)?\d*$/.test(s)) return `step${s.replace("_", ".")}`;
  if (s.startsWith("step")) return s.replace("_", ".");
  return s;
}

function readString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(rec, key)) return null;
  const v = rec[key];
  return typeof v === "string" ? v : null;
}
function readUnknown(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  return rec[key];
}

/** Helpers cho Note */
function getStepFromNote(n: Note): string {
  const raw = readUnknown(n, "step");
  return normalizeStepKey(typeof raw === "string" ? raw : undefined);
}
function getNoteTimeMs(n: Note): number {
  const raw = readUnknown(n, "note_time");
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}
function getNoteTimeText(n: Note, sliceTo: number): string {
  const raw = readUnknown(n, "note_time");
  if (raw instanceof Date) return raw.toISOString().slice(0, sliceTo).replace("T", " ");
  if (typeof raw === "string") return raw.slice(0, sliceTo).replace("T", " ");
  return "";
}
function getNoteType(n: Note): string | undefined {
  return readString(n, "note_type") ?? undefined;
}
function getNoteContent(n: Note): string {
  return readString(n, "note") ?? "";
}
function getNoteId(n: Note, fallback: string): string {
  const raw = readUnknown(n, "id");
  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  return fallback;
}

/** Gom milestones thành ordered & extras */
function groupMilestones(ms: MilestoneAny | null) {
  if (!ms) {
    return {
      ordered: [] as { key: string; status?: string | null; date?: string | null }[],
      extras: [] as { key: string; status?: string | null; date?: string | null }[],
    };
  }
  const obj = ms as Record<string, string | null | undefined>;
  const entries = Object.entries(obj).filter(([k]) => k !== "shipment_id" && k !== "created_at");

  const map: Record<string, { status?: string | null; date?: string | null }> = {};
  const extras: { key: string; status?: string | null; date?: string | null }[] = [];

  for (const [k, v] of entries) {
    const base = normalizeStepKey(k.split("_")[0]);
    if (!map[base]) map[base] = {};
    if (k.endsWith("_status")) map[base].status = (v ?? null) as string | null;
    if (k.endsWith("_date")) map[base].date = (v ?? null) as string | null;
  }

  for (const base of Object.keys(map)) {
    if (base.includes(".")) {
      extras.push({ key: base, ...map[base] });
      delete map[base];
    }
  }

  const ordered = Object.keys(map)
    .sort((a, b) => parseFloat(a.replace("step", "")) - parseFloat(b.replace("step", "")))
    .map((key) => ({ key, ...map[key] }));

  extras.sort((a, b) => {
    const pa = parseFloat(a.key.replace("step", ""));
    const pb = parseFloat(b.key.replace("step", ""));
    return pa - pb;
  });

  return { ordered, extras };
}

function formatYMD(d?: string | null): string {
  if (!d) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return d;
}

function groupNotesByStep(notes: Note[]): Record<string, Note[]> {
  const map: Record<string, Note[]> = {};
  for (const n of notes) {
    const key = getStepFromNote(n);
    (map[key] ||= []).push(n);
  }
  for (const k of Object.keys(map)) {
    const arr = map[k];
    if (arr && arr.length > 1) {
      arr.sort((a, b) => getNoteTimeMs(b) - getNoteTimeMs(a));
    }
  }
  return map;
}

const STEP_EXTRA_FIELD: Record<"SEA" | "AIR", Record<string, keyof Shipment>> = {
  SEA: { step4: "place_of_receipt", step5: "pol_aol", step7: "pod_aod", step9: "place_of_delivery" },
  AIR: { step4: "pol_aol", step6: "pod_aod" },
};
function getStepExtraValue(mode: string | undefined, stepKey: string, s: Shipment): string | null {
  const m = (mode === "SEA" ? "SEA" : "AIR") as "SEA" | "AIR";
  const baseKey = normalizeStepKey(stepKey).split(".")[0];
  const field = STEP_EXTRA_FIELD[m][baseKey as keyof typeof STEP_EXTRA_FIELD["SEA"]];
  if (!field) return null;
  const val = s[field];
  if (val == null) return null;
  const str = String(val).trim();
  return str || null;
}

/* ===== helper format remarks -> bullet lines ===== */
function splitRemarksToBullets(raw?: string | null): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  return s
    .split(/[;\n]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x));
}

/* ================= MAIN ================= */
type Props = { id: string };
export default function ShipmentClient({ id }: Props) {
  const { data: hData, loading, refetch } = useShipment(id);
  const data = (hData as Detail | null) ?? null;

  const liRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [highlight, setHighlight] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  const vWrapRef = useRef<HTMLDivElement | null>(null);
  const [railFill, setRailFill] = useState(0);   // chiều dài vạch xanh
  const [railLen, setRailLen] = useState(0);     // chiều cao nét đứt xám
  

  useEffect(() => {
    const channel = supabaseClient.channel(`ship-${id}`);
    const tables = [
      { table: "shipments", filter: `shipment_id=eq.${id}` },
      { table: "input_sea", filter: `shipment_id=eq.${id}` },
      { table: "input_air", filter: `shipment_id=eq.${id}` },
      { table: "milestones_sea", filter: `shipment_id=eq.${id}` },
      { table: "milestones_air", filter: `shipment_id=eq.${id}` },
      { table: "milestones_notes", filter: `shipment_id=eq.${id}` },
    ];

    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    const scheduleRefetch = () => {
      pending = true;
      if (timer) return;
      timer = setTimeout(async () => {
        timer = null;
        if (!pending) return;
        pending = false;
        await refetch();
      }, 800);
    };

    for (const t of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table: t.table, filter: t.filter }, scheduleRefetch);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabaseClient.removeChannel(channel);
    };
  }, [id, refetch]);

  useEffect(() => {
    const calc = () => {
      const wrap = vWrapRef.current;
      if (!wrap) { setRailLen(0); setRailFill(0); return; }
      // Vị trí top của rail trong .vWrap (khớp CSS .rail { top:28px })
      const RAIL_TOP = 28;
      const wrapRect = wrap.getBoundingClientRect();

      // 1) Đo node của ITEM CUỐI (để cắt nét đứt xám đúng điểm)
      const lastAllNode = wrap.querySelector<HTMLElement>(".vList .vItem:last-child .node");
      if (!lastAllNode) { setRailLen(0); setRailFill(0); return; }
      const lastAllRect = lastAllNode.getBoundingClientRect();
      const lastAllCenter = lastAllRect.top - wrapRect.top + lastAllRect.height / 2;

      // Chiều cao "nét đứt xám" từ top của rail đến tâm node cuối
      const railLenCandidate = Math.max(0, lastAllCenter - RAIL_TOP);
      setRailLen(railLenCandidate);

      // 2) Đo node đã DONE cuối cùng (để tính vạch xanh)
      const doneNodes = Array.from(wrap.querySelectorAll<HTMLElement>(".vList .vItem .nodeDone"));
      if (doneNodes.length === 0) { setRailFill(0); return; }
      const lastDone = doneNodes[doneNodes.length - 1]!;
      const lastDoneRect = lastDone.getBoundingClientRect();
      const lastDoneCenter = lastDoneRect.top - wrapRect.top + lastDoneRect.height / 2;

      // Vạch xanh = min(điểm done, chiều dài rail)
      const fillHeight = Math.max(0, Math.min(lastDoneCenter - RAIL_TOP, railLenCandidate));
      setRailFill(fillHeight);
    };
    const r = requestAnimationFrame(calc);
    window.addEventListener("resize", calc);
    return () => { cancelAnimationFrame(r); window.removeEventListener("resize", calc); };
  }, [showAll, highlight, data?.milestones]);

  const stepsMap = useMemo(() => {
    const isSea = data?.shipment?.mode === "SEA";
    const base = isSea ? SEA_STEPS : AIR_STEPS;
    const extra = isSea ? EXTRA_STEPS_SEA : EXTRA_STEPS_AIR;
    return { ...base, ...extra };
  }, [data?.shipment?.mode]);

  const notesByStep = useMemo(() => groupNotesByStep(data?.notes ?? []), [data?.notes]);

  const remarksRaw = readString(data?.shipment ?? null, "remarks") ?? "";
  const remarksItems = useMemo(() => splitRemarksToBullets(remarksRaw), [remarksRaw]);

  if (loading || !data) {
    return (
      <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <div className="sktWrap">
          <div className="sktHeader">
            <div className="sktLogo" />
            <div className="sktTitle" />
          </div>
          <div className="sktRow">
            <div className="sktCard" />
            <div className="sktCard" />
            <div className="sktCard" />
          </div>
          <div className="sktProgress">
            <div className="sktBar" />
          </div>
          <div className="sktTable">
            <div className="sktTh" />
            <div className="sktTr" />
            <div className="sktTr" />
            <div className="sktTr" />
          </div>
        </div>
        <style jsx>{`
          .sktWrap{display:flex;flex-direction:column;gap:18px}
          .sktHeader{display:flex;align-items:center;gap:12px}
          .sktLogo{width:36px;height:36px;border-radius:10px;background:linear-gradient(90deg,#eef2f7 25%,#f7f9fc 37%,#eef2f7 63%);background-size:400px 100%;animation:shimmer 1.4s infinite}
          .sktTitle{flex:1;height:22px;border-radius:8px;background:linear-gradient(90deg,#eef2f7 25%,#f7f9fc 37%,#eef2f7 63%);background-size:400px 100%;animation:shimmer 1.4s infinite}
          .sktRow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
          .sktCard{height:96px;border-radius:14px;background:linear-gradient(90deg,#eef2f7 25%,#f7f9fc 37%,#eef2f7 63%);background-size:400px 100%;animation:shimmer 1.4s infinite}
          .sktProgress{height:16px;border-radius:999px;overflow:hidden;background:#ecf0f6}
          .sktBar{height:100%;width:40%;border-radius:999px;background:linear-gradient(90deg,#dbeafe,#e0f2fe,#dbeafe);animation:loadbar 1.6s infinite}
          .sktTable{border:1px solid #e6eaf2;border-radius:16px;padding:12px;background:#fff;box-shadow:0 10px 28px rgba(15,23,42,0.05)}
          .sktTh{height:18px;border-radius:8px;background:linear-gradient(90deg,#eef2f7 25%,#f7f9fc 37%,#eef2f7 63%);background-size:400px 100%;animation:shimmer 1.4s infinite;margin-bottom:10px}
          .sktTr{height:46px;border-radius:10px;background:linear-gradient(90deg,#eef2f7 25%,#f7f9fc 37%,#eef2f7 63%);background-size:400px 100%;animation:shimmer 1.4s infinite}
          .sktTr + .sktTr{margin-top:8px}
          @keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
          @keyframes loadbar{0%{transform:translateX(-40%)}100%{transform:translateX(120%)}}
          @media (max-width:860px){.sktRow{grid-template-columns:1fr}}
        `}</style>
      </main>
    );
  }

  const { ordered, extras } = groupMilestones(data.milestones);
  const s: Shipment = data.shipment;
  const isInProgress = (st?: string | null) => /in[\s-]*progress/i.test(st ?? "");
  const isStatusDone = (st?: string | null) => /\bdone\b/i.test(st ?? "") || /\bcomplete(d)?\b/i.test(st ?? "");


  const isDoneBase = (o: { status?: string | null; date?: string | null }) => {
    const st = o.status ?? "";
    if (isInProgress(st)) return false; // ép về "current"
    if (isStatusDone(st)) return true; // done/complete
    return !!o.date; // có date thì coi là xong
  };

  const transKeyMain = (s.mode === "SEA" ? "step6" : "step5") as "step6" | "step5";
  const hasAnyTransData = (() => {
    const raw = (data.milestones ?? {}) as Record<string, unknown>;
    const re = new RegExp(`^${transKeyMain}(?:[._]\\d+)?_(?:status|date)$`);
    for (const [k, v] of Object.entries(raw)) {
      if (re.test(k)) {
        const val = (v ?? "").toString().trim();
        if (val !== "") return true;
      }
    }
    return false;
  })();

  const finalKeyMain = (s.mode === "SEA" ? "step10" : "step8") as "step10" | "step8";

  const isDoneWithTrans = (o: { key: string; status?: string | null; date?: string | null }) => {
    if (o.key === transKeyMain && !hasAnyTransData) return true;
    if (o.key === finalKeyMain) {
      const st = (o.status || "").toLowerCase();
      if (st.includes("delivered")) return true;
    }
    return isDoneBase(o);
  };

  const idxInProgress = ordered.findIndex((o) => isInProgress(o.status ?? null));
  const firstTodoIdx = ordered.findIndex((o) => !isDoneWithTrans(o));
  const currentIdx = 
    idxInProgress !== -1
    ? idxInProgress
    : (firstTodoIdx === -1 ? Math.max(0, ordered.length - 1) : firstTodoIdx);
  const percent = Math.min(100, Math.round(((currentIdx + 1) / Math.max(1, ordered.length)) * 100));

  const shipmentStatusFallback =
    readString(s, "status") ??
    readString(s, "current_status") ??
    readString(s, "shipment_status") ??
    readString(s, "state");

  const latest = getLatestMilestoneStatus(ordered, extras);
  const effectiveStatus =
    latest?.status && latest.date ? `${latest.status} (${formatYMD(latest.date)})` : shipmentStatusFallback || "N/A";

  const tsHas = s.transshipment_ports !== undefined && s.transshipment_ports !== null;
  const tsDisplay = tsHas ? String(s.transshipment_ports || "").trim() || "Yes" : "No";

  type ExtraChild = { label: string; date?: string | null; status?: string | null };
  type DispStep = {
    id: string;
    label: string;
    location?: string | null;
    code?: string | null;
    status: "done" | "current" | "pending";
    statusText: string;
    notes: Note[];
    children?: ExtraChild[];
  };

  const baseMap = data.shipment.mode === "SEA" ? SEA_STEPS : AIR_STEPS;
  const transitKey = data.shipment.mode === "SEA" ? "step6" : "step5";

  function mkStatusText(st?: string | null, dt?: string | null) {
    const raw = (st ?? "").trim();
    if (raw) return `${raw}${dt ? ` (${formatYMD(dt)})` : ""}`;
    if (dt) return `Done (${formatYMD(dt)})`;
    return "N/A";
  }

  function mkState(idx: number): DispStep["status"] {
    if (idx < currentIdx) return "done";
    if (idx === currentIdx) {
      const obj = ordered[idx];
      return obj && isDoneWithTrans(obj) ? "done" : "current";
    }
    return "pending";
  }

  const childrenForTransit: ExtraChild[] | undefined =
    extras.length > 0
      ? extras.map((ex) => ({
          label: (data.shipment.mode === "SEA" ? EXTRA_STEPS_SEA[ex.key] : EXTRA_STEPS_AIR[ex.key]) || "(Optional) Extra Transshipment",
          date: ex.date ?? null,
          status: ex.status ?? null,
        }))
      : undefined;

  const dispSteps: DispStep[] = ordered.map((st, idx) => {
    const label = baseMap[st.key] ?? st.key.toUpperCase();
    const extraVal = getStepExtraValue(s.mode as string | undefined, st.key, s);
    const loc = extraVal || null;
    const code =
      st.key === "step5" && s.pol_aol ? String(s.pol_aol) : st.key === "step7" && s.pod_aod ? String(s.pod_aod) : null;
    const state = mkState(idx);
    const txt = mkStatusText(st.status, st.date);
    const nlist = notesByStep[st.key] || [];
    return {
      id: st.key,
      label,
      location: loc,
      code,
      status: state,
      statusText: txt,
      notes: nlist,
      ...(st.key === transitKey && childrenForTransit ? { children: childrenForTransit } : {}),
    };
  });

  const visibleSteps = showAll
    ? dispSteps
    : dispSteps.filter(
        (d) =>
          (ordered.find((o) => o.key === d.id)?.date ?? null) &&
          (ordered.find((o) => o.key === d.id)?.status ?? null)
      );
  const hiddenCount = dispSteps.length - visibleSteps.length;

  const getRef = (id: string) => (el: HTMLLIElement | null) => {
    liRefs.current[id] = el;
  };

  const scrollWithOffset = (el: HTMLElement) => {
    const offset = (stickyRef.current?.offsetHeight ?? 0) + 12;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const jumpTo = (id: string) => {
    const el = liRefs.current[id];
    if (el) {
      scrollWithOffset(el);
      setHighlight(id);
      setTimeout(() => setHighlight((c) => (c === id ? null : c)), 1600);
    } else {
      setShowAll(true);
      setTimeout(() => {
        const e2 = liRefs.current[id];
        if (e2) {
          scrollWithOffset(e2);
          setHighlight(id);
          setTimeout(() => setHighlight((c) => (c === id ? null : c)), 1600);
        }
      }, 60);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>
          Shipment {s.shipment_id} — {s.mode}
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={async () => {
              const link = `${location.origin}/shipment/${id}`;
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="copyBtn"
          >
            {copied ? "Đã copy ✅" : "Copy link"}
          </button>
        </div>
      </div>

      {/* Info */}
      <section className="infoCard">
        <div className="grid2">
          <KVT k="Shipment ID" v={<span style={{ fontSize: 15, fontWeight: 600 }}>{s.shipment_id ?? "—"}</span>} />
          <div className="statusRow">
            <span className="statusLbl">Status</span>
            <span className="statusPill">{effectiveStatus}</span>
          </div>
        </div>
        <div className="divider" />
        <div className="grid2">
          <KVT k="Mode" v={<span style={{ fontSize: 15, fontWeight: 600 }}>{s.mode ?? "—"}</span>} />
          <KVT k="Carrier" v={<span style={{ fontSize: 15, fontWeight: 600 }}>{s.carrier ?? "—"}</span>} />
        </div>
      </section>

      {/* Route / Timeline mini cards */}
      <section className="secGrid">
        <div className="secCard">
          <h3 className="secTitle">BILL OF LADING</h3>
          <div className="secBody">
            <KVT k="MBL" v={s.mbl_number ?? "—"} />
            <div className="line" />
            <KVT k="HBL" v={s.hbl_number ?? "—"} />
            <div className="line" />
            <KVT k="Scope of Service" v={s.scope_of_service ?? "—"} />
          </div>
        </div>
        <div className="secCard">
          <h3 className="secTitle">ROUTE</h3>
          <div className="secBody">
            <KVT k="POL/AOL" v={s.pol_aol ?? "—"} />
            <div className="line" />
            <KVT k="Transit" v={tsDisplay} />
            <div className="line" />
            <KVT k="POD/AOD" v={s.pod_aod ?? "—"} />
             <div className="line" />
             <KVT k="Place of Delivery" v={s.place_of_delivery ?? "—"} />
            <div className="line" />
            <div style={{ fontSize: 13 }}>
              <div style={{ color: "#64748b" }}>Route</div>
              <div style={{ color: "#0f172a", fontWeight: 600 }}>{s.route ?? "—"}</div>
            </div>
          </div>
        </div>
        <div className="secCard">
          <h3 className="secTitle">TIMELINE</h3>
          <div className="timelineGrid">
            <KVT k="ETD" v={formatYMD(s.etd_date as unknown as string)} />
            <KVT k="ATD" v={formatYMD(s.atd_date as unknown as string)} />
            <KVT k="ETA" v={formatYMD(s.eta_date as unknown as string)} />
            <KVT k="ATA" v={formatYMD(s.ata_date as unknown as string)} />
          </div>
        </div>
      </section>

      {/* ===== Remarks ===== */}
      <section className="secCard remarksCard">
        <h3 className="secTitle">REMARKS</h3>
        {remarksItems.length === 0 ? (
          <div className="muted">—</div>
        ) : (
          <ul className="remarksList">
            {remarksItems.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== OVERALL PROGRESS ===== */}
      <section className="hybCard">
        <h3 className="secTitle">OVERALL PROGRESS</h3>
        <div className="stickyWrap" ref={stickyRef}>
          <div className="miniBar">
            <div className="miniTop">
              <span>
                Status
                {(() => {
                  const cur = dispSteps[currentIdx];
                  return cur ? <span className="nowText">  • Now: {cur.label}</span> : null;
                })()}
              </span>
              <span>{percent}%</span>
            </div>
            <div className="miniMeter">
              <div className="miniFill" style={{ width: `${percent}%` }} />
            </div>
            <div className="chips">
              {dispSteps.map((d, i) => (
                <button
                  key={d.id}
                  className={
                    "chip " + (d.status === "done" ? "chipDone" : d.status === "current" ? "chipCurrent" : "chipTodo")
                  }
                  title={`${i + 1}. ${d.label}${d.location ? ` / ${d.location}` : ""}`}
                  onClick={() => jumpTo(d.id)}
                >
                  {i + 1}. {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Vertical timeline */}
        <div className="vWrap" ref={vWrapRef}>
        <div className="rail" style={{ height: railLen }} />
        <div className="railFill" style={{ height: railFill }} />
          <ul className="vList">
            {visibleSteps.map((d, idx) => {
              const sideRight = idx % 2 === 1;
              const isFocus = highlight === d.id;
              return (
                <li key={d.id} ref={getRef(d.id)} id={d.id} className="vItem">
                  <div
                    className={
                      "node " + (d.status === "done" ? "nodeDone" : d.status === "current" ? "nodeCur" : "nodeTodo")
                    }
                  >
                    <span className="nodeSym">{d.status === "done" ? "✓" : d.status === "current" ? "•" : ""}</span>
                  </div>

                  <div className={`card ${sideRight ? "cardR" : "cardL"} ${isFocus ? "cardFocus" : ""}`}>
                    <div className="cardTop">
                      <h3 className="ttl">
                        <span className="idx">{ordered.findIndex((o) => o.key === d.id) + 1}</span>
                        <span>
                          {d.label}
                          {d.location ? <span className="loc"> / {d.location}</span> : null}
                        </span>
                      </h3>
                    </div>

                    <div className="sub">
                      {d.statusText}
                      {d.code ? `  •  ${d.code}` : ""}
                    </div>

                    {d.children && d.children.length > 0 && (
                      <div className="extraBox" aria-label="Extra Transshipment list">
                        {d.children.map((c, i2) => (
                          <div key={i2} className="extraRow">
                            <span className="extraStatus">{(c.status ?? "N/A").toString()}</span>
                            <span className="extraDate">({c.date ? formatYMD(c.date) : "—"})</span>
                            <span className="extraDash">–</span>
                            <span className="extraLabel">{c.label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <NotesBox notes={d.notes} stepId={d.id} stepsMap={stepsMap} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="showMore">
          <button
            className="showBtn"
            onClick={() => setShowAll((v) => !v)}
            aria-label={showAll ? "Show less milestones" : "Show all milestones"}
          >
            {showAll ? "Show less" : `Show all${hiddenCount > 0 ? ` (${hiddenCount} more)` : ""}`}
          </button>
        </div>
      </section>

      {/* ===== Details ===== */}
      <section className="secWrap">
        <h3 className="secHeading">Details</h3>

        {s.mode === "SEA" ? (
          data.input_sea.length === 0 ? (
            <p className="muted">No containers.</p>
          ) : (
            <div className="premiumTable sea">
              <div className="tHead">
                <div>No.</div>
                <div>Container</div>
                <div>Size/Type</div>
                <div>Vessel</div>
                <div>Voyage</div>
                <div>Weight (kgs)</div>
                <div>Volume (cbm)</div>
              </div>
              {data.input_sea.map((c: InputSea, idx: number) => (
                <div className="tRow" key={c.container_number ?? String(idx)}>
                  <div>{idx + 1}</div>
                  <div>{c.container_number}</div>
                  <div>{c.size_type ?? "—"}</div>
                  <div>{c.vessel ?? "—"}</div>
                  <div>{c.voyage ?? "—"}</div>
                  <div>{c.weight_kg ?? "—"}</div>
                  <div>{c.volume_cbm ?? "—"}</div>
                </div>
              ))}
            </div>
          )
        ) : data.input_air.length === 0 ? (
          <p className="muted">No flight info.</p>
        ) : (
          <div className="premiumTable air">
            <div className="tHead">
              <div>No.</div>
              <div>Flight</div>
              <div>Unit Kind</div>
              <div>Pieces</div>
              <div>Gross (kg)</div>
              <div>Chargeable (kg)</div>
            </div>
            {data.input_air.map((f: InputAir, idx: number) => (
              <div className="tRow" key={f.flight ?? String(idx)}>
                <div>{idx + 1}</div>
                <div>{f.flight}</div>
                <div>{f.unit_kind ?? "—"}</div>
                <div>{f.pieces ?? "—"}</div>
                <div>{f.weight_kg ?? "—"}</div>
                <div>{f.chargeable_weight_kg ?? "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="notesCard">
        <h3 className="secTitle">NOTES</h3>
        {data.notes.length === 0 ? (
          <p className="muted"> No notes.</p>
        ) : (
          <ul className="noteList">
            {data.notes.map((n, i) => {
              const tsFmt = getNoteTimeText(n, 19);
              const keyNorm = getStepFromNote(n);
              const label = stepsMap[keyNorm] ?? keyNorm.toUpperCase();
              const type = getNoteType(n);
              const noteText = getNoteContent(n);
              const keyId = getNoteId(n, `note-${i}-${tsFmt}`);
              return (
                <li key={keyId} className="noteItem">
                  <span className="dot" />
                  <div className="noteBody">
                    <div className="noteMeta">
                      {tsFmt} — {label}
                      {type ? ` (${type})` : ""}
                    </div>
                    <div className="noteText">{noteText}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <style jsx>{`
        /* Pills & buttons */
        .copyBtn{padding:6px 12px;border-radius:10px;border:1px solid #0b1220;background:#0b1220;color:#fff;font-weight:700}

        /* Info cards */
        .infoCard{margin-top:16px;border-radius:16px;border:1px solid #e2e8f0;background:linear-gradient(135deg,#fff,#f8fafc);box-shadow:0 8px 28px rgba(15,23,42,.06);padding:18px 16px}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:center}
        .divider{height:1px;margin:10px 0 12px;background:linear-gradient(90deg,rgba(0,0,0,0) 0%,#e2e8f0 50%,rgba(0,0,0,0) 100%)}
        .statusRow{display:flex;align-items:center;justify-content:space-between}
        .statusLbl{color:#64748b;font-size:13px}
        .statusPill{
          display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
          border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46;font-size:12px;font-weight:800;
          box-shadow:0 0 0 2px rgba(16,185,129,.05) inset;
        }

        .secGrid{margin-top:12px;display:grid;gap:16px;grid-template-columns:repeat(3,1fr)}
        .secCard{border:1px solid #e2e8f0;border-radius:14px;background:#ffffffe6;backdrop-filter:saturate(120%) blur(2px);box-shadow:0 10px 24px rgba(15,23,42,.05);padding:14px;transition:box-shadow .2s}
        .secCard:hover{box-shadow:0 16px 36px rgba(15,23,42,.08)}
        .secTitle{margin:0 0 8px 0;font-size:12px;letter-spacing:.08em;color:#64748b;font-weight:700}
        .secBody{display:flex;flex-direction:column;gap:8px}
        .line{height:1px;background:#eef2f7}
        .timelineGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}
        @media (max-width:860px){.secGrid{grid-template-columns:1fr}}

        /* Remarks */
        .remarksCard{margin-top:0}
        .remarksList{margin:0;padding-left:18px;list-style:disc}
        .remarksList li{margin:4px 0;color:#0f172a;font-weight:600}

        .hybCard{margin-top:16px;border-radius:18px;border:1px solid #e6eaf2;background:linear-gradient(180deg,#fff 0%,#f7f9fc 100%);box-shadow:0 14px 36px rgba(15,23,42,.08);padding:16px}
        .stickyWrap{position:sticky;top:0;z-index:20}
        .miniBar{border:1px solid #e5e7eb;background:#fff;border-radius:16px;box-shadow:0 6px 16px rgba(15,23,42,.06);padding:10px 12px}
        .miniTop{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#667085}
        .miniMeter{height:8px;background:#ecf0f6;border-radius:999px;overflow:hidden;margin-top:6px}
        .miniFill{height:100%;background:linear-gradient(90deg,#10b981,#22c55e)}
        .chips{display:flex;gap:8px;overflow-x:auto;padding-top:6px;padding-bottom:2px}
        .chip{white-space:nowrap;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid;transition:all .15s ease;cursor:pointer}
        .chipDone{background:#eafff2;border-color:#a7f3d0;color:#065f46}
        .chipDone:hover{background:#16a34a;border-color:#15803d;color:#fff;box-shadow:0 0 0 2px rgba(22,163,74,.25)}
        .chipCurrent{background:#fff7ed;border-color:#fdba74;color:#9a3412;box-shadow:0 0 0 2px #fed7aa}
        .chipCurrent:hover{background:#fb923c;border-color:#f97316;color:#fff;box-shadow:0 0 0 2px rgba(251,146,60,.30)}
        .chipTodo{background:#f6f7fb;border-color:#e5e7eb;color:#667085}
        .chipTodo:hover{background:#cbd5e1;border-color:#94a3b8;color:#111827}

        .vWrap{position:relative;background:#fff;border-radius:18px;box-shadow:0 8px 20px rgba(15,23,42,.06);padding:20px;margin-top:10px}
        .rail{position:absolute;left:50%;top:28px;transform:translateX(-50%);border-left:2px dashed #d1d5db;pointer-events:none;z-index:0;height:0}
        .railFill{position:absolute;left:50%;top:28px;transform:translateX(-50%);border-left:2px solid #10b981;height:0;z-index:1;transition:height .25s ease}
        .vList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:18px}
        .vItem{position:relative;padding-top:8px}
        .node{position:absolute;left:50%;top:8px;transform:translateX(-50%);width:28px;height:28px;border-radius:50%;display:grid;place-items:center;border:2px solid;z-index:2}
        .nodeDone{background:#ecfdf5;border-color:#10b981;color:#059669}
        .nodeCur{background:#fff7ed;border-color:#fb923c;color:#f97316;animation:pulse 1.6s ease-in-out infinite}
        .nodeTodo{background:#f8fafc;border-color:#cbd5e1;color:#94a3b8}
        .nodeSym{font-size:12px}
        @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(251,146,60,.35)}70%{box-shadow:0 0 0 10px rgba(251,146,60,0)}100%{box-shadow:0 0 0 0 rgba(251,146,60,0)}}

        .card{position:relative;z-index:1;width:calc(50% - 32px);background:#ffffffb3;border:1px solid #e5e7eb;border-radius:14px;padding:12px 14px;backdrop-filter:saturate(120%);box-shadow:0 8px 20px rgba(15,23,42,.05);transition:box-shadow .15s,border-color .15s}
        .cardL{margin-right:auto;padding-right:20px}
        .cardR{margin-left:auto;padding-left:20px}
        .cardFocus{border-color:#FACC15;box-shadow:0 0 0 2px rgba(250,204,21,.35) inset, 0 0 0 2px rgba(250,204,21,.15)}
        .ttl{display:flex;align-items:center;gap:8px;margin:0;font-weight:700;font-size:16px}
        .idx{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;border:1px solid #d1d5db;background:#fff;font-size:12px;color:#334155;line-height:1;padding:0}
        .loc{color:#9aa4b2}
        .badge{font-size:11px;border:1px solid #e5e7eb;border-radius:999px;padding:2px 8px}
        .sub{margin-top:6px;color:#6b7280;font-weight:600}

        .extraBox{margin-top:10px;border:1px solid #e5e7eb;background:#fafbff;border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
        .extraRow{display:grid;grid-template-columns:auto auto 12px 1fr;align-items:center;gap:8px;font-weight:600;color:#0f172a}
        .extraStatus{padding:2px 8px;border:1px solid #e5e7eb;border-radius:999px;font-size:12px;background:#ffffff}
        .extraDate{color:#6b7280;font-size:12px}
        .extraDash{color:#9ca3af}
        .extraLabel{font-size:12px;color:#334155;font-weight:600;line-height:1.25}

        /* (Giữ nguyên các style khác; style riêng của NotesBox đã đặt trong NotesBox) */

        .showMore{display:flex;justify-content:center;margin-top:10px}
        .showBtn{padding:8px 14px;border-radius:999px;border:1px solid #e5e7eb;background:#fff}
        .showBtn:hover{box-shadow:0 2px 8px rgba(0,0,0,.06)}

        .secWrap{margin-top:16px}
        .secHeading{margin:0 0 10px 0;font-size:14px;letter-spacing:.08em;color:#64748b;font-weight:800;text-transform:uppercase}
        .premiumTable{border:1px solid #e6eaf2;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 10px 28px rgba(15,23,42,.05)}
        .premiumTable .tHead{background:linear-gradient(180deg,#f7f9fc,#f2f5fb);color:#334155;font-weight:800;font-size:13px;border-bottom:1px solid #e9edf5}
        .premiumTable.sea .tHead,.premiumTable.sea .tRow{display:grid;grid-template-columns:64px 1.25fr 120px 1.35fr 120px 140px 140px;gap:16px;align-items:center;padding:12px 16px}
        .premiumTable.sea .tHead,.premiumTable.sea .tRow{place-items: center;text-align: center}
        .premiumTable.air .tHead,.premiumTable.air .tRow{display:grid;grid-template-columns:64px 1.4fr 150px 120px 160px 200px;gap:16px;align-items:center;padding:12px 16px}
        .premiumTable .tRow + .tRow{border-top:1px solid #eef2f7}
        .premiumTable .tRow:hover{background:#f9fbff}
        .muted{color:#64748b;margin:6px 0 0 2px}

        .notesCard{margin-top:16px;border-radius:16px;border:1px solid #e6eaf2;background:linear-gradient(180deg,#fff,#fafbff);box-shadow:0 10px 28px rgba(15, 23, 42,.06);padding:14px 16px}
        .noteList{margin:0;padding-left:0;list-style:none}
        .noteItem{display:grid;grid-template-columns:14px 1fr;gap:10px;align-items:start;padding:10px 4px;border-radius:10px}
        .noteItem + .noteItem{border-top:1px dashed #e8ecf4}
        .noteItem:hover{background:#f8fafc}
        .dot{width:8px;height:8px;margin-top:6px;border-radius:999px;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15)}
        .noteMeta{font-size:12px;color:#667087;font-weight:700;letter-spacing:.02em}
        .noteText{margin-top:4px;color:#111827;font-size:13.5px}
        .nowText {color: #f97316; font-weight: 700;}
      `}</style>
    </main>
  );
}

/* ===== helpers ===== */
function KVT({ k, v }: { k: string; v?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "#64748b" }}>{k}</span>
      <span style={{ color: "#0f172a", fontWeight: 600 }}>{v ?? "—"}</span>
    </div>
  );
}

/* ================= NotesBox (with local styled-jsx) ================= */
function NotesBox({
  notes,
  stepId: _stepId,
  stepsMap: _stepsMap,
}: {
  notes: Note[];
  stepId: string;
  stepsMap: Record<string, string>;
}) {
  void _stepId;
  void _stepsMap;
  const hasNotes = (notes?.length ?? 0) > 0;
  return (
    <div className="notesBox">
      {/* Header Variant B */}
      <div className={`notesHeadB ${hasNotes ? "hasNotes" : "zero"}`}>
        <span className="notesTB">MILESTONE NOTES</span>
        <span className={`notesCountB ${hasNotes ? "ok" : "zero"}`}>
          {notes?.length ?? 0} {notes && notes.length === 1 ? "note" : "notes"}
        </span>
      </div>

      {!notes || notes.length === 0 ? (
        <div style={{ color: "#9aa4b2" }}>—</div>
      ) : (
        <ul className="nList">
          {notes.map((n) => {
            const tsFmt = getNoteTimeText(n, 16);
            const type = getNoteType(n);
            const noteText = getNoteContent(n);
            const keyId = getNoteId(n, `${tsFmt}-${noteText}`);
            return (
              <li key={keyId} className="nItem">
                <span className="nDot" />
                <div>
                  <div className="nMeta oneLine">
                    {type ? icon(type) : ""} {noteText}
                    {type ? <span className="nType"> • {type}</span> : null} <span className="nDate">({tsFmt})</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 🔽 Stylescope RIÊNG CHO NotesBox để tránh lỗi styled-jsx scope */}
      <style jsx>{`
        .notesBox{margin-top:10px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;padding:10px;overflow:hidden}

        .notesHeadB{
          position:relative;display:flex;align-items:center;justify-content:space-between;
          padding:8px 10px;border-radius:12px;border:1px solid #e6eaf2;
          background:linear-gradient(180deg,#ffffff 0%,#f7fdf9 100%);
          box-shadow:0 1px 0 #fff inset, 0 6px 18px rgba(16,185,129,.06);
          margin-bottom:8px;
        }
        .notesHeadB::before{
          content:"";position:absolute;left:0;top:0;bottom:0;width:6px;
          border-top-left-radius:12px;border-bottom-left-radius:12px;
          background:linear-gradient(180deg,#10b981,#22c55e);
        }
        .notesHeadB.zero{
          background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);
          box-shadow:0 1px 0 #fff inset; /* bỏ ánh xanh */
        }
        .notesHeadB.zero::before{
          background:#e5e7eb; /* thanh bên trái xám */
        }
        .notesTB{font-size:12px;font-weight:900;letter-spacing:.08em;color:#0f172a;padding-left:6px}
        .notesCountB{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;border:1px solid transparent}
        .notesCountB.ok{color:#065f46;background:#ecfdf5;border-color:#a7f3d0;box-shadow:0 0 0 2px rgba(16,185,129,.08) inset}
        .notesCountB.zero{color:#6b7280;background:#f3f4f6;border-color:#e5e7eb;box-shadow:none}

        .nList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
        .nItem{display:grid;grid-template-columns:10px 1fr;gap:8px;align-items:flex-start}
        .nItem > div{min-width:0}
        .nDot{width:6px;height:6px;border-radius:999px;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15);margin-top:6px}
        .nMeta{font-size:11px;color:#6b7280;font-weight:700}
        .oneLine{white-space: normal;overflow: visible;text-overflow: clip;word-break: break-word;overflow-wrap: anywhere}
        .nType{margin-right:6px}
        .nDate{margin-left:6px;white-space:nowrap}
      `}</style>
    </div>
  );
}

function icon(t?: string) {
  const m: Record<string, string> = { info: "ℹ️", eta: "⏱️", risk: "⚠️", doc: "📄", broker: "🧑‍💼", photo: "🖼️" };
  return m[(t || "").toLowerCase()] ?? "";
}

type MilestoneLite = { key: string; status?: string | null; date?: string | null };
function getLatestMilestoneStatus(
  ordered: MilestoneLite[],
  extras: MilestoneLite[]
): { status: string | null; date: string | null } | null {
  const all = [...ordered, ...extras].filter(
    (x): x is MilestoneLite & { date: string } => typeof x.date === "string" && !Number.isNaN(Date.parse(x.date))
  );
  if (all.length === 0) return null;
  all.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const first = all[0]!;
  return { status: first.status ?? null, date: first.date ?? null };
}
