import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function Settings() {
  const { profile, currentUser } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const newPassword = e.target.newPassword.value;
    if (newPassword.length < 6) {
      alert("Password minimal 6 karakter.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      alert(error.message);
    } else {
      alert("Password berhasil diubah.");
      e.target.reset();
    }
  };

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <Link to="/dashboard" style={styles.back}>
          ← Dashboard
        </Link>
        <h1 style={styles.title}>Settings</h1>
      </header>

      <main style={styles.main}>
        {!online && <div style={styles.offlineBanner}>You're offline. Changes will sync when connection returns.</div>}

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Akun</h2>
          <div style={styles.row}>
            <span style={styles.rowLabel}>Username</span>
            <span>{profile?.username}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.rowLabel}>User ID</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>{currentUser?.id}</span>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Ganti Password</h2>
          <form onSubmit={handleChangePassword} style={styles.form}>
            <input name="newPassword" type="password" placeholder="Password baru" style={styles.input} autoComplete="new-password" />
            <button type="submit" style={styles.button}>
              Simpan
            </button>
          </form>
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Devices</h2>
          <p style={styles.cardText}>Kelola perangkat yang sedang login ke akun ini.</p>
          <Link to="/devices" style={styles.linkButton}>
            Buka Active Devices →
          </Link>
        </section>
      </main>
    </div>
  );
}

const styles = {
  wrap: { minHeight: "100vh", background: "#0f1115", color: "#fff" },
  header: { display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderBottom: "1px solid #262b31" },
  back: { color: "#9ba1aa", fontSize: 13, textDecoration: "none" },
  title: { fontSize: 16, margin: 0 },
  main: { maxWidth: 480, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 },
  offlineBanner: { background: "rgba(234,179,8,0.12)", border: "1px solid #eab308", color: "#eab308", borderRadius: 10, padding: "10px 14px", fontSize: 13 },
  card: { background: "#181b20", border: "1px solid #262b31", borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 14, margin: "0 0 12px" },
  cardText: { fontSize: 13, color: "#9ba1aa", margin: "0 0 10px" },
  row: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0" },
  rowLabel: { color: "#9ba1aa" },
  form: { display: "flex", gap: 8 },
  input: { flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #262b31", background: "#0f1115", color: "#fff", fontSize: 13 },
  button: { padding: "9px 16px", borderRadius: 8, border: "none", background: "#e8b93f", color: "#14171b", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  linkButton: { color: "#4ea1ff", fontSize: 13, textDecoration: "none" },
};
