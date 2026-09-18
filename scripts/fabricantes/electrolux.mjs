const BASE = "https://loja.electrolux.com.br";

const limpar = (v = "") => String(v).replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
const chave = (v = "") => String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");

function codigoComercial(item = {}) {
  const ignorar = new Set(["ELECTROLUX", "NAC", "LINHA", "BRANCA", "PRE", "BRA", "CIN", "BIVOLT", "EMBUT"]);
  const candidatos = String(item.produto || "").toUpperCase()
    .match(/[A-Z0-9]*[A-Z][A-Z0-9-]*\d[A-Z0-9-]*|\d+[A-Z][A-Z0-9-]*/g) || [];
  return candidatos.map(chave)
    .find(valor => valor.length >= 3 && !ignorar.has(valor) && valor !== chave(item.codigo)) || "";
}

function referencias(produto = {}) {
  const valores = [produto.productReference, produto.productName, produto.productTitle, produto.linkText];
  for (const sku of produto.items || []) {
    valores.push(sku.itemId, sku.name, sku.nameComplete);
    for (const ref of sku.referenceId || []) valores.push(ref?.Value, ref?.Key);
  }
  return chave(valores.filter(Boolean).join(" "));
}

function link(produto = {}) {
  if (produto.link && /\/p(?:\?|$)/i.test(produto.link)) return produto.link;
  return produto.linkText ? `${BASE}/${String(produto.linkText).replace(/^\/+/, "")}/p` : "";
}

async function consultar(termo) {
  const resposta = await fetch(`${BASE}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}`, {
    signal: AbortSignal.timeout(45000),
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 CatalogoClubOne/3.0" }
  });
  if (!resposta.ok) throw new Error(`Electrolux retornou HTTP ${resposta.status}`);
  const dados = await resposta.json();
  return Array.isArray(dados) ? dados : [];
}

export async function localizarFonteElectrolux(item = {}) {
  const modelo = chave(item.modelo);
  const comercial = codigoComercial(item);
  const alternativas = [];
  for (const termo of [...new Set([modelo, comercial].filter(Boolean))]) {
    try {
      const resultados = await consultar(termo);
      for (const produto of resultados) {
        const url = link(produto);
        if (url && !/garantia-estendida/i.test(url) && !alternativas.includes(url)) alternativas.push(url);
      }
      const exato = resultados.find(produto => {
        const refs = referencias(produto);
        return !/garantia-estendida/i.test(link(produto)) &&
          ((modelo && refs.includes(modelo)) || (comercial && refs.includes(chave(comercial))));
      });
      const url = link(exato);
      if (url) return { status: "LOCALIZADO", url, alternativas };
    } catch (erro) { console.warn(`Electrolux (${termo}): ${erro.message}`); }
  }
  return alternativas.length
    ? { status: "REVISAR", url: alternativas[0], alternativas }
    : { status: "NAO_LOCALIZADO", url: "", alternativas };
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

function imagens(produto = {}) {
  const lista = [];
  for (const sku of produto.items || []) for (const imagem of sku.images || []) {
    if (imagem.imageUrl && !lista.includes(imagem.imageUrl)) lista.push(imagem.imageUrl);
  }
  return lista.slice(0, 5);
}

function documento(produto = {}) {
  const url = primeiro(produto, ["Manual do produto", "Manual"]);
  if (!/\.pdf(?:$|[?#])/i.test(url)) return [];
  return [{ tipo: "manual", nome: "Manual do usuário", descricao: "Documento oficial Electrolux", url, fonte: "Electrolux" }];
}

function especificacoes(produto = {}) {
  const mapa = [
    ["Capacidade total", ["Capacidade", "Capacidade Total"]],
    ["Capacidade de lavagem", ["Capacidade de lavagem"]],
    ["Serviços", ["Quantidade de serviços"]],
    ["Voltagem", ["Voltagem"]], ["Cor", ["Cor"]],
    ["Frost Free", ["Frost Free"]], ["Tecnologia", ["Tecnologia"]],
    ["Eficiência energética", ["Classificação energética", "Eficiência energética"]],
    ["Peso líquido", ["Peso do produto", "Peso"]]
  ];
  return Object.fromEntries(mapa.map(([nome, campos]) => [nome, primeiro(produto, campos)]).filter(([, valor]) => valor));
}

export async function extrairProdutoElectrolux($, html = "", item = {}) {
  const comercial = codigoComercial(item);
  const resultados = comercial ? await consultar(comercial) : [];
  const produto = resultados.find(p => !/garantia-estendida/i.test(link(p)) && referencias(p).includes(chave(comercial))) || {};
  const largura = mm(primeiro(produto, ["Largura do produto", "Largura"]));
  const altura = mm(primeiro(produto, ["Altura do produto", "Altura"]));
  const profundidade = mm(primeiro(produto, ["Profundidade do produto", "Profundidade"]));
  const docs = documento(produto);
  return {
    titulo: limpar(produto.productName || $('meta[property="og:title"]').attr("content") || $("title").text()),
    descricao: limpar(produto.description || $('meta[name="description"]').attr("content") || ""),
    urlsImagens: imagens(produto),
    especificacoes: especificacoes(produto),
    dimensoes: largura || altura || profundidade ? { produto: { largura, altura, profundidade } } : {},
    documentos: docs
  };
}
