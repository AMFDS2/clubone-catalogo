import * as cheerio from "cheerio";
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

const TERMOS_ACESSORIOS = [
  "TUBO",
  "PANNARELLO",
  "JARRA",
  "TAMPA",
  "FILTRO",
  "COPO",
  "LAMINA",
  "LÂMINA",
  "BICO",
  "MANGUEIRA",
  "RESERVATORIO",
  "RESERVATÓRIO",
  "BANDEJA",
  "PECA",
  "PEÇA",
  "ACESSORIO",
  "ACESSÓRIO",
  "ANEL",
  "VEDACAO",
  "VEDAÇÃO",
  "ACOPLAMENTO",
  "ENGRENAGEM",
  "EIXO",
  "ESPATULA",
  "ESPÁTULA",
  "SUPORTE",
  "ESCOVA",
  "PORTA FILTRO",
  "PORTA-FILTRO",
  "FACA",
  "PENEIRA",
  "ESPATULA",
  "ESPÁTULA",
  "DISCO",
  "BATEDOR",
  "TRAVA",
  "BORRACHA",
  "GUARNICAO",
  "GUARNIÇÃO",
  "TUBULACAO",
  "TUBULAÇÃO"
];

function textoProduto(produto = {}) {
  // Para validar identidade/acessório usamos somente campos de identidade.
  // A descrição pode mencionar lâmina, filtro, copo etc. em um produto principal correto.
  return limpar([
    produto.productName,
    produto.productTitle,
    produto.linkText,
    ...(produto.items || []).flatMap(sku => [sku.name, sku.nameComplete])
  ]
    .filter(Boolean)
    .join(" "))
    .toUpperCase();
}

function textoItem(item = {}) {
  return limpar([item.produto, item.modelo].filter(Boolean).join(" ")).toUpperCase();
}

function itemEhAcessorio(item = {}) {
  const texto = textoItem(item);
  return TERMOS_ACESSORIOS.some(termo => texto.includes(termo));
}

function ehAcessorio(produto = {}, item = {}) {
  // Se a própria linha da planilha representa uma peça/acessório comercial,
  // não bloqueamos esse tipo de resultado. O bloqueio serve para impedir que
  // uma CAFETEIRA ou LIQUIDIFICADOR seja trocado por uma peça compatível.
  if (itemEhAcessorio(item)) return false;

  const texto = textoProduto(produto);
  if (!texto) return false;

  /*
   * IMPORTANTE:
   * Não basta a palavra JARRA/FILTRO/COPO aparecer em qualquer lugar.
   * Produtos principais corretos podem se chamar, por exemplo:
   *   "Liquidificador Série 5000 Jarra Inquebrável ... RI2244"
   *
   * O que caracteriza uma peça é normalmente o título COMEÇAR pela peça:
   *   "Faca Preta Liquidificador ... RI2244"
   *   "Peneira Castanha ... RI7300"
   *   "Copo Acrílico ... Liquidificador RI2112"
   */
  const inicio = texto
    .replace(/^PHILIPS\s+WALITA\s+/, "")
    .replace(/^WALITA\s+/, "")
    .trim();

  const termosInicio = [
    "TUBO", "PANNARELLO", "JARRA", "TAMPA", "FILTRO", "COPO",
    "LAMINA", "LÂMINA", "BICO", "MANGUEIRA", "RESERVATORIO",
    "RESERVATÓRIO", "BANDEJA", "PECA", "PEÇA", "ACESSORIO",
    "ACESSÓRIO", "ANEL", "VEDACAO", "VEDAÇÃO", "ACOPLAMENTO",
    "ENGRENAGEM", "EIXO", "ESPATULA", "ESPÁTULA", "SUPORTE",
    "ESCOVA", "PORTA FILTRO", "PORTA-FILTRO", "FACA", "PENEIRA",
    "DISCO", "BATEDOR", "TRAVA", "BORRACHA", "GUARNICAO",
    "GUARNIÇÃO", "TUBULACAO", "TUBULAÇÃO"
  ];

  return termosInicio.some(termo =>
    inicio === termo ||
    inicio.startsWith(`${termo} `) ||
    inicio.startsWith(`${termo}-`)
  );
}

