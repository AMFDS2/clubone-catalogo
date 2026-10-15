const BASE = "https://loja.electrolux.com.br";

const FONTES_CONFIRMADAS = new Map([
  ["02543FBA130", `${BASE}/geladeira-electrolux-frost-free-585l-efficient-com-autosense-e-dispenser-de-agua-e-gelo-3-portas-cor-inox-look--im8is-/p`],
  ["02544FBA130", `${BASE}/geladeira-electrolux-multidoor-com-flexispace-home-pro-541l--iq8is--1/p`],
  ["02547FBA135", `${BASE}/geladeira-electrolux-multidoor-com-flexispace-pro-series-583l--iq8ib-/p`],
  ["1512QDBA199", `${BASE}/maquina-de-lavar-frontal-electrolux-12kg-cinza-onix-inverter-com-agua-quente-e-lavagem-inteligente--lfc12-/p`]
]);

const limpar = (v = "") => String(v).replaceAll("&amp;", "&").replace(/\s+/g, " ").trim();
const chave = (v = "") => String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");

function codigoComercial(item = {}) {
  const ignorar = new Set(["ELECTROLUX", "NAC", "LINHA", "BRANCA", "PRE", "BRA", "CIN", "BIVOLT", "EMBUT"]);
  const candidatos = String(item.produto || "").toUpperCase()
    .match(/[A-Z0-9]*[A-Z][A-Z0-9-]*\d[A-Z0-9-]*|\d+[A-Z][A-Z0-9-]*/g) || [];
  const unidades = /^\d+(?:L|V|W|KW|KG|G|CM|MM|HZ|BTU|POLEGADAS?)$/;

  return candidatos
    .map(chave)
    .filter(valor =>
      valor.length >= 3 &&
      valor.length <= 14 &&
      !ignorar.has(valor) &&
      valor !== chave(item.codigo) &&
      valor !== chave(item.modelo) &&
      !unidades.test(valor)
    )
    .sort((a, b) => {
      const pontuar = valor => {
        let pontos = 0;
        if (/^[A-Z]{1,6}\d[A-Z0-9]*$/.test(valor)) pontos += 100;
        if (/^\d+[A-Z]{2,}[A-Z0-9]*$/.test(valor)) pontos += 80;
        if (/[A-Z]/.test(valor) && /\d/.test(valor)) pontos += 30;
        if (valor.length >= 4 && valor.length <= 8) pontos += 15;
        return pontos;
      };
      return pontuar(b) - pontuar(a);
    })[0] || "";
}

function referencias(produto = {}) {
  const valores = [produto.productReference, produto.productName, produto.productTitle, produto.linkText];
  for (const sku of produto.items || []) {
    valores.push(sku.itemId, sku.name, sku.nameComplete);
    for (const ref of sku.referenceId || []) valores.push(ref?.Value, ref?.Key);
  }
  return chave(valores.filter(Boolean).join(" "));
}

function ehAcessorio(produto = {}) {
  // Use somente a identidade comercial. A descrição de uma geladeira pode
  // mencionar filtros sem que o produto seja um acessório.
  const identidade = limpar([
    produto.productName,
    produto.productTitle,
    produto.linkText,
    link(produto)
  ].filter(Boolean).join(" "));

  return /\b(filtro|refil|kit|jun[cç][aã]o|acess[oó]rio|pe[cç]a|prateleira|gaveta|puxador)\b/i.test(identidade);
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
  const fonteConfirmada = FONTES_CONFIRMADAS.get(modelo);
  if (fonteConfirmada) {
    return {
      status: "LOCALIZADO",
      url: fonteConfirmada,
      alternativas: [fonteConfirmada],
      correspondencia: "MODELO_CONFIRMADO"
    };
  }
  const comercial = codigoComercial(item);
  const alternativas = [];
  for (const termo of [...new Set([modelo, comercial].filter(Boolean))]) {
    try {
      const resultados = await consultar(termo);
      for (const produto of resultados) {
        const url = link(produto);
        if (url && !/garantia-estendida/i.test(url) && !ehAcessorio(produto) && !alternativas.includes(url)) alternativas.push(url);
      }
      const exato = resultados.find(produto => {
        const refs = referencias(produto);
        return !/garantia-estendida/i.test(link(produto)) &&
          !ehAcessorio(produto) &&
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

function imagensPagina($) {
  const lista = [];
  const adicionar = valor => {
    const url = limpar(valor);
    if (/^https?:\/\//i.test(url) && !lista.includes(url)) lista.push(url);
  };

  adicionar($('meta[property="og:image"]').attr("content"));
  $("img").each((_, elemento) => {
    const imagem = $(elemento);
    adicionar(imagem.attr("data-src"));
    adicionar(imagem.attr("src"));
  });
  return lista.filter(url => !/logo|icon|favicon/i.test(url)).slice(0, 5);
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
  const fonteConfirmada = FONTES_CONFIRMADAS.get(chave(item.modelo));
  const resultados = comercial ? await consultar(comercial) : [];
  const produtoEncontrado = resultados.find(p =>
    !/garantia-estendida/i.test(link(p)) &&
    !ehAcessorio(p) &&
    referencias(p).includes(chave(comercial))
  );
  const produto = produtoEncontrado || {};
  const largura = mm(primeiro(produto, ["Largura do produto", "Largura"]));
  const altura = mm(primeiro(produto, ["Altura do produto", "Altura"]));
  const profundidade = mm(primeiro(produto, ["Profundidade do produto", "Profundidade"]));
  const docs = documento(produto);
  return {
    validadoFabricante: Boolean((produtoEncontrado && comercial) || fonteConfirmada),
    codigoComercial: comercial,
    titulo: limpar(produto.productName || $('meta[property="og:title"]').attr("content") || $("title").text()),
    descricao: limpar(produto.description || $('meta[name="description"]').attr("content") || ""),
    urlsImagens: imagens(produto).length ? imagens(produto) : imagensPagina($),
    especificacoes: especificacoes(produto),
    dimensoes: largura || altura || profundidade ? { produto: { largura, altura, profundidade } } : {},
    documentos: docs
  };
}
