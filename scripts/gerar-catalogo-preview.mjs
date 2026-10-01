import { ehClimatizacao, marca as marcaClima, tipo as tipoClima } from "./lib/climatizacao.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const caminhos = {
  base: path.join(raiz, "dados", "produtos-base.json"),
  atual: path.join(raiz, "produtos.preview.json"),
  enriquecimento: path.join(raiz, "dados", "enriquecimento-automatico.json"),
  saida: path.join(raiz, "produtos.preview.json"),
  pendencias: path.join(raiz, "dados", "produtos-nao-incluidos.json")
};

const URL_INFO_STORE = "https://www.infostore.com.br";
const cacheLinksInfoStore = new Map();

function chave(valor = "") {
  return String(valor).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizar(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function marca(fabricante = "") {
  const valor = String(fabricante).trim();
  if (valor.toLowerCase().includes("samsung")) return "Samsung";
  if (valor.toLowerCase().includes("electrolux")) return "Electrolux";
  if (/walita|philips/i.test(valor)) return "Philips Walita";
  if (/\bwap\b/i.test(valor)) return "WAP";
  return valor;
}

function categoria(segmento = "") {
  const mapa = {
    VIDEO: "Video",
    AUDIO: "Audio",
    "ÁUDIO": "Audio",
    "LINHA BRANCA": "Linha Branca",
    PORTATEIS: "Eletroportáteis",
    "PORTÁTEIS": "Eletroportáteis",
    ELETROPORTATEIS: "Eletroportáteis",
    "ELETROPORTÁTEIS": "Eletroportáteis",
    AUTOMACAO: "Automacao",
    "AUTOMAÇÃO": "Automacao",
    REDES: "Redes",
    INFORMATICA: "Informática",
    "INFORMÁTICA": "Informática"
  };

  return mapa[String(segmento).trim().toUpperCase()] || segmento;
}

async function ler(caminho) {
  try {
    return JSON.parse(await fs.readFile(caminho, "utf8"));
  } catch {
    return [];
  }
}

function limparTituloOficial(titulo = "") {
  const limpo = String(titulo)
    .replace(/\s+/g, " ")
    .replace(/\s*[|–—-]\s*Samsung(?: Brasil)?\s*$/i, "")
    .replace(/\s*[|–—-]\s*Samsung\.com.*$/i, "")
    .trim();

  const invalido =
    !limpo ||
    limpo.length < 8 ||
    limpo.length > 180 ||
    /pagina nao encontrada|page not found|erro 404|samsung brasil$/i.test(limpo);

  return invalido ? "" : limpo;
}

function nomeProduto(base, enriquecido = {}, anterior = {}) {
  return (
    limparTituloOficial(enriquecido.tituloOficial) ||
    limparTituloOficial(anterior.nomeOficial) ||
    String(base.produto || anterior.nome || base.modelo || "Produto").trim()
  );
}

function identificarTipoBloco(base = {}, enriquecido = {}) {
  const modelo = chave(base.modelo).toLowerCase();
  const conteudo = normalizar([
    base.produto,
    base.segmento,
    base.modelo,
    enriquecido.tituloOficial,
    enriquecido.descricao
  ].filter(Boolean).join(" "));

  const portatil = /portateis|eletroportateis/.test(normalizar(base.segmento));
  if (portatil) {
    if (/air\s*fryer|fritadeira/.test(conteudo)) return "air-fryer";
    if (/liquid/.test(conteudo)) return "liquidificador";
    if (/cafeteira|espresso/.test(conteudo)) return "cafeteira";
    if (/multiprocessador|mini processador|processador/.test(conteudo)) return "processador";
    if (/robo asp|robo aspirador/.test(conteudo)) return "robo-aspirador";
    if (/aspirador|extratora/.test(conteudo)) return "aspirador";
    if (/chaleira/.test(conteudo)) return "chaleira";
    if (/sanduicheira/.test(conteudo)) return "sanduicheira";
    if (/torradeira/.test(conteudo)) return "torradeira";
    if (/umidificador/.test(conteudo)) return "umidificador";
    if (/ferro|vaporizador/.test(conteudo)) return "ferro-vaporizador";
    if (/espremedor/.test(conteudo)) return "espremedor";
    if (/lavadora.*pressao/.test(conteudo)) return "lavadora-pressao";
    if (/papa bolinhas/.test(conteudo)) return "papa-bolinhas";
    return "portatil";
  }

  if (normalizar(base.segmento) === "video" || modelo.startsWith("un") || /\btv\b/.test(conteudo)) return "tv";
  if (conteudo.includes("cooktop") || modelo.startsWith("na")) return "cooktop";
  if (conteudo.includes("coifa") || conteudo.includes("depurador")) return "coifa";
  if (conteudo.includes("fogao") || modelo.startsWith("nsg")) return "fogao";
  if (conteudo.includes("secadora") || modelo.startsWith("dv")) return "secadora";
  if (conteudo.includes("lava louca") || modelo.startsWith("dw")) return "lava-loucas";
  if (conteudo.includes("lava e seca") || conteudo.includes("lavadora") || conteudo.includes("maq lav") || modelo.startsWith("ww") || modelo.startsWith("wd")) return "lavadora";
  if (conteudo.includes("micro-ondas") || conteudo.includes("microondas") || modelo.startsWith("mg") || modelo.startsWith("ms") || modelo.startsWith("mc")) return "microondas";
  if (conteudo.includes("forno") || modelo.startsWith("nv")) return "forno";
  if (conteudo.includes("soundbar")) return "soundbar";
  if (conteudo.includes("geladeira") || conteudo.includes("refrigerador") || /^(rf|rs|rt)/.test(modelo)) return "geladeira";
  return "generico";
}


function ehPortatil(base = {}) {
  return /portateis|eletroportateis/.test(normalizar(base.segmento));
}

function grupoDimensoesProduto(dimensoes = {}) {
  return dimensoes.produto || dimensoes.semBase || dimensoes.semEmbalagem || dimensoes.comBase || {};
}

function dimensoesCompactas(dimensoes = {}) {
  const grupo = grupoDimensoesProduto(dimensoes);
  const largura = grupo.largura || grupo.width || "";
  const altura = grupo.altura || grupo.height || "";
  const profundidade = grupo.profundidade || grupo.depth || "";
  const valores = [largura, altura, profundidade].filter(Boolean);
  return valores.length === 3 ? valores.join(" × ") : valores.join(" × ");
}

function textoAplicacaoPortatil(tipo = "portatil") {
  const mapa = {
    "air-fryer": ["Ideal para bancadas de cozinha", "Uso prático no preparo diário, com presença visual compacta sobre a bancada."],
    liquidificador: ["Pronto para a área de preparo", "Formato pensado para permanecer acessível em bancadas de cozinha e espaços gourmet."],
    cafeteira: ["Perfeito para o cantinho do café", "Uma composição natural para bancadas de café, cozinhas e áreas gourmet."],
    processador: ["Apoio para a área de preparo", "Indicado para bancadas de apoio durante o preparo de alimentos."],
    "robo-aspirador": ["Integração discreta ao ambiente", "Pode permanecer acessível em salas e áreas de circulação sem interferir visualmente no espaço."],
    aspirador: ["Uso doméstico versátil", "Adequado para áreas de serviço, salas e espaços de apoio conforme o tipo de limpeza."],
    chaleira: ["Ideal para bancadas de café", "Combina com áreas de café da manhã, copas e espaços gourmet."],
    sanduicheira: ["Compacta para o café da manhã", "Pode permanecer em bancadas de apoio com acesso fácil à tomada."],
    torradeira: ["Ideal para bancadas de café da manhã", "Formato compacto para cozinhas, copas e espaços gourmet."],
    umidificador: ["Integração em ambientes internos", "Pode ser posicionado em áreas de apoio conforme as recomendações de uso do fabricante."],
    "ferro-vaporizador": ["Prático para áreas de apoio", "Adequado para lavanderias, closets e espaços de cuidado com roupas."],
    espremedor: ["Uso rápido na bancada", "Boa presença em áreas de café da manhã e preparo de bebidas."],
    "lavadora-pressao": ["Indicada para áreas externas", "Uso voltado a garagens, quintais e áreas de serviço externas."],
    "papa-bolinhas": ["Compacto para cuidados pessoais e domésticos", "Pode ser guardado em closets, lavanderias ou gavetas de apoio."]
  };
  const [titulo, descricao] = mapa[tipo] || ["Aplicação no ambiente", "Produto compacto para uso cotidiano, com fácil integração ao espaço."];
  return { titulo, descricao };
}

function experienciaPortatil(base = {}, enriquecido = {}) {
  const tipo = identificarTipoBloco(base, enriquecido);
  const textoAmbiente = textoAplicacaoPortatil(tipo);
  return {
    tipoProduto: tipo,
    experiencia: "portatil",
    exibirBlocagem: false,
    exibirMedidasProjeto: false,
    exibirDocumentos: false,
    aplicacaoAmbiente: {
      ...textoAmbiente,
      imagem: enriquecido.imagemAmbiente || ""
    }
  };
}

function criarUrlBuscaInfoStore(termo = "") {
  const valor = String(termo).trim().toUpperCase();
  if (!valor) return URL_INFO_STORE;
  return `${URL_INFO_STORE}/${encodeURIComponent(valor.toLowerCase())}?_q=${encodeURIComponent(valor)}&map=ft`;
}

function urlParecePaginaDeProduto(url = "") {
  return typeof url === "string" && /\/p(?:\?|$)/i.test(url);
}

function normalizarLinkProduto(produto = {}) {
  if (produto.link && urlParecePaginaDeProduto(produto.link)) return produto.link;
  if (produto.linkText) return `${URL_INFO_STORE}/${String(produto.linkText).replace(/^\/+/, "")}/p`;
  return "";
}

function produtoCorresponde(produto, codigo, modelo) {
  const refs = [produto.productReference, ...(produto.items || []).flatMap(s => (s.referenceId || []).map(r => r.Value))];
  return Boolean(chave(codigo)) && refs.some(v => chave(v) === chave(codigo));
}

async function consultarInfoStore(termo = "", porCodigo = false) {
  const valor = String(termo).trim();
  if (!valor) return [];

  const url = `${URL_INFO_STORE}/api/catalog_system/pub/products/search?${porCodigo ? "fq=alternateIds_RefId:" : "ft="}${encodeURIComponent(valor)}`;
  const resposta = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  });

  if (!resposta.ok) throw new Error(`Info Store retornou HTTP ${resposta.status}`);
  const dados = await resposta.json();
  return Array.isArray(dados) ? dados : [];
}