function tiposEsperados(item = {}) {
  const texto = limpar(item.produto || "").toUpperCase();

  if (texto.includes("LIQUID")) {
    return ["LIQUIDIFICADOR", "LIQUID"];
  }

  if (texto.includes("CAFETEIRA")) {
    return ["CAFETEIRA"];
  }

  if (
    texto.includes("AIR FRYER") ||
    texto.includes("AIRFRYER") ||
    texto.includes("FRITADEIRA")
  ) {
    return ["AIR FRYER", "AIRFRYER", "FRITADEIRA"];
  }

  if (texto.includes("PROCESSADOR")) {
    return ["PROCESSADOR"];
  }

  if (texto.includes("FERRO")) {
    return ["FERRO"];
  }

  if (texto.includes("ASPIRADOR")) {
    return ["ASPIRADOR"];
  }

  if (texto.includes("TORRADEIRA")) {
    return ["TORRADEIRA"];
  }

  if (texto.includes("SANDUICHEIRA")) {
    return ["SANDUICHEIRA"];
  }

  if (texto.includes("CHALEIRA")) {
    return ["CHALEIRA"];
  }

  if (texto.includes("ESPUMADOR")) {
    return ["ESPUMADOR"];
  }

  if (texto.includes("PURIFICADOR")) {
    return ["PURIFICADOR"];
  }

  if (texto.includes("PAPA BOLINHAS")) {
    return ["PAPA BOLINHAS"];
  }

  if (texto.includes("UMIDIFICADOR")) {
    return ["UMIDIFICADOR"];
  }

  if (texto.includes("ESPUMADOR")) {
    return ["ESPUMADOR"];
  }

  return [];
}

function correspondeAoTipo(produto = {}, item = {}) {
  const tipos = tiposEsperados(item);

  if (!tipos.length) {
    return true;
  }

  const texto = textoProduto(produto);

  return tipos.some(tipo =>
    texto.includes(tipo)
  );
}

function evidenciasModelo(produto = {}, modelo = "") {
  const alvo = chave(modelo);
  if (!alvo) return { exato: false, comeca: false, contem: false, titulo: false };

  const refs = referencias(produto);
  const texto = chave(textoProduto(produto));

  return {
    exato: refs.includes(alvo),
    comeca: refs.some(ref => ref.startsWith(alvo) || alvo.startsWith(ref)),
    contem: refs.some(ref => ref.includes(alvo) || alvo.includes(ref)),
    titulo: texto.includes(alvo)
  };
}

function pontuarProduto(produto = {}, item = {}, modelo = "") {
  if (ehAcessorio(produto, item)) return -10000;

  const evidencias = evidenciasModelo(produto, modelo);
  const tipoOk = correspondeAoTipo(produto, item);

  let pontos = 0;
  if (evidencias.exato) pontos += 700;
  else if (evidencias.comeca) pontos += 500;
  else if (evidencias.contem) pontos += 320;

  if (evidencias.titulo) pontos += 220;
  if (tipoOk) pontos += 180;
  else if (tiposEsperados(item).length) pontos -= 120;

  // Produtos principais costumam ter SKU/imagens. Isso ajuda a desempatar
  // quando o fabricante devolve peças e produtos na mesma busca.
  const qtdImagens = (produto.items || []).reduce(
    (total, sku) => total + ((sku.images || []).length),
    0
  );
  if (qtdImagens >= 2) pontos += 40;
  if (qtdImagens >= 5) pontos += 30;

  return pontos;
}


async function baixarHtml(url) {
  const resposta = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CatalogoClubOne/9.0",
      "Accept-Language": "pt-BR,pt;q=0.9",
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!resposta.ok) throw new Error(`HTML fabricante retornou HTTP ${resposta.status}`);
  return resposta.text();
}

function rotasCatalogo(item = {}) {
  const texto = limpar(item.produto || "").toUpperCase();
  const rotas = [];

  if (texto.includes("LIQUID")) rotas.push("/eletroportateis-para-cozinha/liquidificadores");
  if (texto.includes("CAFETEIRA")) rotas.push("/eletroportateis-para-cozinha/cafeteiras");
  if (texto.includes("PROCESSADOR") || texto.includes("MLTPROCESSADOR") || texto.includes("MULTIPROCESSADOR")) rotas.push("/eletroportateis-para-cozinha/processadores-de-alimentos");
  if (texto.includes("AIR FRYER") || texto.includes("AIRFRYER") || texto.includes("FRITADEIRA")) rotas.push("/eletroportateis-para-cozinha/airfryers");
  if (texto.includes("FERRO") || texto.includes("VAPORIZADOR")) rotas.push("/cuidados-com-a-roupa");
  if (texto.includes("ASPIRADOR")) rotas.push("/aspiradores");

  // Página ampla oficial como fallback final.
  rotas.push("/todo-o-site");

  return [...new Set(rotas)];
}

function tituloParecePecaTexto(texto = "") {
  const inicio = limpar(texto)
    .toUpperCase()
    .replace(/^PHILIPS\s+WALITA\s+/, "")
    .replace(/^WALITA\s+/, "")
    .trim();

  const termos = [
    "TUBO", "PANNARELLO", "JARRA", "TAMPA", "FILTRO", "COPO",
    "LAMINA", "LÂMINA", "BICO", "MANGUEIRA", "RESERVATORIO",
    "RESERVATÓRIO", "BANDEJA", "PECA", "PEÇA", "ACESSORIO",
    "ACESSÓRIO", "ANEL", "VEDACAO", "VEDAÇÃO", "ACOPLAMENTO",
    "ENGRENAGEM", "EIXO", "ESPATULA", "ESPÁTULA", "SUPORTE",
    "ESCOVA", "PORTA FILTRO", "PORTA-FILTRO", "FACA", "PENEIRA",
    "DISCO", "BATEDOR", "TRAVA", "BORRACHA", "GUARNICAO",
    "GUARNIÇÃO", "TUBULACAO", "TUBULAÇÃO"
  ];

  return termos.some(termo =>
    inicio === termo ||
    inicio.startsWith(`${termo} `) ||
    inicio.startsWith(`${termo}-`)
  );
}

