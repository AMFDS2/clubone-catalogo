const BASE = "https://loja.electrolux.com.br";

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

// Compatibilidade citada por um refil não identifica o aparelho vendido.
export function produtoElectroluxCompativel(produto = {}, item = {}) {
  const titulo=limpar(produto.productName || produto.productTitle).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const inicio=titulo.replace(/^ELECTROLUX\s+/, '');
  if(/^(?:(?:KIT|COMBO|PACK)\b.*)?\b(?:REFIL|REFIS|FILTRO|FILTROS|CARTUCHO|PECA|ACESSORIO|GARANTIA)\b/.test(inicio))return false;
  if(/PURIFICADOR/i.test(item.produto || '') && !/^PURIFICADOR\b/.test(inicio))return false;
  const modelo=chave(item.modelo),comercial=codigoComercial(item);
  const refs=[produto.productReference,produto.productReferenceCode,...(produto.items||[]).flatMap(sku=>(sku.referenceId||[]).map(r=>r.Value))].filter(Boolean).map(chave);
  const termos=[produto.productName,produto.productTitle,...(produto.items||[]).flatMap(sku=>[sku.name,sku.nameComplete])].filter(Boolean)
    .flatMap(v=>String(v).toUpperCase().split(/[^A-Z0-9]+/)).filter(Boolean);
  return Boolean((modelo && refs.includes(modelo)) || (comercial && termos.includes(comercial)) || (modelo && termos.includes(modelo)));
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
        if (url && produtoElectroluxCompativel(produto,item) && !alternativas.includes(url)) alternativas.push(url);
      }
      const exato = resultados.find(produto => produtoElectroluxCompativel(produto,item));
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
  const resultados=[];
  for(const termo of [...new Set([chave(item.modelo),comercial].filter(Boolean))]){
    try{resultados.push(...await consultar(termo));}catch(erro){console.warn(`Electrolux: ${erro.message}. Mantendo fallback Info Store.`);}
    if(resultados.some(p=>produtoElectroluxCompativel(p,item)))break;
  }
  const produtoEncontrado = resultados.find(p => produtoElectroluxCompativel(p,item));
  const produto = produtoEncontrado || {};
  const largura = mm(primeiro(produto, ["Largura do produto", "Largura"]));
  const altura = mm(primeiro(produto, ["Altura do produto", "Altura"]));
  const profundidade = mm(primeiro(produto, ["Profundidade do produto", "Profundidade"]));
  const docs = documento(produto);
  return {
    validadoFabricante: Boolean(produtoEncontrado),
    produtoPrincipalValido: Boolean(produtoEncontrado),
    codigoComercial: comercial,
    titulo: limpar(produto.productName || ""),
    descricao: limpar(produto.description || ""),
    urlsImagens: imagens(produto),
    especificacoes: especificacoes(produto),
    dimensoes: largura || altura || profundidade ? { produto: { largura, altura, profundidade } } : {},
    documentos: docs
  };
}
