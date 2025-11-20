// File: netlify/functions/import-csv.js
import { createClient } from "@supabase/supabase-js";

/* ---------- tiny CSV parser (no deps) ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", i = 0, q = false;

  while (i < text.length) {
    const c = text[i];

    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        q = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    } else {
      if (c === '"') {
        q = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
  }

  row.push(field);
  rows.push(row);

  // drop trailing empty rows
  while (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();

  const headers = (rows.shift() || []).map((h) => (h || "").trim());
  return { headers, rows };
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function toE164(usPhone) {
  const digits = String(usPhone || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length === 10) return "+1" + digits;
  return null;
}

/* ---------- header mapping (NO "Military Status") ---------- */
const MAP = {
  first_name: ["first_name", "First Name", "first", "fname", "First"],
  last_name: ["last_name", "Last Name", "last", "lname", "Last"],
  phone: [
    "phone",
    "Phone",
    "phone_number",
    "Phone Number",
    "mobile",
    "Mobile",
    "Phone #",
    "Primary Phone",
    "Cell",
    "Cell Phone",
    "Telephone",
    "Best Phone",
    "Phone1",
    "Phone 1",
  ],
  email: ["email", "Email", "e-mail", "Email Address"],
  state: ["state", "State", "RR State"],
  city: ["city", "City"],
  zip: ["zip", "Zip", "zipcode", "Zip Code", "postal", "Postal Code"],
  age: ["age", "Age"],
  // 👇 DOB / Date of Birth variants
  dob: [
    "dob",
    "DOB",
    "D.O.B",
    "D O B",
    "Date of Birth",
    "date of birth",
    "Birthdate",
    "Birth Date",
    "date_of_birth",
    "DateOfBirth",
  ],
  // 👇 Address variants
  address: [
    "address",
    "Address",
    "Street",
    "Street Address",
    "Home Address",
    "Mailing Address",
    "Residential Address",
    "Address 1",
    "Address1",
  ],
  military_branch: ["Military Branch", "Military", "Branch", "Service Branch"], // branch only
  beneficiary_name: ["beneficiary", "Beneficiary", "beneficiary_name", "Beneficiary Name"],
  lead_type: ["lead_type", "Lead Type", "Type", "Product"],
  notes: ["notes", "Notes"],
};

function aliasToCanon(h) {
  const key = String(h || "").trim().toLowerCase();
  for (const [canon, aliases] of Object.entries(MAP)) {
    if (aliases.map((a) => a.toLowerCase()).includes(key)) return canon;
  }
  return null;
}

function* chunked(arr, size) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

/* ---------- safer DOB + age helpers ---------- */

/**
 * Accept dates in:
 * - MM/DD/YYYY or MM-DD-YYYY
 * - YYYY-MM-DD
 * Ignore anything after "T" or space (e.g. 1942-05-12T00:00:00.000Z)
 */
function toDateISO(s) {
  if (!s) return null;
  const t = String(s).trim();

  // Drop time / timezone / extra junk after a T or space
  const core = t.split("T")[0].split(" ")[0].trim();

  // Try MM/DD/YYYY or MM-DD-YYYY (US-style)
  let m = core.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, mmStr, ddStr, yyyyStr] = m;
    const mm = parseInt(mmStr, 10);
    const dd = parseInt(ddStr, 10);
    const y = parseInt(yyyyStr, 10);

    if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(y)) return null;
    if (y < 1900 || y > 2100) return null;
    if (mm < 1 || mm > 12) return null;
    if (dd < 1 || dd > 31) return null;

    const mmP = String(mm).padStart(2, "0");
    const ddP = String(dd).padStart(2, "0");
    return `${y}-${mmP}-${ddP}`;
  }

  // Try ISO-like YYYY-MM-DD
  m = core.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;

  const [, yyyyStr2, mmStr2, ddStr2] = m;
  const y2 = parseInt(yyyyStr2, 10);
  const mm2 = parseInt(mmStr2, 10);
  const dd2 = parseInt(ddStr2, 10);

  if (!Number.isFinite(mm2) || !Number.isFinite(dd2) || !Number.isFinite(y2)) return null;
  if (y2 < 1900 || y2 > 2100) return null;
  if (mm2 < 1 || mm2 > 12) return null;
  if (dd2 < 1 || dd2 > 31) return null;

  const mmP2 = String(mm2).padStart(2, "0");
  const ddP2 = String(dd2).padStart(2, "0");
  return `${y2}-${mmP2}-${ddP2}`;
}

