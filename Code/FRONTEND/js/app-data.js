// Starting records for laboratories and lost items, plus all booking / resource / claim rules.
// Everything the app changes is stored in this browser (localStorage, key cp_data_v2) until a backend is connected.
//
// FRONTEND-ONLY LIMITATION: localStorage belongs to ONE browser profile on ONE device. Two students on two
// computers each have their own copy, so this code cannot stop them booking the same slot. Within a single
// browser it is safe: every change re-reads the latest stored data, runs under a Web Lock (when the browser
// has one), writes immediately, then re-verifies, and other open tabs refresh through the "storage" event.
// True cross-user conflict prevention needs a server/database.

const pad = n => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const hhmm = ts => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const slotMs = (date, t) => new Date(date + "T" + t + ":00").getTime();
const GRACE_MS = CONFIG.GRACE_MINUTES * 60000;
const DATA_KEY = "cp_data_v3", OLD_DATA_KEYS = ["cp_data_v2", "cp_data_v1"];

// ---------- Starting data (no user-specific records) ----------
const SEED = {
  resources: [
    { id: 1, name: "PC1", dept: "Computer Science", lab: "Computer Science Lab 2.02", desc: "Desktop computer for programming, coursework and software labs." },
    { id: 2, name: "PC2", dept: "Computer Science", lab: "Computer Science Lab 2.02", desc: "Desktop computer for programming, coursework and software labs." },
    { id: 3, name: "PC3", dept: "Computer Science", lab: "Computer Science Lab 2.02", desc: "Desktop computer for programming, coursework and software labs." },
    { id: 4, name: "PC1", dept: "Computer Science", lab: "Computer Science Lab 2.03", desc: "Desktop computer for programming, coursework and software labs." },
    { id: 5, name: "PC2", dept: "Computer Science", lab: "Computer Science Lab 2.03", desc: "Desktop computer for programming, coursework and software labs." },
    { id: 6, name: "PC3", dept: "Computer Science", lab: "Computer Science Lab 2.03", desc: "Desktop computer for programming, coursework and software labs." },
    { id: 7, name: "Projector", dept: "Computer Science", lab: "Computer Science Lab 2.03", desc: "Projector for presentations, demonstrations and group sessions." }
  ],
  items: [
    { id: 1, title: "Lab attendance register", desc: "Green hardcover register with 'Lab Attendance' on the cover and a pen clipped inside.", cat: "Documents", kind: "Found", found_at: "Computer Science Lab 2.03", date: "2026-10-20", status: "Unclaimed" },
    { id: 2, title: "USB flash drive", desc: "Black SanDisk 32 GB drive with a green keychain, found plugged into a PC.", cat: "Electronics", kind: "Found", found_at: "Computer Science Lab 2.02", date: "2026-10-21", status: "Unclaimed" },
    { id: 3, title: "Wired keyboard", desc: "Black Logitech keyboard with a missing Q key cap, left on a desk.", cat: "Electronics", kind: "Found", found_at: "Library", date: "2026-10-18", status: "Resolved" },
    { id: 4, title: "Navy blue backpack", desc: "Backpack with a laptop sleeve and a water bottle in the side pocket.", cat: "Personal", kind: "Found", found_at: "Cafeteria", date: "2026-10-24", status: "Unclaimed" }
  ]
};
// Suggested places for Lost & Found (any campus location may be typed; these are only suggestions).
const CAMPUS_PLACES = ["Library", "Cafeteria", "Main Gate", "Administration Block", "Auditorium", "Sports Complex", "Mosque", "Hostel", "Parking Area", "Classroom Block", "Bus Stop"];
const ITEM_CATS = ["Electronics", "Documents", "Personal", "Accessories", "Clothing", "Books & Stationery", "Other"];

