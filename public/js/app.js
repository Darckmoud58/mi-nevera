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

const UNITS = ["pzas", "paquetes", "bolsas", "docena"];

const PRESENCE_WORDS = /leche|crema|yogurt|yogur|jocoque|mantequilla|queso|jugo|nectar|néctar|salsa|aderezo|mayonesa|catsup|ketchup|mostaza|mermelada|atole|horchata/;
const COUNT_WORDS = /huevo|jitomate|tomate|limon|limón|naranja|tortilla|manzana|cebolla|chile|aguacate|pieza/;

const FILTERS = [
  { id: "todos", label: "Todo" },
  { id: "nevera", label: "Hay" },
  { id: "bajo", label: "Comprar" },
  { id: "caduca", label: "Caduca" },
  { id: "tirar", label: "Tirar" },
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

function guessTracking(name, category, unit) {
  const n = String(name || "").toLowerCase();
  const u = String(unit || "").toLowerCase();
  if (COUNT_WORDS.test(n)) return "cuenta";
  if (PRESENCE_WORDS.test(n)) return "hay";
  if (["g", "kg", "ml", "l"].includes(u)) return "hay";
  if (["Lácteos", "Bebidas", "Salsas y condimentos", "Sobras"].includes(category)) return "hay";
  return "cuenta";
}

function trackingOf(item) {
  return item.tracking || guessTracking(item.name, item.category, item.unit);
}

function inFridge(item) {
  return Number(item.qty) > 0;
}

function statusOf(item) {
  const days = daysUntil(item.expiry);
  if (inFridge(item) && days !== null && days < 0) return "expired";
  if (inFridge(item) && days !== null && days <= 3) return "soon";
  if (!inFridge(item)) return "low";
  if (trackingOf(item) === "cuenta" && Number(item.qty) <= Number(item.minQty || 0)) return "low";
  return "ok";
}

function statusLabel(status, item) {
  const days = daysUntil(item.expiry);
  if (status === "expired") return "Caducó";
  if (status === "soon") return days === 0 ? "Caduca hoy" : `Caduca en ${days} d`;
  if (status === "low") return trackingOf(item) === "hay" ? "No hay" : "Por reponer";
  return "Hay";
}

function needsBuy(item) {
  const st = statusOf(item);
  if (st === "expired") return true;
  if (!inFridge(item)) return true;
  if (trackingOf(item) === "cuenta") return Number(item.qty) <= Number(item.minQty || 0);
  return false;
}

function needsToss(item) {
  return inFridge(item) && statusOf(item) === "expired";
}

function adviceFor(item) {
  const days = daysUntil(item.expiry);
  const cat = item.category;
  const dairy = cat === "Lácteos" || PRESENCE_WORDS.test(item.name.toLowerCase());
  const meat = cat === "Carnes y huevos";
  const leftover = cat === "Sobras";
  const produce = cat === "Frutas y verduras";

  if (needsToss(item)) {
    if (dairy) {
      return {
        title: "Ya debería tirarse",
        text: "No la pruebes. Si huele agrio, está cortada o ya pasó la fecha, al bote y a la lista de compras.",
      };
    }
    if (meat) {
      return {
        title: "Ya debería tirarse",
        text: "No la cocines para “salvarla”. Carne o huevo dudoso se tira. Compra fresco.",
      };
    }
    if (leftover) {
      return {
        title: "Ya debería tirarse",
        text: "Las sobras no duran más de 3 días. Si ya caducó o no recuerdas de cuándo es, tírala.",
      };
    }
    return {
      title: "Ya debería tirarse",
      text: "Si está caducado o se ve mal, no lo uses. Tíralo y anótalo para comprar.",
    };
  }

  if (!inFridge(item)) {
    return {
      title: "Hay que comprar",
      text: "Se acabó. Queda en la lista hasta que lo marques como comprado.",
    };
  }

  if (days === 0) {
    if (dairy) return { title: "Úsala hoy", text: "Café, atole, enchiladas o un dip. No la dejes para mañana." };
    if (produce) return { title: "Úsala hoy", text: "Licuado, salsa o recaudo. Si está muy madura, hoy es el día." };
    return { title: "Úsala hoy", text: "Priorízala en la comida de hoy para que no se desperdicie." };
  }

  if (days !== null && days > 0 && days <= 3) {
    if (dairy) return { title: "Se acerca la fecha", text: "Huele al abrir. Si está bien, úsala en estos días; si duda, tírala." };
    if (meat) return { title: "Se acerca la fecha", text: "Cocínala ya o pásala al congelador hoy mismo." };
    if (leftover) return { title: "Las sobras no esperan", text: "Termínalas hoy o mañana. Después ya no conviene." };
    return { title: "Se acerca la fecha", text: "Ponlo primero en el menú de estos días." };
  }

  if (dairy) {
    return { title: "Todo bien", text: "Al abrir: olor, color y que no esté cortada. La nevera no hace milagros si ya se echó a perder." };
  }
  if (produce) {
    return { title: "Todo bien", text: "Revisa el cajón: lo más maduro se usa primero." };
  }
  return { title: "Todo bien", text: "Sigue en la nevera. Si se acaba o caduca, aquí te avisa qué comprar." };
}

function buyLabel(item) {
  if (needsToss(item)) return "Tirar y comprar";
  if (trackingOf(item) === "hay") return "Comprar";
  const missing = Math.max(1, Number(item.minQty || 1) - Number(item.qty || 0));
  return `Comprar ${missing} ${item.unit || "pzas"}`;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

function buzz() {
  if (navigator.vibrate) navigator.vibrate(12);
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
        state.items = data.items.map(normalizeItem);
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
    state.items = Array.isArray(local.items) ? local.items.map(normalizeItem) : [];
  } catch {
    state.items = [];
  }
}

function normalizeItem(item) {
  const tracking = trackingOf(item);
  const qty = tracking === "hay" ? (Number(item.qty) > 0 ? 1 : 0) : Number(item.qty || 0);
  return { ...item, tracking, qty };
}

function updateSyncPill() {
  const pill = $("syncPill");
  pill.textContent = state.cloud ? "Nube familiar" : "Este teléfono";
  pill.classList.toggle("cloud", state.cloud);
}

function fillSelect(el, values) {
  el.innerHTML = values.map((v) => `<option value="${v}">${v}</option>`).join("");
}

function setTracking(mode, guessed = false) {
  $("itemTracking").value = mode;
  $("modeHay").classList.toggle("is-on", mode === "hay");
  $("modeCuenta").classList.toggle("is-on", mode === "cuenta");
  $("presenceFields").hidden = mode !== "hay";
  $("countFields").hidden = mode !== "cuenta";
  $("modeHint").textContent =
    mode === "hay"
      ? "Para crema, leche o salsa: un toque si está o ya se acabó."
      : guessed
        ? "Se cuenta por piezas, como huevos o jitomates."
        : "Huevos, tortillas o frutas: cuántas hay y el mínimo para reponer.";
}

function setPresent(hasIt) {
  $("itemQty").value = hasIt ? "1" : "0";
  $("presentYes").classList.toggle("is-on", hasIt);
  $("presentNo").classList.toggle("is-on", !hasIt);
}

function currentTracking() {
  return $("itemTracking").value || "hay";
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
      if (state.filter === "nevera") return inFridge(item) && st !== "expired";
      if (state.filter === "bajo") return needsBuy(item);
      if (state.filter === "caduca") return st === "soon" || st === "expired";
      if (state.filter === "tirar") return needsToss(item);
      return true;
    })
    .sort((a, b) => {
      const rank = { expired: 0, soon: 1, low: 2, ok: 3 };
      return rank[statusOf(a)] - rank[statusOf(b)] || a.name.localeCompare(b.name, "es");
    });
}

