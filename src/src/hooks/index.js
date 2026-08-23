import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// ============================================================================
// useUserData — generic hook for one "data_type" slice of public.user_data,
// kept in sync across every device the person is signed in on via Supabase
// Realtime.
//
// status: "offline" | "syncing" | "synced" | "error"
// ============================================================================
export function useUserData(dataType) {
  const { currentUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("syncing");

  const fetchRows = useCallback(async () => {
    if (!currentUser) return;
    setStatus("syncing");
    const { data, error } = await supabase
      .from("user_data")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("data_type", dataType)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus("error");
      return;
    }
    setRows(data);
    setStatus("synced");
  }, [currentUser, dataType]);

  useEffect(() => {
    if (!currentUser) {
      setRows([]);
      return;
    }
    if (!navigator.onLine) {
      setStatus("offline");
    }

    fetchRows();

    const channel = supabase
      .channel(`user-data-sync-${dataType}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_data",
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (payload.new && payload.new.data_type !== dataType && payload.old?.data_type !== dataType) {
            return;
          }
          setStatus("synced");
          setRows((prev) => {
            if (payload.eventType === "INSERT") {
              if (prev.some((r) => r.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((r) => (r.id === payload.new.id ? payload.new : r));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== payload.old.id);
            }
            return prev;
          });
        }
      )
      .subscribe((subStatus) => {
        if (subStatus === "SUBSCRIBED") setStatus("synced");
        if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") setStatus("error");
      });

    const goOffline = () => setStatus("offline");
    const goOnline = () => fetchRows();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [currentUser, dataType, fetchRows]);

  const addRow = useCallback(
    async (data) => {
      if (!currentUser) return { error: { message: "Not signed in" } };
      setStatus("syncing");
      const { data: inserted, error } = await supabase
        .from("user_data")
        .insert({ user_id: currentUser.id, data_type: dataType, data })
        .select()
        .single();
      setStatus(error ? "error" : "synced");
      return { data: inserted, error };
    },
    [currentUser, dataType]
  );

  const updateRow = useCallback(async (id, data) => {
    setStatus("syncing");
    const { data: updated, error } = await supabase.from("user_data").update({ data }).eq("id", id).select().single();
    setStatus(error ? "error" : "synced");
    return { data: updated, error };
  }, []);

  const deleteRow = useCallback(async (id) => {
    setStatus("syncing");
    const { error } = await supabase.from("user_data").delete().eq("id", id);
    setStatus(error ? "error" : "synced");
    return { error };
  }, []);

  return { rows, status, addRow, updateRow, deleteRow, refetch: fetchRows };
}

// ============================================================================
// useDeviceSession — registers/heartbeats this browser's row in
// device_sessions, and listens via Realtime for another device flipping
// "revoke_requested" on THIS device's own row (the cooperative half of
// remote logout; supabase/functions/revoke-session/index.js is the other,
// hard-revoke half).
// ============================================================================
const DEVICE_ID_KEY = "mds_device_id";
const HEARTBEAT_MS = 60_000;

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function detectDeviceName(ua) {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android.*Mobile/i.test(ua)) return "Android Phone";
  if (/Android/i.test(ua)) return "Android Tablet";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux PC";
  return "Unknown Device";
}

function detectBrowser(ua) {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  return "Browser";
}

export function getDeviceId() {
  return getOrCreateDeviceId();
}

export function useDeviceSession() {
  const { currentUser, logout } = useAuth();
  const deviceIdRef = useRef(getOrCreateDeviceId());

  useEffect(() => {
    if (!currentUser) return;

    const deviceId = deviceIdRef.current;
    const ua = navigator.userAgent;

    const upsertSession = async () => {
      await supabase.from("device_sessions").upsert(
        {
          user_id: currentUser.id,
          device_id: deviceId,
          device_name: detectDeviceName(ua),
          browser: detectBrowser(ua),
          last_active: new Date().toISOString(),
          revoke_requested: false,
        },
        { onConflict: "user_id,device_id" }
      );
    };

    upsertSession();
    const heartbeat = setInterval(upsertSession, HEARTBEAT_MS);

    const channel = supabase
      .channel(`device-revoke-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "device_sessions",
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (payload.new.device_id === deviceId && payload.new.revoke_requested) {
            logout();
          }
        }
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") upsertSession();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(heartbeat);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentUser, logout]);
}
