// Função do Supabase (Edge Function): busca os imóveis na Kenlo e devolve a lista para o site.
// A chave fica guardada no Supabase (Edge Functions > Secrets), nunca na página.
// Secrets:
//   KENLO_API_URL  endereço da lista de imóveis, conforme a documentação da Kenlo
//   KENLO_API_KEY  a chave
//   KENLO_AUTH     como a chave vai na chamada: "bearer" (padrão), "header" ou "query"
//   SITE_ORIGEM    endereço do site que pode chamar a função (ex.: https://usuario.github.io); vazio = qualquer um
// Ao criar a função, DESLIGUE "Verify JWT" (Enforce JWT verification), para o site poder chamar sem chave.
// O formato da resposta e o jeito de mandar a chave PRECISAM ser conferidos na documentação da Kenlo.
Deno.serve(async (req) => {
  const origem = Deno.env.get("SITE_ORIGEM") || "*";
  const cors = { "Access-Control-Allow-Origin": origem, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "accept, content-type" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
  const url = Deno.env.get("KENLO_API_URL"), chave = Deno.env.get("KENLO_API_KEY"), modo = (Deno.env.get("KENLO_AUTH") || "bearer").toLowerCase();
  if (!url || !chave) return json({ erro: "Configure KENLO_API_URL e KENLO_API_KEY nos Secrets do Supabase." }, 500);
  let alvo = url; const headers: Record<string, string> = { Accept: "application/json" };
  if (modo === "query") alvo += (url.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(chave);
  else if (modo === "header") headers["x-api-key"] = chave;
  else headers["Authorization"] = "Bearer " + chave;
  try {
    const r = await fetch(alvo, { headers });
    const texto = await r.text();
    if (!r.ok) return json({ erro: "A Kenlo respondeu " + r.status, detalhe: texto.slice(0, 500) }, 502);
    return new Response(texto, { status: 200, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" } });
  } catch (e) {
    return json({ erro: "Não foi possível falar com a Kenlo", detalhe: String(e) }, 502);
  }
});