function itemCard(item, mode) {
  const st = statusOf(item);
  const tip = adviceFor(item);
  const presence = trackingOf(item) === "hay";
  const control = presence
    ? `<button type="button" class="switch ${inFridge(item) ? "on" : ""}" data-act="toggle" data-id="${item.id}">
        ${inFridge(item) ? "Hay" : "No hay"}
      </button>`
    : `<div class="qty">
        <button type="button" data-act="minus" data-id="${item.id}" aria-label="Restar">−</button>
        <b>${formatQty(item.qty)} ${escapeHtml(item.unit || "pzas")}</b>
        <button type="button" data-act="plus" data-id="${item.id}" aria-label="Sumar">+</button>
      </div>`;

  const actions =
    mode === "shop"
      ? `${needsToss(item) ? `<button class="tiny danger" data-act="toss" data-id="${item.id}">Ya lo tiré</button>` : ""}
         <button class="tiny buy" data-act="bought" data-id="${item.id}">Ya lo compré</button>
         <button class="tiny" data-act="edit" data-id="${item.id}">Editar</button>`
      : `${needsToss(item) ? `<button class="tiny danger" data-act="toss" data-id="${item.id}">Ya lo tiré</button>` : ""}
         <button class="tiny" data-act="edit" data-id="${item.id}">Editar</button>
         <button class="tiny danger" data-act="delete" data-id="${item.id}">Quitar</button>`;

  return `<article class="card ${st}" data-id="${item.id}">
    <div>
      <h3>${escapeHtml(item.name)}</h3>
      <div class="meta">
        <span class="pill ${st}">${statusLabel(st, item)}</span>
        <span>${escapeHtml(item.category)}</span>
        <span>${escapeHtml(item.location)}</span>
        ${item.expiry ? `<span>Cad. ${formatDate(item.expiry)}</span>` : ""}
      </div>
    </div>
    ${control}
    <p class="tip"><strong>${escapeHtml(tip.title)}.</strong> ${escapeHtml(tip.text)}</p>
    <div class="card-actions">${actions}</div>
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
  $("statTotal").textContent = state.items.filter((i) => inFridge(i) && statusOf(i) !== "expired").length;
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

function renderHomeTip() {
  const tipBox = $("homeTip");
  const urgent = state.items
    .map((item) => ({ item, st: statusOf(item) }))
    .sort((a, b) => {
      const rank = { expired: 0, soon: 1, low: 2, ok: 3 };
      return rank[a.st] - rank[b.st];
    })[0];
  if (!urgent || urgent.st === "ok") {
    tipBox.hidden = true;
    tipBox.innerHTML = "";
    return;
  }
  const tip = adviceFor(urgent.item);
  tipBox.hidden = false;
  tipBox.className = `home-tip ${urgent.st}`;
  tipBox.innerHTML = `<strong>${escapeHtml(urgent.item.name)} · ${escapeHtml(tip.title)}</strong><span>${escapeHtml(tip.text)}</span>`;
}

function renderInventory() {
  const items = filteredItems();
  $("inventoryList").innerHTML = items.length
    ? items.map((item) => itemCard(item, "inventory")).join("")
    : emptyState(
        state.items.length ? "Nada coincide" : "La nevera está vacía",
        state.items.length
          ? "Prueba otro filtro o búsqueda."
          : "Pulsa Registrar. Leche y crema: solo si hay o no. Huevos: se cuentan."
      );
}

function renderShop() {
  const items = state.items.filter(needsBuy).sort((a, b) => a.name.localeCompare(b.name, "es"));
  $("shopList").innerHTML = items.length
    ? items
        .map((item) => {
          const tip = adviceFor(item);
          return `<article class="card ${statusOf(item)}">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <div class="meta">
                <span class="pill ${statusOf(item)}">${buyLabel(item)}</span>
                ${item.expiry ? `<span>Cad. ${formatDate(item.expiry)}</span>` : ""}
              </div>
            </div>
            <p class="tip"><strong>${escapeHtml(tip.title)}.</strong> ${escapeHtml(tip.text)}</p>
            <div class="card-actions">
              ${needsToss(item) ? `<button class="tiny danger" data-act="toss" data-id="${item.id}">Ya lo tiré</button>` : ""}
              <button class="tiny buy" data-act="bought" data-id="${item.id}">Ya lo compré</button>
              <button class="tiny" data-act="edit" data-id="${item.id}">Editar</button>
            </div>
          </article>`;
        })
        .join("")
    : emptyState("Nada que comprar", "La nevera está al día. Buen control.");
}

function render() {
  renderFilters();
  renderSummary();
  renderHomeTip();
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
  $("itemCountQty").value = "1";
  $("itemMin").value = "1";
  setTracking("hay");
  setPresent(true);
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
  $("itemUnit").value = item.unit && UNITS.includes(item.unit) ? item.unit : "pzas";
  $("itemMin").value = item.minQty ?? 1;
  $("itemCountQty").value = trackingOf(item) === "cuenta" ? item.qty : 1;
  $("itemExpiry").value = item.expiry || "";
  $("itemNotes").value = item.notes || "";
  setTracking(trackingOf(item));
  setPresent(inFridge(item));
  $("formTitle").textContent = "Editar producto";
  $("saveBtn").textContent = "Actualizar";
  $("cancelEditBtn").hidden = false;
  setView("registrar");
}

async function onListClick(event) {
  const btn = event.target.closest("[data-act]");
  if (!btn) return;
  const item = findItem(btn.dataset.id);
  if (!item) return;
  buzz();
  if (btn.dataset.act === "toggle") {
    item.qty = inFridge(item) ? 0 : 1;
    toast(inFridge(item) ? `${item.name}: hay` : `${item.name}: se acabó, a compras`);
  }
  if (btn.dataset.act === "plus") item.qty = Number(item.qty) + 1;
  if (btn.dataset.act === "minus") item.qty = Math.max(0, Number(item.qty) - 1);
  if (btn.dataset.act === "toss") {
    item.qty = 0;
    toast(`${item.name} tirada. Quedó en la lista de compras`);
  }
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
    if (trackingOf(item) === "hay") {
      item.qty = 1;
      item.expiry = "";
      toast(`${item.name} ya está. Anota la caducidad nueva en Editar`);
    } else {
      item.qty = Math.max(Number(item.minQty || 1), Number(item.qty) + 1);
      toast(`${item.name} ya está en la nevera`);
    }
  }
  await save();
}

async function onSubmit(event) {
  event.preventDefault();
  const tracking = currentTracking();
  const payload = {
    id: $("itemId").value || uid(),
    name: $("itemName").value.trim(),
    category: $("itemCategory").value,
    location: $("itemLocation").value,
    tracking,
    qty: tracking === "hay" ? Number($("itemQty").value) : Number($("itemCountQty").value || 0),
    unit: tracking === "hay" ? "hay" : $("itemUnit").value,
    minQty: tracking === "hay" ? 1 : Number($("itemMin").value || 0),
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

  $("modeHay").addEventListener("click", () => setTracking("hay"));
  $("modeCuenta").addEventListener("click", () => setTracking("cuenta"));
  $("presentYes").addEventListener("click", () => setPresent(true));
  $("presentNo").addEventListener("click", () => setPresent(false));
  $("itemName").addEventListener("input", () => {
    if (state.editingId) return;
    setTracking(guessTracking($("itemName").value, $("itemCategory").value), true);
  });
  $("itemCategory").addEventListener("change", () => {
    if (state.editingId) return;
    setTracking(guessTracking($("itemName").value, $("itemCategory").value), true);
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
