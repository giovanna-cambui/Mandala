export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/storage") {
      return handleStorage(request, env, url);
    }
    return env.ASSETS.fetch(request);
  }
};

async function handleStorage(request, env, url) {
  const key = url.searchParams.get("key");
  if (!key || !key.startsWith("mandala:")) {
    return new Response(JSON.stringify({ error: "invalid key" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (request.method === "GET") {
    const value = await env.STORAGE.get(key);
    return new Response(JSON.stringify({ value }), { headers: { "Content-Type": "application/json" } });
  }
  if (request.method === "POST" || request.method === "PUT") {
    const body = await request.text();
    await env.STORAGE.put(key, body);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }
  return new Response("Method not allowed", { status: 405 });
}
