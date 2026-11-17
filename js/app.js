/** App controller: PIN unlock, routing, data load, and writes. */

import { FILES, PIN_LENGTH, REPAIR_TYPES } from "./config.js";
import { addDays, londonNowIso, londonToday, mondayOf } from "./date.js";
import {
  appendCheckout, appendItem, applyRotaEditsToFeed, bikeForBarcode, contractedGrid,
  cyclePlanStatus, effectiveStaff, heldByOther, holidayPlanStatus, itemForBarcode,
  itemForBike, mergeBikeDetails, mergeStock, newRepairId, addRepair, markFixed,
  nextNumber, planChanges, planGrid, planRows, repairsToJson, requireFree,
  setStaffActive, slugName, tapFilter, titleItem, upsertStaff, upsertStockCount,
} from "./logic.js";
import {
  parseBikeDetails, parseCheckouts, parseFeed, parseFleet, parseItems, parseOptimo,
  parseRepairs, parseStaffFile, parseStock, parseStockCounts, parseStockDetails,
  normaliseBarcode,
} from "./parse.js";
import { commitFile, loadAll, pollDataRevision, rememberRevision, clearDataCache } from "./api.js";
import {
  getActor, isUnlocked, loadVault, lock as lockSession, unlockWithPin, unlockWithToken,
} from "./auth.js";
import { render } from "./ui.js";

const root = document.getElementById("app");

const state = {
  unlocked: false,
  pin: "",
  pinError: "",
  pinShake: false,
  pinBusy: false,
  remember: false,
  failCount: 0,
  actor: getActor(),
  page: "home",
  kitTab: "bikes",
  fleetTab: "bikes",
  adminTab: "staff",
  fleetFilters: [],
  bikeFilter: "all",
  batFilter: "all",
  partsFilter: "parts",
  search: "",
  notice: null,
  selectedBike: null,
  selectedBattery: null,
  selectedProfile: null,
  profileTab: "kit",
  profileShowAllKit: false,
  selectedDay: null,
  attentionOpen: false,
  insightsOpen: false,
  weekMonday: mondayOf(londonToday()),
  planMonday: mondayOf(londonToday()),
  planGrid: null,
  kitMonth: monthFrom(londonToday()),
  today: londonToday(),
  data: emptyData(),
  loading: false,
  loadError: "",
  modal: null,
  toast: "",
  outToday: null,
};

let toastTimer = 0;
let shakeTimer = 0;

function monthFrom(iso) {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) };
}

function emptyData() {
  return { staff: [], items: [], checkouts: [], fleet: [], stock: [], repairs: [], rotas: [], optimo: { riders: [], week: {} }, raw: {} };
}

function routeFromHash() {
  const h = (location.hash || "#/home").replace(/^#\/?/, "");
  const [page, sub] = h.split("/");
  const allowed = new Set(["home", "rota", "kit", "fleet", "admin"]);
  state.page = allowed.has(page) ? page : "home";
  if (state.page === "fleet") {
    state.page = "kit";
    state.kitTab = sub === "batteries" ? "batteries" : "bikes";
  } else if (state.page === "kit" && sub && ["history", "bikes", "batteries", "parts", "inventory"].includes(sub)) {
    state.kitTab = sub === "inventory" ? "bikes" : sub;
  }
  if (state.page === "admin" && sub) state.adminTab = sub === "rota" ? "rota" : "staff";
}

const REFRESH_MS = 20_000;
let refreshTimer = null;
let refreshing = false;
let writing = false;

function snapshotScroll() {
  const content = document.querySelector(".content");
  const side = document.querySelector(".side-panel");
  const profile = document.querySelector(".profile-panel");
  return { content: content ? content.scrollTop : 0, side: side ? side.scrollTop : 0, profile: profile ? profile.scrollTop : 0 };
}

function restoreScroll(s) {
  if (!s) return;
  const content = document.querySelector(".content");
  const side = document.querySelector(".side-panel");
  if (content) content.scrollTop = s.content;
  if (side) side.scrollTop = s.side;
  const profile = document.querySelector(".profile-panel");
  if (profile && s.profile != null) profile.scrollTop = s.profile;
}

function interactionBusy() {
  if (state.modal) return true;
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return false;
  if (el.matches("input, textarea, select")) return true;
  if (el.closest("form[data-action]")) return true;
  return false;
}

function paint(opts = {}) {
  if (!root) return;
  const scroll = opts.preserveScroll ? snapshotScroll() : null;
  const pinInputFocused = document.activeElement && document.activeElement.id === "pin-input";
  const pinVal = pinInputFocused ? document.activeElement.value : null;
  const qEl = document.activeElement && document.activeElement.matches?.("input[name=q]") ? document.activeElement : null;
  const qPos = qEl ? qEl.selectionStart : null;
  root.innerHTML = render(state);
  if (!state.unlocked) {
    const input = document.getElementById("pin-input");
    if (input) {
      if (pinVal != null && !state.pinBusy) input.value = state.pin;
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* ignore */ }
    }
  } else {
    if (scroll) restoreScroll(scroll);
    if (qEl) {
      const nq = document.querySelector("input[name=q]");
      if (nq) {
        nq.focus();
        try { nq.setSelectionRange(qPos, qPos); } catch { /* ignore */ }
      }
    }
  }
}

