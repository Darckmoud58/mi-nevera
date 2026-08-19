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
  { id: "tirar", label: "Revisar" },
];

const IDEAS = [
  { kicker: "Merienda fácil", text: "Yogurt natural con fruta: proteína, poco lio y se siente casero." },
  { kicker: "Desayuno", text: "Un huevo en la mañana ayuda a llegar más tranquilo hasta la comida." },
  { kicker: "Agua primero", text: "A veces no es hambre: un vaso de agua al abrir la nevera aclara la idea." },
  { kicker: "Colores", text: "Si hay dos verduras de distinto color, hay más vitaminas en el plato sin pensarlo." },
  { kicker: "Plátano maduro", text: "Si ya está pintón, licuado o panqué. No tiene que ir al bote." },
  { kicker: "Sobras con estilo", text: "El pollo de ayer en quesadillas rinde y no se siente repetición." },
  { kicker: "Crema al rescate", text: "Un toque de crema alcanza para enchiladas de toda la casa. Úsala pronto." },
  { kicker: "Tortillas", text: "Bolsa bien cerrada duran más. Si se secan, sopa de tortilla y quedan nuevas." },
  { kicker: "Lonche completo", text: "Queso + una verdura gana a solo pan. Más sabor, más rato satisfecho." },
  { kicker: "Porciones", text: "Congela en tupper chicos. El tú de mañana te lo va a agradecer." },
  { kicker: "Jitomate", text: "Los más blanditos primero: salsa o recaudo. Los firmes pueden esperar." },
  { kicker: "Leche", text: "Si está bien, atole o café con leche. Calcio sin complicarse." },
];

const SUGGEST_NAMES = ["Pan", "Huevos", "Plátanos", "Jitomate", "Cebolla", "Tortillas", "Leche", "Frijoles"];

