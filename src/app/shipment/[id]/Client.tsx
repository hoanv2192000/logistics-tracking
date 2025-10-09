"use client";

import { useEffect, useState, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import type { Shipment, InputSea, InputAir, MilestoneAny, Note } from "@/types";

type Detail = {
  shipment: Shipment;
  input_sea: InputSea[];
  input_air: InputAir[];
  milestones: MilestoneAny | null;
  notes: Note[];
};

async function fetchDetail(id: string): Promise<Detail | null> {
  const res = await fetch(`/api/detail/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data as Detail;
}

// ===== Label mapping =====
const SEA_STEPS: Record<string, string> = {
  step1: "Pickup at Shipper",
  step2: "Received at Origin WH/CY",
  step3: "Export Customs Clearance",
  step4: "Place of Receipt",
  step5: "Port of Loading (POL)",
  step6: "Transshipment Port(s)",
  step7: "Port of Discharge (POD)",
  step8: "Import Customs Clearance",
  step9: "Place of Delivery",
  step10: "Final Delivery",
};

const AIR_STEPS: Record<string, string> = {
  step1: "Pickup",
  step2: "Received at Origin WH/CY",
  step3: "Export Customs Clearance",
  step4: "Airport of Loading (AOL)",
  step5: "Transit Airport(s)",
  step6: "Airport of Destination (AOD)",
  step7: "Import Customs Clearance",
  step8: "Final Delivery",
};

// ===== Helpers =====
function groupMilestones(ms: MilestoneAny | null) {
  if (!ms) {
    return {
      ordered: [] as { key: string; status?: string | null; date?: string | null }[],
      extras: [] as { key: string; status?: string | null; date?: string | null }[],
    };
  }

  const obj = ms as Record<string, unknown>;
  const entries = Object.entries(obj).filter(
    ([k]) => k !== "shipment_id" && k !== "created_at"
  );

  const map: Record<string, { status?: string | null; date?: string | null }> = {};
  const extras: { key: string; status?: string | null; date?: string | null }[] = [];

  for (const [k, v] of entries) {
    const base = k.split("_")[0]; // step1, step5.1 ...
    map[base] ||= {};
    if (k.endsWith("_status")) map[base].status = (v as string) || null;
    if (k.endsWith("_date"))   map[base].date   = (v as string) || null;
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

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <div style={{ minWidth: 120, color: "#555" }}>{label}:</div>
      <div>{String(value)}</div>
    </div>
  );
}

function badgeColor(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (s.includes("deliver")) return { bg: "#e6ffed", border: "#b7eb8f", color: "#237804" }; // delivered
  if (s.includes("in transit") || s.includes("transit")) return { bg: "#e6f7ff", border: "#91d5ff", color: "#0050b3" }; // in transit
  if (s.includes("delay") || s.includes("hold")) return { bg: "#fff1f0", border: "#ffa39e", color: "#a8071a" }; // delay
  return { bg: "#f5f5f5", border: "#d9d9d9", color: "#595959" };
}

function Progress({ steps, completed }: { steps: number; completed: number }) {
  const pct = Math.min(100, Math.round((completed / Math.max(1, steps)) * 100));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 8, background: "#f0f0f0", borderRadius: 999 }}>
        <div style={{ width: `${pct}%`, height: 8, background: "#1677ff", borderRadius: 999 }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: "#555" }}>{completed}/{steps} steps</div>
    </div>
  );
}

/** Đọc chuỗi an toàn theo key (tránh any, tránh lỗi thiếu field trong type) */
function readString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "string" ? v : null;
  }
  return null;
}

export default function ShipmentClient({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const stepsMap = useMemo(
    () => (data?.shipment.mode === "SEA" ? SEA_STEPS : AIR_STEPS),
    [data?.shipment.mode]
  );

  async function copyLink() {
    const link = `${location.origin}/shipment/${id}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  // Fetch ban đầu
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDetail(id).then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [id]);

  // Realtime subscribe
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
    for (const t of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t.table, filter: t.filter },
        async () => {
          const fresh = await fetchDetail(id);
          if (fresh) setData(fresh);
        }
      );
    }
    channel.subscribe();
    return () => { supabaseClient.removeChannel(channel); };
  }, [id]);

  if (loading || !data) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Đang tải shipment {id}...</h1>
      </main>
    );
  }

  const { ordered, extras } = groupMilestones(data.milestones);
  const s = data.shipment;

  const completedCount = ordered.filter(
    (o) =>
      !!o.date ||
      (o.status || "").toLowerCase().includes("done") ||
      (o.status || "").toLowerCase().includes("complete")
  ).length;

  // Đọc status theo nhiều khả năng tên cột (status/current_status/shipment_status/state)
  const shipmentStatus =
    readString(s, "status") ??
    readString(s, "current_status") ??
    readString(s, "shipment_status") ??
    readString(s, "state");

  const badge = badgeColor(shipmentStatus);

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Shipment {s.shipment_id} — {s.mode}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: badge.bg,
              color: badge.color,
              border: `1px solid ${badge.border}`,
              fontSize: 13,
            }}
          >
            {shipmentStatus || "N/A"}
          </span>
          <button
            onClick={copyLink}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            {copied ? "Đã copy ✅" : "Copy link"}
          </button>
        </div>
      </div>

      {/* Summary grid */}
      <section style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Thông tin chung</h3>
          <Field label="Tracking" value={s.tracking_id} />
          <Field label="MBL" value={s.mbl_number} />
          <Field label="HBL" value={s.hbl_number} />
          <Field label="Carrier" value={s.carrier} />
          <Field label="ETD" value={s.etd_date} />
          <Field label="ATD" value={s.atd_date} />
          <Field label="ETA" value={s.eta_date} />
          <Field label="ATA" value={s.ata_date} />
          <Field label="POR" value={s.place_of_receipt} />
          <Field label="POL/AOL" value={s.pol_aol} />
          <Field label="TS Ports" value={s.transshipment_ports} />
          <Field label="POD/AOD" value={s.pod_aod} />
          <Field label="PODelivery" value={s.place_of_delivery} />
          <Field label="Route" value={s.route} />
          <Field label="Remarks" value={s.remarks} />
        </div>

        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Tiến độ</h3>
          <Progress steps={ordered.length || 1} completed={completedCount} />
          <ul style={{ marginTop: 12 }}>
            {ordered.map(({ key, status, date }) => (
              <li key={key} style={{ marginBottom: 6 }}>
                <b>{(stepsMap[key] ?? key.toUpperCase())}</b> — {status ?? "N/A"}{date ? ` (${date})` : ""}
              </li>
            ))}
          </ul>
          {extras.length > 0 && (
            <>
              <h4 style={{ marginTop: 8 }}>Transshipment</h4>
              <ul>
                {extras.map(({ key, status, date }) => (
                  <li key={key}>
                    <b>{key.toUpperCase()}</b> — {status ?? "N/A"}{date ? ` (${date})` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Details */}
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Details</h3>
        {s.mode === "SEA" ? (
          data.input_sea.length === 0 ? (
            <p>No containers.</p>
          ) : (
            <ul>
              {data.input_sea.map((c) => (
                <li key={c.container_number}>
                  <b>{c.container_number}</b> — {c.size_type ?? ""} {c.vessel ? ` · Vessel ${c.vessel}` : ""} {c.voyage ? ` · Voy ${c.voyage}` : ""}
                </li>
              ))}
            </ul>
          )
        ) : data.input_air.length === 0 ? (
          <p>No flight info.</p>
        ) : (
          <ul>
            {data.input_air.map((f) => (
              <li key={f.flight}>
                <b>{f.flight}</b> — {f.pieces ?? "?"} pcs · {f.weight_kg ?? "?"} kg · {f.chargeable_weight_kg ?? "?"} kg CW
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Notes */}
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Notes</h3>
        {data.notes.length === 0 ? (
          <p>Chưa có ghi chú.</p>
        ) : (
          <ul>
            {data.notes.map((n) => (
              <li key={n.id}>
                [{n.note_time?.slice(0, 19).replace("T", " ")}] step {n.step}: {n.note} {n.note_type ? `(${n.note_type})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
