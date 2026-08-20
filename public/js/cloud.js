import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

let createClient = null;

async function loadSdk() {
  if (createClient) return;
  const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm");
  createClient = mod.createClient;
  if (!createClient) throw new Error("No se pudo cargar el acceso");
}

const KEYS = "mi-nevera-supabase";
const HOUSE_KEY = "mi-nevera-hogar";

let client = null;
let config = { url: "", anonKey: "" };
let session = null;
let household = null;
let members = [];
let role = "";

export function hasCloud() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isConfigured() {
  return Boolean(config.url && config.anonKey);
}

export function getSession() {
  return session;
}

export function getHousehold() {
  return household;
}

export function getMembers() {
  return members;
}

export function getRole() {
  return role;
}

export function canEdit() {
  return role === "owner" || role === "adult";
}

export function canInvite() {
  return role === "owner" || role === "adult";
}

function saveLocalConfig(next) {
  localStorage.setItem(KEYS, JSON.stringify(next));
}

export function readLocalConfig() {
  try {
    const local = JSON.parse(localStorage.getItem(KEYS) || "{}");
    if (local.url && local.anonKey) return local;
  } catch {
    /* ignore */
  }
  return { url: "", anonKey: "" };
}

async function resolveConfig() {
  try {
    const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      if (data.url && data.anonKey) return { url: String(data.url).trim(), anonKey: String(data.anonKey).trim() };
    }
  } catch {
    /* sin función o sin env */
  }
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
  }
  return readLocalConfig();
}

export async function saveConfig({ url, anonKey }) {
  const next = { url: String(url || "").trim().replace(/\/$/, ""), anonKey: String(anonKey || "").trim() };
  if (!next.url || !next.anonKey) throw new Error("Faltan la URL o la clave");
  saveLocalConfig(next);
  config = next;
  await loadSdk();
  client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
  });
  const { data } = await client.auth.getSession();
  session = data.session || null;
  return true;
}

export async function initCloud() {
  config = await resolveConfig();
  if (!isConfigured()) {
    client = null;
    session = null;
    return { configured: false, session: null };
  }
  await loadSdk();
  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
    });
    client.auth.onAuthStateChange((_event, next) => {
      session = next;
    });
  }
  const { data } = await client.auth.getSession();
  session = data.session || null;
  return { configured: true, session };
}

