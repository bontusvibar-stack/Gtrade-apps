import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { getDeviceId } from "../hooks";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Active now";
  if (mins < 60) return `Active ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Active ${days} day${days === 1 ? "" : "s"} ago`;
}

const DEVICE_ICON = {
  "iPhone": "📱",
  "iPad": "📱",
  "Android Phone": "📱",
  "Android Tablet": "📱",
  "Mac": "💻",
  "Windows PC": "💻",
  "Linux PC": "💻",
};

export default function Devices() {
  const { currentUser, session, logout } = useAuth();
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const thisDeviceId = getDeviceId();

  const fetchDevices = useCallback(async () => {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from("device_sessions")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("last_active", { ascending: false });
    if (!error) setDevices(data);
    setLoading(false);
  }, [currentUser]);

  useEffect(() => {
    fetchDevices();

    if (!currentUser) return;
    const channel = supabase
      .channel(`devices-page-${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "device_sessions", filter: `user_id=eq.${currentUser.id}` },
        () => fetchDevices()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [currentUser, fetchDevices]);

  const callRevoke = async (body) => {
    const functionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
    const res = await fetch(`${functionsUrl}/revoke-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || "Gagal logout device.");
    }
  };

  const handleLogoutDevice = async (deviceId) => {
    setBusyId(deviceId);
    setError("");
    try {
      await callRevoke({ deviceId });
      if (deviceId === thisDeviceId) {
        navigate("/login", { replace: true });
      } else {
        fetchDevices();
      }
    } catch (err) {
      setError(err.message);
    }
    setBusyId(null);
  };

  const handleLogoutAll = async () => {
    if (!confirm("Logout dari SEMUA device? Kamu juga akan logout dari device ini.")) return;
    setBusyId("all");
    setError("");
    try {
      await callRevoke({ allDevices: true });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusyId(null);
    }
  };

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <Link to="/dashboard" style={styles.back}>
          ← Dashboard
        </Link>
        <h1 style={styles.title}>Active Devices</h1>
      </header>

      <main style={styles.main}>
        {error && <div style={styles.error}>{error}</div>}

        {loading ? (
          <div style={styles.empty}>Memuat…</div>
        ) : devices.length === 0 ? (
          <div style={styles.empty}>Belum ada device terdaftar.</div>
        ) : (
          <div style={styles.list}>
            {devices.map((d) => (
              <div key={d.id} style={styles.item}>
                <div style={styles.itemLeft}>
                  <span style={styles.icon}>{DEVICE_ICON[d.device_name] || "🖥️"}</span>
                  <div>
                    <div style={styles.deviceName}>
                      {d.device_name}
                      {d.device_id === thisDeviceId && <span style={styles.youBadge}>Ini device kamu</span>}
                    </div>
                    <div style={styles.deviceMeta}>
                      {d.browser} · {timeAgo(d.last_active)}
                    </div>
                  </div>
                </div>
                <button
                  style={styles.logoutBtn}
                  disabled={busyId === d.device_id}
                  onClick={() => handleLogoutDevice(d.device_id)}
                >
                  {busyId === d.device_id ? "…" : "Logout"}
                </button>
              </div>
            ))}
          </div>
        )}

        <button style={styles.logoutAllBtn} disabled={busyId === "all"} onClick={handleLogoutAll}>
          {busyId === "all" ? "Memproses…" : "Logout dari Semua Device"}
        </button>

        <p style={styles.note}>
          Logout device lain butuh Edge Function <code>revoke-session</code> ter-deploy (lihat README.md). Tanpa itu,
          tombol logout hanya akan gagal dengan pesan error — bukan diam-diam tidak melakukan apa-apa.
        </p>
      </main>
    </div>
  );
}

const styles = {
  wrap: { minHeight: "100vh", background: "#0f1115", color: "#fff" },
  header: { display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderBottom: "1px solid #262b31" },
  back: { color: "#9ba1aa", fontSize: 13, textDecoration: "none" },
  title: { fontSize: 16, margin: 0 },
  main: { maxWidth: 480, margin: "0 auto", padding: "24px 20px" },
  list: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 },
  item: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#181b20", border: "1px solid #262b31", borderRadius: 12, padding: "14px 16px" },
  itemLeft: { display: "flex", alignItems: "center", gap: 12 },
  icon: { fontSize: 22 },
  deviceName: { fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 },
  youBadge: { fontSize: 10, background: "rgba(232,185,63,0.15)", color: "#e8b93f", borderRadius: 20, padding: "2px 8px", fontWeight: 700 },
  deviceMeta: { fontSize: 12, color: "#9ba1aa", marginTop: 2 },
  logoutBtn: { background: "none", border: "1px solid #ff4d5e", color: "#ff4d5e", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer" },
  logoutAllBtn: { width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid #ff4d5e", background: "rgba(255,77,94,0.08)", color: "#ff4d5e", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  empty: { color: "#9ba1aa", fontSize: 13, textAlign: "center", padding: "30px 0" },
  error: { background: "rgba(239,68,68,0.12)", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 16 },
  note: { fontSize: 11, color: "#6b7280", marginTop: 16, lineHeight: 1.6 },
};
