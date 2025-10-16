// src/app/api/admin/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parse } from "csv-parse/sync";

type RowObject = Record<string, unknown>;
type ShipIdRow = { shipment_id: string | number | null };

/* =============== Config =============== */
const STRICT_SCHEMA = true;          // Header Sheet phải trùng 100% tên cột DB
const MIRROR_SHIPMENTS = true;       // Xóa shipment trong DB không còn trong Sheet

// SCHEMA CHUẨN — khớp đúng các header bạn đưa
const SCHEMA = {
  shipments: [
    "shipment_id",
    "tracking_id",
    "mode",
    "mbl_number",
    "hbl_number",
    "scope_of_service",
    "carrier",
    "etd_date",
    "atd_date",
    "eta_date",
    "ata_date",
    "place_of_receipt",
    "pol_aol",
    "transshipment_ports",
    "pod_aod",
    "place_of_delivery",
    "route",
    "remarks",
  ],
  input_sea: [
    "shipment_id",
    "container_number",
    "vessel",
    "voyage",
    "size_type",
    "weight_kg",
    "volume_cbm",
    "seal_no",
    "temperature",
    "vent",
  ],
  input_air: [
    "shipment_id",
    "flight",
    "unit_kind",
    "pieces",
    "volume_cbm",
    "weight_kg",
    "chargeable_weight_kg",
  ],
  milestones_sea: [
    "shipment_id",
    "step1_status",
    "step1_date",
    "step2_status",
    "step2_date",
    "step3_status",
    "step3_date",
    "step4_status",
    "step4_date",
    "step5_status",
    "step5_date",
    "step6_status",
    "step6_date",
    "step7_status",
    "step7_date",
    "step8_status",
    "step8_date",
    "step9_status",
    "step9_date",
    "step10_status",
    "step10_date",
    "step6.1_date",
    "step6.1_status",
    "step6.2_date",
    "step6.2_status",
    "step6.3_date",
    "step6.3_status",
  ],
  milestones_air: [
    "shipment_id",
    "step1_status",
    "step1_date",
    "step2_status",
    "step2_date",
    "step3_status",
    "step3_date",
    "step4_status",
    "step4_date",
    "step5_status",
    "step5_date",
    "step6_status",
    "step6_date",
    "step7_status",
    "step7_date",
    "step8_status",
    "step8_date",
    "step5.1_status",
    "step5.1_date",
    "step5.2_status",
    "step5.2_date",
    "step5.3_status",
    "step5.3_date",
    "step5.4_status",
    "step5.4_date",
  ],
  milestones_notes: [
    "shipment_id",
    "mode",
    "step",
    "note",
    "note_type",
    "note_time",
    "active",
  ],
} as const;

