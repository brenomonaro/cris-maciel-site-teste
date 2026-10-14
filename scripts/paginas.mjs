// Gera uma página própria para cada imóvel: imovel/CODIGO/index.html
// Roda no GitHub Actions depois do scripts/kenlo.mjs (e também sozinho, para testar o modelo).
//   node scripts/paginas.mjs _site
// Lê: _site/imoveis.json (lista leve) e _site/imovel/CODIGO.json (imóvel completo, vindo da Kenlo),
//     exemplos/*.json (imóveis de exemplo, só para aprovar o desenho) e opinioes/CODIGO.json (a opinião assinada).
// A opinião não vem da Kenlo: fica em opinioes/, um arquivo por código, escrito pelo corretor que visitou.
// Variáveis: SITE_URL (endereço do site, para o Google e o WhatsApp), SITE_INDEXAR=1 (libera o Google; sem ela, noindex).
import fs from "node:fs";
import path from "node:path";

const SAIDA = process.argv[2] || "_site";
const RAIZ = process.cwd();
const SITE = (process.env.SITE_URL || "").replace(/\/+$/, "");
const INDEXAR = process.env.SITE_INDEXAR === "1";
const WA = "5519992754241";
const BASE = "../../";

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const brl = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const mil = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dataBR = (d) => { const x = new Date(d + (String(d).length === 10 ? "T12:00:00" : "")); return isNaN(x) ? "" : `${x.getDate()} de ${MESES[x.getMonth()]} de ${x.getFullYear()}`; };
const slug = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const lerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const tam = (u, w) => /googleusercontent\.com/.test(u) ? u.replace(/=[^/=]*$/, "") + "=w" + w : u;

const I = {
  area: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  terreno: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 17l6-10 4 6 3-4 5 8z"/></svg>',
  dorm: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 15h18M6 10V7h5v3"/></svg>',
  suite: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V6a2 2 0 0 1 4 0"/></svg>',
  banh: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 4v3M8 11a4 4 0 0 1 8 0M9 15l-1 3M12 15v3M15 15l1 3"/></svg>',
  vaga: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 16h14l-1.5-5a2 2 0 0 0-2-1.5h-7a2 2 0 0 0-2 1.5zM5 16v2M19 16v2M7.5 13.5h.01M16.5 13.5h.01"/></svg>',
  pin: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2"/></svg>',
  foto: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 8h3l2-2h6l2 2h3v10H4z"/><circle cx="12" cy="13" r="3"/></svg>',
  seta: '<svg class="ico" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  zap: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9.5 9.5c.3 1.8 2.2 3.7 4 4l1-1 1.8.8-.3 1.4c-3 .3-6.6-3.3-6.3-6.3l1.4-.3.8 1.8z"/></svg>',
  enviar: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 4v11M7 9l5-5 5 5M5 14v5h14v-5"/></svg>',
};

function retrato(nome) {
  if (!nome) return "";
  const s = slug(nome);
  for (const ext of ["webp", "jpg"]) {
    const rel = `lx-media/equipe/${s}.${ext}`;
    if (fs.existsSync(path.join(RAIZ, rel))) return `<span class="retrato"><img src="${BASE}${rel}" alt="${esc(nome)}" loading="lazy"></span>`;
  }
  return `<span class="retrato" aria-hidden="true">${esc(nome.trim()[0] || "")}</span>`;
}

function fotosDe(i) {
  if (i.pasta) return i.fotos.map((f) => `${BASE}${i.pasta}${f}.webp`);
  return (i.fotos || []).map((u) => tam(u, 1600));
}

function paragrafos(t) { return String(t || "").split(/\r?\n\s*\r?\n|\r?\n/).map((p) => p.trim()).filter(Boolean); }

function semelhantes(i, lista) {
  return lista.filter((x) => x.cod !== i.cod && x.fin === i.fin && x.fotos && x.fotos.length)
    .map((x) => [(x.tipo === i.tipo ? 3 : 0) + (x.bairro === i.bairro ? 2 : 0) - Math.abs(x.preco - i.preco) / Math.max(i.preco, 1), x])
    .sort((a, b) => b[0] - a[0]).slice(0, 3).map((p) => p[1]);
}

