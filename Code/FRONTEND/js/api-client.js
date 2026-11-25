// Browser-based account store (localStorage). Passwords are salted and hashed, but this is not a substitute for a server.
// FRONTEND-ONLY NOTE: every check below runs in the browser and can be bypassed with developer tools.
// Real authentication and authorization require a backend.
const LocalStore = (() => {
  const USERS = "cp_users", SESSION = "cp_uid", SEED_PW = "Campus@123";
  const ROLE_NAMES = { student: "a Student", assistant: "a Lab Assistant", admin: "an Administrator" };
  const fail = (msg, status, fields = {}) => Object.assign(new Error(msg), { status, fields });
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  async function hash(pw, salt) {
    if (!window.crypto || !crypto.subtle) throw fail("This browser cannot hash passwords. Open the app in a current Chrome, Edge or Firefox.", 500);
    return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw)));
  }
  async function make(name, email, pw, role, extra = {}) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    return { id: Date.now() + Math.floor(Math.random() * 100000), name, email, salt, hash: await hash(pw, salt), role, createdAt: Date.now(), ...extra };
  }
  // Older versions used @campus.example addresses; move them to the university domains.
  function migrateEmails(list) {
    let changed = false;
    list.forEach(u => {
      const m = /^(.+)@campus\.example$/i.exec(u.email || "");
      if (!m) return;
      const ne = m[1].toLowerCase() + (u.role === "student" ? "@student.uet.pk" : "@uet.pk");
      if (!list.some(x => x.email === ne)) { u.email = ne; changed = true; }
    });
    return changed;
  }
  const validUser = u => u && typeof u === "object" && u.id != null && u.email && u.salt && u.hash && ROLE_NAMES[u.role];
  async function users() {
    let u = null, raw = localStorage.getItem(USERS);
    try { u = JSON.parse(raw || "null"); } catch (e) { u = null; if (raw) { try { localStorage.setItem(USERS + "_corrupt_backup", raw); } catch (_) {} } }
    if (Array.isArray(u)) {
      const clean = u.filter(validUser);
      if (clean.length !== u.length || migrateEmails(clean)) localStorage.setItem(USERS, JSON.stringify(clean));
      if (clean.length) return clean;
    }
    // First run (or unreadable data): create the two staff accounts that cannot self-register.
    // No student account is pre-created: students register themselves.
    u = [await make("Ihtisham", "ihtisham@uet.pk", SEED_PW, "assistant", { bootstrap: true }),
         await make("Umer", "umer@uet.pk", SEED_PW, "admin", { bootstrap: true })];
    localStorage.setItem(USERS, JSON.stringify(u));
    return u;
  }
  const save = u => localStorage.setItem(USERS, JSON.stringify(u));
  const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt || null,
    // A roll number must contain a digit; anything else (e.g. a name left by an older version) counts as "not set".
    rollNo: u.role === "student" && /\d/.test(u.rollNo || "") ? u.rollNo : null,
    department: u.role === "student" && CONFIG.DEPARTMENTS.includes(u.department) ? u.department : null });
  const profileErrors = (name, email, role, roll, dept, needDept) => {
    const e = {};
    if (role === "student" && needDept && !CONFIG.DEPARTMENTS.includes(dept)) e.department = "Select your department.";
    if (role === "student") { const re = CONFIG.rollError(roll); if (re) e.rollNo = re; }
    if (name.length < 2 || name.length > 80) e.name = "Enter your full name (2 to 80 characters).";
    const em = CONFIG.emailError(email, role);
    if (em) e.email = em;
    return e;
  };
  function current(list) {
    const id = sessionStorage.getItem(SESSION);
    return list.find(x => String(x.id) === id) || null;
  }
  async function handle(path, method, d = {}) {
    const list = await users();
    const name = String(d.name || "").trim(), email = String(d.email || "").trim().toLowerCase(), pw = String(d.password || "");
    if (path === "/register" && method === "POST") {
      const role = d.role || "student";
      const errs = ["student", "assistant"].includes(role) ? profileErrors(name, email, role, d.rollNo, d.department, true) : { role: "Choose Student or Lab Assistant." };
      const roll = CONFIG.normRoll(d.rollNo);
      if (role === "student" && !errs.rollNo && list.some(u => u.role === "student" && CONFIG.rollKey(u.rollNo) === CONFIG.rollKey(roll))) errs.rollNo = "This roll number is already registered.";
      if (pw.length < 8 || pw.length > 128) errs.password = "Use a password of 8 to 128 characters.";
      if (Object.keys(errs).length) throw fail("Please correct the highlighted fields.", 400, errs);
      if (list.some(u => u.email === email)) throw fail("An account with this email already exists.", 409, { email: "Already registered." });
      list.push(await make(name, email, pw, role, role === "student" ? { rollNo: roll, department: d.department } : {}));
      save(list);
      return { message: "Account created. You can now sign in." };
    }
    if (path === "/login" && method === "POST") {
      if (!ROLE_NAMES[d.role]) throw fail("Select the role you registered with.", 400, { role: "Select a role." });
      const emErr = CONFIG.loginEmailError(email);
      if (emErr) throw fail(emErr, 400, { email: emErr });
      const u = list.find(x => x.email === email);
      if (!u || (await hash(pw, u.salt)) !== u.hash) throw fail("Invalid email or password.", 401);
      if (u.role !== d.role) throw fail("This account is not registered as " + ROLE_NAMES[d.role] + ". Select the role you registered with.", 403, { role: "Does not match your account." });
      if (u.role === "student") {
        // Roll number given at sign-in: it must match the one registered. An older account that has none yet
        // gets it saved now, once; after that it is fixed.
        const entered = CONFIG.normRoll(d.rollNo), has = /\d/.test(u.rollNo || "");
        if (has) {
          if (entered && CONFIG.rollKey(entered) !== CONFIG.rollKey(u.rollNo)) throw fail("The roll number does not match this account.", 403, { rollNo: "Does not match your account." });
        } else {
          const re = CONFIG.rollError(entered);
          if (re) throw fail("Your account has no roll number saved yet. Enter your roll number to continue.", 400, { rollNo: re });
          if (list.some(x => x.id !== u.id && x.role === "student" && CONFIG.rollKey(x.rollNo) === CONFIG.rollKey(entered))) throw fail("This roll number is already registered to another account.", 409, { rollNo: "Already registered." });
          u.rollNo = entered; save(list);
        }
      }
      sessionStorage.setItem(SESSION, u.id);
      return { user: pub(u) };
    }
    if (path === "/logout") { sessionStorage.removeItem(SESSION); return { message: "Signed out." }; }
    const me = current(list);
    if (!me) throw fail("Please sign in.", 401);
    if (path === "/me" && method === "GET") return { user: pub(me) };
    if (path === "/me" && method === "PUT") {
      // Roll number and department are set once at registration and are fixed afterwards.
      const hasRoll = me.role === "student" && /\d/.test(me.rollNo || ""), hasDept = me.role === "student" && CONFIG.DEPARTMENTS.includes(me.department);
      if (me.role === "student" && d.rollNo !== undefined && !(hasRoll && CONFIG.rollKey(d.rollNo) === CONFIG.rollKey(me.rollNo))) throw fail("Your roll number is entered at registration or sign-in and cannot be set or changed here.", 403, { rollNo: "Cannot be changed." });
      if (hasDept && d.department !== undefined && d.department !== me.department) throw fail("Your department was set at registration and cannot be changed.", 403, { department: "Cannot be changed." });
      const rollIn = me.rollNo;   // roll number and department are never edited from the profile
      const errs = profileErrors(name, email, me.role, hasRoll ? rollIn : "AA-0", null, false);   // role comes from the stored account, never from the request
            if (Object.keys(errs).length) throw fail("Please correct the highlighted fields.", 400, errs);
      if (list.some(u => u.email === email && u.id !== me.id)) throw fail("Another account already uses that email.", 409, { email: "Already in use." });
      me.name = name; me.email = email; save(list);
      return { user: pub(me) };
    }
    if (path === "/users" && method === "GET") {
      if (me.role !== "admin") throw fail("You do not have permission to do that.", 403);
      return { users: list.map(pub) };
    }
    // Staff-only lookup so the Booking Overview can show who booked a resource.
    if (path === "/directory" && method === "GET") {
      if (me.role !== "admin" && me.role !== "assistant") throw fail("You do not have permission to do that.", 403);
      return { users: list.map(pub) };
    }
    throw fail("Not found.", 404);
  }
  return { handle };
})();

// Fetch wrapper: uses LocalStore in the browser, or a Flask API when configured.
const api = {
  async request(path, opts = {}) {
    if (CONFIG.USE_LOCAL_STORAGE) return LocalStore.handle(path, opts.method || "GET", opts.body);
    let r;
    try {
      r = await fetch(CONFIG.API_BASE_URL + path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) { throw new Error("Cannot reach the server."); }
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error(data.error || "Request failed (" + r.status + ")"), { status: r.status, fields: data.fields || {} });
    return data;
  },
  get: p => api.request(p),
  post: (p, b) => api.request(p, { method: "POST", body: b || {} }),
  put: (p, b) => api.request(p, { method: "PUT", body: b })
};
