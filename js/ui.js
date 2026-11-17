/** HTML renderers. All event hooks are data-action attributes, bound in app.js. */

import { ITEM_KINDS, PIN_LENGTH, REPAIR_TYPES } from "./config.js";
import {
  addDays, currentPeriod, formatClock, formatDateTime, formatLong, formatShort,
  formatWeekLabel, mondayIndex, mondayOf, monthGrid, monthName, parseYmd,
} from "./date.js";
import {
  WEEKDAYS, assignmentHistory, attentionItems, bikeDisplayStatus, currentKitByRider,
  daysLabel, displayCount, extraPeriod, extraToday, extraWeek, forDisplay, historyRepairs,
  holderForItem, inventorySummary, itemForBike, kitLines, needsRepairBike, nextNumber,
  openRepairs, planChanges, planGrid, planRows, removedStaff, repairsForBike, riderDays,
  titleItem, visibleRota, whatsAppUrl,
} from "./logic.js";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const PATHS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h5l3 8M10 8H8M14 8l-3 8"/>',
  batt: '<rect x="7" y="4" width="10" height="17" rx="2"/><path d="M10 2h4M12 9l-2 4h4l-2 4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.3-.6-.6-2.3z"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  userx: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M17 8l5 5M22 8l-5 5"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
};

function ic(n, s = 18) {
  return `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[n] || ""}</svg>`;
}

const initials = (name) => esc((name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase());

function avClass(name) {
  const colors = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"];
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

function iconForKind(type) {
  if (type === "bike") return "bike";
  if (type === "battery") return "batt";
  if (type === "phone") return "phone";
  return "box";
}

function kitChips(lines) {
  if (!lines?.length) return `<span class="none">Nothing assigned</span>`;
  return lines.map((k) => `<span class="chip">${ic(iconForKind(k.type), 13)}${esc(k.numbers || k.text)}</span>`).join("");
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW_LONG = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function formatWeekdayLong(iso) {
  const p = parseYmd(iso);
  if (!p) return iso || "";
  return `${DOW_LONG[mondayIndex(iso)]} ${p.d} ${MONTHS[p.m - 1]}`;
}

function formatWeekSpan(monday) {
  const end = addDays(monday, 4);
  const a = parseYmd(monday);
  const b = parseYmd(end);
  if (!a || !b) return formatWeekLabel(monday);
  if (a.m === b.m && a.y === b.y) return `${a.d} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

function formatRangeShort(start, endInclusive) {
  const a = parseYmd(start);
  const b = parseYmd(endInclusive);
  if (!a || !b) return "";
  if (a.y === b.y) return `${a.d} ${MONTHS_SHORT[a.m - 1]} – ${b.d} ${MONTHS_SHORT[b.m - 1]}`;
  return `${a.d} ${MONTHS_SHORT[a.m - 1]} ${a.y} – ${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
}

function weekOfPeriod(monday, today) {
  const p = currentPeriod(today);
  const first = mondayOf(p.start);
  const last = mondayOf(addDays(p.end, -1));
  const total = Math.max(1, Math.round((Date.parse(last) - Date.parse(first)) / 86400000 / 7) + 1);
  const idx = Math.max(1, Math.round((Date.parse(monday) - Date.parse(first)) / 86400000 / 7) + 1);
  return { idx: Math.min(idx, total), total };
}

function sumCounts(values) {
  const nums = values.filter((n) => n != null);
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0);
}

function searchBox(state, placeholder) {
  return `
  <form class="search" data-action="search-form">
    ${ic("scan", 18)}
    <input type="text" name="q" value="${esc(state.search || "")}" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="off" spellcheck="false">
    <button type="button" class="cam" data-action="focus-search" aria-label="Focus the search box">${ic("cam", 16)}</button>
  </form>`;
}

function outPill(state) {
  const n = state.outToday != null ? state.outToday : 0;
  return `<div class="pill"><span class="outdot"></span>${n} out today</div>`;
}

export function render(state) {
  if (!state.unlocked) return renderPin(state);
  return renderShell(state);
}

function renderPin(state) {
  const pin = state.pin || "";
  const dots = Array.from({ length: PIN_LENGTH }, (_, i) =>
    `<span class="${i < pin.length ? "filled" : ""}"></span>`).join("");
  const err = state.pinError ? `<p class="error" role="alert">${esc(state.pinError)}</p>` : "";
  const busy = state.pinBusy ? `<p class="muted">Checking…</p>` : "";
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "back", 0, "ok"].map((k) => {
    if (k === "back") return `<button type="button" class="back" data-action="pin-back" aria-label="Delete">←</button>`;
    if (k === "ok") return `<button type="button" class="ok" data-action="pin-ok" ${state.pinBusy ? "disabled" : ""}>OK</button>`;
    return `<button type="button" data-action="pin-digit" data-digit="${k}" ${state.pinBusy ? "disabled" : ""}>${k}</button>`;
  }).join("");
  return `
  <div class="app">
    <div class="landing">
      <div class="panel pin-card ${state.pinShake ? "shake" : ""}" id="pin-card">
        <div class="mark">N</div>
        <h1>Nonna Updates</h1>
        <p class="muted">Enter your PIN</p>
        <div class="pin-dots" aria-hidden="true">${dots}</div>
        <input class="sr-only" id="pin-input" inputmode="numeric" autocomplete="one-time-code" maxlength="${PIN_LENGTH}" value="${esc(pin)}" aria-label="PIN">
        <div class="pad">${keys}</div>
        <label class="remember"><input type="checkbox" data-action="toggle-remember" ${state.remember ? "checked" : ""}> Remember this device</label>
        ${busy}${err}
        <details class="fallback">
          <summary>Use a GitHub key instead</summary>
          <form data-action="fallback-form" class="field" style="text-align:left;margin-top:12px">
            <label>Fine-grained GitHub token (data repo only)</label>
            <textarea name="token" rows="3" placeholder="github_pat_…" autocomplete="off"></textarea>
            <div class="actions"><button class="btn" type="submit">Connect</button></div>
          </form>
        </details>
      </div>
    </div>
  </div>`;
}

function renderShell(state) {
  const page = state.page || "home";
  const navItem = (id, label, icon) =>
    `<a href="#/${id}" class="${page === id ? "on" : ""}" data-action="nav" data-page="${id}">${ic(icon, 18)}${label}</a>`;
  const actor = state.actor || "Sam";
  return `
  <div class="app">
    <div class="chrome">
      <div class="traffic" aria-hidden="true"><i class="r"></i><i class="a"></i><i class="g"></i></div>
      <div class="app-name">Nonna Updates</div>
      <button type="button" class="lock-btn" data-action="lock" aria-label="Lock">${ic("gear", 18)}</button>
    </div>
    <div class="shell">
      <aside class="side">
        <div class="brand">
          <div class="mark">N</div>
          <div><b>Nonna Updates</b><span>Nonna Tonda · London</span></div>
        </div>
        <nav class="nav">
          ${navItem("home", "Home", "home")}
          ${navItem("rota", "Rota", "cal")}
          ${navItem("kit", "Kit", "box")}
          ${navItem("fleet", "Fleet", "bike")}
          <div class="div"></div>
          ${navItem("admin", "Admin", "gear")}
        </nav>
        <div class="foot">
          <div class="av ${avClass(actor)}">${initials(actor)}</div>
          <div><b>${esc(actor)}</b><span class="role">Signed in</span></div>
          <button type="button" class="lock" data-action="lock" title="Lock" aria-label="Lock">${ic("gear", 18)}</button>
        </div>
      </aside>
      <div class="main">
        ${renderTop(state)}
        <div class="content">${renderPage(state)}</div>
      </div>
    </div>
    <nav class="mobile-nav">
      ${navItem("home", "Home", "home")}
      ${navItem("rota", "Rota", "cal")}
      ${navItem("kit", "Kit", "box")}
      ${navItem("fleet", "Fleet", "bike")}
      ${navItem("admin", "Admin", "gear")}
    </nav>
    ${state.modal ? renderModal(state) : ""}
    ${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ""}
  </div>`;
}

function renderTop(state) {
  const page = state.page || "home";
  const titles = { home: "Home", rota: "Weekly Rota", kit: "Kit", fleet: "Fleet", admin: "Admin" };
  const subs = {
    home: formatWeekdayLong(state.today),
    rota: rotaSubtitle(state),
    kit: "History, inventory and parts",
    fleet: fleetSubtitle(state),
    admin: "Manage staff and plan the rota",
  };
  let extra = "";
  if (page === "home") extra = searchBox(state, "Scan a bike or battery") + outPill(state);
  else if (page === "rota") extra = weekNav(state.weekMonday, state.today, "rota-week");
  else if (page === "kit") extra = outPill(state);
  else if (page === "fleet") extra = outPill(state);
  return `
  <div class="top">
    <div>
      <div class="eyebrow">Nonna Updates</div>
      <h1>${titles[page] || "Home"}</h1>
      <div class="sub">${subs[page] || ""}</div>
    </div>
    <div class="top-right">${extra}</div>
  </div>`;
}

function rotaSubtitle(state) {
  const monday = state.weekMonday;
  const w = weekOfPeriod(monday, state.today);
  return `${formatWeekSpan(monday)} · week ${w.idx} of ${w.total}`;
}

function fleetSubtitle(state) {
  const d = state.data;
  const shortDay = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][mondayIndex(state.today)] + " " + formatShort(state.today);
  if ((state.fleetTab || "bikes") === "batteries") {
    const n = inventorySummary(d.items, d.checkouts, state.today).battery.length;
    return `${shortDay} · ${n} ${n === 1 ? "battery" : "batteries"}`;
  }
  const n = (d.fleet || []).length;
  return `${shortDay} · ${n} ${n === 1 ? "bike" : "bikes"}`;
}

function weekNav(monday, today, action) {
  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);
  const label = monday === mondayOf(today) ? "This week" : formatWeekLabel(monday);
  return `
    <button type="button" class="pill mut" data-action="${action}" data-monday="${prev}" aria-label="Previous week">${ic("left", 16)}</button>
    <div class="pill">${esc(label)}</div>
    <button type="button" class="pill mut" data-action="${action}" data-monday="${next}" aria-label="Next week">${ic("right", 16)}</button>`;
}

