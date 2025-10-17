// "use client";
// import { useEffect, useState } from "react";

// type ImportSummary = {
//   shipments: number;
//   input_sea: number;
//   input_air: number;
//   milestones_sea: number;
//   milestones_air: number;
//   milestones_notes: number;
// };

// type ImportResponse =
//   | { ok: true; summary: ImportSummary }
//   | { ok: false; error: string };

// /* ==== helpers (tránh any) ==== */
// function isRecord(v: unknown): v is Record<string, unknown> {
//   return typeof v === "object" && v !== null;
// }
// function getErrorField(v: unknown): string | null {
//   if (!isRecord(v)) return null;
//   const e = v["error"];
//   return typeof e === "string" ? e : null;
// }

// export default function AdminPage() {
//   const [token, setToken] = useState("");
//   const [isAuthorized, setIsAuthorized] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [result, setResult] = useState<ImportResponse | null>(null);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     const t = localStorage.getItem("lt_admin_token");
//     if (t) {
//       setToken(t);
//       verifyToken(t);
//     }
//   }, []);

//   function saveToken(t: string) {
//     setToken(t);
//     localStorage.setItem("lt_admin_token", t);
//   }

//   function logout() {
//     localStorage.removeItem("lt_admin_token");
//     setToken("");
//     setIsAuthorized(false);
//     setResult(null);
//     setError(null);
//   }

//   // xác thực token nhẹ nhàng (không ghi DB)
//   async function verifyToken(t: string) {
//     try {
//       const res = await fetch("/api/admin/import?dryrun=1", {
//         method: "POST",
//         headers: { "x-admin-token": t.trim() },
//       });
//       if (res.status !== 401) setIsAuthorized(true);
//     } catch {
//       setIsAuthorized(false);
//     }
//   }

//   // gọi import thật; parse JSON an toàn
//   async function doImport() {
//     setLoading(true);
//     setError(null);
//     setResult(null);
//     try {
//       const res = await fetch("/api/admin/import", {
//         method: "POST",
//         headers: { "x-admin-token": token.trim() },
//       });

//       const ct = res.headers.get("content-type") ?? "";
//       const raw = await res.text();

//       let parsed: unknown = null;
//       if (ct.includes("application/json") && raw) {
//         try {
//           parsed = JSON.parse(raw);
//         } catch {
//           /* bỏ qua, sẽ xử lý phía dưới */
//         }
//       }


//       if (!res.ok) {
//         const statusText = `HTTP ${res.status}`;
//         const msg = getErrorField(parsed) ?? (raw || statusText);
//         throw new Error(msg);
//       }

//       if (!isRecord(parsed) || !("ok" in parsed)) {
//         throw new Error("Unexpected empty or non-JSON response");
//       }

//       const okVal = parsed["ok"];
//       if (okVal === true) {
//         setResult(parsed as { ok: true; summary: ImportSummary });
//       } else if (okVal === false) {
//         setError(getErrorField(parsed) ?? "Import failed");
//       } else {
//         throw new Error("Unexpected response shape");
//       }
//     } catch (err: unknown) {
//       const msg = err instanceof Error ? err.message : "Network error";
//       setError(msg);
//     } finally {
//       setLoading(false);
//     }
//   }

//   const Header = (
//     <header
//       style={{
//         display: "flex",
//         justifyContent: "space-between",
//         alignItems: "center",
//         marginBottom: 16,
//       }}
//     >
//       <h1 style={{ margin: 0 }}>Admin — Import CSV</h1>
//       {isAuthorized ? (
//         <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
//           <span style={{ fontSize: 13, color: "#0a7f2e" }}>Đã đăng nhập</span>
//           <button
//             onClick={logout}
//             style={{
//               padding: "6px 10px",
//               borderRadius: 8,
//               border: "1px solid #ddd",
//               background: "#fff",
//             }}
//           >
//             Đăng xuất
//           </button>
//         </div>
//       ) : (
//         <span style={{ fontSize: 13, color: "#a00" }}>Chưa xác thực</span>
//       )}
//     </header>
//   );

