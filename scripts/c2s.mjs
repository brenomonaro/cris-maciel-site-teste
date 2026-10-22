// Busca no C2S os imóveis publicados no site e grava os arquivos que o site lê.
// Roda no GitHub Actions (.github/workflows/site.yml) a cada 30 minutos.
// O token vem do segredo do repositório C2S_IMOB_TOKEN (Settings > Secrets and variables > Actions).
// Nunca escreva o token aqui nem em outro arquivo do site.
// API: https://crm.c2sapp.com/api-docs?spec=v1 (GET /api/site/v1/properties, 50 por página).
// Gera: imoveis.json (lista leve, só a foto de capa) e imovel/CODIGO.json (o imóvel completo, para a ficha e a página própria).
// Nunca saem: e-mail das pessoas, proprietário, rua, número, complemento, CEP e coordenadas. O site mostra só o bairro.
// Do corretor sai só o nome como está na página Equipe (ex.: "Ana Jamile"); quem não está na equipe sai só com o primeiro nome.

const BASE = "https://crm.c2sapp.com";

// nomes da página Equipe, na grafia do site
const EQUIPE = ["Cris", "Enzo", "Sandra", "Adriana", "Aline", "Ana Jamile", "Anderson", "Cynthia", "Denis", "Felipe", "Flávia",
  "Josiane", "Karen", "Lázaro", "Mônica", "Vanessa", "Kátia", "Ana Flávia", "Amanda"];
// quem nunca aparece no site, mesmo que esteja ligado a um imóvel no CRM
const NUNCA = ["alessandra"];

// tipos do C2S que chegam como código (o C2S também manda property_type_display, que tem preferência)
const TIPOS = {
  house: "Casa", casa: "Casa", home: "Casa", sobrado: "Sobrado", townhouse: "Sobrado",
  apartment: "Apartamento", apartamento: "Apartamento", flat: "Apartamento", penthouse: "Cobertura", cobertura: "Cobertura",
  land: "Terreno", lot: "Terreno", terreno: "Terreno", lote: "Terreno",
  farm: "Chácara", small_farm: "Chácara", chacara: "Chácara", sitio: "Sítio", fazenda: "Fazenda",
  commercial: "Comercial", room: "Sala comercial", office: "Sala comercial", sala: "Sala comercial",
  store: "Loja", loja: "Loja", warehouse: "Galpão", galpao: "Galpão", shed: "Galpão", hall: "Salão comercial", area: "Área"
};
// itens que viram filtro no catálogo (o resto vai para a lista completa da ficha)
const FILTRO = [
  [/piscina(?!\s*infantil)/i, "Piscina"], [/pet/i, "Aceita pet"], [/mobiliad/i, "Mobiliado"], [/quintal/i, "Quintal"],
  [/varanda\s*gourmet/i, "Varanda gourmet"], [/espa[cç]o\s*gourmet|área\s*gourmet/i, "Espaço gourmet"], [/churrasqueira/i, "Churrasqueira"],
  [/ar[\s-]*condicionado/i, "Ar-condicionado"], [/aquecimento\s*solar/i, "Aquecimento solar"], [/financiamento/i, "Aceita financiamento"],
  [/permuta/i, "Aceita permuta"], [/^elevador$/i, "Elevador"], [/escrit[oó]rio/i, "Escritório"], [/academia|fitness/i, "Academia"],
  [/playground/i, "Playground"], [/quadra(?!\s*de\s*t[eê]nis)/i, "Quadra"], [/portaria\s*24/i, "Portaria 24 horas"]
];

