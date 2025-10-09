import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabaseAdmin = getSupabaseAdmin();
  const id = params.id;

  const { data: ship, error: e1 } = await supabaseAdmin
    .from("shipments").select("*").eq("shipment_id", id).single();
  if (e1) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const [seaRes, airRes] = await Promise.all([
    supabaseAdmin.from("input_sea").select("*").eq("shipment_id", id),
    supabaseAdmin.from("input_air").select("*").eq("shipment_id", id),
  ]);

  let milestones: any = null;
  if (ship.mode === "SEA") {
    const { data } = await supabaseAdmin.from("milestones_sea").select("*").eq("shipment_id", id).single();
    milestones = data ?? null;
  } else {
    const { data } = await supabaseAdmin.from("milestones_air").select("*").eq("shipment_id", id).single();
    milestones = data ?? null;
  }

  const { data: notes } = await supabaseAdmin
    .from("milestones_notes").select("*").eq("shipment_id", id).eq("active", true)
    .order("note_time", { ascending: false });

  return NextResponse.json({
    ok: true,
    data: {
      shipment: ship,
      input_sea: seaRes.data || [],
      input_air: airRes.data || [],
      milestones,
      notes: notes || [],
    },
  });
}
