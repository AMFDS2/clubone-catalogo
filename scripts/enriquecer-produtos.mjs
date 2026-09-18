import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { extrairDocumentosOficiais } from "./extrair-documentos-oficiais.mjs"
import { extrairProdutoElectrolux } from "./fabricantes/electrolux.mjs";
import { extrairProdutoInfoStore } from "./fabricantes/info-store.mjs";

const pastaScripts = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(pastaScripts, "..");
const caminhoFontes = path.join(raiz, "dados", "fontes-oficiais.json");
const caminhoSaida = path.join(raiz, "dados", "enriquecimento-automatico.json");
const pastaImagens = path.join(raiz, "assets", "produtos");

const CAMPOS = [
  ["Capacidade total", ["Capacidade Total (L)", "Total (L)", "Bruta Total (L)"]],
  ["Capacidade de lavagem", ["Capacidade de lavagem (kg)", "Capacidade de lavagem"]],
  ["Capacidade de secagem", ["Capacidade de secagem (kg)", "Capacidade de secagem"]],
  ["Voltagem", ["Voltagem", "Tensão/Frequência", "Tensão"]],
  ["Cor", ["Cor principal", "Cor da estrutura", "Cor"]],
  ["Tipo de porta", ["Tipo de porta"]],
  ["Tecnologia de refrigeração", ["Tecnologia de Refrigeração", "Tipo de refrigeração"]],
  ["Frost Free", ["Frost Free"]],
  ["Wi-Fi", ["Wi-Fi embutido", "Wi-Fi"]],
  ["SmartThings", ["Compatível com SmartThings", "SmartThings"]],
  ["Classificação energética", ["Classificação INMETRO", "Classe de eficiência energética"]],
  ["Tamanho da tela", ["Tamanho de tela"]],
  ["Resolução", ["Resolução"]],
  ["Frequência do painel", ["Frequência de painel", "Taxa de atualização"]],
  ["Tecnologia do painel", ["Tecnologia do painel", "Tipo de painel"]],
  ["Sistema operacional", ["Sistema operacional"]],
  ["Processador", ["Processador"]],
  ["Potência de áudio", ["Potência (RMS)", "Potência de áudio"]],
  ["Canais de áudio", ["Canais de Áudio", "Número de canais"]],
  ["HDMI", ["HDMI"]],
  ["USB", ["USB"]],
  ["Peso líquido", ["Peso líquido (kg)", "Peso líquido", "Produto sem base (Kg)"]],
  ["Peso bruto", ["Peso bruto (Kg)", "Peso bruto"]]
];