function pagina(i, op, lista) {
  const venda = i.fin !== "locacao";
  const fotos = fotosDe(i);
  const urlPag = SITE ? `${SITE}/imovel/${encodeURIComponent(i.cod)}/` : "";
  const onde = [i.bairro, `${i.cidade || "Indaiatuba"}, SP`].filter(Boolean).join(" · ");
  const titulo = i.titulo || i.tipo;
  const paras = paragrafos(i.descricao);
  const resumo = paras.length ? paras[0].slice(0, 155) : `${titulo} em ${i.bairro || i.cidade}.`;
  const tituloPag = `${titulo} ${i.bairro ? (/^(centro)$/i.test(i.bairro) ? "no Centro" : "no " + i.bairro) : ""}, ${venda ? "à venda" : "para alugar"} · Cód. ${i.cod} · Cris Maciel`;
  const corretor = (op && op.corretor) || i.corretor || "";
  const link = urlPag ? " " + urlPag : "";
  const waVisita = `https://wa.me/${WA}?text=${encodeURIComponent(`Olá! Vi no site da Cris Maciel o imóvel de código ${i.cod} (${titulo}) e quero agendar uma visita.${link}`)}`;
  const waDuvida = `https://wa.me/${WA}?text=${encodeURIComponent(`Olá! Vi no site da Cris Maciel o imóvel de código ${i.cod} (${titulo}) e tenho uma dúvida.${link}`)}`;

  const nums = [];
  if (i.area) nums.push([I.area, `${mil(i.area)} m²`, i.terreno ? "Construídos" : "Área útil"]);
  if (i.terreno) nums.push([I.terreno, `${mil(i.terreno)} m²`, "Terreno"]);
  if (i.dorm && i.dorm !== i.suites) nums.push([I.dorm, i.dorm, i.dorm === 1 ? "Dormitório" : "Dormitórios"]);
  if (i.suites) nums.push([I.suite, i.suites, i.suites === 1 ? "Suíte" : "Suítes"]);
  if (i.banh) nums.push([I.banh, i.banh, i.banh === 1 ? "Banheiro" : "Banheiros"]);
  if (i.vagas) nums.push([I.vaga, i.vagas, i.vagas === 1 ? "Vaga" : "Vagas"]);

  const custos = [];
  if (i.cond) custos.push(["Condomínio", `${brl(i.cond)} /mês`]);
  if (i.iptu) custos.push(["IPTU", `${brl(i.iptu)} ${venda ? "/ano" : "/mês"}`]);
  if (!venda && i.preco) custos.push(["Total estimado", `${brl(i.preco + (i.cond || 0) + (i.iptu || 0))} /mês`]);
  if (venda && i.precoAluguel) custos.push(["Também para alugar", `${brl(i.precoAluguel)} /mês`]);

  const sem = semelhantes(i, lista);
  const ld = {
    "@context": "https://schema.org", "@type": "RealEstateListing", name: tituloPag.replace(/ · Cris Maciel$/, ""), description: resumo,
    ...(urlPag ? { url: urlPag } : {}), image: fotos.slice(0, 3).map((u) => (SITE && u.startsWith(BASE) ? SITE + "/" + u.slice(BASE.length) : u)),
    ...(i.data ? { datePosted: i.data.slice(0, 10) } : {}),
    offers: { "@type": "Offer", price: i.preco, priceCurrency: "BRL", availability: "https://schema.org/InStock", businessFunction: venda ? "https://purl.org/goodrelations/v1#Sell" : "https://purl.org/goodrelations/v1#LeaseOut",
      seller: { "@type": "RealEstateAgent", name: "Cris Maciel Consultoria Imobiliária", telephone: "+55 19 99275-4241" } },
    about: { "@type": /apartamento/i.test(i.tipo) ? "Apartment" : "SingleFamilyResidence", ...(i.dorm ? { numberOfRooms: i.dorm } : {}), ...(i.banh ? { numberOfBathroomsTotal: i.banh } : {}),
      ...(i.area ? { floorSize: { "@type": "QuantitativeValue", value: i.area, unitCode: "MTK" } } : {}),
      address: { "@type": "PostalAddress", addressLocality: i.cidade || "Indaiatuba", addressRegion: "SP", addressCountry: "BR" } },
  };
  const ogImg = fotos[0] ? (fotos[0].startsWith(BASE) ? (SITE ? SITE + "/" + fotos[0].slice(BASE.length) : fotos[0]) : tam(fotos[0], 1200)) : "";

  const opiniao = op ? `
      <section class="bloco" id="opiniao" aria-labelledby="t-op">
        <h2 id="t-op">A nossa opinião</h2>
        <div class="opiniao">
          <div class="assina">${retrato(corretor)}<div><b>${esc(corretor)}</b><small>Corretora da Cris Maciel${op.visita ? `, visitou o imóvel em ${dataBR(op.visita)}` : ""}</small></div></div>
          <div class="quatro">
            ${op.paraQuem ? `<div><h3>Para quem é</h3><p>${esc(op.paraQuem)}</p></div>` : ""}
            ${op.fotoNaoMostra ? `<div><h3>O que a foto não mostra</h3><p>${esc(op.fotoNaoMostra)}</p></div>` : ""}
            ${op.gostamos ? `<div><h3>O que a gente gosta</h3><p>${esc(op.gostamos)}</p></div>` : ""}
            ${op.naoServe ? `<div class="nao"><h3>Para quem não serve</h3><p>${esc(op.naoServe)}</p></div>` : ""}
          </div>
          ${op.avaliacao && op.avaliacao.texto ? `<blockquote class="google"><span class="estrelas" aria-label="5 estrelas">★★★★★</span><p>${esc(op.avaliacao.texto)}</p><footer>${esc(op.avaliacao.autor)}, avaliação no Google${op.avaliacao.data ? ", " + esc(op.avaliacao.data) : ""}</footer></blockquote>`
            : i.exemplo ? `<div class="google falta">Aqui entra uma avaliação real do Google que cite a ${esc(corretor)} pelo nome. Ainda não temos uma, então o espaço fica vazio no site.</div>` : ""}
        </div>
      </section>` : "";

  const caracs = (i.carac || []).length || (i.extras || []).length ? `
      <section class="bloco" aria-labelledby="t-car">
        <h2 id="t-car">Características</h2>
        ${(i.carac || []).length ? `<div class="chips">${i.carac.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
        ${(i.extras || []).length ? `<ul class="lista">${i.extras.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      </section>` : "";

  const video = /^https:\/\/(youtu\.be|(www\.)?youtube\.com)\//.test(i.video || "") ? `
      <section class="bloco" aria-labelledby="t-vid"><h2 id="t-vid">Vídeo</h2><a class="btn btn--claro" style="display:inline-flex" href="${esc(i.video)}" target="_blank" rel="noopener">Assistir ao vídeo do imóvel</a></section>` : "";

  const mapsQ = encodeURIComponent(`${i.bairro || ""}, ${i.cidade || "Indaiatuba"}, SP`);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloPag)}</title>
<meta name="description" content="${esc(resumo)}">
${INDEXAR && !i.exemplo ? "" : '<meta name="robots" content="noindex, nofollow">'}
${urlPag ? `<link rel="canonical" href="${esc(urlPag)}">` : ""}
<meta name="theme-color" content="#F7F4EE">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cris Maciel Consultoria Imobiliária">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(titulo)} · ${esc(onde)}">
<meta property="og:description" content="${esc((venda ? "À venda por " : "Para alugar por ") + brl(i.preco) + (venda ? "" : " /mês") + ". " + resumo)}">
${ogImg ? `<meta property="og:image" content="${esc(ogImg)}">` : ""}
${urlPag ? `<meta property="og:url" content="${esc(urlPag)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${BASE}lx-media/emb-eeb4bc0740db.png">
<link rel="preload" as="image" href="${esc(fotos[0] || "")}">
<link rel="stylesheet" href="${BASE}lx-media/fontes/fontes.css">
<link rel="stylesheet" href="${BASE}lx-media/imovel.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header class="topo"><div class="in">
  <a class="voltar" href="${BASE}?p=imoveis">${I.seta}<span>Voltar</span></a>
  <a href="${BASE}" aria-label="Cris Maciel Consultoria Imobiliária, página inicial"><span class="marca"></span></a>
  <nav aria-label="Principal"><a class="sempre" href="${BASE}?p=imoveis" aria-current="page">Imóveis</a><a href="${BASE}?p=lancamentos">Lançamentos</a><a href="${BASE}?p=proprietario">Anunciar meu imóvel</a><a href="${BASE}?p=historia">Nossa história</a><a href="${BASE}?p=contato">Contato</a></nav>
</div></header>
${i.exemplo ? `<div class="aviso-ex"><div class="in">Página de exemplo para aprovar o desenho. As fotos são de uma casa real no ${esc(i.bairro)}; números, valores, descrição e opinião são ilustrativos.</div></div>` : ""}
<main class="in">
  <nav class="trilha" aria-label="Você está em"><a href="${BASE}${venda ? "?p=imoveis" : "?fin=locacao"}">Imóveis ${venda ? "à venda" : "para alugar"}</a><span>/</span><span>${esc(i.tipo)}</span><span>/</span><span>Cód. ${esc(i.cod)}</span></nav>

  <div class="galeria-wrap"><div class="galeria">
    ${fotos.slice(0, 3).map((u, k) => `<button type="button" data-foto="${k}" aria-label="Ampliar a foto ${k + 1} de ${fotos.length}"><img src="${esc(k === 0 ? u : tam(u, 900))}" alt="${esc(titulo)}, foto ${k + 1}"${k ? ' loading="lazy"' : ' fetchpriority="high"'}></button>`).join("\n    ")}
  </div>${fotos.length > 3 ? `<button type="button" class="todas" data-foto="0">${I.foto}Ver as ${fotos.length} fotos</button>` : ""}</div>

  <div class="grade">
    <div>
      <header class="cab">
        <p class="rot">${venda ? "À venda" : "Para alugar"} · ${esc(i.tipo)}</p>
        <h1>${esc(titulo)}</h1>
        <p class="local">${I.pin}${esc(onde)}</p>
        ${nums.length ? `<div class="numeros">${nums.map((n) => `<div>${n[0]}<b>${n[1]}</b><span>${n[2]}</span></div>`).join("")}</div>` : ""}
      </header>

      <section class="bloco" aria-labelledby="t-sobre">
        <h2 id="t-sobre">Sobre o imóvel</h2>
        <div class="texto">${paras.slice(0, 2).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        ${paras.length > 2 ? `<details class="mais"><summary>Ler a descrição completa</summary><div class="texto">${paras.slice(2).map((p) => `<p>${esc(p)}</p>`).join("")}</div></details>` : ""}
      </section>
${opiniao}
${caracs}
${video}
      <section class="bloco" aria-labelledby="t-loc">
        <h2 id="t-loc">Localização</h2>
        <div class="mapa">${I.pin}<div><b>${esc(i.bairro || i.cidade)}</b><p>${esc(i.cidade || "Indaiatuba")}, SP. O endereço completo é passado no agendamento da visita.</p><a href="https://www.google.com/maps/search/?api=1&amp;query=${mapsQ}" target="_blank" rel="noopener">Ver o bairro no mapa</a></div></div>
      </section>
    </div>

    <aside class="valor" aria-label="Valor e contato">
      <div><p class="rot">${venda ? "Valor de venda" : "Aluguel"}</p><p class="preco">${brl(i.preco)}${venda ? "" : "<small>/mês</small>"}</p></div>
      ${custos.length ? `<dl class="custos">${custos.map((c) => `<div><dt>${c[0]}</dt><dd>${c[1]}</dd></div>`).join("")}</dl>` : ""}
      <div class="acoes"><a class="btn btn--ouro" href="${esc(waVisita)}" target="_blank" rel="noopener">${I.zap}Agendar uma visita</a><a class="btn btn--claro" href="${esc(waDuvida)}" target="_blank" rel="noopener">Tirar uma dúvida</a></div>
      ${corretor ? `<div class="quem">${retrato(corretor)}<div>Quem cuida deste imóvel<b>${esc(corretor)}</b></div></div>` : ""}
      <div class="pe-valor"><span>Cód. ${esc(i.cod)}</span><button type="button" class="compartilhar" data-compartilhar>${I.enviar}<span>Compartilhar</span></button></div>
      <p class="nota">Valores informados pelo proprietário e sujeitos a alteração.</p>
    </aside>
  </div>
</main>

${sem.length ? `<section class="semelhantes"><div class="in"><h2>Outros imóveis parecidos</h2><div class="cards">${sem.map((x) => `<a class="card" href="../${encodeURIComponent(x.cod)}/"><img src="${esc(x.fotos[0])}" alt="" loading="lazy"><div><small>${esc(x.bairro || x.cidade)}</small><h3>${esc(x.titulo)}</h3><b>${brl(x.preco)}${x.fin === "locacao" ? " /mês" : ""}</b></div></a>`).join("")}</div></div></section>` : ""}

<section class="convite"><div class="in">
  <h2>Quer ver de perto?</h2>
  <p>A visita é marcada no horário que for melhor para você, com quem conhece o imóvel.</p>
  <div class="acoes"><a class="btn btn--ouro" href="${esc(waVisita)}" target="_blank" rel="noopener">${I.zap}Agendar uma visita</a><a class="btn btn--claro" href="${BASE}?p=imoveis">Ver outros imóveis</a></div>
</div></section>

<footer class="rodape"><div class="in">
  <span class="marca" aria-hidden="true"></span>
  <span>Av. Presidente Kennedy, 1552, Centro, Indaiatuba, SP</span>
  <span>Segunda a sexta, das 8h às 17h. Sábado, das 8h às 12h.</span>
  <span>CRECI 038182-J · <a href="${BASE}?p=privacidade">Privacidade</a></span>
</div></footer>

<a class="btn btn--ouro zap" href="${esc(waVisita)}" target="_blank" rel="noopener">${I.zap}Agendar uma visita</a>

<div class="caixa" role="dialog" aria-modal="true" aria-label="Fotos do imóvel">
  <div class="caixa-cab"><span data-cont></span><button type="button" data-fechar>Fechar</button></div>
  <div class="caixa-palco"><img alt=""></div>
  <div class="caixa-nav"><button type="button" data-ir="-1" aria-label="Foto anterior">←</button><button type="button" data-ir="1" aria-label="Próxima foto">→</button></div>
</div>
<script type="application/json" id="fotos">${JSON.stringify(fotos).replace(/</g, "\\u003c")}</script>
<script src="${BASE}lx-media/imovel.js" defer></script>
</body>
</html>
`;
}

function principal() {
  const lista = (lerJson(path.join(SAIDA, "imoveis.json")) || {}).imoveis || [];
  const pastaImovel = path.join(SAIDA, "imovel");
  const itens = [];
  if (fs.existsSync(pastaImovel)) for (const f of fs.readdirSync(pastaImovel)) if (f.endsWith(".json")) { const j = lerJson(path.join(pastaImovel, f)); if (j && j.imovel) itens.push(j.imovel); }
  const exDir = path.join(RAIZ, "exemplos");
  if (fs.existsSync(exDir)) for (const f of fs.readdirSync(exDir)) if (f.endsWith(".json")) { const j = lerJson(path.join(exDir, f)); if (j && j.cod) itens.push(j); }
  let n = 0;
  for (const i of itens) {
    const cod = String(i.cod).replace(/[^A-Za-z0-9_-]/g, "_");
    const op = lerJson(path.join(RAIZ, "opinioes", cod + ".json"));
    const dir = path.join(pastaImovel, cod);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), pagina(i, op, lista));
    n++;
  }
  console.log(`${n} páginas de imóvel geradas em ${pastaImovel}/CODIGO/`);
}
principal();
