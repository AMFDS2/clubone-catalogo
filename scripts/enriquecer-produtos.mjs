import { ehClimatizacao } from "./lib/climatizacao.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { extrairDocumentosOficiais } from "./extrair-documentos-oficiais.mjs"
import { extrairProdutoElectrolux } from "./fabricantes/electrolux.mjs";
import { extrairProdutoInfoStore } from "./fabricantes/info-store.mjs";
import { extrairProdutoPortateis } from "./fabricantes/portateis.mjs";

const pastaScripts = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(pastaScripts, "..");
const caminhoFontes = path.join(raiz, "dados", "fontes-oficiais.json");
const caminhoSaida = path.join(raiz, "dados", "enriquecimento-automatico.json");
const pastaImagens = path.join(raiz, "assets", "produtos");

const CAMPOS = [
  ["Capacidade total", ["Capacidade Total (L)", "Total (L)", "Bruta Total (L)"]],
  ["Capacidade de lavagem", ["Capacidade de lavagem (kg)", "Capacidade de lavagem"]],
  ["Capacidade de secagem", ["Capacidade de secagem (kg)", "Capacidade de secagem"]],
  ["Capacidade", ["Capacidade", "Capacidade útil", "Volume"]],
  ["Potência", ["Potência", "Potência do motor", "Potência nominal"]],
  ["Velocidades", ["Número de velocidades", "Velocidades"]],
  ["Timer", ["Timer", "Temporizador"]],
  ["Temperatura", ["Temperatura", "Controle de temperatura", "Temperatura máxima"]],
  ["Garantia", ["Garantia", "Prazo de garantia"]],
  ["Acessórios", ["Acessórios", "Acessórios inclusos"]],
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
  const prioridades = ["Capacidade", "Potência", "Voltagem", "Temperatura", "Velocidades", "Capacidade total", "Capacidade de lavagem", "Capacidade de secagem", "Tamanho da tela", "Resolução", "Frequência do painel", "Tecnologia do painel", "Cor", "Tipo de porta", "Frost Free", "Wi-Fi", "SmartThings", "Classificação energética", "Sistema operacional", "Potência de áudio"];
  return prioridades.filter(nome => especificacoes[nome]).slice(0, 5).map(rotulo => {
    let valor = especificacoes[rotulo];
    if (["Wi-Fi", "SmartThings", "Frost Free"].includes(rotulo) && normalizar(valor) === "sim") valor = rotulo;
    return { rotulo, valor };
  });
}

async function baixarImagem(url, modelo, indice = 0, nomePersonalizado = "") {
  if (!url) return "";
  const resposta = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  if (!resposta.ok) throw new Error(`Imagem HTTP ${resposta.status}`);
  const tipo = resposta.headers.get("content-type") || "";
  const extensao = tipo.includes("png") ? ".png" : tipo.includes("webp") ? ".webp" : ".jpg";
  const pasta = path.join(pastaImagens, nomeSeguro(modelo));
  await fs.mkdir(pasta, { recursive: true });
  const nomeArquivo = nomePersonalizado || (indice === 0 ? "principal" : `galeria-${String(indice + 1).padStart(2, "0")}`);
  const arquivo = path.join(pasta, `${nomeArquivo}${extensao}`);
  await fs.writeFile(arquivo, Buffer.from(await resposta.arrayBuffer()));
  return `assets/produtos/${nomeSeguro(modelo)}/${nomeArquivo}${extensao}`;
}

function valorPreenchido(valor) {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim() !== "";
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === "object") return Object.keys(valor).length > 0;
  return true;
}


function ehPortatilItem(item = {}) {
  return /portate/i.test(String(item.segmento || "")) || /eletroport/i.test(String(item.categoria || ""));
}

function caminhoAbsolutoAsset(relativo = "") {
  if (!relativo) return "";
  return path.join(raiz, relativo.replace(/^[/\\]+/, ""));
}

function extensaoArquivo(caminhoArquivo = "") {
  return path.extname(caminhoArquivo).toLowerCase() || ".jpg";
}

