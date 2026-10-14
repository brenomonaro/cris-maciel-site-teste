// Função do Supabase (Edge Function): busca os imóveis anunciados na Kenlo Open API v2 e devolve para o site.
// Documentação: https://kenlo-open-api-prd.kenlo.io/docs/v2.html  (servidor: https://imob-api.kenlo-open.com)
// Formato conferido com a conta real em 13/10/2026: GET /v2/listings traz tudo o que o site usa
// (tipo, finalidade, dormitórios, áreas, preços, IPTU, características, fotos e vídeo).
//
// A chave fica guardada no Supabase (Edge Functions > Secrets), nunca na página nem no chat.
// Secrets:
//   KENLO_API_KEY     a X-API-Key emitida pela Kenlo
//   KENLO_USER_INFO   o x-user-info em Base64 (traz o id da imobiliária)
//   KENLO_AGENCY_ID   opcional; se vazio, é lido de dentro do KENLO_USER_INFO
//   SITE_ORIGEM       endereço do site que pode chamar a função (ex.: https://brenomonaro.github.io); vazio = qualquer um
// Ao criar a função, DESLIGUE "Verify JWT" (Enforce JWT verification), para o site poder chamar sem chave.
//
// Rotas:
//   GET /imoveis            lista leve para o catálogo (só a foto de capa, sem descrição)
//   GET /imoveis?cod=CA0023 o imóvel completo, para a ficha (todas as fotos, descrição, características)
//   GET /imoveis?diag=1     só a forma dos campos do primeiro anúncio, sem valores
// Nunca saem daqui: corretor, proprietário, rua, número, CEP e coordenadas. O site mostra só o bairro.

const BASE = "https://imob-api.kenlo-open.com";
const TTL = 30 * 60 * 1000;
let cache: { quando: number; lista: Imovel[] } | null = null;
let buscando: Promise<Imovel[]> | null = null;

type Imovel = {
  cod: string; fin: "venda" | "locacao"; tipo: string; bairro: string; regiao: string; cidade: string;
  titulo: string; descricao: string; area: number; terreno: number; dorm: number; suites: number; banh: number; vagas: number;
  preco: number; precoAluguel: number; cond: number; iptu: number; fotos: string[]; nfotos: number; video: string;
  carac: string[]; extras: string[]; op: string; novo: boolean; destaque: boolean; data: string; corretor: string; parcial?: boolean;
};

const TIPOS: Record<string, string> = {
  HOUSE: "Casa", LAND: "Terreno", APARTMENT: "Apartamento", DUPLEX_APARTMENT: "Apartamento duplex", SMALL_FARM: "Chácara",
  OUTHOUSE: "Galpão", ROOM: "Sala comercial", HALL: "Salão comercial", AREA: "Área",
};
// características que viram filtro (atalhos) no catálogo
const FILTRO: Record<string, string> = {
  SWIMMING_POOL: "Piscina", HEATED_SWIMMING_POOL: "Piscina", WARM_SWIMMING_POOL: "Piscina", PET_FRIENDLY: "Aceita pet",
  FURNISHED: "Mobiliado", BACKYARD: "Quintal", GOURMET_BALCONY: "Varanda gourmet", GOURMET: "Espaço gourmet",
  BARBECUE_GRILL: "Churrasqueira", AIR_CONDITIONING: "Ar-condicionado", SOLAR_HEATING: "Aquecimento solar",
  ACCEPT_FINANCING: "Aceita financiamento", EXCHANGE: "Aceita permuta", ELEVATOR: "Elevador", OFFICE: "Escritório",
  ACADEMY: "Academia", FITNESS_ROOM: "Academia", PLAYGROUND: "Playground", SPORTS_COURT: "Quadra", CONCIERGE_24_7: "Portaria 24 horas",
};
// demais características, só listadas na ficha
const EXTRAS: Record<string, string> = {
  GATED_COMMUNITY: "Condomínio fechado", CABINET_KITCHEN: "Armários na cozinha", CABINET_BATHROOM: "Armários no banheiro",
  CABINET_BEDROOM: "Armários nos quartos", CABINET_CLOSET: "Closet", LAUNDRY_ROOM: "Lavanderia", HALFBATH: "Lavabo",
  FLOOR_PORCELAIN_TILES: "Piso de porcelanato", PANTRY: "Despensa", INTERPHONE: "Interfone", ELECTRIC_GATE: "Portão eletrônico",
  SOCCER_FIELD: "Campo de futebol", VERANDA: "Varanda", BALCONY: "Sacada", CLOAKROOM: "Rouparia", BREAKFAST_NOOK: "Copa",
  HYDROMASSAGE_BATHTUB: "Banheira de hidromassagem", SAUNA: "Sauna", SAUNA_DRY: "Sauna", SAUNA_WET: "Sauna", SOLARIUM: "Solário",
  MAID_BATHROOM: "Banheiro de serviço", MAID_ROOM: "Quarto de serviço", MEZZANINE: "Mezanino", ALARM_SYSTEM: "Alarme",
  TOY_LIBRARY: "Brinquedoteca", PARTY_ROOM: "Salão de festas", FIREPLACE: "Lareira", CHILDREN_SWIMMING_POOL: "Piscina infantil",
  ANNEX: "Edícula", ORCHARD: "Pomar", FRUIT_GROWING: "Pomar", GAMES_ROOM: "Salão de jogos", CLUB: "Clube", SECURITY_SYSTEM: "Sistema de segurança",
  ARTESIAN_WELL: "Poço artesiano", ELECTRIC_GENERATOR: "Gerador", ACCESSIBILITY: "Acessibilidade", TENNIS_COURT: "Quadra de tênis",
  LAKE: "Lago", SPA: "Spa", WINECELLAR: "Adega", GARDEN: "Jardim", CINEMA_ROOM: "Sala de cinema", PRIVATE_ELEVATOR: "Elevador privativo",
  SQUASH_COURT: "Quadra de squash", SKATE_PARK: "Pista de skate", BIKE_RACK: "Bicicletário", GUARDHOUSE: "Guarita",
  ARMORED_BOOTH: "Guarita blindada", CARETAKER: "Caseiro", WIFI: "Wi-Fi", VISITOR_PARKING: "Vagas para visitantes",
  FLOOR_WOOD: "Piso de madeira", FLOOR_LAMINATE: "Piso laminado", FLOOR_VINYL: "Piso vinílico", FLOOR_MARBLE: "Piso de mármore",
  FLOOR_GRANITE: "Piso de granito", MASSAGE_ROOM: "Sala de massagem", GAS_SUPPLY: "Gás encanado", RAINWATER_HARVESTING: "Captação de água da chuva",
};