const DATA = {
  resources: SEED.resources.map(r => ({ ...r, maintenance: !!r.maintenance, status: "Available" })),
  bookings: [], items: [], claims: []
};
const DIR = {};   // userId -> {name,email,rollNo}; filled from the logged-in user / staff directory

// PC1 exists in two labs, so the lab number is part of the displayed name: "PC1 (Lab 2.02)".
const resName = id => { const r = DATA.resources.find(x => x.id == id); return r ? r.name + " (" + r.lab.replace(/^.*Lab /, "Lab ") + ")" : "Unknown resource"; };
const itemTitle = id => (DATA.items.find(i => i.id == id) || {}).title || "Unknown";
const person = (userId, snap) => {
  const p = DIR[String(userId)] || snap || {};
  return { name: p.name || "Unknown student", rollNo: p.rollNo || "—", email: p.email || "—", department: p.department || "—" };
};

// ---------- Load / save (tolerates missing or corrupted data) ----------
const arr = v => Array.isArray(v) ? v : [];
const validBooking = b => b && typeof b === "object" && b.id != null && b.res != null && b.userId != null &&
  Number.isFinite(b.startTs) && Number.isFinite(b.endTs) && typeof b.status === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date || "");
const validClaim = c => c && typeof c === "object" && c.id != null && c.item != null && c.userId != null;
function normItem(i) {
  if (!i || typeof i !== "object" || i.id == null) return null;
  const legacyType = i.cat === "Found item" || i.cat === "Lost item";      // old report form stored the type in "cat"
  return {
    id: i.id, title: String(i.title || "Untitled item"), desc: String(i.desc || ""),
    cat: legacyType ? "Other" : String(i.cat || "Other"),
    kind: i.kind || (i.cat === "Lost item" ? "Lost" : "Found"),
    found_at: String(i.found_at || i.where || "").trim(), date: i.date || todayStr(),
    status: ["Unclaimed", "Claim_Pending", "Resolved"].includes(i.status) ? i.status : "Unclaimed",
    reportedBy: i.reportedBy ?? null
  };
}
function migrateOld() {
  // The resource list changed, so old bookings cannot be mapped to the new resources and are dropped.
  // Lost & Found items (and claims, which are tied to user ids) are carried over.
  for (const k of OLD_DATA_KEYS) {
    try { const o = JSON.parse(localStorage.getItem(k)); if (o && Array.isArray(o.items)) return { items: o.items, claims: k === "cp_data_v2" ? o.claims : [] }; } catch (e) {}
  }
  return null;
}
function loadSaved() {
  let s = null, raw = null;
  try { raw = localStorage.getItem(DATA_KEY); } catch (e) {}
  if (raw) { try { s = JSON.parse(raw); } catch (e) { try { localStorage.setItem("cp_data_corrupt_backup", raw); } catch (_) {} } }
  if (!s || typeof s !== "object" || Array.isArray(s)) s = migrateOld() || {};
  DATA.bookings = arr(s.bookings).filter(validBooking);
  DATA.claims = arr(s.claims).filter(validClaim);
  DATA.items = (Array.isArray(s.items) ? s.items : SEED.items).map(normItem).filter(Boolean);
  const m = s.maint && typeof s.maint === "object" ? s.maint : {};
  DATA.resources.forEach(r => {
    const def = !!SEED.resources.find(x => x.id === r.id).maintenance;
    r.maintenance = String(r.id) in m ? !!m[r.id] : def;
  });
  syncResourceStatus();
}
function saveData() {   // throws if the browser refuses to store (full / private mode)
  const maint = {}; DATA.resources.forEach(r => { maint[r.id] = !!r.maintenance; });
  localStorage.setItem(DATA_KEY, JSON.stringify({ bookings: DATA.bookings, items: DATA.items, claims: DATA.claims, maint }));
  try { OLD_DATA_KEYS.forEach(k => localStorage.removeItem(k)); } catch (e) {}
}