export function onAuth(callback) {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, next) => {
    session = next;
    callback(next);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInEmail(email) {
  if (!client) throw new Error("Falta configurar Supabase");
  const { error } = await client.auth.signInWithOtp({
    email: String(email || "").trim(),
    options: {
      emailRedirectTo: `${location.origin}${location.pathname}`,
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
}

export async function signInGoogle() {
  if (!client) throw new Error("Falta configurar Supabase");
  try {
    const res = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.anonKey },
    });
    const settings = await res.json();
    if (!settings?.external?.google) {
      throw new Error("Google aún no está activo. Entre con el correo.");
    }
  } catch (error) {
    if (/aún no está activo/i.test(String(error.message))) throw error;
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${location.origin}${location.pathname}` },
  });
  if (error) throw error;
}

export async function signOut() {
  household = null;
  members = [];
  role = "";
  if (client) await client.auth.signOut();
  session = null;
}

function inviteTokenFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("invitar") || "";
}

export function peekInvite() {
  return inviteTokenFromUrl();
}

export function parseInviteInput(value) {
  let token = String(value || "").trim();
  try {
    const u = new URL(token);
    token = u.searchParams.get("invitar") || token;
  } catch {
    /* texto plano */
  }
  return token.replace(/^invitar=/i, "").trim();
}

export async function joinWithToken(raw) {
  const token = parseInviteInput(raw);
  if (!client || !session) throw new Error("Inicia sesión");
  if (!token) throw new Error("Falta el código");
  const { data, error } = await client.rpc("accept_invite", { p_token: token });
  if (error) throw error;
  localStorage.setItem(HOUSE_KEY, data);
  return loadHousehold();
}

export function clearInviteFromUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has("invitar")) return;
  url.searchParams.delete("invitar");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export async function loadHousehold() {
  household = null;
  members = [];
  role = "";
  if (!client || !session) return null;

  const token = inviteTokenFromUrl();
  if (token) {
    const { data, error } = await client.rpc("accept_invite", { p_token: token });
    if (error) throw error;
    if (data) localStorage.setItem(HOUSE_KEY, data);
    clearInviteFromUrl();
  }

  const { data: rows, error } = await client
    .from("household_members")
    .select("household_id, role, display_name")
    .eq("user_id", session.user.id);
  if (error) throw error;
  const list = rows || [];
  if (!list.length) return null;

  const ids = list.map((row) => row.household_id);
  const { data: houses, error: houseErr } = await client.from("households").select("id, name").in("id", ids);
  if (houseErr) throw houseErr;
  const saved = localStorage.getItem(HOUSE_KEY);
  const pick = list.find((row) => row.household_id === saved) || list[0];
  const info = (houses || []).find((h) => h.id === pick.household_id);
  household = { id: pick.household_id, name: info?.name || "Mi hogar" };
  role = pick.role;
  localStorage.setItem(HOUSE_KEY, household.id);

  const { data: people, error: memErr } = await client
    .from("household_members")
    .select("user_id, role, display_name, created_at")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });
  if (memErr) throw memErr;
  members = people || [];
  return household;
}

export async function createHousehold(name) {
  if (!client) throw new Error("Inicia sesión");
  const { data: sess } = await client.auth.getSession();
  session = sess?.session || session;
  if (!session) throw new Error("Inicia sesión");
  const label = String(name || "").trim() || "Mi hogar";

  const rpc = await client.rpc("create_household", { p_name: label });
  if (!rpc.error && rpc.data) {
    localStorage.setItem(HOUSE_KEY, rpc.data);
    return loadHousehold();
  }

  const { error } = await client.from("households").insert({ name: label, created_by: session.user.id });
  if (error) throw error;
  return loadHousehold();
}

export async function renameHousehold(name) {
  if (!client || !household) throw new Error("Sin hogar");
  const label = String(name || "").trim();
  if (!label) return household;
  const { error } = await client.from("households").update({ name: label }).eq("id", household.id);
  if (error) throw error;
  household = { ...household, name: label };
  return household;
}

export async function createInvite(inviteRole = "adult") {
  if (!client || !household) throw new Error("Sin hogar");
  const { data, error } = await client.rpc("create_invite", {
    p_household_id: household.id,
    p_role: inviteRole,
  });
  if (error) throw error;
  const url = new URL(location.origin + location.pathname.replace(/index\.html$/, ""));
  url.search = "";
  url.hash = "";
  url.searchParams.set("invitar", data);
  return url.toString();
}

export async function loadInventory() {
  if (!client || !household) return null;
  const { data, error } = await client.from("inventories").select("items").eq("household_id", household.id).single();
  if (error) throw error;
  return Array.isArray(data?.items) ? data.items : [];
}

export async function saveInventory(items) {
  if (!client || !household) throw new Error("Sin hogar");
  if (!canEdit()) throw new Error("Solo puedes consultar");
  const { error } = await client
    .from("inventories")
    .update({
      items,
      updated_at: new Date().toISOString(),
      updated_by: session?.user?.id || null,
    })
    .eq("household_id", household.id);
  if (error) throw error;
}

export function userLabel() {
  const email = session?.user?.email || "";
  return email ? email.split("@")[0] : "";
}

export function explainError(error) {
  const msg = String(error?.message || error?.details || error || "");
  const code = String(error?.code || error?.hint || "");
  const full = `${msg} ${code}`.trim();
  if (/gen_random_bytes|pgcrypto/i.test(full)) {
    return "Falta activar pgcrypto. Corre otra vez patch-invitar.sql.";
  }
  if (/schema cache|Could not find the function/i.test(full)) {
    return "Supabase aún no ve la función. En SQL Editor corre: notify pgrst, 'reload schema'; y espera 10 segundos.";
  }
  if (/relation .* does not exist/i.test(full)) {
    return "Falta una tabla. Corre supabase/schema.sql en el SQL Editor.";
  }
  if (/Invalid login|provider is not enabled/i.test(full) && /google/i.test(full)) {
    return "Google aún no está activo en Sign In / Providers.";
  }
  if (/rate limit|429|over_email_send_rate_limit/i.test(full)) {
    return "El correo gratis de Supabase tiene tope. Espera un rato o usa Google.";
  }
  return (msg || full).slice(0, 220);
}