/* =============== Helpers =============== */
function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function fetchCsv(url: string): Promise<RowObject[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch CSV failed: ${url} -> ${res.status}`);
  const text = await res.text();

  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  // "" -> null
  return rows.map((r) => {
    const obj: RowObject = {};
    for (const [k, v] of Object.entries(r)) obj[k] = v === "" ? null : v;
    return obj;
  });
}

/** So sánh 2 tập key (không quan tâm thứ tự) */
function sameKeySet(a: ReadonlyArray<string>, b: ReadonlyArray<string>) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size !== B.size) return false;
  for (const k of A) if (!B.has(k)) return false;
  return true;
}

/** Loại key rỗng + chỉ cho phép cột trong schema */
function sanitizeRow(row: RowObject, allowed: Set<string>): RowObject {
  const out: RowObject = {};
  for (const [rawK, v] of Object.entries(row)) {
    const k = (rawK ?? "").trim();
    if (!k) continue;
    if (!allowed.has(k)) continue;
    out[k] = v === "" ? null : v;
  }
  return out;
}

/** Xác minh cột onConflict có trong payload đã lọc */
function ensureConflictColsExist(sampleKeys: string[], onConflict: string) {
  const cols = onConflict.split(",").map((s) => s.trim()).filter(Boolean);
  for (const c of cols) {
    if (!sampleKeys.includes(c)) {
      throw new Error(
        `Payload KHÔNG có cột onConflict='${c}'. Kiểm tra header CSV = cột DB.`
      );
    }
  }
}

async function upsertTable(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: keyof typeof SCHEMA,
  rows: ReadonlyArray<RowObject>,
  onConflict: string
) {
  if (!rows?.length) return;

  const allowed = new Set<string>(SCHEMA[table]);

  // STRICT: header CSV phải trùng 100% schema đã khai báo
  if (STRICT_SCHEMA && rows.length > 0) {
    const firstRow = rows[0] as RowObject;
    const csvKeys = Object.keys(firstRow).filter(
      (k) => String(k).trim().length > 0
    );
    const schemaKeys = Array.from(SCHEMA[table] as ReadonlyArray<string>);
    if (!sameKeySet(csvKeys, schemaKeys)) {
      const missing = schemaKeys.filter((k) => !csvKeys.includes(k));
      const extra = csvKeys.filter((k) => !schemaKeys.includes(k));
      throw new Error(
        `[STRICT] Header ${table} không khớp schema DB.\n` +
          `Thiếu: ${missing.length ? missing.join(", ") : "(none)"}\n` +
          `Thừa: ${extra.length ? extra.join(", ") : "(none)"}`
      );
    }
  }

  const cleaned = rows.map((r) => sanitizeRow(r, allowed));
  const sampleKeys = Object.keys(cleaned[0] ?? {});
  const hadEmptyKey = Object.keys(rows[0] ?? {}).some((k) => !String(k).trim());
  console.log(
    `[import] table=${table} onConflict=${onConflict} sampleKeys=`,
    sampleKeys,
    `hadEmptyKey?`,
    hadEmptyKey
  );

  ensureConflictColsExist(sampleKeys, onConflict);

  const BATCH = 1000;
  for (let i = 0; i < cleaned.length; i += BATCH) {
    const chunk = cleaned.slice(i, i + BATCH);
    const { error } = await supabase
      .from(table)
      .upsert(chunk as object[], {
        onConflict,
        defaultToNull: true,
        ignoreDuplicates: false,
      });
    if (error) {
      throw new Error(
        `${table} upsert failed (onConflict=${onConflict}): ${error.message}`
      );
    }
  }
}

/** Mirror: xóa shipment trong DB không còn trong Sheet */
async function mirrorDeleteShipments(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sheetRows: ReadonlyArray<RowObject>
) {
  const ids = Array.from(
    new Set(
      sheetRows
        .map((r) => String((r as RowObject)["shipment_id"] ?? ""))
        .filter(Boolean)
    )
  );

  const { data, error } = await supabase
    .from("shipments")
    .select("shipment_id");
  if (error) throw new Error(`select shipments for mirror failed: ${error.message}`);

  const rows = (data ?? []) as ReadonlyArray<ShipIdRow>;
  const inDb = new Set(
    rows
      .map((d) => d?.shipment_id)
      .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
      .map((v) => String(v))
  );

  const toDelete = Array.from(inDb).filter((id) => !ids.includes(id));

  if (toDelete.length) {
    const { error: delErr } = await supabase
      .from("shipments")
      .delete()
      .in("shipment_id", toDelete);
    if (delErr) throw new Error(`mirror delete failed: ${delErr.message}`);
  }
}

/* =============== Route config =============== */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =============== Handler =============== */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  // ===== DEBUG: so sánh token header vs env để gỡ lỗi 401
  if (url.searchParams.get("_debug") === "1") {
    const hdr = req.headers.get("x-admin-token");
    const env = process.env["ADMIN_TOKEN"] ?? null;
    const toHex = (s: string | null) =>
      s ? Buffer.from(s, "utf8").toString("hex") : null;

    return NextResponse.json({
      header_raw: hdr,
      header_len: hdr?.length ?? 0,
      header_hex: toHex(hdr),
      env_raw: env,
      env_len: env?.length ?? 0,
      env_hex: toHex(env),
      equal: hdr === env,
    });
  }
  // ===== END DEBUG =====

  // Auth đơn giản bằng header
  const token = req.headers.get("x-admin-token");
  if (!token || token !== process.env["ADMIN_TOKEN"]) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const dryrun = url.searchParams.get("dryrun") === "1";

    const [shipments, inputSea, inputAir, msSea, msAir, msNotes] =
      await Promise.all([
        fetchCsv(reqEnv("GSH_SHIPMENTS_CSV")),
        fetchCsv(reqEnv("GSH_INPUT_SEA_CSV")),
        fetchCsv(reqEnv("GSH_INPUT_AIR_CSV")),
        fetchCsv(reqEnv("GSH_MILESTONES_SEA_CSV")),
        fetchCsv(reqEnv("GSH_MILESTONES_AIR_CSV")),
        fetchCsv(reqEnv("GSH_MILESTONES_NOTES_CSV")),
      ]);

    if (!dryrun) {
      await upsertTable(supabase, "shipments", shipments, "shipment_id");
      await upsertTable(
        supabase,
        "input_sea",
        inputSea,
        "shipment_id,container_number"
      );
      await upsertTable(
        supabase,
        "input_air",
        inputAir,
        "shipment_id,flight"
      );
      await upsertTable(supabase, "milestones_sea", msSea, "shipment_id");
      await upsertTable(supabase, "milestones_air", msAir, "shipment_id");

      // notes: delete theo shipment_id rồi insert lại
      if (msNotes.length > 0) {
        const ids = Array.from(
          new Set(
            msNotes
              .map((r) => String((r as RowObject)["shipment_id"] ?? ""))
              .filter(Boolean)
          )
        );
        if (ids.length > 0) {
          const { error: delErr } = await supabase
            .from("milestones_notes")
            .delete()
            .in("shipment_id", ids);
          if (delErr) throw new Error(`milestones_notes delete failed: ${delErr.message}`);
        }
        const BATCH = 1000;
        for (let i = 0; i < msNotes.length; i += BATCH) {
          const chunk = msNotes
            .slice(i, i + BATCH)
            .map((r) => sanitizeRow(r, new Set(SCHEMA.milestones_notes)));
          const { error } = await supabase
            .from("milestones_notes")
            .insert(chunk as object[]);
          if (error) throw new Error(`milestones_notes insert failed: ${error.message}`);
        }
      }

      if (MIRROR_SHIPMENTS) {
        await mirrorDeleteShipments(supabase, shipments);
      }
    }

    return NextResponse.json({
      ok: true as const,
      dryrun,
      strict: STRICT_SCHEMA,
      mirror_shipments: MIRROR_SHIPMENTS,
      summary: {
        shipments: shipments.length,
        input_sea: inputSea.length,
        input_air: inputAir.length,
        milestones_sea: msSea.length,
        milestones_air: msAir.length,
        milestones_notes: msNotes.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 });
  }
}