function limparTexto(valor = "") { return String(valor).replace(/\s+/g, " ").trim(); }
function normalizar(valor = "") { return limparTexto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[:：]/g, "").trim(); }
function nomeSeguro(valor = "") { return String(valor).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function numero(valor = "") { return String(valor).replace(",", ".").replace(/[^\d.]/g, ""); }

async function baixarPagina(url) {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9" } });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.text();
}

function jsonLd($) {
  const objetos = [];
  $('script[type="application/ld+json"]').each((_, elemento) => {
    try {
      const dado = JSON.parse($(elemento).text().trim());
      if (Array.isArray(dado)) objetos.push(...dado);
      else if (Array.isArray(dado?.["@graph"])) objetos.push(...dado["@graph"]);
      else objetos.push(dado);
    } catch { /* JSON-LD inválido é ignorado. */ }
  });
  return objetos.find(item => item?.["@type"] === "Product" || item?.["@type"]?.includes?.("Product"));
}

function normalizarURL(url = "") {
  const valor = String(url).replaceAll("&amp;", "&").trim();
  if (valor.startsWith("//")) return `https:${valor}`;
  if (valor.startsWith("/")) return `https://www.samsung.com${valor}`;
  return valor;
}

function imagemInvalida(url = "") { return /logo|favicon|icon-|social-share/i.test(url); }

function extrairImagens($, estruturado, modelo) {
  const candidatas = [];

  function adicionar(url) {
    const normalizada = normalizarURL(url);
    if (!normalizada || imagemInvalida(normalizada)) return;
    if (!/^https?:\/\//i.test(normalizada)) return;
    if (!candidatas.includes(normalizada)) candidatas.push(normalizada);
  }

  $("img, source").each((_, elemento) => {
    ["src", "data-src", "data-lazy-src", "data-desktop-src", "data-mobile-src", "srcset", "data-srcset"].forEach(atributo => {
      const bruto = $(elemento).attr(atributo);
      if (!bruto) return;
      bruto.split(",").forEach(parte => adicionar(parte.trim().split(/\s+/)[0]));
    });
  });

  const imagensEstruturadas = Array.isArray(estruturado?.image)
    ? estruturado.image
    : estruturado?.image
      ? [estruturado.image]
      : [];

  imagensEstruturadas.forEach(imagem => adicionar(imagem?.url || imagem));
  adicionar($('meta[property="og:image"]').attr("content") || "");

  const chave = nomeSeguro(modelo);
  const pontuadas = candidatas
    .map((url, indice) => {
      const texto = nomeSeguro(url);
      let pontos = 0;
      if (chave && texto.includes(chave)) pontos += 100;
      if (/images\.samsung\.com/i.test(url)) pontos += 50;
      if (/gallery|product-images|feature-benefit/i.test(url)) pontos += 25;
      if (/\.png(?:\?|$)|\.webp(?:\?|$)|\.jpe?g(?:\?|$)/i.test(url)) pontos += 10;
      if (/banner|kv-|thumbnail|mosaic|award|logo/i.test(url)) pontos -= 40;
      return { url, pontos, indice };
    })
    .filter(item => item.pontos >= 50)
    .sort((a, b) => b.pontos - a.pontos || a.indice - b.indice);

  const unicas = [];
  const chaves = new Set();

  pontuadas.forEach(item => {
    const chaveImagem = item.url.split("?")[0].replace(/\/(?:[0-9]{2,4}x[0-9]{2,4})\//i, "/");
    if (!chaves.has(chaveImagem) && unicas.length < 5) {
      chaves.add(chaveImagem);
      unicas.push(item.url);
    }
  });

  return unicas;
}

function textosFolha($) {
  const textos = [];
  $("body *").each((_, elemento) => {
    const item = $(elemento);
    if (item.children().length) return;
    const texto = limparTexto(item.text());
    if (!texto || texto.length > 160 || texto.includes("{{") || texto.includes("}}")) return;
    if (textos.at(-1) !== texto) textos.push(texto);
  });
  return textos;
}

function valorAceitavel(valor = "") {
  const texto = normalizar(valor);
  return Boolean(texto) && texto.length <= 100 && !["saiba mais", "expandir tudo", "ver mais", "comprar agora", "indisponivel", "esgotado", "selecione", "popup", "global navigation", "gallery", "fechar"].some(item => texto.includes(item));
}

function encontrarValor(textos, rotulos) {
  const procurados = rotulos.map(normalizar);
  for (let i = 0; i < textos.length; i++) {
    const atual = normalizar(textos[i]);
    if (!procurados.some(rotulo => atual === rotulo || atual.startsWith(`${rotulo} `))) continue;
    for (let j = i + 1; j <= i + 8 && j < textos.length; j++) {
      const candidato = textos[j];
      if (!procurados.includes(normalizar(candidato)) && valorAceitavel(candidato)) return candidato;
    }
  }
  return "";
}

function extrairEspecificacoes($) {
  const textos = textosFolha($);
  return Object.fromEntries(CAMPOS.map(([nome, rotulos]) => [nome, encontrarValor(textos, rotulos)]).filter(([, valor]) => valor));
}

function procurarTripla(texto, rotulos) {
  for (const rotulo of rotulos) {
    const posicao = normalizar(texto).indexOf(normalizar(rotulo));
    if (posicao < 0) continue;
    const trecho = texto.slice(posicao, posicao + 700);
    const medida = trecho.match(/(\d{1,4}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,4}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,4}(?:[.,]\d+)?)\s*(?:mm)?/i);
    if (medida) return { largura: `${numero(medida[1])} mm`, altura: `${numero(medida[2])} mm`, profundidade: `${numero(medida[3])} mm` };
  }
  return null;
}

function procurarSeparadas(texto, embalagem = false) {
  const complemento = embalagem ? String.raw`\s+com\s+embalagem` : "";
  const expressao = new RegExp(String.raw`Largura${complemento}(?:\s*\(mm\))?\s*:?\s*(\d{1,4}(?:[.,]\d+)?)\s*(?:mm)?[\s\S]{0,300}?Altura${complemento}(?:\s*\(mm\))?\s*:?\s*(\d{1,4}(?:[.,]\d+)?)\s*(?:mm)?[\s\S]{0,300}?Profundidade${complemento}(?:\s*\(mm\))?\s*:?\s*(\d{1,4}(?:[.,]\d+)?)\s*(?:mm)?`, "i");
  const resultado = texto.match(expressao);
  return resultado ? { largura: `${numero(resultado[1])} mm`, altura: `${numero(resultado[2])} mm`, profundidade: `${numero(resultado[3])} mm` } : null;
}

function extrairDimensoes($) {
  const copia = cheerio.load($.html());
  copia("script, style, noscript").remove();
  const texto = limparTexto(copia("body").text());

  const semBase = procurarTripla(texto, ["Tamanho da TV sem suporte", "Dimensão do conjunto sem suporte", "Dimensões sem suporte", "Set Size without Stand"]);
  const comBase = procurarTripla(texto, ["Tamanho da TV com suporte", "Dimensão do conjunto com suporte", "Dimensões com suporte", "Set Size with Stand"]);
  const produto = !semBase && !comBase ? procurarTripla(texto, ["Dimensão sem embalagem", "Dimensões sem embalagem", "Dimensões s/ embalagem", "Dimensões Líquidas", "Dimensões do Produto", "Net Dimension"]) || procurarSeparadas(texto, false) : null;
  const embalagem = procurarTripla(texto, ["Tamanho da embalagem", "Dimensões da embalagem", "Dimensões com embalagem", "Dimensões brutas", "Dimensão Bruta", "Package Size", "Gross Dimension"]) || procurarSeparadas(texto, true);

  return { ...(semBase && { semBase }), ...(comBase && { comBase }), ...(produto && { produto }), ...(embalagem && { embalagem }) };
}

function criarDestaques(especificacoes) {
  const prioridades = ["Capacidade total", "Capacidade de lavagem", "Capacidade de secagem", "Tamanho da tela", "Resolução", "Frequência do painel", "Tecnologia do painel", "Voltagem", "Cor", "Tipo de porta", "Frost Free", "Wi-Fi", "SmartThings", "Classificação energética", "Sistema operacional", "Potência de áudio"];
  return prioridades.filter(nome => especificacoes[nome]).slice(0, 5).map(rotulo => {
    let valor = especificacoes[rotulo];
    if (["Wi-Fi", "SmartThings", "Frost Free"].includes(rotulo) && normalizar(valor) === "sim") valor = rotulo;
    return { rotulo, valor };
  });
}

async function baixarImagem(url, modelo, indice = 0) {
  if (!url) return "";
  const resposta = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  if (!resposta.ok) throw new Error(`Imagem HTTP ${resposta.status}`);
  const tipo = resposta.headers.get("content-type") || "";
  const extensao = tipo.includes("png") ? ".png" : tipo.includes("webp") ? ".webp" : ".jpg";
  const pasta = path.join(pastaImagens, nomeSeguro(modelo));
  await fs.mkdir(pasta, { recursive: true });
  const nomeArquivo = indice === 0 ? "principal" : `galeria-${String(indice + 1).padStart(2, "0")}`;
  const arquivo = path.join(pasta, `${nomeArquivo}${extensao}`);
  await fs.writeFile(arquivo, Buffer.from(await resposta.arrayBuffer()));
  return `assets/produtos/${nomeSeguro(modelo)}/${nomeArquivo}${extensao}`;
}

async function processar(item, indice, total) {
  console.log(`[${indice + 1}/${total}] ${item.modelo}`);
  try {
    const html = await baixarPagina(item.fonteInterna);
    const $ = cheerio.load(html);
    const estruturado = jsonLd($);
    const ehElectrolux = /electrolux/i.test(item.fabricante || "");
    const oficial = ehElectrolux && item.origemFonte !== "INFO_STORE"
      ? await extrairProdutoElectrolux($, html, item)
      : null;
    const apoio = ehElectrolux ? await extrairProdutoInfoStore(item) : null;
    const apoioPorCodigo = apoio?.codigoInfoValidado === true;
    const extraido = ehElectrolux ? {
      // Quando o código interno foi confirmado, a própria página comercial da
      // Info Store define identidade, título e fotos. Isso impede que uma busca
      // aproximada no fabricante troque 90CIV por CE9IX, por exemplo.
      titulo: apoioPorCodigo ? (apoio?.titulo || oficial?.titulo || "") : (oficial?.titulo || apoio?.titulo || ""),
      descricao: apoioPorCodigo ? (apoio?.descricao || oficial?.descricao || "") : (oficial?.descricao || apoio?.descricao || ""),
      urlsImagens: apoioPorCodigo && apoio?.urlsImagens?.length
        ? apoio.urlsImagens
        : (oficial?.urlsImagens?.length ? oficial.urlsImagens : (apoio?.urlsImagens || [])),
      especificacoes: { ...(apoio?.especificacoes || {}), ...(oficial?.especificacoes || {}) },
      dimensoes: Object.keys(oficial?.dimensoes || {}).length ? oficial.dimensoes : (apoio?.dimensoes || {}),
      documentos: oficial?.documentos?.length ? oficial.documentos : (apoio?.documentos || []),
      fonteApoio: apoio?.fonteApoio || ""
    } : null;
    const titulo = extraido?.titulo || limparTexto(estruturado?.name || $('meta[property="og:title"]').attr("content") || $("title").text());
    const descricao = extraido?.descricao || limparTexto(estruturado?.description || $('meta[name="description"]').attr("content") || "");
    const especificacoes = extraido?.especificacoes || extrairEspecificacoes($);
    const dimensoes = extraido?.dimensoes || extrairDimensoes($);
    const documentos = extraido?.documentos?.length
      ? extraido.documentos
      : await extrairDocumentosOficiais($, html, item.fonteInterna, item.modelo);
    const urlsImagens = extraido?.urlsImagens || extrairImagens($, estruturado, item.modelo);

    const imagens = [];
    const errosImagens = [];

    for (let i = 0; i < urlsImagens.length; i++) {
      try {
        const imagemLocal = await baixarImagem(urlsImagens[i], item.modelo, imagens.length);
        if (imagemLocal) imagens.push(imagemLocal);
      } catch (erro) {
        errosImagens.push(erro.message);
      }
    }

    const imagem = imagens[0] || "";

    const pendencias = [
      ...(!imagem ? ["Imagem não extraída"] : []),
      ...(!Object.keys(dimensoes).length ? ["Dimensões não extraídas"] : []),
      ...(!Object.keys(especificacoes).length ? ["Especificações não extraídas"] : []),
      ...(errosImagens.length ? [`Erros de imagens: ${errosImagens.join("; ")}`] : [])
    ];

    return {
      modelo: item.modelo,
      codigo: item.codigo,
      produtoPlanilha: item.produto,
      tituloOficial: titulo,
      descricao,
      imagens,
      dimensoes,
      documentos,
      especificacoes,
      destaques: criarDestaques(especificacoes),
      statusExtracao: imagem && Object.keys(especificacoes).length ? (Object.keys(dimensoes).length ? "EXTRAIDO" : "REVISAR") : "REVISAR",
      pendencias,
      fonteInterna: item.fonteInterna,
      fonteApoio: extraido?.fonteApoio || "",
      dataConsulta: new Date().toISOString()
    };
  } catch (erro) {
    return { modelo: item.modelo, codigo: item.codigo, produtoPlanilha: item.produto, statusExtracao: "ERRO", pendencias: [erro.message], fonteInterna: item.fonteInterna, dataConsulta: new Date().toISOString() };
  }
}

async function executar() {
  await fs.mkdir(pastaImagens, { recursive: true });
  const fontes = JSON.parse(await fs.readFile(caminhoFontes, "utf8"));
  let anteriores = [];
  try { anteriores = JSON.parse(await fs.readFile(caminhoSaida, "utf8")); } catch {}
  const existentes = new Set(anteriores.map(item => nomeSeguro(item.modelo)));
  const forcar = process.env.FORCAR_ATUALIZACAO === "1";
  const confirmados = fontes.filter(item => item.statusFonte === "LOCALIZADO" && (forcar || !existentes.has(nomeSeguro(item.modelo))));
  console.log(`Modelos para enriquecer: ${confirmados.length}`);

  const resultadosNovos = [];
  for (let i = 0; i < confirmados.length; i++) {
    resultadosNovos.push(await processar(confirmados[i], i, confirmados.length));
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const chavesNovas = new Set(resultadosNovos.map(item => nomeSeguro(item.modelo)));
  const resultados = [...anteriores.filter(item => !chavesNovas.has(nomeSeguro(item.modelo))), ...resultadosNovos];

  await fs.writeFile(caminhoSaida, JSON.stringify(resultados, null, 2), "utf8");
  console.log("\nExtração concluída.");
  console.log(`Extraídos: ${resultados.filter(item => item.statusExtracao === "EXTRAIDO").length}`);
  console.log(`Revisar: ${resultados.filter(item => item.statusExtracao === "REVISAR").length}`);
  console.log(`Erros: ${resultados.filter(item => item.statusExtracao === "ERRO").length}`);
}

executar().catch(erro => { console.error("Erro geral:", erro.message); process.exitCode = 1; });
