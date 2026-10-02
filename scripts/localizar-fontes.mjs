import { ehClimatizacao } from "./lib/climatizacao.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { localizarFonteElectrolux } from "./fabricantes/electrolux.mjs";
import { localizarFonteInfoStore } from "./fabricantes/info-store.mjs";
import { localizarFontePortateis } from "./fabricantes/portateis.mjs";

const caminhoAtual = fileURLToPath(import.meta.url);
const pastaScripts = path.dirname(caminhoAtual);
const pastaProjeto = path.resolve(pastaScripts, "..");

const caminhoPendencias = path.join(
  pastaProjeto,
  "dados",
  "pendencias-catalogo.json"
);

const caminhoProdutosBase = path.join(
  pastaProjeto,
  "dados",
  "produtos-base.json"
);

const caminhoSaida = path.join(
  pastaProjeto,
  "dados",
  "fontes-oficiais.json"
);

const sitemapInicial = "https://www.samsung.com/br/sitemap.xml";

const categoriasDeProduto = [
  "tvs",
  "audio-devices",
  "refrigerators",
  "washing-machines",
  "air-conditioners",
  "monitors",
  "home-appliances",
  "cooking-appliances",
  "ovens",
  "cooktops",
  "microwave-ovens",
  "dishwashers",
  "vacuum-cleaners"
];

function normalizarModelo(valor = "") {
  return String(valor)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizarURLParaComparacao(url = "") {
  try {
    return decodeURIComponent(String(url))
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  } catch {
    return String(url)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }
}

function extrairURLs(xml = "") {
  const resultados = [];
  const expressao = /<loc>(.*?)<\/loc>/gis;
  let correspondencia;

  while ((correspondencia = expressao.exec(xml)) !== null) {
    const url = correspondencia[1]
      .replaceAll("&amp;", "&")
      .trim();

    if (url) resultados.push(url);
  }

  return resultados;
}

async function baixarTexto(url) {
  const resposta = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CatalogoClubOne/2.0",
      Accept: "application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9"
    }
  });

  if (!resposta.ok) {
    throw new Error(`Falha ${resposta.status} ao acessar ${url}`);
  }

  const buffer = Buffer.from(await resposta.arrayBuffer());
  const tipo = resposta.headers.get("content-type") || "";

  if (url.toLowerCase().endsWith(".gz") || tipo.includes("gzip")) {
    try {
      return gunzipSync(buffer).toString("utf8");
    } catch {
      return buffer.toString("utf8");
    }
  }

  return buffer.toString("utf8");
}

async function mapearSitemaps() {
  console.log("Lendo os sitemaps oficiais da Samsung...");

  const visitados = new Set();
  const paginas = new Set();
  const fila = [sitemapInicial];

  while (fila.length > 0) {
    const sitemap = fila.shift();

    if (!sitemap || visitados.has(sitemap)) continue;

    visitados.add(sitemap);
    console.log(`Sitemap ${visitados.size}: ${sitemap}`);

    try {
      const xml = await baixarTexto(sitemap);
      const urls = extrairURLs(xml);

      urls.forEach(url => {
        const caminhoURL = url.split("?")[0].toLowerCase();

        if (caminhoURL.endsWith(".xml") || caminhoURL.endsWith(".xml.gz")) {
          if (!visitados.has(url)) fila.push(url);
        } else {
          paginas.add(url);
        }
      });
    } catch (erro) {
      console.warn(`Ignorado: ${erro.message}`);
    }
  }

  console.log("");
  console.log(`Sitemaps lidos: ${visitados.size}`);
  console.log(`Páginas indexadas: ${paginas.size}`);

  return [...paginas];
}

