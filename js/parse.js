/** Parsers matching the Android JsonParsers / FleetStock / Staff / Optimo / Repairs shapes. */

export function stripBom(text) {
  if (text == null) return "";
  return String(text).replace(/^\uFEFF/, "").trim();
}

export function parseJson(text, fallback = null) {
  const t = stripBom(text);
  if (!t) return fallback;
  try {
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

export function normaliseBarcode(raw) {
  if (raw == null) return "";
  return String(raw).replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
}

export function sameBarcode(a, b) {
  const x = normaliseBarcode(a);
  const y = normaliseBarcode(b);
  if (!x || !y) return false;
  return x.toUpperCase() === y.toUpperCase();
}

function str(o, key, alt) {
  if (!o || typeof o !== "object") return "";
  const v = o[key] ?? (alt ? o[alt] : undefined);
  if (v == null) return "";
  return String(v).trim();
}

function num(o, key) {
  const v = o?.[key];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return [];
}

export function itemKind(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("bike")) return "bike";
  if (t.includes("batter")) return "battery";
  if (t.includes("phone") || t.includes("handset")) return "phone";
  if (t.includes("lock") || t.includes("chain")) return "lock";
  if (t.includes("key")) return "key";
  return "other";
}

export function parseItems(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.items ?? root);
  return arr.map((o) => ({
    id: str(o, "id") || str(o, "itemId"),
    type: str(o, "type") || str(o, "kind") || "other",
    kind: itemKind(str(o, "type") || str(o, "kind")),
    number: str(o, "number") || str(o, "label") || str(o, "name"),
    name: str(o, "name") || str(o, "label"),
    barcode: normaliseBarcode(str(o, "barcode") || str(o, "code")),
    status: str(o, "status").toLowerCase() || "ok",
    outOfService: Boolean(o.outOfService || o.out_of_service || String(o.status || "").toLowerCase() === "out_of_service"),
    retired: Boolean(o.retired),
    notes: str(o, "notes"),
    raw: o,
  })).filter((i) => i.id || i.barcode || i.number);
}

export function parseCheckouts(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.checkouts ?? root.records ?? root);
  return arr.map((o, idx) => ({
    id: str(o, "id") || `co-${idx}`,
    riderId: str(o, "riderId") || str(o, "staffId") || str(o, "memberId"),
    riderName: str(o, "riderName") || str(o, "name") || str(o, "rider"),
    date: str(o, "date"),
    at: str(o, "at") || str(o, "createdAt") || str(o, "time"),
    by: str(o, "by") || str(o, "loggedBy"),
    items: asArray(o.items).map((it) => ({
      barcode: normaliseBarcode(str(it, "barcode") || str(it, "code")),
      type: str(it, "type") || str(it, "kind"),
      number: str(it, "number") || str(it, "label") || str(it, "name"),
      name: str(it, "name") || str(it, "label"),
    })),
    quick: Boolean(o.quick || o.quickAssign),
    raw: o,
  }));
}

function riderStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "working" || s === "in" || s === "on" || s === "yes" || s === "w") return "working";
  if (s === "holiday" || s === "hol" || s === "h" || s === "off") return "holiday";
  if (s === "pending" || s === "requested" || s === "request") return "pending";
  if (s === "sick" || s === "absence") return "sick";
  if (!s || s === "none" || s === "blank" || s === "off-rota") return "none";
  return s;
}

const ROTA_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function dayKey(k) {
  const t = String(k || "").trim().toLowerCase();
  const map = { mon: "Mon", monday: "Mon", tue: "Tue", tues: "Tue", tuesday: "Tue",
    wed: "Wed", wednesday: "Wed", thu: "Thu", thur: "Thu", thursday: "Thu",
    fri: "Fri", friday: "Fri" };
  return map[t] || null;
}

function parseRider(o) {
  const name = str(o, "name") || str(o, "rider") || str(o, "riderName");
  const days = {};
  // Canonical shape is status:{ Mon:"working" }. Also accept a days object or long day names.
  const src = (o.status && typeof o.status === "object" && !Array.isArray(o.status)) ? o.status
    : (o.days && typeof o.days === "object" && !Array.isArray(o.days)) ? o.days
    : o;
  for (const d of ROTA_DAYS) days[d] = "none";
  for (const [k, raw] of Object.entries(src)) {
    const d = dayKey(k);
    if (!d) continue;
    const v = (raw && typeof raw === "object") ? (raw.status ?? raw.value) : raw;
    days[d] = riderStatus(v);
  }
  return { name, id: str(o, "id") || str(o, "memberId"), days, raw: o, manual: o.manual || {} };
}

