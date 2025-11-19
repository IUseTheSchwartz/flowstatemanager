// File: src/pages/Leads.jsx (Agent view)
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fmtMDY } from "../lib/dateFmt";

const STATUS_COLORS = {
  sold: "bg-green-900/30",
  no_pickup: "bg-yellow-900/30",
  appointment: "bg-purple-900/30",
  do_not_call: "bg-red-900/30",
};

export default function Leads() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [activeLead, setActiveLead] = useState(null);
  const [userId, setUserId] = useState(null);

  async function loadForUser(uid) {
    if (!uid) { setRows([]); return; }

    // 1) currently assigned to me
    const cur = await supabase
      .from("leads")
      .select("id, assigned_to, created_at")
      .eq("assigned_to", uid);
    const ids = new Set((cur.data || []).map(r => r.id));

    // 2) historically assigned to me (via lead_assignments)
    const hist = await supabase
      .from("lead_assignments")
      .select("lead_id")
      .eq("user_id", uid)
      .limit(2000);
    (hist.data || []).forEach(r => ids.add(r.lead_id));

    if (!ids.size) { setRows([]); return; }

    // fetch details
    const list = Array.from(ids);
    const batched = [];
    const chunk = 500;
    for (let i = 0; i < list.length; i += chunk) {
      const slice = list.slice(i, i + chunk);
      const res = await supabase
        .from("leads")
        .select("id, first_name, last_name, phone_e164, email, state, address, military_branch, dob, age, lead_type, beneficiary_name, assigned_to, created_at")
        .in("id", slice);
      if (!res.error) batched.push(...(res.data || []));
    }

    // 3) fetch my per-user meta (status/DNC) for these leads
    let metaMap = new Map();
    for (let i = 0; i < list.length; i += chunk) {
      const slice = list.slice(i, i + chunk);
      const metaRes = await supabase
        .from("lead_user_meta")
        .select("lead_id, status, do_not_call")
        .eq("user_id", uid)
        .in("lead_id", slice);
      if (!metaRes.error) {
        (metaRes.data || []).forEach(m => {
          metaMap.set(m.lead_id, { my_status: m.status || null, my_dnc: !!m.do_not_call });
        });
      }
    }

    // merge into rows
    const merged = batched.map(r => {
      const meta = metaMap.get(r.id) || {};
      return { ...r, my_status: meta.my_status || null, my_dnc: !!meta.my_dnc };
    });

    // sort: currently assigned first, then newest
    merged.sort((a, b) => {
      const aCur = a.assigned_to === uid ? 0 : 1;
      const bCur = b.assigned_to === uid ? 0 : 1;
      if (aCur !== bCur) return aCur - bCur;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    setRows(merged);
  }

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id || null;
      setUserId(uid);
      await loadForUser(uid);

      if (!uid) return;
      // realtime refresh when my current assignments change
      const ch = supabase
        .channel("leads-my-assignments")
        .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `assigned_to=eq.${uid}` }, () => loadForUser(uid))
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    })();
  }, []);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").toLowerCase();
      return name.includes(f) ||
        (r.phone_e164 || "").includes(f) ||
        (r.email || "").toLowerCase().includes(f) ||
        (r.state || "").toLowerCase().includes(f) ||
        (r.lead_type || "").toLowerCase().includes(f) ||
        (r.beneficiary_name || "").toLowerCase().includes(f);
    });
  }, [rows, filter]);

  // per-user status setter
  async function setMyStatus(leadId, status) {
    if (!userId) return;
    const { error } = await supabase
      .from("lead_user_meta")
      .upsert({ lead_id: leadId, user_id: userId, status, updated_at: new Date().toISOString() });
    if (!error) {
      setRows(prev => prev.map(r => r.id === leadId ? { ...r, my_status: status, my_dnc: status === "do_not_call" ? true : r.my_dnc } : r));
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">My Leads</h2>
        <input
          className="ml-auto w-72 p-2 rounded bg-white/5 border border-white/10 text-sm"
          placeholder="Search name / phone / email / state / type / beneficiary"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Phone</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">State</th>
              <th className="text-left p-3">Address</th>
              <th className="text-left p-3">Military</th>
              <th className="text-left p-3">DOB</th>
              <th className="text-left p-3">Age</th>
              <th className="text-left p-3">Lead Type</th>
              <th className="text-left p-3">Beneficiary</th>
              <th className="text-left p-3">My Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const key = l.my_status || (l.assigned_to ? null : "unassigned");
              const rowClass = key && STATUS_COLORS[key] ? STATUS_COLORS[key] : (l.assigned_to ? "" : "opacity-80");
              return (
                <tr key={l.id} className={`border-t border-white/10 ${rowClass}`}>
                  <td className="p-3">{[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td className="p-3">{l.phone_e164 || "—"}</td>
                  <td className="p-3">{l.email || "—"}</td>
                  <td className="p-3">{l.state || "—"}</td>
                  <td className="p-3">{l.address || "—"}</td>
                  <td className="p-3">{l.military_branch || "—"}</td>
                  <td className="p-3">{fmtMDY(l.dob)}</td>
                  <td className="p-3">{(l.age ?? "") !== "" ? l.age : "—"}</td>
                  <td className="p-3">{l.lead_type || "—"}</td>
                  <td className="p-3">{l.beneficiary_name || "—"}</td>
                  <td className="p-3 capitalize">
                    {(l.my_status || "—").replaceAll("_", " ")}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn text-xs" onClick={() => setMyStatus(l.id, "sold")}>Sold</button>
                      <button className="btn text-xs" onClick={() => setMyStatus(l.id, "no_pickup")}>No pickup</button>
                      <button className="btn text-xs" onClick={() => setMyStatus(l.id, "appointment")}>Appointment</button>
                      <button className="btn text-xs" onClick={() => setMyStatus(l.id, "do_not_call")}>Don’t call</button>
                      <button className="btn text-xs" onClick={() => setActiveLead(l)}>Notes</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td className="p-4 text-white/50" colSpan={12}>No leads yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {activeLead && <NotesDrawer lead={activeLead} userId={userId} onClose={() => setActiveLead(null)} />}
    </div>
  );
}

function NotesDrawer({ lead, userId, onClose }) {
  const [items, setItems] = useState([]);
  const [body, setBody] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lead_notes")
        .select("id, body, author_id, created_at")
        .eq("lead_id", lead.id)
        .eq("author_id", userId) // private notes (only mine)
        .order("created_at", { ascending: false });
      setItems(data || []);
    })();
  }, [lead.id, userId]);

  async function addNote() {
    if (!body.trim() || !userId) return;
    const ins = await supabase
      .from("lead_notes")
      .insert({ lead_id: lead.id, author_id: userId, body: body.trim() })
      .select("id, body, author_id, created_at")
      .single();
    if (!ins.error) {
      setItems((prev) => [ins.data, ...prev]);
      setBody("");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex">
      <div className="ml-auto w-full max-w-md h-full bg-[#0b0b0c] border-l border-white/10 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            Notes — {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.phone_e164}
          </h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <input
            className="flex-1 p-2 rounded bg-white/5 border border-white/10"
            placeholder="Add a note…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
          />
          <button className="btn btn-primary" onClick={addNote}>Add</button>
        </div>
        <div className="overflow-y-auto space-y-2">
          {items.map((n) => (
            <div key={n.id} className="p-2 border border-white/10 rounded">
              <div className="text-xs text-white/50">{new Date(n.created_at).toLocaleString()}</div>
              <div className="text-sm">{n.body}</div>
            </div>
          ))}
          {!items.length && <div className="text-white/60 text-sm">No notes yet.</div>}
        </div>
      </div>
    </div>
  );
}
