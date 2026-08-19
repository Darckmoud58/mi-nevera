const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

const RECIPES = [
  { id: "huevos-mexicana", name: "Huevos a la mexicana", time: "15 min", need: ["huevo", "jitomate", "cebolla"], how: "Sofríe jitomate y cebolla, tira los huevos." },
  { id: "quesadillas", name: "Quesadillas", time: "10 min", need: ["tortillas", "queso"], how: "Queso al comal. Si hay pollo o champiñón, súmale." },
  { id: "enchiladas", name: "Enchiladas simples", time: "25 min", need: ["tortillas", "salsa", "crema", "queso"], how: "Tortilla, salsa, un toque de crema y queso." },
  { id: "pasta-ajo", name: "Pasta al ajo", time: "20 min", need: ["pasta", "ajo", "aceite"], how: "Agua, pasta, ajo en aceite. Queso o crema al final si hay." },
  { id: "sopa-tortilla", name: "Sopa de tortilla", time: "25 min", need: ["tortillas", "jitomate", "crema"], how: "Caldo de jitomate, tiritas de tortilla y crema." },
  { id: "licuado", name: "Licuado rápido", time: "5 min", need: ["leche", "plátano"], how: "Leche, plátano, un hielo si hay." },
  { id: "sandwich", name: "Sándwich de la casa", time: "8 min", need: ["pan", "queso"], how: "Pan, queso y lo que haya: jamón, jitomate o un huevo." },
  { id: "huevos-estrellados", name: "Huevos estrellados", time: "10 min", need: ["huevo", "aceite"], how: "Sartén, huevo, sal. Con tortillas o pan ya es desayuno." },
  { id: "frijoles-queso", name: "Frijoles con queso", time: "15 min", need: ["frijoles", "queso"], how: "Calienta frijoles, queso encima, tortillas." },
  { id: "hotcakes", name: "Hotcakes simples", time: "20 min", need: ["huevo", "leche", "harina"], how: "Huevo, leche, harina, sartén." },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const a = new Date(`${todayISO()}T00:00:00`);
  const b = new Date(`${dateStr}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function fold(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function snapshot(items) {
  return (items || []).slice(0, 120).map((item) => {
    const qty = Number(item.qty || 0);
    const days = daysUntil(item.expiry);
    let estado = qty > 0 ? "hay" : "no hay";
    if (qty > 0 && days !== null && days < 0) estado = "caduco";
    else if (qty > 0 && days !== null && days <= 3) estado = "por caducar";
    return {
      nombre: item.name,
      categoria: item.category,
      hay: qty > 0,
      cantidad: qty,
      unidad: item.unit || "",
      caducidad: item.expiry || "",
      dias: days,
      estado,
      ubicacion: item.location || "",
    };
  });
}

function usable(items) {
  return items.filter((i) => i.hay && i.estado !== "caduco");
}

function matchNeed(items, need) {
  const n = fold(need);
  return usable(items).find((i) => {
    const name = fold(i.nombre);
    return name.includes(n) || n.includes(name.split(" ")[0]);
  });
}

function scoreRecipes(items) {
  return RECIPES.map((recipe) => {
    const have = [];
    const missing = [];
    for (const need of recipe.need) {
      const hit = matchNeed(items, need);
      if (hit) have.push(hit.nombre);
      else missing.push(need.charAt(0).toUpperCase() + need.slice(1));
    }
    return { id: recipe.id, name: recipe.name, time: recipe.time, how: recipe.how, have, missing, missingCount: missing.length, need: recipe.need };
  }).sort((a, b) => a.missingCount - b.missingCount || a.need.length - b.need.length);
}

function wantsRecipes(q) {
  return /receta|cocin|facil|almorz|cenar|desayun|prepar|enchilada|comida|que como|platillo|menu|cocinar|hacer de comer|que se te antoja/.test(q);
}

function normalizeRecipes(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 4).map((recipe, index) => ({
    id: String(recipe.id || `r-${index}`).slice(0, 60),
    name: String(recipe.name || "Receta").slice(0, 80),
    time: String(recipe.time || "fácil").slice(0, 40),
    how: String(recipe.how || "").slice(0, 280),
    have: Array.isArray(recipe.have) ? recipe.have.map((x) => String(x).slice(0, 40)).slice(0, 8) : [],
    missing: Array.isArray(recipe.missing) ? recipe.missing.map((x) => String(x).slice(0, 40)).slice(0, 8) : [],
  }));
}

function parseAi(text) {
  const raw = String(text || "").trim();
  const block = raw.match(/<!--RECIPES\s*([\s\S]*?)-->/i);
  if (block) {
    const reply = raw.replace(block[0], "").trim();
    try {
      return { reply, recipes: normalizeRecipes(JSON.parse(block[1])) };
    } catch {
      return { reply, recipes: [] };
    }
  }
  const fence = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      const data = JSON.parse(fence[1]);
      if (data && (data.reply || data.recipes)) {
        return {
          reply: String(data.reply || raw.replace(fence[0], "").trim()),
          recipes: normalizeRecipes(data.recipes),
        };
      }
    } catch {
      /* texto plano */
    }
  }
  return { reply: raw, recipes: [] };
}

function completionsUrl(base) {
  const b = String(base || "").replace(/\/$/, "");
  if (!b) return "https://api.openai.com/v1/chat/completions";
  if (b.endsWith("/chat/completions")) return b;
  if (b.endsWith("/v1")) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

async function chatOpenAI({ url, key, model, messages, extraHeaders = {} }) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 900,
      messages,
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 240)}`);
  const data = JSON.parse(raw);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("sin texto");
  return text;
}