function pontuarURL(url, modeloNormalizado) {
  const urlMinuscula = url.toLowerCase();
  const urlNormalizada = normalizarURLParaComparacao(url);
  let pontos = 0;

  if (urlNormalizada.includes(modeloNormalizado)) pontos += 100;

  if (categoriasDeProduto.some(categoria => urlMinuscula.includes(`/${categoria}/`))) {
    pontos += 50;
  }

  if (/\/br\/(?:business\/)?[^?#]+\/$/i.test(url)) pontos += 5;

  if (
    urlMinuscula.includes("/support/") ||
    urlMinuscula.includes("/search/") ||
    urlMinuscula.includes("/manual/") ||
    urlMinuscula.includes("/news/") ||
    urlMinuscula.includes("/offer/")
  ) {
    pontos -= 200;
  }

  return pontos;
}

function localizarPaginaDoModelo(modelo, paginas) {
  const modeloNormalizado = normalizarModelo(modelo);

  if (!modeloNormalizado) {
    return { status: "NAO_LOCALIZADO", url: "", alternativas: [] };
  }

  const correspondencias = paginas
    .filter(url =>
      normalizarURLParaComparacao(url).includes(modeloNormalizado)
    )
    .map(url => ({
      url,
      pontos: pontuarURL(url, modeloNormalizado)
    }))
    .sort((a, b) => b.pontos - a.pontos);

  if (correspondencias.length === 0) {
    return { status: "NAO_LOCALIZADO", url: "", alternativas: [] };
  }

  const melhor = correspondencias[0];
  const alternativas = correspondencias.map(item => item.url);

  if (melhor.pontos < 100) {
    return {
      status: "REVISAR",
      url: melhor.url,
      alternativas
    };
  }

  return {
    status: "LOCALIZADO",
    url: melhor.url,
    alternativas
  };
}

function ehPortatil(item = {}) {
  return /portateis|portáteis|eletroportateis|eletroportáteis/i.test(String(item.segmento || ""));
}

function chaveIdentidade(item = {}) {
  return String(item.codigo || item.modelo || "").trim().toUpperCase();
}

async function executar() {
  const forcarTudo = process.env.FORCAR_ATUALIZACAO === "1";
  const forcarPortateis = process.env.FORCAR_PORTATEIS === "1";

  const caminhoEntrada = (forcarTudo || forcarPortateis)
    ? caminhoProdutosBase
    : caminhoPendencias;

  const textoEntrada = await fs.readFile(caminhoEntrada, "utf8");
  let pendencias = JSON.parse(textoEntrada).filter(p => !ehClimatizacao(p));

  if (forcarPortateis && !forcarTudo) {
    pendencias = pendencias.filter(ehPortatil);
  }

  // Modo de teste rápido: TESTAR_CODIGOS="POR0111,POR0114,POR0115,POR0096"
  // limita a execução aos códigos informados, sem reprocessar todos os itens.
  const testarCodigos = new Set(
    String(process.env.TESTAR_CODIGOS || "")
      .split(",")
      .map(valor => valor.trim().toUpperCase())
      .filter(Boolean)
  );

  if (testarCodigos.size) {
    pendencias = pendencias.filter(item => testarCodigos.has(String(item.codigo || "").trim().toUpperCase()));
    console.log(`Modo de teste ativo: ${[...testarCodigos].join(", ")}`);
  }

  console.log(
    forcarTudo
      ? "Relocalização forçada de todos os produtos não climatização."
      : forcarPortateis
        ? "Relocalização forçada somente de eletroportáteis."
        : "Localizando somente produtos pendentes."
  );

  const paginas = pendencias.some(item => /samsung/i.test(item.fabricante || ""))
    ? await mapearSitemaps()
    : [];

  console.log("");
  console.log("Procurando modelos...");

  const resultadosNovos = [];
  for (let indice = 0; indice < pendencias.length; indice++) {
    const produto = pendencias[indice];
    let resultado;
    if (/electrolux/i.test(produto.fabricante || "")) {
      resultado = await localizarFonteElectrolux(produto);
      if (resultado.status !== "LOCALIZADO") {
        const apoio = await localizarFonteInfoStore(produto);
        if (apoio.status === "LOCALIZADO") resultado = apoio;
      }
    } else if (/walita|philips|\bwap\b/i.test(produto.fabricante || "")) {
      resultado = await localizarFontePortateis(produto);
      if (resultado.status !== "LOCALIZADO") {
        const apoio = await localizarFonteInfoStore(produto);
        if (apoio.status === "LOCALIZADO") resultado = apoio;
      }
    } else if (/samsung/i.test(produto.fabricante || "")) {
      resultado = localizarPaginaDoModelo(produto.modelo, paginas);
    } else {
      resultado = await localizarFonteInfoStore(produto);
    }

    console.log(
      `[${indice + 1}/${pendencias.length}] ${produto.modelo}: ${resultado.status}`
    );

    resultadosNovos.push({
      modelo: produto.modelo,
      codigo: produto.codigo,
      produto: produto.produto,
      fabricante: produto.fabricante,
      segmento: produto.segmento,
      statusFonte: resultado.status,
      fonteInterna: resultado.url,
      alternativas: resultado.alternativas,
      origemFonte: resultado.origemFonte || "FABRICANTE",
      correspondencia: resultado.correspondencia || "",
      dataConsulta: new Date().toISOString()
    });
  }

  let anteriores = [];
  try { anteriores = JSON.parse(await fs.readFile(caminhoSaida, "utf8")); } catch {}

  // Substitui pela identidade comercial (Código Info Store) e não apenas pelo
  // modelo. Assim, quando um modelo antigo era EAN e passa a EP1220/RI2244,
  // o registro incorreto anterior é removido em vez de permanecer duplicado.
  const novas = new Set(resultadosNovos.map(chaveIdentidade));
  const resultados = [
    ...anteriores.filter(item => !novas.has(chaveIdentidade(item))),
    ...resultadosNovos
  ];

  await fs.writeFile(
    caminhoSaida,
    JSON.stringify(resultados, null, 2),
    "utf8"
  );

  const localizados = resultados.filter(
    item => item.statusFonte === "LOCALIZADO"
  ).length;

  const revisar = resultados.filter(
    item => item.statusFonte === "REVISAR"
  ).length;

  const naoLocalizados = resultados.filter(
    item => item.statusFonte === "NAO_LOCALIZADO"
  ).length;

  console.log("");
  console.log("Pesquisa concluída.");
  console.log(`Localizados: ${localizados}`);
  console.log(`Revisar: ${revisar}`);
  console.log(`Não localizados: ${naoLocalizados}`);
  console.log("");
  console.log("Arquivo gerado: dados/fontes-oficiais.json");
}

executar().catch(erro => {
  console.error("");
  console.error("Erro ao localizar fontes:");
  console.error(erro.message);
  process.exitCode = 1;
});