function clamp(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

function analisarCanal(raw, info) {
  const { width, height, channels } = info;
  let total = 0;
  let totalSat = 0;
  let totalLum = 0;
  let totalLum2 = 0;
  let brancos = 0;
  let escuros = 0;
  let bordaBranca = 0;
  let bordaTotal = 0;
  let grad = 0;
  const buckets = new Set();

  const passoBucket = 32;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = raw[idx] ?? 0;
      const g = raw[idx + 1] ?? 0;
      const b = raw[idx + 2] ?? 0;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const lum = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
      const sat = max === 0 ? 0 : (max - min) / max;

      total += 1;
      totalSat += sat;
      totalLum += lum;
      totalLum2 += lum * lum;
      if (r > 240 && g > 240 && b > 240) brancos += 1;
      if (r < 25 && g < 25 && b < 25) escuros += 1;
      buckets.add(`${Math.floor(r / passoBucket)}-${Math.floor(g / passoBucket)}-${Math.floor(b / passoBucket)}`);

      if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4) {
        bordaTotal += 1;
        if (r > 240 && g > 240 && b > 240) bordaBranca += 1;
      }

      if (x + 1 < width) {
        const idxR = idx + channels;
        grad += Math.abs(r - (raw[idxR] ?? 0)) + Math.abs(g - (raw[idxR + 1] ?? 0)) + Math.abs(b - (raw[idxR + 2] ?? 0));
      }
      if (y + 1 < height) {
        const idxD = ((y + 1) * width + x) * channels;
        grad += Math.abs(r - (raw[idxD] ?? 0)) + Math.abs(g - (raw[idxD + 1] ?? 0)) + Math.abs(b - (raw[idxD + 2] ?? 0));
      }
    }
  }

  const lumMedio = totalLum / Math.max(1, total);
  const lumVar = Math.max(0, (totalLum2 / Math.max(1, total)) - (lumMedio * lumMedio));
  const lumDesvio = Math.sqrt(lumVar);

  return {
    brancos: brancos / Math.max(1, total),
    escuros: escuros / Math.max(1, total),
    bordaBranca: bordaBranca / Math.max(1, bordaTotal),
    saturacao: totalSat / Math.max(1, total),
    diversidade: buckets.size,
    contraste: lumDesvio / 255,
    gradiente: grad / Math.max(1, total) / 255,
    luminosidade: lumMedio / 255
  };
}

async function pontuarImagemAmbiente(relativo = "", indice = 0) {
  const absoluto = caminhoAbsolutoAsset(relativo);
  if (!absoluto) return null;

  try {
    const leitura = sharp(absoluto, { failOn: 'none' });
    const metadata = await leitura.metadata();
    const { data, info } = await leitura
      .rotate()
      .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const canais = analisarCanal(data, info);
    const largura = metadata.width || info.width || 1;
    const altura = metadata.height || info.height || 1;
    const proporcao = largura / Math.max(1, altura);

    const bonusHorizontal = proporcao >= 1.05 ? 0.25 : proporcao >= 0.9 ? 0.1 : 0;
    const bonusNaoPrincipal = indice > 0 ? Math.min(0.35, indice * 0.08) : -0.1;
    const penalidadeMuitoBranca = canais.brancos > 0.68 && canais.bordaBranca > 0.82 ? 1.25 : 0;
    const penalidadePackshot = canais.bordaBranca > 0.86 ? 0.8 : 0;

    const score =
      (1 - canais.bordaBranca) * 2.2 +
      (1 - canais.brancos) * 1.2 +
      canais.saturacao * 0.9 +
      clamp((canais.diversidade - 10) / 22, 0, 1) * 0.9 +
      canais.contraste * 1.1 +
      canais.gradiente * 1.0 +
      bonusHorizontal +
      bonusNaoPrincipal -
      penalidadeMuitoBranca -
      penalidadePackshot;

    const candidatoForte = (
      canais.bordaBranca < 0.72 &&
      canais.brancos < 0.58 &&
      canais.diversidade >= 12 &&
      (canais.saturacao >= 0.13 || canais.contraste >= 0.18)
    );

    return {
      relativo,
      absoluto,
      indice,
      score,
      candidatoForte,
      metricas: {
        largura,
        altura,
        proporcao,
        ...canais
      }
    };
  } catch (erro) {
    return null;
  }
}

