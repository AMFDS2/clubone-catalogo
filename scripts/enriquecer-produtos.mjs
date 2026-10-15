import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { extrairDocumentosOficiais } from "./extrair-documentos-oficiais.mjs"
import { extrairProdutoElectrolux } from "./fabricantes/electrolux.mjs";
import { extrairProdutoInfoStore } from "./fabricantes/info-store.mjs";
import { extrairProdutoMidea, variantesModelo } from "./fabricantes/climatizacao.mjs";

const pastaScripts = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(pastaScripts, "..");
const caminhoFontes = path.join(raiz, "dados", "fontes-oficiais.json");
const caminhoSaida = path.join(raiz, "dados", "enriquecimento-automatico.json");
const pastaImagens = path.join(raiz, "assets", "produtos");
const argumentoModelo = process.argv.find(argumento => argumento.startsWith("--modelo="));

const CAMPOS = [
  ["Capacidade total", ["Capacidade Total (L)", "Total (L)", "Bruta Total (L)"]],
  ["Capacidade de lavagem", ["Capacidade de lavagem (kg)", "Capacidade de lavagem"]],
  ["Capacidade de secagem", ["Capacidade de secagem (kg)", "Capacidade de secagem"]],
  ["Capacidade", ["Capacidade BTU", "Capacidade (BTU/h)", "Capacidade de refrigeração", "Capacidade"]],
  ["Ciclo", ["Ciclo", "Modelo Frio"]],
  ["Voltagem", ["Voltagem", "Tensão/Frequência", "Tensão"]],
  ["Cor", ["Cor principal", "Cor da estrutura", "Cor"]],
  ["Tipo de porta", ["Tipo de porta"]],
  ["Tecnologia de refrigeração", ["Tecnologia de Refrigeração", "Tipo de refrigeração"]],
  ["Frost Free", ["Frost Free"]],
  ["Wi-Fi", ["Wi-Fi embutido", "Wi-Fi"]],
  ["SmartThings", ["Compatível com SmartThings", "SmartThings"]],
  ["Produto conectado", ["Produto conectado"]],
  ["Inteligência artificial", ["Inteligência artificial"]],
  ["Gás refrigerante", ["Gás refrigerante", "Fluido refrigerante"]],
  ["Consumo de energia", ["Consumo de Energia kWh/ano", "Consumo de energia"]],
  ["Vazão de ar", ["Vazão de ar (m³/h)", "Vazão de ar"]],
  ["Nível de ruído", ["Nível de ruído", "Ruído"]],
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
const somenteModelo = argumentoModelo
  ? nomeSeguro(argumentoModelo.slice("--modelo=".length))
  : "";

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

function normalizarURL(url = "", baseURL = "") {
  const valor = String(url).replaceAll("&amp;", "&").trim();
  if (valor.startsWith("//")) return `https:${valor}`;
  if (valor.startsWith("/") && baseURL) {
    try { return new URL(valor, baseURL).href; } catch { return ""; }
  }
  return valor;
}

function imagemInvalida(url = "") { return /logo|favicon|icon-|social-share/i.test(url); }

function extrairImagens($, estruturado, modelo, baseURL = "") {
  const candidatas = new Map();
  const modelos = variantesModelo(modelo);

  function adicionar(url, pontosBase = 0, contexto = "") {
    const normalizada = normalizarURL(url, baseURL);
    if (!normalizada || imagemInvalida(normalizada)) return;
    if (!/^https?:\/\//i.test(normalizada)) return;
    const texto = nomeSeguro(`${normalizada} ${contexto}`);
    let pontos = pontosBase;
    if (modelos.some(chaveModelo => texto.includes(nomeSeguro(chaveModelo)))) pontos += 100;
    if (/images\.samsung\.com|vtexassets\.com|tcdn\.com\.br|electrolux/i.test(normalizada)) pontos += 35;
    if (/gallery|product-images|produto|product|zoom|large/i.test(normalizada)) pontos += 25;
    if (/\.png(?:\?|$)|\.webp(?:\?|$)|\.jpe?g(?:\?|$)/i.test(normalizada)) pontos += 10;
    if (/banner|kv-|thumbnail|mosaic|award|logo|favicon|sprite/i.test(normalizada)) pontos -= 80;

    const anterior = candidatas.get(normalizada);
    if (anterior == null || pontos > anterior) candidatas.set(normalizada, pontos);
  }

  $("img, source").each((_, elemento) => {
    ["src", "data-src", "data-lazy-src", "data-desktop-src", "data-mobile-src", "srcset", "data-srcset"].forEach(atributo => {
      const bruto = $(elemento).attr(atributo);
      if (!bruto) return;
      const contexto = `${$(elemento).attr("alt") || ""} ${$(elemento).attr("title") || ""}`;
      bruto.split(",").forEach(parte => adicionar(parte.trim().split(/\s+/)[0], 0, contexto));
    });
  });

  const imagensEstruturadas = Array.isArray(estruturado?.image)
    ? estruturado.image
    : estruturado?.image
      ? [estruturado.image]
      : [];

  imagensEstruturadas.forEach(imagem => adicionar(imagem?.url || imagem, 140, "produto oficial"));
  adicionar($('meta[property="og:image"]').attr("content") || "", 120, "imagem principal");

  const pontuadas = [...candidatas.entries()]
    .map(([url, pontos], indice) => ({ url, pontos, indice }))
    .filter(item => item.pontos >= 35)
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

function extrairImagemAmbiente($, baseURL = "") {
  let encontrada = "";
  const padraoAmbiente = /ambiente|lifestyle|em uso|cozinha|bancada|aplica[cç][aã]o|contexto|cen[aá]rio/i;

  $("img, source").each((_, elemento) => {
    if (encontrada) return;
    const item = $(elemento);
    const contexto = [
      item.attr("alt"),
      item.attr("title"),
      item.attr("class"),
      item.attr("data-image-label")
    ].filter(Boolean).join(" ");
    if (!padraoAmbiente.test(contexto)) return;

    const bruto = item.attr("data-src") || item.attr("data-lazy-src") || item.attr("src") || item.attr("srcset") || "";
    const primeiraURL = bruto.split(",")[0]?.trim().split(/\s+/)[0] || "";
    const url = normalizarURL(primeiraURL, baseURL);
    if (url && /^https?:\/\//i.test(url) && !imagemInvalida(url)) encontrada = url;
  });

  return encontrada;
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

function converterParaMilimetros(valor = "", unidade = "mm") {
  const n = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n)) return "";
  const fator = String(unidade).toLowerCase() === "m"
    ? 1000
    : String(unidade).toLowerCase() === "cm" ? 10 : 1;
  return `${String(n * fator).replace(/\.0+$/, "")} mm`;
}

function procurarMedidasDoProduto(texto = "") {
  const inicio = normalizar(texto).indexOf("medidas do produto");
  if (inicio < 0) return null;
  const trecho = texto.slice(inicio, inicio + 1600);
  const encontrar = rotulo => {
    const resultado = trecho.match(new RegExp(
      `${rotulo}[^0-9]{0,80}(\\d{1,4}(?:[.,]\\d+)?)\\s*(mm|cm|m)`,
      "i"
    ));
    return resultado ? converterParaMilimetros(resultado[1], resultado[2]) : "";
  };
  const largura = encontrar("Largura");
  const altura = encontrar("Altura");
  const profundidade = encontrar("Profundidade");
  return largura && altura && profundidade ? { largura, altura, profundidade } : null;
}

function extrairDimensoes($) {
  const copia = cheerio.load($.html());
  copia("script, style, noscript").remove();
  const texto = limparTexto(copia("body").text());

  const semBase = procurarTripla(texto, ["Tamanho da TV sem suporte", "Dimensão do conjunto sem suporte", "Dimensões sem suporte", "Set Size without Stand"]);
  const comBase = procurarTripla(texto, ["Tamanho da TV com suporte", "Dimensão do conjunto com suporte", "Dimensões com suporte", "Set Size with Stand"]);
  const produto = !semBase && !comBase ? procurarTripla(texto, ["Dimensão sem embalagem", "Dimensões sem embalagem", "Dimensões s/ embalagem", "Dimensões Líquidas", "Dimensões do Produto", "Net Dimension"]) || procurarSeparadas(texto, false) || procurarMedidasDoProduto(texto) : null;
  const embalagem = procurarTripla(texto, ["Tamanho da embalagem", "Dimensões da embalagem", "Dimensões com embalagem", "Dimensões brutas", "Dimensão Bruta", "Package Size", "Gross Dimension"]) || procurarSeparadas(texto, true);

  return { ...(semBase && { semBase }), ...(comBase && { comBase }), ...(produto && { produto }), ...(embalagem && { embalagem }) };
}

function especificacoesClimatizacaoPeloTitulo(titulo = "") {
  const especificacoes = {};
  const capacidade = String(titulo).match(/(\d{1,2}(?:[.,]\d+)?)\s*(?:mil|k)?\s*BTU(?:\/h)?/i);
  if (capacidade) {
    const valor = Number(capacidade[1].replace(",", "."));
    const mil = /(?:mil|k)\s*BTU/i.test(capacidade[0]);
    especificacoes.Capacidade = `${mil ? valor * 1000 : valor} BTU/h`;
  }
  if (/\binverter\b/i.test(titulo)) especificacoes.Tecnologia = "Inverter";
  if (/\bfrio\b/i.test(titulo)) especificacoes.Ciclo = "Frio";
  if (/\bquente\s*[\/]?\s*frio\b/i.test(titulo)) especificacoes.Ciclo = "Quente/Frio";
  if (/\bcassete\b/i.test(titulo)) especificacoes.Tipo = "Cassete";
  else if (/\bpiso\s*teto\b/i.test(titulo)) especificacoes.Tipo = "Piso-teto";
  else if (/\bsplit\b/i.test(titulo)) especificacoes.Tipo = "Split Hi Wall";
  return especificacoes;
}

function criarDestaques(especificacoes) {
  const prioridades = ["Capacidade", "Ciclo", "Produto conectado", "Inteligência artificial", "Capacidade total", "Capacidade de lavagem", "Capacidade de secagem", "Tamanho da tela", "Resolução", "Frequência do painel", "Tecnologia do painel", "Voltagem", "Cor", "Tipo de porta", "Frost Free", "Wi-Fi", "SmartThings", "Classificação energética", "Gás refrigerante", "Sistema operacional", "Potência de áudio"];
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
    const fabricante = String(item.fabricante || "");
    const ehElectrolux = /electrolux/i.test(fabricante);
    const ehMidea = /midea/i.test(fabricante);
    const ehSamsung = /samsung/i.test(fabricante);

    let oficial = null;
    if (item.origemFonte !== "INFO_STORE" && ehElectrolux) {
      oficial = await extrairProdutoElectrolux($, html, item);
    } else if (item.origemFonte !== "INFO_STORE" && ehMidea) {
      oficial = await extrairProdutoMidea(item);
    }

    // Para marcas novas, a página da Info Store é uma segunda fonte. Ela só
    // prevalece quando o fabricante não confirmou exatamente o modelo.
    const apoio = ehSamsung ? null : await extrairProdutoInfoStore(item);
    const documentosGenericos = await extrairDocumentosOficiais(
      $, html, item.fonteInterna, item.modelo
    );
    const generico = {
      titulo: limparTexto(estruturado?.name || $('meta[property="og:title"]').attr("content") || $("title").text()),
      descricao: limparTexto(estruturado?.description || $('meta[name="description"]').attr("content") || ""),
      urlsImagens: extrairImagens($, estruturado, item.modelo, item.fonteInterna),
      urlImagemAmbiente: extrairImagemAmbiente($, item.fonteInterna),
      especificacoes: extrairEspecificacoes($),
      dimensoes: extrairDimensoes($),
      documentos: documentosGenericos
    };

    const fonteFabricante = oficial || generico;
    const fabricanteValidado = item.origemFonte !== "INFO_STORE" && (
      oficial?.validadoFabricante === true ||
      item.correspondencia === "MODELO_EXATO" ||
      ehSamsung
    );
    const principal = fabricanteValidado ? fonteFabricante : (apoio || fonteFabricante);
    const secundaria = fabricanteValidado ? apoio : fonteFabricante;

    const titulo = principal?.titulo || secundaria?.titulo || "";
    const descricao = principal?.descricao || secundaria?.descricao || "";
    const especificacoes = {
      ...especificacoesClimatizacaoPeloTitulo(generico.titulo),
      ...(apoio?.especificacoes || {}),
      ...(generico.especificacoes || {}),
      ...(principal?.especificacoes || {})
    };
    const dimensoes = Object.keys(principal?.dimensoes || {}).length
      ? principal.dimensoes
      : (Object.keys(generico.dimensoes || {}).length ? generico.dimensoes : (secundaria?.dimensoes || {}));
    const documentos = principal?.documentos?.length
      ? principal.documentos
      : (generico.documentos?.length ? generico.documentos : (secundaria?.documentos || []));
    let urlsImagens = principal?.urlsImagens?.length
      ? principal.urlsImagens
      : (generico.urlsImagens?.length ? generico.urlsImagens : (secundaria?.urlsImagens || []));
    const urlImagemAmbiente = principal?.urlImagemAmbiente || generico.urlImagemAmbiente || secundaria?.urlImagemAmbiente || "";
    if (urlImagemAmbiente && !urlsImagens.includes(urlImagemAmbiente)) {
      urlsImagens = [...urlsImagens, urlImagemAmbiente].slice(0, 6);
    }

    const imagens = [];
    let imagemAmbiente = "";
    const errosImagens = [];

    for (let i = 0; i < urlsImagens.length; i++) {
      try {
        const imagemLocal = await baixarImagem(urlsImagens[i], item.modelo, imagens.length);
        if (imagemLocal) {
          imagens.push(imagemLocal);
          if (urlImagemAmbiente && urlsImagens[i] === urlImagemAmbiente) imagemAmbiente = imagemLocal;
        }
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
      imagemAmbiente,
      dimensoes,
      documentos,
      especificacoes,
      destaques: criarDestaques(especificacoes),
      statusExtracao: imagem && Object.keys(especificacoes).length ? (Object.keys(dimensoes).length ? "EXTRAIDO" : "REVISAR") : "REVISAR",
      pendencias,
      fonteInterna: item.fonteInterna,
      fonteApoio: apoio?.fonteApoio || oficial?.fonteApoio || "",
      origemDados: fabricanteValidado ? "FABRICANTE" : (apoio ? "INFO_STORE" : item.origemFonte),
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
  const confirmados = fontes.filter(item =>
    item.statusFonte === "LOCALIZADO" &&
    (!somenteModelo || nomeSeguro(item.modelo) === somenteModelo) &&
    (forcar || !existentes.has(nomeSeguro(item.modelo)))
  );
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
