import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic"; // ✅ thêm dòng này ở đây

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  // 1) Shipment
  const { data: ship, error: e1 } = await supabaseAdmin
    .from("shipments")
    .select("*")
    .eq("shipment_id", id)
    .single();

  if (e1) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // 2) Inputs
  const [seaRes, airRes] = await Promise.all([
    supabaseAdmin.from("input_sea").select("*").eq("shipment_id", id),
    supabaseAdmin.from("input_air").select("*").eq("shipment_id", id),
  ]);

  // 3) Milestones (theo mode)
  let milestones: any = null;
  if (ship.mode === "SEA") {
    const { data, error } = await supabaseAdmin
      .from("milestones_sea")
      .select("*")
      .eq("shipment_id", id)
      .single();
    if (!error) milestones = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("milestones_air")
      .select("*")
      .eq("shipment_id", id)
      .single();
    if (!error) milestones = data;
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
      shipment: ship,
      input_sea: seaRes.data || [],
      input_air: airRes.data || [],
      milestones,
      notes: notes || [],
    },
  });
}
