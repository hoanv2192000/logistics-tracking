"use client";
import { createClient /*, type SupabaseClient */ } from "@supabase/supabase-js";
// Nếu bạn đã generate types từ Supabase, mở comment dòng dưới:
// import type { Database } from "@/types/supabase";

// Dùng bracket syntax để phù hợp rule noPropertyAccessFromIndexSignature
const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const anon = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

// Guard rõ ràng (giúp phát hiện thiếu env khi build / runtime)
if (!url || !anon) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// Nếu có Database type, thêm generic: createClient<Database>(url, anon, { ... })
export const supabaseClient = createClient(/* <Database> */ url, anon, {
  auth: {
    persistSession: true,        // giữ phiên đăng nhập
    autoRefreshToken: true,      // tự refresh token
    detectSessionInUrl: true,    // bắt token trả về từ OAuth (nếu dùng)
  },
});
