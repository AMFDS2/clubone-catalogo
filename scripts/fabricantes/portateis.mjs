const LOJAS = {
  WALITA: { base: "https://www.walita.com.br", nome: "Philips Walita" },
  WAP: { base: "https://loja.wap.ind.br", nome: "WAP" }
};

const limpar = (valor = "") => String(valor).replaceAll("&amp;", "&").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const chave = (valor = "") => String(valor).toUpperCase().replace(/[^A-Z0-9]/g, "");

function configuracao(item = {}) {
  const fabricante = chave(item.fabricante);
  if (fabricante.includes("WALITA") || fabricante.includes("PHILIPS")) return LOJAS.WALITA;
  if (fabricante.includes("WAP")) return LOJAS.WAP;
  return null;
}

function referencias(produto = {}) {
  const valores = [produto.productReference, produto.productName, produto.productTitle, produto.linkText, produto.description];
  for (const sku of produto.items || []) {
    valores.push(sku.itemId, sku.name, sku.nameComplete);
    for (const ref of sku.referenceId || []) valores.push(ref?.Value, ref?.Key);
  }
  return valores.filter(Boolean).map(chave);
}

function modeloBase(item = {}) {
  const informado = String(item.modelo || "").split("/")[0];
  if (/[A-Z]/i.test(informado) && /\d/.test(informado)) return chave(informado);
  const encontrados = String(item.produto || "").toUpperCase().match(/\b[A-Z]{2,4}\d{2,6}\b/g) || [];
  return chave(encontrados.find(valor => !/^(PRE|BRA|INO|BIV|W)$/.test(valor)) || informado);
}

async function consultar(base, termo) {
  const resposta = await fetch(`${base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}`, {
    signal: AbortSignal.timeout(45000),
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 CatalogoClubOne/5.0" }
  });
  if (!resposta.ok) throw new Error(`Fabricante retornou HTTP ${resposta.status}`);
  const dados = await resposta.json();
  return Array.isArray(dados) ? dados : [];
}

async function localizarProduto(item = {}) {
  const config = configuracao(item);
  if (!config) return null;
  const modelo = modeloBase(item);
  if (!modelo) return null;
  const resultados = await consultar(config.base, modelo);
  const produto = resultados.find(resultado => referencias(resultado).some(ref => ref.includes(modelo)));
  return produto ? { produto, config, modelo } : null;
}

function link(base, produto = {}) {
  if (produto.link && /\/p(?:\?|$)/i.test(produto.link)) return produto.link;
  return produto.linkText ? `${base}/${String(produto.linkText).replace(/^\/+/, "")}/p` : "";
}

function primeiro(produto, nomes) {
  for (const nome of nomes) {
    const entrada = Object.entries(produto || {}).find(([campo]) => chave(campo) === chave(nome));
    const valor = Array.isArray(entrada?.[1]) ? entrada[1][0] : entrada?.[1];
    if (limpar(valor)) return limpar(valor);
  }
  return "";
}

function mm(valor = "") {
  const resultado = String(valor).match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/i);
  if (!resultado) return "";
  const numero = Number(resultado[1].replace(",", "."));
  const unidade = (resultado[2] || "cm").toLowerCase();
  return `${Math.round(numero * (unidade === "m" ? 1000 : unidade === "cm" ? 10 : 1) * 10) / 10} mm`;
}

function documentosOficiais(produto = {}, fabricante = "Fabricante") {
  const encontrados = new Set();
  const visitar = valor => {
    if (typeof valor === "string") {
      for (const url of valor.match(/https?:\/\/[^\s"'<>]+?\.pdf(?:\?[^\s"'<>]*)?/gi) || []) encontrados.add(url.replaceAll("&amp;", "&"));
      return;
    }
    if (Array.isArray(valor)) return valor.forEach(visitar);
    if (valor && typeof valor === "object") Object.values(valor).forEach(visitar);
  };
  visitar(produto);
  return [...encontrados].map(url => ({
    tipo: /instal|installation/i.test(url) ? "instalacao" : "manual",
    nome: /instal|installation/i.test(url) ? "Guia de instalação" : "Manual do usuário",
    descricao: `Documento oficial ${fabricante}`,
    url,
    fonte: fabricante
  }));
}

export async function localizarFontePortateis(item = {}) {
  try {
    const localizado = await localizarProduto(item);
    const url = localizado ? link(localizado.config.base, localizado.produto) : "";
    return url
      ? { status: "LOCALIZADO", url, alternativas: [url], origemFonte: "FABRICANTE", correspondencia: "MODELO_EXATO" }
      : { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
  } catch (erro) {
    console.warn(`Fabricante portátil (${item.modelo}): ${erro.message}`);
    return { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
  }
}

export async function extrairProdutoPortateis(item = {}) {
  try {
    const localizado = await localizarProduto(item);
    if (!localizado) return null;
    const { produto, config } = localizado;
    const urlsImagens = [];
    let imagemAmbienteUrl = "";
    for (const sku of produto.items || []) for (const imagem of sku.images || []) {
      if (imagem.imageUrl && !urlsImagens.includes(imagem.imageUrl)) urlsImagens.push(imagem.imageUrl);

      const contextoImagem = limpar([
        imagem.imageLabel,
        imagem.imageText,
        imagem.imageTag,
        imagem.imageUrl
      ].filter(Boolean).join(" ")).toLowerCase();

      if (
        !imagemAmbienteUrl &&
        imagem.imageUrl &&
        /ambiente|ambientada|lifestyle|lifestyle|cozinha|bancada|uso|contexto|room|kitchen/.test(contextoImagem)
      ) {
        imagemAmbienteUrl = imagem.imageUrl;
      }
    }
    const especificacoes = Object.fromEntries([
      ["Potência", primeiro(produto, ["Potência", "Potência do motor"])],
      ["Capacidade", primeiro(produto, ["Capacidade", "Capacidade total", "Volume"])],
      ["Voltagem", primeiro(produto, ["Voltagem", "Tensão"])],
      ["Cor", primeiro(produto, ["Cor", "Cor do produto"])],
      ["Velocidades", primeiro(produto, ["Velocidades", "Número de velocidades"])],
      ["Timer", primeiro(produto, ["Timer", "Temporizador"])],
      ["Temperatura", primeiro(produto, ["Temperatura", "Controle de temperatura"])],
      ["Peso líquido", primeiro(produto, ["Peso líquido", "Peso do produto", "Peso"])],
      ["Garantia", primeiro(produto, ["Garantia"])],
      ["Acessórios", primeiro(produto, ["Acessórios", "Acessórios inclusos"])]
    ].filter(([, valor]) => valor));
    const largura = mm(primeiro(produto, ["Largura do produto", "Largura"]));
    const altura = mm(primeiro(produto, ["Altura do produto", "Altura"]));
    const profundidade = mm(primeiro(produto, ["Profundidade do produto", "Comprimento do produto", "Profundidade", "Comprimento"]));
    return {
      titulo: limpar(produto.productName || produto.productTitle),
      descricao: limpar(produto.description),
      urlsImagens: urlsImagens.slice(0, 8),
      imagemAmbienteUrl,
      especificacoes,
      dimensoes: largura || altura || profundidade ? { produto: { largura, altura, profundidade } } : {},
      documentos: documentosOficiais(produto, config.nome),
      validadoFabricante: true,
      fonteFabricante: link(config.base, produto),
      fabricanteOficial: config.nome
    };
  } catch (erro) {
    console.warn(`Extração portátil (${item.modelo}): ${erro.message}`);
    return null;
  }
}
