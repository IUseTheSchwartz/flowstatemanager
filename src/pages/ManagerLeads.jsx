
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fmtMDY } from "../lib/dateFmt";

const LEAD_TYPES = ["FEX", "VET", "IUL", "TRUCKER", "MORTGAGE", "ILC", "FRESH"];
const PAGE_SIZE = 200;

export default function ManagerLeads() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignTo, setAssignTo] = useState("");
  const [count, setCount] = useState(10);

  // Filters
  const [stateFilter, setStateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [search, setSearch] = useState("");

  const [statusMsg, setStatusMsg] = useState("");
  const [managerId, setManagerId] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);

  async function load() {
    // Fetch leads in pages so we bypass the 1000-row API cap
    const pageSize = 1000;
    const maxTotal = 10000; // safety cap
    let allLeads = [];
    let from = 0;

    while (allLeads.length < maxTotal) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id,first_name,last_name,phone_e164,email,state,address,military_branch,dob,age,lead_type,beneficiary_name,status,assigned_to,created_at"
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("[ManagerLeads] leads load error:", error);
        break;
      }
      if (!data || data.length === 0) break;

      allLeads = allLeads.concat(data);

      if (data.length < pageSize) break; // reached end
      from += pageSize;
    }

    const { data: agents, error: agentErr } = await supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true });

    if (agentErr) {
      console.error("[ManagerLeads] agents load error:", agentErr);
    }

    setRows(allLeads || []);
    setUsers(agents || []);
  }

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      setManagerId(s?.session?.user?.id || null);
      await load();
    })();
  }, []);

  // Reset to page 1 when filters or total rows change
  useEffect(() => {
    setPage(1);
  }, [stateFilter, typeFilter, onlyUnassigned, search, rows.length]);

  const filtered = useMemo(() => {
    const s = stateFilter.trim().toUpperCase();
    const t = typeFilter.trim().toUpperCase();
    const q = search.trim().toLowerCase();

    return (rows || []).filter((r) => {
      const rowState = String(r.state || "").trim().toUpperCase();
      const rowType = String(r.lead_type || "").trim().toUpperCase();

      if (s && rowState !== s) return false;
      if (t && rowType !== t) return false;

      // "Only unassigned" based on status column
      if (onlyUnassigned && r.status === "assigned") return false;

      if (!q) return true;
      const name = [r.first_name, r.last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        name.includes(q) ||
        (r.phone_e164 || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q)
      );
    });
  }, [rows, stateFilter, typeFilter, onlyUnassigned, search]);

  // Stats (based on current filter)
  const totalFiltered = filtered.length;
  const assignedCount = filtered.reduce(
    (acc, r) => acc + (r.status === "assigned" ? 1 : 0),
    0
  );
  const unassignedCount = totalFiltered - assignedCount;

  // Pagination derived values
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  function goToPage(p) {
    const next = Math.min(Math.max(p, 1), totalPages);
    setPage(next);
  }

  async function quickAssign() {
    setStatusMsg("Assigning…");
    const payload = {
      assign_to_user: assignTo,
      count: Number(count) || 1,
      filters: {
        state: stateFilter || undefined,
        lead_type: typeFilter || undefined,
      },
    };

    const res = await fetch("/.netlify/functions/assign-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatusMsg(j.error || "Failed");
      return;
    }
    setStatusMsg(`Assigned ${j.assigned} leads`);
    await load();
  }

  async function unassignOne(leadId) {
    setStatusMsg("Unassigning…");
    const res = await fetch("/.netlify/functions/unassign-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, manager_user_id: managerId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatusMsg(j.error || "Failed to unassign");
      return;
    }
    setStatusMsg(
      `Unassigned ${j.unassigned} lead${j.unassigned === 1 ? "" : "s"}`
    );
    await load();
  }

  // Delete lead (no confirm)
  async function deleteLead(leadId) {
    setStatusMsg("Deleting…");
    const { error } = await supabase.from("leads").delete().eq("id", leadId);

    if (error) {
      console.error("[ManagerLeads] delete error:", error);
      setStatusMsg("Failed to delete lead");
      return;
    }

    setRows((prev) => prev.filter((l) => l.id !== leadId));
    setStatusMsg("Lead deleted");
  }

  // Simple page number list (1,2,3,4,5...)
  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">All Leads</h2>
        <div className="text-sm text-white/60">
          Showing <span className="font-semibold">{totalFiltered}</span>{" "}
          lead{totalFiltered === 1 ? "" : "s"}
          {typeFilter && (
            <>
              {" "}
              for type <span className="font-semibold">{typeFilter}</span>
            </>
          )}
          {stateFilter && (
            <>
              {" "}
              in <span className="font-semibold">{stateFilter}</span>
            </>
          )}
          {onlyUnassigned && <> (only unassigned)</>}
          {" — "}
          Assigned:{" "}
          <span className="font-semibold">{assignedCount}</span>, Unassigned:{" "}
          <span className="font-semibold">{unassignedCount}</span>
        </div>
        <div className="text-xs text-white/40">
          Page {currentPage} of {totalPages} (showing up to {PAGE_SIZE} leads
          per page)
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4 grid lg:grid-cols-6 md:grid-cols-3 sm:grid-cols-2 gap-3">
        <select
          className="rounded bg-white/5 border border-white/10 p-2"
          value={assignTo}
          onChange={(e) => setAssignTo(e.target.value)}
        >
          <option value="">Assign to…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.email}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={1}
          className="rounded bg-white/5 border border-white/10 p-2"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          placeholder="Count"
        />

        <input
          className="rounded bg-white/5 border border-white/10 p-2"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value.toUpperCase())}
          placeholder="State (e.g., TN)"
          maxLength={2}
        />

        <select
          className="rounded bg-white/5 border border-white/10 p-2"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">Lead Type (any)</option>
          {LEAD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-white/80"
            checked={onlyUnassigned}
            onChange={(e) => setOnlyUnassigned(e.target.checked)}
          />
          Only unassigned
        </label>

        <input
          className="rounded bg-white/5 border border-white/10 p-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name/phone/email"
        />

        <div className="col-span-full flex flex-wrap gap-3 items-center">
          <button
            className="btn btn-primary"
            onClick={quickAssign}
            disabled={!assignTo || !count}
          >
            Quick Assign
          </button>
          <div className="text-sm text-white/60">{statusMsg}</div>

          {/* Pagination controls */}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <button
              className="px-2 py-1 border border-white/10 rounded disabled:opacity-40"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Prev
            </button>
            {pageNumbers.map((p) => (
              <button
                key={p}
                className={`px-2 py-1 border border-white/10 rounded ${
                  p === currentPage ? "bg-white/20" : ""
                }`}
                onClick={() => goToPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="px-2 py-1 border border-white/10 rounded disabled:opacity-40"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-4">
        <table className="w-full text-xs">
          <thead className="text-white/60">
            <tr>
              <th className="text-left px-1 py-1">Name</th>
              <th className="text-left px-1 py-1">Phone</th>
              <th className="text-left px-1 py-1">Email</th>
              <th className="text-left px-1 py-1">State</th>
              <th className="text-left px-1 py-1">Address</th>
              <th className="text-left px-1 py-1">Lead Type</th>
              <th className="text-left px-1 py-1">Military</th>
              <th className="text-left px-1 py-1">DOB</th>
              <th className="text-left px-1 py-1">Age</th>
              <th className="text-left px-1 py-1">Beneficiary</th>
              <th className="text-left px-1 py-1">Status</th>
              <th className="text-left px-1 py-1">Assigned To</th>
              <th className="text-left px-1 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((l) => (
              <tr key={l.id} className="border-t border-white/10">
                <td className="px-1 py-1">
                  {[l.first_name, l.last_name].filter(Boolean).join(" ") ||
                    "—"}
                </td>
                <td className="px-1 py-1">{l.phone_e164 || "—"}</td>
                <td className="px-1 py-1">{l.email || "—"}</td>
                <td className="px-1 py-1">{l.state || "—"}</td>
                <td className="px-1 py-1">{l.address || "—"}</td>
                <td className="px-1 py-1">{l.lead_type || "—"}</td>
                <td className="px-1 py-1">{l.military_branch || "—"}</td>
                <td className="px-1 py-1">{fmtMDY(l.dob)}</td>
                <td className="px-1 py-1">
                  {(l.age ?? "") !== "" ? l.age : "—"}
                </td>
                <td className="px-1 py-1">
                  {l.beneficiary_name || "—"}
                </td>
                <td className="px-1 py-1 capitalize">
                  {l.status.replaceAll("_", " ")}
                </td>
                <td className="px-1 py-1">
                  {(() => {
                    if (!l.assigned_to) return "Unassigned";
                    const u = users.find((u) => u.id === l.assigned_to);
                    if (!u) return "—";
                    return u.full_name || u.email || "—";
                  })()}
                </td>
                <td className="px-1 py-1">
                  <div className="flex gap-2">
                    {l.assigned_to ? (
                      <button
                        className="btn text-[10px]"
                        onClick={() => unassignOne(l.id)}
                      >
                        Unassign
                      </button>
                    ) : (
                      <span className="text-white/40 text-[10px]">—</span>
                    )}
                    <button
                      className="btn text-[10px] bg-red-600/80 hover:bg-red-600"
                      onClick={() => deleteLead(l.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td className="p-3 text-white/60" colSpan={13}>
                  No leads.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