function ageFromDOB(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;

  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;

  return a;
}

/**
 * Safely get an age:
 * - Prefer explicit Age column if it's 0–120
 * - Else compute from DOB if available
 * - Else null
 */
function safeAge(maybeAge, dobISO) {
  if (maybeAge != null && maybeAge !== "") {
    const cleaned = String(maybeAge).replace(/[^\d]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n) && n >= 0 && n <= 120) return n;
  }

  const fromDob = ageFromDOB(dobISO);
  if (Number.isFinite(fromDob) && fromDob >= 0 && fromDob <= 120) return fromDob;

  return null;
}

/* Fallback: find a plausible US number anywhere in the row */
function fallbackPhoneFromRow(cells) {
  for (const cell of cells) {
    const digits = String(cell || "").replace(/\D+/g, "");
    if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) {
      const e = toE164(digits);
      if (e) return e;
    }
  }
  return null;
}

/* ---------- beneficiary helper ---------- */

function pickBeneficiaryName(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return null;

  const cleaned = rawList.map((v) => String(v).trim()).filter(Boolean);
  if (!cleaned.length) return null;

  // If there's only one column/value, always use it as-is
  if (cleaned.length === 1) {
    return cleaned[0];
  }

  const badPattern =
    /\b(spouse|children|child|son|daughter|wife|husband|kids|other|self|me|my spouse|my children|my kids)\b/i;

  // Prefer entries that do NOT look like relationship labels
  const preferred = cleaned.filter((v) => !badPattern.test(v));
  const pool = preferred.length ? preferred : cleaned;

  // Pick the longest string (usually full name)
  let best = pool[0];
  for (const v of pool) {
    if (v.length > best.length) best = v;
  }
  return best || null;
}

