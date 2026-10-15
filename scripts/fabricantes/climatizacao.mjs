const CONFIG = {
  AGRATTO: {
    base: "https://www.agratto.com.br",
    sitemap: "https://www.agratto.com.br/sitemap.xml"
  },
  MIDEA: {
    base: "https://www.midea.com.br"
  }
};

const cacheSitemaps = new Map();

const limpar = (valor = "") => String(valor).replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
const chave = (valor = "") => String(valor).toUpperCase().replace(/[^A-Z0-9]/g, "");

export function variantesModelo(valor = "") {
  const bruto = String(valor).toUpperCase().trim();
  const partes = bruto.split(/[\/+×]/).filter(Boolean);
  const variantes = new Set([chave(bruto), ...partes.map(chave)]);

  for (const item of [...variantes]) {
    // Alguns cadastros de climatização unem evaporadora, condensadora e
    // capacidade. Ex.: LCST9F-02I-9KBTU -> LCST9F02.
    variantes.add(item.replace(/(?:I|E)?(?:9|12|18|22|24|30|36|48|54|55|60)KBTU$/i, ""));
    variantes.add(item.replace(/(?:I|E)$/i, ""));
  }

  return [...variantes]
    .map(chave)
    .filter(valorNormalizado => valorNormalizado.length >= 6)
    .sort((a, b) => b.length - a.length);
}

function referenciasVtex(produto = {}) {
  const valores = [
    produto.productReference,
    produto.productName,
    produto.productTitle,
    produto.linkText,
    produto.description
  ];

  for (const sku of produto.items || []) {
    valores.push(sku.itemId, sku.name, sku.nameComplete);
    for (const referencia of sku.referenceId || []) {
      valores.push(referencia?.Value, referencia?.Key);
    }
  }

  return chave(valores.filter(Boolean).join(" "));
}

function linkVtex(base, produto = {}) {
  if (!produto || typeof produto !== "object") return "";
  if (produto.link && /\/p(?:\?|$)/i.test(produto.link)) return produto.link;
  return produto.linkText
    ? `${base}/${String(produto.linkText).replace(/^\/+/, "")}/p`
    : "";
}

async function consultarVtex(base, termo) {
  const resposta = await fetch(
    `${base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}`,
    {
      signal: AbortSignal.timeout(45000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 CatalogoClubOne/5.0"
      }
    }
  );

  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const dados = await resposta.json();
  return Array.isArray(dados) ? dados : [];
}

async function produtoMidea(item = {}) {
  const termos = variantesModelo(item.modelo);
  const nome = String(item.produto || "").toUpperCase();
  const capacidadeBruta = nome.match(/(\d{4,5})\s*BTU/)?.[1] || "";
  const capacidade = capacidadeBruta || (nome.match(/(9|12|18|22|24|30|36|48|54|55|60)\s*KBTU/)?.[1]
    ? `${nome.match(/(9|12|18|22|24|30|36|48|54|55|60)\s*KBTU/)?.[1]}000`
    : "");
  const familia = ["ECOMASTER", "AIRVOLUTION", "CASSETE", "PISO TETO"]
    .find(valor => nome.replace(/-/g, " ").includes(valor)) || "";
  const termosBusca = [...new Set([
    ...termos,
    [familia, capacidade].filter(Boolean).join(" "),
    capacidade && familia === "CASSETE" ? `cassete ${capacidade}` : "",
    capacidade && familia === "PISO TETO" ? `piso teto ${capacidade}` : ""
  ].filter(Boolean))];
  const alternativas = [];

  for (const termo of termosBusca) {
    const resultados = await consultarVtex(CONFIG.MIDEA.base, termo);

    for (const produto of resultados) {
      const url = linkVtex(CONFIG.MIDEA.base, produto);
      if (url && !alternativas.includes(url)) alternativas.push(url);
    }

    const exato = resultados.find(produto => {
      const referencias = referenciasVtex(produto);
      return termos.some(modelo => referencias.includes(modelo));
    });

    if (exato) return { produto: exato, alternativas, termo };
  }

  return { produto: null, alternativas, termo: "" };
}

