"use client";
import { useEffect, useState } from "react";

type ImportSummary = {
  shipments: number;
  input_sea: number;
  input_air: number;
  milestones_sea: number;
  milestones_air: number;
  milestones_notes: number;
};

type ImportResponse =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

/* ==== helpers (tránh any) ==== */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function getErrorField(v: unknown): string | null {
  if (!isRecord(v)) return null;
  const e = v["error"];
  return typeof e === "string" ? e : null;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("lt_admin_token");
    if (t) {
      setToken(t);
      verifyToken(t);
    }
  }, []);

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
  }

  // xác thực token nhẹ nhàng (không ghi DB)
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

  // gọi import thật; parse JSON an toàn
  async function doImport() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "x-admin-token": token.trim() },
      });

      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();

      let parsed: unknown = null;
      if (ct.includes("application/json") && raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          /* bỏ qua, sẽ xử lý phía dưới */
        }
      }


      if (!res.ok) {
        const statusText = `HTTP ${res.status}`;
        const msg = getErrorField(parsed) ?? (raw || statusText);
        throw new Error(msg);
      }

      if (!isRecord(parsed) || !("ok" in parsed)) {
        throw new Error("Unexpected empty or non-JSON response");
      }

      const okVal = parsed["ok"];
      if (okVal === true) {
        setResult(parsed as { ok: true; summary: ImportSummary });
      } else if (okVal === false) {
        setError(getErrorField(parsed) ?? "Import failed");
      } else {
        throw new Error("Unexpected response shape");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
    } finally {
      setLoading(false);
    }
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
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            Đăng xuất
          </button>
        </div>
      ) : (
        <span style={{ fontSize: 13, color: "#a00" }}>Chưa xác thực</span>
      )}
    </header>
  );

  // Nếu chưa xác thực thì chỉ hiện form nhập token
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
          Nhập token admin (trùng <code>ADMIN_TOKEN</code> trên Vercel) để truy
          cập.
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
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: "#0070f3",
            color: "white",
            cursor: "pointer",
          }}
        >
          Xác nhận
        </button>
      </main>
    );
  }

  // Đã xác thực -> giao diện import
  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      {Header}
      <p>Nhấn Import để đồng bộ dữ liệu từ Google Sheets lên Supabase.</p>

      <button
        onClick={doImport}
        disabled={loading}
        style={{
          padding: "10px 20px",
          borderRadius: 8,
          border: "1px solid #ddd",
          background: "#fff",
        }}
      >
        {loading ? "Đang import..." : "Import"}
      </button>

      {error && (
        <p style={{ color: "crimson", marginTop: 12 }}>Lỗi: {error}</p>
      )}
      {result && result.ok && (
        <div style={{ marginTop: 16 }}>
          <h3>Kết quả:</h3>
          <pre
            style={{
              background: "#fafafa",
              padding: 12,
              border: "1px solid #eee",
              borderRadius: 8,
            }}
          >
            {JSON.stringify(result.summary, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