const state = {
  items: [],
  view: "inventario",
  filter: "todos",
  query: "",
  cloud: false,
  editingId: null,
  ideaIndex: 0,
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

function guessCategory(name) {
  const n = String(name || "").toLowerCase();
  if (/leche|crema|yogurt|yogur|jocoque|mantequilla|queso/.test(n)) return "Lácteos";
  if (/huevo|pollo|carne|res|cerdo|jamon|jamón|salchicha/.test(n)) return "Carnes y huevos";
  if (/jitomate|tomate|limon|limón|naranja|manzana|cebolla|chile|aguacate|platano|plátano|lechuga|fruta/.test(n)) {
    return "Frutas y verduras";
  }
  if (/jugo|agua|refresco|cerveza|atole|horchata/.test(n)) return "Bebidas";
  if (/hielo|nugget|helado/.test(n)) return "Congelados";
  if (/salsa|aderezo|mayonesa|catsup|ketchup|mostaza|mermelada/.test(n)) return "Salsas y condimentos";
  return "Otros";
}

function needsBuy(item) {
  if (item.wanted) return true;
  const st = statusOf(item);
  if (st === "expired") return true;
  if (!inFridge(item)) return true;
  if (trackingOf(item) === "cuenta") return Number(item.qty) <= Number(item.minQty || 0);
  return false;
}

function needsToss(item) {
  return inFridge(item) && statusOf(item) === "expired";
}

function kitchenNudge(item) {
  const days = daysUntil(item.expiry);
  const n = item.name.toLowerCase();
  const dairy = item.category === "Lácteos" || PRESENCE_WORDS.test(n);
  const produce = item.category === "Frutas y verduras";
  const meat = item.category === "Carnes y huevos";
  const leftover = item.category === "Sobras";

  if (needsToss(item)) {
    if (dairy) return "Mejor no usarla. Tírala y anota otra para el súper.";
    if (meat) return "Si duda, no la cocines. Reponer fresco es más barato que enfermarse.";
    if (leftover) return "Las sobras ya cumplieron. Un tupper limpio para lo de hoy.";
    return "Si ya pasó de fecha, al bote y a la lista. Sin drama.";
  }
  if (days === 0) {
    if (dairy) return "Hoy rinde en enchiladas, atole o un café.";
    if (produce) return "Hoy es buen día para salsa, licuado o recaudo.";
    return "Úsalo hoy y la nevera respira.";
  }
  if (days !== null && days > 0 && days <= 3) {
    if (meat) return "Cocínalo o al congelador. En dos días ya no conviene esperar.";
    if (leftover) return "Termínalo en quesadillas o sopa. Mañana ya es otro cuento.";
    return "Estos días, ponlo primero en la comida.";
  }
  return "";
}

function shopWhy(item) {
  if (needsToss(item)) return "Caducó · reponer";
  if (item.wanted && inFridge(item)) return "Lo anotaste";
  if (!inFridge(item)) return "Se acabó";
  if (trackingOf(item) === "cuenta") return "Quedan pocas";
  return "Traer";
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
  const nudge = kitchenNudge(item);
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
    ${nudge && (st === "soon" || st === "expired") ? `<p class="idea-line">${escapeHtml(nudge)}</p>` : ""}
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
  renderHello();
}

function renderHello() {
  const el = $("helloLine");
  if (!el) return;
  const n = Number($("statTotal").textContent);
  const low = Number($("statLow").textContent);
  const exp = Number($("statExpiry").textContent);
  if (!n) el.textContent = "Hoy partimos de cero. ¡A llenar la nevera!";
  else if (exp) el.textContent = "Hay de qué… y una cosita por revisar.";
  else if (low) el.textContent = "Hay de qué, y unas cositas para el súper.";
  else el.textContent = "Hoy la nevera está de buenas.";
}

function renderIdea() {
  const care = state.items.find(needsToss);
  const pool = care
    ? [
        { kicker: "Un toque de orden", text: `La ${care.name} ya no conviene. Tírala desde Inventario y déjala en compras.` },
        ...IDEAS,
      ]
    : IDEAS;
  const idea = pool[Math.abs(state.ideaIndex) % pool.length];
  $("ideaKicker").textContent = idea.kicker;
  $("ideaText").textContent = idea.text;
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
  const onList = new Set(items.map((i) => i.name.toLowerCase()));
  const ideas = SUGGEST_NAMES.filter((n) => !onList.has(n.toLowerCase())).slice(0, 5);
  $("shopSuggest").innerHTML = ideas.length
    ? `<p>Súmale un toque</p><div class="suggest-row">${ideas
        .map((n) => `<button type="button" class="chip" data-suggest="${escapeHtml(n)}">${escapeHtml(n)}</button>`)
        .join("")}</div>`
    : "";
  $("shopList").innerHTML = items.length
    ? items
        .map(
          (item) => `<article class="shop-row">
            <button type="button" class="check" data-act="bought" data-id="${item.id}" aria-label="Ya lo compré"></button>
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(shopWhy(item))}</p>
            </div>
            <div class="shop-side">
              ${needsToss(item) ? `<button class="tiny danger" data-act="toss" data-id="${item.id}">Ya la tiré</button>` : `<button class="tiny" data-act="unlist" data-id="${item.id}">Quitar</button>`}
            </div>
          </article>`
        )
        .join("")
    : emptyState("Lista en blanco", "Escribe arriba o toca una idea. Como el papel, pero se tacha solita.");
}

function render() {
  renderFilters();
  renderSummary();
  renderIdea();
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
  if (btn.dataset.act === "unlist") {
    if (item.source === "shop" && Number(item.qty) === 0) {
      state.items = state.items.filter((i) => i.id !== item.id);
    } else {
      item.wanted = false;
    }
    toast(`${item.name} salió de la lista`);
  }
  if (btn.dataset.act === "edit") {
    fillForm(item);
    return;
  }
  if (btn.dataset.act === "bought") {
    item.wanted = false;
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

async function putOnShopList(name, { quiet = false } = {}) {
  const label = String(name || "").trim();
  if (!label) return false;
  const existing = state.items.find((i) => i.name.toLowerCase() === label.toLowerCase());
  if (existing) {
    if (needsBuy(existing)) return false;
    existing.wanted = true;
    existing.updatedAt = new Date().toISOString();
    return true;
  }
  const category = guessCategory(label);
  const tracking = guessTracking(label, category);
  state.items.unshift({
    id: uid(),
    name: label,
    category,
    location: "Estante medio",
    tracking,
    qty: 0,
    unit: tracking === "hay" ? "hay" : "pzas",
    minQty: 1,
    expiry: "",
    notes: "",
    wanted: true,
    source: "shop",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (!quiet) toast(`${label} se agregó a la lista`);
  return true;
}

async function addToShop(event) {
  event.preventDefault();
  const name = $("shopAddName").value.trim();
  if (!name) return;
  const existing = state.items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (existing && needsBuy(existing)) {
    toast(`${existing.name} ya está en la lista`);
  } else {
    await putOnShopList(name);
    await save();
    if (existing) toast(`${existing.name} se agregó a compras`);
  }
  $("shopAddName").value = "";
  $("shopAddName").focus();
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
  $("shopSuggest").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-suggest]");
    if (!chip) return;
    $("shopAddName").value = chip.dataset.suggest;
    addToShop({ preventDefault() {} });
  });
  $("ideaNext").addEventListener("click", () => {
    state.ideaIndex += 1;
    try {
      sessionStorage.setItem("mi-nevera-idea", String(state.ideaIndex));
    } catch {
      /* ignore */
    }
    renderIdea();
    buzz();
  });
  $("shopAddForm").addEventListener("submit", addToShop);
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
  bindChat();
}

const CHAT_CHIPS = ["Recetas fáciles aunque falte algo", "¿Qué ya caducó?", "¿Qué hay en la nevera?", "¿Hay leche?"];
const chatHistory = [];

function bindChat() {
  $("chatChips").innerHTML = CHAT_CHIPS.map((q) => `<button type="button" class="chip" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("");
  $("askOpen").addEventListener("click", openChat);
  $("askClose").addEventListener("click", closeChat);
  $("chatForm").addEventListener("submit", onChatSubmit);
  $("chatChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-q]");
    if (!chip) return;
    $("chatInput").value = chip.dataset.q;
    onChatSubmit({ preventDefault() {} });
  });
}

function openChat() {
  $("chatPanel").hidden = false;
  document.body.classList.add("chat-open");
  if (!$("chatLog").dataset.ready) {
    addBubble("jarvis", "¡Hola! Soy Jarvis. Pídeme recetas aunque falte algo: si te late, anoto los ingredientes en compras.");
    $("chatLog").dataset.ready = "1";
  }
  $("chatInput").focus();
}

function closeChat() {
  $("chatPanel").hidden = true;
  document.body.classList.remove("chat-open");
}

function addBubble(who, text) {
  const el = document.createElement("div");
  el.className = `bubble ${who}`;
  el.textContent = text;
  $("chatLog").appendChild(el);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
  return el;
}

function addRecipeCards(recipes) {
  if (!Array.isArray(recipes) || !recipes.length) return;
  const wrap = document.createElement("div");
  wrap.className = "recipe-stack";
  wrap.innerHTML = recipes
    .map((recipe) => {
      const missing = recipe.missing || [];
      const have = recipe.have || [];
      const btn = missing.length
        ? `<button type="button" class="tiny buy" data-add-missing="${escapeHtml(missing.join("|"))}" data-recipe="${escapeHtml(recipe.name)}">Sí, hacerla · agregar ${missing.length} a compras</button>`
        : `<button type="button" class="tiny buy" data-add-missing="" data-recipe="${escapeHtml(recipe.name)}">Sí, la hago · ya tienes todo</button>`;
      return `<article class="recipe-card">
        <h3>${escapeHtml(recipe.name)}</h3>
        <p class="recipe-meta">${escapeHtml(recipe.time || "fácil")} · ${escapeHtml(recipe.how || "")}</p>
        ${have.length ? `<p>Ya hay: ${escapeHtml(have.join(", "))}</p>` : `<p>Hoy no tienes estos ingredientes.</p>`}
        ${missing.length ? `<p>Faltaría: <strong>${escapeHtml(missing.join(", "))}</strong></p>` : `<p>No falta nada.</p>`}
        ${btn}
      </article>`;
    })
    .join("");
  $("chatLog").appendChild(wrap);
  wrap.querySelectorAll("[data-add-missing]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const missing = (btn.dataset.addMissing || "").split("|").filter(Boolean);
      const recipe = btn.dataset.recipe || "la receta";
      if (!missing.length) {
        toast(`Perfecto: ${recipe} sale con lo de hoy`);
        addBubble("jarvis", `Órale. ${recipe} sale con lo que ya hay. Cuando la hagas, tacha lo que se acabe.`);
        return;
      }
      let added = 0;
      for (const name of missing) {
        if (await putOnShopList(name, { quiet: true })) added += 1;
      }
      await save();
      toast(added ? `${added} ingrediente(s) a compras` : "Ya estaban en la lista");
      addBubble("jarvis", `Listo: para ${recipe} anoté ${missing.join(", ")} en Compras. ¿Las traemos del súper?`);
      btn.disabled = true;
      btn.textContent = "Anotado en compras";
    });
  });
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}

async function onChatSubmit(event) {
  event.preventDefault();
  const question = $("chatInput").value.trim();
  if (!question) return;
  $("chatInput").value = "";
  addBubble("me", question);
  chatHistory.push({ role: "user", content: question });
  const wait = addBubble("jarvis busy", "Estoy armando ideas…");
  $("chatSend").disabled = true;
  try {
    const res = await fetch("/api/ayuda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        items: state.items,
        history: chatHistory.slice(-6),
      }),
    });
    const data = await res.json();
    const reply = data.reply || "Ahora mismo no pude responder. Intenta de nuevo.";
    wait.classList.remove("busy");
    wait.textContent = reply;
    chatHistory.push({ role: "jarvis", content: reply });
    addRecipeCards(data.recipes);
  } catch {
    wait.classList.remove("busy");
    wait.textContent = "Se me fue la señal. Revisa la red y pregúntame otra vez.";
  } finally {
    $("chatSend").disabled = false;
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
  }
}

async function init() {
  try {
    state.ideaIndex = Number(sessionStorage.getItem("mi-nevera-idea") || 0) || 0;
  } catch {
    state.ideaIndex = 0;
  }
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