function renderPage(state) {
  if (state.loading) return `<div class="loading">Loading the latest data…</div>`;
  if (state.loadError) return `<div class="error">${esc(state.loadError)}</div>`;
  switch (state.page) {
    case "rota": return renderRota(state);
    case "kit": return renderKit(state);
    case "fleet": return renderFleet(state);
    case "admin": return renderAdmin(state);
    default: return renderHome(state);
  }
}

function renderHome(state) {
  const d = state.data;
  const today = state.today;
  const team = currentKitByRider(d.staff, d.checkouts, d.items, today);
  const attention = attentionItems({ fleet: d.fleet, items: d.items, repairs: d.repairs, stock: d.stock, rotas: d.rotas, today })
    .filter((a) => a.kind !== "holiday");
  const score = teamScoreSafe(d.optimo?.riders);
  const week = d.optimo?.week || {};
  const wa = whatsAppUrl(d.optimo?.riders, week, today);
  const riders = [...(d.optimo?.riders || [])].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const todaySum = sumCounts(riders.map((r) => extraToday(r, today)));
  const weekSum = sumCounts(riders.map((r) => extraWeek(r, week)));
  const periodSum = sumCounts(riders.map((r) => extraPeriod(r)));
  const period = currentPeriod(today);
  const periodLabel = formatRangeShort(period.start, addDays(period.end, -1));
  const visibleAtt = state.attentionOpen ? attention : attention.slice(0, 4);
  const more = attention.length - visibleAtt.length;

  const teamRows = team.map((row) => {
    const has = row.kit.length > 0;
    const tag = has ? `<span class="today-tag"><i></i>Today</span>` : "";
    return `<div class="row">
      <div class="av ${avClass(row.staff.name)}">${initials(row.staff.name)}</div>
      <div class="grow">
        <b class="who">${esc(row.staff.name)}</b>
        <div class="meta">${kitChips(row.kit)}${tag}</div>
      </div>
      <button type="button" class="icon-btn" data-action="assign-open" data-rider="${esc(row.staff.id)}" data-name="${esc(row.staff.name)}" aria-label="Assign kit to ${esc(row.staff.name)}">${ic("cam", 20)}</button>
    </div>`;
  }).join("");

  const att = visibleAtt.length
    ? visibleAtt.map((a) => attentionRow(a)).join("")
    : `<div class="row"><p class="muted">Nothing needs attention.</p></div>`;

  const notice = state.notice ? `<div class="notice">
    <div><strong>${esc(state.notice.title)}</strong><div class="small">${esc(state.notice.detail || "")}</div></div>
    ${state.notice.action ? `<button class="btn" data-action="${esc(state.notice.action)}" data-barcode="${esc(state.notice.barcode || "")}">${esc(state.notice.actionLabel || "Open")}</button>` : ""}
  </div>` : "";

  const breakdown = state.insightsOpen ? `<div class="breakdown">
    <div class="row"><div class="grow muted small">Rider</div><span class="muted small">Today</span><span class="muted small">Week</span><span class="muted small">Period</span></div>
    ${riders.map((r) => `<div class="row">
      <div class="grow"><b class="who" style="font-size:14px">${esc(r.name)}</b></div>
      <span class="muted">${esc(displayCount(extraToday(r, today)))}</span>
      <span>${esc(displayCount(extraWeek(r, week)))}</span>
      <span class="muted">${esc(displayCount(extraPeriod(r)))}</span>
    </div>`).join("") || `<p class="muted">No extra drops data yet.</p>`}
  </div>` : "";

  return `
  ${notice}
  <div class="cols">
    <div class="col" style="flex:1.15">
      <div class="sec grow-left">Team · ${team.length} <a href="#/admin" data-action="nav" data-page="admin">Manage</a></div>
      <div class="panel">${teamRows || `<div class="row"><p class="muted">No riders to show.</p></div>`}</div>
    </div>
    <div class="col" style="flex:.9;display:flex;flex-direction:column;gap:14px">
      <div>
        <div class="sec">Needs attention · ${attention.length}
          ${attention.length > 4 ? `<button type="button" class="link" data-action="attention-more">${state.attentionOpen ? "Show less" : `Show ${more} more`}</button>` : `<span></span>`}
        </div>
        <div class="panel">${att}</div>
      </div>
      <div>
        <div class="sec">Insights <button type="button" class="link" data-action="insights-open">${state.insightsOpen ? "Close" : "Open ›"}</button></div>
        <div class="panel insights">
          <div class="pair">
            <div>
              <div class="cap">Team review score</div>
              <div class="big">${score == null ? "—" : esc(String(score))}${score == null ? "" : `<span class="star"> ★</span>`}</div>
              <div class="small muted" style="margin-top:3px">No prior period yet</div>
            </div>
            <div>
              <div class="cap">Extra drops</div>
              <div class="big">${esc(displayCount(periodSum ?? weekSum ?? todaySum))}</div>
              <div class="small muted" style="margin-top:3px">${esc(periodLabel)}</div>
            </div>
          </div>
          <div class="cap" style="margin:16px 0 8px">Extra drops · ${esc(formatWeekLabel(mondayOf(today)).replace("w/c ", "w/c "))}</div>
          <div class="three">
            <div class="glass box"><div class="v">${esc(displayCount(todaySum))}</div><div class="l">Today so far</div></div>
            <div class="glass box"><div class="v">${esc(displayCount(weekSum))}</div><div class="l">This week</div></div>
            <div class="glass box"><div class="v">${esc(displayCount(periodSum))}</div><div class="l">Period</div></div>
          </div>
          <div class="wa">
            ${wa ? `<a class="pill" href="${esc(wa)}" target="_blank" rel="noopener">${ic("send", 16)}WhatsApp</a>` : `<span class="pill mut" aria-disabled="true">${ic("send", 16)}WhatsApp</span>`}
          </div>
          ${breakdown}
        </div>
      </div>
    </div>
  </div>`;
}

