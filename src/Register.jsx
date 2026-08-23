import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Register() {
  const { register, loginWithGoogle, currentUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (currentUser) {
    navigate("/dashboard", { replace: true });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("Isi username dan password.");
      return;
    }
    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    setSubmitting(true);
    const { error } = await register(username, password);
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    const { error } = await loginWithGoogle();
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>Daftar</h1>
        {error && <div style={styles.error}>{error}</div>}
        <label style={styles.label}>
          Username
          <input
            style={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label style={styles.label}>
          Password
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label style={styles.label}>
          Konfirmasi Password
          <input
            style={styles.input}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button style={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Memproses…" : "Daftar"}
        </button>

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>atau</span>
          <span style={styles.dividerLine} />
        </div>

        <button type="button" style={styles.googleButton} onClick={handleGoogle} disabled={googleLoading}>
          <GoogleIcon />
          {googleLoading ? "Menghubungkan…" : "Daftar dengan Google"}
        </button>
        <p style={styles.googleNote}>Login lagi dengan akun Google yang sama di device manapun, otomatis tersambung.</p>

        <p style={styles.footNote}>
          Sudah punya akun? <Link to="/login">Masuk</Link>
        </p>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.8l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c2.8 0 5.3 1 7.3 2.8l5.7-5.7C33.6 6.5 29 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z" />
      <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 34.5 26.7 35.5 24 35.5c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.2 5.2C40.6 36 43.5 30.5 43.5 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const styles = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#0f1115" },
  card: { width: "100%", maxWidth: 360, background: "#181b20", border: "1px solid #262b31", borderRadius: 14, padding: 28, display: "flex", flexDirection: "column", gap: 14 },
  title: { color: "#fff", fontSize: 22, margin: 0, marginBottom: 4 },
  label: { color: "#9ba1aa", fontSize: 13, display: "flex", flexDirection: "column", gap: 6 },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid #262b31", background: "#0f1115", color: "#fff", fontSize: 14 },
  button: { marginTop: 6, padding: "11px 0", borderRadius: 8, border: "none", background: "#e8b93f", color: "#14171b", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  divider: { display: "flex", alignItems: "center", gap: 10, margin: "2px 0" },
  dividerLine: { flex: 1, height: 1, background: "#262b31" },
  dividerText: { color: "#6b7280", fontSize: 11 },
  googleButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "10px 0",
    borderRadius: 8,
    border: "1px solid #262b31",
    background: "#fff",
    color: "#1f1f1f",
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "pointer",
  },
  googleNote: { color: "#6b7280", fontSize: 11, textAlign: "center", margin: 0 },
  error: { background: "rgba(239,68,68,0.12)", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  footNote: { color: "#9ba1aa", fontSize: 13, textAlign: "center", margin: 0 },
};