async function tryOpenAIModels(url, key, messages, extraHeaders) {
  const preferred = process.env.AI_MODEL;
  const models = [...new Set([preferred, "gpt-4o-mini", "gpt-5-mini", "gpt-4.1-mini", "openai/gpt-4o-mini"].filter(Boolean))];
  let last;
  for (const model of models) {
    try {
      return await chatOpenAI({ url, key, model, messages, extraHeaders });
    } catch (error) {
      last = error;
      if (!/404|400|model|not found|invalid/i.test(String(error.message))) throw error;
    }
  }
  throw last || new Error("sin modelo");
}

async function chatGemini({ base, key, messages }) {
  const model = process.env.AI_MODEL || "gemini-2.5-flash";
  const url = `${String(base).replace(/\/$/, "")}/v1beta/models/${model}:generateContent`;
  const system = messages.find((m) => m.role === "system")?.content || "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 900 },
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 240)}`);
  const data = JSON.parse(raw);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
  if (!text) throw new Error("sin texto");
  return text;
}

async function askModel(messages) {
  const attempts = [];

  const gatewayKey = process.env.NETLIFY_AI_GATEWAY_KEY;
  const gatewayBase = process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  if (gatewayKey && gatewayBase) {
    attempts.push(() => tryOpenAIModels(completionsUrl(gatewayBase), gatewayKey, messages));
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiBase = process.env.OPENAI_BASE_URL;
  if (openaiKey && openaiBase) {
    const url = completionsUrl(openaiBase);
    const already = gatewayBase && completionsUrl(gatewayBase) === url && openaiKey === gatewayKey;
    if (!already) attempts.push(() => tryOpenAIModels(url, openaiKey, messages));
  } else if (openaiKey && !gatewayKey) {
    attempts.push(() => tryOpenAIModels(completionsUrl(openaiBase), openaiKey, messages));
  }

  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    attempts.push(() =>
      chatOpenAI({
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: groq,
        model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
        messages,
      })
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiBase = process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
  if (geminiKey) {
    attempts.push(() => chatGemini({ base: geminiBase, key: geminiKey, messages }));
  }

  const routerKey = process.env.OPENROUTER_API_KEY;
  const routerBase = process.env.OPENROUTER_BASE_URL;
  if (routerKey && routerBase) {
    attempts.push(() =>
      tryOpenAIModels(completionsUrl(routerBase).replace(/\/v1\/v1\//, "/v1/"), routerKey, messages)
    );
  }

  let lastError = "sin proveedor";
  for (const run of attempts) {
    try {
      const text = await run();
      if (text) return text;
    } catch (error) {
      lastError = String(error.message || error);
    }
  }
  throw new Error(lastError);
}

function localFridge(question, items) {
  const q = fold(question);
  const hay = usable(items);
  const caducos = items.filter((i) => i.estado === "caduco");
  const pronto = items.filter((i) => i.estado === "por caducar");
  const names = (list) => list.map((i) => i.nombre).join(", ");

  if (/caduc|tirar|vence|pasad/.test(q)) {
    if (!caducos.length && !pronto.length) return "Hoy no veo nada caducado en el registro.";
    return [caducos.length ? `Ya no conviene: ${names(caducos)}.` : "", pronto.length ? `Úsalo pronto: ${names(pronto)}.` : ""].join(" ").trim();
  }
  if (/que hay|inventario|que tenemos/.test(q)) {
    return hay.length ? `En la nevera hay: ${names(hay)}.` : "En el registro no hay productos vigentes.";
  }
  if (/hay |tenemos |queda /.test(q)) {
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    const hits = items.filter((i) => words.some((w) => fold(i.nombre).includes(w)));
    if (hits.length) {
      return hits
        .map((i) => {
          if (i.estado === "caduco") return `${i.nombre}: mejor no, ya caducó.`;
          if (!i.hay) return `${i.nombre}: no hay.`;
          return `${i.nombre}: sí hay, en ${i.ubicacion || "la nevera"}.`;
        })
        .join(" ");
    }
  }
  return null;
}

function systemPrompt(items) {
  return `Eres Jarvis, el asistente de la casa de Mario. Español mexicano, cálido, claro, sin relleno de robot.

