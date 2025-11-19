import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ManagerDashboard() {
  const [pool, setPool] = useState({ total: 0, unassigned: 0, assigned: 0 });
  const [code, setCode] = useState("");
  const [roleOnUse, setRoleOnUse] = useState("agent");
  const [maxUses, setMaxUses] = useState(10);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const [{ count: total }, { count: unassigned }, { count: assigned }] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }).is("assigned_to", null),
        supabase.from("leads").select("*", { count: "exact", head: true }).not("assigned_to", "is", null),
      ]);
      setPool({ total: total || 0, unassigned: unassigned || 0, assigned: assigned || 0 });
    })();
  }, []);

  async function createInvite(e) {
    e.preventDefault();
    setMsg("");
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    const res = await fetch("/.netlify/functions/create-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": userId || "" },
      body: JSON.stringify({
        code: code.trim() || undefined,
        role_on_use: roleOnUse,
        max_uses: Number(maxUses) || 1,
        note: "created from ManagerDashboard",
      }),
    });
    if (!res.ok) {
      setMsg("Error creating code");
      return;
    }
    const j = await res.json();
    setMsg(`Invite created: ${j.code}`);
    if (!code) setCode(j.code);
  }

  return (
    <section className="mt-6 space-y-6">
      <h2 className="text-xl font-semibold">Manager Dashboard</h2>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-sm text-white/60">Total Leads</div>
          <div className="text-2xl font-semibold">{pool.total}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-white/60">Unassigned</div>
          <div className="text-2xl font-semibold">{pool.unassigned}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-white/60">Assigned</div>
          <div className="text-2xl font-semibold">{pool.assigned}</div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Create Invite Code</h3>
        <form onSubmit={createInvite} className="grid sm:grid-cols-4 gap-3">
          <input className="rounded bg-white/5 border border-white/10 p-2" placeholder="Custom code (optional)" value={code} onChange={e=>setCode(e.target.value)} />
          <select className="rounded bg-white/5 border border-white/10 p-2" value={roleOnUse} onChange={e=>setRoleOnUse(e.target.value)}>
            <option value="agent">agent</option>
            <option value="manager">manager</option>
          </select>
          <input type="number" min={1} className="rounded bg-white/5 border border-white/10 p-2" placeholder="Max uses" value={maxUses} onChange={e=>setMaxUses(e.target.value)} />
          <button className="btn btn-primary">Create</button>
        </form>
        {msg && <div className="text-sm text-white/70 mt-2">{msg}</div>}
      </div>
    </section>
  );
}
