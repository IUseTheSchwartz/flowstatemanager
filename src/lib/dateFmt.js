export function fmtMDY(input) {
  if (!input) return "—";
  const s = String(input).trim();

  // If it's YYYY-MM-DD, avoid timezone shifts
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${mo}-${d}-${y}`;
  }

  // Otherwise try to parse (timestamp/ISO)
  const d = new Date(s);
  if (isNaN(d)) return s;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}