const sem = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const num = (x) => {
  if (x == null || x === "") return 0;
  if (typeof x === "number") return x;
  const t = String(x).trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  const n = parseFloat(t.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};
const mil = (n) => n.toLocaleString("pt-BR");
const texto = (t) => String(t || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();

function tipoDe(p) {
  let t = String(p.property_type_display || "").trim();
  if (!t) t = TIPOS[sem(p.property_subtype)] || TIPOS[sem(p.property_type)] || "";
  if (!t) t = "Imóvel";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (p.is_condominium && /^(casa|terreno|sobrado)$/i.test(t)) t += " em condomínio";
  return t;
}

function finDe(p) {
  const tt = sem(p.transaction_type), venda = num(p.price), aluguel = num(p.price_rent);
  const soAluguel = /rent|alug|loca/.test(tt) && !/sale|vend|sell/.test(tt);
  if (soAluguel) return "locacao";
  if (venda > 0) return "venda";
  return aluguel > 0 ? "locacao" : "venda";
}

// nome do corretor como aparece no site
function corretorDe(people) {
  const lista = Array.isArray(people) ? people : [];
  const ordem = ["capture", "broker"]; // quem captou conhece o imóvel; depois, o corretor da comissão
  for (const papel of ordem) {
    for (const pessoa of lista) {
      if (pessoa?.role !== papel || !pessoa.name) continue;
      const nome = sem(pessoa.name);
      if (NUNCA.some((n) => nome === n || nome.startsWith(n + " "))) continue;
      const daEquipe = EQUIPE.filter((e) => nome === sem(e) || nome.startsWith(sem(e) + " "))
        .sort((a, b) => b.length - a.length)[0];
      if (daEquipe) return daEquipe;
      const primeiro = String(pessoa.name).trim().split(/\s+/)[0];
      return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
    }
  }
  return "";
}

export function converte(p) {
  const tipo = tipoDe(p);
  const fin = finDe(p);
  const base = tipo.replace(/ em condomínio$/, "");
  const semTerreno = /^(apartamento|cobertura|sala comercial|flat|studio|kitnet)/i.test(base);
  const soTerreno = /^(terreno|área|lote)/i.test(base);
  const util = num(p.private_area) || num(p.built_area);
  const total = num(p.total_area), lote = num(p.land_area);
  const area = soTerreno ? 0 : util || (semTerreno ? total : 0);
  const terreno = semTerreno ? 0 : soTerreno ? lote || total || util : lote || (total > util ? total : 0);
  const dorm = num(p.bedrooms), suites = num(p.suites);
  const fotos = [...(p.photos || [])]
    .filter((f) => f && f.url)
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.order ?? 999) - (b.order ?? 999))
    .map((f) => String(f.url));
  const itens = (p.amenities || []).filter((a) => a && a.name && a.value !== false).map((a) => String(a.name).trim());
  const carac = [...new Set(itens.map((n) => (FILTRO.find(([re]) => re.test(n)) || [])[1]).filter(Boolean))];
  if (p.is_furnished && !carac.includes("Mobiliado")) carac.push("Mobiliado");
  const extras = [...new Set(itens.filter((n) => !FILTRO.some(([re]) => re.test(n))))];
  const tituloGerado = soTerreno || (/^(galpão|sala comercial|salão comercial|chácara|loja)/i.test(base) && !dorm)
    ? `${tipo}${(soTerreno ? terreno : area || terreno) ? " de " + mil(soTerreno ? terreno : area || terreno) + " m²" : ""}`
    : `${tipo}${dorm ? (suites && suites === dorm ? ` com ${suites} ${suites === 1 ? "suíte" : "suítes"}` : ` com ${dorm} ${dorm === 1 ? "dormitório" : "dormitórios"}`) : ""}`;
  const criado = String(p.created_at || "");
  return {
    cod: String(p.reference_code || p.display_reference_code || p.id || "").trim(),
    fin,
    tipo,
    bairro: String(p.neighborhood || "").trim(),
    regiao: "",
    cidade: String(p.city || "Indaiatuba").trim(),
    titulo: tituloGerado,
    descricao: texto(p.description),
    area,
    terreno,
    dorm,
    suites,
    banh: num(p.bathrooms),
    vagas: num(p.parking_spots),
    preco: fin === "venda" ? num(p.price) : num(p.price_rent),
    precoAluguel: fin === "venda" ? num(p.price_rent) : 0,
    cond: num(p.condominium_fee),
    // o site mostra IPTU por ano na venda e por mês na locação; aqui se supõe que o C2S manda o valor anual (conferir com o primeiro dado real)
    iptu: fin === "locacao" ? Math.round(num(p.iptu_tax) / 12 * 100) / 100 : num(p.iptu_tax),
    fotos,
    nfotos: fotos.length,
    video: String(p.video_url || ""),
    carac,
    extras,
    op: "",
    novo: criado ? Date.now() - Date.parse(criado) < 45 * 864e5 : false,
    destaque: !!(p.super_highlighted || p.highlighted || p.is_highlighted),
    data: criado,
    edificio: String(p.building?.name || p.building_name || "").trim(),
    corretor: corretorDe(p.people)
  };
}

