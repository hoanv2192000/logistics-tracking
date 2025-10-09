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

  async function verifyToken(t: string) {
    try {
      // gọi nhẹ để xác thực token (nếu sai -> 401)
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "x-admin-token": t },
      });
      if (res.status !== 401) setIsAuthorized(true);
      // không cần import thật, nên không đọc body
    } catch {
      setIsAuthorized(false);
    }
  }

  async function doImport() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "x-admin-token": token },
      });
      const json: ImportResponse = await res.json();
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Import failed");
      } else {
        setResult(json);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const Header = (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <h1 style={{ margin: 0 }}>Admin — Import CSV</h1>
      {isAuthorized ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#0a7f2e" }}>Đã đăng nhập</span>
          <button onClick={logout} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
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
      <main style={{ padding: 24, maxWidth: 520, margin: "80px auto", textAlign: "center", border: "1px solid #eee", borderRadius: 12 }}>
        {Header}
        <p>Nhập token admin (trùng <code>ADMIN_TOKEN</code> trên Vercel) để truy cập.</p>
        <input
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          placeholder="ADMIN_TOKEN"
          style={{
            width: "100%", padding: 12, border: "1px solid #ccc", borderRadius: 8,
            marginTop: 12, marginBottom: 12,
          }}
        />
        <button
          onClick={() => verifyToken(token)}
          style={{
            padding: "10px 16px", borderRadius: 8, border: "none",
            background: "#0070f3", color: "white", cursor: "pointer",
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
        style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
      >
        {loading ? "Đang import..." : "Import"}
      </button>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>Lỗi: {error}</p>}
      {result && result.ok && (
        <div style={{ marginTop: 16 }}>
          <h3>Kết quả:</h3>
          <pre style={{ background: "#fafafa", padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
{JSON.stringify(result.summary, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
