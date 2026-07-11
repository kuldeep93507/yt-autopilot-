import { useState } from "react";
import { useAuth } from "../store/auth.store.js";

const C = {
  bg: "#080810", surface: "#12121e", card: "#1a1a2e", border: "#2a2a3e",
  text: "#e2e8f0", muted: "#64748b", red: "#ef4444", blue: "#3b82f6",
  green: "#22c55e", purple: "#8b5cf6",
};

export default function LoginPage() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 18,
        padding: "40px 36px", width: 380,
        boxShadow: "0 0 60px #3b82f620",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, background: "linear-gradient(135deg,#ff0000,#cc0000)",
            borderRadius: 12, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 22, boxShadow: "0 0 20px #ff000040",
          }}>▶</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20, color: C.text }}>YT AutoPilot</div>
            <div style={{ fontSize: 11, color: C.muted }}>Multi-Channel Automation</div>
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6,
              textTransform: "uppercase", letterSpacing: 0.5 }}>Email</div>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@yoursite.com" required
              style={{
                width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text, padding: "10px 14px", fontSize: 14,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6,
              textTransform: "uppercase", letterSpacing: 0.5 }}>Password</div>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              style={{
                width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text, padding: "10px 14px", fontSize: 14,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: `${C.red}15`, border: `1px solid ${C.red}40`,
              borderRadius: 8, padding: "10px 14px", color: C.red,
              fontSize: 13, marginBottom: 16,
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px", background: C.blue, border: "none",
            borderRadius: 8, color: "#fff", fontWeight: 800, fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
            transition: "all 0.15s",
          }}>
            {loading ? "Logging in…" : "Login →"}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: "12px 14px", background: C.surface,
          borderRadius: 8, fontSize: 12, color: C.muted }}>
          💡 First time? Setup karo: backend mein <code style={{ color: C.purple }}>node src/seed.js</code> run karo
        </div>
      </div>
    </div>
  );
}
