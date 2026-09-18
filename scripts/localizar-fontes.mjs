import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { localizarFonteElectrolux } from "./fabricantes/electrolux.mjs";
import { localizarFonteInfoStore } from "./fabricantes/info-store.mjs";

const caminhoAtual = fileURLToPath(import.meta.url);
const pastaScripts = path.dirname(caminhoAtual);
const pastaProjeto = path.resolve(pastaScripts, "..");

const caminhoPendencias = path.join(
  pastaProjeto,
  "dados",
  "pendencias-catalogo.json"
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

async function executar() {
  const textoPendencias = await fs.readFile(caminhoPendencias, "utf8");
  const pendencias = JSON.parse(textoPendencias);
  const paginas = pendencias.some(item => !/electrolux/i.test(item.fabricante || ""))
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
    } else {
      resultado = localizarPaginaDoModelo(produto.modelo, paginas);
    }

    console.log(
      `[${indice + 1}/${pendencias.length}] ${produto.modelo}: ${resultado.status}`
    );

    resultadosNovos.push({
      modelo: produto.modelo,
      codigo: produto.codigo,
      produto: produto.produto,
      fabricante: produto.fabricante,
      statusFonte: resultado.status,
      fonteInterna: resultado.url,
      alternativas: resultado.alternativas,
      origemFonte: resultado.origemFonte || "FABRICANTE",
      dataConsulta: new Date().toISOString()
    });
  }

  let anteriores = [];
  try { anteriores = JSON.parse(await fs.readFile(caminhoSaida, "utf8")); } catch {}
  const novas = new Set(resultadosNovos.map(item => normalizarModelo(item.modelo)));
  const resultados = [...anteriores.filter(item => !novas.has(normalizarModelo(item.modelo))), ...resultadosNovos];

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