async function escolherImagemAmbienteLocal(imagens = []) {
  const analises = [];
  for (let i = 0; i < imagens.length; i++) {
    const analise = await pontuarImagemAmbiente(imagens[i], i);
    if (analise) analises.push(analise);
  }

  if (!analises.length) return "";

  const fortes = analises.filter(item => item.candidatoForte).sort((a, b) => b.score - a.score);
  const fracos = analises
    .filter(item => !item.candidatoForte)
    .sort((a, b) => b.score - a.score);

  const escolhido = fortes[0] || fracos[0];
  if (!escolhido) return "";

  const limite = escolhido.candidatoForte ? 1.65 : 2.3;
  if (escolhido.score < limite) return "";

  const ext = extensaoArquivo(escolhido.absoluto);
  const destino = path.join(path.dirname(escolhido.absoluto), `ambiente${ext}`);
  if (destino !== escolhido.absoluto) {
    await fs.copyFile(escolhido.absoluto, destino);
  }
  return `assets/produtos/${nomeSeguro(path.basename(path.dirname(escolhido.absoluto)))}/ambiente${ext}`;
}

function ehObjetoSimples(valor) {
  return Boolean(
    valor &&
    typeof valor === "object" &&
    !Array.isArray(valor)
  );
}

/**
 * Combina dois objetos mantendo a fonte principal.
 *
 * Exemplo:
 * fabricante = { Cor: "Preto", Potência: "" }
 * infoStore  = { Cor: "Grafite", Potência: "3950 W" }
 *
 * resultado  = { Cor: "Preto", Potência: "3950 W" }
 */
function mesclarComPrioridade(principal = {}, apoio = {}) {
  const resultado = {};
  const campos = new Set([
    ...Object.keys(apoio || {}),
    ...Object.keys(principal || {})
  ]);

  for (const campo of campos) {
    const valorPrincipal = principal?.[campo];
    const valorApoio = apoio?.[campo];

    if (
      ehObjetoSimples(valorPrincipal) ||
      ehObjetoSimples(valorApoio)
    ) {
      resultado[campo] = mesclarComPrioridade(
        ehObjetoSimples(valorPrincipal) ? valorPrincipal : {},
        ehObjetoSimples(valorApoio) ? valorApoio : {}
      );

      continue;
    }

    resultado[campo] = valorPreenchido(valorPrincipal)
      ? valorPrincipal
      : valorApoio;
  }

  return resultado;
}


function textoIdentidadePagina(pagina = {}, url = "") {
  return limparTexto([
    pagina?.titulo,
    url
  ].filter(Boolean).join(" ")).toUpperCase();
}

function paginaPareceAcessorio(pagina = {}, url = "") {
  /*
   * Não podemos rejeitar um produto principal apenas porque o título contém
   * palavras como JARRA, FILTRO ou LÂMINA. Ex.:
   *   "Liquidificador Série 5000 Jarra Inquebrável ... RI2242"
   * é um produto principal válido.
   *
   * Peças/acessórios normalmente COMEÇAM pelo nome da peça:
   *   "Faca Preta Liquidificador ..."
   *   "Peneira Castanha ..."
   *   "Copo Acrílico ..."
   */
  const titulo = limparTexto(pagina?.titulo || "").toUpperCase();
  const urlTexto = String(url || "").toUpperCase();

  const inicio = titulo
    .replace(/^PHILIPS\s+WALITA\s+/, "")
    .replace(/^WALITA\s+/, "")
    .trim();

  const termosInicio = [
    "FACA", "PENEIRA", "JARRA", "TAMPA", "FILTRO", "COPO",
    "LAMINA", "LÂMINA", "BICO", "MANGUEIRA", "RESERVATORIO",
    "RESERVATÓRIO", "BANDEJA", "PECA", "PEÇA", "ACESSORIO",
    "ACESSÓRIO", "ACOPLAMENTO", "DISCO", "BATEDOR", "TUBO",
    "PANNARELLO", "ANEL", "VEDACAO", "VEDAÇÃO", "ENGRENAGEM",
    "EIXO", "ESPATULA", "ESPÁTULA", "SUPORTE", "ESCOVA",
    "PORTA FILTRO", "PORTA-FILTRO", "TRAVA", "BORRACHA"
  ];

  const tituloComecaComoPeca = termosInicio.some(termo =>
    inicio === termo ||
    inicio.startsWith(`${termo} `) ||
    inicio.startsWith(`${termo}-`)
  );

  if (tituloComecaComoPeca) return true;

  // Quando não há título útil, o slug da URL ainda pode denunciar uma peça.
  // Aplicamos esta heurística apenas se o título estiver vazio, para não
  // rejeitar um produto principal por palavras existentes em sua URL.
  if (!titulo) {
    const slug = urlTexto.split("/").filter(Boolean).pop() || "";
    return termosInicio.some(termo => {
      const termoSlug = termo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]+/g, "-");
      return slug.startsWith(termoSlug);
    });
  }

  return false;
}

