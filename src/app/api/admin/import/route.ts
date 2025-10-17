// // src/app/api/admin/import/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
// import { parse } from "csv-parse/sync";

// type RowObject = Record<string, unknown>;
// type ShipIdRow = { shipment_id: string | number | null };

// /* =============== Config =============== */
// const STRICT_SCHEMA = true;          // Header Sheet phải trùng 100% tên cột DB
// const MIRROR_SHIPMENTS = true;       // Xóa shipment trong DB không còn trong Sheet

// // SCHEMA CHUẨN — khớp đúng các header bạn đưa (sheet có thể dùng dấu chấm)
// const SCHEMA = {
//   shipments: [
//     "shipment_id",
//     "tracking_id",
//     "mode",
//     "mbl_number",
//     "hbl_number",
//     "scope_of_service",
//     "carrier",
//     "etd_date",
//     "atd_date",
//     "eta_date",
//     "ata_date",
//     "place_of_receipt",
//     "pol_aol",
//     "transshipment_ports",
//     "pod_aod",
//     "place_of_delivery",
//     "route",
//     "remarks",
//   ],
//   input_sea: [
//     "shipment_id",
//     "container_number",
//     "vessel",
//     "voyage",
//     "size_type",
//     "weight_kg",
//     "volume_cbm",
//     "seal_no",
//     "temperature",
//     "vent",
//   ],
//   input_air: [
//     "shipment_id",
//     "flight",
//     "unit_kind",
//     "pieces",
//     "volume_cbm",
//     "weight_kg",
//     "chargeable_weight_kg",
//   ],
//   milestones_sea: [
//     "shipment_id",
//     "step1_status",
//     "step1_date",
//     "step2_status",
//     "step2_date",
//     "step3_status",
//     "step3_date",
//     "step4_status",
//     "step4_date",
//     "step5_status",
//     "step5_date",
//     "step6_status",
//     "step6_date",
//     "step7_status",
//     "step7_date",
//     "step8_status",
//     "step8_date",
//     "step9_status",
//     "step9_date",
//     "step10_status",
//     "step10_date",
//     "step6.1_date",
//     "step6.1_status",
//     "step6.2_date",
//     "step6.2_status",
//     "step6.3_date",
//     "step6.3_status",
//   ],
//   milestones_air: [
//     "shipment_id",
//     "step1_status",
//     "step1_date",
//     "step2_status",
//     "step2_date",
//     "step3_status",
//     "step3_date",
//     "step4_status",
//     "step4_date",
//     "step5_status",
//     "step5_date",
//     "step6_status",
//     "step6_date",
//     "step7_status",
//     "step7_date",
//     "step8_status",
//     "step8_date",
//     "step5.1_status",
//     "step5.1_date",
//     "step5.2_status",
//     "step5.2_date",
//     "step5.3_status",
//     "step5.3_date",
//     "step5.4_status",
//     "step5.4_date",
//   ],
//   milestones_notes: [
//     "shipment_id",
//     "mode",
//     "step",
//     "note",
//     "note_type",
//     "note_time",
//     "active",
//   ],
// } as const;

// /* =============== Helpers =============== */
// function reqEnv(name: string): string {
//   const v = process.env[name];
//   if (!v) throw new Error(`Missing env: ${name}`);
//   return v;
// }

// async function fetchCsv(url: string): Promise<RowObject[]> {
//   const res = await fetch(url, { cache: "no-store" });
//   if (!res.ok) throw new Error(`Fetch CSV failed: ${url} -> ${res.status}`);
//   const text = await res.text();

//   const rows = parse(text, {
//     columns: true,
//     skip_empty_lines: true,
//     trim: true,
//   }) as Record<string, string>[];

//   // "" -> null
//   return rows.map((r) => {
//     const obj: RowObject = {};
//     for (const [k, v] of Object.entries(r)) obj[k] = v === "" ? null : v;
//     return obj;
//   });
// }

// /** So sánh 2 tập key (không quan tâm thứ tự) */
// function sameKeySet(a: ReadonlyArray<string>, b: ReadonlyArray<string>) {
//   const A = new Set(a);
//   const B = new Set(b);
//   if (A.size !== B.size) return false;
//   for (const k of A) if (!B.has(k)) return false;
//   return true;
// }