async function localizarUrlInfoStore(codigo, modelo) {
  const codigoLimpo = String(codigo).trim().toUpperCase();
  const modeloLimpo = String(modelo).trim().toUpperCase();
  const chaveCache = `${codigoLimpo}|${modeloLimpo}`;

  if (cacheLinksInfoStore.has(chaveCache)) return cacheLinksInfoStore.get(chaveCache);

  for (const termo of [codigoLimpo, modeloLimpo].filter(Boolean)) {
    try {
      const resultados = await consultarInfoStore(termo, termo === codigoLimpo);
      const exatos = resultados.filter(produto => produtoCorresponde(produto, codigoLimpo, modeloLimpo));
      const produtoEncontrado = exatos.length === 1 ? exatos[0] : undefined;
      const link = normalizarLinkProduto(produtoEncontrado);

      if (link) {
        cacheLinksInfoStore.set(chaveCache, link);
        return link;
      }
    } catch (erro) {
      console.warn(`  Aviso Info Store (${termo}): ${erro.message}`);
    }
  }

  const fallback = "";
  cacheLinksInfoStore.set(chaveCache, fallback);
  return fallback;
}

function destaques(lista = []) {
  return lista
    .filter(item => item?.valor)
    .slice(0, 5)
    .map(item => ({ titulo: item.valor, rotulo: item.rotulo, icone: "◇" }));
}