const v = (x: unknown): number => {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "object") return v((x as { value?: unknown }).value);
  const n = parseFloat(String(x)); return isNaN(n) ? 0 : n;
};
const tamanho = (url: string, w: number) => url.replace(/=[^/=]*$/, "") + "=w" + w;
const mil = (n: number) => n.toLocaleString("pt-BR");

// deno-lint-ignore no-explicit-any
function converte(a: any): Imovel {
  const d = a.details || {}, p = d.pricing || {}, loc = d.location || {}, ar = d.area || {};
  const feats: string[] = d.features || [];
  const fin = a.purpose === "FOR_RENT" ? "locacao" : "venda";
  const tipoBase = TIPOS[d.propertyType] || "Imóvel";
  const condominio = feats.includes("GATED_COMMUNITY");
  const tipo = condominio && (tipoBase === "Casa" || tipoBase === "Terreno") ? `${tipoBase} em condomínio` : tipoBase;
  const semTerreno = ["Apartamento", "Apartamento duplex", "Sala comercial"].includes(tipoBase);
  const soTerreno = ["Terreno", "Área"].includes(tipoBase);
  const total = v(ar.valueTotal), util = v(ar.valueUsable);
  const area = soTerreno ? 0 : (util || (semTerreno ? total : 0));
  const terreno = semTerreno ? 0 : (soTerreno ? (total || util) : (total > util ? total : 0));
  const dorm = v(d.bedrooms), suites = v(d.suites);
  const iptuP = (p.iptuList || [])[0];
  const iptuAno = iptuP ? v(iptuP.installmentAmount) * (v(iptuP.installmentQuantity) || 1) : 0;
  const imgs = [...(a.media?.image || [])].sort((x, y) => (y.isPrimary ? 1 : 0) - (x.isPrimary ? 1 : 0)).map((f) => String(f.url || "")).filter(Boolean);
  const titulo = soTerreno || ["Galpão", "Sala comercial", "Salão comercial", "Chácara"].includes(tipoBase) && !dorm
    ? `${tipo}${(soTerreno ? terreno : area || terreno) ? " de " + mil(soTerreno ? terreno : area || terreno) + " m²" : ""}`
    : `${tipo}${dorm ? (suites && suites === dorm ? ` com ${suites} ${suites === 1 ? "suíte" : "suítes"}` : ` com ${dorm} ${dorm === 1 ? "dormitório" : "dormitórios"}`) : ""}`;
  const criado = String(d.createAt || "");
  return {
    cod: String(a.propertyCode || a.id), fin, tipo, bairro: String(loc.neighborhood || "").trim(), regiao: "", cidade: String(loc.city || "Indaiatuba"),
    titulo, descricao: String(d.description || "").trim(),
    area, terreno, dorm, suites, banh: v(d.bathrooms), vagas: v(d.garage?.value),
    preco: fin === "venda" ? v(p.salePrice) : v(p.rentPrice), precoAluguel: fin === "venda" ? v(p.rentPrice) : 0,
    cond: v(p.condoPrice), iptu: Math.round((fin === "locacao" ? iptuAno / 12 : iptuAno) * 100) / 100,
    fotos: imgs.map((u) => tamanho(u, 1600)), nfotos: imgs.length,
    video: String(a.media?.video?.[0]?.url || ""),
    carac: [...new Set(feats.map((f) => FILTRO[f]).filter(Boolean))],
    extras: [...new Set(feats.map((f) => EXTRAS[f]).filter(Boolean))],
    op: "", novo: criado ? Date.now() - Date.parse(criado) < 45 * 864e5 : false,
    destaque: d.highlightLevel === "FEATURED" || feats.includes("FEATURED") || feats.includes("SUPER_FEATURED"),
    data: criado,
    // só o primeiro nome do corretor que captou; e-mail e telefone nunca saem
    corretor: String((Array.isArray(a.brokersCaptured) ? a.brokersCaptured[0]?.name : a.brokersCaptured?.name) || "").trim().split(/\s+/)[0] || "",
  };
}

