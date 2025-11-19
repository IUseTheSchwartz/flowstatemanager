import { Outlet, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function RoleGate({ role = "manager" }) {
  const [ok, setOk] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) console.warn("[RoleGate] getSession error:", sessErr);
        const user = sessionData?.session?.user;
        const userId = user?.id;
        const email = user?.email;

        if (!userId || !email) {
          if (mounted) { setOk(false); setReady(true); }
          return;
        }

        // 1) Check DB role
        const { data: profile, error: profErr } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        if (profErr) console.warn("[RoleGate] user_profiles read error:", profErr);

        const desired = String(role).trim().toLowerCase();
        const dbRole = String(profile?.role || "").trim().toLowerCase();
        let allowed = dbRole === desired;

        // 2) Fallback: email present in manager_whitelist
        if (!allowed) {
          const { data: wl, error: wlErr } = await supabase
            .from("manager_whitelist")
            .select("email")
            .ilike("email", email)
            .maybeSingle();

          if (wlErr) console.warn("[RoleGate] whitelist read error:", wlErr);
          if (wl?.email) allowed = true;
        }

        if (mounted) {
          setOk(allowed);
          setReady(true);
        }
      } catch (e) {
        console.error("[RoleGate] unexpected error:", e);
        if (mounted) {
          setOk(false);
          setReady(true);
        }
      }
    })();

    return () => { mounted = false; };
  }, [role]);

  if (!ready) return null;
  return ok ? <Outlet /> : <Navigate to="/leads" replace />;
}