function limparEspecificacoes(especificacoes = {}) {
  return Object.fromEntries(Object.entries(especificacoes).filter(([, valor]) => valor !== "" && valor != null));
}

function documentosOficiais(documentos = []) {
  if (!Array.isArray(documentos)) return [];
  return documentos.filter(d => d?.nome && d?.url);
}

function criarProdutoNovo(base, enriquecido, ordem, siteInfoStore, anterior = {}) {
  const cat = categoria(base.segmento);
  const nomeOficial = nomeProduto(base, enriquecido);
  const imagens = Array.isArray(enriquecido.imagens) && enriquecido.imagens.length
    ? enriquecido.imagens
    : [enriquecido.imagem].filter(Boolean);
  const portatil = ehPortatil(base);
  const experiencia = portatil ? experienciaPortatil(base, enriquecido) : {};
  const medidaCompacta = portatil ? dimensoesCompactas(enriquecido.dimensoes) : "";

  return {
    id: chave(base.modelo).toLowerCase() || chave(base.codigo).toLowerCase(),
    ordem,
    marca: marca(base.fabricante),
    modelo: base.modelo || "Não informado",
    nome: nomeOficial,
    nomeOficial,
    nomePlanilha: base.produto,
    descricao: enriquecido.descricao || base.produto,
    codigoInfo: base.codigo,
    categoria: cat,
    segmento: base.segmento,
    tipoBloco: portatil ? "portatil-sem-blocagem" : identificarTipoBloco(base, enriquecido),
    imagem: imagens[0] || "assets/produto-sem-imagem.svg",
    imagens: imagens.length ? imagens : ["assets/produto-sem-imagem.svg"],
    siteInfoStore,
    destaques: destaques(enriquecido.destaques),
    especificacoes: {
      Modelo: base.modelo || "Não informado",
      Categoria: cat,
      "Código Info Store": base.codigo,
      ...limparEspecificacoes(enriquecido.especificacoes),
      ...(medidaCompacta ? { "Dimensões do produto (L × A × P)": medidaCompacta } : {})
    },
    dimensoes: portatil ? {} : (enriquecido.dimensoes || {}),
    instalacao: portatil ? "" : "Valide medidas, ventilação, pontos elétricos, hidráulicos e requisitos estruturais antes da instalação.",
    documentos: portatil ? [] : documentosOficiais(enriquecido.documentos),
    sobreMarca: "Consulte as especificações, disponibilidade e condições comerciais com a equipe Info Store.",
    revisaoPendente: enriquecido.statusExtracao !== "EXTRAIDO",
    ...experiencia,
    ...(!portatil && anterior.medidasProjeto ? { medidasProjeto: anterior.medidasProjeto } : {})
  };
}

