import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useUserData, useDeviceSession } from "../hooks";

const SYNC_STATUS_MAP = {
  synced: { icon: "●", label: "Synced", color: "#22c55e" },
  syncing: { icon: "↻", label: "Syncing...", color: "#eab308" },
  error: { icon: "⚠", label: "Sync Failed", color: "#ef4444" },
  offline: { icon: "○", label: "Offline", color: "#9ca3af" },
};

function SyncStatus({ status = "offline", onRetry }) {
  const s = SYNC_STATUS_MAP[status] || SYNC_STATUS_MAP.offline;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: s.color }}>
      <span aria-hidden="true">{s.icon}</span>
      <span>{s.label}</span>
      {status === "error" && onRetry && (
        <button
          onClick={onRetry}
          style={{ marginLeft: 4, fontSize: 12, background: "none", border: "1px solid currentColor", borderRadius: 6, padding: "2px 8px", color: s.color, cursor: "pointer" }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const { rows, status, addRow, deleteRow, refetch } = useUserData("journal");
  const [text, setText] = useState("");

  // Registers this browser in device_sessions and listens for remote logout.
  useDeviceSession();

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await addRow({ note: text.trim(), createdAt: new Date().toISOString() });
    setText("");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>Multi-Device Synced Account</div>
          <div style={styles.hello}>Halo, {profile?.username || "…"}</div>
        </div>
        <nav style={styles.nav}>
          <SyncStatus status={status} onRetry={refetch} />
          <Link to="/devices" style={styles.navLink}>
            Devices
          </Link>
          <Link to="/settings" style={styles.navLink}>
            Settings
          </Link>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Logout
          </button>
        </nav>
      </header>

      <main style={styles.main}>
        <form onSubmit={handleAdd} style={styles.form}>
          <input
            style={styles.input}
            placeholder="Tulis sesuatu — akan langsung tersinkron ke semua device kamu…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button style={styles.addBtn} type="submit">
            Tambah
          </button>
        </form>

        <div style={styles.list}>
          {rows.length === 0 && <div style={styles.empty}>Belum ada data. Coba tambah dari device ini, lalu buka di device lain.</div>}
          {rows.map((row) => (
            <div key={row.id} style={styles.item}>
              <span>{row.data?.note}</span>
              <button style={styles.deleteBtn} onClick={() => deleteRow(row.id)}>
                Hapus
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const styles = {
  wrap: { minHeight: "100vh", background: "#0f1115", color: "#fff" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid #262b31",
  },
  brand: { fontWeight: 700, fontSize: 15 },
  hello: { color: "#9ba1aa", fontSize: 13, marginTop: 2 },
  nav: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" },
  navLink: { color: "#9ba1aa", fontSize: 13, textDecoration: "none" },
  logoutBtn: { background: "none", border: "1px solid #262b31", color: "#fff", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer" },
  main: { maxWidth: 640, margin: "0 auto", padding: "24px 20px" },
  form: { display: "flex", gap: 8, marginBottom: 20 },
  input: { flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #262b31", background: "#181b20", color: "#fff", fontSize: 14 },
  addBtn: { padding: "10px 18px", borderRadius: 8, border: "none", background: "#e8b93f", color: "#14171b", fontWeight: 700, cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  item: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#181b20", border: "1px solid #262b31", borderRadius: 10, padding: "10px 14px" },
  deleteBtn: { background: "none", border: "none", color: "#ff4d5e", cursor: "pointer", fontSize: 12 },
  empty: { color: "#9ba1aa", fontSize: 13, textAlign: "center", padding: "30px 0" },
};