// /* ==== Mapping dấu '.' -> '_' cho các bảng milestones (DB dùng cột có '_') ==== */
// const DOT_TO_UNDERSCORE_TABLES = new Set<keyof typeof SCHEMA>([
//   "milestones_sea",
//   "milestones_air",
// ]);

// function isMilestonesTable(table: keyof typeof SCHEMA) {
//   return DOT_TO_UNDERSCORE_TABLES.has(table);
// }
// function normCol(table: keyof typeof SCHEMA, col: string): string {
//   return isMilestonesTable(table) ? col.replaceAll(".", "_") : col;
// }
// function normalizeRowKeys(
//   table: keyof typeof SCHEMA,
//   row: RowObject
// ): RowObject {
//   const out: RowObject = {};
//   for (const [k, v] of Object.entries(row)) {
//     const key = normCol(table, (k ?? "").trim());
//     if (!key) continue;
//     out[key] = v === "" ? null : v;
//   }
//   return out;
// }

// /** Chỉ cho phép cột trong schema (đã map dấu) */
// function sanitizeRowForTable(
//   table: keyof typeof SCHEMA,
//   row: RowObject,
//   allowed: Set<string>
// ): RowObject {
//   const out: RowObject = {};
//   for (const [rawK, v] of Object.entries(row)) {
//     const k0 = (rawK ?? "").trim();
//     if (!k0) continue;
//     const k = normCol(table, k0);
//     if (!allowed.has(k)) continue;
//     out[k] = v === "" ? null : v;
//   }
//   return out;
// }

// /** Các khoá bắt buộc theo từng bảng (để loại dòng thiếu khóa) */
// const REQUIRED_KEYS: Record<keyof typeof SCHEMA, string[]> = {
//   shipments: ["shipment_id"],
//   input_sea: ["shipment_id", "container_number"],
//   input_air: ["shipment_id", "flight"],
//   milestones_sea: ["shipment_id"],
//   milestones_air: ["shipment_id"],
//   milestones_notes: ["shipment_id"],
// } as const;

// /** Lọc bỏ dòng thiếu khóa bắt buộc (null/""/undefined) */
// function filterRequired(
//   table: keyof typeof SCHEMA,
//   rows: RowObject[]
// ): RowObject[] {
//   const required = REQUIRED_KEYS[table] ?? [];
//   const keep: RowObject[] = [];
//   let dropped = 0;

//   for (const r of rows) {
//     let ok = true;
//     for (const key of required) {
//       const v = r[key];
//       if (
//         v === null ||
//         v === undefined ||
//         (typeof v === "string" && v.trim().length === 0)
//       ) {
//         ok = false;
//         break;
//       }
//     }
//     if (ok) keep.push(r);
//     else dropped++;
//   }
//   if (dropped > 0) {
//     console.warn(`[import] table=${table} dropped ${dropped} row(s) missing required keys: ${required.join(", ")}`);
//   }
//   return keep;
// }

// /** Xác minh cột onConflict có trong payload đã lọc */
// function ensureConflictColsExist(sampleKeys: string[], onConflict: string) {
//   const cols = onConflict.split(",").map((s) => s.trim()).filter(Boolean);
//   for (const c of cols) {
//     if (!sampleKeys.includes(c)) {
//       throw new Error(
//         `Payload KHÔNG có cột onConflict='${c}'. Kiểm tra header CSV = cột DB.`
//       );
//     }
//   }
// }

// async function upsertTable(
//   supabase: ReturnType<typeof getSupabaseAdmin>,
//   table: keyof typeof SCHEMA,
//   rows: ReadonlyArray<RowObject>,
//   onConflict: string
// ) {
//   if (!rows?.length) return;

//   // Allowed set theo DB (đã map '.' -> '_' nếu là milestones)
//   const allowed = new Set<string>(
//     (SCHEMA[table] as ReadonlyArray<string>).map((c) => normCol(table, c))
//   );