async function saveFile(path, message, mutator, opts) {
  writing = true;
  try {
    return await commitFile(path, message, mutator, opts);
  } finally {
    writing = false;
  }
}

async function quietRefresh({ force = false } = {}) {
  if (!state.unlocked || state.pinBusy || state.loading || writing || refreshing) return;
  refreshing = true;
  try {
    const today = londonToday();
    let changed = force;
    if (!force) {
      try {
        const rev = await pollDataRevision();
        if (rev.changed) changed = true;
        if (rev.sha) rememberRevision(rev.sha);
      } catch {
        return;
      }
    }
    const dayRolled = today !== state.today;
    if (!changed && !dayRolled) return;
    if (changed) {
      const files = await loadAll(Object.values(FILES));
      parseData(files);
    } else {
      state.today = today;
      const held = new Set();
      for (const rec of state.data.checkouts || []) {
        if (rec.date === today) held.add(rec.riderId || rec.riderName);
      }
      state.outToday = held.size;
    }
    if (interactionBusy()) return;
    paint({ preserveScroll: true });
  } finally {
    refreshing = false;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") quietRefresh();
  }, REFRESH_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function onVisibility() {
  if (!state.unlocked) return;
  if (document.visibilityState === "visible") {
    quietRefresh();
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function toast(msg) {
  state.toast = msg;
  paint();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ""; paint(); }, 3200);
}

function parseData(files) {
  const text = (name) => files[name]?.text || "";
  const feed = parseFeed(text(FILES.feed));
  const overlay = parseStaffFile(text(FILES.staff));
  const staff = effectiveStaff(feed.staff, overlay);
  const items = parseItems(text(FILES.items));
  const checkouts = parseCheckouts(text(FILES.checkouts));
  const fleet = mergeBikeDetails(parseFleet(text(FILES.fleet)), parseBikeDetails(text(FILES.bikeDetails)));
  const stock = mergeStock(parseStock(text(FILES.stock)), parseStockDetails(text(FILES.stockDetails)), parseStockCounts(text(FILES.stockCounts)));
  const repairs = parseRepairs(text(FILES.repairs));
  const optimo = parseOptimo(text(FILES.optimo));
  const today = londonToday();
  const heldRiders = new Set();
  for (const rec of checkouts) {
    if (rec.date === today) heldRiders.add(rec.riderId || rec.riderName);
  }
  state.today = today;
  state.data = { staff, items, checkouts, fleet, stock, repairs, rotas: feed.rotas, optimo, raw: { feed: files[FILES.feed], items: files[FILES.items], checkouts: files[FILES.checkouts], staff: files[FILES.staff], repairs: files[FILES.repairs], stockCounts: files[FILES.stockCounts] } };
  state.outToday = heldRiders.size;
  if (!state.selectedDay) state.selectedDay = today;
}

async function refresh() {
  state.loading = true;
  state.loadError = "";
  paint();
  try {
    const files = await loadAll(Object.values(FILES));
    parseData(files);
  } catch (err) {
    state.loadError = err.message || "Could not load data.";
  } finally {
    state.loading = false;
    paint();
  }
}

async function unlockFlow() {
  if (state.pinBusy) return;
  const pin = state.pin;
  if (pin.length !== PIN_LENGTH) {
    state.pinError = `Enter the ${PIN_LENGTH}-digit PIN.`;
    bumpShake();
    paint();
    return;
  }
  const delay = failDelay(state.failCount);
  state.pinBusy = true;
  state.pinError = "";
  paint();
  if (delay) await wait(delay);
  try {
    await unlockWithPin(pin, { remember: state.remember });
    state.unlocked = true;
    state.pin = "";
    state.failCount = 0;
    state.pinError = "";
    paint();
    await refresh();
    startAutoRefresh();
  } catch (err) {
    state.failCount += 1;
    state.pin = "";
    state.pinError = err.code === "UNCONFIGURED"
      ? "The PIN has not been set up on this site yet."
      : "Wrong PIN. Try again.";
    bumpShake();
    state.pinBusy = false;
    paint();
    return;
  }
  state.pinBusy = false;
}

function failDelay(fails) {
  if (fails >= 5) return 4000;
  if (fails >= 3) return 1500;
  return 0;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function bumpShake() {
  state.pinShake = true;
  paint();
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => { state.pinShake = false; paint(); }, 450);
}

function addDigit(d) {
  if (state.pinBusy) return;
  if (state.pin.length >= PIN_LENGTH) return;
  state.pin += String(d);
  state.pinError = "";
  paint();
  if (state.pin.length === PIN_LENGTH) unlockFlow();
}

function handleAction(ev) {
  const t = ev.target.closest("[data-action]");
  if (!t) return;
  const action = t.getAttribute("data-action");
  if (action === "close-modal" && ev.target.closest(".modal") && ev.target !== t) return;
  if (action === "close-profile" && ev.target.closest(".profile-panel") && ev.target !== t) return;

  switch (action) {
    case "pin-digit": ev.preventDefault(); addDigit(t.dataset.digit); break;
    case "pin-back": ev.preventDefault(); state.pin = state.pin.slice(0, -1); state.pinError = ""; paint(); break;
    case "pin-ok": ev.preventDefault(); unlockFlow(); break;
    case "toggle-remember": state.remember = t.checked; break;
    case "lock": ev.preventDefault(); stopAutoRefresh(); lockSession(); clearDataCache(); state.unlocked = false; state.pin = ""; state.data = emptyData(); paint(); break;
    case "nav": /* hash change handles it */ break;
    case "rota-week": ev.preventDefault(); state.weekMonday = t.dataset.monday; paint(); break;
    case "kit-tab": ev.preventDefault(); state.kitTab = t.dataset.tab; location.hash = `#/kit/${state.kitTab}`; paint(); break;
    case "kit-history": ev.preventDefault();
      if (state.kitTab === "history") {
        state.kitTab = state.kitListTab || "bikes";
      } else {
        state.kitListTab = state.kitTab || "bikes";
        state.kitTab = "history";
      }
      location.hash = `#/kit/${state.kitTab}`;
      paint();
      break;
    case "kit-month": ev.preventDefault(); state.kitMonth = { y: +t.dataset.y, m: +t.dataset.m }; paint(); break;
    case "cal-day": ev.preventDefault(); state.selectedDay = t.dataset.date; paint(); break;
    case "fleet-tab": ev.preventDefault(); state.kitTab = t.dataset.tab; location.hash = `#/kit/${state.kitTab}`; paint(); break;
    case "fleet-filter":
    case "kit-filter": ev.preventDefault(); toggleFilter(t.dataset.filter); paint(); break;
    case "open-bike": ev.preventDefault(); state.selectedBike = t.dataset.id; state.page = "kit"; state.kitTab = "bikes"; location.hash = "#/kit/bikes"; paint(); break;
    case "open-battery": ev.preventDefault(); state.selectedBattery = t.dataset.id; state.page = "kit"; state.kitTab = "batteries"; location.hash = "#/kit/batteries"; paint(); break;
    case "close-detail": ev.preventDefault(); state.selectedBike = null; state.selectedBattery = null; paint(); break;
    case "open-profile": ev.preventDefault(); state.selectedProfile = { id: t.dataset.id || "", name: t.dataset.name || "" }; state.profileTab = "kit"; state.profileShowAllKit = false; paint(); break;
    case "close-profile": ev.preventDefault(); if (ev.target.closest(".profile-panel") && ev.target !== t) break; state.selectedProfile = null; paint(); break;
    case "profile-tab": ev.preventDefault(); state.profileTab = t.dataset.tab; paint(); break;
    case "profile-kit-more": ev.preventDefault(); state.profileShowAllKit = !state.profileShowAllKit; paint(); break;
    case "profile-open-rota": ev.preventDefault(); state.selectedProfile = null; state.page = "rota"; location.hash = "#/rota"; paint(); break;
    case "profile-open-history": ev.preventDefault(); state.selectedProfile = null; state.kitListTab = state.kitTab || "bikes"; state.kitTab = "history"; state.page = "kit"; location.hash = "#/kit/history"; paint(); break;
    case "attention-more": ev.preventDefault(); state.attentionOpen = !state.attentionOpen; paint(); break;
    case "insights-open": ev.preventDefault(); state.insightsOpen = !state.insightsOpen; paint(); break;
    case "focus-search": ev.preventDefault(); document.querySelector("input[name=q]")?.focus(); break;
    case "plan-copy-last": ev.preventDefault(); copyLastWeek(); break;
    case "log-repair": ev.preventDefault(); openRepair(t.dataset.id); break;
    case "close-modal": ev.preventDefault(); state.modal = null; paint(); break;
    case "open-register": ev.preventDefault(); state.modal = { type: "register", barcode: state.notice?.barcode || "", unregistered: Boolean(state.notice?.barcode), kind: "bike" }; paint(); break;
    case "assign-open": ev.preventDefault(); state.modal = { type: "assign", riderId: t.dataset.rider, riderName: t.dataset.name, barcode: "" }; paint(); break;
    case "staff-add": ev.preventDefault(); state.modal = { type: "staff-add" }; paint(); break;
    case "admin-tab": ev.preventDefault(); state.adminTab = t.dataset.tab; location.hash = state.adminTab === "rota" ? "#/admin/rota" : "#/admin"; paint(); break;
    case "plan-week": ev.preventDefault(); state.planMonday = t.dataset.monday; state.planGrid = null; paint(); break;
    case "plan-cell": ev.preventDefault(); togglePlan(t.dataset.name, t.dataset.day, ev.button === 2 || ev.shiftKey); break;
    case "plan-contracted": ev.preventDefault(); applyContracted(); break;
    case "plan-save": ev.preventDefault(); savePlan(); break;
    case "mark-fixed": ev.preventDefault(); fixRepair(t.dataset.id); break;
    case "staff-remove": ev.preventDefault(); changeStaffActive(t.dataset.id, t.dataset.name, false); break;
    case "staff-restore": ev.preventDefault(); changeStaffActive(t.dataset.id, t.dataset.name, true); break;
    case "count-part": ev.preventDefault(); changePartCount(t.dataset.id, Number(t.dataset.delta)); break;
    default: break;
  }
}

function toggleFilter(key) {
  const tab = state.kitTab || "bikes";
  if (tab === "batteries") state.batFilter = tapFilter(state.batFilter || "all", key, "all");
  else if (tab === "parts") state.partsFilter = tapFilter(state.partsFilter || "parts", key, "parts");
  else state.bikeFilter = tapFilter(state.bikeFilter || "all", key, "all");
}

function openRepair(bikeId) {
  const bike = (state.data.fleet || []).find((b) => b.id === bikeId);
  state.modal = { type: "repair", bikeId, bikeName: bike?.name || bikeId, repairType: "brakes" };
  paint();
}

function ensurePlanGrid() {
  if (state.planGrid) return state.planGrid;
  const rota = (state.data.rotas || []).find((r) => r.weekStarting === state.planMonday);
  const rows = planRows(state.data.staff, rota);
  state.planGrid = planGrid(rota, rows);
  return state.planGrid;
}

function togglePlan(name, day, holiday) {
  const grid = structuredClone(ensurePlanGrid());
  const cur = grid[name]?.[day] || "none";
  if (!grid[name]) grid[name] = {};
  grid[name][day] = holiday ? holidayPlanStatus(cur) : cyclePlanStatus(cur);
  state.planGrid = grid;
  paint();
}

function applyContracted() {
  const rota = (state.data.rotas || []).find((r) => r.weekStarting === state.planMonday);
  const rows = planRows(state.data.staff, rota);
  const current = ensurePlanGrid();
  state.planGrid = contractedGrid(rows, current);
  paint();
}

function copyLastWeek() {
  const monday = state.planMonday;
  const prev = addDays(monday, -7);
  const prevRota = (state.data.rotas || []).find((r) => r.weekStarting === prev);
  if (!prevRota) { toast("No rota found for last week."); return; }
  const rows = planRows(state.data.staff, prevRota);
  state.planGrid = planGrid(prevRota, rows);
  paint();
}


async function savePlan() {
  const monday = state.planMonday;
  const rota = (state.data.rotas || []).find((r) => r.weekStarting === monday);
  const rows = planRows(state.data.staff, rota);
  const saved = planGrid(rota, rows);
  const edited = state.planGrid || saved;
  const edits = planChanges(monday, saved, edited);
  if (!edits.length) { toast("No changes to save."); return; }
  const by = getActor();
  const at = londonNowIso();
  try {
    await saveFile(FILES.feed, "Update rota (Plan rota, web)", (json, text) => {
      const root = json || { updates: [], staff: [], rotas: [] };
      return applyRotaEditsToFeed(root, edits, by, at);
    }, { rotaWrite: true });
    toast("Rota saved.");
    state.planGrid = null;
    await refresh();
  } catch (err) {
    toast(err.message || "Could not save the rota.");
  }
}

async function fixRepair(id) {
  const by = getActor();
  const at = londonNowIso();
  try {
    await saveFile(FILES.repairs, "Mark repair fixed (web)", (json) => {
      const list = markFixed((json && json.repairs) || state.data.repairs, id, at, by);
      return repairsToJson(list);
    });
    toast("Marked as fixed.");
    await refresh();
  } catch (err) {
    toast(err.message || "Could not update the repair.");
  }
}

async function changeStaffActive(id, name, active) {
  const key = id || name;
  try {
    await saveFile(FILES.staff, active ? "Restore staff (web)" : "Remove staff (web)", (json) =>
      setStaffActive(json || { staff: [] }, key, active));
    toast(active ? `${name} restored.` : `${name} hidden from the current rota.`);
    await refresh();
  } catch (err) {
    toast(err.message || "Could not update staff.");
  }
}

async function changePartCount(id, delta) {
  const part = (state.data.stock || []).find((p) => p.id === id);
  if (!part) return;
  const qty = Math.max(0, (part.qty || 0) + delta);
  try {
    await saveFile(FILES.stockCounts, "Update stock count (web)", (json) =>
      upsertStockCount(json || { counts: [] }, { id, qty, countedAt: londonNowIso(), countedBy: getActor() }));
    await refresh();
  } catch (err) {
    toast(err.message || "Could not update the count.");
  }
}

function handleSubmit(ev) {
  const form = ev.target.closest("form[data-action]");
  if (!form) return;
  ev.preventDefault();
  const action = form.getAttribute("data-action");
  const fd = new FormData(form);
  if (action === "fallback-form") {
    try {
      unlockWithToken(String(fd.get("token") || ""), { remember: state.remember });
      state.unlocked = true;
      state.pin = "";
      paint();
      refresh().then(() => startAutoRefresh());
    } catch (err) {
      state.pinError = err.message || "Could not connect.";
      paint();
    }
    return;
  }
  if (action === "search-form") {
    state.search = String(fd.get("q") || "").trim();
    handleSearch(state.search);
    return;
  }
  if (action === "save-repair") { saveRepair(fd); return; }
  if (action === "save-register") { saveRegister(fd); return; }
  if (action === "save-assign") { saveAssign(fd); return; }
  if (action === "save-staff") { saveStaff(fd); return; }
}

async function saveRepair(fd) {
  const bikeId = String(fd.get("bikeId") || "");
  const bike = (state.data.fleet || []).find((b) => b.id === bikeId);
  const item = itemForBike(state.data.items, bike);
  const repair = {
    id: newRepairId(),
    itemId: item?.id || "",
    barcode: item?.barcode || bike?.barcode || "",
    bike: bike?.name || bikeId,
    type: String(fd.get("type") || "other"),
    note: String(fd.get("note") || "").trim(),
    offRoad: String(fd.get("offRoad")) === "yes",
    loggedAt: londonNowIso(),
    loggedBy: getActor(),
    fixedAt: "",
    fixedBy: "",
  };
  try {
    await saveFile(FILES.repairs, "Log repair (web)", (json) => {
      const list = addRepair((json && json.repairs) || state.data.repairs, repair);
      return repairsToJson(list);
    });
    state.modal = null;
    toast("Repair logged.");
    await refresh();
  } catch (err) {
    toast(err.message || "Could not save the repair.");
  }
}

async function saveRegister(fd) {
  const kind = String(fd.get("kind") || "other");
  const number = String(fd.get("number") || "").trim();
  const barcode = normaliseBarcode(fd.get("barcode"));
  const name = String(fd.get("name") || "").trim();
  if (!barcode) { toast("Enter a barcode."); return; }
  if (itemForBarcode(state.data.items, barcode)) { toast("That barcode is already registered."); return; }
  const item = {
    id: slugName(`${kind}-${number || barcode}`),
    type: kind,
    number,
    name: name || titleItem({ type: kind, number, name }),
    barcode,
    status: "ok",
  };
  try {
    await saveFile(FILES.items, "Register item (web)", (json) => appendItem(json || { items: [] }, item));
    state.modal = null;
    state.notice = null;
    toast(`${titleItem(item)} registered.`);
    await refresh();
  } catch (err) {
    toast(err.message || "Could not register the item.");
  }
}

async function saveAssign(fd) {
  const riderId = String(fd.get("riderId") || "");
  const rider = (state.data.staff || []).find((s) => s.id === riderId);
  const riderName = rider?.name || "";
  const barcode = normaliseBarcode(fd.get("barcode"));
  if (!rider) { toast("Pick a rider."); return; }
  if (!barcode) { toast("Enter a barcode."); return; }
  let item = itemForBarcode(state.data.items, barcode);
  if (!item) {
    state.modal = null;
    state.notice = {
      title: "Unregistered barcode",
      detail: barcode,
      barcode,
      action: "open-register",
      actionLabel: "Register item",
    };
    paint();
    return;
  }
  try {
    requireFree([item], riderId, riderName, state.data.checkouts, state.today);
  } catch (err) {
    toast(err.message);
    return;
  }
  const record = {
    id: "co-" + Date.now().toString(36),
    riderId,
    riderName,
    date: state.today,
    at: londonNowIso(),
    by: getActor(),
    items: [{ barcode: item.barcode, type: item.type, number: item.number, name: item.name }],
  };
  try {
    await saveFile(FILES.checkouts, "Assign kit (web)", (json, text) => {
      const fresh = json || { checkouts: [] };
      const recs = (fresh.checkouts || fresh.records || []);
      // Re-check against the freshly fetched file.
      const other = heldByOther(item.barcode, riderId, riderName, recs.map((o) => ({
        riderId: o.riderId, riderName: o.riderName || o.name, date: o.date,
        items: o.items || [],
      })), state.today);
      if (other) throw new Error(`${titleItem(item)} is already with ${other.riderName}`);
      return appendCheckout(fresh, record);
    });
    state.modal = null;
    toast(`Assigned ${titleItem(item)} to ${riderName}.`);
    await refresh();
  } catch (err) {
    toast(err.message || "Could not assign the item.");
  }
}

async function saveStaff(fd) {
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  const days = String(fd.get("days") || "").split(/[,\s]+/).filter(Boolean);
  const member = {
    id: slugName(name),
    name,
    role: String(fd.get("role") || "Rider"),
    days,
    active: true,
    source: "app",
    addedAt: londonNowIso(),
    addedBy: getActor(),
  };
  try {
    await saveFile(FILES.staff, "Add staff (web)", (json) => upsertStaff(json || { staff: [] }, member));
    state.modal = null;
    toast(`${name} added.`);
    await refresh();
  } catch (err) {
    toast(err.message || "Could not add the rider.");
  }
}

function handleSearch(raw) {
  const code = normaliseBarcode(raw);
  if (!code) return;
  const item = itemForBarcode(state.data.items, code);
  const bike = bikeForBarcode(state.data.fleet, state.data.items, code);
  if (bike) {
    state.notice = null;
    state.page = "kit";
    state.kitTab = "bikes";
    state.selectedBike = bike.id;
    location.hash = "#/kit/bikes";
    paint();
    return;
  }
  if (item) {
    const kind = (item.kind || "").includes("batter") || (item.type || "").toLowerCase().includes("batter") ? "batteries" : "bikes";
    if (item.kind === "battery" || /batter/i.test(item.type || "")) {
      state.notice = null;
      state.page = "kit";
      state.kitTab = "batteries";
      state.selectedBattery = item.id;
      location.hash = "#/kit/batteries";
      paint();
      return;
    }
    state.notice = { title: titleItem(item), detail: "Registered. Assign it to a rider?", barcode: code, action: "assign-open", actionLabel: "Assign" };
    paint();
    return;
  }
  state.notice = {
    title: "Unregistered barcode",
    detail: code,
    barcode: code,
    action: "open-register",
    actionLabel: "Register item",
  };
  paint();
}

function onSearchInput(ev) {
  const el = ev.target;
  if (!el || !el.matches?.("input[name=q]")) return;
  state.search = el.value;
  paint({ preserveScroll: true });
}

function onKeydown(ev) {
  if (!state.unlocked) {
    if (ev.key === "Backspace") {
      ev.preventDefault();
      state.pin = state.pin.slice(0, -1);
      state.pinError = "";
      paint();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      unlockFlow();
    } else if (/^\d$/.test(ev.key)) {
      ev.preventDefault();
      addDigit(ev.key);
    }
    return;
  }
  if (ev.key === "Escape" && state.modal) {
    state.modal = null;
    paint();
  }
}

function onContextMenu(ev) {
  const t = ev.target.closest("[data-action='plan-cell']");
  if (!t) return;
  ev.preventDefault();
  togglePlan(t.dataset.name, t.dataset.day, true);
}

async function start() {
  routeFromHash();
  state.unlocked = isUnlocked();
  paint();
  if (state.unlocked) {
    await refresh();
    startAutoRefresh();
  } else {
    await loadVault().catch(() => {});
  }
}

window.addEventListener("hashchange", () => { routeFromHash(); paint(); });
document.addEventListener("visibilitychange", onVisibility);
document.addEventListener("click", handleAction);
document.addEventListener("input", onSearchInput);
document.addEventListener("submit", handleSubmit);
document.addEventListener("keydown", onKeydown);
document.addEventListener("contextmenu", onContextMenu);
document.addEventListener("change", (ev) => {
  if (ev.target.matches("[data-action='toggle-remember']")) state.remember = ev.target.checked;
});

start();
