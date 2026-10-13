// Função do servidor: busca os imóveis na Kenlo e devolve a lista para o site.
// A chave da API fica guardada no Netlify (Site configuration > Environment variables),
// nunca na página. Variáveis:
//   KENLO_API_URL  endereço da lista de imóveis, conforme a documentação da Kenlo
//   KENLO_API_KEY  a chave
//   KENLO_AUTH     como a chave vai na chamada: "bearer" (padrão), "header" ou "query"
// O formato da resposta e o jeito de mandar a chave PRECISAM ser conferidos na documentação.
export default async () => {
  const url = process.env.KENLO_API_URL, chave = process.env.KENLO_API_KEY, modo = (process.env.KENLO_AUTH || 'bearer').toLowerCase();
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  if (!url || !chave) return json({ erro: 'Configure KENLO_API_URL e KENLO_API_KEY no Netlify.' }, 500);
  let alvo = url; const headers = { Accept: 'application/json' };
  if (modo === 'query') alvo += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(chave);
  else if (modo === 'header') headers['x-api-key'] = chave;
  else headers.Authorization = 'Bearer ' + chave;
  try {
    const r = await fetch(alvo, { headers });
    const texto = await r.text();
    if (!r.ok) return json({ erro: 'A Kenlo respondeu ' + r.status, detalhe: texto.slice(0, 500) }, 502);
    return new Response(texto, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  } catch (e) {
    return json({ erro: 'Não foi possível falar com a Kenlo', detalhe: String(e) }, 502);
  }
};
export const config = { path: '/api/imoveis' };