function paginaOficialValidaParaItem(pagina = {}, item = {}) {
  if (!pagina?.titulo && !item?.fonteInterna) return false;
  if (paginaPareceAcessorio(pagina, item.fonteInterna)) return false;

  const identidade = textoIdentidadePagina(pagina, item.fonteInterna);
  const modelo = String(item.modelo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const identidadeCompacta = identidade.replace(/[^A-Z0-9]/g, "");

  const produtoPlanilha = String(item.produto || "").toUpperCase();
  const grupos = [];
  if (/LIQUID/.test(produtoPlanilha)) grupos.push(/LIQUIDIFICADOR|LIQUID/);
  if (/CAFETEIRA/.test(produtoPlanilha)) grupos.push(/CAFETEIRA/);
  if (/AIR\s*FRYER|FRITADEIRA/.test(produtoPlanilha)) grupos.push(/AIR\s*FRYER|AIRFRYER|FRITADEIRA/);
  if (/PROCESSADOR|MLTPROCESSADOR|MULTIPROCESSADOR/.test(produtoPlanilha)) grupos.push(/PROCESSADOR|MULTIPROCESSADOR/);
  if (/FERRO/.test(produtoPlanilha)) grupos.push(/FERRO/);
  if (/ASPIRADOR/.test(produtoPlanilha)) grupos.push(/ASPIRADOR/);
  if (/TORRADEIRA/.test(produtoPlanilha)) grupos.push(/TORRADEIRA/);
  if (/SANDUICHEIRA/.test(produtoPlanilha)) grupos.push(/SANDUICHEIRA/);
  if (/CHALEIRA/.test(produtoPlanilha)) grupos.push(/CHALEIRA/);
  if (/VAPORIZADOR/.test(produtoPlanilha)) grupos.push(/VAPORIZADOR/);
  if (/UMIDIFICADOR/.test(produtoPlanilha)) grupos.push(/UMIDIFICADOR/);

  const modeloBate = modelo && identidadeCompacta.includes(modelo);
  const tipoBate = !grupos.length || grupos.some(re => re.test(identidade));

  return Boolean(modeloBate && tipoBate);
}

function mesclarListas(...listas) {
  const resultado = [];
  const encontrados = new Set();

  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;

    for (const item of lista) {
      const valor = String(item || "").trim();

      if (!valor || encontrados.has(valor)) continue;

      encontrados.add(valor);
      resultado.push(valor);
    }
  }

  return resultado;
}

function mesclarDocumentos(...listas) {
  const resultado = [];
  const encontrados = new Set();

  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;

    for (const documento of lista) {
      const url = String(documento?.url || "").trim();

      if (!url || encontrados.has(url)) continue;

      encontrados.add(url);
      resultado.push(documento);
    }
  }

  return resultado;
}

