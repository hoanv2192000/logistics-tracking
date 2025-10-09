import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const modeParam = (searchParams.get("mode") || "ALL").toUpperCase(); // ALL | SEA | AIR
  const mode = modeParam === "SEA" || modeParam === "AIR" ? modeParam : "ALL";

  if (!q) {
    return NextResponse.json({ ok: true, data: [] });
  }

  const like = `%${q}%`;

  let query = supabaseAdmin
    .from("search_keys")
    .select("shipment_id, mode, tracking_id, mbl_number, hbl_number, containers")
    .or(
      [
        `shipment_id.ilike.${like}`,
        `tracking_id.ilike.${like}`,
        `mbl_number.ilike.${like}`,
        `hbl_number.ilike.${like}`,
        `containers.ilike.${like}`,
      ].join(",")
    )
    .limit(50);

  if (mode !== "ALL") {
    query = query.eq("mode", mode);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}