// ---------- Booking state (all derived from stored timestamps, so refresh / closing the tab never resets anything) ----------
// Reserved   = slot held, waiting for the lab assistant to verify arrival. Grace period = GRACE_MINUTES after the booking START time.
// Confirmed  = verified by a lab assistant.
// Unverified = grace period ended without verification; the slot is released.
// Completed  = a Confirmed booking whose end time has passed.   Cancelled = cancelled by the student.
const ACTIVE = ["Reserved", "Confirmed"];
function bookingState(b, now = Date.now()) {
  if (["Cancelled", "Completed", "Unverified"].includes(b.status)) return b.status;
  if (now > b.endTs) return b.status === "Confirmed" ? "Completed" : "Unverified";
  if (b.status === "Reserved" && now > b.graceEndTs) return "Unverified";
  return b.status;
}
const isActive = (b, now) => ACTIVE.includes(bookingState(b, now));
function sweepBookings(now = Date.now()) {
  let changed = false;
  DATA.bookings.forEach(b => {
    const s = bookingState(b, now);
    if (s !== b.status) { b.status = s; b.closedAt = s === "Completed" ? b.endTs : Math.min(b.graceEndTs, b.endTs); changed = true; }
  });
  return changed;
}
function resourceStatus(r, now = Date.now()) {
  if (r.maintenance) return "Under Maintenance";
  const act = DATA.bookings.filter(b => b.res == r.id && isActive(b, now));
  if (!act.length) return "Available";
  return act.some(b => b.status === "Confirmed" && b.startTs <= now && now <= b.endTs) ? "In use" : "Booked";
}
function syncResourceStatus(now = Date.now()) { DATA.resources.forEach(r => { r.status = resourceStatus(r, now); }); }
const activeSlots = (resId, now) => DATA.bookings.filter(b => b.res == resId && isActive(b, now)).sort((a, b) => a.startTs - b.startTs);

// ---------- Atomic read-modify-write ----------
const lockRun = fn => (typeof navigator !== "undefined" && navigator.locks && navigator.locks.request)
  ? navigator.locks.request("cp-data", fn) : Promise.resolve().then(fn);
// Snapshot used to skip writes when nothing changed. Idle timers in several open tabs must never rewrite the
// whole data blob: localStorage is replicated between tabs asynchronously, so a needless write could overwrite
// a booking that another tab saved a moment earlier.
const snapshot = () => JSON.stringify([DATA.bookings, DATA.items, DATA.claims, DATA.resources.map(r => !!r.maintenance)]);
function mutate(fn) {
  return lockRun(() => {
    loadSaved();                 // always start from the newest stored data
    const before = snapshot();
    sweepBookings();
    let out;
    try { out = fn(); if (snapshot() !== before) saveData(); } catch (e) { loadSaved(); throw e; }
    syncResourceStatus();
    return out;
  });
}
const bad = (message, field) => ({ ok: false, message, field });
const denied = what => bad("You do not have permission to " + what + ".");
const overlap = (a, b) => a.startTs < b.endTs && a.endTs > b.startTs;

function checkSlot(date, start, end, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  const d = m && new Date(+m[1], +m[2] - 1, +m[3]);
  if (!m || d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return bad("Choose a valid date.", "date");
  const T = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!T.test(start || "")) return bad("Choose a valid start time.", "start");
  if (!T.test(end || "")) return bad("Choose a valid end time.", "end");
  if (end <= start) return bad("End time must be after start time.", "end");
  const s = slotMs(date, start);
  if (s < Math.floor(now / 60000) * 60000) return bad(date === todayStr() ? "The start time has already passed. Choose a later time." : "You cannot book a date in the past.", date === todayStr() ? "start" : "date");
  if (s > now + 365 * 864e5) return bad("Bookings can be made up to one year ahead.", "date");
  return null;
}

