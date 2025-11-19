// File: netlify/functions/unassign-lead.js
import { createClient } from "@supabase/supabase-js";

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

    const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    const SERVICE_KEY = SUPABASE_SERVICE_ROLE || SUPABASE_SERVICE_ROLE_KEY;
    if (!VITE_SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing env" });

    const supa = createClient(VITE_SUPABASE_URL, SERVICE_KEY);

    // Accept single or batch; optional manager_user_id for audit
    const { lead_id, lead_ids, manager_user_id = null } = JSON.parse(event.body || "{}");

    let ids = [];
    if (Array.isArray(lead_ids) && lead_ids.length) ids = lead_ids.filter(Boolean);
    else if (lead_id) ids = [lead_id];

    if (!ids.length) return json(400, { error: "lead_id or lead_ids required" });

    // Read current assignment for feedback
    const { data: before, error: selErr } = await supa
      .from("leads")
      .select("id, assigned_to, assigned_at")
      .in("id", ids);
    if (selErr) return json(500, { error: `select: ${selErr.message}` });

    // Unassign: clear assignment only (do NOT touch status)
    const { error: upErr } = await supa
      .from("leads")
      .update({ assigned_to: null, assigned_at: null })
      .in("id", ids);
    if (upErr) return json(500, { error: `update: ${upErr.message}` });

    // Best-effort audit
    try {
      await Promise.all(
        ids.map((id) =>
          supa.rpc("log_assignment", {
            p_lead: id,
            p_user: manager_user_id,
            p_reason: "manager-unassign",
          })
        )
      );
    } catch {}

    const previouslyAssigned = (before || []).filter((r) => !!r.assigned_to).map((r) => r.id);

    return json(200, {
      ok: true,
      ids,
      unassigned: ids.length,
      previously_assigned_count: previouslyAssigned.length,
    });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};
