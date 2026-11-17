/** Europe/London calendar dates, matching the Android DateFormats / DailyReset helpers. */

const TZ = "Europe/London";

export function londonToday(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function londonNowIso(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function parseYmd(s) {
  if (!s || typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function ymd(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(iso, n) {
  const p = parseYmd(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return dt.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday, using the calendar date (not the local machine zone). */
export function mondayIndex(iso) {
  const p = parseYmd(iso);
  if (!p) return 0;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return (dow + 6) % 7;
}

export function mondayOf(iso) {
  return addDays(iso, -mondayIndex(iso));
}

export function formatShort(iso) {
  const p = parseYmd(iso);
  if (!p) return iso || "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${p.d} ${months[p.m - 1]}`;
}

export function formatLong(iso) {
  const p = parseYmd(iso);
  if (!p) return iso || "";
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${p.d} ${months[p.m - 1]} ${p.y}`;
}

export function formatWeekLabel(mondayIso) {
  return "w/c " + formatShort(mondayIso);
}

export function formatClock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-CA", { timeZone: TZ });
  return `${formatShort(date)} ${formatClock(iso)}`;
}

export function monthGrid(year, month /* 1-12 */) {
  const first = ymd(year, month, 1);
  const start = addDays(first, -mondayIndex(first));
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    const p = parseYmd(date);
    cells.push({ date, inMonth: p.m === month });
  }
  return cells;
}

export function monthName(year, month) {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[month - 1]} ${year}`;
}

/** 26th-to-26th period (end exclusive), matching Insights.kt. */
export function currentPeriod(today) {
  const p = parseYmd(today);
  if (!p) return { start: today, end: today };
  if (p.d >= 26) {
    const endM = p.m === 12 ? 1 : p.m + 1;
    const endY = p.m === 12 ? p.y + 1 : p.y;
    return { start: ymd(p.y, p.m, 26), end: ymd(endY, endM, 26) };
  }
  const startM = p.m === 1 ? 12 : p.m - 1;
  const startY = p.m === 1 ? p.y - 1 : p.y;
  return { start: ymd(startY, startM, 26), end: ymd(p.y, p.m, 26) };
}

export function sortKey(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}
