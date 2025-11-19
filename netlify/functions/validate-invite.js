// File: netlify/functions/validate-invite.js
import { createClient } from "@supabase/supabase-js";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method Not Allowed" });
    }

    const {
      VITE_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE,
      SUPABASE_SERVICE_ROLE_KEY,
    } = process.env;

    const SERVICE_KEY = SUPABASE_SERVICE_ROLE || SUPABASE_SERVICE_ROLE_KEY;
    if (!VITE_SUPABASE_URL || !SERVICE_KEY) {
      return json(500, { error: "Server not configured." });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }

    const { email, code } = body;
    if (!email || !code) {
      return json(400, { error: "Missing email or code." });
    }

    const supa = createClient(VITE_SUPABASE_URL, SERVICE_KEY);

    // Fetch invite
    const { data: inv, error: invErr } = await supa
      .from("invite_codes")
      .select("code, role_on_use, max_uses, uses, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (invErr) return json(500, { error: "Failed to read invite code." });
    if (!inv) return json(400, { error: "Invalid invite code." });

    // Validate common constraints
    const now = new Date();
    const expired = inv.expires_at
      ? new Date(inv.expires_at) <= now
      : false;

    const maxUses =
      Number.isInteger(inv?.max_uses) && inv.max_uses !== null
        ? inv.max_uses
        : null; // null = unlimited

    const current = Number.isInteger(inv?.uses) ? inv.uses : 0;
    const usedUp = maxUses !== null ? current >= maxUses : false;
    const role = (inv.role_on_use || "").toLowerCase();

    if (expired) return json(400, { error: "Invite code has expired." });
    if (!["agent", "manager"].includes(role)) {
      return json(400, { error: "Invite code has no valid role." });
    }
    if (usedUp) {
      return json(400, {
        error: "Invite code has reached its max uses.",
      });
    }

    // Manager allowlist: enforce ONLY if the table has entries; otherwise skip
    if (role === "manager") {
      try {
        const countRes = await supa
          .from("manager_whitelist")
          .select("email", { count: "exact", head: true });

        const hasAny = (countRes?.count ?? 0) > 0;

        if (hasAny) {
          const { data: wl, error: wlErr } = await supa
            .from("manager_whitelist")
            .select("email")
            .ilike("email", email)
            .maybeSingle();

          if (wlErr) {
            return json(500, { error: "Allowlist check failed." });
          }
          if (!wl) {
            return json(403, {
              error: "Not allowlisted for manager role.",
            });
          }
        }
        // if table empty, no enforcement
      } catch (e) {
        // If table missing or other metadata error, skip enforcement
        console.warn("[validate-invite] allowlist skipped:", e?.message || e);
      }
    }

    return json(200, { ok: true, role });
  } catch (e) {
    return json(500, { error: e.message || "Unknown error." });
  }
};
