const STORAGE_KEY = "mi-nevera-v1";
const API_URL = "/api/inventario";

const CATEGORIES = [
  "Lácteos",
  "Carnes y huevos",
  "Frutas y verduras",
  "Bebidas",
  "Congelados",
  "Salsas y condimentos",
  "Sobras",
  "Otros",
];

const LOCATIONS = [
  "Puerta",
  "Estante superior",
  "Estante medio",
  "Estante inferior",
  "Cajón de verduras",
  "Congelador",
];

const UNITS = ["pzas", "L", "ml", "kg", "g", "paquetes", "bolsas"];

const FILTERS = [
  { id: "todos", label: "Todo" },
  { id: "nevera", label: "En nevera" },
  { id: "bajo", label: "Por reponer" },
  { id: "caduca", label: "Por caducar" },
];

const state = {
  items: [],
  view: "inventario",
  filter: "todos",
  query: "",
  cloud: false,
  editingId: null,
};

const $ = (id) => document.getElementById(id);

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `n-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const a = new Date(`${todayISO()}T00:00:00`);
  const b = new Date(`${dateStr}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function statusOf(item) {
  const days = daysUntil(item.expiry);
  if (days !== null && days < 0) return "expired";
  if (days !== null && days <= 3) return "soon";
  if (Number(item.qty) <= Number(item.minQty || 0)) return "low";
  return "ok";
}

function statusLabel(status, item) {
  const days = daysUntil(item.expiry);
  if (status === "expired") return "Caducó";
  if (status === "soon") return days === 0 ? "Caduca hoy" : `Caduca en ${days} d`;
  if (status === "low") return Number(item.qty) <= 0 ? "No hay" : "Por reponer";
  return "Ok";
}

function inFridge(item) {
  return Number(item.qty) > 0;
}

function needsBuy(item) {
  return Number(item.qty) <= Number(item.minQty || 0);
}

function buyQty(item) {
  const missing = Number(item.minQty || 0) - Number(item.qty || 0);
  return missing > 0 ? missing : Number(item.minQty || 1);
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function persistLocal() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ items: state.items, updatedAt: new Date().toISOString() })
  );
}

async function persistCloud() {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: state.items, updatedAt: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error("cloud");
    state.cloud = true;
  } catch {
    state.cloud = false;
  }
  updateSyncPill();
}

async function save() {
  persistLocal();
  await persistCloud();
  render();
}

async function load() {
  try {
    const res = await fetch(API_URL, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items)) {
        state.items = data.items;
        state.cloud = true;
        persistLocal();
        return;
      }
    }
  } catch {
    /* usa copia local */
  }
  try {
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.items = Array.isArray(local.items) ? local.items : [];
  } catch {
    state.items = [];
  }
}

function updateSyncPill() {
  const pill = $("syncPill");
  pill.textContent = state.cloud ? "Nube familiar" : "Este teléfono";
  pill.classList.toggle("cloud", state.cloud);
}

function fillSelect(el, values) {
  el.innerHTML = values.map((v) => `<option value="${v}">${v}</option>`).join("");
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));
  document.querySelectorAll(".dock-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.go === view));
  if (view === "qr") drawQr();
  if (view === "registrar" && !state.editingId) resetForm();
  history.replaceState(null, "", view === "inventario" ? "./" : `./#${view}`);
}

function filteredItems() {
  const q = state.query.trim().toLowerCase();
  return state.items
    .filter((item) => {
      if (q && !`${item.name} ${item.notes || ""} ${item.category}`.toLowerCase().includes(q)) return false;
      const st = statusOf(item);
      if (state.filter === "nevera") return inFridge(item);
      if (state.filter === "bajo") return needsBuy(item);
      if (state.filter === "caduca") return st === "soon" || st === "expired";
      return true;
    })
    .sort((a, b) => {
      const rank = { expired: 0, soon: 1, low: 2, ok: 3 };
      return rank[statusOf(a)] - rank[statusOf(b)] || a.name.localeCompare(b.name, "es");
    });
}

