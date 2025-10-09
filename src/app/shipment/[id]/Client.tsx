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

// ===== Milestone label mapping =====
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

// ===== Helper function =====
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
    if (k.endsWith("_date")) map[base].date = (v as string) || null;
  }

  // Xử lý các bước phụ (transshipment)
  for (const base of Object.keys(map)) {
    if (base.includes(".")) {
      extras.push({ key: base, ...map[base] });
      delete map[base];
    }
  }

  const ordered = Object.keys(map)
    .sort(
      (a, b) =>
        parseFloat(a.replace("step", "")) - parseFloat(b.replace("step", ""))
    )
    .map((key) => ({ key, ...map[key] }));

  extras.sort((a, b) => {
    const pa = parseFloat(a.key.replace("step", ""));
    const pb = parseFloat(b.key.replace("step", ""));
    return pa - pb;
  });

  return { ordered, extras };
}

function Field({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <b>{label}:</b> {String(value)}
    </div>
  );
}

export default function ShipmentClient({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const stepsMap = useMemo(
    () => (data?.shipment.mode === "SEA" ? SEA_STEPS : AIR_STEPS),
    [data?.shipment.mode]
  );

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
    return () => {
      alive = false;
    };
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

    return () => {
      supabaseClient.removeChannel(channel);
    };
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

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>
        Shipment {s.shipment_id} — {s.mode}
      </h1>

      <section style={{ marginTop: 12 }}>
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
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Milestones</h2>
        {ordered.length === 0 ? (
          <p>Chưa có milestones.</p>
        ) : (
          <ol>
            {ordered.map(({ key, status, date }) => (
              <li key={key} style={{ marginBottom: 6 }}>
                <b>{stepsMap[key] ?? key.toUpperCase()}</b> —{" "}
                {status ?? "N/A"}
                {date ? ` (${date})` : ""}
              </li>
            ))}
          </ol>
        )}

        {extras.length > 0 && (
          <>
            <h3 style={{ marginTop: 8 }}>Transshipment</h3>
            <ul>
              {extras.map(({ key, status, date }) => (
                <li key={key}>
                  <b>{key.toUpperCase()}</b> — {status ?? "N/A"}
                  {date ? ` (${date})` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Details</h2>
        {s.mode === "SEA" ? (
          data.input_sea.length === 0 ? (
            <p>No containers.</p>
          ) : (
            <ul>
              {data.input_sea.map((c) => (
                <li key={c.container_number}>
                  <b>{c.container_number}</b> — {c.size_type ?? ""}{" "}
                  {c.vessel ? ` · Vessel ${c.vessel}` : ""}{" "}
                  {c.voyage ? ` · Voy ${c.voyage}` : ""}
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
                <b>{f.flight}</b> — {f.pieces ?? "?"} pcs ·{" "}
                {f.weight_kg ?? "?"} kg ·{" "}
                {f.chargeable_weight_kg ?? "?"} kg CW
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Notes</h2>
        {data.notes.length === 0 ? (
          <p>Chưa có ghi chú.</p>
        ) : (
          <ul>
            {data.notes.map((n) => (
              <li key={n.id}>
                [{n.note_time?.slice(0, 19).replace("T", " ")}] step {n.step}:{" "}
                {n.note} {n.note_type ? `(${n.note_type})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