function extrairLocs(xml = "") {
  return [...String(xml).matchAll(/<loc>(.*?)<\/loc>/gis)]
    .map(item => limpar(item[1]))
    .filter(Boolean);
}

async function baixarTexto(url) {
  const resposta = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    headers: {
      Accept: "application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 CatalogoClubOne/5.0"
    }
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.text();
}

async function paginasAgratto() {
  if (cacheSitemaps.has(CONFIG.AGRATTO.sitemap)) {
    return cacheSitemaps.get(CONFIG.AGRATTO.sitemap);
  }

  const fila = [CONFIG.AGRATTO.sitemap];
  const visitados = new Set();
  const paginas = new Set();

  while (fila.length && visitados.size < 30) {
    const atual = fila.shift();
    if (!atual || visitados.has(atual)) continue;
    visitados.add(atual);

    const conteudo = await baixarTexto(atual);
    for (const url of extrairLocs(conteudo)) {
      if (/\.xml(?:\.gz)?(?:$|\?)/i.test(url)) fila.push(url);
      else paginas.add(url);
    }
  }

  const resultado = [...paginas];
  cacheSitemaps.set(CONFIG.AGRATTO.sitemap, resultado);
  return resultado;
}

function pontuarAgratto(url, item = {}) {
  const urlNormalizada = chave(decodeURIComponent(url));
  const modelos = variantesModelo(item.modelo);
  const capacidade = String(item.produto || "").match(/(9|12|18|22|24|30|36|48|54|55|60)\s*0{3}\s*BTU/i)?.[1]
    || String(item.produto || "").match(/(9|12|18|22|24|30|36|48|54|55|60)\s*K?BTU/i)?.[1]
    || "";
  let pontos = 0;

  if (modelos.some(modelo => urlNormalizada.includes(modelo))) pontos += 200;
  if (capacidade && urlNormalizada.includes(`${capacidade}KBTU`)) pontos += 20;
  if (/ARCONDICIONADO/i.test(urlNormalizada)) pontos += 15;
  if (/MANUAL|ASSISTENCIA|CATEGORIA|BUSCA/i.test(urlNormalizada)) pontos -= 100;
  return pontos;
}