const Store = {
  async book({ res, date, start, end }, actor) {
    if (!actor || actor.role !== "student") return denied("book resources (students only)");
    const first = await mutate(() => {
      const r = DATA.resources.find(x => x.id == res);
      if (!r) return bad("Resource not found.", "res");
      if (r.maintenance) return bad(r.name + " is under maintenance and cannot be booked.", "res");
      const v = checkSlot(date, start, end); if (v) return v;
      const startTs = slotMs(date, start), endTs = slotMs(date, end);
      const clash = DATA.bookings.filter(b => b.res == r.id && isActive(b) && overlap({ startTs, endTs }, b));
      const own = clash.find(b => String(b.userId) === String(actor.id));
      if (own) return bad("Duplicate booking: you already have " + r.name + " booked " + own.start + "–" + own.end + " on " + own.date + ".", "start");
      if (clash.length) return bad(r.name + " is already booked " + clash[0].start + "–" + clash[0].end + " on " + clash[0].date + ". Choose another time.", "start");
      const now = Date.now();
      const booking = { id: now * 1000 + Math.floor(Math.random() * 1000), res: r.id, userId: actor.id,
        snap: { name: actor.name, email: actor.email, rollNo: actor.rollNo || null, department: actor.department || null },
        date, start, end, startTs, endTs, graceEndTs: startTs + GRACE_MS,
        status: "Reserved", verified: false, createdAt: now };
      DATA.bookings.push(booking);
      return { ok: true, booking };
    });
    if (!first.ok) return first;
    // Re-verify what is now stored (after a short settle time so writes from other tabs have propagated):
    // if our booking was overwritten, say so; if another writer slipped in an earlier overlapping booking, ours yields.
    await new Promise(r => setTimeout(r, 150));
    return mutate(() => {
      const mine = DATA.bookings.find(b => b.id === first.booking.id);
      if (!mine) return bad("Your booking could not be saved. Please try again.");
      const rival = DATA.bookings.find(b => b.id !== mine.id && b.res == mine.res && isActive(b) && overlap(mine, b) &&
        (b.createdAt < mine.createdAt || (b.createdAt === mine.createdAt && b.id < mine.id)));
      if (rival) { DATA.bookings = DATA.bookings.filter(b => b.id !== mine.id); return bad("Someone else booked this slot a moment earlier. Choose another time.", "start"); }
      return first;
    });
  },
  cancel(id, actor) {
    return mutate(() => {
      const b = DATA.bookings.find(x => String(x.id) === String(id));
      if (!b) return bad("Booking not found.");
      if (!actor || actor.role !== "student" || String(b.userId) !== String(actor.id)) return bad("You can only cancel your own bookings.");
      if (!isActive(b)) return bad("This booking is " + bookingState(b) + " and can no longer be cancelled.");
      b.status = "Cancelled"; b.cancelledAt = Date.now(); b.cancelledBy = actor.id; b.verified = false;
      return { ok: true };
    });
  },
  // Lab assistants verify that a student arrived. Admins do not verify bookings in the existing workflow.
  verify(id, actor) {
    return mutate(() => {
      if (!actor || actor.role !== "assistant") return denied("verify bookings (lab assistants only)");
      const b = DATA.bookings.find(x => String(x.id) === String(id));
      if (!b) return bad("Booking not found.");
      const s = bookingState(b);
      if (s === "Confirmed") return bad("This booking is already verified.");
      if (s !== "Reserved") return bad("Only Reserved bookings can be verified. This one is " + s + ".");
      b.status = "Confirmed"; b.verified = true; b.verifiedBy = actor.id; b.verifiedAt = Date.now();
      return { ok: true };
    });
  },
  setMaintenance(resId, flag, actor) {
    return mutate(() => {
      if (!actor || actor.role !== "admin") return denied("change maintenance status (administrators only)");
      const r = DATA.resources.find(x => x.id == resId);
      if (!r) return bad("Resource not found.");
      r.maintenance = !!flag;
      return { ok: true, activeBookings: activeSlots(r.id).length };
    });
  },
  addItem(f, actor) {
    return mutate(() => {
      if (!actor || actor.role !== "student") return denied("report items (students only)");
      const loc = String(f.found_at || "").trim().replace(/\s+/g, " ");
      const known = [...CAMPUS_PLACES, ...SEED.resources.map(r => r.lab)].find(p => p.toLowerCase() === loc.toLowerCase());
      DATA.items.push({ id: Date.now(), title: f.title, desc: f.desc, cat: f.cat, kind: f.kind, found_at: known || loc, date: todayStr(), status: "Unclaimed", reportedBy: actor.id });
      return { ok: true };
    });
  },
  addClaim(itemId, proof, actor) {
    return mutate(() => {
      if (!actor || actor.role !== "student") return denied("submit claims (students only)");
      const it = DATA.items.find(i => i.id == itemId);
      if (!it) return bad("Item not found.");
      if (it.status === "Resolved") return bad("This item is Resolved and cannot be claimed.");
      if (DATA.claims.some(c => c.item == it.id && String(c.userId) === String(actor.id) && c.status === "Pending")) return bad("You already have a pending claim for this item.");
      DATA.claims.push({ id: Date.now(), item: it.id, userId: actor.id, snap: { name: actor.name, rollNo: actor.rollNo || null, department: actor.department || null }, proof, status: "Pending" });
      it.status = "Claim_Pending";
      return { ok: true };
    });
  },
  decideClaim(id, decision, actor) {
    return mutate(() => {
      if (!actor || actor.role !== "admin") return denied("approve or reject claims (administrators only)");
      if (!["Approved", "Rejected"].includes(decision)) return bad("Unknown decision.");
      const c = DATA.claims.find(x => String(x.id) === String(id));
      if (!c) return bad("Claim not found.");
      if (c.status !== "Pending") return bad("This claim has already been decided.");
      const it = DATA.items.find(i => i.id == c.item);
      if (decision === "Approved" && it && it.status === "Resolved") return bad("This item is already Resolved.");
      c.status = decision; c.decidedBy = actor.id; c.decidedAt = Date.now();
      if (it) it.status = decision === "Approved" ? "Resolved" : (DATA.claims.some(x => x.item == it.id && x.status === "Pending") ? "Claim_Pending" : "Unclaimed");
      return { ok: true };
    });
  },
  // Run on a timer: expire unverified bookings / complete finished ones. Resolves true if anything changed.
  sweepNow() { return mutate(() => sweepBookings()); }
};