function pontuarLinkCatalogo({ href = "", texto = "" } = {}, item = {}, modelo = "") {
  const modeloNormalizado = chave(modelo);
  const hrefNormalizado = chave(href);
  const textoNormalizado = chave(texto);
  const tipos = tiposEsperados(item);
  const textoUpper = limpar(texto).toUpperCase();

  let pontos = 0;
  if (hrefNormalizado.includes(modeloNormalizado)) pontos += 1000;
  if (textoNormalizado.includes(modeloNormalizado)) pontos += 800;
  if (tipos.some(tipo => textoUpper.includes(tipo))) pontos += 220;
  if (/\/p(?:\?|$)/i.test(href)) pontos += 100;
  if (tituloParecePecaTexto(texto)) pontos -= 2500;

  return pontos;
}

async function localizarProdutoNoCatalogoHtml(item = {}) {
  const config = configuracao(item);
  if (!config || config !== LOJAS.WALITA) return null;

  const modelo = modeloBase(item);
  if (!modelo) return null;

  const candidatos = [];

  for (const rota of rotasCatalogo(item)) {
    try {
      const html = await baixarHtml(`${config.base}${rota}`);
      const $ = cheerio.load(html);

      $("a[href]").each((_, el) => {
        const hrefBruto = $(el).attr("href") || "";
        const texto = limpar($(el).text());
        if (!hrefBruto) return;

        let href = hrefBruto;
        if (href.startsWith("//")) href = `https:${href}`;
        else if (href.startsWith("/")) href = `${config.base}${href}`;
        else if (!/^https?:\/\//i.test(href)) return;

        if (!/\/p(?:\?|$)/i.test(href)) return;

        const pontos = pontuarLinkCatalogo({ href, texto }, item, modelo);
        if (pontos >= 700) candidatos.push({ url: href, texto, pontos });
      });
    } catch (erro) {
      console.warn(`Catálogo HTML Walita (${modelo}) ${rota}: ${erro.message}`);
    }
  }

  candidatos.sort((a, b) => b.pontos - a.pontos);
  const melhor = candidatos[0];
  if (!melhor) return null;

  return {
    url: melhor.url,
    config,
    modelo,
    pontos: melhor.pontos,
    origem: "CATALOGO_HTML"
  };
}

async function localizarProduto(item = {}) {
  const config = configuracao(item);
  if (!config) return null;

  const modelo = modeloBase(item);
  if (!modelo) return null;

  // Consulta o modelo comercial. Para modelos com sufixo (/72, /32 etc.),
  // modeloBase já usa a família principal, que é como a loja normalmente indexa.
  const resultados = await consultar(config.base, modelo);
  if (!resultados.length) return null;

  const ranqueados = resultados
    .map(produto => ({ produto, pontos: pontuarProduto(produto, item, modelo) }))
    .filter(itemPontuado => itemPontuado.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos);

  const melhor = ranqueados[0];

  // Exigimos evidência mínima de modelo. O tipo do produto sozinho nunca basta.
  if (!melhor || melhor.pontos < 300) {
    console.warn(`Nenhum produto principal confiável encontrado para ${item.modelo || modelo}.`);
    return null;
  }

  return {
    produto: melhor.produto,
    config,
    modelo,
    pontos: melhor.pontos
  };
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
    const urlApi = localizado ? link(localizado.config.base, localizado.produto) : "";

    if (urlApi) {
      return {
        status: "LOCALIZADO",
        url: urlApi,
        alternativas: [urlApi],
        origemFonte: "FABRICANTE",
        correspondencia: "MODELO_VALIDADO"
      };
    }

    // Fallback estrutural para Walita:
    // quando a API interna retorna somente peças/acessórios, procuramos o
    // modelo nas páginas oficiais de catálogo da própria Walita.
    const catalogo = await localizarProdutoNoCatalogoHtml(item);

    if (catalogo?.url) {
      console.log(`[${item.codigo || item.modelo}] localizado no catálogo HTML oficial: ${catalogo.url}`);
      return {
        status: "LOCALIZADO",
        url: catalogo.url,
        alternativas: [catalogo.url],
        origemFonte: "FABRICANTE",
        correspondencia: "MODELO_CATALOGO_HTML"
      };
    }

    return {
      status: "NAO_LOCALIZADO",
      url: "",
      alternativas: [],
      origemFonte: ""
    };
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
      produtoPrincipalValido: !ehAcessorio(produto, item),
      validadoFabricante: true,
      fonteFabricante: link(config.base, produto),
      fabricanteOficial: config.nome
    };
  } catch (erro) {
    console.warn(`Extração portátil (${item.modelo}): ${erro.message}`);
    return null;
  }
}