//   // Nếu chưa xác thực thì chỉ hiện form nhập token
//   if (!isAuthorized) {
//     return (
//       <main
//         style={{
//           padding: 24,
//           maxWidth: 520,
//           margin: "80px auto",
//           textAlign: "center",
//           border: "1px solid #eee",
//           borderRadius: 12,
//         }}
//       >
//         {Header}
//         <p>
//           Nhập token admin (trùng <code>ADMIN_TOKEN</code> trên Vercel) để truy
//           cập.
//         </p>
//         <input
//           value={token}
//           onChange={(e) => saveToken(e.target.value)}
//           placeholder="ADMIN_TOKEN"
//           style={{
//             width: "100%",
//             padding: 12,
//             border: "1px solid #ccc",
//             borderRadius: 8,
//             marginTop: 12,
//             marginBottom: 12,
//           }}
//         />
//         <button
//           onClick={() => verifyToken(token)}
//           style={{
//             padding: "10px 16px",
//             borderRadius: 8,
//             border: "none",
//             background: "#0070f3",
//             color: "white",
//             cursor: "pointer",
//           }}
//         >
//           Xác nhận
//         </button>
//       </main>
//     );
//   }

//   // Đã xác thực -> giao diện import
//   return (
//     <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
//       {Header}
//       <p>Nhấn Import để đồng bộ dữ liệu từ Google Sheets lên Supabase.</p>

//       <button
//         onClick={doImport}
//         disabled={loading}
//         style={{
//           padding: "10px 20px",
//           borderRadius: 8,
//           border: "1px solid #ddd",
//           background: "#fff",
//         }}
//       >
//         {loading ? "Đang import..." : "Import"}
//       </button>

//       {error && (
//         <p style={{ color: "crimson", marginTop: 12 }}>Lỗi: {error}</p>
//       )}
//       {result && result.ok && (
//         <div style={{ marginTop: 16 }}>
//           <h3>Kết quả:</h3>
//           <pre
//             style={{
//               background: "#fafafa",
//               padding: 12,
//               border: "1px solid #eee",
//               borderRadius: 8,
//             }}
//           >
//             {JSON.stringify(result.summary, null, 2)}
//           </pre>
//         </div>
//       )}
//     </main>
//   );
// }

"use client";

import { useEffect, useRef, useState } from "react";

type ImportSummary = {
  shipments: number;
  input_sea: number;
  input_air: number;
  milestones_sea: number;
  milestones_air: number;
  milestones_notes: number;
};
type ImportResponse = { ok: true; summary: ImportSummary } | { ok: false; error: string };

