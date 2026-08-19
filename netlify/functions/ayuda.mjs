const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

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

function hasName(items, rx) {
  return items.filter((i) => i.hay && i.estado !== "caduco" && rx.test(fold(i.nombre) + " " + fold(i.categoria)));
}

function localAnswer(question, items) {
  const q = fold(question);
  const hay = items.filter((i) => i.hay && i.estado !== "caduco");
  const caducos = items.filter((i) => i.estado === "caduco");
  const pronto = items.filter((i) => i.estado === "por caducar");
  const falta = items.filter((i) => !i.hay || i.estado === "caduco");

  if (/hola|buenas|quien eres|quién eres/.test(q) || q.length < 3) {
    return "Soy Jarvis, de la nevera de casa. Pregúntame qué hay, qué caduca, qué falta o qué puedes cocinar con lo de hoy.";
  }

  if (/caduc|tirar|vence|pasad|echaron|echar a perder/.test(q)) {
    if (!caducos.length && !pronto.length) {
      return "Hoy no veo nada caducado. Si algo huele raro igual no lo uses: la fecha ayuda, la nariz manda.";
    }
    const parts = [];
    if (caducos.length) parts.push(`Ya no conviene: ${names(caducos)}. Mejor al bote y a la lista.`);
    if (pronto.length) parts.push(`Úsalo pronto: ${names(pronto)}.`);
    return parts.join(" ");
  }

  if (/compr|super|súper|falta|reponer|lista/.test(q)) {
    if (!falta.length) return "La lista está tranquila: no veo huecos urgentes. Si se te antoja algo, agrégalo en Compras.";
    return `Para el súper: ${names(falta.slice(0, 12))}. Táchalo cuando lo traigas.`;
  }

  if (/donde esta|dónde está|en que estante|ubicacion|ubicación/.test(q)) {
    const hit = items.find((i) => q.includes(fold(i.nombre).split(" ")[0]) && i.nombre);
    const named = items.filter((i) => fold(i.nombre).split(/\s+/).some((w) => w.length > 3 && q.includes(w)));
    const pick = named[0] || hit;
    if (!pick) return hay.length ? `Lo que hay está anotado así: ${hay.map((i) => `${i.nombre} (${i.ubicacion})`).join("; ")}.` : "La nevera está vacía en el registro.";
    return pick.hay
      ? `${pick.nombre} está en ${pick.ubicacion || "la nevera"}.`
      : `De ${pick.nombre} no hay ahora. Está en la lista de compras.`;
  }

  if (/hay |tenemos |queda |tienes /.test(q) || /leche|crema|huevo|jitomate|queso|pollo/.test(q) && /hay|tenemos|queda/.test(q)) {
    const words = q.split(/\s+/).filter((w) => w.length > 3 && !["tenemos", "queda", "hay", "jarvis", "nevera"].includes(w));
    const hits = items.filter((i) => words.some((w) => fold(i.nombre).includes(w)));
    if (hits.length) {
      return hits
        .map((i) => {
          if (i.estado === "caduco") return `${i.nombre}: mejor no. Ya caducó.`;
          if (!i.hay) return `${i.nombre}: no hay.`;
          if (i.estado === "por caducar") return `${i.nombre}: sí hay, úsalo pronto.`;
          return `${i.nombre}: sí hay, en ${i.ubicacion || "la nevera"}.`;
        })
        .join(" ");
    }
  }

  if (/cocin|receta|comer|almorz|cenar|desayun|prepar|hacer de comer|que como|qué como|menu|menú/.test(q)) {
    const ideas = [];
    const crema = hasName(hay, /crema/);
    const leche = hasName(hay, /leche/);
    const huevo = hasName(hay, /huevo/);
    const tortilla = hasName(hay, /tortilla/);
    const queso = hasName(hay, /queso/);
    const jitomate = hasName(hay, /jitomate|tomate/);
    const pollo = hasName(hay, /pollo/);
    const yogurt = hasName(hay, /yogurt|yogur/);
    const fruta = hay.filter((i) => /fruta|platano|plátano|manzana|naranja/.test(fold(i.nombre + i.categoria)));
    if (crema.length && (jitomate.length || /enchilada/.test(q))) {
      ideas.push("Enchiladas con un toque de crema. Rinden para varios y aprovechas lo que ya está.");
    }
    if (queso.length && tortilla.length) ideas.push("Quesadillas. Si hay pollo o verdura, súmale y queda lonche completo.");
    if (huevo.length) ideas.push("Huevos al gusto: estrellados, a la mexicana si hay jitomate y cebolla, o revueltos.");
    if (leche.length || yogurt.length) {
      ideas.push(fruta.length ? `Licuado con ${fruta[0].nombre} y lácteo. Merienda fácil.` : "Café con leche o atole, si la leche está bien.");
    }
    if (pollo.length) ideas.push("Quesadillas o caldito con el pollo. Las sobras no tienen que sentirse repetición.");
    if (jitomate.length) ideas.push("Salsa o recaudo con el jitomate más blandito primero.");
    if (!ideas.length && hay.length) {
      ideas.push(`Con lo de hoy (${names(hay.slice(0, 8))}) arma un plato simple: lo que caduca primero, al sartén primero.`);
    }
    if (!hay.length) return "El registro está vacío. Anota lo que hay y te armo ideas de comida.";
    if (caducos.length) ideas.push(`Ojo: no uses ${names(caducos)}.`);
    return ideas.slice(0, 4).join(" ");
  }

  if (/nutri|calor|prote|salud|vitamina|dieta|engorda/.test(q)) {
    return "Sin recetas de doctor: proteína (huevo, yogurt, pollo), color en el plato (verdura o fruta) y agua al abrir la nevera. Lo casero gana a comprar fuera todos los días.";
  }

  if (/que hay|qué hay|inventario|que tenemos|qué tenemos|que hay de/.test(q)) {
    if (!hay.length) return "En el registro no hay productos vigentes. Si la nevera sí tiene cosas, pulsa Registrar.";
    return `Hay: ${names(hay)}.${pronto.length ? ` Úsalo pronto: ${names(pronto)}.` : ""}`;
  }

  if (hay.length) {
    return `Puedo ayudarte con esta nevera. Hoy hay ${names(hay.slice(0, 10))}. Pregúntame qué cocinar, qué caduca o qué falta en el súper.`;
  }
  return "Aún no veo productos vigentes. Registra lo de la nevera y pregúntame de nuevo: qué cocinar, qué caduca o qué comprar.";
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
      temperature: 0.4,
      max_tokens: 320,
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
    const local = localAnswer(question, items);
    const system = `Eres Jarvis, asistente de la nevera de casa. Español mexicano, breve, cálido y práctico.
No inventes productos que no estén en el inventario. Si caducó, dilo con calma.
Recetas simples de casa. No des consejos médicos.
Inventario de hoy:\n${JSON.stringify(items, null, 0).slice(0, 6000)}`;
    const messages = [
      ...history
        .filter((m) => m && m.role && m.content)
        .map((m) => ({ role: m.role === "jarvis" ? "assistant" : "user", content: String(m.content).slice(0, 500) })),
      { role: "user", content: question },
    ];
    let reply = local;
    let source = "casa";
    try {
      const ai = await askModel(system, messages);
      if (ai) {
        reply = ai;
        source = "ia";
      }
    } catch {
      /* usa respuesta de casa */
    }
    return new Response(JSON.stringify({ reply, source }), { headers: cors });
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