function leve(i) {
  return { ...i, descricao: "", extras: [], fotos: i.fotos.slice(0, 1), parcial: true };
}

async function buscaTudo(token) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
  const itens = [];
  for (let page = 1, tentativas = 0; page <= 80; page++) {
    const r = await fetch(`${BASE}/api/site/v1/properties?page=${page}&per_page=50`, { headers });
    if (r.status === 429 && tentativas < 5) {
      tentativas++;
      await new Promise((ok) => setTimeout(ok, Math.min(Number(r.headers.get("Retry-After") || 5), 60) * 1e3));
      page--;
      continue;
    }
    tentativas = 0;
    if (r.status === 401) throw new Error("O C2S recusou o token (401). Confira o segredo C2S_IMOB_TOKEN no GitHub.");
    if (!r.ok) throw new Error(`O C2S respondeu ${r.status} na página ${page}`);
    const j = await r.json();
    const lista = Array.isArray(j?.properties) ? j.properties : [];
    itens.push(...lista);
    if (!lista.length || !j?.pagination?.next_page) break;
  }
  return itens;
}

export function grava(itens, saida, fs, path) {
  const vistos = new Set();
  const lista = itens.map(converte).filter((i) => {
    if (!i.cod || !i.fotos.length || !(i.preco > 0) || vistos.has(i.cod)) return false;
    vistos.add(i.cod);
    return true;
  });
  if (!lista.length) throw new Error("O C2S não devolveu nenhum imóvel publicado com foto e valor");
  const pasta = path.join(saida, "imovel");
  fs.mkdirSync(pasta, { recursive: true });
  const nomeArq = (c) => c.replace(/[^A-Za-z0-9_-]/g, "_");
  for (const i of lista) fs.writeFileSync(path.join(pasta, nomeArq(i.cod) + ".json"), JSON.stringify({ imovel: i }));
  fs.writeFileSync(path.join(saida, "imoveis.json"), JSON.stringify({ imoveis: lista.map(leve), total: lista.length, fonte: "C2S", geradoEm: new Date().toISOString() }));
  return lista;
}

async function principal() {
  const fs = await import("node:fs"), path = await import("node:path");
  const saida = process.argv[2] || "_site";
  // para testar sem internet: C2S_ARQUIVO=resposta.json node scripts/c2s.mjs _teste
  if (process.env.C2S_ARQUIVO) {
    const j = JSON.parse(fs.readFileSync(process.env.C2S_ARQUIVO, "utf8"));
    const lista = grava(j.properties || [], saida, fs, path);
    console.log(`${lista.length} imóveis gravados a partir de ${process.env.C2S_ARQUIVO}.`);
    return;
  }
  const token = process.env.C2S_IMOB_TOKEN;
  if (!token) {
    console.log("Sem C2S_IMOB_TOKEN nos segredos do GitHub: o site sai com os imóveis de exemplo.");
    return;
  }
  const itens = await buscaTudo(token);
  const lista = grava(itens, saida, fs, path);
  console.log(`${lista.length} imóveis gravados (de ${itens.length} publicados no C2S).`);
}

principal().catch((e) => {
  // Falha no C2S não derruba o site: sem arquivos novos, o GitHub publica os últimos imóveis que deram certo.
  console.log("::warning::Não foi possível atualizar os imóveis: " + String(e).slice(0, 300));
});
