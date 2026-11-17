/** HTML renderers. All event hooks are data-action attributes, bound in app.js. */

import { ITEM_KINDS, PIN_LENGTH, REPAIR_TYPES } from "./config.js";
import {
  addDays, formatDateTime, formatLong, formatShort, formatWeekLabel, monthGrid, monthName,
} from "./date.js";
import {
  WEEKDAYS, assignmentHistory, attentionItems, bikeDisplayStatus, currentKitByRider,
  daysLabel, displayCount, extraPeriod, extraToday, extraWeek, forDisplay, historyRepairs,
  holderForItem, inventorySummary, itemForBike, kitLines, needsRepairBike, nextNumber,
  openRepairs, planGrid, planRows, removedStaff, repairsForBike, riderDays, teamScore,
  titleItem, visibleRota, whatsAppUrl,
} from "./logic.js";

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const initials = (name) => esc((name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase());

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
    if (k === "back") return `<button type="button" class="back" data-action="pin-back" aria-label="Delete">⌫</button>`;
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
        <div class="dots" aria-hidden="true">${dots}</div>
        <input class="sr-only" id="pin-input" inputmode="numeric" autocomplete="one-time-code" maxlength="${PIN_LENGTH}" value="${esc(pin)}" aria-label="PIN">
        <div class="pad">${keys}</div>
        <label class="remember"><input type="checkbox" data-action="toggle-remember" ${state.remember ? "checked" : ""}> Remember this device</label>
        ${busy}${err}
        <details class="fallback">
          <summary>Use a GitHub key instead</summary>
          <form data-action="fallback-form" class="field" style="text-align:left;margin-top:12px">
            <label>Fine-grained GitHub token (data repo only)</label>
            <textarea name="token" rows="3" placeholder="github_pat_…" autocomplete="off"></textarea>
            <div class="actions"><button class="btn primary" type="submit">Connect</button></div>
          </form>
        </details>
      </div>
    </div>
  </div>`;
}

function renderShell(state) {
  const page = state.page || "home";
  const nav = (id, label) =>
    `<a href="#/${id}" class="${page === id ? "active" : ""}" data-action="nav" data-page="${id}">${label}</a>`;
  return `
  <div class="app">
    <div class="titlebar">
      <div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
      <span>Nonna Updates</span>
      <span></span>
    </div>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">N</div>
          <div><strong>Nonna Updates</strong><span>Linked to the phone app</span></div>
        </div>
        <nav class="menu">
          ${nav("home", "Home")}
          ${nav("rota", "Rota")}
          ${nav("kit", "Kit")}
          ${nav("fleet", "Fleet")}
          <div class="sep"></div>
          ${nav("admin", "Admin")}
        </nav>
        <div class="side-foot">
          <div>${esc(state.actor || "Sam")}</div>
          <button type="button" data-action="lock">Lock</button>
        </div>
      </aside>
      <div class="main">
        ${renderTopbar(state)}
        <div class="content">${renderPage(state)}</div>
      </div>
    </div>
    <nav class="mobile-nav">
      ${nav("home", "Home")}${nav("rota", "Rota")}${nav("kit", "Kit")}${nav("fleet", "Fleet")}${nav("admin", "Admin")}
    </nav>
    ${state.modal ? renderModal(state) : ""}
    ${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ""}
  </div>`;
}

function renderTopbar(state) {
  const page = state.page;
  const titles = { home: "Home", rota: "Rota", kit: "Kit", fleet: "Fleet", admin: "Admin" };
  const out = state.outToday != null ? `${state.outToday} out today` : "";
  return `
  <div class="topbar">
    <h1>${titles[page] || "Home"}</h1>
    <form class="search" data-action="search-form">
      <span aria-hidden="true">⌕</span>
      <input type="text" name="q" value="${esc(state.search || "")}" placeholder="Scan or type a barcode" autocomplete="off" autocapitalize="off" spellcheck="false">
    </form>
    <div class="meta">${esc(out)}</div>
  </div>`;
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
  const attention = attentionItems({ fleet: d.fleet, items: d.items, repairs: d.repairs, stock: d.stock, rotas: d.rotas, today });
  const score = teamScore(d.optimo.riders);
  const week = d.optimo.week || {};
  const wa = whatsAppUrl(d.optimo.riders, week, today);
  const rows = [...(d.optimo.riders || [])].map((r) => ({
    name: r.name,
    today: extraToday(r, today),
    week: extraWeek(r, week),
    period: extraPeriod(r),
  })).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const teamRows = team.map((row) => {
    const chips = row.kit.length
      ? row.kit.map((k) => `<span class="chip">${esc(k.text)}</span>`).join("")
      : `<span class="muted small">No kit out</span>`;
    return `<div class="row">
      <div class="avatar">${initials(row.staff.name)}</div>
      <div class="grow">
        <div class="name">${esc(row.staff.name)}</div>
        <div class="chips">${chips}</div>
      </div>
      <button class="btn" data-action="assign-open" data-rider="${esc(row.staff.id)}" data-name="${esc(row.staff.name)}">Assign</button>
    </div>`;
  }).join("");

  const att = attention.length
    ? attention.map((a) => `<div class="row"><div class="grow"><div class="name">${esc(a.title)}</div><div class="muted small">${esc(a.detail)}</div></div></div>`).join("")
    : `<p class="muted">Nothing needs attention.</p>`;

  const dropRows = rows.map((r) => `<div class="row">
      <div class="grow"><div class="name">${esc(r.name)}</div></div>
      <span class="muted">${esc(displayCount(r.today))}</span>
      <span style="min-width:42px;text-align:right;font-weight:700">${esc(displayCount(r.week))}</span>
      <span class="muted" style="min-width:42px;text-align:right">${esc(displayCount(r.period))}</span>
    </div>`).join("");

  const notice = state.notice ? `<div class="notice">
    <div><strong>${esc(state.notice.title)}</strong><div class="small">${esc(state.notice.detail || "")}</div></div>
    ${state.notice.action ? `<button class="btn primary" data-action="${esc(state.notice.action)}" data-barcode="${esc(state.notice.barcode || "")}">${esc(state.notice.actionLabel || "Open")}</button>` : ""}
  </div>` : "";

  return `
  ${notice}
  <div class="grid-2">
    <section class="panel">
      <div class="head"><h2>Team · ${team.length}</h2></div>
      ${teamRows || `<p class="muted">No riders to show.</p>`}
    </section>
    <div>
      <section class="panel" style="margin-bottom:18px">
        <div class="head"><h2>Needs attention</h2></div>
        ${att}
      </section>
      <section class="panel">
        <div class="head">
          <h2>Insights</h2>
          ${wa ? `<a class="pill primary" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp list</a>` : `<span class="pill" aria-disabled="true">WhatsApp list</span>`}
        </div>
        <div class="kpis">
          <div class="kpi"><div class="n">${score == null ? "—" : esc(score.toFixed(1) + "★")}</div><div class="l">Review score</div></div>
        </div>
        <div class="row" style="border:0;padding-top:0">
          <div class="grow muted small">Extra drops</div>
          <span class="muted small">Today</span>
          <span class="muted small" style="min-width:42px;text-align:right">Week</span>
          <span class="muted small" style="min-width:42px;text-align:right">Period</span>
        </div>
        ${dropRows || `<p class="muted">No extra drops data yet.</p>`}
      </section>
    </div>
  </div>`;
}

function renderRota(state) {
  const monday = state.weekMonday;
  const rota = visibleRota((state.data.rotas || []).find((r) => r.weekStarting === monday), state.data.staff, state.today);
  const riders = (rota?.riders || []).slice().sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);
  const head = WEEKDAYS.map((d, i) => {
    const date = rota?.dates?.[d] || addDays(monday, i);
    return `<th>${d.slice(0, 3)}<div class="muted" style="font-weight:500">${esc(formatShort(date))}</div></th>`;
  }).join("");
  const body = riders.map((r) => {
    const cells = WEEKDAYS.map((d) => {
      const st = r.days?.[d] || "none";
      const label = st === "none" ? "—" : st === "working" ? "In" : st === "holiday" ? "Holiday" : st === "pending" ? "Pending" : st;
      return `<td><span class="cell ${esc(st)}">${esc(label)}</span></td>`;
    }).join("");
    return `<tr><td><strong>${esc(r.name)}</strong></td>${cells}</tr>`;
  }).join("");
  return `
  <section class="panel">
    <div class="head">
      <h2>${esc(formatWeekLabel(monday))}</h2>
      <div>
        <button class="btn" data-action="rota-week" data-monday="${prev}">←</button>
        <button class="btn" data-action="rota-week" data-monday="${next}">→</button>
      </div>
    </div>
    <div style="overflow:auto">
      <table class="rota">
        <thead><tr><th>Rider</th>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="6" class="muted">No rota for this week yet.</td></tr>`}</tbody>
      </table>
    </div>
  </section>`;
}

