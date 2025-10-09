"use client";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("lt_admin_token");
    if (t) setToken(t);
  }, []);

  function saveToken(t: string) {
    setToken(t);
    localStorage.setItem("lt_admin_token", t);
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
      const json = await res.json();
      if (!res.ok) setError(json?.error || "Import failed");
      else setResult(json);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1>Admin — Import CSV từ Google Sheets</h1>
      <p>Nhập token admin (giống biến <code>ADMIN_TOKEN</code>), sau đó bấm Import.</p>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          placeholder="ADMIN_TOKEN"
          style={{ flex: 1, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />
        <button onClick={doImport} disabled={loading}>
          {loading ? "Đang import..." : "Import"}
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>Lỗi: {error}</p>}
      {result && (
        <div style={{ marginTop: 16 }}>
          <h3>Kết quả:</h3>
          <pre style={{ background: "#fafafa", padding: 12, border: "1px solid #eee" }}>
{JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