async function processar(item, indice, total) {
  console.log(`[${indice + 1}/${total}] ${item.modelo}`);

  try {
    // A página da fonte principal pode falhar, bloquear scraping ou vir incompleta.
    // Isso NÃO deve impedir o fallback da Info Store.
    let html = "";
    let erroPaginaPrincipal = "";

    if (item.fonteInterna) {
      try {
        html = await baixarPagina(item.fonteInterna);
      } catch (erro) {
        erroPaginaPrincipal = erro.message;
        console.warn(`Fonte principal (${item.modelo}): ${erro.message}. Tentando extratores/API e Info Store.`);
      }
    }

    const $ = cheerio.load(html || "");
    const estruturado = html ? jsonLd($) : null;

    const fabricante = String(item.fabricante || "");
    const ehElectrolux = /electrolux/i.test(fabricante);
    const ehPortatilComConector = /walita|philips|\bwap\b/i.test(fabricante);
    const fonteEhInfoStore = item.origemFonte === "INFO_STORE";

    /*
     * Extração especializada do fabricante.
     * Atualmente a Electrolux possui um extrator próprio.
     */
    const oficial = !fonteEhInfoStore && ehElectrolux
      ? await extrairProdutoElectrolux($, html, item)
      : !fonteEhInfoStore && ehPortatilComConector
        ? await extrairProdutoPortateis(item)
        : null;

    /*
     * Extração genérica da página oficial.
     * É usada por Samsung, Agratto e demais fabricantes que não tenham
     * um extrator especializado.
     */
    const paginaAtual = {
      titulo: limparTexto(
        estruturado?.name ||
        $('meta[property="og:title"]').attr("content") ||
        $("title").text()
      ),

      descricao: limparTexto(
        estruturado?.description ||
        $('meta[name="description"]').attr("content") ||
        ""
      ),

      urlsImagens: extrairImagens(
        $,
        estruturado,
        item.modelo,
        item.fonteInterna
      ),

      especificacoes: extrairEspecificacoes($),

      dimensoes: extrairDimensoes($),

      documentos: await extrairDocumentosOficiais(
        $,
        html,
        item.fonteInterna,
        item.modelo
      )
    };

    /*
     * Se existir um extrator especializado, ele tem prioridade sobre a
     * extração genérica da mesma página.
     */
    const dadosFabricante = oficial
      ? {
          titulo: oficial.titulo || paginaAtual.titulo,
          descricao: oficial.descricao || paginaAtual.descricao,

          urlsImagens: mesclarListas(
            oficial.urlsImagens,
            paginaAtual.urlsImagens
          ),

          imagemAmbienteUrl: oficial.imagemAmbienteUrl || "",

          especificacoes: mesclarComPrioridade(
            oficial.especificacoes,
            paginaAtual.especificacoes
          ),

          dimensoes: mesclarComPrioridade(
            oficial.dimensoes,
            paginaAtual.dimensoes
          ),

          documentos: mesclarDocumentos(
            oficial.documentos,
            paginaAtual.documentos
          )
        }
      : paginaAtual;

    /*
     * A Info Store passa a ser consultada para TODOS os fabricantes e
     * segmentos. O extrator valida primeiro pelo código Info Store e
     * depois por uma referência exata.
     */
    const apoio = await extrairProdutoInfoStore(item);

    /*
     * Consideramos o fabricante validado quando:
     * 1. O extrator especializado confirmou o produto; ou
     * 2. A localização confirmou o modelo exato; ou
     * 3. A fonte foi marcada como localizada no fabricante.
     */
    /*
     * IMPORTANTE PARA FABRICANTES COM EXTRATOR ESPECIALIZADO:
     *
     * Walita/WAP podem retornar páginas de peças compatíveis com o modelo
     * (faca, peneira, jarra, tubo etc.). Mesmo que localizar-fontes tenha
     * marcado a URL como FABRICANTE/MODELO_VALIDADO, isso NÃO é suficiente
     * para tornar a página confiável.
     *
     * Para esses fabricantes, somente o extrator especializado pode validar
     * o produto principal. Se ele rejeitar ou não localizar o produto, a
     * Info Store pelo Código Info passa a ser a fonte principal.
     */
    const temExtratorEspecializado = ehElectrolux || ehPortatilComConector;

    const paginaOficialValidada =
      !fonteEhInfoStore &&
      item.origemFonte === "FABRICANTE" &&
      paginaOficialValidaParaItem(paginaAtual, item);

    const fabricanteValidado =
      !fonteEhInfoStore &&
      (
        temExtratorEspecializado
          ? (
              (
                oficial?.validadoFabricante === true &&
                oficial?.produtoPrincipalValido !== false
              ) ||
              paginaOficialValidada
            )
          : (
              item.correspondencia === "MODELO_EXATO" ||
              item.correspondencia === "MODELO_VALIDADO" ||
              (
                item.statusFonte === "LOCALIZADO" &&
                item.origemFonte === "FABRICANTE"
              )
            )
      );

    /*
     * Regra final:
     *
     * FABRICANTE VALIDADO:
     * fabricante é principal e Info Store preenche lacunas.
     *
     * FABRICANTE NÃO VALIDADO:
     * Info Store é principal, desde que tenha localizado o código ou
     * a referência exata.
     */
    const infoStoreExata = apoio?.codigoInfoValidado === true;

    if (process.env.TESTAR_CODIGOS) {
      console.log(
        `[${item.codigo || item.modelo}] fonte=${item.origemFonte || "-"} ` +
        `especializado=${temExtratorEspecializado} ` +
        `oficialValidado=${oficial?.validadoFabricante === true} ` +
        `paginaOficialValidada=${paginaOficialValidada} ` +
        `fabricanteValidado=${fabricanteValidado} ` +
        `infoStoreExata=${infoStoreExata}`
      );
    }

    // Se o fabricante devolveu uma peça/acessório, a correspondência exata
    // pelo Código Info Store passa a ser a âncora de identidade do produto.
    const dadosFabricanteValidados =
      paginaOficialValidada && !(oficial?.validadoFabricante === true)
        ? paginaAtual
        : dadosFabricante;

    const principal = fabricanteValidado
      ? dadosFabricanteValidados
      : (infoStoreExata ? apoio : (apoio || dadosFabricanteValidados));

    const secundario = fabricanteValidado
      ? apoio
      : (infoStoreExata ? null : dadosFabricanteValidados);

    const extraido = {
      titulo:
        principal?.titulo ||
        secundario?.titulo ||
        "",

      descricao:
        principal?.descricao ||
        secundario?.descricao ||
        "",

      /*
       * Fabricante aparece primeiro na galeria.
       * A Info Store complementa até o máximo de oito imagens.
       */
      // Mantemos candidatos extras: se as URLs oficiais falharem ao baixar,
      // ainda chegaremos às imagens da Info Store.
      urlsImagens: mesclarListas(
        principal?.urlsImagens,
        secundario?.urlsImagens
      ).slice(0, 20),

      imagemAmbienteUrl:
        principal?.imagemAmbienteUrl ||
        secundario?.imagemAmbienteUrl ||
        "",

      /*
       * A fonte principal prevalece campo por campo.
       * A secundária somente preenche os campos vazios.
       */
      especificacoes: mesclarComPrioridade(
        principal?.especificacoes,
        secundario?.especificacoes
      ),

      dimensoes: mesclarComPrioridade(
        principal?.dimensoes,
        secundario?.dimensoes
      ),

      /*
       * Documentos oficiais do fabricante aparecem primeiro.
       */
      documentos: mesclarDocumentos(
        dadosFabricante?.documentos,
        apoio?.documentos
      ),

      fonteApoio: apoio?.fonteApoio || "",

      origemDados: fabricanteValidado
        ? apoio
          ? "FABRICANTE_COM_COMPLEMENTO_INFO_STORE"
          : "FABRICANTE"
        : apoio
          ? "INFO_STORE"
          : item.origemFonte || "NAO_IDENTIFICADA",

      correspondenciaInfoStore:
        apoio?.correspondencia || "",

      codigoInfoValidado:
        apoio?.codigoInfoValidado === true
    };
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
      if (imagens.length >= 8) break;

      try {
        const imagemLocal = await baixarImagem(urlsImagens[i], item.modelo, imagens.length);
        if (imagemLocal) imagens.push(imagemLocal);
      } catch (erro) {
        errosImagens.push(erro.message);
      }
    }

    const imagem = imagens[0] || "";
    let imagemAmbiente = "";

    if (extraido?.imagemAmbienteUrl) {
      try {
        imagemAmbiente = await baixarImagem(extraido.imagemAmbienteUrl, item.modelo, 0, "ambiente");
      } catch (erro) {
        errosImagens.push(`Ambiente: ${erro.message}`);
      }
    }

    if (!imagemAmbiente && ehPortatilItem(item) && imagens.length) {
      try {
        imagemAmbiente = await escolherImagemAmbienteLocal(imagens);
      } catch (erro) {
        errosImagens.push(`Ambiente automático: ${erro.message}`);
      }
    }

    const pendencias = [
      ...(!imagem ? ["Imagem não extraída"] : []),
      ...(!Object.keys(dimensoes).length ? ["Dimensões não extraídas"] : []),
      ...(!Object.keys(especificacoes).length ? ["Especificações não extraídas"] : []),
      ...(erroPaginaPrincipal && !imagem ? [`Fonte principal indisponível: ${erroPaginaPrincipal}`] : []),
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
      fonteApoio: extraido?.fonteApoio || "",
      dataConsulta: new Date().toISOString()
    };
  } catch (erro) {
    return { modelo: item.modelo, codigo: item.codigo, produtoPlanilha: item.produto, statusExtracao: "ERRO", pendencias: [erro.message], fonteInterna: item.fonteInterna, dataConsulta: new Date().toISOString() };
  }
}