//   // STRICT: header CSV phải trùng 100% schema đã khai báo (sau khi normalize)
//   if (STRICT_SCHEMA && rows.length > 0) {
//     const firstRow = rows[0] as RowObject;
//     const csvKeys = Object.keys(firstRow)
//       .filter((k) => String(k).trim().length > 0)
//       .map((k) => normCol(table, k));
//     const schemaKeys = (SCHEMA[table] as ReadonlyArray<string>).map((c) =>
//       normCol(table, c)
//     );
//     if (!sameKeySet(csvKeys, schemaKeys)) {
//       const missing = schemaKeys.filter((k) => !csvKeys.includes(k));
//       const extra = csvKeys.filter((k) => !schemaKeys.includes(k));
//       throw new Error(
//         `[STRICT] Header ${table} không khớp schema DB.\n` +
//           `Thiếu: ${missing.length ? missing.join(", ") : "(none)"}\n` +
//           `Thừa: ${extra.length ? extra.join(", ") : "(none)"}`
//       );
//     }
//   }

//   const normalizedRows = rows.map((r) => normalizeRowKeys(table, r));
//   const cleaned = normalizedRows.map((r) => sanitizeRowForTable(table, r, allowed));

//   // 🔐 Bỏ dòng thiếu khóa bắt buộc (ví dụ shipment_id null)
//   const requiredFiltered = filterRequired(table, cleaned);

//   // Nếu sau khi lọc còn 0 thì thôi
//   if (!requiredFiltered.length) return;

//   const sampleKeys = Object.keys(requiredFiltered[0] ?? {});
//   const hadEmptyKey = Object.keys(rows[0] ?? {}).some((k) => !String(k).trim());
//   console.log(
//     `[import] table=${table} onConflict=${onConflict} rows=${requiredFiltered.length} sampleKeys=`,
//     sampleKeys,
//     `hadEmptyKey?`,
//     hadEmptyKey
//   );

//   ensureConflictColsExist(sampleKeys, onConflict);

//   const BATCH = 1000;
//   for (let i = 0; i < requiredFiltered.length; i += BATCH) {
//     const chunk = requiredFiltered.slice(i, i + BATCH);
//     const { error } = await supabase
//       .from(table)
//       .upsert(chunk as object[], {
//         onConflict,
//         defaultToNull: true,
//         ignoreDuplicates: false,
//       });
//     if (error) {
//       throw new Error(
//         `${table} upsert failed (onConflict=${onConflict}): ${error.message}`
//       );
//     }
//   }
// }

// /** Mirror: xóa shipment trong DB không còn trong Sheet */
// async function mirrorDeleteShipments(
//   supabase: ReturnType<typeof getSupabaseAdmin>,
//   sheetRows: ReadonlyArray<RowObject>
// ) {
//   const ids = Array.from(
//     new Set(
//       sheetRows
//         .map((r) => String((r as RowObject)["shipment_id"] ?? ""))
//         .filter(Boolean)
//     )
//   );

//   const { data, error } = await supabase
//     .from("shipments")
//     .select("shipment_id");
//   if (error) throw new Error(`select shipments for mirror failed: ${error.message}`);

//   const rows = (data ?? []) as ReadonlyArray<ShipIdRow>;
//   const inDb = new Set(
//     rows
//       .map((d) => d?.shipment_id)
//       .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
//       .map((v) => String(v))
//   );

//   const toDelete = Array.from(inDb).filter((id) => !ids.includes(id));

//   if (toDelete.length) {
//     const { error: delErr } = await supabase
//       .from("shipments")
//       .delete()
//       .in("shipment_id", toDelete);
//     if (delErr) throw new Error(`mirror delete failed: ${delErr.message}`);
//   }
// }

// /* =============== Route config =============== */
// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// /* =============== Handler =============== */
// export async function POST(req: NextRequest) {
//   const url = new URL(req.url);

//   // ===== DEBUG: so sánh token header vs env để gỡ lỗi 401
//   if (url.searchParams.get("_debug") === "1") {
//     const hdr = req.headers.get("x-admin-token");
//     const env = process.env["ADMIN_TOKEN"] ?? null;
//     const toHex = (s: string | null) =>
//       s ? Buffer.from(s, "utf8").toString("hex") : null;

