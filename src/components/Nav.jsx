// File: src/components/Nav.jsx
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Nav() {
  const [role, setRole] = useState(null);
  const [authed, setAuthed] = useState(false);
  const loc = useLocation();

  const HIDE_LINKS_PATHS = new Set(["/", "/login", "/signup"]);
  const hideLinks = HIDE_LINKS_PATHS.has(loc.pathname);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: s, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) console.warn("[Nav] getSession error:", sessErr);
      const user = s?.session?.user || null;

      if (!mounted) return;
      setAuthed(!!user);

      if (!user) {
        setRole(null);
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.warn("[Nav] user_profiles read error:", error);
        setRole(null);
        return;
      }

      setRole((data?.role || "").toLowerCase());
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
      load();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="max-w-6xl mx-auto flex items-center justify-between p-3">
        <Link to="/" className="flex items-center gap-3">
          {/* 👇 Make sure you have this file in /public as /flow-state-logo.png */}
          <img
            src="/flow-state-logo.png"
            alt="Flow State Financial"
            className="h-8 w-auto"
          />
          <span className="font-semibold">Flow State Financial Manager</span>
        </Link>

        {!hideLinks && (
          <nav className="flex gap-4 text-sm items-center">
            {authed && (
              <>
                <Link to="/leads">Leads</Link>
                <Link to="/trades">Trade Center</Link>
              </>
            )}

            {authed && role === "manager" && (
              <>
                <Link to="/manager">Manager</Link>
                <Link to="/manager/imports">Imports</Link>
                <Link to="/manager/leads">All Leads</Link>
                <Link to="/manager/invites">Invites</Link>
                {/* If you don't have /manager/members, just leave it out */}
              </>
            )}

            {!authed && (
              <>
                <Link to="/login">Login</Link>
                <Link to="/signup">Sign up with code</Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
