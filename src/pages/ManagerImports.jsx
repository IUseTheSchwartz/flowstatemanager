import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const LEAD_TYPES = ["FEX", "VET", "IUL", "TRUCKER", "MORTGAGE", "ILC", "FRESH"];

export default function ManagerImports() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState([]);
  const [leadType, setLeadType] = useState("");

  async function loadHistory() {
    const { data } = await supabase
      .from("lead_files")
      .select(
        "id, original_filename, row_count, processed_count, skipped_count, status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(25);
    setHistory(data || []);
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function uploadCsv() {
    setStatus("");
    if (!file) return;
    if (!leadType) {
      setStatus("Please select a Lead Type first.");
      return;
    }

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess?.session?.user?.id;
    if (!userId) {
      setStatus("You must be logged in.");
      return;
    }

    setStatus("Reading…");
    const text = await readFileAsText(file);

    setStatus("Processing…");
    let res;
    try {
      res = await fetch("/.netlify/functions/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_text: text,
          original_filename: file.name,
          user_id: userId,
          default_lead_type: leadType, // 👈 pass selection to function
        }),
      });
    } catch (e) {
      setStatus(`Function call failed: ${e.message}`);
      return;
    }

    let payload;
    try {
      payload = await res.json();
    } catch {
      payload = { error: await res.text().catch(() => "unknown error") };
    }

    if (!res.ok) {
      const detail = payload?.error ? ` — ${payload.error}` : "";
      setStatus(`Error ${res.status} ${res.statusText}${detail}`);
      return;
    }

    setStatus(`Processed: inserted ${payload.inserted}, skipped ${payload.skipped}`);
    setFile(null);
    loadHistory();
  }

  return (
    <section className="mt-6 space-y-6">
      <h2 className="text-xl font-semibold">Imports</h2>

      <div className="card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="block text-sm mb-1 text-white/70">Lead Type</label>
            <select
              className="w-full rounded bg-white/5 border border-white/10 p-2"
              value={leadType}
              onChange={(e) => setLeadType(e.target.value)}
            >
              <option value="">Select a lead type…</option>
              {LEAD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm mb-1 text-white/70">CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            className="btn btn-primary"
            onClick={uploadCsv}
            disabled={!file || !leadType}
            title={!leadType ? "Pick a lead type first" : "Upload & Process"}
          >
            Upload & Process
          </button>
          {status && <div className="text-sm text-white/70">{status}</div>}
        </div>

        <div className="text-xs text-white/50">
          We’ll apply the selected Lead Type to every row (the CSV can still override it with its own
          <code className="mx-1">lead_type</code> column).
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-2">Recent Uploads</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-white/60">
              <tr>
                <th className="text-left p-2">File</th>
                <th className="text-left p-2">Rows</th>
                <th className="text-left p-2">Processed</th>
                <th className="text-left p-2">Skipped</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {(history || []).map((r) => (
                <tr key={r.id} className="border-t border-white/10">
                  <td className="p-2">{r.original_filename}</td>
                  <td className="p-2">{r.row_count}</td>
                  <td className="p-2">{r.processed_count}</td>
                  <td className="p-2">{r.skipped_count}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {!history?.length && (
                <tr>
                  <td colSpan={6} className="p-3 text-white/60">
                    No uploads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = reject;
    fr.readAsText(file);
  });
}