//     return NextResponse.json({
//       header_raw: hdr,
//       header_len: hdr?.length ?? 0,
//       header_hex: toHex(hdr),
//       env_raw: env,
//       env_len: env?.length ?? 0,
//       env_hex: toHex(env),
//       equal: hdr === env,
//     });
//   }
//   // ===== END DEBUG =====

//   // Auth đơn giản bằng header
//   const token = req.headers.get("x-admin-token");
//   if (!token || token !== process.env["ADMIN_TOKEN"]) {
//     return NextResponse.json(
//       { ok: false, error: "Unauthorized" },
//       { status: 401 }
//     );
//   }

//   try {
//     const supabase = getSupabaseAdmin();
//     const dryrun = url.searchParams.get("dryrun") === "1";

//     const [shipments, inputSea, inputAir, msSea, msAir, msNotes] =
//       await Promise.all([
//         fetchCsv(reqEnv("GSH_SHIPMENTS_CSV")),
//         fetchCsv(reqEnv("GSH_INPUT_SEA_CSV")),
//         fetchCsv(reqEnv("GSH_INPUT_AIR_CSV")),
//         fetchCsv(reqEnv("GSH_MILESTONES_SEA_CSV")),
//         fetchCsv(reqEnv("GSH_MILESTONES_AIR_CSV")),
//         fetchCsv(reqEnv("GSH_MILESTONES_NOTES_CSV")),
//       ]);

//     if (!dryrun) {
//       await upsertTable(supabase, "shipments", shipments, "shipment_id");
//       await upsertTable(
//         supabase,
//         "input_sea",
//         inputSea,
//         "shipment_id,container_number"
//       );
//       await upsertTable(
//         supabase,
//         "input_air",
//         inputAir,
//         "shipment_id,flight"
//       );
//       await upsertTable(supabase, "milestones_sea", msSea, "shipment_id");
//       await upsertTable(supabase, "milestones_air", msAir, "shipment_id");

//       // notes: delete theo shipment_id rồi insert lại
//       if (msNotes.length > 0) {
//         const ids = Array.from(
//           new Set(
//             msNotes
//               .map((r) => String((r as RowObject)["shipment_id"] ?? ""))
//               .filter(Boolean)
//           )
//         );
//         if (ids.length > 0) {
//           const { error: delErr } = await supabase
//             .from("milestones_notes")
//             .delete()
//             .in("shipment_id", ids);
//           if (delErr) throw new Error(`milestones_notes delete failed: ${delErr.message}`);
//         }
//         const BATCH = 1000;
//         for (let i = 0; i < msNotes.length; i += BATCH) {
//           const chunk = msNotes
//             .slice(i, i + BATCH)
//             .map((r) =>
//               sanitizeRowForTable("milestones_notes", r, new Set(SCHEMA.milestones_notes))
//             );
//           const { error } = await supabase
//             .from("milestones_notes")
//             .insert(chunk as object[]);
//           if (error) throw new Error(`milestones_notes insert failed: ${error.message}`);
//         }
//       }

//       if (MIRROR_SHIPMENTS) {
//         await mirrorDeleteShipments(supabase, shipments);
//       }
//     }

//     return NextResponse.json({
//       ok: true as const,
//       dryrun,
//       strict: STRICT_SCHEMA,
//       mirror_shipments: MIRROR_SHIPMENTS,
//       summary: {
//         shipments: shipments.length,
//         input_sea: inputSea.length,
//         input_air: inputAir.length,
//         milestones_sea: msSea.length,
//         milestones_air: msAir.length,
//         milestones_notes: msNotes.length,
//       },
//     });
//   } catch (e) {
//     const msg = e instanceof Error ? e.message : String(e);
//     return NextResponse.json({ ok: false as const, error: msg }, { status: 500 });
//   }
// }


// src/app/api/admin/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type RowObject = Record<string, unknown>;
type ShipIdRow = { shipment_id: string | number | null };
type Logger = (msg: string) => void | Promise<void>;

