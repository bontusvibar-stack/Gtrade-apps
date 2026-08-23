// Supabase Edge Function: revoke-session
//
// Why this exists: the frontend must NEVER hold the service-role key, so it
// cannot force another device's session to end by itself. This function runs
// on Supabase's servers (Deno), holds the service-role key only as a secret
// environment variable, and does the actual revocation on the caller's
// behalf after verifying who is calling.
//
// Deploy with the Supabase CLI:
//   supabase functions deploy revoke-session
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// Supabase for every Edge Function — you do not set them yourself, and they
// are never sent to the browser.
//
// IMPORTANT DESIGN NOTE — read before relying on this:
// Supabase's admin sign-out only revokes at the USER level ("global" = every
// refresh token for that account), there is no per-session revoke. That
// means a true hard revoke of "just this one other device" isn't possible
// without also invalidating the device making the request. So:
//
//   - allDevices=true  -> hard revoke: calls auth.admin.signOut, which ends
//     every session for the account, INCLUDING the device that called this
//     function. That matches what "log out everywhere" should do.
//
//   - deviceId=<id>     -> soft revoke only: flips device_sessions.revoke_
//     requested to true and deletes that row. The target device is
//     listening for this via Realtime (see src/hooks/useDeviceSession.js)
//     and signs ITSELF out the moment it sees the flag — this is instant
//     and reliable whenever that device is online. If that device is
//     completely offline, the sign-out only takes effect once it reconnects
//     (its existing access token keeps working until it naturally expires,
//     since we deliberately do NOT hard-revoke here). This is a genuine
//     limitation of single-device revoke on Supabase's current API surface,
//     not an oversight — see
//     https://supabase.com/docs/reference/javascript/auth-admin-signout

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();

    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { deviceId, allDevices } = body;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (allDevices) {
      const { error } = await admin.auth.admin.signOut(accessToken, "global");
      if (error) throw error;
      await admin.from("device_sessions").delete().eq("user_id", caller.id);
      return new Response(JSON.stringify({ ok: true, mode: "all_devices" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!deviceId) {
      return new Response(JSON.stringify({ error: "deviceId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership check — a user may only revoke their OWN device rows.
    const { data: row, error: rowErr } = await admin
      .from("device_sessions")
      .select("id, user_id")
      .eq("user_id", caller.id)
      .eq("device_id", deviceId)
      .single();

    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Device not found for this account" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Soft revoke only — see the design note above for why this does not
    // also call auth.admin.signOut here.
    await admin.from("device_sessions").update({ revoke_requested: true }).eq("id", row.id);
    // Give the target device a brief window to see the realtime event and
    // sign itself out before we delete the row it's listening on.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await admin.from("device_sessions").delete().eq("id", row.id);

    return new Response(JSON.stringify({ ok: true, mode: "single_device_soft" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
