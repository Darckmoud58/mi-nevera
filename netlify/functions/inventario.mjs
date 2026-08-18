import { getStore } from "@netlify/blobs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { headers: cors });
  }

  try {
    const store = getStore("mi-nevera");

    if (req.method === "GET") {
      const data = await store.get("inventario", { type: "json" });
      return new Response(JSON.stringify(data || { items: [] }), { headers: cors });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (!body || !Array.isArray(body.items)) {
        return new Response(JSON.stringify({ error: "Formato inválido" }), {
          status: 400,
          headers: cors,
        });
      }

      const payload = {
        items: body.items.slice(0, 500),
        updatedAt: new Date().toISOString(),
      };
      await store.setJSON("inventario", payload);
      return new Response(JSON.stringify({ ok: true, updatedAt: payload.updatedAt }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: cors,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "No se pudo guardar el inventario", detail: String(error) }), {
      status: 500,
      headers: cors,
    });
  }
};

export const config = {
  path: "/api/inventario",
};
