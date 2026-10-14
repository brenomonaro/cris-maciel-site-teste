// Busca os imóveis anunciados na Kenlo Open API v2 e grava os arquivos que o site lê.
// Roda no GitHub Actions (.github/workflows/site.yml) a cada 30 minutos. A chave vem dos segredos do repositório
// (Settings > Secrets and variables > Actions): KENLO_API_KEY e KENLO_USER_INFO. Nunca escreva a chave aqui.
// Gera: imoveis.json (lista leve, só a foto de capa) e imovel/CODIGO.json (o imóvel completo, para a ficha).
// Nunca saem: corretor, proprietário, rua, número, CEP e coordenadas. O site mostra só o bairro.
// Mesma tradução de campos de supabase/functions/imoveis/index.ts.
const BASE = "https://imob-api.kenlo-open.com";
const TIPOS = {
  HOUSE: "Casa",
  LAND: "Terreno",
  APARTMENT: "Apartamento",
  DUPLEX_APARTMENT: "Apartamento duplex",
  SMALL_FARM: "Ch\xE1cara",
  OUTHOUSE: "Galp\xE3o",
  ROOM: "Sala comercial",
  HALL: "Sal\xE3o comercial",
  AREA: "\xC1rea"
};
const FILTRO = {
  SWIMMING_POOL: "Piscina",
  HEATED_SWIMMING_POOL: "Piscina",
  WARM_SWIMMING_POOL: "Piscina",
  PET_FRIENDLY: "Aceita pet",
  FURNISHED: "Mobiliado",
  BACKYARD: "Quintal",
  GOURMET_BALCONY: "Varanda gourmet",
  GOURMET: "Espa\xE7o gourmet",
  BARBECUE_GRILL: "Churrasqueira",
  AIR_CONDITIONING: "Ar-condicionado",
  SOLAR_HEATING: "Aquecimento solar",
  ACCEPT_FINANCING: "Aceita financiamento",
  EXCHANGE: "Aceita permuta",
  ELEVATOR: "Elevador",
  OFFICE: "Escrit\xF3rio",
  ACADEMY: "Academia",
  FITNESS_ROOM: "Academia",
  PLAYGROUND: "Playground",
  SPORTS_COURT: "Quadra",
  CONCIERGE_24_7: "Portaria 24 horas"
};
const EXTRAS = {
  GATED_COMMUNITY: "Condom\xEDnio fechado",
  CABINET_KITCHEN: "Arm\xE1rios na cozinha",
  CABINET_BATHROOM: "Arm\xE1rios no banheiro",
  CABINET_BEDROOM: "Arm\xE1rios nos quartos",
  CABINET_CLOSET: "Closet",
  LAUNDRY_ROOM: "Lavanderia",
  HALFBATH: "Lavabo",
  FLOOR_PORCELAIN_TILES: "Piso de porcelanato",
  PANTRY: "Despensa",
  INTERPHONE: "Interfone",
  ELECTRIC_GATE: "Port\xE3o eletr\xF4nico",
  SOCCER_FIELD: "Campo de futebol",
  VERANDA: "Varanda",
  BALCONY: "Sacada",
  CLOAKROOM: "Rouparia",
  BREAKFAST_NOOK: "Copa",
  HYDROMASSAGE_BATHTUB: "Banheira de hidromassagem",
  SAUNA: "Sauna",
  SAUNA_DRY: "Sauna",
  SAUNA_WET: "Sauna",
  SOLARIUM: "Sol\xE1rio",
  MAID_BATHROOM: "Banheiro de servi\xE7o",
  MAID_ROOM: "Quarto de servi\xE7o",
  MEZZANINE: "Mezanino",
  ALARM_SYSTEM: "Alarme",
  TOY_LIBRARY: "Brinquedoteca",
  PARTY_ROOM: "Sal\xE3o de festas",
  FIREPLACE: "Lareira",
  CHILDREN_SWIMMING_POOL: "Piscina infantil",
  ANNEX: "Ed\xEDcula",
  ORCHARD: "Pomar",
  FRUIT_GROWING: "Pomar",
  GAMES_ROOM: "Sal\xE3o de jogos",
  CLUB: "Clube",
  SECURITY_SYSTEM: "Sistema de seguran\xE7a",
  ARTESIAN_WELL: "Po\xE7o artesiano",
  ELECTRIC_GENERATOR: "Gerador",
  ACCESSIBILITY: "Acessibilidade",
  TENNIS_COURT: "Quadra de t\xEAnis",
  LAKE: "Lago",
  SPA: "Spa",
  WINECELLAR: "Adega",
  GARDEN: "Jardim",
  CINEMA_ROOM: "Sala de cinema",
  PRIVATE_ELEVATOR: "Elevador privativo",
  SQUASH_COURT: "Quadra de squash",
  SKATE_PARK: "Pista de skate",
  BIKE_RACK: "Biciclet\xE1rio",
  GUARDHOUSE: "Guarita",
  ARMORED_BOOTH: "Guarita blindada",
  CARETAKER: "Caseiro",
  WIFI: "Wi-Fi",
  VISITOR_PARKING: "Vagas para visitantes",
  FLOOR_WOOD: "Piso de madeira",
  FLOOR_LAMINATE: "Piso laminado",
  FLOOR_VINYL: "Piso vin\xEDlico",
  FLOOR_MARBLE: "Piso de m\xE1rmore",
  FLOOR_GRANITE: "Piso de granito",
  MASSAGE_ROOM: "Sala de massagem",
  GAS_SUPPLY: "G\xE1s encanado",
  RAINWATER_HARVESTING: "Capta\xE7\xE3o de \xE1gua da chuva"
};
const v = (x) => {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "object") return v(x.value);
  const n = parseFloat(String(x));
  return isNaN(n) ? 0 : n;
};
const tamanho = (url, w) => url.replace(/=[^/=]*$/, "") + "=w" + w;
const mil = (n) => n.toLocaleString("pt-BR");
function converte(a) {
  const d = a.details || {}, p = d.pricing || {}, loc = d.location || {}, ar = d.area || {};
  const feats = d.features || [];
  const fin = a.purpose === "FOR_RENT" ? "locacao" : "venda";
  const tipoBase = TIPOS[d.propertyType] || "Im\xF3vel";
  const condominio = feats.includes("GATED_COMMUNITY");
  const tipo = condominio && (tipoBase === "Casa" || tipoBase === "Terreno") ? `${tipoBase} em condom\xEDnio` : tipoBase;
  const semTerreno = ["Apartamento", "Apartamento duplex", "Sala comercial"].includes(tipoBase);
  const soTerreno = ["Terreno", "\xC1rea"].includes(tipoBase);
  const total = v(ar.valueTotal), util = v(ar.valueUsable);
  const area = soTerreno ? 0 : util || (semTerreno ? total : 0);
  const terreno = semTerreno ? 0 : soTerreno ? total || util : total > util ? total : 0;
  const dorm = v(d.bedrooms), suites = v(d.suites);
  const iptuP = (p.iptuList || [])[0];
  const iptuAno = iptuP ? v(iptuP.installmentAmount) * (v(iptuP.installmentQuantity) || 1) : 0;
  const imgs = [...a.media?.image || []].sort((x, y) => (y.isPrimary ? 1 : 0) - (x.isPrimary ? 1 : 0)).map((f) => String(f.url || "")).filter(Boolean);
  const titulo = soTerreno || ["Galp\xE3o", "Sala comercial", "Sal\xE3o comercial", "Ch\xE1cara"].includes(tipoBase) && !dorm ? `${tipo}${(soTerreno ? terreno : area || terreno) ? " de " + mil(soTerreno ? terreno : area || terreno) + " m\xB2" : ""}` : `${tipo}${dorm ? suites && suites === dorm ? ` com ${suites} ${suites === 1 ? "su\xEDte" : "su\xEDtes"}` : ` com ${dorm} ${dorm === 1 ? "dormit\xF3rio" : "dormit\xF3rios"}` : ""}`;
  const criado = String(d.createAt || "");
  return {
    cod: String(a.propertyCode || a.id),
    fin,
    tipo,
    bairro: String(loc.neighborhood || "").trim(),
    regiao: "",
    cidade: String(loc.city || "Indaiatuba"),
    titulo,
    descricao: String(d.description || "").trim(),
    area,
    terreno,
    dorm,
    suites,
    banh: v(d.bathrooms),
    vagas: v(d.garage?.value),
    preco: fin === "venda" ? v(p.salePrice) : v(p.rentPrice),
    precoAluguel: fin === "venda" ? v(p.rentPrice) : 0,
    cond: v(p.condoPrice),
    iptu: Math.round((fin === "locacao" ? iptuAno / 12 : iptuAno) * 100) / 100,
    fotos: imgs.map((u) => tamanho(u, 1600)),
    nfotos: imgs.length,
    video: String(a.media?.video?.[0]?.url || ""),
    carac: [...new Set(feats.map((f) => FILTRO[f]).filter(Boolean))],
    extras: [...new Set(feats.map((f) => EXTRAS[f]).filter(Boolean))],
    op: "",
    novo: criado ? Date.now() - Date.parse(criado) < 45 * 864e5 : false,
    destaque: d.highlightLevel === "FEATURED" || feats.includes("FEATURED") || feats.includes("SUPER_FEATURED"),
    data: criado
  };
}
function leve(i) {
  return { ...i, descricao: "", extras: [], fotos: i.fotos.slice(0, 1).map((u) => tamanho(u, 900)), parcial: true };
}
function agenciaDe(userInfo) {
  try {
    const j = JSON.parse(Buffer.from(userInfo, "base64").toString());
    return String(j.agencyId ?? j.agency_id ?? j.id_imob ?? "");
  } catch {
    return "";
  }
}
async function principal() {
  const fs = await import("node:fs"), path = await import("node:path");
  const saida = process.argv[2] || "_site";
  const chave = process.env.KENLO_API_KEY, userInfo = process.env.KENLO_USER_INFO;
  if (!chave || !userInfo) {
    console.log("Sem KENLO_API_KEY/KENLO_USER_INFO nos segredos do GitHub: o site sai com os im\xF3veis de exemplo.");
    return;
  }
  const agencia = process.env.KENLO_AGENCY_ID || agenciaDe(userInfo);
  const headers = { Accept: "application/json", "X-API-Key": chave, "x-user-info": userInfo };
  const itens = [];
  for (let page = 1; page <= 40; page++) {
    const r = await fetch(`${BASE}/v2/listings?agencyId=${encodeURIComponent(agencia)}&page=${page}&pageSize=100`, { headers });
    if (r.status === 429) {
      await new Promise((ok) => setTimeout(ok, Math.min(Number(r.headers.get("Retry-After") || 5), 60) * 1e3));
      page--;
      continue;
    }
    if (!r.ok) throw new Error(`A Kenlo respondeu ${r.status} na p\xE1gina ${page}`);
    const j = await r.json();
    const data = Array.isArray(j?.data) ? j.data : [];
    itens.push(...data);
    if (!data.length || page >= Number(j?.pagination?.totalPages || 0)) break;
  }
  const lista = itens.map(converte).filter((i) => i.cod && i.fotos.length && i.preco > 0);
  if (!lista.length) throw new Error("A Kenlo n\xE3o devolveu nenhum im\xF3vel com foto e valor");
  const pasta = path.join(saida, "imovel");
  fs.mkdirSync(pasta, { recursive: true });
  const nomeArq = (c) => c.replace(/[^A-Za-z0-9_-]/g, "_");
  for (const i of lista) fs.writeFileSync(path.join(pasta, nomeArq(i.cod) + ".json"), JSON.stringify({ imovel: i }));
  fs.writeFileSync(path.join(saida, "imoveis.json"), JSON.stringify({ imoveis: lista.map(leve), total: lista.length, geradoEm: (/* @__PURE__ */ new Date()).toISOString() }));
  console.log(`${lista.length} im\xF3veis gravados (de ${itens.length} an\xFAncios na Kenlo).`);
}
principal().catch((e) => {
  // Falha na Kenlo não derruba o site: sem arquivos novos, o GitHub publica os últimos imóveis que deram certo.
  console.log("::warning::Não foi possível atualizar os imóveis: " + String(e).slice(0, 300));
});
