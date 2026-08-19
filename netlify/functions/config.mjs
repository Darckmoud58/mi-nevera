const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: cors });
  }
  return new Response(
    JSON.stringify({
      url: process.env.SUPABASE_URL || "",
      anonKey: process.env.SUPABASE_ANON_KEY || "",
    }),
    { headers: cors }
  );
};

export const config = {
  path: "/api/config",
};
