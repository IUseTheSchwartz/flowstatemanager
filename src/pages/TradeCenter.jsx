import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fmtMDY } from "../lib/dateFmt";

export default function TradeCenter() {
  const [userId, setUserId] = useState(null);
  const [users, setUsers] = useState([]);
  const [myLeads, setMyLeads] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");

  // form for creating a trade
  const [offerLeadId, setOfferLeadId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [note, setNote] = useState("");

  // --------- helper: load "my leads" like AgentLeads does ----------
  async function loadMyLeadsForUser(uid) {
    if (!uid) return [];

    // 1) currently assigned to me
    const cur = await supabase
      .from("leads")
      .select("id, assigned_to, created_at")
      .eq("assigned_to", uid);
    const ids = new Set((cur.data || []).map((r) => r.id));

    // 2) historically assigned via lead_assignments
    const hist = await supabase
      .from("lead_assignments")
      .select("lead_id")
      .eq("user_id", uid)
      .limit(2000);
    (hist.data || []).forEach((r) => ids.add(r.lead_id));

    if (!ids.size) return [];

    // 3) fetch details for those IDs
    const list = Array.from(ids);
    const results = [];
    const chunkSize = 500;

    for (let i = 0; i < list.length; i += chunkSize) {
      const slice = list.slice(i, i + chunkSize);
      const res = await supabase
        .from("leads")
        .select("id, first_name, last_name, state, lead_type, created_at")
        .in("id", slice);
      if (!res.error && res.data) {
        results.push(...res.data);
      }
    }

    // optional: sort newest first
    results.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    return results;
  }

  async function loadAll(uid) {
    setLoading(true);
    try {
      // users + trades
      const [usersRes, incomingRes, outgoingRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("id, full_name, email")
          .order("full_name", { ascending: true }),

        supabase
          .from("lead_trades")
          .select(`
            id,
            from_user_id,
            to_user_id,
            offer_lead_id,
            request_lead_id,
            note,
            status,
            created_at,
            resolved_at,
            from_profile:from_user_id (full_name, email),
            offer_lead:offer_lead_id (first_name, last_name, state, lead_type)
          `)
          .eq("to_user_id", uid)
          .order("created_at", { ascending: false })
          .limit(100),

        supabase
          .from("lead_trades")
          .select(`
            id,
            from_user_id,
            to_user_id,
            offer_lead_id,
            request_lead_id,
            note,
            status,
            created_at,
            resolved_at,
            to_profile:to_user_id (full_name, email),
            offer_lead:offer_lead_id (first_name, last_name, state, lead_type),
            request_lead:request_lead_id (first_name, last_name, state, lead_type)
          `)
          .eq("from_user_id", uid)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (usersRes.error) console.error("users load error:", usersRes.error);
      if (incomingRes.error)
        console.error("incoming trades load error:", incomingRes.error);
      if (outgoingRes.error)
        console.error("outgoing trades load error:", outgoingRes.error);

      const myLeadsLoaded = await loadMyLeadsForUser(uid);

      setUsers(usersRes.data || []);
      setMyLeads(myLeadsLoaded || []);
      setIncoming(incomingRes.data || []);
      setOutgoing(outgoingRes.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id || null;
      setUserId(uid);
      if (uid) {
        await loadAll(uid);
      } else {
        setLoading(false);
      }
    })();
  }, []);

  const otherUsers = useMemo(
    () => users.filter((u) => u.id !== userId),
    [users, userId]
  );

  const myLeadsOptions = useMemo(
    () =>
      myLeads.map((l) => ({
        id: l.id,
        label: `${[l.first_name, l.last_name]
          .filter(Boolean)
          .join(" ") || "No name"} — ${l.lead_type || "Unknown type"}${
          l.state ? " — " + l.state : ""
        }`,
      })),
    [myLeads]
  );

  async function createTrade(e) {
    e.preventDefault();
    if (!userId || !offerLeadId || !targetUserId) return;
    setStatusMsg("Creating trade…");

    const { error } = await supabase.from("lead_trades").insert({
      from_user_id: userId,
      to_user_id: targetUserId,
      offer_lead_id: offerLeadId,
      note: note || null,
    });

    if (error) {
      console.error("createTrade error:", error);
      setStatusMsg("Failed to create trade");
    } else {
      setStatusMsg("Trade request sent");
      setOfferLeadId("");
      setTargetUserId("");
      setNote("");
      await loadAll(userId);
    }
  }

  async function declineTrade(tradeId) {
    if (!userId) return;
    setStatusMsg("Declining trade…");
    const { error } = await supabase
      .from("lead_trades")
      .update({
        status: "declined",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", tradeId)
      .eq("to_user_id", userId)
      .eq("status", "pending");

    if (error) {
      console.error("declineTrade error:", error);
      setStatusMsg("Failed to decline trade");
    } else {
      setStatusMsg("Trade declined");
      await loadAll(userId);
    }
  }

  async function acceptTrade(trade, selectedLeadId) {
    if (!userId || !selectedLeadId) return;
    setStatusMsg("Accepting trade…");

    const now = new Date().toISOString();

    // 1) Mark trade accepted + save which lead you’re sending back
    const { error: updErr } = await supabase
      .from("lead_trades")
      .update({
        status: "accepted",
        request_lead_id: selectedLeadId,
        resolved_at: now,
      })
      .eq("id", trade.id)
      .eq("to_user_id", userId)
      .eq("status", "pending");

    if (updErr) {
      console.error("acceptTrade update error:", updErr);
      setStatusMsg("Failed to accept trade");
      return;
    }

    // 2) Give both agents each other’s leads via lead_assignments
    //    (both keep their original leads; both get an extra).
    const assignments = [
      {
        lead_id: trade.offer_lead_id,
        user_id: userId,
        assigned_at: now,
      },
      {
        lead_id: selectedLeadId,
        user_id: trade.from_user_id,
        assigned_at: now,
      },
    ];

    const { error: assignErr } = await supabase
      .from("lead_assignments")
      .insert(assignments);

    if (assignErr) {
      console.error("acceptTrade lead_assignments error:", assignErr);
      setStatusMsg("Trade accepted, but failed to share leads");
      await loadAll(userId);
      return;
    }

    setStatusMsg("Trade accepted");
    await loadAll(userId);
  }

  if (!userId && !loading) {
    return (
      <section className="mt-6">
        <h2 className="text-xl font-semibold">Trade Center</h2>
        <p className="text-sm text-white/60 mt-2">
          You need to be logged in to use the Trade Center.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Trade Center</h2>
        {loading && (
          <span className="text-xs text-white/60">Loading…</span>
        )}
        {statusMsg && !loading && (
          <span className="text-xs text-white/60">{statusMsg}</span>
        )}
      </div>

      {/* Create Trade */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Start a Trade</h3>
        <form
          className="grid sm:grid-cols-3 gap-3 text-sm"
          onSubmit={createTrade}
        >
          <select
            className="rounded bg-white/5 border border-white/10 p-2"
            value={offerLeadId}
            onChange={(e) => setOfferLeadId(e.target.value)}
          >
            <option value="">Select one of your leads…</option>
            {myLeadsOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>

          <select
            className="rounded bg-white/5 border border-white/10 p-2"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
          >
            <option value="">Select agent to trade with…</option>
            {otherUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>

          <input
            className="rounded bg-white/5 border border-white/10 p-2 sm:col-span-2"
            placeholder='Note (e.g. "give me a Hawaii lead")'
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="sm:col-span-1 flex items-center">
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={!offerLeadId || !targetUserId}
            >
              Send Trade Request
            </button>
          </div>
        </form>
      </div>

      {/* Incoming Trades */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Incoming Requests</h3>
        {incoming.length === 0 && (
          <p className="text-xs text-white/60">No incoming trades.</p>
        )}
        <div className="space-y-3">
          {incoming.map((t) => {
            const fromName =
              t.from_profile?.full_name || t.from_profile?.email || "Unknown";
            const offer = t.offer_lead || {};
            const offerName =
              [offer.first_name, offer.last_name]
                .filter(Boolean)
                .join(" ") || "No name";
            const offerShortName = `${offer.first_name || ""} ${
              (offer.last_name || "").slice(0, 1)
            }.`.trim();

            return (
              <IncomingTradeRow
                key={t.id}
                trade={t}
                fromName={fromName}
                offer={offer}
                offerName={offerName}
                offerShortName={offerShortName}
                myLeadsOptions={myLeadsOptions}
                onAccept={acceptTrade}
                onDecline={declineTrade}
              />
            );
          })}
        </div>
      </div>

      {/* Outgoing Trades */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-sm">My Trade Requests</h3>
        {outgoing.length === 0 && (
          <p className="text-xs text-white/60">No trade requests yet.</p>
        )}
        <div className="space-y-3 text-xs">
          {outgoing.map((t) => {
            const toName =
              t.to_profile?.full_name || t.to_profile?.email || "Unknown";
            const offer = t.offer_lead || {};
            const req = t.request_lead || null;
            const offerLabel = [
              [offer.first_name, offer.last_name].filter(Boolean).join(" "),
              offer.lead_type,
              offer.state,
            ]
              .filter(Boolean)
              .join(" — ");

            const reqLabel = req
              ? [
                  [req.first_name, req.last_name]
                    .filter(Boolean)
                    .join(" "),
                  req.lead_type,
                  req.state,
                ]
                  .filter(Boolean)
                  .join(" — ")
              : null;

            return (
              <div
                key={t.id}
                className="border border-white/10 rounded p-2 flex flex-col gap-1"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div>
                      To:{" "}
                      <span className="font-semibold">
                        {toName}
                      </span>
                    </div>
                    <div className="text-white/60">
                      Sent: {fmtMDY(t.created_at)} — Status:{" "}
                      <span className="capitalize">{t.status}</span>
                    </div>
                  </div>
                </div>
                <div>
                  Your lead:{" "}
                  <span className="font-semibold">{offerLabel}</span>
                </div>
                {t.note && (
                  <div className="text-white/70">
                    Note: <span className="italic">"{t.note}"</span>
                  </div>
                )}
                {t.status === "accepted" && reqLabel && (
                  <div>
                    Lead you received:{" "}
                    <span className="font-semibold">
                      {reqLabel}
                    </span>
                  </div>
                )}
                {t.status !== "accepted" && !reqLabel && (
                  <div className="text-white/50">
                    Waiting for other agent to respond.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Separate row component so we can use local state per trade cleanly
function IncomingTradeRow({
  trade,
  fromName,
  offer,
  offerName,
  offerShortName,
  myLeadsOptions,
  onAccept,
  onDecline,
}) {
  const [selectedId, setSelectedId] = useState("");

  const basicInfo = [
    offer.lead_type || "Unknown type",
    offer.state || null,
  ]
    .filter(Boolean)
    .join(" — ");

  const created = fmtMDY(trade.created_at);

  return (
    <div className="border border-white/10 rounded p-2 text-xs flex flex-col gap-2">
      <div className="flex justify-between">
        <div>
          <div>
            From:{" "}
            <span className="font-semibold">
              {fromName}
            </span>
          </div>
          <div className="text-white/60">
            Received: {created} — Status:{" "}
            <span className="capitalize">{trade.status}</span>
          </div>
        </div>
      </div>

      <div>
        Offered lead:{" "}
        <span className="font-semibold">
          {offerShortName || offerName}
        </span>{" "}
        <span className="text-white/60">
          ({basicInfo || "basic info hidden"})
        </span>
      </div>

      {trade.note && (
        <div className="text-white/70">
          Note: <span className="italic">"{trade.note}"</span>
        </div>
      )}

      {trade.status === "pending" && (
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <select
            className="rounded bg-white/5 border border-white/10 p-2 flex-1"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">
              Choose one of your leads to send back…
            </option>
            {myLeadsOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              className="btn btn-primary text-xs"
              disabled={!selectedId}
              onClick={() => onAccept(trade, selectedId)}
            >
              Accept
            </button>
            <button
              className="btn text-xs"
              onClick={() => onDecline(trade.id)}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {trade.status !== "pending" && (
        <div className="text-white/50">
          This trade has been{" "}
          <span className="capitalize">{trade.status}</span>.
        </div>
      )}
    </div>
  );
}