/* ==== helpers ==== */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // streaming logs + cancel
  const [logs, setLogs] = useState<string[]>([]);
  const logBoxRef = useRef<HTMLPreElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("lt_admin_token");
    if (t) {
      setToken(t);
      verifyToken(t);
    }
  }, []);

  useEffect(() => {
    if (!logBoxRef.current) return;
    logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [logs]);

  function saveToken(t: string) {
    setToken(t);
    localStorage.setItem("lt_admin_token", t);
  }
  function logout() {
    localStorage.removeItem("lt_admin_token");
    setToken("");
    setIsAuthorized(false);
    setResult(null);
    setError(null);
    setLogs([]);
  }

  // xác thực nhanh
  async function verifyToken(t: string) {
    try {
      const res = await fetch("/api/admin/import?dryrun=1", {
        method: "POST",
        headers: { "x-admin-token": t.trim() },
      });
      if (res.status !== 401) setIsAuthorized(true);
    } catch {
      setIsAuthorized(false);
    }
  }

  // ===== IMPORT (STREAM) =====
  async function doImportStream(params?: { batch?: number; strict?: 0 | 1; parallel?: 0 | 1 }) {
    setLoading(true);
    setError(null);
    setResult(null);
    setLogs((prev) => [...prev, "▶ Bắt đầu import…"]);

    const q = new URLSearchParams();
    q.set("stream", "1");
    if (params?.batch) q.set("batch", String(params.batch));
    if (typeof params?.strict === "number") q.set("strict", String(params.strict));
    if (typeof params?.parallel === "number") q.set("parallel", String(params.parallel));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/admin/import?${q.toString()}`, {
        method: "POST",
        headers: { "x-admin-token": token.trim() },
        signal: controller.signal,
      });

      if (!res.ok && !res.body) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      if (!res.body) {
        // Fallback: không stream -> đọc JSON
        const parsed = (await res.json()) as ImportResponse;
        if (parsed.ok) {
          setResult(parsed);
          setLogs((prev) => [...prev, "✔ Hoàn tất"]);
        } else setError(parsed.error);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;

          if (line.startsWith("RESULT ")) {
            try {
              const payload = JSON.parse(line.slice("RESULT ".length));
              if (isRecord(payload) && payload["ok"]) setResult(payload as ImportResponse);
            } catch {}
            setLogs((prev) => [...prev, "✔ Hoàn tất"]);
          } else if (line.startsWith("ERROR ")) {
            setError(line.slice("ERROR ".length));
            setLogs((prev) => [...prev, "✖ Lỗi"]);
          } else {
            setLogs((prev) => [...prev, line]);
          }
        }
      }
    
    } catch (err: unknown) {
      const isAbort =
      (err instanceof DOMException && err.name === "AbortError") ||
      (typeof err === "object" && err !== null && "name" in err && (err as { name?: unknown }).name === "AbortError");
      if (isAbort) {
        setLogs((prev) => [...prev, "⏹ Đã hủy bởi người dùng"]);
      } else {
        setError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function cancelImport() {
    abortRef.current?.abort();
  }

  const Header = (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      <h1 style={{ margin: 0 }}>Admin — Import CSV</h1>
      {isAuthorized ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#0a7f2e" }}>Đã đăng nhập</span>
          <button
            onClick={logout}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            Đăng xuất
          </button>
        </div>
      ) : (
        <span style={{ fontSize: 13, color: "#a00" }}>Chưa xác thực</span>
      )}
    </header>
  );

  // Chưa xác thực -> form token
  if (!isAuthorized) {
    return (
      <main
        style={{
          padding: 24,
          maxWidth: 520,
          margin: "80px auto",
          textAlign: "center",
          border: "1px solid #eee",
          borderRadius: 12,
        }}
      >
        {Header}
        <p>
          Nhập token admin (trùng <code>ADMIN_TOKEN</code> trên Vercel) để truy cập.
        </p>
        <input
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          placeholder="ADMIN_TOKEN"
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid #ccc",
            borderRadius: 8,
            marginTop: 12,
            marginBottom: 12,
          }}
        />
        <button
          onClick={() => verifyToken(token)}
          style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#0070f3", color: "#fff" }}
        >
          Xác nhận
        </button>
      </main>
    );
  }

  // Đã xác thực
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {Header}

      <p>Nhấn Import để đồng bộ dữ liệu từ Google Sheets lên Supabase.</p>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => doImportStream({ parallel: 1 })}
          disabled={loading}
          style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
        >
          {loading ? "Đang import..." : "Import"}
        </button>

        {/* Nút Hủy */}
        {loading && (
          <button
            onClick={cancelImport}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #f00", background: "#ffecec" }}
          >
            Hủy
          </button>
        )}

        {/* Import nhanh */}
        {!loading && (
          <button
            onClick={() => doImportStream({ batch: 5000, strict: 0, parallel: 1 })}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#f6ffed" }}
            title="Song song + batch=5000 + bỏ strict để nhanh hơn"
          >
            Import nhanh (song song)
          </button>
        )}
      </div>

      {/* ERROR */}
      {error && <p style={{ color: "crimson", marginTop: 12 }}>Lỗi: {error}</p>}

      {/* Kết quả tóm tắt */}
      {result && result.ok && (
        <div style={{ marginTop: 16 }}>
          <h3>Kết quả:</h3>
          <pre
            style={{ background: "#fafafa", padding: 12, border: "1px solid #eee", borderRadius: 8, maxHeight: 240, overflow: "auto" }}
          >
            {JSON.stringify(result.summary, null, 2)}
          </pre>
        </div>
      )}

      {/* Nhật ký tiến trình */}
      <div style={{ marginTop: 16 }}>
        <h3>Tiến trình:</h3>
        <pre
          ref={logBoxRef}
          style={{
            background: "#0b1220",
            color: "#e2e8f0",
            padding: 12,
            borderRadius: 8,
            border: "1px solid #111827",
            maxHeight: 260,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {logs.join("\n")}
        </pre>
      </div>
    </main>
  );
}
