import { useState, useEffect } from "react";
import { useAuth } from "./store/auth.store.js";
import LoginPage from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";

export default function App() {
  const { token, user, fetchMe } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return (
    <div style={{
      minHeight: "100vh", background: "#080810", display: "flex",
      alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16
    }}>
      <div style={{
        width: 48, height: 48, background: "linear-gradient(135deg,#ff0000,#cc0000)",
        borderRadius: 12, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 24, boxShadow: "0 0 24px #ff000060"
      }}>▶</div>
      <div style={{ color: "#64748b", fontSize: 14 }}>Loading YT AutoPilot…</div>
    </div>
  );

  if (!token || !user) return <LoginPage />;

  return <Dashboard />;
}
