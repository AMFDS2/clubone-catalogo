import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const sitemapInicial =
  "https://www.samsung.com/br/sitemap.xml";

function normalizarModelo(valor = "") {
  return String(valor)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function extrairURLs(xml = "") {
  const resultados = [];
  const expressao = /<loc>(.*?)<\/loc>/gis;

  let correspondencia;

  while (
    (correspondencia = expressao.exec(xml)) !== null
  ) {
    const url = correspondencia[1]
      .replaceAll("&amp;", "&")
      .trim();

    if (url) {
      resultados.push(url);
    }
  }

  return resultados;
}

async function baixarTexto(url) {
  const resposta = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 CatalogoClubOne/1.0",
      "Accept":
        "application/xml,text/xml,text/html;q=0.9,*/*;q=0.8"
    }
  });

  if (!resposta.ok) {
    throw new Error(
      `Falha ${resposta.status} ao acessar ${url}`
    );
  }

  return resposta.text();
}

async function mapearSitemaps() {
  console.log("Lendo o sitemap oficial da Samsung...");

  const visitados = new Set();
  const paginas = new Set();
  const fila = [sitemapInicial];

  while (fila.length > 0) {
    const sitemap = fila.shift();

    if (visitados.has(sitemap)) {
      continue;
    }

    visitados.add(sitemap);

    console.log(
      `Sitemap ${visitados.size}: ${sitemap}`
    );

    try {
      const xml = await baixarTexto(sitemap);
      const urls = extrairURLs(xml);

      urls.forEach(url => {
        const caminhoURL = url
          .split("?")[0]
          .toLowerCase();

        if (
          caminhoURL.endsWith(".xml") ||
          caminhoURL.endsWith(".xml.gz")
        ) {
          if (!visitados.has(url)) {
            fila.push(url);
          }
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

function localizarPaginaDoModelo(modelo, paginas) {
  const modeloNormalizado =
    normalizarModelo(modelo).toLowerCase();

  const correspondencias = paginas.filter(url => {
    const urlNormalizada = url
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    return urlNormalizada.includes(modeloNormalizado);
  });

  if (correspondencias.length === 0) {
    return {
      status: "NAO_LOCALIZADO",
      url: "",
      alternativas: []
    };
  }

  const paginasDeProduto = correspondencias.filter(url =>
    /\/(tvs|audio-devices|refrigerators|washing-machines|air-conditioners|monitors|home-appliances)\//i.test(
      url
    )
  );

  const alternativas =
    paginasDeProduto.length > 0
      ? paginasDeProduto
      : correspondencias;

  return {
    status:
      alternativas.length === 1
        ? "LOCALIZADO"
        : "REVISAR",
    url: alternativas[0],
    alternativas
  };
}

async function executar() {
  const textoPendencias = await fs.readFile(
    caminhoPendencias,
    "utf8"
  );

  const pendencias = JSON.parse(textoPendencias);
  const paginas = await mapearSitemaps();

  console.log("");
  console.log("Procurando modelos...");

  const resultados = pendencias.map(
    (produto, indice) => {
      const resultado = localizarPaginaDoModelo(
        produto.modelo,
        paginas
      );

      console.log(
        `[${indice + 1}/${pendencias.length}] ` +
        `${produto.modelo}: ${resultado.status}`
      );

      return {
        modelo: produto.modelo,
        codigo: produto.codigo,
        produto: produto.produto,
        fabricante: produto.fabricante,
        statusFonte: resultado.status,
        fonteInterna: resultado.url,
        alternativas: resultado.alternativas,
        dataConsulta: new Date().toISOString()
      };
    }
  );

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
  console.log(
    "Arquivo gerado: dados/fontes-oficiais.json"
  );
}

executar().catch(erro => {
  console.error("");
  console.error("Erro ao localizar fontes:");
  console.error(erro.message);

  process.exitCode = 1;
});