/* ---------- handler ---------- */
export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

    const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
    if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return json(500, { error: "Missing env: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE" });
    }
    const supa = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const { csv_text, original_filename, user_id, default_lead_type } = payload;
    if (!csv_text) return json(400, { error: "csv_text is required" });

    const parsed = parseCSV(csv_text);
    const headers = parsed.headers;
    const rows = parsed.rows;

    // file log
    const fileInsert = await supa
      .from("lead_files")
      .insert({
        uploaded_by: user_id || null,
        file_path: null,
        original_filename: original_filename || "inline.csv",
        row_count: rows.length,
        status: "received",
      })
      .select("id")
      .single();
    if (fileInsert.error)
      return json(500, { error: `lead_files insert: ${fileInsert.error.message}` });
    const fileId = fileInsert.data.id;

    // header map
    const headerMap = headers.map((h) => aliasToCanon(h));

    // stage
    const staged = [];
    let skipped_missing_contact = 0;

    for (const r of rows) {
      const m = {};

      for (let i = 0; i < headers.length; i++) {
        const canon = headerMap[i];
        const val = r[i] ?? "";
        const trimmed = String(val ?? "").trim();
        if (!trimmed) continue; // keep blanks blank

        if (canon === "beneficiary_name") {
          // SPECIAL: collect all raw beneficiary values
          if (!m._beneficiary_raw) m._beneficiary_raw = [];
          m._beneficiary_raw.push(trimmed);
        } else if (canon) {
          // combine duplicates into one field (e.g., multiple "Notes" columns)
          m[canon] =
            (m[canon] ?? "").toString() + (m[canon] ? " " : "") + trimmed;
        }
        // else: ignore unknown columns (no notes building)
      }

      // phone: header match first, else fallback
      let phone_e164 = toE164(m.phone);
      if (!phone_e164) phone_e164 = fallbackPhoneFromRow(r);

      const email = (m.email || "").toLowerCase().trim();
      if (!phone_e164 && !email) {
        skipped_missing_contact++;
        continue;
      }

      const dobISO = toDateISO(m.dob);
      const numericAge = safeAge(m.age, dobISO);

      // final lead type = CSV column OR selected default, uppercased
      const finalLeadTypeRaw = (m.lead_type || default_lead_type || "")
        .toString()
        .trim();
      const finalLeadType = finalLeadTypeRaw ? finalLeadTypeRaw.toUpperCase() : null;

      // pick a single beneficiary name if we have multiple columns
      const beneficiary_name = pickBeneficiaryName(m._beneficiary_raw);

      staged.push({
        source_file_id: fileId,
        first_name: m.first_name || null,
        last_name: m.last_name || null,
        phone_e164,
        email: email || null,
        state: m.state || null,
        address: m.address || null,       // 👈 NEW
        dob: dobISO || null,
        age: Number.isFinite(numericAge) ? numericAge : null,
        military_branch: m.military_branch || null, // branch only, status ignored
        beneficiary_name: beneficiary_name,
        lead_type: finalLeadType, // uses CSV or default from UI
        // city, zip, notes intentionally omitted — handled elsewhere if needed
        status: "new",
      });
    }

    /* Dedup within file, then against DB */
    const seenFilePhones = new Set();
    const uniqueByFile = [];
    let skipped_file_dupes = 0;

    for (const rec of staged) {
      const key = rec.phone_e164 || null;
      if (!key) {
        uniqueByFile.push(rec);
        continue; // allow email-only
      }
      if (seenFilePhones.has(key)) {
        skipped_file_dupes++;
        continue;
      }
      seenFilePhones.add(key);
      uniqueByFile.push(rec);
    }

    const phones = [...new Set(uniqueByFile.map((r) => r.phone_e164).filter(Boolean))];
    const existingPhones = new Set();
    for (const batch of chunked(phones, 1000)) {
      const { data, error } = await supa
        .from("leads")
        .select("phone_e164")
        .in("phone_e164", batch);
      if (error) return json(500, { error: `lookup existing phones: ${error.message}` });
      for (const row of data || []) existingPhones.add(row.phone_e164);
    }

    const ready = uniqueByFile.filter(
      (r) => !r.phone_e164 || !existingPhones.has(r.phone_e164)
    );
    const skipped_existing_dupes = uniqueByFile.length - ready.length;

    // insert
    let inserted = 0;
    for (const chunk of chunked(ready, 500)) {
      const ins = await supa.from("leads").insert(chunk).select("id");
      if (ins.error) {
        return json(500, { error: `Insert error: ${ins.error.message}` });
      }
      inserted += ins.data?.length || 0;
    }

    // finalize
    const totalSkipped =
      skipped_missing_contact + skipped_file_dupes + skipped_existing_dupes;
    const upd = await supa
      .from("lead_files")
      .update({
        processed_count: inserted,
        skipped_count: totalSkipped,
        status: "processed",
      })
      .eq("id", fileId);
    if (upd.error)
      return json(500, { error: `lead_files update: ${upd.error.message}` });

    return json(200, {
      ok: true,
      file_id: fileId,
      inserted,
      skipped: totalSkipped,
      breakdown: {
        missing_contact: skipped_missing_contact,
        file_duplicates_by_phone: skipped_file_dupes,
        existing_duplicates_by_phone: skipped_existing_dupes,
      },
    });
  } catch (e) {
    console.error("import-csv fatal:", e);
    return json(500, { error: String(e?.message || e) });
  }
};