function leve(i: Imovel): Imovel {
  return { ...i, descricao: "", extras: [], fotos: i.fotos.slice(0, 1).map((u) => tamanho(u, 900)), parcial: true };
}

function agenciaDe(userInfo: string): string {
  try { const j = JSON.parse(atob(userInfo)); return String(j.agencyId ?? j.agency_id ?? j.id_imob ?? ""); } catch { return ""; }
}

async function busca(headers: Record<string, string>, agencia: string): Promise<Imovel[]> {
  const itens: unknown[] = [];
  for (let page = 1; page <= 40; page++) {
    const r = await fetch(`${BASE}/v2/listings?agencyId=${encodeURIComponent(agencia)}&page=${page}&pageSize=100`, { headers });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, Math.min(Number(r.headers.get("Retry-After") || 2), 10) * 1000)); page--; continue; }
    if (!r.ok) throw new Error(`Kenlo ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const data = Array.isArray(j?.data) ? j.data : [];
    itens.push(...data);
    if (!data.length || page >= Number(j?.pagination?.totalPages || 0)) break;
  }
  return itens.map(converte).filter((i) => i.cod && i.fotos.length && i.preco > 0);
}

function forma(x: unknown, d = 0): unknown {
  if (Array.isArray(x)) return x.length ? [forma(x[0], d + 1)] : [];
  if (x && typeof x === "object" && d < 5) {
    const o: Record<string, unknown> = {};
    for (const [k, y] of Object.entries(x as Record<string, unknown>)) o[k] = /broker|owner|fullLocation|address/i.test(k) ? "(omitido)" : forma(y, d + 1);
    return o;
  }
  return x === null ? null : typeof x;
}

Deno.serve(async (req) => {
  const origem = Deno.env.get("SITE_ORIGEM") || "*";
  const cors = { "Access-Control-Allow-Origin": origem, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "accept, content-type", "Vary": "Origin" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const json = (obj: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8", ...extra } });

  const chave = Deno.env.get("KENLO_API_KEY"), userInfo = Deno.env.get("KENLO_USER_INFO");
  if (!chave || !userInfo) return json({ erro: "Configure KENLO_API_KEY e KENLO_USER_INFO nos Secrets do Supabase." }, 500);
  const agencia = Deno.env.get("KENLO_AGENCY_ID") || agenciaDe(userInfo);
  if (!agencia) return json({ erro: "Não achei o id da imobiliária. Configure KENLO_AGENCY_ID." }, 500);
  const headers = { Accept: "application/json", "X-API-Key": chave, "x-user-info": userInfo };
  const q = new URL(req.url).searchParams;

  try {
    if (q.has("diag")) {
      const r = await fetch(`${BASE}/v2/listings?agencyId=${encodeURIComponent(agencia)}&pageSize=1`, { headers });
      const j = await r.json().catch(() => null);
      return json({ status: r.status, total: j?.pagination?.total, forma: forma(j?.data?.[0]) });
    }
    if (!cache || Date.now() - cache.quando > TTL) {
      buscando ??= busca(headers, agencia).finally(() => { buscando = null; });
      cache = { quando: Date.now(), lista: await buscando };
    }
    const cod = q.get("cod");
    if (cod) {
      const i = cache.lista.find((x) => x.cod.toLowerCase() === cod.toLowerCase());
      return i ? json({ imovel: i }, 200, { "cache-control": "public, max-age=600" }) : json({ erro: "Imóvel não encontrado ou fora do ar" }, 404);
    }
    return json({ imoveis: cache.lista.map(leve), total: cache.lista.length, geradoEm: new Date(cache.quando).toISOString() }, 200, { "cache-control": "public, max-age=600" });
  } catch (e) {
    return json({ erro: "Não foi possível falar com a Kenlo", detalhe: String(e).slice(0, 300) }, 502);
  }
});
