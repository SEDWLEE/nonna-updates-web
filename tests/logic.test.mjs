import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addRepair, applyRotaEditsToFeed, assignmentHistory, blockedText, bikeDisplayStatus,
  buildProfile, currentCheckouts, daysLabel, effectiveStaff, extraToday, extraWeek,
  extraWithValue, forDisplay, heldByOther, historyRepairs, isRemovedRow, kitBikeRow,
  markFixed, nextNumber, openRepairs, planChanges, pounds, POUNDS_PER_EXTRA,
  requireFree, tapFilter, THRESHOLD_DROPS, undoRepair, visibleRota, whatsAppMessage,
  whatsAppUrl,
} from "../js/logic.js";
import { mondayOf as dateMonday, londonToday, currentPeriod, addDays } from "../js/date.js";
import { normaliseBarcode, sameBarcode, parseItems, parseRepairs, parseFeed } from "../js/parse.js";

describe("dates", () => {
  it("mondayOf lands on Monday", () => {
    assert.equal(dateMonday("2026-11-17"), "2026-11-16"); // Tuesday
    assert.equal(dateMonday("2026-11-16"), "2026-11-16");
    assert.equal(dateMonday("2026-11-22"), "2026-11-16");
  });
  it("26th-to-26th period", () => {
    assert.deepEqual(currentPeriod("2026-11-17"), { start: "2026-10-26", end: "2026-11-26" });
    assert.deepEqual(currentPeriod("2026-11-26"), { start: "2026-11-26", end: "2026-12-26" });
  });
  it("londonToday is YYYY-MM-DD", () => {
    assert.match(londonToday(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("barcodes", () => {
  it("normalises and compares case-insensitively", () => {
    assert.equal(normaliseBarcode("  ABC\u0001123  "), "ABC123");
    assert.ok(sameBarcode("ab-1", "AB-1"));
    assert.ok(!sameBarcode("", ""));
  });
});

describe("daily reset", () => {
  it("only treats today's London date as current kit", () => {
    const recs = [
      { date: "2026-11-17", riderName: "Shane", items: [{ barcode: "B7" }] },
      { date: "2026-11-16", riderName: "Bryan", items: [{ barcode: "B4" }] },
    ];
    const cur = currentCheckouts(recs, "2026-11-17");
    assert.equal(cur.length, 1);
    assert.equal(cur[0].riderName, "Shane");
  });
});

describe("assignment guard", () => {
  const checkouts = [
    { date: "2026-11-17", riderId: "bryan", riderName: "Bryan", items: [{ barcode: "bike-7", number: "7", type: "bike" }] },
    { date: "2026-11-16", riderId: "shane", riderName: "Shane", items: [{ barcode: "bike-4", number: "4", type: "bike" }] },
  ];
  it("blocks an item already with someone else today", () => {
    const other = heldByOther("BIKE-7", "shane", "Shane", checkouts, "2026-11-17");
    assert.equal(other.riderName, "Bryan");
    assert.equal(blockedText("Bike 7", "Bryan"), "Bike 7 is already with Bryan");
    assert.throws(() => requireFree([{ barcode: "bike-7", number: "7", type: "bike" }], "shane", "Shane", checkouts, "2026-11-17"));
  });
  it("does not block the same rider or yesterday's assignment", () => {
    assert.equal(heldByOther("bike-7", "bryan", "Bryan", checkouts, "2026-11-17"), null);
    assert.equal(heldByOther("bike-4", "bryan", "Bryan", checkouts, "2026-11-17"), null);
  });
});

describe("removed staff on rota", () => {
  const staff = [
    { id: "alex", name: "Alex Smith", active: false },
    { id: "shane", name: "Shane", active: true },
    { id: "bryan", name: "Bryan", active: true },
  ];
  it("matches by id, full name, or unique first name", () => {
    assert.ok(isRemovedRow("Alex", "alex", [staff[0]], staff));
    assert.ok(isRemovedRow("Alex Smith", null, [staff[0]], staff));
    assert.ok(isRemovedRow("Alex", null, [staff[0]], staff));
    assert.ok(!isRemovedRow("Shane", "shane", [staff[0]], staff));
  });
  it("hides current/future weeks only", () => {
    const riders = [{ name: "Alex" }, { name: "Shane" }];
    const hidden = visibleRota({ weekStarting: "2026-11-16", riders }, staff, "2026-11-17");
    assert.deepEqual(hidden.riders.map((r) => r.name), ["Shane"]);
    const past = visibleRota({ weekStarting: "2026-11-09", riders }, staff, "2026-11-17");
    assert.equal(past.riders.length, 2);
  });
  it("keeps a first-name clash visible", () => {
    const clash = [...staff, { id: "alex2", name: "Alex Jones", active: true }];
    assert.ok(!isRemovedRow("Alex", null, [staff[0]], clash));
  });
});

describe("effective staff", () => {
  it("overlays staff.json and hides removed", () => {
    const feed = [{ id: "shane", name: "Shane" }, { id: "alex", name: "Alex" }];
    const overlay = [{ id: "alex", name: "Alex", active: false }, { id: "dev", name: "Dev", active: true }];
    const all = effectiveStaff(feed, overlay);
    assert.deepEqual(forDisplay(all).map((s) => s.name).sort(), ["Dev", "Shane"]);
  });
});

describe("repairs", () => {
  it("open vs history and off-the-road display status", () => {
    const list = [
      { id: "1", bike: "Bike 10", type: "electrics", offRoad: true, loggedAt: "2026-11-16T12:00:00Z" },
      { id: "2", bike: "Bike 7", type: "tyre", offRoad: false, loggedAt: "2026-11-16T12:00:00Z", fixedAt: "2026-11-17T10:00:00Z", fixedBy: "Sam" },
    ];
    assert.equal(openRepairs(list).length, 1);
    assert.equal(historyRepairs(list)[0].id, "2");
    const bike10 = { id: "10", name: "Bike 10", number: "10", status: "on_road" };
    assert.equal(bikeDisplayStatus(bike10, null, list).key, "off_road");
    const bike7 = { id: "7", name: "Bike 7", number: "7", status: "on_road" };
    assert.equal(bikeDisplayStatus(bike7, null, list).key, "on_road");
    const withOpen = addRepair(list, { id: "3", bike: "Bike 7", type: "brakes", offRoad: false, loggedAt: "x" });
    assert.equal(bikeDisplayStatus(bike7, null, withOpen).key, "needs_repair");
    const fixed = markFixed(withOpen, "3", "2026-11-17T11:00:00Z", "Sam");
    assert.equal(openRepairs(fixed).length, 1);
    const undone = undoRepair(withOpen, "3");
    assert.equal(undone.some((r) => r.id === "3"), false);
    assert.equal(undoRepair(list, "2").some((r) => r.id === "2"), true);
  });
});

describe("extra drops / WhatsApp", () => {
  const week = { start: "2026-11-16", end: "2026-11-23", label: "w/c 16 Nov" };
  const riders = [
    { name: "Harrison", extraDropsWeek: 87, extraDropsToday: 87, extraDrops: 87 },
    { name: "Shane", extraDropsWeek: 12, extraDropsByDay: [{ date: "2026-11-17", count: 4 }] },
    { name: "Alex", extraDropsWeek: 0, extraDropsToday: 0 },
    { name: "Mo", extraDropsWeek: 12 },
    { name: "Unknown" },
  ];
  it("skips 0 and unknown, sorts highest first then name", () => {
    const msg = whatsAppMessage(riders, week, "2026-11-17");
    assert.equal(msg, "Extra drops w/c 16 Nov\nHarrison 87 extra · £174\nMo 12 extra · £24\nShane 12 extra · £24");
    const url = whatsAppUrl(riders, week, "2026-11-17");
    assert.ok(url.startsWith("https://wa.me/447424687181?text="));
    assert.ok(url.includes("%0A"));
    assert.ok(!url.includes("Alex"));
  });
  it("derives today/week from extraDropsByDay when missing", () => {
    const r = { name: "Dev", extraDropsByDay: [{ date: "2026-11-16", count: 3 }, { date: "2026-11-17", count: 5 }] };
    assert.equal(extraToday(r, "2026-11-17"), 5);
    assert.equal(extraWeek(r, week), 8);
  });
});

describe("rota feed writes preserve staff and updates", () => {
  it("only touches rotas[]", () => {
    const root = {
      updates: [{ id: 1, text: "hello" }],
      staff: [{ name: "Jenny's person" }],
      rotas: [{ weekStarting: "2026-11-16", riders: [{ name: "Shane", status: { Mon: "working" } }] }],
    };
    const next = applyRotaEditsToFeed(root, [
      { weekStarting: "2026-11-16", riderName: "Shane", day: "Tue", status: "working" },
    ], "Sam", "2026-11-17T12:00:00Z");
    assert.deepEqual(next.updates, root.updates);
    assert.deepEqual(next.staff, root.staff);
    assert.equal(next.rotas[0].riders[0].status.Mon, "working");
    assert.equal(next.rotas[0].riders[0].status.Tue, "working");
    assert.equal(next.rotas[0].riders[0].manual.Tue.manual, true);
  });
  it("creates a missing week in rotas[]", () => {
    const root = { updates: [], staff: [], rotas: [] };
    const next = applyRotaEditsToFeed(root, [
      { weekStarting: "2026-11-23", riderName: "Shane", day: "Mon", status: "holiday" },
    ], "Sam", "at");
    assert.equal(next.rotas.length, 1);
    assert.equal(next.rotas[0].weekStarting, "2026-11-23");
    assert.equal(next.rotas[0].days[0], "Mon");
    assert.equal(next.rotas[0].riders[0].status.Mon, "holiday");
    assert.equal(next.updates.length, 0);
  });
  it("planChanges reports diffs only", () => {
    const saved = { Shane: { Mon: "working", Tue: "none" } };
    const edited = { Shane: { Mon: "working", Tue: "holiday" } };
    const ch = planChanges("2026-11-16", saved, edited);
    assert.equal(ch.length, 1);
    assert.equal(ch[0].day, "Tue");
  });
});

describe("helpers", () => {
  it("daysLabel and nextNumber", () => {
    assert.equal(daysLabel(["Monday","Tuesday","Wednesday","Thursday","Friday"]), "Mon–Fri");
    assert.equal(nextNumber([{ kind: "bike", number: "14" }, { kind: "bike", number: "2" }], "bike"), "15");
  });
});

describe("parsers", () => {
  it("parseItems and parseRepairs", () => {
    const items = parseItems(JSON.stringify({ items: [{ id: "b7", type: "bike", number: "7", barcode: " x " }] }));
    assert.equal(items[0].kind, "bike");
    assert.equal(items[0].barcode, "x");
    const repairs = parseRepairs(JSON.stringify({ repairs: [{ id: "1", bike: "Bike 7", type: "tyre" }] }));
    assert.equal(repairs[0].bike, "Bike 7");
  });
  it("parseFeed reads status Mon–Fri keys", async () => {
    const feed = parseFeed(JSON.stringify({
      rotas: [{ weekStarting: "2026-11-16", days: ["Mon","Tue","Wed","Thu","Fri"], riders: [
        { name: "Shane", status: { Mon: "working", Wed: "holiday" } },
      ]}],
    }));
    assert.equal(feed.rotas[0].riders[0].days.Mon, "working");
    assert.equal(feed.rotas[0].riders[0].days.Tue, "none");
    assert.equal(feed.rotas[0].riders[0].days.Wed, "holiday");
  });
});

describe("extra drop value", () => {
  it("is extra × £2, never applies the 80-drop threshold", () => {
    assert.equal(POUNDS_PER_EXTRA, 2);
    assert.equal(THRESHOLD_DROPS, 80);
    assert.equal(pounds(14), "£28");
    assert.equal(pounds(0), "£0");
    assert.equal(pounds(1200), "£2,400");
    assert.equal(pounds(null), "—");
    assert.equal(extraWithValue(14), "14 extra · £28");
    assert.equal(extraWithValue(null), "—");
  });
});

describe("kit chips and rows", () => {
  it("tapping a selected chip or the total clears the filter", () => {
    assert.equal(tapFilter("off_road", "off_road", "all"), "all");
    assert.equal(tapFilter("all", "repair", "all"), "repair");
    assert.equal(tapFilter("repair", "all", "all"), "all");
  });
  it("bike rows use Off the road / Needs repair / With / At base and leave status logic alone", () => {
    const bike = { id: "b4", name: "Bike 4", status: "ok" };
    const off = kitBikeRow({ id: "b10", name: "Bike 10", status: "off_road" }, null, [], null);
    assert.equal(off.status, "Off the road");
    assert.equal(off.tone, "r");
    const repair = kitBikeRow(bike, null, [{ id: "1", bike: "Bike 4", type: "lights", offRoad: false }], null);
    assert.equal(repair.status, "Needs repair");
    assert.equal(repair.tone, "a");
    const withRider = kitBikeRow({ id: "b1", name: "Bike 1", status: "ok" }, null, [], { riderName: "Shane" });
    assert.equal(withRider.status, "With Shane");
    const base = kitBikeRow({ id: "b1", name: "Bike 1", status: "ok" }, null, [], null);
    assert.equal(base.status, "At base");
  });
});

describe("employee profile", () => {
  it("groups this person's kit history and counts worked days in the period", () => {
    const staff = [{ id: "s1", name: "Shane", role: "Rider", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], source: "jenny" }];
    const checkouts = [
      { riderId: "s1", riderName: "Shane", date: "2026-11-16", at: "2026-11-16T08:12:00Z", items: [{ type: "bike", number: "7", barcode: "B7" }, { type: "battery", number: "31", barcode: "BAT31" }] },
      { riderName: "Shane", date: "2026-11-13", at: "2026-11-13T08:05:00Z", items: [{ type: "bike", number: "7", barcode: "B7" }] },
      { riderName: "Bryan", date: "2026-11-16", items: [{ type: "bike", number: "3", barcode: "B3" }] },
    ];
    const rotas = [{
      weekStarting: "2026-11-16",
      dates: { Mon: "2026-11-16", Tue: "2026-11-17", Wed: "2026-11-18", Thu: "2026-11-19", Fri: "2026-11-20" },
      riders: [{ name: "Shane", days: { Mon: "working", Tue: "working", Wed: "working", Thu: "working", Fri: "working" } }],
    }];
    const p = buildProfile({ id: "s1", name: "Shane" }, staff, checkouts, rotas, "2026-11-17");
    assert.equal(p.name, "Shane");
    assert.equal(p.summary.daysWithKit, 2);
    assert.equal(p.summary.checkouts, 2);
    assert.equal(p.summary.topBike.label, "Bike 7");
    assert.equal(p.summary.topBike.days, 2);
    assert.equal(p.kitDays[0][0], "2026-11-16");
    assert.equal(p.todayKit.length, 0);
    assert.equal(p.onRota, true);
    assert.equal(p.summary.workedPeriod.worked, 2);
    assert.equal(p.summary.workedPeriod.rostered, 5);
    assert.ok(p.roleLine.includes("Rider"));
  });
});