// Booked hours / (resources x 8 h x weekdays) for the current month, per laboratory.
function utilization(now = new Date()) {
  const y = now.getFullYear(), mo = now.getMonth(), days = new Date(y, mo + 1, 0).getDate();
  let weekdays = 0; for (let d = 1; d <= days; d++) { const w = new Date(y, mo, d).getDay(); if (w && w !== 6) weekdays++; }
  const labs = [...new Set(DATA.resources.map(r => r.lab))];
  return labs.map(lab => {
    const ids = DATA.resources.filter(r => r.lab === lab).map(r => r.id);
    const hrs = DATA.bookings.filter(b => ids.includes(b.res) && ["Reserved", "Confirmed", "Completed"].includes(bookingState(b)) &&
      new Date(b.startTs).getFullYear() === y && new Date(b.startTs).getMonth() === mo).reduce((s, b) => s + (b.endTs - b.startTs) / 36e5, 0);
    const cap = ids.length * 8 * weekdays;
    return { lab, hrs: Math.round(hrs * 10) / 10, cap, pct: Math.min(100, Math.round(1000 * hrs / cap) / 10) };   // one decimal so a single booking is visible
  });
}

loadSaved();
window.addEventListener("storage", e => {      // another tab of this browser changed the data
  if (e.key === DATA_KEY || e.key === null) { loadSaved(); if (typeof LIVE !== "undefined") LIVE.rerender(); }
});