export async function localizarFonteClimatizacao(item = {}) {
  const fabricante = chave(item.fabricante);

  if (fabricante.includes("MIDEA")) {
    try {
      const localizado = await produtoMidea(item);
      const url = linkVtex(CONFIG.MIDEA.base, localizado.produto);
      if (url) {
        return {
          status: "LOCALIZADO",
          url,
          alternativas: localizado.alternativas,
          origemFonte: "FABRICANTE",
          correspondencia: "MODELO_EXATO"
        };
      }
      return localizado.alternativas.length
        ? { status: "REVISAR", url: localizado.alternativas[0], alternativas: localizado.alternativas, origemFonte: "FABRICANTE" }
        : { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
    } catch (erro) {
      console.warn(`Midea (${item.modelo}): ${erro.message}`);
      return { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
    }
  }

  if (fabricante.includes("AGRATTO")) {
    try {
      const paginas = await paginasAgratto();
      const candidatas = paginas
        .map(url => ({ url, pontos: pontuarAgratto(url, item) }))
        .filter(itemPontuado => itemPontuado.pontos > 0)
        .sort((a, b) => b.pontos - a.pontos);
      const melhor = candidatas[0];
      if (melhor?.pontos >= 200) {
        return {
          status: "LOCALIZADO",
          url: melhor.url,
          alternativas: candidatas.slice(0, 10).map(candidata => candidata.url),
          origemFonte: "FABRICANTE",
          correspondencia: "MODELO_EXATO"
        };
      }
      return melhor
        ? { status: "REVISAR", url: melhor.url, alternativas: candidatas.slice(0, 10).map(candidata => candidata.url), origemFonte: "FABRICANTE" }
        : { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
    } catch (erro) {
      console.warn(`Agratto (${item.modelo}): ${erro.message}`);
      return { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
    }
  }

  return { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
}

function primeiro(produto, nomes) {
  for (const nome of nomes) {
    const valor = Array.isArray(produto?.[nome]) ? produto[nome][0] : produto?.[nome];
    if (limpar(valor)) return limpar(valor);
  }
  return "";
}

function mm(valor = "") {
  const resultado = String(valor).match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/i);
  if (!resultado) return "";
  const numero = Number(resultado[1].replace(",", "."));
  const unidade = (resultado[2] || "cm").toLowerCase();
  const convertido = numero * (unidade === "m" ? 1000 : unidade === "cm" ? 10 : 1);
  return `${String(convertido).replace(/\.0+$/, "")} mm`;
}

function imagensVtex(produto = {}) {
  const imagens = [];
  for (const sku of produto.items || []) {
    for (const imagem of sku.images || []) {
      if (imagem.imageUrl && !imagens.includes(imagem.imageUrl)) imagens.push(imagem.imageUrl);
    }
  }
  return imagens.slice(0, 5);
}

function especificacoesMidea(produto = {}) {
  const campos = [
    ["Capacidade", ["Capacidade", "Capacidade BTU", "Capacidade (BTU/h)"]],
    ["Ciclo", ["Ciclo", "Modelo Frio"]],
    ["Voltagem", ["Voltagem", "Tensão"]],
    ["Cor", ["Cor"]],
    ["Tecnologia", ["Tecnologia", "Compressor"]],
    ["Classificação energética", ["Classificação Energética", "Classificação energética"]],
    ["Produto conectado", ["Produto conectado", "Wi-Fi"]],
    ["Inteligência artificial", ["Inteligência artificial"]],
    ["Gás refrigerante", ["Gás refrigerante", "Fluido refrigerante"]],
    ["Consumo de energia", ["Consumo de Energia kWh/ano", "Consumo de energia"]],
    ["Vazão de ar", ["Vazão de ar (m³/h)", "Vazão de ar"]],
    ["Nível de ruído", ["Nível de ruído", "Ruído"]]
  ];
  return Object.fromEntries(
    campos.map(([nome, nomes]) => [nome, primeiro(produto, nomes)]).filter(([, valor]) => valor)
  );
}

function dimensoesMidea(produto = {}) {
  const largura = mm(primeiro(produto, ["Largura do produto", "Largura"]));
  const altura = mm(primeiro(produto, ["Altura do produto", "Altura"]));
  const profundidade = mm(primeiro(produto, ["Profundidade do produto", "Profundidade", "Comprimento"]));
  return largura || altura || profundidade
    ? { produto: { largura, altura, profundidade } }
    : {};
}

function documentosMidea(produto = {}) {
  const url = primeiro(produto, ["Manual do Produto", "Manual do produto", "Manual"]);
  return /^https?:\/\//i.test(url)
    ? [{ tipo: "manual", nome: "Manual do produto", descricao: "Documento oficial Midea", url, fonte: "Midea" }]
    : [];
}

export async function extrairProdutoMidea(item = {}) {
  try {
    const localizado = await produtoMidea(item);
    const produto = localizado.produto;
    if (!produto) return null;

    return {
      validadoFabricante: true,
      titulo: limpar(produto.productName || produto.productTitle),
      descricao: limpar(produto.description),
      urlsImagens: imagensVtex(produto),
      especificacoes: especificacoesMidea(produto),
      dimensoes: dimensoesMidea(produto),
      documentos: documentosMidea(produto),
      fonteApoio: linkVtex(CONFIG.MIDEA.base, produto)
    };
  } catch (erro) {
    console.warn(`Extração Midea (${item.modelo}): ${erro.message}`);
    return null;
  }
}
