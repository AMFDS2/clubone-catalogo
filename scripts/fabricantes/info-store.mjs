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

async function consultar(termo, porCodigo = false) {
  const resposta = await fetch(`${BASE}/api/catalog_system/pub/products/search?${porCodigo ? "fq=alternateIds_RefId:" : "ft="}${encodeURIComponent(termo)}`, {
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

const TERMOS_ACESSORIOS = [
  "TUBO", "PANNARELLO", "JARRA", "TAMPA", "FILTRO", "COPO", "LAMINA", "LÂMINA",
  "BICO", "MANGUEIRA", "RESERVATORIO", "RESERVATÓRIO", "BANDEJA", "PECA", "PEÇA",
  "ACESSORIO", "ACESSÓRIO", "ANEL", "VEDACAO", "VEDAÇÃO", "ACOPLAMENTO", "ENGRENAGEM",
  "EIXO", "SUPORTE", "PORTA FILTRO", "PORTA-FILTRO",
  "FACA", "PENEIRA", "ESPATULA", "ESPÁTULA", "DISCO", "BATEDOR",
  "TRAVA", "BORRACHA", "GUARNICAO", "GUARNIÇÃO"
];

function textoProduto(produto = {}) {
  // Não usamos a descrição para decidir se é acessório. Um produto principal
  // pode mencionar faca, filtro, copo ou outros itens na descrição.
  return limpar([
    produto.productName,
    produto.productTitle,
    produto.linkText,
    ...(produto.items || []).flatMap(sku => [sku.name, sku.nameComplete])
  ].filter(Boolean).join(" ")).toUpperCase();
}

function itemEhAcessorio(item = {}) {
  const texto = limpar(`${item.produto || ""} ${item.modelo || ""}`).toUpperCase();
  return TERMOS_ACESSORIOS.some(termo => texto.includes(termo));
}

function produtoEhAcessorio(produto = {}, item = {}) {
  if (itemEhAcessorio(item)) return false;
  const texto = textoProduto(produto);
  return TERMOS_ACESSORIOS.some(termo => texto.includes(termo));
}

function tipoEsperado(item = {}) {
  const t = limpar(item.produto || "").toUpperCase();
  if (t.includes("LIQUID")) return ["LIQUIDIFICADOR", "LIQUID"];
  if (t.includes("CAFETEIRA")) return ["CAFETEIRA"];
  if (t.includes("AIR FRYER") || t.includes("AIRFRYER") || t.includes("FRITADEIRA")) return ["AIR FRYER", "AIRFRYER", "FRITADEIRA"];
  if (t.includes("PROCESSADOR")) return ["PROCESSADOR"];
  if (t.includes("FERRO")) return ["FERRO"];
  if (t.includes("ASPIRADOR")) return ["ASPIRADOR"];
  if (t.includes("TORRADEIRA")) return ["TORRADEIRA"];
  if (t.includes("SANDUICHEIRA")) return ["SANDUICHEIRA"];
  if (t.includes("CHALEIRA")) return ["CHALEIRA"];
  if (t.includes("ESPUMADOR")) return ["ESPUMADOR"];
  if (t.includes("PURIFICADOR")) return ["PURIFICADOR"];
  if (t.includes("UMIDIFICADOR")) return ["UMIDIFICADOR"];
  return [];
}

function pontuarProduto(produto = {}, item = {}) {
  if (produtoEhAcessorio(produto, item)) return -10000;

  const refs = referencias(produto);
  const codigo = chave(item.codigo);
  const modelo = chave(String(item.modelo || "").split("/")[0]);
  const texto = chave(textoProduto(produto));
  const tipos = tipoEsperado(item);

  let pontos = 0;

  if (codigo && refs.includes(codigo)) pontos += 1200;
  else if (codigo && refs.some(ref => ref.includes(codigo))) pontos += 700;

  if (modelo && refs.includes(modelo)) pontos += 600;
  else if (modelo && refs.some(ref => ref.startsWith(modelo) || modelo.startsWith(ref))) pontos += 420;
  else if (modelo && refs.some(ref => ref.includes(modelo) || modelo.includes(ref))) pontos += 280;

  if (modelo && texto.includes(modelo)) pontos += 180;
  if (tipos.length && tipos.some(tipo => texto.includes(chave(tipo)))) pontos += 140;

  const qtdImagens = (produto.items || []).reduce((total, sku) => total + ((sku.images || []).length), 0);
  if (qtdImagens > 0) pontos += 30;
  if (qtdImagens >= 4) pontos += 20;

  return pontos;
}

function adicionarUnicos(destino, produtos = []) {
  const vistos = new Set(destino.map(produto => link(produto) || referencias(produto).join("|")));
  for (const produto of produtos) {
    const id = link(produto) || referencias(produto).join("|");
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    destino.push(produto);
  }
}

async function localizarProduto(item = {}) {
  const codigoInfo = chave(item.codigo);
  const modelo = chave(String(item.modelo || "").split("/")[0]);
  const candidatos = [];

  /*
   * 1) O Código Info Store é a âncora de identidade mais forte.
   *
   * Se a consulta exata por RefId retornar um produto cujo RefId seja
   * exatamente PORxxxx, aceitamos imediatamente esse produto. Não aplicamos
   * o filtro heurístico de acessórios aqui, porque títulos de produtos
   * principais podem conter palavras como JARRA, COPO ou FILTRO.
   *
   * Exemplo: POR0111 representa o liquidificador completo. Se o RefId é
   * POR0111, ele deve vencer qualquer coincidência de peça encontrada pelo
   * modelo RI2244.
   */
  if (codigoInfo) {
    try {
      const porCodigoExato = await consultar(codigoInfo, true);
      const produtosCodigoValidos = porCodigoExato.filter(produto =>
        !/garantia-estendida/i.test(link(produto))
      );

      /*
       * A consulta acima já usa o filtro exato alternateIds_RefId:PORxxxx.
       * Em alguns retornos da VTEX o RefId usado no filtro não é repetido
       * nos campos que referencias() consegue ler. Quando o filtro exato
       * retorna um único produto válido, esse próprio resultado é nossa
       * evidência mais forte e pode ser aceito com segurança.
       */
      if (produtosCodigoValidos.length === 1) {
        return {
          produto: produtosCodigoValidos[0],
          correspondencia: "CODIGO_INFO"
        };
      }

      const produtoCodigoExato = produtosCodigoValidos.find(produto =>
        referencias(produto).includes(codigoInfo)
      );

      if (produtoCodigoExato) {
        return {
          produto: produtoCodigoExato,
          correspondencia: "CODIGO_INFO"
        };
      }

      adicionarUnicos(candidatos, produtosCodigoValidos);
    } catch {}

    // Algumas páginas não expõem o RefId no filtro exato, então ampliamos
    // para a busca textual. Aqui ainda exigimos validação pelo ranking abaixo.
    try { adicionarUnicos(candidatos, await consultar(codigoInfo, false)); } catch {}
  }

  // 2) Modelo comercial.
  if (modelo) {
    try { adicionarUnicos(candidatos, await consultar(modelo, false)); } catch {}
  }

  // 3) Demais tokens comerciais somente se ainda precisarmos ampliar a busca.
  if (candidatos.length < 3) {
    for (const termo of tokensComerciais(item)) {
      if (termo === codigoInfo || termo === modelo) continue;
      try { adicionarUnicos(candidatos, await consultar(termo, false)); } catch {}
      if (candidatos.length >= 12) break;
    }
  }

  const validos = candidatos
    .filter(produto => !/garantia-estendida/i.test(link(produto)))
    .map(produto => ({ produto, pontos: pontuarProduto(produto, item) }))
    .filter(resultado => resultado.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos);

  const melhor = validos[0];
  if (!melhor) return null;

  const refs = referencias(melhor.produto);
  const codigoExato = Boolean(codigoInfo && refs.includes(codigoInfo));
  const modeloExato = Boolean(modelo && refs.includes(modelo));

  // Código Info exato sempre vence. Sem código exato, exigimos uma evidência forte
  // de modelo/tipo para não misturar produtos parecidos.
  if (!codigoExato && melhor.pontos < 300) return null;

  return {
    produto: melhor.produto,
    correspondencia: codigoExato
      ? "CODIGO_INFO"
      : modeloExato
        ? "MODELO_EXATO"
        : "MODELO_VALIDADO"
  };
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
      ["Capacidade", primeiro(produto, ["Capacidade útil", "Capacidade do cesto", "Volume", "Capacidade"])],
      ["Potência", primeiro(produto, ["Potência", "Potência do motor", "Potência nominal"])],
      ["Velocidades", primeiro(produto, ["Número de velocidades", "Velocidades"])],
      ["Timer", primeiro(produto, ["Timer", "Temporizador"])],
      ["Temperatura", primeiro(produto, ["Temperatura máxima", "Controle de temperatura", "Temperatura"])],
      ["Pressão", primeiro(produto, ["Pressão", "Pressão da bomba"])],
      ["Acessórios", primeiro(produto, ["Acessórios inclusos", "Acessórios"])],
      ["Garantia", primeiro(produto, ["Garantia", "Prazo de garantia"])],
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
      urlsImagens: urlsImagens.slice(0, 8),
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