function criarProdutoPendente(base, enriquecido, ordem, siteInfoStore, motivoPendencia, anterior = {}) {
  const cat = categoria(base.segmento);
  const nomeOficial = nomeProduto(base, enriquecido);
  const portatil = ehPortatil(base);
  const experiencia = portatil ? experienciaPortatil(base, enriquecido) : {};
  const medidaCompacta = portatil ? dimensoesCompactas(enriquecido?.dimensoes) : "";

  return {
    id: chave(base.modelo).toLowerCase() || chave(base.codigo).toLowerCase(),
    ordem,
    marca: marca(base.fabricante),
    modelo: base.modelo || "Não informado",
    nome: nomeOficial,
    nomeOficial,
    nomePlanilha: base.produto,
    descricao: enriquecido?.descricao || base.produto,
    codigoInfo: base.codigo,
    categoria: cat,
    segmento: base.segmento,
    tipoBloco: portatil ? "portatil-sem-blocagem" : identificarTipoBloco(base, enriquecido),
    imagem: "assets/produto-sem-imagem.svg",
    imagens: ["assets/produto-sem-imagem.svg"],
    siteInfoStore,
    destaques: [],
    especificacoes: {
      Modelo: base.modelo || "Não informado",
      Categoria: cat,
      "Código Info Store": base.codigo,
      ...(medidaCompacta ? { "Dimensões do produto (L × A × P)": medidaCompacta } : {})
    },
    dimensoes: portatil ? {} : (enriquecido?.dimensoes || {}),
    instalacao: portatil ? "" : "Informações técnicas de instalação em atualização.",
    documentos: portatil ? [] : documentosOficiais(enriquecido?.documentos),
    sobreMarca: "Consulte disponibilidade e condições comerciais com a equipe Info Store.",
    revisaoPendente: true,
    motivoPendencia,
    ...experiencia,
    ...(!portatil && anterior.medidasProjeto ? { medidasProjeto: anterior.medidasProjeto } : {})
  };
}


function aplicarRegraPortatilAoAnterior(produto = {}, base = {}, enriquecido = {}) {
  if (!ehPortatil(base)) return produto;
  const experiencia = experienciaPortatil(base, enriquecido);
  const medidaCompacta = dimensoesCompactas(enriquecido?.dimensoes || produto.dimensoes || {});
  const especificacoes = {
    ...(produto.especificacoes || {}),
    ...(medidaCompacta ? { "Dimensões do produto (L × A × P)": medidaCompacta } : {})
  };

  const limpas = { ...produto };
  delete limpas.medidasProjeto;

  return {
    ...limpas,
    ...experiencia,
    tipoBloco: "portatil-sem-blocagem",
    especificacoes,
    dimensoes: {},
    instalacao: "",
    documentos: []
  };
}

