const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

const RECIPES = [
  {
    id: "huevos-mexicana",
    name: "Huevos a la mexicana",
    time: "15 min",
    need: ["huevo", "jitomate", "cebolla"],
    how: "Sofríe jitomate y cebolla, tira los huevos. Desayuno de diario.",
  },
  {
    id: "quesadillas",
    name: "Quesadillas",
    time: "10 min",
    need: ["tortillas", "queso"],
    how: "Queso al comal. Si hay pollo o champiñón, súmale.",
  },
  {
    id: "enchiladas",
    name: "Enchiladas simples",
    time: "25 min",
    need: ["tortillas", "salsa", "crema", "queso"],
    how: "Tortilla, salsa, un toque de crema y queso. Rinden para varios.",
  },
  {
    id: "pasta-ajo",
    name: "Pasta al ajo",
    time: "20 min",
    need: ["pasta", "ajo", "aceite"],
    how: "Agua, pasta, ajo en aceite. Si hay queso o crema, al final.",
  },
  {
    id: "arroz-mexicana",
    name: "Arroz a la mexicana",
    time: "30 min",
    need: ["arroz", "jitomate", "cebolla", "ajo"],
    how: "Sofríe el arroz, jitomate licuado, agua y a dormir el fuego.",
  },
  {
    id: "sopa-tortilla",
    name: "Sopa de tortilla",
    time: "25 min",
    need: ["tortillas", "jitomate", "crema"],
    how: "Caldo de jitomate, tiritas de tortilla y crema al servir.",
  },
  {
    id: "licuado",
    name: "Licuado rápido",
    time: "5 min",
    need: ["leche", "plátano"],
    how: "Leche, plátano, un hielo si hay. Merienda sin sartén.",
  },
  {
    id: "atole",
    name: "Atole o café con leche",
    time: "10 min",
    need: ["leche"],
    how: "Leche caliente. Si hay canela o chocolate, queda de casa.",
  },
  {
    id: "sandwich",
    name: "Sándwich de la casa",
    time: "8 min",
    need: ["pan", "queso"],
    how: "Pan, queso, lo que haya: jamón, jitomate o un huevo.",
  },
  {
    id: "huevos-estrellados",
    name: "Huevos estrellados",
    time: "10 min",
    need: ["huevo", "aceite"],
    how: "Sartén, huevo, sal. Con tortillas o pan, ya es desayuno.",
  },
  {
    id: "ensalada",
    name: "Ensalada rápida",
    time: "10 min",
    need: ["lechuga", "jitomate"],
    how: "Pica, sal, limón o aceite. Proteína extra si hay huevo o pollo.",
  },
  {
    id: "pollo-comal",
    name: "Pollo al comal con salsa",
    time: "30 min",
    need: ["pollo", "jitomate", "cebolla"],
    how: "Pollo, salsa improvisada de jitomate y cebolla. Arroz si hay.",
  },
  {
    id: "frijoles-queso",
    name: "Frijoles con queso",
    time: "15 min",
    need: ["frijoles", "queso"],
    how: "Calienta frijoles, queso encima. Con tortillas es comida completa.",
  },
  {
    id: "hotcakes",
    name: "Hotcakes simples",
    time: "20 min",
    need: ["huevo", "leche", "harina"],
    how: "Huevo, leche, harina, sartén. Si no hay harina, se anota en compras.",
  },
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

function names(list) {
  return list.map((i) => i.nombre).join(", ");
}

function usable(items) {
  return items.filter((i) => i.hay && i.estado !== "caduco");
}

function matchNeed(items, need) {
  const n = fold(need);
  return usable(items).find((i) => {
    const name = fold(i.nombre);
    return name.includes(n) || n.includes(name.split(" ")[0]) || fold(i.categoria).includes(n);
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
    return { ...recipe, have, missing, missingCount: missing.length };
  }).sort((a, b) => a.missingCount - b.missingCount || a.need.length - b.need.length);
}

function wantsRecipes(q) {
  return /receta|cocin|facil|almorz|cenar|desayun|prepar|enchilada|comida|que como|platillo|menu|cocinar|hacer de comer/.test(q);
}

function recipeHelp(items, q) {
  const ranked = scoreRecipes(items);
  const buyMode = /compr|falt|super|ingrediente/.test(q);
  const pick = buyMode ? ranked.filter((r) => r.missingCount > 0).slice(0, 3) : ranked.slice(0, 3);
  const recipes = (pick.length ? pick : ranked.slice(0, 3)).map((r) => ({
    id: r.id,
    name: r.name,
    time: r.time,
    how: r.how,
    have: r.have,
    missing: r.missing,
  }));
  const reply = buyMode
    ? "Te dejo recetas fáciles. Aunque no tengas todo, dime si quieres hacer alguna y anoto lo que falte en compras."
    : "Con lo de hoy, o comprando poquito, estas tres salen sin complicarse. Elige una y te agrego lo que falte.";
  return { reply, recipes };
}

function localHelp(question, items) {
  const q = fold(question);
  const hay = usable(items);
  const caducos = items.filter((i) => i.estado === "caduco");
  const pronto = items.filter((i) => i.estado === "por caducar");
  const falta = items.filter((i) => !i.hay || i.estado === "caduco");

  if (wantsRecipes(q)) return recipeHelp(items, q);

  if (/hola|buenas|quien eres/.test(q) && q.length < 24) {
    return {
      reply: "Soy Jarvis. Pregúntame lo que sea de la cocina: recetas aunque falte algo, caducidad o el súper.",
      recipes: [],
    };
  }

  if (/caduc|tirar|vence|pasad|echar a perder/.test(q) && !wantsRecipes(q)) {
    if (!caducos.length && !pronto.length) {
      return { reply: "Hoy no veo nada caducado. Si algo huele raro, igual no lo uses.", recipes: [] };
    }
    const parts = [];
    if (caducos.length) parts.push(`Ya no conviene: ${names(caducos)}.`);
    if (pronto.length) parts.push(`Úsalo pronto: ${names(pronto)}.`);
    return { reply: parts.join(" "), recipes: [] };
  }

  if (/compr|super|falta|reponer|lista/.test(q)) {
    if (!falta.length) {
      return {
        reply: "La lista está tranquila. Si quieres, te sugiero recetas fáciles y anotamos lo que falte.",
        recipes: scoreRecipes(items).slice(0, 2).map((r) => ({
          id: r.id,
          name: r.name,
          time: r.time,
          how: r.how,
          have: r.have,
          missing: r.missing,
        })),
      };
    }
    return { reply: `Ahora mismo en compras veo: ${names(falta.slice(0, 12))}. ¿Te armo recetas fáciles con lo que falte?`, recipes: [] };
  }

  if (/donde esta|en que estante|ubicacion/.test(q)) {
    const named = items.filter((i) => fold(i.nombre).split(/\s+/).some((w) => w.length > 3 && q.includes(w)));
    const pick = named[0];
    if (!pick) {
      return { reply: hay.length ? `Lo anotado: ${hay.map((i) => `${i.nombre} (${i.ubicacion})`).join("; ")}.` : "No hay registro de ubicación todavía.", recipes: [] };
    }
    return {
      reply: pick.hay ? `${pick.nombre} está en ${pick.ubicacion || "la nevera"}.` : `De ${pick.nombre} no hay. ¿Lo agrego a compras?`,
      recipes: [],
    };
  }

  if (/hay |tenemos |queda |tienes /.test(q)) {
    const words = q.split(/\s+/).filter((w) => w.length > 3 && !["tenemos", "queda", "hay", "jarvis", "nevera"].includes(w));
    const hits = items.filter((i) => words.some((w) => fold(i.nombre).includes(w)));
    if (hits.length) {
      return {
        reply: hits
          .map((i) => {
            if (i.estado === "caduco") return `${i.nombre}: mejor no, ya caducó.`;
            if (!i.hay) return `${i.nombre}: no hay. Si quieres, lo anoto en compras.`;
            return `${i.nombre}: sí hay, en ${i.ubicacion || "la nevera"}.`;
          })
          .join(" "),
        recipes: [],
      };
    }
  }

  if (/nutri|calor|prote|salud|vitamina|dieta/.test(q)) {
    return {
      reply: "Sin receta de doctor: proteína (huevo, yogurt, pollo), color en el plato y agua. ¿Te sugiero un platillo fácil?",
      recipes: [],
    };
  }

  if (/que hay|inventario|que tenemos/.test(q)) {
    if (!hay.length) return { reply: "En el registro no hay productos vigentes. Igual te puedo sugerir recetas y anotar ingredientes.", recipes: recipeHelp(items, "recetas").recipes };
    return { reply: `Hay: ${names(hay)}.${pronto.length ? ` Úsalo pronto: ${names(pronto)}.` : ""}`, recipes: [] };
  }

  return recipeHelp(items, q);
}

async function askModel(system, messages) {
  const groq = process.env.GROQ_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const key = groq || openai;
  if (!key) return null;
  const url = groq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = process.env.AI_MODEL || (groq ? "llama-3.1-8b-instant" : "gpt-4o-mini");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 420,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: cors });
  }

  try {
    const body = await req.json();
    const question = String(body.question || "").trim().slice(0, 400);
    if (!question) {
      return new Response(JSON.stringify({ error: "Falta la pregunta" }), { status: 400, headers: cors });
    }
    const items = snapshot(body.items);
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const local = localHelp(question, items);
    const system = `Eres Jarvis, asistente de cocina de casa. Español mexicano, breve, cálido.
Puedes sugerir recetas fáciles AUNQUE falten ingredientes. Di qué ya hay, qué faltaría y pregunta si los agrego a la lista de compras.
No inventes que un producto está en la nevera si no aparece en el inventario. Si caducó, no lo uses.
No des consejos médicos.
Inventario:\n${JSON.stringify(items, null, 0).slice(0, 6000)}`;
    const messages = [
      ...history
        .filter((m) => m && m.role && m.content)
        .map((m) => ({ role: m.role === "jarvis" ? "assistant" : "user", content: String(m.content).slice(0, 500) })),
      { role: "user", content: question },
    ];
    let reply = local.reply;
    let source = "casa";
    try {
      const ai = await askModel(system, messages);
      if (ai) {
        reply = ai;
        source = "ia";
      }
    } catch {
      /* casa */
    }
    const recipes = wantsRecipes(fold(question)) || local.recipes?.length ? local.recipes : [];
    return new Response(JSON.stringify({ reply, source, recipes }), { headers: cors });
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