function chaveIdentidade(item = {}) {
  return String(item.codigo || item.modelo || "").trim().toUpperCase();
}

async function executar() {
  await fs.mkdir(pastaImagens, { recursive: true });
  const fontes = JSON.parse(await fs.readFile(caminhoFontes, "utf8"));

  let anteriores = [];
  try { anteriores = JSON.parse(await fs.readFile(caminhoSaida, "utf8")); } catch {}

  const anterioresPorCodigo = new Map(
    anteriores.map(item => [chaveIdentidade(item), item])
  );

  const forcar = process.env.FORCAR_ATUALIZACAO === "1";
  const forcarPortateis = process.env.FORCAR_PORTATEIS === "1";
  const testarCodigos = new Set(
    String(process.env.TESTAR_CODIGOS || "")
      .split(",")
      .map(valor => valor.trim().toUpperCase())
      .filter(Boolean)
  );

  const confirmados = fontes.filter(item => {
    if (ehClimatizacao(item) || item.fluxo === "CLIMATIZACAO") return false;

    const codigoAtual = String(item.codigo || "").trim().toUpperCase();
    const emTeste = testarCodigos.size && testarCodigos.has(codigoAtual);
    const portatilForcado = forcarPortateis && ehPortatilItem(item);

    if (forcarPortateis && !ehPortatilItem(item)) return false;
    if (testarCodigos.size && !emTeste) return false;

    /*
     * Em modo forçado/teste, portáteis precisam ser processados mesmo quando
     * localizar-fontes marcou NAO_LOCALIZADO. processar() consulta a Info Store
     * diretamente pelo Código Info e pode recuperar o produto correto.
     * Isso também impede que um enriquecimento antigo (ex.: faca/peneira)
     * permaneça eternamente só porque a nova localização falhou.
     */
    if (item.statusFonte !== "LOCALIZADO" && !portatilForcado && !emTeste) return false;

    if (forcar || portatilForcado || emTeste) return true;

    const anterior = anterioresPorCodigo.get(chaveIdentidade(item));
    if (!anterior) return true;

    // Se o código é o mesmo, mas o modelo mudou (ex.: EAN -> EP1220),
    // reprocessa automaticamente mesmo sem modo FORCE.
    return nomeSeguro(anterior.modelo) !== nomeSeguro(item.modelo);
  });

  if (testarCodigos.size) {
    console.log(`Modo de teste ativo: ${[...testarCodigos].join(", ")}`);
  }
  console.log(`Modelos para enriquecer: ${confirmados.length}`);

  const resultadosNovos = [];
  for (let i = 0; i < confirmados.length; i++) {
    resultadosNovos.push(await processar(confirmados[i], i, confirmados.length));
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Também substitui por Código Info Store para eliminar registros antigos
  // associados ao mesmo SKU, mas com EAN/modelo incorreto.
  const chavesNovas = new Set(resultadosNovos.map(chaveIdentidade));
  const resultados = [
    ...anteriores.filter(item => !chavesNovas.has(chaveIdentidade(item))),
    ...resultadosNovos
  ];

  await fs.writeFile(caminhoSaida, JSON.stringify(resultados, null, 2), "utf8");
  console.log("\nExtração concluída.");
  console.log(`Extraídos: ${resultados.filter(item => item.statusExtracao === "EXTRAIDO").length}`);
  console.log(`Revisar: ${resultados.filter(item => item.statusExtracao === "REVISAR").length}`);
  console.log(`Erros: ${resultados.filter(item => item.statusExtracao === "ERRO").length}`);
}

executar().catch(erro => { console.error("Erro geral:", erro.message); process.exitCode = 1; });
