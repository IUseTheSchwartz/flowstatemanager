// File: netlify/functions/assign-leads.js
import { createClient } from "@supabase/supabase-js";

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

    const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
    if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return json(500, { error: "Missing env" });
    }

    const supa = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { assign_to_user, count = 10, filters = {} } = JSON.parse(event.body || "{}");
    if (!assign_to_user) return json(400, { error: "assign_to_user required" });

    const want = Math.max(1, Number(count) || 1);
    const fetchLimit = Math.min(1000, want * 10); // fetch a decent slab; we'll shuffle in JS

    // 1) Get a slab of UNASSIGNED leads with optional filters (no DB-side random)
    let poolQ = supa
      .from("leads")
      .select("id, state, lead_type, assigned_to, status")
      .is("assigned_to", null)
      .neq("status", "sold") // don't pick sold
      .limit(fetchLimit);

    if (filters.state) poolQ = poolQ.eq("state", filters.state);
    if (filters.lead_type) poolQ = poolQ.eq("lead_type", filters.lead_type);

    const { data: pool, error: poolErr } = await poolQ;
    if (poolErr) return json(500, { error: `pool: ${poolErr.message}` });

    const poolIds = (pool || []).map((r) => r.id);
    if (!poolIds.length) return json(200, { assigned: 0 });

    // 2) Build a set of IDs that HAVE EVER been assigned (from history)
    const { data: hist, error: histErr } = await supa
      .from("lead_assignments")
      .select("lead_id")
      .limit(100000);
    if (histErr) return json(500, { error: `history: ${histErr.message}` });

    const everAssigned = new Set((hist || []).map((h) => h.lead_id));

    // 3) Split into never-assigned vs previously-assigned
    const neverAssigned = [];
    const previouslyAssigned = [];
    for (const id of poolIds) {
      if (everAssigned.has(id)) previouslyAssigned.push(id);
      else neverAssigned.push(id);
    }

    // 4) Randomize within groups (JS shuffle)
    shuffle(neverAssigned);
    shuffle(previouslyAssigned);

    // 5) Pick N, preferring never-assigned
    const chosen = [];
    for (const id of neverAssigned) {
      if (chosen.length >= want) break;
      chosen.push(id);
    }
    if (chosen.length < want) {
      for (const id of previouslyAssigned) {
        if (chosen.length >= want) break;
        chosen.push(id);
      }
    }

    if (!chosen.length) return json(200, { assigned: 0 });

    // 6) Assign them
    const nowISO = new Date().toISOString();
    const { error: upErr } = await supa
      .from("leads")
      .update({ assigned_to: assign_to_user, assigned_at: nowISO, status: "assigned" })
      .in("id", chosen);
    if (upErr) return json(500, { error: `update: ${upErr.message}` });

    // 7) Audit (history log)
    await Promise.all(
      chosen.map((id) =>
        supa.rpc("log_assignment", {
          p_lead: id,
          p_user: assign_to_user,
          p_reason: "manager-assign",
        })
      )
    );

    return json(200, {
      assigned: chosen.length,
      requested: want,
      picked_from: {
        never_assigned: Math.min(neverAssigned.length, want),
        previously_assigned: Math.max(
          0,
          chosen.length - Math.min(neverAssigned.length, want)
        ),
      },
      filters,
    });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};