function teamScoreSafe(riders) {
  const scores = (riders || []).map((r) => r.reviewScore).filter((n) => n != null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((s, n) => s + n, 0) / scores.length * 10) / 10;
}

function attentionRow(a) {
  const kind = a.kind;
  const off = kind === "off_road";
  const repair = kind === "repair";
  const broken = kind === "battery";
  const tone = off || broken ? "r" : "a";
  const icon = broken ? "batt" : (off || repair ? (off ? "wrench" : "bike") : "box");
  const title = off ? `${a.title} is off the road`
    : repair ? `${a.title} needs repair`
    : broken ? `${a.title} marked broken`
    : a.title;
  const badge = off ? "Off the road" : repair ? "Needs repair" : broken ? "Broken" : (kind === "stock" ? "Low stock" : "");
  const badgeCls = off || broken ? "bg-r" : "bg-a";
  const open = (kind === "off_road" || kind === "repair") && a.id
    ? ` data-action="open-bike" data-id="${esc(a.id)}"` : "";
  return `<div class="alert"${open ? ` role="button" style="cursor:pointer"${open}` : ""}>
    <div class="ico ${tone}">${ic(icon, 16)}</div>
    <div class="grow"><b>${esc(title)}</b><span class="detail">${esc(a.detail || "")}</span></div>
    ${badge ? `<span class="badge ${badgeCls}">${esc(badge)}</span>` : ""}
  </div>`;
}

