// src/app/api/search/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kiểu hàng dữ liệu tối thiểu ta dùng khi select từ view
type SearchRow = {
  shipment_id: string | number | null;
  tracking_id: string | null;
  mode: string | null;
  mbl_number: string | null;
  hbl_number: string | null;
  scope_of_service: string | null;
  carrier: string | null;
  containers: string | null; // tên cột trong view là "containers"
  etd_date: string | null;
  atd_date: string | null;
  eta_date: string | null;
  ata_date: string | null;
  pol_aol: string | null;
  pod_aod: string | null;
  place_of_delivery: string | null;
};

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
  const buildEqOr = (col: string) => variants.map((v) => `${col}.eq.${v}`).join(",");

  // Like/ilike substring
  const likeQ = `%${qRaw}%`;

  // Bộ chọn cột từ view
  const baseSelect = `
    shipment_id,
    tracking_id,
    mode,
    mbl_number,
    hbl_number,
    scope_of_service,
    carrier,
    containers,
    etd_date,
    atd_date,
    eta_date,
    ata_date,
    pol_aol,
    pod_aod,
    place_of_delivery
  `;

  try {
    /* =================== 1) EXACT match =================== */
    let q1 = supabase.from("shipment_search_v").select(baseSelect).or(
      [
        buildEqOr("shipment_id"),
        buildEqOr("tracking_id"),
        buildEqOr("mbl_number"),
        buildEqOr("hbl_number"),
        buildEqOr("carrier"),
      ].join(",")
    );

    if (pol !== "ALL") q1 = q1.eq("pol_aol", pol);
    if (pod !== "ALL") q1 = q1.eq("pod_aod", pod);

    q1 = q1.order(sortCol, { ascending, nullsFirst: ascending }).limit(200);
    const exact = await q1;
    if (exact.error) throw exact.error;

    let finalData = (exact.data ?? []) as SearchRow[];

    /* =================== 2) ILIKE (substring) =================== */
    if (finalData.length === 0) {
      // PostgREST yêu cầu tách .or() theo nhóm; dùng nhiều .or nối nhau
      let qLike = supabase.from("shipment_search_v").select(baseSelect);

      // dùng or cho từng cột để đạt hiệu ứng OR ILIKE
      qLike = qLike
        .or(`shipment_id.ilike.${likeQ}`)
        .or(`tracking_id.ilike.${likeQ}`)
        .or(`mbl_number.ilike.${likeQ}`)
        .or(`hbl_number.ilike.${likeQ}`)
        .or(`carrier.ilike.${likeQ}`);

      if (pol !== "ALL") qLike = qLike.eq("pol_aol", pol);
      if (pod !== "ALL") qLike = qLike.eq("pod_aod", pod);

      qLike = qLike.order(sortCol, { ascending, nullsFirst: ascending }).limit(200);
      const got = await qLike;
      if (got.error) throw got.error;

      finalData = (got.data ?? []) as SearchRow[];
    }

    /* =================== 3) Tìm CONTAINER =================== */
    if (finalData.length === 0) {
      // 3a) Exact container
      const inSeaExact = await supabase
        .from("input_sea")
        .select("shipment_id")
        .or(buildEqOr("container_number"))
        .limit(200);

      if (inSeaExact.error) throw inSeaExact.error;

      let shipmentIds = (inSeaExact.data ?? [])
        .map((r) => (r as Record<string, unknown>)["shipment_id"])
        .filter(
          (v): v is string | number => typeof v === "string" || typeof v === "number"
        );

      // 3b) Nếu vẫn rỗng, thử ilike container
      if (shipmentIds.length === 0) {
        const inSeaLike = await supabase
          .from("input_sea")
          .select("shipment_id")
          .ilike("container_number", likeQ)
          .limit(200);

        if (inSeaLike.error) throw inSeaLike.error;

        shipmentIds = (inSeaLike.data ?? [])
          .map((r) => (r as Record<string, unknown>)["shipment_id"])
          .filter(
            (v): v is string | number => typeof v === "string" || typeof v === "number"
          );
      }

      if (shipmentIds.length > 0) {
        let q2 = supabase.from("shipment_search_v").select(baseSelect).in("shipment_id", shipmentIds);
        if (pol !== "ALL") q2 = q2.eq("pol_aol", pol);
        if (pod !== "ALL") q2 = q2.eq("pod_aod", pod);
        q2 = q2.order(sortCol, { ascending, nullsFirst: ascending }).limit(200);

        const got2 = await q2;
        if (got2.error) throw got2.error;

        finalData = (got2.data ?? []) as SearchRow[];
      }
    }

    return NextResponse.json<{ ok: true; data: SearchRow[] }>({
      ok: true,
      data: finalData,
    });
  } catch (e: unknown) {
    console.error("[/api/search] error:", e);
    const error =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";

    return NextResponse.json<{ ok: false; error: string }>(
      { ok: false, error },
      { status: 500 }
    );
  }
}