function weekOf(o) {
  return str(o, "weekStarting") || str(o, "week_starting") || str(o, "start") || str(o, "week");
}

export function parseFeed(text) {
  const root = parseJson(text, {});
  const updates = asArray(root.updates);
  const staff = asArray(root.staff);
  const rotasRaw = asArray(root.rotas);
  const legacy = root.rota && typeof root.rota === "object" ? [root.rota] : [];
  const blocks = (rotasRaw.length ? rotasRaw : legacy).filter((o) => o && typeof o === "object");
  const rotas = blocks.map((o) => ({
    weekStarting: weekOf(o),
    days: asArray(o.days).length ? asArray(o.days).map(String) : ["Mon","Tue","Wed","Thu","Fri"],
    dates: o.dates && typeof o.dates === "object" ? o.dates : {},
    riders: asArray(o.riders).map(parseRider),
    holidayRequests: asArray(o.holidayRequests || o.holidays),
    raw: o,
  }));
  return { updates, staff, rotas, raw: root };
}

export function parseStaffFile(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.staff ?? root.members ?? root);
  return arr.map((o) => ({
    id: str(o, "id") || str(o, "memberId"),
    name: str(o, "name") || str(o, "fullName"),
    role: str(o, "role") || str(o, "type") || "Rider",
    days: asArray(o.days || o.contractedDays || o.workDays).map(String),
    phone: str(o, "phone") || str(o, "mobile"),
    active: o.active !== false && o.removed !== true,
    source: str(o, "source") || (o.fromJenny ? "jenny" : "app"),
    addedAt: str(o, "addedAt"),
    addedBy: str(o, "addedBy"),
    raw: o,
  })).filter((s) => s.id || s.name);
}

export function parseFleet(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.bikes ?? root.fleet ?? root);
  return arr.map((o) => {
    const status = fleetStatus(str(o, "status"));
    return {
      id: str(o, "id") || str(o, "bikeId") || str(o, "number"),
      name: str(o, "name") || str(o, "label") || labelBike(str(o, "number") || str(o, "id")),
      number: str(o, "number") || numberFromName(str(o, "name") || str(o, "id")),
      barcode: normaliseBarcode(str(o, "barcode")),
      status,
      model: str(o, "model"),
      vin: str(o, "vin"),
      frameNumber: str(o, "frameNumber") || str(o, "frame"),
      brakes: str(o, "brakes"),
      drivetrain: str(o, "drivetrain") || "belt",
      odometerKm: num(o, "odometerKm") ?? num(o, "odometer"),
      lastService: str(o, "lastService"),
      nextServiceDue: str(o, "nextServiceDue") || str(o, "nextService"),
      batterySerial: str(o, "batterySerial"),
      notes: str(o, "notes"),
      issues: asArray(o.issues),
      raw: o,
    };
  }).filter((b) => b.id || b.name);
}

function fleetStatus(s) {
  const t = s.toLowerCase().replace(/[-\s]+/g, "_");
  if (t === "off_road" || t === "off_the_road" || t === "broken") return "off_road";
  if (t === "in_repair" || t === "needs_repair" || t === "repair") return "in_repair";
  return "on_road";
}

function labelBike(n) {
  if (!n) return "";
  const t = String(n);
  return /^bike\b/i.test(t) ? t : `Bike ${t}`;
}

function numberFromName(name) {
  const m = String(name || "").match(/(\d+)\s*$/);
  return m ? m[1] : "";
}

export function parseStock(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.items ?? root.parts ?? root.stock ?? root);
  return arr.map((o) => ({
    id: str(o, "id") || str(o, "sku") || str(o, "name"),
    name: str(o, "name") || str(o, "title"),
    sku: str(o, "sku") || str(o, "id"),
    qty: num(o, "qty") ?? num(o, "quantity") ?? num(o, "count") ?? 0,
    reorderAt: num(o, "reorderAt") ?? num(o, "reorder") ?? num(o, "min"),
    unit: str(o, "unit"),
    appliesTo: (str(o, "appliesTo") || str(o, "brakes") || str(o, "brand") || "").toLowerCase(),
    notes: str(o, "notes"),
    raw: o,
  })).filter((p) => p.id || p.name);
}

