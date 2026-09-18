const BASE = "https://www.infostore.com.br";

const limpar = (valor = "") => String(valor).replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
const chave = (valor = "") => String(valor).toUpperCase().replace(/[^A-Z0-9]/g, "");

function tokensComerciais(item = {}) {
  const ignorar = new Set(["ELECTROLUX", "LINHA", "BRANCA", "PRE", "BRA", "CIN", "BIVOLT", "EMBUT", "TOUCH", "SERIES"]);
  return [...new Set((`${item.produto || ""} ${item.modelo || ""}`.toUpperCase().match(/[A-Z0-9]*[A-Z][A-Z0-9-]*\d[A-Z0-9-]*|\d+[A-Z][A-Z0-9-]*/g) || [])
    .map(chave)
    .filter(valor => valor.length >= 3 && !ignorar.has(valor) && valor !== chave(item.codigo)))];
}

function referencias(produto = {}) {
  const valores = [produto.productReference, produto.productName, produto.productTitle, produto.linkText, produto.description];
  for (const sku of produto.items || []) {
    valores.push(sku.itemId, sku.name, sku.nameComplete);
    for (const ref of sku.referenceId || []) valores.push(ref?.Value, ref?.Key);
  }
  return [...new Set(valores.filter(Boolean).map(chave).filter(Boolean))];
}

function link(produto = {}) {
  if (produto.link && /\/p(?:\?|$)/i.test(produto.link)) return produto.link;
  return produto.linkText ? `${BASE}/${String(produto.linkText).replace(/^\/+/, "")}/p` : "";
}

async function consultar(termo) {
  const resposta = await fetch(`${BASE}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}`, {
    signal: AbortSignal.timeout(45000),
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 CatalogoClubOne/4.0" }
  });
  if (!resposta.ok) throw new Error(`Info Store retornou HTTP ${resposta.status}`);
  const dados = await resposta.json();
  return Array.isArray(dados) ? dados : [];
}

function termos(item = {}) {
  return [...new Set([item.codigo, item.modelo, ...tokensComerciais(item)].map(chave).filter(Boolean))];
}

async function localizarProduto(item = {}) {
  const procurados = termos(item);
  const codigoInfo = chave(item.codigo);

  for (const termo of procurados) {
    const resultados = await consultar(termo);
    const validos = resultados.filter(produto => !/garantia-estendida/i.test(link(produto)));

    // O código interno da Info Store é a chave mais confiável. Quando ele existe,
    // nenhum resultado aproximado por nome ou modelo pode substituí-lo.
    if (codigoInfo) {
      const porCodigo = validos.find(produto => referencias(produto).includes(codigoInfo));
      if (porCodigo) return { produto: porCodigo, correspondencia: "CODIGO_INFO" };
      if (termo === codigoInfo) continue;
    }

    const exato = validos.find(produto => {
      if (/garantia-estendida/i.test(link(produto))) return false;
      const refs = referencias(produto);
      return procurados.some(valor => valor.length >= 3 && refs.includes(valor));
    });
    if (exato) return { produto: exato, correspondencia: "REFERENCIA_EXATA" };
  }

  // Não devolve o primeiro resultado da busca: isso era o que permitia misturar
  // imagens de produtos visualmente parecidos, mas com referências diferentes.
  return null;
}

export async function localizarFonteInfoStore(item = {}) {
  try {
    const localizado = await localizarProduto(item);
    const produto = localizado?.produto;
    const url = link(produto);
    return url ? { status: "LOCALIZADO", url, alternativas: [url], origemFonte: "INFO_STORE", correspondencia: localizado.correspondencia }
      : { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
  } catch (erro) {
    console.warn(`Info Store (${item.modelo || item.codigo}): ${erro.message}`);
    return { status: "NAO_LOCALIZADO", url: "", alternativas: [], origemFonte: "" };
  }
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
  return `${numero * (unidade === "m" ? 1000 : unidade === "cm" ? 10 : 1)} mm`;
}

export async function extrairProdutoInfoStore(item = {}) {
  try {
    const localizado = await localizarProduto(item);
    const produto = localizado?.produto;
    if (!produto) return null;
    const urlsImagens = [];
    for (const sku of produto.items || []) for (const imagem of sku.images || []) {
      if (imagem.imageUrl && !urlsImagens.includes(imagem.imageUrl)) urlsImagens.push(imagem.imageUrl);
    }
    const especificacoes = Object.fromEntries([
      ["Capacidade total", primeiro(produto, ["Capacidade", "Capacidade Total"])],
      ["Capacidade de lavagem", primeiro(produto, ["Capacidade de lavagem"])],
      ["Serviços", primeiro(produto, ["Quantidade de serviços"])],
      ["Voltagem", primeiro(produto, ["Voltagem", "Tensão"])],
      ["Cor", primeiro(produto, ["Cor"])],
      ["Tecnologia", primeiro(produto, ["Tecnologia"])],
      ["Eficiência energética", primeiro(produto, ["Classificação energética", "Eficiência energética"])],
      ["Peso líquido", primeiro(produto, ["Peso do produto", "Peso", "Peso líquido"])]
    ].filter(([, valor]) => valor));
    const largura = mm(primeiro(produto, ["Largura do produto", "Largura"]));
    const altura = mm(primeiro(produto, ["Altura do produto", "Altura"]));
    const profundidade = mm(primeiro(produto, ["Profundidade do produto", "Profundidade"]));
    return {
      titulo: limpar(produto.productName || produto.productTitle),
      descricao: limpar(produto.description),
      urlsImagens: urlsImagens.slice(0, 5),
      especificacoes,
      dimensoes: largura || altura || profundidade ? { produto: { largura, altura, profundidade } } : {},
      documentos: [],
      fonteApoio: link(produto),
      correspondencia: localizado.correspondencia,
      codigoInfoValidado: localizado.correspondencia === "CODIGO_INFO"
    };
  } catch (erro) {
    console.warn(`Apoio Info Store (${item.modelo}): ${erro.message}`);
    return null;
  }
}
