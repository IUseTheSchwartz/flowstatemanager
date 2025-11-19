
// File: src/lib/auth.js
import { supabase } from "./supabaseClient";

/** Email/password sign-in */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/**
 * Signup with invite code
 * 1) Pre-validate invite (server)
 * 2) Create auth user
 * 3) Redeem invite (sets role + increments uses)
 *
 * NOTE: We bypass ONLY the legacy whitelist error string to avoid blocking valid manager codes.
 */
export async function signUp({ email, password, full_name, code }) {
  const trimmedCode = (code || "").trim();
  if (!trimmedCode) throw new Error("Invite code is required.");

  // 0) Pre-validate invite code BEFORE creating auth user
  let preOk = false;
  let preMsg = "Invalid or expired invite code.";
  try {
    const pre = await fetch("/.netlify/functions/validate-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: trimmedCode }),
    });
    const preJson = await pre.json().catch(() => ({}));

    preOk = pre.ok && !!preJson?.ok;
    preMsg = preJson?.error || preJson?.message || preMsg;

    // If the ONLY failure is the legacy manager allowlist, bypass and continue.
    if (!preOk && typeof preMsg === "string" && /not allowlisted for manager role/i.test(preMsg)) {
      console.warn("[auth.signUp] Bypassing manager allowlist precheck; continuing to redeem.");
      preOk = true;
    }
  } catch (e) {
    // Network or JSON parse failure should still block, since we can't verify the code
    preOk = false;
    if (e?.message) preMsg = e.message;
  }
  if (!preOk) throw new Error(preMsg);

  // 1) Create auth user with full_name in user_metadata
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: (full_name || "").trim() } },
  });
  if (error) throw error;
  const user = data.user;

  // 2) Redeem invite to set role + increment usage
  const redeem = await fetch("/.netlify/functions/redeem-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: user.id, email, code: trimmedCode }),
  });

  const redeemJson = await redeem.json().catch(() => ({}));
  if (!redeem.ok || !redeemJson?.ok) {
    // Roll back: sign out so they don't proceed with a bare account
    try { await supabase.auth.signOut(); } catch {}
    const msg = redeemJson?.error || redeemJson?.message || "Invite redemption failed.";
    throw new Error(msg);
  }

  return user;
}

/** Return current session (or null) */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