async function executar() {
  const [base, atual, enriquecimentos] = await Promise.all([
    ler(caminhos.base),
    ler(caminhos.atual),
    ler(caminhos.enriquecimento)
  ]);

  const atualPorModelo = new Map(atual.map(item => [chave(item.modelo), item]));
  const enriquecidoPorModelo = new Map(enriquecimentos.map(item => [chave(item.modelo), item]));
  const catalogo = [];
  const pendencias = [];

  for (let indice = 0; indice < base.length; indice++) {
    const produtoBase = base[indice];
    if (ehClimatizacao(produtoBase)) {
      const anteriorClima = atual.find(p => p.codigoInfo === produtoBase.codigo);
      if (anteriorClima) { catalogo.push({...anteriorClima, ordem:base.length-indice, marca:marcaClima(produtoBase.fabricante), categoria:"Climatização", tipoBloco:tipoClima(produtoBase)}); continue; }
    }
    const modelo = chave(produtoBase.modelo);
    const anterior = atualPorModelo.get(modelo);
    const enriquecido = enriquecidoPorModelo.get(modelo) || {};
    const ordem = base.length - indice;

    console.log(`[${indice + 1}/${base.length}] Localizando Info Store: ${produtoBase.codigo} / ${produtoBase.modelo}`);

    const siteInfoStore = await localizarUrlInfoStore(produtoBase.codigo, produtoBase.modelo);

    if (enriquecido.imagem || (Array.isArray(enriquecido.imagens) && enriquecido.imagens.length)) {
      catalogo.push(criarProdutoNovo(produtoBase, enriquecido, ordem, siteInfoStore, anterior));
      continue;
    }

    if (anterior?.imagem) {
      const nomeOficial = nomeProduto(produtoBase, enriquecido, anterior);
      const atualizado = {
        ...anterior,
        ordem,
        marca: marca(produtoBase.fabricante),
        modelo: produtoBase.modelo || "Não informado",
        nome: nomeOficial,
        nomeOficial,
        nomePlanilha: produtoBase.produto,
        codigoInfo: produtoBase.codigo,
        categoria: categoria(produtoBase.segmento),
        segmento: produtoBase.segmento,
        tipoBloco: identificarTipoBloco(produtoBase, enriquecido),
        siteFabricante: undefined,
        imagens: Array.isArray(anterior.imagens) && anterior.imagens.length ? anterior.imagens : [anterior.imagem].filter(Boolean),
        documentos: documentosOficiais(enriquecido.documentos).length
          ? documentosOficiais(enriquecido.documentos)
          : documentosOficiais(anterior.documentos),
        siteInfoStore
      };
      catalogo.push(aplicarRegraPortatilAoAnterior(atualizado, produtoBase, enriquecido));
      continue;
    }

    const motivoPendencia = Object.keys(enriquecido).length ? "Imagem não disponível" : "Fonte ainda precisa de revisão";
    catalogo.push(criarProdutoPendente(produtoBase, enriquecido, ordem, siteInfoStore, motivoPendencia, anterior));
    pendencias.push({
      codigo: produtoBase.codigo,
      modelo: produtoBase.modelo,
      produto: produtoBase.produto,
      motivo: motivoPendencia
    });
  }

  await fs.writeFile(caminhos.saida, JSON.stringify(catalogo, null, 2), "utf8");
  await fs.writeFile(caminhos.pendencias, JSON.stringify(pendencias, null, 2), "utf8");

  console.log("\nPrévia gerada.");
  console.log(`Produtos incluídos: ${catalogo.length}`);
  console.log(`Completos: ${catalogo.filter(item => !item.revisaoPendente).length}`);
  console.log(`Em revisão: ${catalogo.filter(item => item.revisaoPendente).length}`);
  console.log(`Incluídos com pendências: ${pendencias.length}`);
}

executar().catch(erro => {
  console.error("Erro ao gerar prévia:", erro.message);
  process.exitCode = 1;
});