function renderRota(state) {
  const monday = state.weekMonday;
  const today = state.today;
  const rota = visibleRota((state.data.rotas || []).find((r) => r.weekStarting === monday), state.data.staff, today);
  const riders = (rota?.riders || []).slice().sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const requests = holidayRequests(rota, monday);
  const counts = WEEKDAYS.map((d) => riders.filter((r) => (r.days?.[d] || "none") === "working").length);
  const head = WEEKDAYS.map((d, i) => {
    const date = rota?.dates?.[d] || addDays(monday, i);
    const isToday = date === today;
    return `<th class="${isToday ? "today" : ""}">${d}<span class="n">${counts[i]}</span></th>`;
  }).join("");
  const body = riders.map((r) => {
    const cells = WEEKDAYS.map((d) => {
      const st = r.days?.[d] || "none";
      const mark = markFor(st);
      const edited = r.manual?.[d] || r.edited?.[d] || r.source?.[d] === "app" || r.flags?.[d] === "app";
      return `<td><div class="markc ${mark.cls}" style="margin:0 auto">${mark.txt}</div>${edited ? `<i class="dot-edit" title="Changed in the app"></i>` : ""}</td>`;
    }).join("");
    return `<tr><td class="name">${esc(r.name)}</td>${cells}</tr>`;
  }).join("");
  const reqHtml = requests.length
    ? requests.map((q) => `<div class="row" style="align-items:flex-start">
        <div class="av s ${avClass(q.name)}">${initials(q.name)}</div>
        <div class="grow"><b class="who" style="font-size:14.5px">${esc(q.name)}</b>
          <span class="small muted" style="display:block;margin-top:2px">${esc(q.range)}</span></div>
        <span class="badge ${q.pending ? "bg-a" : "bg-g"}">${q.pending ? "Pending" : "Approved"}</span>
      </div>`).join("")
    : `<div class="row"><p class="muted">No holiday requests this week.</p></div>`;
  return `
  <div class="cols">
    <div class="col" style="flex:1.4">
      <table class="rtable panel">
        <thead><tr><th>Rider</th>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="6" class="muted">No rota for this week yet.</td></tr>`}</tbody>
      </table>
      <div style="display:flex;gap:18px;align-items:center;margin-top:12px;padding:0 6px;flex-wrap:wrap">
        <div class="legend" style="flex:1">
          <span><span class="markc mk-w"></span>Working</span>
          <span><span class="markc mk-h">H</span>Holiday</span>
          <span><span class="markc mk-s"></span>Off sick</span>
          <span><span class="markc mk-p">H</span>Pending</span>
        </div>
        <button type="button" class="add-link" data-action="staff-add">Add rider</button>
      </div>
      <div class="hint">Change the rota on the Admin page. A small blue dot means it was changed in the app.</div>
    </div>
    <div class="col" style="flex:.55">
      <div class="sec">Holiday requests · ${requests.length}</div>
      <div class="panel">${reqHtml}</div>
    </div>
  </div>`;
}

function markFor(st) {
  if (st === "working") return { cls: "mk-w", txt: "" };
  if (st === "holiday") return { cls: "mk-h", txt: "H" };
  if (st === "pending") return { cls: "mk-p", txt: "H" };
  if (st === "sick" || st === "off_sick" || st === "off sick") return { cls: "mk-s", txt: "" };
  return { cls: "mk-o", txt: "" };
}

function holidayRequests(rota, monday) {
  const out = [];
  for (const r of rota?.riders || []) {
    const days = WEEKDAYS.map((d, i) => ({ d, i, st: r.days?.[d] || "none" }))
      .filter((x) => x.st === "holiday" || x.st === "pending");
    if (!days.length) continue;
    const pending = days.some((x) => x.st === "pending") && days.every((x) => x.st !== "holiday");
    const mixedPending = days.some((x) => x.st === "pending");
    const first = days[0].i;
    const last = days[days.length - 1].i;
    const start = addDays(monday, first);
    const end = addDays(monday, last);
    const range = first === last
      ? `${WEEKDAYS[first]} ${formatShort(start)}`
      : `${WEEKDAYS[first]} ${parseYmd(start)?.d} – ${WEEKDAYS[last]} ${formatShort(end)}`;
    out.push({ name: r.name, range, pending: mixedPending && (pending || days.some((x) => x.st === "pending") && !days.some((x) => x.st === "holiday")) ? true : days.every((x) => x.st === "pending") });
    if (!out[out.length - 1].pending && days.some((x) => x.st === "pending") && days.some((x) => x.st === "holiday")) {
      // split? keep as approved if any holiday already accepted; pending days still listed as one row if mixed — show Pending if any pending remains
      out[out.length - 1].pending = days.some((x) => x.st === "pending");
    }
  }
  return out;
}

function renderKit(state) {
  const tab = state.kitTab || "history";
  const seg = (id, label) => `<button type="button" class="${tab === id ? "on" : ""}" data-action="kit-tab" data-tab="${id}">${label}</button>`;
  return `
  <div class="toolbar">
    <div class="seg">${seg("history", "History")}${seg("inventory", "Inventory")}${seg("parts", "Parts")}</div>
    ${searchBox(state, "Scan or search history, kit or parts")}
  </div>
  ${tab === "inventory" ? renderInventory(state) : tab === "parts" ? renderParts(state) : renderHistory(state)}`;
}

function renderHistory(state) {
  const { y, m } = state.kitMonth;
  const today = state.today;
  const cells = monthGrid(y, m);
  const byDate = new Map();
  for (const rec of state.data.checkouts || []) {
    if (!rec.date) continue;
    if (!byDate.has(rec.date)) byDate.set(rec.date, []);
    byDate.get(rec.date).push(rec);
  }
  const hd = ["MON","TUE","WED","THU","FRI","SAT","SUN"].map((d) => `<div class="hd">${d}</div>`).join("");
  const days = cells.map((c) => {
    const recs = byDate.get(c.date) || [];
    const n = riderDays(recs).length;
    const selected = (state.selectedDay || today) === c.date;
    const cls = [
      "cell",
      c.inMonth ? "" : "out",
      c.date === today || selected ? "today" : "",
      c.inMonth && n && c.date !== today && !selected ? "on" : "",
    ].filter(Boolean).join(" ");
    const badge = c.inMonth && n ? `<span class="c">${n}</span>` : "";
    return `<button type="button" class="${cls}" data-action="cal-day" data-date="${c.date}">
      <div class="n">${Number(c.date.slice(8))}</div>${badge}
    </button>`;
  }).join("");
  const selected = state.selectedDay || today;
  const list = riderDays(byDate.get(selected) || []).map((rd) => `
    <div class="row">
      <div class="av s ${avClass(rd.riderName)}">${initials(rd.riderName)}</div>
      <div class="grow">
        <b class="who" style="font-size:14.5px">${esc(rd.riderName)}</b>
        <div class="meta">${kitChips(kitLines(rd.items))}</div>
      </div>
      <span class="small muted">${esc(rd.time || "")}</span>
    </div>`).join("");
  const prevM = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const nextM = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const n = riderDays(byDate.get(selected) || []).length;
  return `
  <div class="cols">
    <div class="col" style="flex:1.25">
      <div class="month-nav">
        <button type="button" data-action="kit-month" data-y="${prevM.y}" data-m="${prevM.m}" aria-label="Previous month">${ic("left", 18)}</button>
        <div class="title">${esc(monthName(y, m))}</div>
        <button type="button" data-action="kit-month" data-y="${nextM.y}" data-m="${nextM.m}" aria-label="Next month">${ic("right", 18)}</button>
      </div>
      <div class="glass" style="padding:12px 10px 10px"><div class="cal">${hd}${days}</div></div>
    </div>
    <div class="col" style="flex:.8">
      <div class="sec">${esc(formatWeekdayLong(selected).toUpperCase())} · ${n} assigned</div>
      <div class="panel">${list || `<div class="row"><p class="muted">No checkouts on this day.</p></div>`}</div>
    </div>
  </div>`;
}

function renderInventory(state) {
  const groups = inventorySummary(state.data.items, state.data.checkouts, state.today);
  const block = (title, list, kind) => `
    <section class="panel" style="margin-bottom:14px">
      <div class="sec" style="padding:12px 14px 0"> ${title} · ${list.length}
        <button type="button" class="link" data-action="open-register">Register item</button>
      </div>
      ${list.map((it) => {
        const st = it.broken ? "Broken" : it.out && it.holder ? `Out · ${it.holder.riderName}` : "At base";
        return `<div class="row">
          <div class="av s ${avClass(titleItem(it))}">${ic(iconForKind(kind), 16)}</div>
          <div class="grow"><b class="who" style="font-size:14.5px">${esc(titleItem(it))}</b>
            <div class="small muted">${esc(it.barcode || "No barcode")} · ${esc(st)}</div></div>
        </div>`;
      }).join("") || `<div class="row"><p class="muted">None registered.</p></div>`}
    </section>`;
  return `${block("Bikes", groups.bike, "bike")}${block("Batteries", groups.battery, "battery")}${block("Phones", groups.phone, "phone")}${block("Other", groups.other, "other")}`;
}

function renderParts(state) {
  const parts = state.data.stock || [];
  return `
  <section class="panel" style="padding:12px">
    <div class="sec">Parts · ${parts.length}</div>
    <div class="parts">
      ${parts.map((p) => {
        const low = p.reorderAt != null && p.qty <= p.reorderAt;
        return `<div class="part ${low ? "low" : ""}">
          <div><div class="who" style="font-size:14.5px">${esc(p.name)}</div><div class="muted small">${low ? "Low stock" : (p.sku || "")}</div></div>
          <div class="stepper">
            <button type="button" data-action="count-part" data-id="${esc(p.id)}" data-delta="-1">−</button>
            <div class="qty">${esc(p.qty)}</div>
            <button type="button" data-action="count-part" data-id="${esc(p.id)}" data-delta="1">+</button>
          </div>
        </div>`;
      }).join("") || `<p class="muted">No parts list yet.</p>`}
    </div>
  </section>`;
}

function renderFleet(state) {
  const tab = state.fleetTab || "bikes";
  const seg = (id, label) => `<button type="button" class="${tab === id ? "on" : ""}" data-action="fleet-tab" data-tab="${id}">${label}</button>`;
  return `
  <div class="toolbar">
    <div class="seg">${seg("bikes", "Bikes")}${seg("batteries", "Batteries")}</div>
    ${searchBox(state, "Search or scan a bike or battery")}
  </div>
  ${tab === "batteries" ? renderBatteries(state) : renderBikes(state)}`;
}

function renderBikes(state) {
  const d = state.data;
  const filters = new Set(state.fleetFilters || []);
  const bikes = (d.fleet || []).map((b) => {
    const item = itemForBike(d.items, b);
    const st = bikeDisplayStatus(b, item, d.repairs);
    const holder = holderForItem(item, d.checkouts, state.today);
    const bat = holderBattery(holder);
    const open = openRepairs(repairsForBike(d.repairs, b, item));
    return { bike: b, item, st, holder, bat, open };
  });
  const counts = {
    all: bikes.length,
    on_road: bikes.filter((b) => b.st.key === "on_road").length,
    needs_repair: bikes.filter((b) => b.st.key === "needs_repair").length,
    off_road: bikes.filter((b) => b.st.key === "off_road").length,
  };
  const shown = bikes.filter((b) => !filters.size || filters.has(b.st.key));
  const selected = bikes.find((b) => b.bike.id === state.selectedBike) || shown[0] || bikes[0] || null;
  const kpi = (key, n, label, col) =>
    `<button type="button" class="kpi ${filters.has(key) || (key === "all" && !filters.size) ? "on" : ""}" data-action="fleet-filter" data-filter="${key}">
      <div class="bar" style="background:${col}"></div><div class="v">${n}</div><div class="l">${label}</div></button>`;

  const cards = shown.map((b) => {
    const tone = b.st.key === "off_road" ? "r" : b.st.key === "needs_repair" ? "a" : "g";
    const who = b.st.key === "off_road" && !b.holder ? "Off the road" : (b.holder ? b.holder.riderName : "At base");
    const bits = [];
    if (b.bat) bits.push(`Battery ${b.bat}`);
    const types = (b.open || []).map((r) => labelType(r.type)).filter(Boolean);
    if (b.st.key === "needs_repair" && types.length) bits.push(types.join(", "));
    if (b.st.key === "off_road") {
      const t = types.length ? types.join(", ") : (b.bike.reason || b.bike.issue || "");
      if (t) bits.push(t);
    }
    return `<button type="button" class="bcard st-${tone} ${selected?.bike.id === b.bike.id ? "sel" : ""}" data-action="open-bike" data-id="${esc(b.bike.id)}">
      <div class="bnum">${esc(b.bike.name || titleItem(b.item) || b.bike.id)}</div>
      <div class="bwho">${esc(who)}</div>
      ${bits.length ? `<div class="bmeta">${esc(bits.join(" · "))}</div>` : ""}
    </button>`;
  }).join("");

  return `
  <div class="fleet-body">
    <div class="list">
      <div class="kpis">
        ${kpi("all", counts.all, "All", "#D5DBE6")}
        ${kpi("on_road", counts.on_road, "On the road", "var(--g)")}
        ${kpi("needs_repair", counts.needs_repair, "Needs repair", "var(--a)")}
        ${kpi("off_road", counts.off_road, "Off the road", "var(--r)")}
      </div>
      <div class="bgrid">${cards || `<p class="muted">No bikes match those filters.</p>`}</div>
    </div>
    <div class="detail">${selected ? renderBikePanel(state, selected) : `<section class="panel side-panel"><p class="muted">Select a bike to see repairs and history.</p></section>`}</div>
  </div>`;
}

function holderBattery(holder) {
  if (!holder) return "";
  const bat = (holder.rec?.items || holder.items || []).find((it) => /batter/i.test(it.type || it.kind || it.name || ""));
  return bat?.number || "";
}

function holderBike(holder) {
  if (!holder) return "";
  const bike = (holder.rec?.items || holder.items || []).find((it) => /bike/i.test(it.type || it.kind || it.name || ""));
  if (!bike) return "";
  return bike.number ? `Bike ${bike.number}` : (bike.name || "");
}

function renderBatteries(state) {
  const d = state.data;
  const bats = inventorySummary(d.items, d.checkouts, state.today).battery;
  const out = bats.filter((b) => b.out && !b.broken).length;
  const base = bats.filter((b) => !b.out && !b.broken).length;
  const broken = bats.filter((b) => b.broken).length;
  const selected = bats.find((b) => b.id === state.selectedBattery) || bats[0] || null;
  const kpi = (n, label, col) =>
    `<div class="kpi"><div class="bar" style="background:${col}"></div><div class="v">${n}</div><div class="l">${label}</div></div>`;
  const cards = bats.map((b) => {
    const tone = b.broken ? "r" : b.out ? "a" : "g";
    const who = b.broken ? "Broken" : b.out && b.holder ? b.holder.riderName + (holderBike(b.holder) ? ` · ${holderBike(b.holder)}` : "") : "At base";
    return `<button type="button" class="bcard st-${tone} ${selected?.id === b.id ? "sel" : ""}" data-action="open-battery" data-id="${esc(b.id)}">
      <div class="bnum">${esc(titleItem(b))}</div>
      <div class="bwho">${esc(who)}</div>
    </button>`;
  }).join("");
  return `
  <div class="fleet-body">
    <div class="list">
      <div class="kpis">
        ${kpi(bats.length, "All", "#D5DBE6")}
        ${kpi(out, "Out today", "var(--a)")}
        ${kpi(base, "At base", "var(--g)")}
        ${kpi(broken, "Broken", "var(--r)")}
      </div>
      <div class="bgrid">${cards || `<p class="muted">No batteries registered.</p>`}</div>
    </div>
    <div class="detail">${selected ? renderBatteryPanel(state, selected) : `<section class="panel side-panel"><p class="muted">Select a battery to see its history.</p></section>`}</div>
  </div>`;
}

function renderBikePanel(state, selected) {
  const { bike, item, st, holder } = selected;
  const all = repairsForBike(state.data.repairs, bike, item);
  const open = openRepairs(all);
  const hist = historyRepairs(all);
  const assigns = assignmentHistory(item, bike, state.data.checkouts);
  const meta = [bike.type, bike.model, item?.name, bike.number ? String(bike.number).padStart(5, "0") : ""].filter(Boolean);
  const openHtml = open.length
    ? open.map((r) => `<div class="glass" style="padding:12px 14px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start">
        <div class="grow">
          <b class="who" style="font-size:14.5px">${esc(labelType(r.type))}</b>
          <div class="small muted">${esc(r.note || "No note")}</div>
          <div class="small muted">Logged by ${esc(r.loggedBy || "unknown")} · ${esc(formatDateTime(r.loggedAt))}</div>
          ${r.offRoad ? `<span class="badge bg-r" style="margin-top:6px;display:inline-flex">Off the road</span>` : `<span class="badge bg-n" style="margin-top:6px;display:inline-flex">Can ride</span>`}
        </div>
        <button type="button" class="fix" data-action="mark-fixed" data-id="${esc(r.id)}">${ic("check", 14)} Mark fixed</button>
      </div>`).join("")
    : `<p class="muted small">No open repairs.</p>`;
  const histHtml = hist.length
    ? `<div class="tl">${hist.map((r, i) => `<div class="te"><div class="d" style="background:${i === 0 ? "#8C96AA" : "#5A6479"}"></div><div>
        <b>${esc(labelType(r.type))}</b>
        <span>Fixed ${esc(formatDateTime(r.fixedAt))}${r.note ? " · " + esc(r.note) : ""}${r.fixedBy ? " · logged by " + esc(r.fixedBy) : ""}</span>
      </div></div>`).join("")}</div>`
    : `<p class="muted small">No repair history yet.</p>`;
  const asg = assigns.length
    ? `<div class="tl">${assigns.slice(0, 20).map((r, i) => `<div class="te"><div class="d" style="background:${i === 0 ? "var(--a)" : "#5A6479"}"></div><div>
        <b>${esc(r.riderName)}</b>
        <span>${esc(formatShort(r.date))} · ${esc(r.time || formatClock(r.at) || "")}</span>
      </div></div>`).join("")}</div>`
    : `<p class="muted small">No assignment history yet.</p>`;
  const badge = st.key === "off_road" ? "bg-r" : st.key === "needs_repair" ? "bg-a" : "bg-g";
  return `
  <section class="panel side-panel">
    <div class="head-row">
      <div class="ico-lg glass">${ic("bike", 24)}</div>
      <div class="grow">
        <h2>${esc(bike.name || titleItem(item))}<span class="badge ${badge}">${esc(st.label)}</span></h2>
        <div class="subline">${esc(meta.join(" · ") || "Cargo e-bike")}</div>
      </div>
    </div>
    <div class="glass with-now">
      <div class="cap">With now</div>
      ${holder ? `<div style="display:flex;gap:10px;align-items:center">
        <div class="av s ${avClass(holder.riderName)}">${initials(holder.riderName)}</div>
        <b style="font-size:14.5px">${esc(holder.riderName)}</b>
        <span class="muted small">· ${esc(formatShort(state.today))}</span>
      </div>` : `<span class="muted">At base</span>`}
    </div>
    <button type="button" class="repbtn" data-action="log-repair" data-id="${esc(bike.id)}">${ic("wrench", 16)} Log repair</button>
    <div class="cap block-cap">Open repairs · ${open.length}</div>
    ${openHtml}
    <div class="cap block-cap">Assignment history</div>
    ${asg}
    <div class="cap block-cap">Repair history</div>
    ${histHtml}
  </section>`;
}

function renderBatteryPanel(state, bat) {
  const assigns = assignmentHistory(bat, null, state.data.checkouts);
  const asg = assigns.length
    ? `<div class="tl">${assigns.slice(0, 20).map((r, i) => `<div class="te"><div class="d" style="background:${i === 0 ? "var(--a)" : "#5A6479"}"></div><div>
        <b>${esc(r.riderName)}${holderBike({ rec: r }) ? " · " + esc(holderBike({ rec: r })) : ""}</b>
        <span>${esc(formatShort(r.date))} · ${esc(r.time || formatClock(r.at) || "")}</span>
      </div></div>`).join("")}</div>`
    : `<p class="muted small">No assignment history yet.</p>`;
  const stLabel = bat.broken ? "Broken" : bat.out ? "Out today" : "At base";
  const badge = bat.broken ? "bg-r" : bat.out ? "bg-a" : "bg-g";
  return `
  <section class="panel side-panel">
    <div class="head-row">
      <div class="ico-lg glass">${ic("batt", 24)}</div>
      <div class="grow">
        <h2>${esc(titleItem(bat))}<span class="badge ${badge}">${esc(stLabel)}</span></h2>
        <div class="subline">${esc(bat.barcode ? "Battery · " + bat.barcode : "Battery")}</div>
      </div>
    </div>
    <div class="glass with-now">
      <div class="cap">With now</div>
      ${bat.holder ? `<div style="display:flex;gap:10px;align-items:center">
        <div class="av s ${avClass(bat.holder.riderName)}">${initials(bat.holder.riderName)}</div>
        <div><b style="font-size:14.5px">${esc(bat.holder.riderName)}</b>
          <div class="small muted">${esc(holderBike(bat.holder) || "")}</div></div>
      </div>` : `<span class="muted">At base</span>`}
    </div>
    <div class="cap block-cap">Assignment history</div>
    ${asg}
  </section>`;
}

function labelType(t) {
  return (REPAIR_TYPES.find((x) => x.id === t) || { label: t || "Other" }).label;
}

function renderAdmin(state) {
  return `
  <div class="admin-cols">
    <div class="staff-col">${renderStaff(state)}</div>
    <div class="plan-col" id="plan">${renderPlan(state)}</div>
  </div>`;
}

function staffSource(s) {
  const days = daysLabel(s.days) || (s.asNeeded ? "as needed" : "");
  const src = s.source === "jenny" ? "Jenny’s list" : (s.source === "app" || s.addedInApp ? "Added in the app" : "Added in the app");
  const bits = [s.role || "Rider"];
  if (days) bits.push(days);
  bits.push(src);
  if (s.editedInApp) bits[bits.length - 1] += " · edited in app";
  return bits.join(" · ");
}

function renderStaff(state) {
  const active = forDisplay(state.data.staff);
  const removed = removedStaff(state.data.staff);
  const rows = active.map((s) => `<div class="row">
    <div class="av ${avClass(s.name)}">${initials(s.name)}</div>
    <div class="grow"><b class="who" style="font-size:15px">${esc(s.name)}</b>
      <div class="small muted" style="margin-top:2px">${esc(staffSource(s))}</div></div>
    <button type="button" class="icon-btn" data-action="staff-remove" data-id="${esc(s.id)}" data-name="${esc(s.name)}" aria-label="Remove ${esc(s.name)}">${ic("userx", 18)}</button>
  </div>`).join("");
  const gone = removed.map((s) => `<div class="row">
    <div class="av ${avClass(s.name)}">${initials(s.name)}</div>
    <div class="grow"><b class="who" style="font-size:14.5px">${esc(s.name)}</b>
      <div class="small muted">Hidden everywhere · history kept</div></div>
    <button type="button" class="badge bg-g" data-action="staff-restore" data-id="${esc(s.id)}" data-name="${esc(s.name)}" style="border:0">Restore</button>
  </div>`).join("");
  return `
    <div class="sec">Manage staff · ${active.length}</div>
    <button type="button" class="btn" data-action="staff-add" style="width:100%;margin-bottom:10px">${ic("plus", 16)} Add employee</button>
    <div class="panel">${rows || `<div class="row"><p class="muted">No staff yet.</p></div>`}</div>
    <div class="sec" style="margin-top:16px">Removed · ${removed.length}</div>
    <div class="panel">${gone || `<div class="row"><p class="muted">Nobody is hidden.</p></div>`}</div>`;
}

function renderPlan(state) {
  const monday = state.planMonday || state.weekMonday;
  const today = state.today;
  const rota = (state.data.rotas || []).find((r) => r.weekStarting === monday);
  const rows = planRows(state.data.staff, rota);
  const saved = planGrid(rota, rows);
  const grid = state.planGrid || saved;
  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);
  const changes = planChanges(monday, saved, grid);
  const counts = WEEKDAYS.map((d) => rows.filter((r) => (grid[r.name]?.[d] || "none") === "working").length);
  const head = WEEKDAYS.map((d, i) => {
    const date = addDays(monday, i);
    const isToday = date === today;
    const p = parseYmd(date);
    return `<th class="${isToday ? "today" : ""}">${d}<span class="n" style="font-size:12px;font-weight:650;color:${isToday ? "var(--acc)" : "var(--mut)"}">${p ? p.d : ""}</span></th>`;
  }).join("");
  const body = rows.map((r) => {
    const cells = WEEKDAYS.map((d) => {
      const st = grid[r.name]?.[d] || "none";
      const mark = markFor(st);
      return `<td><button type="button" class="markc ${mark.cls}" data-action="plan-cell" data-name="${esc(r.name)}" data-day="${d}" title="Click to toggle working, right-click or long-press for holiday">${mark.txt}</button></td>`;
    }).join("");
    return `<tr><td class="name">${esc(r.name)}</td>${cells}</tr>`;
  }).join("");
  const foot = `<tr>${`<td class="name muted" style="font-weight:500">Working</td>`}${counts.map((n) => `<td style="font-weight:700;color:var(--mut)">${n}</td>`).join("")}</tr>`;
  const weekLabel = monday === mondayOf(today) ? "This week" : "Week";
  return `
    <div class="sec">Plan rota</div>
    <div class="glass plan-week">
      <button type="button" data-action="plan-week" data-monday="${prev}" aria-label="Previous week" style="color:var(--faint);padding:0 6px">${ic("left", 18)}</button>
      <div class="mid"><div class="cap">${esc(weekLabel)}</div><div class="dates">${esc(formatWeekSpan(monday))}</div></div>
      <button type="button" data-action="plan-week" data-monday="${next}" aria-label="Next week" style="color:var(--ink);padding:0 6px">${ic("right", 18)}</button>
    </div>
    <div class="plan-actions">
      <button type="button" class="pill mut" data-action="plan-copy-last">Copy last week</button>
      <button type="button" class="pill mut" data-action="plan-contracted">Use contracted days</button>
    </div>
    <table class="rtable panel">
      <thead><tr><th></th>${head}</tr></thead>
      <tbody>${body}${foot}</tbody>
    </table>
    ${changes.length
      ? `<button type="button" class="btn save-bar" data-action="plan-save">Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}</button>`
      : `<button type="button" class="btn save-bar" disabled>No changes</button>`}
    <div class="caption">Shows on the Rota page straight away. Only the rota is changed — Jenny’s staff list isn’t touched.</div>`;
}

function renderModal(state) {
  const m = state.modal;
  if (!m) return "";
  if (m.type === "repair") return modalRepair(state, m);
  if (m.type === "register") return modalRegister(state, m);
  if (m.type === "assign") return modalAssign(state, m);
  if (m.type === "staff-add") return modalStaffAdd();
  return "";
}

function modalRepair(state, m) {
  const types = REPAIR_TYPES.map((t) => `<option value="${t.id}" ${m.repairType === t.id ? "selected" : ""}>${t.label}</option>`).join("");
  return `
  <div class="modal-back" data-action="close-modal">
    <div class="modal" data-stop="1">
      <h2>Log repair</h2>
      <p class="muted">${esc(m.bikeName || "")}</p>
      <form data-action="save-repair">
        <input type="hidden" name="bikeId" value="${esc(m.bikeId)}">
        <input type="hidden" name="itemId" value="${esc(m.itemId || "")}">
        <input type="hidden" name="barcode" value="${esc(m.barcode || "")}">
        <div class="field"><label>Type</label><select name="type">${types}</select></div>
        <div class="field"><label>Note</label><textarea name="note" rows="3" placeholder="What’s wrong?">${esc(m.note || "")}</textarea></div>
        <div class="field">
          <label>Can it still be ridden?</label>
          <select name="offRoad">
            <option value="no" ${m.offRoad ? "" : "selected"}>Yes, it can be ridden (needs repair)</option>
            <option value="yes" ${m.offRoad ? "selected" : ""}>No, take it off the road</option>
          </select>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn">Save repair</button>
        </div>
      </form>
    </div>
  </div>`;
}

function modalRegister(state, m) {
  const kinds = ITEM_KINDS.map((k) => `<option value="${k.id}" ${m.kind === k.id ? "selected" : ""}>${k.label}</option>`).join("");
  const num = m.number || nextNumber(state.data.items, m.kind || "bike");
  return `
  <div class="modal-back" data-action="close-modal">
    <div class="modal" data-stop="1">
      <h2>Register item</h2>
      ${m.unregistered ? `<p class="muted">This barcode isn’t registered yet.</p>` : ""}
      <form data-action="save-register">
        <div class="field"><label>Barcode</label><input name="barcode" value="${esc(m.barcode || "")}" required></div>
        <div class="field"><label>Type</label><select name="kind">${kinds}</select></div>
        <div class="field"><label>Number</label><input name="number" value="${esc(num)}" required></div>
        <div class="field"><label>Name (optional)</label><input name="name" value="${esc(m.name || "")}"></div>
        <div class="actions">
          <button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn">Register</button>
        </div>
      </form>
    </div>
  </div>`;
}

function modalAssign(state, m) {
  const riders = forDisplay(state.data.staff);
  const opts = riders.map((s) => `<option value="${esc(s.id)}" ${s.id === m.riderId ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  return `
  <div class="modal-back" data-action="close-modal">
    <div class="modal" data-stop="1">
      <h2>Assign kit</h2>
      <form data-action="save-assign">
        <div class="field"><label>Rider</label><select name="riderId">${opts}</select></div>
        <div class="field"><label>Barcode</label><input name="barcode" value="${esc(m.barcode || "")}" placeholder="Scan or type a barcode" required></div>
        <div class="actions">
          <button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn">Assign</button>
        </div>
      </form>
    </div>
  </div>`;
}

function modalStaffAdd() {
  return `
  <div class="modal-back" data-action="close-modal">
    <div class="modal" data-stop="1">
      <h2>Add rider</h2>
      <form data-action="save-staff">
        <div class="field"><label>Name</label><input name="name" required></div>
        <div class="field"><label>Role</label><input name="role" value="Rider"></div>
        <div class="field"><label>Contracted days (e.g. Mon–Fri)</label><input name="days" value="Mon,Tue,Wed,Thu,Fri"></div>
        <div class="actions">
          <button type="button" class="btn ghost" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn">Add</button>
        </div>
      </form>
    </div>
  </div>`;
}

export { labelType, needsRepairBike };