/* =============== Config =============== */
const STRICT_SCHEMA_DEFAULT = true;
// Nếu bạn muốn mặc định chạy song song luôn:
const PARALLEL_DEFAULT = true;
const MIRROR_SHIPMENTS = true;

/* ======= Schema ======= */
const SCHEMA = {
  shipments: [
    "shipment_id","tracking_id","mode","mbl_number","hbl_number","scope_of_service","carrier",
    "etd_date","atd_date","eta_date","ata_date","place_of_receipt","pol_aol","transshipment_ports",
    "pod_aod","place_of_delivery","route","remarks",
  ],
  input_sea: ["shipment_id","container_number","vessel","voyage","size_type","weight_kg","volume_cbm","seal_no","temperature","vent"],
  input_air: ["shipment_id","flight","unit_kind","pieces","volume_cbm","weight_kg","chargeable_weight_kg"],
  milestones_sea: [
    "shipment_id",
    "step1_status","step1_date","step2_status","step2_date","step3_status","step3_date","step4_status","step4_date",
    "step5_status","step5_date","step6_status","step6_date","step7_status","step7_date","step8_status","step8_date",
    "step9_status","step9_date","step10_status","step10_date",
    "step6.1_date","step6.1_status","step6.2_date","step6.2_status","step6.3_date","step6.3_status",
  ],
  milestones_air: [
    "shipment_id",
    "step1_status","step1_date","step2_status","step2_date","step3_status","step3_date","step4_status","step4_date",
    "step5_status","step5_date","step6_status","step6_date","step7_status","step7_date","step8_status","step8_date",
    "step5.1_status","step5.1_date","step5.2_status","step5.2_date","step5.3_status","step5.3_date","step5.4_status","step5.4_date",
  ],
  milestones_notes: ["shipment_id","mode","step","note","note_type","note_time","active"],
} as const;

/* =============== Helpers chung =============== */
function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
function sameKeySet(a: ReadonlyArray<string>, b: ReadonlyArray<string>) {
  const A = new Set(a), B = new Set(b);
  if (A.size !== B.size) return false;
  for (const k of A) if (!B.has(k)) return false;
  return true;
}
const DOT_TO_UNDERSCORE_TABLES = new Set<keyof typeof SCHEMA>(["milestones_sea", "milestones_air"]);
const REQUIRED_KEYS: Record<keyof typeof SCHEMA, string[]> = {
  shipments: ["shipment_id"],
  input_sea: ["shipment_id", "container_number"],
  input_air: ["shipment_id", "flight"],
  milestones_sea: ["shipment_id"],
  milestones_air: ["shipment_id"],
  milestones_notes: ["shipment_id"],
} as const;
function isMilestonesTable(table: keyof typeof SCHEMA) { return DOT_TO_UNDERSCORE_TABLES.has(table); }
function normCol(table: keyof typeof SCHEMA, col: string) { return isMilestonesTable(table) ? col.replaceAll(".", "_") : col; }
function normalizeRowKeys(table: keyof typeof SCHEMA, row: RowObject): RowObject {
  const out: RowObject = {};
  for (const [k, v] of Object.entries(row)) {
    const key = normCol(table, (k ?? "").trim());
    if (!key) continue;
    out[key] = v === "" ? null : v;
  }
  return out;
}
function sanitizeRowForTable(table: keyof typeof SCHEMA, row: RowObject, allowed: Set<string>): RowObject {
  const out: RowObject = {};
  for (const [rawK, v] of Object.entries(row)) {
    const k0 = (rawK ?? "").trim();
    if (!k0) continue;
    const k = normCol(table, k0);
    if (!allowed.has(k)) continue;
    out[k] = v === "" ? null : v;
  }
  return out;
}
function filterRequired(table: keyof typeof SCHEMA, rows: RowObject[]): RowObject[] {
  const required = REQUIRED_KEYS[table] ?? [];
  const keep: RowObject[] = [];
  for (const r of rows) {
    let ok = true;
    for (const key of required) {
      const v = r[key];
      if (v === null || v === undefined || (typeof v === "string" && v.trim().length === 0)) { ok = false; break; }
    }
    if (ok) keep.push(r);
  }
  return keep;
}
function ensureConflictColsExist(sampleKeys: string[], onConflict: string) {
  const cols = onConflict.split(",").map((s) => s.trim()).filter(Boolean);
  for (const c of cols) if (!sampleKeys.includes(c)) {
    throw new Error(`Payload KHÔNG có cột onConflict='${c}'. Kiểm tra header CSV = cột DB.`);
  }
}