function renderKit(state) {
  const tab = state.kitTab || "history";
  const seg = (id, label) => `<button type="button" class="${tab === id ? "on" : ""}" data-action="kit-tab" data-tab="${id}">${label}</button>`;
  return `
  <div class="seg" style="margin-bottom:16px">${seg("history", "History")}${seg("inventory", "Inventory")}${seg("parts", "Parts")}</div>
  ${tab === "inventory" ? renderInventory(state) : tab === "parts" ? renderParts(state) : renderHistory(state)}
  `;
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
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("");
  const days = cells.map((c) => {
    const recs = byDate.get(c.date) || [];
    const n = riderDays(recs).length;
    const cls = [c.inMonth ? "" : "out", c.date === today ? "today" : "", state.selectedDay === c.date ? "today" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="day ${cls}" data-action="cal-day" data-date="${c.date}">
      <div class="n">${Number(c.date.slice(8))}</div>
      <div class="c">${n ? n + " rider" + (n === 1 ? "" : "s") : ""}</div>
    </button>`;
  }).join("");
  const selected = state.selectedDay || today;
  const list = riderDays(byDate.get(selected) || []).map((rd) => {
    const lines = kitLines(rd.items).map((k) => `<span class="chip">${esc(k.text)}</span>`).join("");
    return `<div class="row">
      <div class="avatar">${initials(rd.riderName)}</div>
      <div class="grow"><div class="name">${esc(rd.riderName)}</div><div class="chips">${lines}</div></div>
      <div class="muted">${esc(rd.time)}</div>
    </div>`;
  }).join("");
  const prevM = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const nextM = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `
  <section class="panel">
    <div class="head">
      <h2>${esc(monthName(y, m))}</h2>
      <div>
        <button class="btn" data-action="kit-month" data-y="${prevM.y}" data-m="${prevM.m}">←</button>
        <button class="btn" data-action="kit-month" data-y="${nextM.y}" data-m="${nextM.m}">→</button>
      </div>
    </div>
    <div class="cal">${dow}${days}</div>
  </section>
  <section class="panel" style="margin-top:18px">
    <div class="head"><h2>${esc(formatLong(selected))}</h2></div>
    ${list || `<p class="muted">No checkouts on this day.</p>`}
  </section>`;
}

function renderInventory(state) {
  const groups = inventorySummary(state.data.items, state.data.checkouts, state.today);
  const block = (title, list) => `
    <section class="panel" style="margin-bottom:18px">
      <div class="head"><h2>${title} · ${list.length}</h2>
        <button class="btn" data-action="open-register">Register item</button>
      </div>
      ${list.map((it) => {
        const st = it.broken ? "Broken" : it.out && it.holder ? `Out · ${it.holder.riderName}` : "At base";
        return `<div class="row">
          <div class="grow"><div class="name">${esc(titleItem(it))}</div>
            <div class="muted small">${esc(it.barcode || "No barcode")} · ${esc(st)}</div></div>
        </div>`;
      }).join("") || `<p class="muted">None registered.</p>`}
    </section>`;
  return `${block("Bikes", groups.bike)}${block("Batteries", groups.battery)}${block("Phones", groups.phone)}${block("Other", groups.other)}`;
}

function renderParts(state) {
  const parts = state.data.stock || [];
  return `
  <section class="panel">
    <div class="head"><h2>Parts · ${parts.length}</h2></div>
    <div class="parts">
      ${parts.map((p) => {
        const low = p.reorderAt != null && p.qty <= p.reorderAt;
        return `<div class="part ${low ? "low" : ""}">
          <div><div class="name">${esc(p.name)}</div><div class="muted small">${low ? "Low stock" : (p.sku || "")}</div></div>
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
  const d = state.data;
  const filters = new Set(state.fleetFilters || []);
  const bikes = (d.fleet || []).map((b) => {
    const item = itemForBike(d.items, b);
    const st = bikeDisplayStatus(b, item, d.repairs);
    const holder = holderForItem(item, d.checkouts, state.today);
    const bat = holderBattery(holder, d.items);
    return { bike: b, item, st, holder, bat };
  });
  const counts = {
    all: bikes.length,
    on_road: bikes.filter((b) => b.st.key === "on_road").length,
    needs_repair: bikes.filter((b) => b.st.key === "needs_repair").length,
    off_road: bikes.filter((b) => b.st.key === "off_road").length,
  };
  const shown = bikes.filter((b) => {
    if (!filters.size) return true;
    return filters.has(b.st.key);
  });
  const selectedId = state.selectedBike;
  const selected = bikes.find((b) => b.bike.id === selectedId) || null;

  const kpi = (key, n, label, cls) =>
    `<button type="button" class="kpi ${cls} ${filters.has(key) || (key === "all" && !filters.size) ? "on" : ""}" data-action="fleet-filter" data-filter="${key}">
      <div class="n">${n}</div><div class="l">${label}</div></button>`;

  if (tab === "batteries") return renderBatteries(state, d);

  const cards = shown.map((b) => {
    const who = b.holder ? b.holder.riderName : "At base";
    const bat = b.bat ? `Battery ${b.bat}` : "No battery out";
    return `<button type="button" class="bike ${selected?.bike.id === b.bike.id ? "sel" : ""}" data-action="open-bike" data-id="${esc(b.bike.id)}">
      <div class="num">${esc(b.bike.name || titleItem(b.item) || b.bike.id)}</div>
      <div class="st ${esc(b.st.key)}">${esc(b.st.label)}</div>
      <div class="who">${esc(who)}</div>
      <div class="bat">${esc(bat)}</div>
    </button>`;
  }).join("");

  return `
  <div class="seg" style="margin-bottom:16px">
    <button type="button" class="${tab === "bikes" ? "on" : ""}" data-action="fleet-tab" data-tab="bikes">Bikes</button>
    <button type="button" class="${state.fleetTab === "batteries" ? "on" : ""}" data-action="fleet-tab" data-tab="batteries">Batteries</button>
  </div>
  <div class="kpis">
    ${kpi("all", counts.all, "All bikes", "")}
    ${kpi("on_road", counts.on_road, "On the road", "g")}
    ${kpi("needs_repair", counts.needs_repair, "Needs repair", "a")}
    ${kpi("off_road", counts.off_road, "Off the road", "r")}
  </div>
  <div class="grid-2">
    <div class="bikes">${cards || `<p class="muted">No bikes match those filters.</p>`}</div>
    <div>${selected ? renderBikePanel(state, selected) : `<section class="panel side-panel"><p class="muted">Select a bike to see repairs and history.</p></section>`}</div>
  </div>`;
}

function holderBattery(holder, items) {
  if (!holder) return "";
  // Battery often sits on the same checkout as the bike; fall back to today's items for that rider via holder.rec
  const rec = holder.rec;
  const bat = (rec?.items || []).find((it) => /batter/i.test(it.type || it.name || ""));
  return bat?.number || "";
}

function renderBatteries(state, d) {
  const groups = inventorySummary(d.items, d.checkouts, state.today);
  const bats = groups.battery;
  const out = bats.filter((b) => b.out && !b.broken).length;
  const base = bats.filter((b) => !b.out && !b.broken).length;
  const broken = bats.filter((b) => b.broken).length;
  return `
  <div class="seg" style="margin-bottom:16px">
    <button type="button" data-action="fleet-tab" data-tab="bikes">Bikes</button>
    <button type="button" class="on" data-action="fleet-tab" data-tab="batteries">Batteries</button>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="n">${bats.length}</div><div class="l">All batteries</div></div>
    <div class="kpi"><div class="n">${out}</div><div class="l">Out today</div></div>
    <div class="kpi g"><div class="n">${base}</div><div class="l">At base</div></div>
    <div class="kpi r"><div class="n">${broken}</div><div class="l">Broken</div></div>
  </div>
  <div class="bikes">
    ${bats.map((b) => {
      const st = b.broken ? "Broken" : b.out ? "Out today" : "At base";
      const who = b.holder ? `${b.holder.riderName}` : "At base";
      return `<div class="bike">
        <div class="num">${esc(titleItem(b))}</div>
        <div class="st ${b.broken ? "broken" : b.out ? "needs_repair" : "on_road"}">${esc(st)}</div>
        <div class="who">${esc(who)}</div>
      </div>`;
    }).join("") || `<p class="muted">No batteries registered.</p>`}
  </div>`;
}

function renderBikePanel(state, selected) {
  const { bike, item, st, holder } = selected;
  const all = repairsForBike(state.data.repairs, bike, item);
  const open = openRepairs(all);
  const hist = historyRepairs(all);
  const assigns = assignmentHistory(item, bike, state.data.checkouts);
  const openHtml = open.length
    ? open.map((r) => `<div class="row">
        <div class="grow"><div class="name">${esc(labelType(r.type))}${r.offRoad ? " · Off the road" : " · Can ride"}</div>
        <div class="muted small">${esc(r.note || "No note")} · ${esc(r.loggedBy || "")} · ${esc(formatDateTime(r.loggedAt))}</div></div>
        <button class="btn good" data-action="mark-fixed" data-id="${esc(r.id)}">Mark fixed</button>
      </div>`).join("")
    : `<p class="muted">No open repairs.</p>`;
  const histHtml = hist.length
    ? `<ul class="timeline">${hist.map((r) => `<li>
        <div class="name">${esc(labelType(r.type))} fixed</div>
        <div class="when">${esc(formatDateTime(r.fixedAt))} · ${esc(r.fixedBy || "")}</div>
        <div class="muted small">${esc(r.note || "")}</div>
      </li>`).join("")}</ul>`
    : `<p class="muted">No repair history yet.</p>`;
  const asg = assigns.length
    ? `<ul class="timeline">${assigns.slice(0, 20).map((r) => `<li>
        <div class="name">${esc(r.riderName)}</div>
        <div class="when">${esc(r.date)} ${esc(formatDateTime(r.at).split(" ").slice(1).join(" ") || "")}</div>
      </li>`).join("")}</ul>`
    : `<p class="muted">No assignment history yet.</p>`;
  return `
  <section class="panel side-panel">
    <div class="head"><h2>${esc(bike.name)}</h2><span class="st ${esc(st.key)}">${esc(st.label)}</span></div>
    <p class="muted">${holder ? `With ${esc(holder.riderName)} today` : "At base"}</p>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" data-action="log-repair" data-id="${esc(bike.id)}">Log repair</button>
    </div>
    <h3 style="margin:16px 0 8px">Open repairs</h3>
    ${openHtml}
    <h3 style="margin:16px 0 8px">Repair history</h3>
    ${histHtml}
    <h3 style="margin:16px 0 8px">Assignment history</h3>
    ${asg}
  </section>`;
}

function labelType(t) {
  return (REPAIR_TYPES.find((x) => x.id === t) || { label: t || "Other" }).label;
}

function renderAdmin(state) {
  const tab = state.adminTab || "staff";
  const seg = (id, label) => `<button type="button" class="${tab === id ? "on" : ""}" data-action="admin-tab" data-tab="${id}">${label}</button>`;
  return `
  <div class="seg" style="margin-bottom:16px">${seg("staff", "Manage staff")}${seg("rota", "Plan rota")}</div>
  ${tab === "rota" ? renderPlan(state) : renderStaff(state)}`;
}

function renderStaff(state) {
  const active = forDisplay(state.data.staff);
  const removed = removedStaff(state.data.staff);
  const rows = active.map((s) => `<div class="row">
    <div class="avatar">${initials(s.name)}</div>
    <div class="grow"><div class="name">${esc(s.name)}</div>
      <div class="muted small">${esc(s.role || "Rider")} · ${esc(daysLabel(s.days))} · ${s.source === "jenny" ? "Jenny’s list" : "Added here"}</div></div>
    <button class="btn" data-action="staff-remove" data-id="${esc(s.id)}" data-name="${esc(s.name)}">Remove</button>
  </div>`).join("");
  const gone = removed.map((s) => `<div class="row">
    <div class="avatar">${initials(s.name)}</div>
    <div class="grow"><div class="name">${esc(s.name)}</div><div class="muted small">Removed</div></div>
    <button class="btn primary" data-action="staff-restore" data-id="${esc(s.id)}" data-name="${esc(s.name)}">Restore</button>
  </div>`).join("");
  return `
  <div class="grid-admin">
    <section class="panel">
      <div class="head"><h2>Active · ${active.length}</h2>
        <button class="btn primary" data-action="staff-add">Add rider</button>
      </div>
      ${rows || `<p class="muted">No staff yet.</p>`}
    </section>
    <section class="panel">
      <div class="head"><h2>Removed · ${removed.length}</h2></div>
      ${gone || `<p class="muted">Nobody is hidden.</p>`}
    </section>
  </div>`;
}

function renderPlan(state) {
  const monday = state.planMonday || state.weekMonday;
  const rota = (state.data.rotas || []).find((r) => r.weekStarting === monday);
  const rows = planRows(state.data.staff, rota);
  const saved = planGrid(rota, rows);
  const grid = state.planGrid || saved;
  const prev = addDays(monday, -7);
  const next = addDays(monday, 7);
  const head = WEEKDAYS.map((d, i) => `<th>${d.slice(0, 3)}<div class="muted" style="font-weight:500">${esc(formatShort(addDays(monday, i)))}</div></th>`).join("");
  const body = rows.map((r) => {
    const cells = WEEKDAYS.map((d) => {
      const st = grid[r.name]?.[d] || "none";
      const label = st === "working" ? "In" : st === "holiday" ? "Holiday" : st === "pending" ? "Pending" : "—";
      return `<td><button type="button" class="cell ${esc(st)}" data-action="plan-cell" data-name="${esc(r.name)}" data-day="${d}" title="Click to toggle working, long-press or right-click for holiday">${esc(label)}</button></td>`;
    }).join("");
    return `<tr><td><strong>${esc(r.name)}</strong></td>${cells}</tr>`;
  }).join("");
  return `
  <section class="panel">
    <div class="head">
      <h2>${esc(formatWeekLabel(monday))}</h2>
      <div>
        <button class="btn" data-action="plan-week" data-monday="${prev}">←</button>
        <button class="btn" data-action="plan-week" data-monday="${next}">→</button>
        <button class="btn" data-action="plan-contracted">Use contracted days</button>
        <button class="btn primary" data-action="plan-save">Save rota</button>
      </div>
    </div>
    <p class="muted small">Click a cell to mark working. Right-click for holiday.</p>
    <div style="overflow:auto">
      <table class="rota"><thead><tr><th>Rider</th>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>
  </section>`;
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
        <div class="field"><label>Issue</label><select name="type">${types}</select></div>
        <div class="field"><label>Note (optional)</label><textarea name="note" rows="3" placeholder="What’s wrong?"></textarea></div>
        <div class="field">
          <label>Can it be ridden?</label>
          <select name="offRoad">
            <option value="no">Can ride</option>
            <option value="yes">Off the road</option>
          </select>
        </div>
        <div class="actions">
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn primary">Save repair</button>
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
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn primary">Register</button>
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
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn primary">Assign</button>
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
        <div class="field"><label>Contracted days (e.g. Mon–Fri)</label><input name="days" value="Monday,Tuesday,Wednesday,Thursday,Friday"></div>
        <div class="actions">
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn primary">Add</button>
        </div>
      </form>
    </div>
  </div>`;
}

export { labelType, needsRepairBike };