export function parseStockCounts(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.counts ?? root.items ?? root);
  return arr.map((o) => ({
    id: str(o, "id") || str(o, "sku") || str(o, "name"),
    qty: num(o, "qty") ?? num(o, "count") ?? num(o, "quantity"),
    countedAt: str(o, "countedAt") || str(o, "at"),
    countedBy: str(o, "countedBy") || str(o, "by"),
    raw: o,
  })).filter((c) => c.id);
}

export function parseStockDetails(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.parts ?? root.items ?? root);
  return arr.map((o) => ({
    id: str(o, "id") || str(o, "sku"),
    name: str(o, "name"),
    fields: o.fields && typeof o.fields === "object" ? o.fields : {},
    raw: o,
  })).filter((p) => p.id);
}

export function parseBikeDetails(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.bikes ?? root);
  return arr.map((o) => ({
    bikeId: str(o, "bikeId") || str(o, "id"),
    name: str(o, "name") || null,
    fields: o.fields && typeof o.fields === "object" ? o.fields : {},
    issues: asArray(o.issues),
    updatedAt: str(o, "updatedAt"),
    updatedBy: str(o, "updatedBy") || "Sam",
  })).filter((d) => d.bikeId);
}

export function parseRepairs(text) {
  const root = parseJson(text, {});
  const arr = asArray(root.repairs ?? root);
  return arr.map((o) => ({
    id: str(o, "id"),
    itemId: str(o, "itemId"),
    barcode: normaliseBarcode(str(o, "barcode")),
    bike: str(o, "bike") || str(o, "name"),
    type: str(o, "type") || "other",
    note: str(o, "note") || str(o, "notes"),
    offRoad: Boolean(o.offRoad),
    loggedAt: str(o, "loggedAt"),
    loggedBy: str(o, "loggedBy"),
    fixedAt: str(o, "fixedAt"),
    fixedBy: str(o, "fixedBy"),
    raw: o,
  })).filter((r) => r.id || r.itemId || r.bike);
}

export function parseOptimo(text) {
  const root = parseJson(text, {});
  const week = root.week && typeof root.week === "object" ? {
    start: str(root.week, "start"),
    end: str(root.week, "end"),
    label: str(root.week, "label"),
  } : {};
  const period = root.period && typeof root.period === "object" ? {
    start: str(root.period, "start"),
    end: str(root.period, "end"),
    label: str(root.period, "label"),
  } : null;
  const riders = asArray(root.riders ?? root.stats ?? root).map((o) => ({
    id: str(o, "id") || str(o, "riderId") || str(o, "staffId"),
    name: str(o, "name") || str(o, "rider") || str(o, "riderName"),
    extraDrops: num(o, "extraDrops"),
    extraDropsToday: num(o, "extraDropsToday"),
    extraDropsWeek: num(o, "extraDropsWeek"),
    extraDropsByDay: asArray(o.extraDropsByDay).map((d) => ({
      date: str(d, "date"),
      count: num(d, "count") ?? num(d, "extra") ?? num(d, "extraDrops") ?? 0,
    })),
    reviewScore: num(o, "reviewScore") ?? num(o, "avgRating") ?? num(o, "score") ?? num(o, "rating"),
    reviewCount: num(o, "reviewCount") ?? num(o, "ratingCount") ?? (Array.isArray(o.reviews) ? o.reviews.length : null),
    reviews: asArray(o.reviews).map((r) => ({
      date: str(r, "date"),
      score: num(r, "score") ?? num(r, "rating"),
      text: str(r, "text") || str(r, "comment") || null,
      customer: str(r, "customer") || null,
      location: str(r, "location") || null,
    })),
    raw: o,
  })).filter((r) => r.id || r.name);
  const previousPeriod = root.previousPeriod && typeof root.previousPeriod === "object" ? root.previousPeriod : null;
  return { week, riders, period, updatedAt: str(root, "updatedAt"), previousPeriod, raw: root };
}

export function parseHandover(text) {
  const root = parseJson(text, {});
  return {
    notes: asArray(root.notes ?? root.items ?? root),
    raw: root,
  };
}

export function parseCvDecisions(text) {
  const root = parseJson(text, {});
  return asArray(root.decisions ?? root);
}