/* =============== Google Sheets URL helpers =============== */
/** Trả về candidate URL ưu tiên /export?format=csv nếu có thể, kèm fallback là url gốc */
function buildCsvUrlCandidates(inputUrl: string): string[] {
  const u = new URL(inputUrl);
  const candidates: string[] = [];

  // 1) Link dạng xem: /spreadsheets/d/{FILE_ID}/edit#gid=...
  const editFileIdMatch = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const hashGid = (u.hash.match(/gid=(\d+)/)?.[1]) || u.searchParams.get("gid") || "";

  if (editFileIdMatch && hashGid) {
    const fileId = editFileIdMatch[1];
    candidates.push(`https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=${hashGid}`);
  }

  // 2) Link đã là /export?format=csv
  if (u.pathname.includes("/export")) {
    candidates.unshift(inputUrl); // ưu tiên chính nó
  }

  // 3) Thêm url gốc làm fallback (có thể là /pub?output=csv)
  if (!candidates.includes(inputUrl)) candidates.push(inputUrl);
  return candidates;
}

async function fetchCsvSmart(url: string): Promise<RowObject[]> {
  const urls = buildCsvUrlCandidates(url);
  let lastErr: Error | null = null;

  for (const tryUrl of urls) {
    try {
      const res = await fetch(tryUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch CSV failed: ${tryUrl} -> ${res.status}`);
      const text = await res.text();
      const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
      return rows.map((r) => {
        const obj: RowObject = {};
        for (const [k, v] of Object.entries(r)) obj[k] = v === "" ? null : v;
        return obj;
      });
    } catch (e) {
      lastErr = e as Error;
      // thử candidate tiếp theo
    }
  }
  throw lastErr ?? new Error("Fetch CSV failed");
}

/* =============== DB ops =============== */
async function upsertTable(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: keyof typeof SCHEMA,
  rows: ReadonlyArray<RowObject>,
  onConflict: string,
  log?: Logger,
  batchSize?: number,
  strict?: boolean
) {
  if (!rows?.length) { await log?.(`- ${table}: bỏ qua (0 dòng)`); return; }

  const allowed = new Set<string>((SCHEMA[table] as ReadonlyArray<string>).map((c) => normCol(table, c)));

  // STRICT: header CSV phải khớp schema (sau normalize)
  if (strict) {
    const csvKeys = Object.keys(rows[0] as RowObject).filter((k) => String(k).trim().length > 0).map((k) => normCol(table, k));
    const schemaKeys = (SCHEMA[table] as ReadonlyArray<string>).map((c) => normCol(table, c));
    if (!sameKeySet(csvKeys, schemaKeys)) {
      const missing = schemaKeys.filter((k) => !csvKeys.includes(k));
      const extra = csvKeys.filter((k) => !schemaKeys.includes(k));
      throw new Error(`[STRICT] Header ${table} không khớp schema DB.\nThiếu: ${missing.join(", ") || "(none)"}\nThừa: ${extra.join(", ") || "(none)"}`);
    }
  }

  const normalizedRows = rows.map((r) => normalizeRowKeys(table, r));
  const cleaned = filterRequired(table, normalizedRows.map((r) => sanitizeRowForTable(table, r, allowed)));
  if (!cleaned.length) { await log?.(`- ${table}: bỏ qua (tất cả dòng thiếu khóa)`); return; }

  const sampleKeys = Object.keys(cleaned[0] ?? {});
  ensureConflictColsExist(sampleKeys, onConflict);

  const BATCH = Math.max(1, Number.isFinite(batchSize ?? 0) ? Number(batchSize) : 1000);
  await log?.(`- ${table}: upsert ${cleaned.length} dòng (batch=${BATCH})`);

  for (let i = 0; i < cleaned.length; i += BATCH) {
    const chunk = cleaned.slice(i, i + BATCH);
    const { error } = await supabase.from(table).upsert(chunk as object[], {
      onConflict, defaultToNull: true, ignoreDuplicates: false,
    });
    if (error) throw new Error(`${table} upsert failed (onConflict=${onConflict}): ${error.message}`);
    await log?.(`  • ${table}: ${Math.min(i + BATCH, cleaned.length)}/${cleaned.length}`);
  }
}

async function replaceNotes(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  msNotes: ReadonlyArray<RowObject>,
  log?: Logger,
  batchSize?: number
) {
  if (!msNotes.length) { await log?.("- milestones_notes: bỏ qua (0 dòng)"); return; }

  await log?.("- milestones_notes: replace theo shipment_id…");
  const ids = Array.from(new Set(msNotes.map((r) => String((r as RowObject)["shipment_id"] ?? "")).filter(Boolean)));
  if (ids.length > 0) {
    const { error: delErr } = await supabase.from("milestones_notes").delete().in("shipment_id", ids);
    if (delErr) throw new Error(`milestones_notes delete failed: ${delErr.message}`);
  }
  const BATCH = Math.max(1, Number.isFinite(batchSize ?? 0) ? Number(batchSize) : 1000);
  for (let i = 0; i < msNotes.length; i += BATCH) {
    const chunk = msNotes
      .slice(i, i + BATCH)
      .map((r) => sanitizeRowForTable("milestones_notes", r, new Set(SCHEMA.milestones_notes)));
    const { error } = await supabase.from("milestones_notes").insert(chunk as object[]);
    if (error) throw new Error(`milestones_notes insert failed: ${error.message}`);
    await log?.(`  • milestones_notes: ${Math.min(i + BATCH, msNotes.length)}/${msNotes.length}`);
  }
}

async function mirrorDeleteShipments(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sheetRows: ReadonlyArray<RowObject>,
  log?: Logger
) {
  const ids = Array.from(new Set(sheetRows.map((r) => String((r as RowObject)["shipment_id"] ?? "")).filter(Boolean)));
  const { data, error } = await supabase.from("shipments").select("shipment_id");
  if (error) throw new Error(`select shipments for mirror failed: ${error.message}`);

  const rows = (data ?? []) as ReadonlyArray<ShipIdRow>;
  const inDb = new Set(rows
    .map((d) => d?.shipment_id)
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map((v) => String(v)));
  const toDelete = Array.from(inDb).filter((id) => !ids.includes(id));

  if (toDelete.length) {
    await log?.(`- mirror: xóa ${toDelete.length} shipment không còn trên Sheet`);
    const { error: delErr } = await supabase.from("shipments").delete().in("shipment_id", toDelete);
    if (delErr) throw new Error(`mirror delete failed: ${delErr.message}`);
  } else {
    await log?.(`- mirror: không có gì để xóa`);
  }
}

/* =============== Route config =============== */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =============== Handler =============== */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  // Auth
  const token = req.headers.get("x-admin-token");
  if (!token || token !== process.env["ADMIN_TOKEN"]) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Params
  const stream = url.searchParams.get("stream") === "1";
  const dryrun = url.searchParams.get("dryrun") === "1";
  const batch = Number(url.searchParams.get("batch") ?? "") || 1000;
  const strict = url.searchParams.get("strict") === null
    ? STRICT_SCHEMA_DEFAULT
    : url.searchParams.get("strict") === "1";
  const parallel = url.searchParams.get("parallel") === null
    ? PARALLEL_DEFAULT
    : url.searchParams.get("parallel") === "1";

  // Loader CSV từ env (hỗ trợ export/edit/pub)
  async function loadAllCsv() {
    const [shipments, inputSea, inputAir, msSea, msAir, msNotes] = await Promise.all([
      fetchCsvSmart(reqEnv("GSH_SHIPMENTS_CSV")),
      fetchCsvSmart(reqEnv("GSH_INPUT_SEA_CSV")),
      fetchCsvSmart(reqEnv("GSH_INPUT_AIR_CSV")),
      fetchCsvSmart(reqEnv("GSH_MILESTONES_SEA_CSV")),
      fetchCsvSmart(reqEnv("GSH_MILESTONES_AIR_CSV")),
      fetchCsvSmart(reqEnv("GSH_MILESTONES_NOTES_CSV")),
    ]);
    return { shipments, inputSea, inputAir, msSea, msAir, msNotes };
  }

  if (stream) {
    // --- Streaming logs ---
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const log: Logger = async (msg) => { await writer.write(encoder.encode(msg + "\n")); };

    (async () => {
      try {
        await log(`START (strict=${strict}, batch=${batch}, parallel=${parallel}, mirror=${MIRROR_SHIPMENTS}, dryrun=${dryrun})`);
        const supabase = getSupabaseAdmin();

        await log("Đang tải CSV từ Google Sheets…");
        const { shipments, inputSea, inputAir, msSea, msAir, msNotes } = await loadAllCsv();
        await log(
          `Tải xong: shipments=${shipments.length}, input_sea=${inputSea.length}, input_air=${inputAir.length}, milestones_sea=${msSea.length}, milestones_air=${msAir.length}, notes=${msNotes.length}`
        );

        if (!dryrun) {
          // 1) lên shipments trước
          await upsertTable(supabase, "shipments", shipments, "shipment_id", log, batch, strict);

          // 2) phần còn lại: song song / tuần tự
          const tasks = [
            () => upsertTable(supabase, "input_sea", inputSea, "shipment_id,container_number", log, batch, strict),
            () => upsertTable(supabase, "input_air", inputAir, "shipment_id,flight", log, batch, strict),
            () => upsertTable(supabase, "milestones_sea", msSea, "shipment_id", log, batch, strict),
            () => upsertTable(supabase, "milestones_air", msAir, "shipment_id", log, batch, strict),
            () => replaceNotes(supabase, msNotes, log, batch),
          ];

          if (parallel) {
            await Promise.all(tasks.map((fn) => fn()));
          } else {
            for (const t of tasks) await t();
          }

          if (MIRROR_SHIPMENTS) {
            await mirrorDeleteShipments(supabase, shipments, log);
          }
        }

        const payload = {
          ok: true as const,
          dryrun, strict, parallel, mirror_shipments: MIRROR_SHIPMENTS,
          summary: {
            shipments: shipments.length,
            input_sea: inputSea.length,
            input_air: inputAir.length,
            milestones_sea: msSea.length,
            milestones_air: msAir.length,
            milestones_notes: msNotes.length,
          },
        };
        await log("RESULT " + JSON.stringify(payload));
      } catch (e) {
        await log("ERROR " + (e instanceof Error ? e.message : String(e)));
      } finally {
        writer.close();
      }
    })();

    return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // --- JSON path (không stream) ---
  try {
    const supabase = getSupabaseAdmin();
    const { shipments, inputSea, inputAir, msSea, msAir, msNotes } = await loadAllCsv();

    if (!dryrun) {
      await upsertTable(supabase, "shipments", shipments, "shipment_id", undefined, batch, strict);

      const tasks = [
        () => upsertTable(supabase, "input_sea", inputSea, "shipment_id,container_number", undefined, batch, strict),
        () => upsertTable(supabase, "input_air", inputAir, "shipment_id,flight", undefined, batch, strict),
        () => upsertTable(supabase, "milestones_sea", msSea, "shipment_id", undefined, batch, strict),
        () => upsertTable(supabase, "milestones_air", msAir, "shipment_id", undefined, batch, strict),
        () => replaceNotes(supabase, msNotes, undefined, batch),
      ];
      if (parallel) await Promise.all(tasks.map((fn) => fn()));
      else for (const t of tasks) await t();

      if (MIRROR_SHIPMENTS) await mirrorDeleteShipments(supabase, shipments);
    }

    return NextResponse.json({
      ok: true as const,
      dryrun, strict, parallel, mirror_shipments: MIRROR_SHIPMENTS,
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
