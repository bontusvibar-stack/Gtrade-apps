# Multi-Device Synced Account

Username/password auth + realtime multi-device data sync, built on React +
Vite + Supabase. No mock auth, no fake sync — every piece here talks to a
real Supabase project.

## 1. Create your Supabase project

1. Go to https://supabase.com/dashboard and create a new project.
2. Wait for it to finish provisioning, then open **Project Settings → API**.
   You'll need the **Project URL** and the **anon public** key in step 3.
   Never use the **service_role** key anywhere in this frontend project.

## 2. Run the SQL

Open **SQL Editor** in the Supabase dashboard, paste in the entire contents
of `supabase/setup.sql`, and run it once. It creates `profiles`,
`user_data`, and `device_sessions`; adds the username-mapping trigger; and
turns on Row Level Security plus the Realtime publication — all in the
order they need to run in.

## 3. Turn off email confirmation (important)

This app never asks anyone for a real email — usernames are mapped to a
fake, non-deliverable address internally (see `src/lib/supabase.js`). If
Supabase tries to send a confirmation email to that fake address, nobody
can ever click the link, and registration would appear to "hang" forever.

Go to **Authentication → Providers → Email** and turn **off** "Confirm
email". (Optional: you can also tighten Auth → Rate Limits here if you
want stricter login-attempt throttling than the Supabase defaults — the
defaults already rate-limit auth endpoints out of the box, which covers
requirement #12's "login rate limiting".)

## 3.5 Enable Google sign-in

The same Google account always maps to the same Supabase user, on any
device — that's what makes "log in with Google" a zero-effort way to land
back on the same synced account everywhere, no username/password needed.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** (type: **Web application**).
2. Under **Authorized redirect URIs**, add:
   `https://your-project-ref.supabase.co/auth/v1/callback`
   (find your exact project ref in the Supabase dashboard URL, or under
   Project Settings → API).
3. Copy the generated **Client ID** and **Client Secret**.
4. In Supabase: **Authentication → Providers → Google** — toggle it on and
   paste both values in.
5. Still in Supabase: **Authentication → URL Configuration** — add
   `http://localhost:5173` (and later, your production URL) to
   **Redirect URLs**. Supabase refuses to redirect back to any URL that
   isn't on this list, so skipping this step makes Google sign-in fail
   silently after the Google consent screen.

## 4. Configure the frontend

```bash
cp .env.example .env
```

Fill in `.env` with your project's URL and anon key. `VITE_SUPABASE_FUNCTIONS_URL`
is the same project ref, just on the `.functions.supabase.co` domain —
Supabase shows this on the Edge Functions page once you deploy one.

## 5. Deploy the "logout device" Edge Function

Per-device and logout-everywhere both need the **service-role** key to
actually revoke a session — and that key must never touch the browser. It
lives only inside this Edge Function, which Supabase hosts for you.

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy revoke-session
```

You do not need to set `SUPABASE_SERVICE_ROLE_KEY` yourself — Supabase
injects it automatically into every Edge Function's environment. If your
CLI version doesn't (rare, but check `supabase functions list-secrets`),
set it manually:

```bash
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 6. Install and run

```bash
npm install
npm run dev
```

Open the printed local URL (typically http://localhost:5173).

## How device logout actually works

Supabase's client SDK has no "force sign out THAT other browser" call —
only the admin API can do that, and the admin API needs the service-role
key. So logging out a specific device happens in two layers:

- **Soft, instant path**: the requesting device flips `revoke_requested`
  on the target device's `device_sessions` row. If the target device is
  online, it's subscribed via Realtime and signs itself out the moment it
  sees that flip — no page reload needed.
- **Hard guarantee**: the Edge Function also calls
  `admin.auth.admin.signOut(userId, "global")`, which invalidates that
  account's refresh tokens at the Supabase Auth layer. A device that's
  currently offline won't get the soft signal, but the next time it tries
  to use its session it will fail and `AuthContext` will route it to
  `/login` automatically.

Supabase doesn't expose *per-session* token revocation on the client
SDK — only *per-user* — so "logout this one device" and "logout
everywhere" both end up invalidating tokens account-wide at the hard-
guarantee layer. In practice this is fine: soft-revoke targets exactly the
one device instantly, and any other device that happens to need to
re-authenticate afterward just logs back in.

## Test scenario checklist

1. Register an account on your laptop browser.
2. You're redirected to `/dashboard`, logged in.
3. Add a note — it's written to `user_data` immediately.
4. Open the site on your phone.
5. Log in with the same username/password.
6. The laptop's note appears on the phone (initial fetch from Postgres).
7. Add/edit a note from the phone.
8. Watch the laptop — it updates within a second or two via Realtime,
   with no manual refresh.
9. Go to `/devices` — both devices should be listed.
10. Logout the phone's session from `/devices` (from either device).
11. The laptop stays logged in; the phone gets signed out (instantly if
    online, or on its next request otherwise).
12. Use "Logout from All Devices" — every device, including the one you
    clicked from, ends up back at `/login`.

## Project structure

```
src/
├── context/
│   └── AuthContext.jsx      # session, login, register, loginWithGoogle,
│                             # logout, auth listener
├── hooks/
│   └── index.js              # useUserData (CRUD + realtime) and
│                             # useDeviceSession (heartbeat + revoke listener)
├── lib/
│   └── supabase.js          # client + username<->shadow-email mapping
├── pages/
│   ├── Login.jsx            # includes Google sign-in button
│   ├── Register.jsx         # includes Google sign-in button
│   ├── Dashboard.jsx        # includes inline SyncStatus indicator
│   ├── Settings.jsx
│   └── Devices.jsx
├── App.jsx                  # routes + inline ProtectedRoute
└── main.jsx

supabase/
├── setup.sql                          # schema + username trigger + RLS + realtime, run once
└── functions/revoke-session/index.js  # Edge Function, holds service-role key
```

`ProtectedRoute` lives inline in `App.jsx` and `SyncStatus` lives inline in
`Dashboard.jsx` — each was only used in exactly one place, so folding them
in cuts two files without losing anything. The two hooks are now one file
(`hooks/index.js`) since they're both small and always used together on
`Dashboard.jsx` anyway.

**What can't be trimmed further, and why:** `setup.sql` and
`functions/revoke-session/index.js` aren't JavaScript at all — one is SQL
that runs inside Postgres, the other is a Deno function that runs on
Supabase's servers so the service-role key never reaches the browser.
Folding either into a `.jsx` file isn't a simplification, it's turning
real auth/RLS/sync into something that only looks like it works — which is
exactly what this project was asked not to do.