Puedes responder DE TODO lo que te pregunten: nevera, recetas, compras, matemáticas, cultura, organización, bromas, ideas, lo cotidiano. No eres un menú de botones: conversas de verdad.

Tienes el inventario actual. NUNCA inventes que un producto está en la nevera si no aparece. Si caducó, avisa y no lo uses para cocinar. Si no hay, dilo y ofrece anotarlo en compras.

Si sugieres recetas, di qué ya hay y qué faltaría. Máximo 3 recetas concretas. Cuando propongas recetas, al final (no lo leas en voz alta) agrega exactamente este bloque:

<!--RECIPES
[{"id":"slug","name":"Nombre","time":"15 min","how":"pasos cortos","have":["lo que sí hay"],"missing":["lo que falta"]}]
-->

Si no hay recetas, no pongas ese bloque.
No des consejos médicos ni ayuda ilegal.
Inventario:
${JSON.stringify(items).slice(0, 7000)}`;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        ia: Boolean(
          process.env.NETLIFY_AI_GATEWAY_KEY ||
            process.env.OPENAI_API_KEY ||
            process.env.GROQ_API_KEY ||
            process.env.GEMINI_API_KEY ||
            process.env.OPENROUTER_API_KEY
        ),
        gateway: Boolean(process.env.NETLIFY_AI_GATEWAY_KEY && process.env.NETLIFY_AI_GATEWAY_BASE_URL),
        openai: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL),
        groq: Boolean(process.env.GROQ_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
      }),
      { headers: cors }
    );
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: cors });
  }

  try {
    const body = await req.json();
    const question = String(body.question || "").trim().slice(0, 1200);
    if (!question) {
      return new Response(JSON.stringify({ error: "Falta la pregunta" }), { status: 400, headers: cors });
    }
    const items = snapshot(body.items);
    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const messages = [
      { role: "system", content: systemPrompt(items) },
      ...history
        .filter((m) => m && m.role && m.content)
        .map((m) => ({
          role: m.role === "jarvis" || m.role === "assistant" ? "assistant" : "user",
          content: String(m.content).slice(0, 800),
        })),
      { role: "user", content: question },
    ];

    try {
      const parsed = parseAi(await askModel(messages));
      let recipes = parsed.recipes;
      if (!recipes.length && wantsRecipes(fold(question))) {
        recipes = scoreRecipes(items).slice(0, 3);
      }
      return new Response(JSON.stringify({ reply: parsed.reply, source: "ia", recipes }), { headers: cors });
    } catch {
      const fridge = localFridge(question, items);
      const reply = fridge
        ? `${fridge} (Se me trabó el modelo un segundo; pregúntame otra vez si quieres más detalle.)`
        : "Se me trabó la IA un segundo. Pregúntame otra vez, de la nevera o de lo que se te ocurra.";
      return new Response(JSON.stringify({ reply, source: "casa", recipes: [] }), { headers: cors });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: "No pude responder", detail: String(error) }), {
      status: 500,
      headers: cors,
    });
  }
};

export const config = {
  path: "/api/ayuda",
};