function itemCard(item, mode) {
  const st = statusOf(item);
  const extra =
    mode === "shop"
      ? `<div class="card-actions">
          <button class="tiny buy" data-act="bought" data-id="${item.id}">Ya lo compré (+${buyQty(item)})</button>
          <button class="tiny" data-act="edit" data-id="${item.id}">Editar</button>
        </div>`
      : `<div class="card-actions">
          <button class="tiny" data-act="edit" data-id="${item.id}">Editar</button>
          <button class="tiny danger" data-act="delete" data-id="${item.id}">Quitar</button>
        </div>`;

  return `<article class="card" data-id="${item.id}">
    <div>
      <h3>${escapeHtml(item.name)}</h3>
      <div class="meta">
        <span class="pill ${st}">${statusLabel(st, item)}</span>
        <span>${escapeHtml(item.category)}</span>
        <span>${escapeHtml(item.location)}</span>
        ${item.expiry ? `<span>Cad. ${formatDate(item.expiry)}</span>` : ""}
      </div>
    </div>
    <div class="qty">
      <button type="button" data-act="minus" data-id="${item.id}" aria-label="Restar">−</button>
      <b>${formatQty(item.qty)} ${escapeHtml(item.unit)}</b>
      <button type="button" data-act="plus" data-id="${item.id}" aria-label="Sumar">+</button>
    </div>
    ${extra}
  </article>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatQty(n) {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : String(num);
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function emptyState(title, text) {
  return `<div class="empty"><h3>${title}</h3><p>${text}</p></div>`;
}

function renderFilters() {
  $("filterChips").innerHTML = FILTERS.map(
    (f) => `<button class="chip ${state.filter === f.id ? "is-on" : ""}" data-filter="${f.id}">${f.label}</button>`
  ).join("");
}

function renderSummary() {
  const inStock = state.items.filter(inFridge);
  $("statTotal").textContent = inStock.length;
  $("statLow").textContent = state.items.filter(needsBuy).length;
  $("statExpiry").textContent = state.items.filter((i) => {
    const s = statusOf(i);
    return s === "soon" || s === "expired";
  }).length;
  const shopCount = state.items.filter(needsBuy).length;
  const badge = $("shopBadge");
  badge.hidden = shopCount === 0;
  badge.textContent = shopCount;
}

function renderInventory() {
  const items = filteredItems();
  $("inventoryList").innerHTML = items.length
    ? items.map((item) => itemCard(item, "inventory")).join("")
    : emptyState(
        state.items.length ? "Nada coincide" : "La nevera está vacía",
        state.items.length
          ? "Prueba otro filtro o búsqueda."
          : "Pulsa Registrar y anota lo que hay. Luego pega el QR en la puerta."
      );
}

function renderShop() {
  const items = state.items.filter(needsBuy).sort((a, b) => a.name.localeCompare(b.name, "es"));
  $("shopList").innerHTML = items.length
    ? items
        .map((item) => {
          const missing = buyQty(item);
          return `<article class="card">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <div class="meta">
                <span class="pill low">Comprar ${formatQty(missing)} ${escapeHtml(item.unit)}</span>
                <span>Hay ${formatQty(item.qty)} · mínimo ${formatQty(item.minQty || 0)}</span>
              </div>
            </div>
            <div class="card-actions" style="grid-column:1/-1">
              <button class="tiny buy" data-act="bought" data-id="${item.id}">Ya lo compré</button>
              <button class="tiny" data-act="edit" data-id="${item.id}">Editar</button>
            </div>
          </article>`;
        })
        .join("")
    : emptyState("Nada que comprar", "Todo está en el mínimo o por encima. Buen control.");
}

function render() {
  renderFilters();
  renderSummary();
  renderInventory();
  renderShop();
  updateSyncPill();
}

function findItem(id) {
  return state.items.find((i) => i.id === id);
}

function resetForm() {
  state.editingId = null;
  $("itemForm").reset();
  $("itemId").value = "";
  $("itemQty").value = "1";
  $("itemMin").value = "1";
  $("formTitle").textContent = "Registrar producto";
  $("saveBtn").textContent = "Guardar en nevera";
  $("cancelEditBtn").hidden = true;
}

function fillForm(item) {
  state.editingId = item.id;
  $("itemId").value = item.id;
  $("itemName").value = item.name;
  $("itemCategory").value = item.category;
  $("itemLocation").value = item.location;
  $("itemQty").value = item.qty;
  $("itemUnit").value = item.unit;
  $("itemMin").value = item.minQty ?? 1;
  $("itemExpiry").value = item.expiry || "";
  $("itemNotes").value = item.notes || "";
  $("formTitle").textContent = "Editar producto";
  $("saveBtn").textContent = "Actualizar";
  $("cancelEditBtn").hidden = false;
  setView("registrar");
}

async function onListClick(event) {
  const btn = event.target.closest("button[data-act]");
  if (!btn) return;
  const item = findItem(btn.dataset.id);
  if (!item) return;
  if (btn.dataset.act === "plus") item.qty = Number(item.qty) + 1;
  if (btn.dataset.act === "minus") item.qty = Math.max(0, Number(item.qty) - 1);
  if (btn.dataset.act === "delete") {
    if (!confirm(`¿Quitar ${item.name} del inventario?`)) return;
    state.items = state.items.filter((i) => i.id !== item.id);
    toast("Producto quitado");
  }
  if (btn.dataset.act === "edit") {
    fillForm(item);
    return;
  }
  if (btn.dataset.act === "bought") {
    item.qty = Number(item.qty) + buyQty(item);
    toast(`${item.name} ya está en la nevera`);
  }
  await save();
}

async function onSubmit(event) {
  event.preventDefault();
  const payload = {
    id: $("itemId").value || uid(),
    name: $("itemName").value.trim(),
    category: $("itemCategory").value,
    location: $("itemLocation").value,
    qty: Number($("itemQty").value),
    unit: $("itemUnit").value,
    minQty: Number($("itemMin").value || 0),
    expiry: $("itemExpiry").value || "",
    notes: $("itemNotes").value.trim(),
    updatedAt: new Date().toISOString(),
  };
  if (!payload.name) return;
  const idx = state.items.findIndex((i) => i.id === payload.id);
  if (idx >= 0) state.items[idx] = { ...state.items[idx], ...payload };
  else state.items.unshift({ ...payload, createdAt: payload.updatedAt });
  await save();
  toast(idx >= 0 ? "Producto actualizado" : "Producto registrado");
  resetForm();
  setView("inventario");
}

function publicUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/index\.html$/, "");
  return url.toString();
}

function drawQr() {
  const url = publicUrl();
  $("qrUrl").textContent = url;
  $("qrImage").src =
    "https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&ecc=M&data=" + encodeURIComponent(url);
}

function bind() {
  fillSelect($("itemCategory"), CATEGORIES);
  fillSelect($("itemLocation"), LOCATIONS);
  fillSelect($("itemUnit"), UNITS);

  document.querySelectorAll(".dock-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.go));
  });

  $("filterChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (!chip) return;
    state.filter = chip.dataset.filter;
    render();
  });

  $("searchInput").addEventListener("input", (e) => {
    state.query = e.target.value;
    renderInventory();
  });

  $("inventoryList").addEventListener("click", onListClick);
  $("shopList").addEventListener("click", onListClick);
  $("itemForm").addEventListener("submit", onSubmit);
  $("cancelEditBtn").addEventListener("click", () => {
    resetForm();
    setView("inventario");
  });
  $("printQrBtn").addEventListener("click", () => {
    setView("qr");
    window.print();
  });
  $("copyLinkBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(publicUrl());
    toast("Enlace copiado");
  });
}

async function init() {
  bind();
  await load();
  const hash = location.hash.replace("#", "");
  setView(["inventario", "compras", "registrar", "qr"].includes(hash) ? hash : "inventario");
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
