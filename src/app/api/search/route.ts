import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const qRaw = (searchParams.get("q") || "").trim();
  const pol = (searchParams.get("pol") || "ALL").trim();
  const pod = (searchParams.get("pod") || "ALL").trim();
  const sortByParam = (searchParams.get("sortBy") || "ETD").toUpperCase();
  const dirParam = (searchParams.get("dir") || "DESC").toUpperCase();

  // Không có q -> trả rỗng
  if (!qRaw) return NextResponse.json({ ok: true, data: [] });

  // Map cột sort
  const sortCol = sortByParam === "ETA" ? "eta_date" : "etd_date";
  const ascending = dirParam === "ASC";

  // So khớp EXACT không phân biệt hoa thường: thử 3 biến thể
  const variants = Array.from(new Set([qRaw, qRaw.toLowerCase(), qRaw.toUpperCase()]));
  const buildEqOr = (col: string) => variants.map(v => `${col}.eq.${v}`).join(",");

  try {
    // ---- 1) Exact match theo shipment_id / tracking_id / mbl / hbl ----
    let query = supabase
      .from("shipment_search_v")
      .select(`
        shipment_id,
        tracking_id,
        mode,
        mbl_number,
        hbl_number,
        carrier,
        container_number,
        etd_date,
        atd_date,
        eta_date,
        ata_date,
        pol_aol,
        pod_aod
      `)
      .or(
        [
          buildEqOr("shipment_id"),
          buildEqOr("tracking_id"),
          buildEqOr("mbl_number"),
          buildEqOr("hbl_number"),
        ].join(",")
      );

    if (pol !== "ALL") query = query.eq("pol_aol", pol);
    if (pod !== "ALL") query = query.eq("pod_aod", pod);

    query = query.order(sortCol, { ascending, nullsFirst: ascending }).limit(200);

    let { data, error } = await query;
    if (error) throw error;

    // ---- 2) Nếu chưa khớp, thử exact match theo CONTAINER ----
    // (container_number trong view là chuỗi gộp -> không eq được, nên tra trực tiếp input_sea)
    if (!data || data.length === 0) {
      const inSea = await supabase
        .from("input_sea")
        .select("shipment_id")
        .or(buildEqOr("container_number"))
        .limit(200);

      if (inSea.error) throw inSea.error;

      const shipmentIds = (inSea.data || []).map(r => r.shipment_id);
      if (shipmentIds.length > 0) {
        let q2 = supabase
          .from("shipment_search_v")
          .select(`
            shipment_id,
            tracking_id,
            mode,
            mbl_number,
            hbl_number,
            carrier,
            container_number,
            etd_date,
            atd_date,
            eta_date,
            ata_date,
            pol_aol,
            pod_aod
          `)
          .in("shipment_id", shipmentIds);

        if (pol !== "ALL") q2 = q2.eq("pol_aol", pol);
        if (pod !== "ALL") q2 = q2.eq("pod_aod", pod);

        q2 = q2.order(sortCol, { ascending, nullsFirst: ascending }).limit(200);
        const got = await q2;
        if (got.error) throw got.error;
        data = got.data || [];
      }
    }

    // Không khớp exact với bất kỳ loại nào -> trả rỗng
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("[/api/search] error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
