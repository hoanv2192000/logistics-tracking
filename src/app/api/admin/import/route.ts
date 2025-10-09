import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parse } from "csv-parse/sync";

type RowObject = Record<string, unknown>;

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

  // chuyển "" -> null (giữ type an toàn bằng unknown/object)
  return rows.map((r) => {
    const obj: RowObject = {};
    for (const [k, v] of Object.entries(r)) obj[k] = v === "" ? null : v;
    return obj;
  });
}

async function upsertTable(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  rows: ReadonlyArray<RowObject>,
  onConflict: string
) {
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    // ép kiểu về object[] để thỏa kiểu của supabase-js, tránh dùng any
    const { error } = await supabase.from(table).upsert(chunk as object[], { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const [
    shipments,
    inputSea,
    inputAir,
    msSea,
    msAir,
    msNotes,
  ] = await Promise.all([
    fetchCsv(reqEnv("GSH_SHIPMENTS_CSV")),
    fetchCsv(reqEnv("GSH_INPUT_SEA_CSV")),
    fetchCsv(reqEnv("GSH_INPUT_AIR_CSV")),
    fetchCsv(reqEnv("GSH_MILESTONES_SEA_CSV")),
    fetchCsv(reqEnv("GSH_MILESTONES_AIR_CSV")),
    fetchCsv(reqEnv("GSH_MILESTONES_NOTES_CSV")),
  ]);

  await upsertTable(supabase, "shipments", shipments, "shipment_id");
  await upsertTable(supabase, "input_sea", inputSea, "shipment_id,container_number");
  await upsertTable(supabase, "input_air", inputAir, "shipment_id,flight");
  await upsertTable(supabase, "milestones_sea", msSea, "shipment_id");
  await upsertTable(supabase, "milestones_air", msAir, "shipment_id");

  if (msNotes.length > 0) {
    const ids = Array.from(
      new Set(msNotes.map((r) => String((r as RowObject).shipment_id ?? "")).filter(Boolean))
    );
    if (ids.length > 0) {
      const { error: delErr } = await supabase.from("milestones_notes").delete().in("shipment_id", ids);
      if (delErr) throw new Error(`milestones_notes delete failed: ${delErr.message}`);
    }
    const BATCH = 1000;
    for (let i = 0; i < msNotes.length; i += BATCH) {
      const chunk = msNotes.slice(i, i + BATCH);
      const { error } = await supabase.from("milestones_notes").insert(chunk as object[]);
      if (error) throw new Error(`milestones_notes insert failed: ${error.message}`);
    }
  }

  return NextResponse.json({
    ok: true as const,
    summary: {
      shipments: shipments.length,
      input_sea: inputSea.length,
      input_air: inputAir.length,
      milestones_sea: msSea.length,
      milestones_air: msAir.length,
      milestones_notes: msNotes.length,
    },
  });
}
