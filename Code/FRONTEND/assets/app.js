const API = "/api";

const state = { resources: [], bookings: [], claims: [], stats: {} };

async function get(path) {
  const response = await fetch(`${API}${path}`, { credentials: "same-origin" });
  if (response.status === 401) { showAuth(); throw new Error("Authentication required"); }
  if (!response.ok) throw new Error("Unable to load CampusPulse data");
  return response.json();
}

async function post(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function renderStats() {
  const stats = state.stats;
  document.querySelector("#stats").innerHTML = `
    <article class="stat"><span>Available resources</span><strong>${stats.total_resources || 0}</strong></article>
    <article class="stat"><span>Confirmed bookings</span><strong>${stats.confirmed_bookings || 0}</strong></article>
    <article class="stat"><span>Cancelled slots</span><strong>${stats.cancelled_bookings || 0}</strong></article>
    <article class="stat"><span>Pending claims</span><strong>${stats.pending_claims || 0}</strong></article>`;
}

function renderResources() {
  document.querySelector("#resource-list").innerHTML = state.resources.slice(0, 5).map(resource => `
    <div class="resource-row"><div><strong>${escapeHtml(resource.name)}</strong><span>${escapeHtml(resource.location)} · ${escapeHtml(resource.category)}</span></div><span class="dot" title="Available"></span></div>`).join("");

  document.querySelector("#resources-grid").innerHTML = state.resources.map(resource => `
    <article class="resource-card"><div><span>${escapeHtml(resource.category)}</span><h2>${escapeHtml(resource.name)}</h2></div><div><strong>${escapeHtml(resource.location)}</strong><span> · ${resource.capacity} ${resource.capacity === 1 ? "seat" : "seats"}</span></div><button class="primary resource-book" data-id="${resource.id}">Book</button></article>`).join("");

  document.querySelector("#booking-resource").innerHTML = state.resources.map(resource => `<option value="${resource.id}">${escapeHtml(resource.name)} — ${escapeHtml(resource.location)}</option>`).join("");
}

function renderBookings() {
  document.querySelector("#bookings").innerHTML = state.bookings.length ? state.bookings.map(booking => {
    const date = new Date(booking.start_at);
    return `<div class="booking-row"><div class="date-block"><span>${date.toLocaleString("en", { month: "short" })}</span><strong>${date.getDate()}</strong></div><div class="booking-info"><strong>${escapeHtml(booking.resource)}</strong><span>${formatTime(booking.start_at)}–${formatTime(booking.end_at)}</span></div><span class="status">${escapeHtml(booking.status)}</span></div>`;
  }).join("") : `<div class="booking-row"><div class="booking-info"><strong>No bookings yet</strong><span>Reserve a resource to get started.</span></div></div>`;
}

function renderClaims() {
  document.querySelector("#claims-list").innerHTML = state.claims.length ? state.claims.map(claim => `
    <div class="claim-row"><div><strong>${escapeHtml(claim.item)}</strong><div><span>${escapeHtml(claim.claimant)} · ${escapeHtml(claim.proof)}</span></div></div><span class="status">${escapeHtml(claim.status)}</span></div>`).join("") : `<div class="claim-row"><div><strong>No claims submitted</strong><span>Claims will appear here for admin review.</span></div></div>`;
}

async function loadData() {
  const [resources, bookings, claims, stats] = await Promise.all([
    get("/resources"), get("/bookings"), get("/claims"), get("/dashboard/stats"),
  ]);
  Object.assign(state, { resources, bookings, claims, stats });
  renderStats(); renderResources(); renderBookings(); renderClaims();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function setDefaultTimes() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const toLocal = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.querySelector("#booking-start").value = toLocal(start);
  document.querySelector("#booking-end").value = toLocal(end);
}

document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  document.querySelector(`#${button.dataset.view}-view`).classList.add("active");
  document.querySelector("#page-title").textContent = button.dataset.view === "dashboard" ? "Good morning" : button.textContent;
}));

const dialog = document.querySelector("#booking-dialog");
document.querySelector("#new-request").addEventListener("click", () => { setDefaultTimes(); dialog.showModal(); });
document.addEventListener("click", event => {
  const button = event.target.closest(".resource-book");
  if (button) { setDefaultTimes(); document.querySelector("#booking-resource").value = button.dataset.id; dialog.showModal(); }
});

document.querySelector("#booking-form").addEventListener("submit", async event => {
  event.preventEventDefault?.();
  event.preventDefault();
  const submit = document.querySelector("#submit-booking");
  submit.disabled = true;
  try {
    await post("/bookings", {
      resource_id: Number(document.querySelector("#booking-resource").value),
      start_at: document.querySelector("#booking-start").value,
      end_at: document.querySelector("#booking-end").value,
      user_id: 1,
    });
    dialog.close(); showToast("Booking confirmed"); await loadData();
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
  }
});

let authMode = "login";

function showAuth() {
  document.querySelector("#app-shell").classList.add("hidden");
  document.querySelector("#auth-screen").classList.remove("hidden");
}

function showApp(user) {
  document.querySelector("#auth-screen").classList.add("hidden");
  document.querySelector("#app-shell").classList.remove("hidden");
  document.querySelector("#account-name").textContent = user.name;
  document.querySelector("#account-role").textContent = user.role;
  document.querySelector("#page-title").textContent = `Welcome, ${user.name.split(" ")[0]}`;
  if (user.role !== "Student") {
    document.querySelector("#new-request").hidden = true;
  }
  loadData().catch(error => showToast(error.message));
}

function setAuthMode(mode) {
  authMode = mode;
  const login = mode === "login";
  document.querySelector("#login-tab").classList.toggle("active", login);
  document.querySelector("#register-tab").classList.toggle("active", !login);
  document.querySelector("#name-field").classList.toggle("hidden", login);
  document.querySelector("#auth-name").required = !login;
  document.querySelector("#auth-password").autocomplete = login ? "current-password" : "new-password";
  document.querySelector("#auth-submit").textContent = login ? "Sign in" : "Create student account";
  document.querySelector("#auth-error").textContent = "";
}

document.querySelector("#login-tab").addEventListener("click", () => setAuthMode("login"));
document.querySelector("#register-tab").addEventListener("click", () => setAuthMode("register"));

document.querySelector("#auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  const submit = document.querySelector("#auth-submit");
  submit.disabled = true;
  try {
    const body = { email: document.querySelector("#auth-email").value.trim(), password: document.querySelector("#auth-password").value };
    const path = authMode === "login" ? "/auth/login" : "/auth/register";
    if (authMode === "register") body.name = document.querySelector("#auth-name").value.trim();
    const user = await post(path, body);
    showApp(user);
  } catch (error) {
    document.querySelector("#auth-error").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelectorAll(".demo-logins button").forEach(button => button.addEventListener("click", () => {
  document.querySelector("#auth-email").value = button.dataset.email;
  document.querySelector("#auth-password").value = "password";
  setAuthMode("login");
}));

document.querySelector("#logout-button").addEventListener("click", async () => {
  await post("/auth/logout", {});
  showAuth();
});

get("/auth/me").then(showApp).catch(() => showAuth());
