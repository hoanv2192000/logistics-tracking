import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Shipment, InputSea, InputAir, MilestoneAny, Note } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // Next.js 15: params là Promise
) {
  const { id } = await ctx.params;
  const supabaseAdmin = getSupabaseAdmin();

  // 1) Shipment
  const { data: ship, error: e1 } = await supabaseAdmin
    .from("shipments")
    .select("*")
    .eq("shipment_id", id)
    .single();

  if (e1 || !ship) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // 2) Inputs (song song)
  const [seaRes, airRes] = await Promise.all([
    supabaseAdmin.from("input_sea").select("*").eq("shipment_id", id),
    supabaseAdmin.from("input_air").select("*").eq("shipment_id", id),
  ]);

  // 3) Milestones theo mode
  let milestones: MilestoneAny | null = null;
  if (ship.mode === "SEA") {
    const { data } = await supabaseAdmin
      .from("milestones_sea")
      .select("*")
      .eq("shipment_id", id)
      .single();
    milestones = (data as MilestoneAny) ?? null;
  } else {
    const { data } = await supabaseAdmin
      .from("milestones_air")
      .select("*")
      .eq("shipment_id", id)
      .single();
    milestones = (data as MilestoneAny) ?? null;
  }

  // 4) Notes — KHÔNG lọc active ở DB; lọc ở server để chấp nhận nhiều kiểu
  const { data: notesRaw } = await supabaseAdmin
    .from("milestones_notes")
    .select("id, shipment_id, mode, step, note, note_type, note_time, active")
    .eq("shipment_id", id)
    .order("note_time", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  const notes: Note[] = (notesRaw ?? []).filter((n: any) => {
    const v = n?.active;
    if (v === true) return true;                       // boolean true
    if (typeof v === "number") return v === 1;         // 1
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();               // "TRUE", "true", "1", "t", "yes", "y"
      return s === "true" || s === "1" || s === "t" || s === "yes" || s === "y";
    }
    return false;
  }) as Note[];

  return NextResponse.json({
    ok: true,
    data: {
      shipment: ship as Shipment,
      input_sea: (seaRes.data || []) as InputSea[],
      input_air: (airRes.data || []) as InputAir[],
      milestones,
      notes,
    },
  });
}
