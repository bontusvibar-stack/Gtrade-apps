import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, usernameToEmail, isValidUsername } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!error) setProfile(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Check for an existing session on first load (page refresh, or
    //    coming back later on a device that's already logged in).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setCurrentUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      setLoading(false);
    });

    // 2. Keep session in sync going forward — this fires on sign in, sign
    //    out, token refresh, and (importantly for multi-device) when a
    //    revoked session is detected on the next request.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setCurrentUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const register = useCallback(async (username, password) => {
    if (!isValidUsername(username)) {
      return {
        error: {
          message: "Username harus 3-24 karakter, diawali huruf, hanya huruf/angka/underscore.",
        },
      };
    }
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: {
        data: { username },
      },
    });
    if (error) {
      // Postgres unique_violation from the handle_new_user trigger surfaces
      // here as a generic auth error — translate it to something readable.
      const message = /already registered|duplicate key|unique/i.test(error.message)
        ? "Username sudah dipakai. Coba username lain."
        : error.message;
      return { error: { ...error, message } };
    }
    return { data };
  }, []);

  const login = useCallback(async (username, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      const message = /invalid login credentials/i.test(error.message)
        ? "Username atau password salah."
        : error.message;
      return { error: { ...error, message } };
    }
    return { data };
  }, []);

  const loginWithGoogle = useCallback(async () => {
    // Supabase links Google sign-ins by the Google account's own provider
    // ID, so the SAME Google account always resolves to the SAME Supabase
    // user — that's what makes "log in with Google on your phone" land you
    // on the exact same synced account as your laptop, automatically, with
    // no username/password to remember or mistype.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    return { data, error };
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []);

  const value = {
    session,
    currentUser,
    profile,
    loading,
    login,
    loginWithGoogle,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
