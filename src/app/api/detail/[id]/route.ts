import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Shipment, InputSea, InputAir, MilestoneAny, Note } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // 👈 Next.js 15: params là Promise
) {
  const { id } = await ctx.params; // 👈 giải Promise để lấy id
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

  // 4) Notes
  const { data: notes } = await supabaseAdmin
    .from("milestones_notes")
    .select("*")
    .eq("shipment_id", id)
    .eq("active", true)
    .order("note_time", { ascending: false });

  return NextResponse.json({
    ok: true,
    data: {
      shipment: ship as Shipment,
      input_sea: (seaRes.data || []) as InputSea[],
      input_air: (airRes.data || []) as InputAir[],
      milestones,
      notes: (notes || []) as Note[],
    },
  });
}
