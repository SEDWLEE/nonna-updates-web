/** Pure derivation matching the Android app. No I/O. */

import { WHATSAPP_NUMBER } from "./config.js";
import {
  addDays, formatClock, formatShort, formatWeekLabel, londonToday, mondayOf, sortKey,
} from "./date.js";
import { itemKind, normaliseBarcode, sameBarcode } from "./parse.js";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export { WEEKDAYS };

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function eqName(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

/** Jenny's feed.staff[] plus staff.json overlay. Active:false hides; Restore brings back. */
export function effectiveStaff(feedStaff, overlay) {
  const jenny = (feedStaff || []).map((s) => ({
    id: s.id || slugName(s.name),
    name: s.name || "",
    role: s.role || s.type || "Rider",
    days: Array.isArray(s.days) ? s.days : (s.workDays || []),
    phone: s.phone || "",
    active: true,
    source: "jenny",
  })).filter((s) => s.name);
  const byId = new Map();
  for (const s of jenny) byId.set(keyOf(s), s);
  for (const s of overlay || []) {
    const k = keyOf(s);
    const prev = byId.get(k) || [...byId.values()].find((p) => eqName(p.name, s.name));
    if (prev) {
      const merged = { ...prev, ...s, id: s.id || prev.id, name: s.name || prev.name };
      byId.delete(keyOf(prev));
      byId.set(keyOf(merged), merged);
    } else {
      byId.set(k, { ...s, source: s.source || "app" });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

function keyOf(s) {
  return (s.id || "").trim() || "name:" + String(s.name || "").trim().toLowerCase();
}

export function slugName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "staff";
}

export function forDisplay(staff) {
  return staff.filter((s) => s.active !== false);
}

export function removedStaff(staff) {
  return staff.filter((s) => s.active === false);
}

/**
 * Hide a rota row if it matches a removed person by id, full name, or unique first name.
 * Only current Monday and later weeks are hidden; past weeks are kept.
 */
export function isRemovedRow(rowName, rowId, removed, allStaff) {
  if (!removed.length) return false;
  if (rowId && removed.some((s) => s.id && s.id === rowId)) return true;
  if (removed.some((s) => eqName(s.name, rowName))) return true;
  const first = firstName(rowName);
  if (!first) return false;
  const pool = new Map();
  for (const s of [...(allStaff || []), ...removed]) pool.set(keyOf(s), s);
  const unique = [...pool.values()].filter((s) => eqName(firstName(s.name), first));
  if (unique.length !== 1) return false;
  return unique[0].active === false;
}

export function visibleRota(rota, staff, today = londonToday()) {
  if (!rota) return rota;
  const thisMonday = mondayOf(today);
  if (rota.weekStarting && rota.weekStarting < thisMonday) return rota;
  const removed = removedStaff(staff);
  if (!removed.length) return rota;
  return {
    ...rota,
    riders: (rota.riders || []).filter((r) => !isRemovedRow(r.name, r.id, removed, staff)),
  };
}

export function rotaForWeek(rotas, monday) {
  return (rotas || []).find((r) => r.weekStarting === monday) || null;
}

export function isCurrentCheckout(rec, today = londonToday()) {
  return rec && rec.date === today;
}

export function currentCheckouts(checkouts, today = londonToday()) {
  return (checkouts || []).filter((c) => isCurrentCheckout(c, today));
}

export function itemsHeldToday(checkouts, today = londonToday()) {
  const held = new Map();
  for (const rec of currentCheckouts(checkouts, today)) {
    for (const it of rec.items || []) {
      const code = normaliseBarcode(it.barcode).toUpperCase();
      if (!code) continue;
      held.set(code, { riderId: rec.riderId, riderName: rec.riderName, item: it, rec });
    }
  }
  return held;
}

/** Assignment guard: an item already with someone else today is blocked; no override. */
export function heldByOther(barcode, riderId, riderName, checkouts, today = londonToday()) {
  const code = normaliseBarcode(barcode);
  if (!code) return null;
  const held = itemsHeldToday(checkouts, today);
  const row = held.get(code.toUpperCase());
  if (!row) return null;
  const sameId = riderId && row.riderId && riderId === row.riderId;
  const sameName = eqName(row.riderName, riderName);
  if (sameId || sameName) return null;
  return row;
}

export function blockedText(itemLabel, holderName) {
  const label = itemLabel || "This item";
  return `${label} is already with ${holderName}`;
}

export function requireFree(items, riderId, riderName, checkouts, today = londonToday()) {
  for (const it of items || []) {
    const other = heldByOther(it.barcode, riderId, riderName, checkouts, today);
    if (other) {
      const label = it.number ? (it.type ? titleItem(it) : it.number) : (it.name || it.barcode);
      throw new Error(blockedText(label, other.riderName));
    }
  }
  return true;
}

export function titleItem(it) {
  if (!it) return "";
  const kind = itemKind(it.type || it.kind);
  const n = it.number || "";
  if (kind === "bike") return n ? (/^bike\b/i.test(String(n)) ? String(n) : `Bike ${n}`) : (it.name || "Bike");
  if (kind === "battery") return n ? `Battery ${n}` : (it.name || "Battery");
  if (kind === "phone") return n ? `Phone ${n}` : (it.name || "Phone");
  return it.name || it.number || it.barcode || "Item";
}

export function itemForBarcode(items, barcode) {
  const code = normaliseBarcode(barcode);
  if (!code) return null;
  return (items || []).find((i) => sameBarcode(i.barcode, code)) || null;
}

export function itemForBike(items, bike) {
  if (!bike) return null;
  const list = items || [];
  const bikes = list.filter((i) => i.kind === "bike" || itemKind(i.type) === "bike");
  if (bike.barcode) {
    const byCode = bikes.find((i) => sameBarcode(i.barcode, bike.barcode));
    if (byCode) return byCode;
  }
  const label = (bike.name || "").trim();
  const exact = bikes.find((i) => eqName(i.name, label) || eqName(titleItem(i), label) || eqName(i.id, bike.id));
  if (exact) return exact;
  const num = String(bike.number || numberFrom(bike.name) || "").trim();
  if (num) {
    const byNum = bikes.find((i) => String(i.number || numberFrom(i.name) || "").trim() === num || eqName(i.id, num));
    if (byNum) return byNum;
  }
  return null;
}

function numberFrom(name) {
  const m = String(name || "").match(/(\d+)\s*$/);
  return m ? m[1] : "";
}

export function bikeForBarcode(fleet, items, barcode) {
  const code = normaliseBarcode(barcode);
  if (!code) return null;
  const direct = (fleet || []).find((b) => sameBarcode(b.barcode, code));
  if (direct) return direct;
  const item = itemForBarcode(items, code);
  if (!item) return null;
  return (fleet || []).find((b) => itemForBike(items, b)?.id === item.id || eqName(titleItem(item), b.name) || (b.number && b.number === item.number)) || null;
}

export function openRepairs(repairs) {
  return (repairs || []).filter((r) => !r.fixedAt);
}

export function historyRepairs(repairs) {
  return (repairs || []).filter((r) => r.fixedAt).sort((a, b) => sortKey(b.fixedAt) - sortKey(a.fixedAt));
}

export function repairsForBike(repairs, bike, item) {
  return (repairs || []).filter((r) => matchesBike(r, bike, item));
}

function matchesBike(r, bike, item) {
  if (item?.id && r.itemId && r.itemId === item.id) return true;
  if (item?.barcode && r.barcode && sameBarcode(r.barcode, item.barcode)) return true;
  if (bike?.barcode && r.barcode && sameBarcode(r.barcode, bike.barcode)) return true;
  if (bike && (eqName(r.bike, bike.name) || (bike.number && eqName(r.bike, `Bike ${bike.number}`)))) return true;
  return false;
}

export function isOffRoadBike(bike, item, repairs) {
  if (item?.outOfService) return true;
  if (bike?.status === "off_road") return true;
  const open = openRepairs(repairsForBike(repairs, bike, item));
  return open.some((r) => r.offRoad);
}

export function needsRepairBike(bike, item, repairs) {
  if (isOffRoadBike(bike, item, repairs)) return false;
  if (bike?.status === "in_repair") return true;
  const open = openRepairs(repairsForBike(repairs, bike, item));
  return open.length > 0;
}

export function bikeDisplayStatus(bike, item, repairs) {
  if (isOffRoadBike(bike, item, repairs)) return { key: "off_road", label: "Off the road" };
  if (needsRepairBike(bike, item, repairs)) return { key: "needs_repair", label: "Needs repair" };
  return { key: "on_road", label: "On the road" };
}

export function applyRepairsToFleet(fleet, items, repairs) {
  return (fleet || []).map((b) => {
    const item = itemForBike(items, b);
    const st = bikeDisplayStatus(b, item, repairs);
    return { ...b, displayStatus: st.key, displayLabel: st.label, item, openRepairs: openRepairs(repairsForBike(repairs, b, item)) };
  });
}

export function addRepair(list, repair) {
  return [...(list || []), repair];
}

export function markFixed(list, id, at, by) {
  return (list || []).map((r) => (r.id === id && !r.fixedAt ? { ...r, fixedAt: at, fixedBy: by } : r));
}

export function undoRepair(list, id) {
  return (list || []).filter((r) => r.id !== id || r.fixedAt);
}

export function newRepairId(now = Date.now()) {
  return "rep-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

/** Extra drops: Optimo computes numbers; we only display. Missing figures come from extraDropsByDay. */
export function extraToday(rider, today) {
  if (rider.extraDropsToday != null) return rider.extraDropsToday;
  const row = (rider.extraDropsByDay || []).find((d) => d.date === today);
  return row ? row.count : null;
}

export function extraWeek(rider, week) {
  if (rider.extraDropsWeek != null) return rider.extraDropsWeek;
  const days = rider.extraDropsByDay || [];
  if (!week?.start || !days.length) return null;
  const start = week.start;
  const end = week.end || addDays(week.start, 7);
  const inWeek = days.filter((d) => d.date >= start && d.date < end);
  if (!inWeek.length) return null;
  return inWeek.reduce((s, d) => s + (d.count || 0), 0);
}

export function extraPeriod(rider) {
  return rider.extraDrops != null ? rider.extraDrops : null;
}

export function displayCount(n) {
  return n == null ? "—" : String(n);
}

export function whatsAppMessage(riders, week, today = londonToday()) {
  const label = week?.label || formatWeekLabel(week?.start || mondayOf(today));
  const rows = (riders || []).map((r) => ({
    name: r.name,
    week: extraWeek(r, week),
  })).filter((r) => r.week != null && r.week > 0)
    .sort((a, b) => b.week - a.week || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  if (!rows.length) return "";
  return [`Extra drops ${label}`, ...rows.map((r) => `${r.name} ${r.week}`)].join("\n");
}

export function whatsAppUrl(riders, week, today = londonToday()) {
  const msg = whatsAppMessage(riders, week, today);
  if (!msg) return null;
  const encoded = encodeURIComponent(msg).replace(/%20/g, "%20");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
}

export function teamScore(riders) {
  const scores = (riders || []).map((r) => r.reviewScore).filter((n) => n != null);
  if (!scores.length) return null;
  const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
  return Math.round(avg * 10) / 10;
}

export function mergeBikeDetails(fleet, overlay) {
  if (!overlay?.length) return fleet || [];
  const byId = new Map(overlay.map((d) => [d.bikeId, d]));
  const merged = (fleet || []).map((b) => {
    const d = byId.get(b.id);
    return d ? applyBikeDetail(b, d) : b;
  });
  const extra = overlay.filter((d) => !(fleet || []).some((b) => b.id === d.bikeId))
    .map((d) => applyBikeDetail({ id: d.bikeId, name: d.name || d.bikeId, status: "on_road", drivetrain: "belt" }, d));
  return merged.concat(extra);
}

function applyBikeDetail(b, d) {
  const f = d.fields || {};
  const pick = (k, cur) => (k in f ? (String(f[k]).trim() || null) : cur);
  let status = b.status;
  if ("status" in f && String(f.status).trim()) {
    const t = String(f.status).toLowerCase().replace(/[-\s]+/g, "_");
    status = t === "off_road" || t === "off_the_road" || t === "broken" ? "off_road"
      : t === "in_repair" || t === "needs_repair" ? "in_repair"
      : "on_road";
  }
  return {
    ...b,
    name: d.name || b.name,
    vin: pick("vin", b.vin),
    frameNumber: pick("frameNumber", b.frameNumber),
    model: "model" in f ? (String(f.model).trim() || "") : b.model,
    status,
    notes: "notes" in f ? String(f.notes) : b.notes,
    issues: d.issues ?? b.issues,
  };
}

export function mergeStock(parts, details, counts) {
  const det = new Map((details || []).map((d) => [d.id, d]));
  const cnt = new Map((counts || []).map((c) => [c.id, c]));
  return (parts || []).map((p) => {
    const d = det.get(p.id);
    const c = cnt.get(p.id);
    const name = d?.name || p.name;
    const qty = c?.qty != null ? c.qty : p.qty;
    return { ...p, name, qty, countedAt: c?.countedAt, countedBy: c?.countedBy, overlay: d };
  });
}

export function holderForItem(item, checkouts, today = londonToday()) {
  if (!item) return null;
  const held = itemsHeldToday(checkouts, today);
  if (item.barcode) {
    const row = held.get(normaliseBarcode(item.barcode).toUpperCase());
    if (row) return row;
  }
  for (const row of held.values()) {
    if (item.id && (row.item.id === item.id)) return row;
    if (item.number && row.item.number === item.number && itemKind(row.item.type) === item.kind) return row;
  }
  return null;
}

export function assignmentHistory(item, bike, checkouts) {
  const recs = [];
  for (const rec of checkouts || []) {
    const hit = (rec.items || []).some((it) => {
      if (item?.barcode && sameBarcode(it.barcode, item.barcode)) return true;
      if (bike?.barcode && sameBarcode(it.barcode, bike.barcode)) return true;
      if (item && (eqName(titleItem(it), titleItem(item)) || (item.number && it.number === item.number && itemKind(it.type) === item.kind))) return true;
      if (bike && (eqName(titleItem(it), bike.name) || (bike.number && it.number === bike.number && itemKind(it.type) === "bike"))) return true;
      return false;
    });
    if (hit) recs.push(rec);
  }
  recs.sort((a, b) => (b.date || "").localeCompare(a.date || "") || sortKey(b.at) - sortKey(a.at));
  return recs;
}

export function riderDays(records) {
  const groups = new Map();
  (records || []).forEach((rec, index) => {
    const key = rec.riderId || "name:" + String(rec.riderName || "").trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ rec, index });
  });
  const out = [];
  for (const group of groups.values()) {
    group.sort((a, b) => sortKey(b.rec.at) - sortKey(a.rec.at) || b.index - a.index);
    const recs = group.map((g) => g.rec);
    const items = [];
    const seen = new Set();
    for (const rec of [...recs].reverse()) {
      for (const it of rec.items || []) {
        const k = normaliseBarcode(it.barcode).toUpperCase() || titleItem(it);
        if (seen.has(k)) continue;
        seen.add(k);
        items.push(it);
      }
    }
    const times = recs.map((r) => formatClock(r.at)).filter(Boolean);
    const time = times.length === 0 ? "" : times.length === 1 ? times[0] : `${times[times.length - 1]}–${times[0]}`;
    out.push({
      riderId: recs[0].riderId,
      riderName: recs[0].riderName,
      records: recs,
      items,
      time,
      itemCount: items.length,
    });
  }
  out.sort((a, b) => sortKey(b.records[0].at) - sortKey(a.records[0].at));
  return out;
}

export function kitLines(items) {
  const order = ["bike", "battery", "phone", "lock", "other"];
  const groups = new Map();
  for (const it of items || []) {
    const k = itemKind(it.type || it.kind);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const titles = { bike: "Bikes", battery: "Batteries", phone: "Phones", lock: "Locks", other: "Other" };
  return order.filter((k) => groups.has(k)).map((k) => {
    const nums = groups.get(k).map((it) => it.number || it.name).filter(Boolean).join(", ");
    return { type: k, title: titles[k], numbers: nums, text: nums ? `${titles[k]} ${nums}` : titles[k] };
  });
}

export function currentKitByRider(staff, checkouts, items, today = londonToday()) {
  const recs = currentCheckouts(checkouts, today);
  const days = riderDays(recs);
  const byKey = new Map(days.map((d) => [d.riderId || "name:" + d.riderName.trim().toLowerCase(), d]));
  return forDisplay(staff).map((s) => {
    const d = byKey.get(s.id) || byKey.get("name:" + s.name.trim().toLowerCase());
    return {
      staff: s,
      kit: d ? kitLines(d.items) : [],
      items: d?.items || [],
      time: d?.time || "",
    };
  }).sort((a, b) => a.staff.name.localeCompare(b.staff.name, "en", { sensitivity: "base" }));
}

export function inventorySummary(items, checkouts, today = londonToday()) {
  const held = itemsHeldToday(checkouts, today);
  const groups = { bike: [], battery: [], phone: [], other: [] };
  for (const it of items || []) {
    const k = it.kind === "lock" || it.kind === "key" ? "other" : (groups[it.kind] ? it.kind : "other");
    const holder = it.barcode ? held.get(normaliseBarcode(it.barcode).toUpperCase()) : null;
    groups[k].push({ ...it, holder, out: Boolean(holder), broken: it.outOfService || it.status === "broken" });
  }
  return groups;
}

/** feed.json writes: only rotas[] (and the matching legacy rota week). Never staff[] or updates[]. */
export function applyRotaEditsToFeed(root, edits, by, at) {
  const data = structuredClone(root);
  const weeks = new Map();
  const collect = (obj) => {
    if (!obj || typeof obj !== "object") return;
    const w = obj.weekStarting || obj.week_starting || obj.start || obj.week;
    if (w) {
      if (!weeks.has(w)) weeks.set(w, []);
      weeks.get(w).push(obj);
    }
  };
  if (Array.isArray(data.rotas)) data.rotas.forEach(collect);
  if (data.rota) collect(data.rota);
  for (const edit of edits || []) {
    const weekStarting = edit.weekStarting;
    let targets = weeks.get(weekStarting) || [];
    if (!targets.length) {
      if (!Array.isArray(data.rotas)) {
        data.rotas = data.rota ? [structuredClone(data.rota)] : [];
      } else if (data.rotas.length === 0 && data.rota) {
        data.rotas.push(structuredClone(data.rota));
      }
      const dates = {};
      WEEKDAYS.forEach((d, i) => { dates[d] = addDays(weekStarting, i); });
      const week = {
        weekStarting,
        days: [...WEEKDAYS],
        dates,
        riders: [],
        holidayRequests: [],
        createdBy: `${by} (Nonna Updates web, Plan rota)`,
        createdAt: at,
      };
      data.rotas.push(week);
      targets = [week];
      weeks.set(weekStarting, targets);
    }
    for (const week of targets) applyToWeek(week, edit, by, at);
  }
  return data;
}

function applyToWeek(week, edit, by, at) {
  if (!Array.isArray(week.riders)) week.riders = [];
  let rider = week.riders.find((r) => eqName(r.name, edit.riderName));
  if (!rider) {
    rider = { name: edit.riderName, days: {} };
    week.riders.push(rider);
    week.riders.sort((a, b) => String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base" }));
  }
  if (!rider.days || Array.isArray(rider.days)) rider.days = {};
  const status = edit.status || "none";
  if (status === "none") delete rider.days[edit.day];
  else rider.days[edit.day] = status;
  rider.days[edit.day + "Manual"] = true;
  rider.manual = rider.manual || {};
  rider.manual[edit.day] = { by, at, source: "manual" };
}

export function planChanges(weekStarting, saved, edited) {
  const changes = [];
  const names = new Set([...Object.keys(saved || {}), ...Object.keys(edited || {})]);
  for (const name of names) {
    for (const d of WEEKDAYS) {
      const now = edited?.[name]?.[d] || "none";
      const was = saved?.[name]?.[d] || "none";
      if (now !== was) changes.push({ weekStarting, riderName: name, day: d, status: now });
    }
  }
  return changes;
}

export function planRows(staff, rota) {
  const people = forDisplay(staff).filter((s) => s.name);
  const riders = rota?.riders || [];
  return people.map((m) => {
    const full = m.name.trim();
    const first = firstName(full);
    const sharesFirst = people.filter((p) => eqName(firstName(p.name), first)).length > 1;
    const exact = riders.find((r) => eqName(r.name, full))?.name;
    const byFirst = sharesFirst ? null : riders.filter((r) => eqName(firstName(r.name), first));
    const uniqueFirst = byFirst && byFirst.length === 1 ? byFirst[0].name : null;
    const name = exact || uniqueFirst || (sharesFirst || !first ? full : first);
    return { name, memberId: m.id, member: m };
  }).filter((r, i, arr) => arr.findIndex((x) => eqName(x.name, r.name)) === i)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export function planGrid(rota, rows) {
  const grid = {};
  for (const r of rows) {
    const rider = (rota?.riders || []).find((x) => eqName(x.name, r.name));
    grid[r.name] = {};
    for (const d of WEEKDAYS) grid[r.name][d] = rider?.days?.[d] || "none";
  }
  return grid;
}

export function cyclePlanStatus(s) {
  return s === "working" ? "none" : "working";
}

export function holidayPlanStatus(s) {
  return s === "holiday" ? "none" : "holiday";
}

export function contractedGrid(rows, current) {
  const grid = {};
  for (const r of rows) {
    const days = new Set((r.member?.days || []).map(normaliseDay));
    grid[r.name] = {};
    for (const d of WEEKDAYS) {
      const cur = current?.[r.name]?.[d];
      if (cur === "holiday" || cur === "pending") grid[r.name][d] = cur;
      else grid[r.name][d] = days.has(d) ? "working" : "none";
    }
  }
  return grid;
}

function normaliseDay(s) {
  const t = String(s || "").trim().toLowerCase();
  const map = { mon: "Monday", monday: "Monday", tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday",
    wed: "Wednesday", wednesday: "Wednesday", thu: "Thursday", thur: "Thursday", thursday: "Thursday",
    fri: "Friday", friday: "Friday" };
  return map[t] || (WEEKDAYS.find((d) => d.toLowerCase() === t) || s);
}

export function daysLabel(days) {
  const norm = (days || []).map(normaliseDay).filter((d) => WEEKDAYS.includes(d));
  if (norm.length === 5) return "Mon–Fri";
  const short = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri" };
  return norm.map((d) => short[d]).join("·") || "As needed";
}

export function appendCheckout(checkoutsRoot, record) {
  const data = structuredClone(checkoutsRoot && typeof checkoutsRoot === "object" ? checkoutsRoot : { checkouts: [] });
  if (!Array.isArray(data.checkouts)) {
    if (Array.isArray(data.records)) {
      data.records.push(record);
      return data;
    }
    data.checkouts = [];
  }
  data.checkouts.push(record);
  return data;
}

export function upsertStaff(staffRoot, member) {
  const data = structuredClone(staffRoot && typeof staffRoot === "object" ? staffRoot : { staff: [] });
  if (!Array.isArray(data.staff)) data.staff = [];
  const i = data.staff.findIndex((s) => (member.id && s.id === member.id) || eqName(s.name, member.name));
  if (i >= 0) data.staff[i] = { ...data.staff[i], ...member };
  else data.staff.push(member);
  return data;
}

export function setStaffActive(staffRoot, idOrName, active) {
  const data = structuredClone(staffRoot && typeof staffRoot === "object" ? staffRoot : { staff: [] });
  if (!Array.isArray(data.staff)) data.staff = [];
  let found = false;
  data.staff = data.staff.map((s) => {
    if (s.id === idOrName || eqName(s.name, idOrName)) {
      found = true;
      return { ...s, active };
    }
    return s;
  });
  if (!found) data.staff.push({ id: slugName(idOrName), name: idOrName, active, source: "app" });
  return data;
}

export function appendItem(itemsRoot, item) {
  const data = structuredClone(itemsRoot && typeof itemsRoot === "object" ? itemsRoot : { items: [] });
  if (!Array.isArray(data.items)) data.items = [];
  data.items.push(item);
  return data;
}

export function repairsToJson(list) {
  return { repairs: (list || []).map((r) => ({
    id: r.id,
    itemId: r.itemId || "",
    barcode: r.barcode || "",
    bike: r.bike || "",
    type: r.type || "other",
    note: r.note || "",
    offRoad: Boolean(r.offRoad),
    loggedAt: r.loggedAt,
    loggedBy: r.loggedBy,
    fixedAt: r.fixedAt || "",
    fixedBy: r.fixedBy || "",
  })) };
}

export function upsertStockCount(countsRoot, row) {
  const data = structuredClone(countsRoot && typeof countsRoot === "object" ? countsRoot : { counts: [] });
  if (!Array.isArray(data.counts)) data.counts = [];
  const i = data.counts.findIndex((c) => c.id === row.id);
  if (i >= 0) data.counts[i] = { ...data.counts[i], ...row };
  else data.counts.push(row);
  return data;
}

export function attentionItems({ fleet, items, repairs, stock, rotas, today }) {
  const out = [];
  const applied = applyRepairsToFleet(fleet, items, repairs);
  for (const b of applied) {
    if (b.displayStatus === "off_road") out.push({ kind: "off_road", title: b.name, detail: "Off the road", id: b.id });
    else if (b.displayStatus === "needs_repair") {
      const types = (b.openRepairs || []).map((r) => r.type).join(", ");
      out.push({ kind: "repair", title: b.name, detail: types ? `Needs repair · ${types}` : "Needs repair", id: b.id });
    }
  }
  const bats = (items || []).filter((i) => i.kind === "battery" && (i.outOfService || i.status === "broken"));
  for (const b of bats) out.push({ kind: "battery", title: titleItem(b), detail: "Broken", id: b.id });
  for (const p of stock || []) {
    if (p.reorderAt != null && p.qty <= p.reorderAt) {
      out.push({ kind: "stock", title: p.name, detail: `Low stock · ${p.qty} left`, id: p.id });
    }
  }
  const thisMonday = mondayOf(today);
  for (const rota of rotas || []) {
    if (rota.weekStarting && rota.weekStarting < thisMonday) continue;
    for (const r of rota.riders || []) {
      for (const d of WEEKDAYS) {
        if (r.days?.[d] === "pending") out.push({ kind: "holiday", title: r.name, detail: `Holiday pending · ${d}`, id: r.name + d });
      }
    }
  }
  return out;
}

export function nextNumber(items, kind) {
  const nums = (items || []).filter((i) => i.kind === kind).map((i) => parseInt(i.number, 10)).filter((n) => Number.isFinite(n));
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

export { formatShort };
