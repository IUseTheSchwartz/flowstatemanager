// File: netlify/functions/create-invite.js
import { createClient } from "@supabase/supabase-js";

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
    const supa = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const user = event.headers["x-user-id"]; // pass auth.uid from client
    if (!user) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    // Verify caller is manager
    const { data: me, error: meErr } = await supa
      .from("user_profiles")
      .select("role")
      .eq("id", user)
      .single();

    if (meErr || !me || me.role !== "manager") {
      return { statusCode: 403, body: "Forbidden" };
    }

    const payload = JSON.parse(event.body || "{}");

    const code =
      payload.code ||
      Math.random().toString(36).slice(2, 10).toUpperCase();

    const insert = {
      code,
      created_by: user,
      role_on_use: payload.role_on_use || "agent",
      max_uses: payload.max_uses ?? 1,
      expires_at: payload.expires_at || null,
      note: payload.note || null,
    };

    const { error } = await supa.from("invite_codes").insert(insert);
    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, code }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(e) }),
    };
  }
};
