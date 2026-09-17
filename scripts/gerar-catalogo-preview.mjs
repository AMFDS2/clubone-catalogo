import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const caminhos = {
  base: path.join(raiz, "dados", "produtos-base.json"),
  atual: path.join(raiz, "produtos.json"),
  enriquecimento: path.join(raiz, "dados", "enriquecimento-automatico.json"),
  saida: path.join(raiz, "produtos.preview.json"),
  pendencias: path.join(raiz, "dados", "produtos-nao-incluidos.json")
};

const URL_INFO_STORE = "https://www.infostore.com.br";
const cacheLinksInfoStore = new Map();

function chave(valor = "") {
  return String(valor).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function marca(fabricante = "") {
  const valor = String(fabricante).trim();
  return valor.toLowerCase().includes("samsung") ? "Samsung" : valor;
}

function categoria(segmento = "") {
  const mapa = {
    VIDEO: "Video",
    AUDIO: "Audio",
    "ÁUDIO": "Audio",
    "LINHA BRANCA": "Linha Branca",
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

function criarUrlBuscaInfoStore(termo = "") {
  const valor = String(termo).trim().toUpperCase();
  if (!valor) return URL_INFO_STORE;

  return `${URL_INFO_STORE}/${encodeURIComponent(valor.toLowerCase())}?_q=${encodeURIComponent(valor)}&map=ft`;
}

function urlParecePaginaDeProduto(url = "") {
  return typeof url === "string" && /\/p(?:\?|$)/i.test(url);
}

function normalizarLinkProduto(produto = {}) {
  if (produto.link && urlParecePaginaDeProduto(produto.link)) {
    return produto.link;
  }

  if (produto.linkText) {
    return `${URL_INFO_STORE}/${String(produto.linkText).replace(/^\/+/, "")}/p`;
  }

  return "";
}

function produtoCorresponde(produto, codigo, modelo) {
  const codigoNormalizado = chave(codigo);
  const modeloNormalizado = chave(modelo);
  const referencias = [
    produto.productReference,
    produto.productName,
    produto.productTitle,
    produto.linkText,
    produto.description
  ];

  if (Array.isArray(produto.items)) {
    produto.items.forEach(item => {
      referencias.push(item.itemId, item.name, item.nameComplete, item.referenceId);

      if (Array.isArray(item.referenceId)) {
        item.referenceId.forEach(referencia => {
          referencias.push(referencia?.Value, referencia?.Key);
        });
      }
    });
  }

  const textoNormalizado = chave(
    referencias
      .filter(Boolean)
      .map(valor => typeof valor === "object" ? JSON.stringify(valor) : String(valor))
      .join(" ")
  );

  return (
    (codigoNormalizado && textoNormalizado.includes(codigoNormalizado)) ||
    (modeloNormalizado && textoNormalizado.includes(modeloNormalizado))
  );
}

async function consultarInfoStore(termo = "") {
  const valor = String(termo).trim();
  if (!valor) return [];

  const url = `${URL_INFO_STORE}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(valor)}`;
  const resposta = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  });

  if (!resposta.ok) {
    throw new Error(`Info Store retornou HTTP ${resposta.status}`);
  }

  const dados = await resposta.json();
  return Array.isArray(dados) ? dados : [];
}

async function localizarUrlInfoStore(codigo, modelo, urlAnterior = "") {
  const codigoLimpo = String(codigo).trim().toUpperCase();
  const modeloLimpo = String(modelo).trim().toUpperCase();
  const chaveCache = `${codigoLimpo}|${modeloLimpo}`;

  if (cacheLinksInfoStore.has(chaveCache)) {
    return cacheLinksInfoStore.get(chaveCache);
  }

  for (const termo of [codigoLimpo, modeloLimpo].filter(Boolean)) {
    try {
      const resultados = await consultarInfoStore(termo);
      if (!resultados.length) continue;

      const produtoEncontrado = resultados.find(produto =>
        produtoCorresponde(produto, codigoLimpo, modeloLimpo)
      );

      if (!produtoEncontrado) continue;

      const link = normalizarLinkProduto(produtoEncontrado);
      if (link) {
        cacheLinksInfoStore.set(chaveCache, link);
        return link;
      }
    } catch (erro) {
      console.warn(`  Aviso Info Store (${termo}): ${erro.message}`);
    }
  }

  const fallback = criarUrlBuscaInfoStore(codigoLimpo || modeloLimpo);
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
  return Object.fromEntries(
    Object.entries(especificacoes).filter(([, valor]) => valor !== "" && valor != null)
  );
}

function criarProdutoNovo(base, enriquecido, ordem, siteInfoStore) {
  const cat = categoria(base.segmento);

  return {
    id: chave(base.modelo).toLowerCase() || chave(base.codigo).toLowerCase(),
    ordem,
    marca: marca(base.fabricante),
    modelo: base.modelo || "Não informado",
    nome: base.produto,
    descricao: enriquecido.descricao || base.produto,
    codigoInfo: base.codigo,
    categoria: cat,
    segmento: base.segmento,
    imagem: enriquecido.imagem,
    imagens: Array.isArray(enriquecido.imagens) && enriquecido.imagens.length
      ? enriquecido.imagens
      : [enriquecido.imagem].filter(Boolean),
    siteInfoStore,
    destaques: destaques(enriquecido.destaques),
    especificacoes: {
      Modelo: base.modelo || "Não informado",
      Categoria: cat,
      "Código Info Store": base.codigo,
      ...limparEspecificacoes(enriquecido.especificacoes)
    },
    dimensoes: enriquecido.dimensoes || {},
    instalacao: "Valide medidas, ventilação, pontos elétricos, hidráulicos e requisitos estruturais antes da instalação.",
    documentos: [],
    sobreMarca: "Consulte as especificações, disponibilidade e condições comerciais com a equipe Info Store.",
    revisaoPendente: enriquecido.statusExtracao !== "EXTRAIDO"
  };
}

function criarProdutoPendente(base, ordem, siteInfoStore, motivoPendencia) {
  const cat = categoria(base.segmento);

  return {
    id: chave(base.modelo).toLowerCase() || chave(base.codigo).toLowerCase(),
    ordem,
    marca: marca(base.fabricante),
    modelo: base.modelo || "Não informado",
    nome: base.produto,
    descricao: base.produto,
    codigoInfo: base.codigo,
    categoria: cat,
    segmento: base.segmento,
    imagem: "assets/produto-sem-imagem.png",
    imagens: ["assets/produto-sem-imagem.png"],
    siteInfoStore,
    destaques: [],
    especificacoes: {
      Modelo: base.modelo || "Não informado",
      Categoria: cat,
      "Código Info Store": base.codigo
    },
    dimensoes: {},
    instalacao: "Informações técnicas de instalação em atualização.",
    documentos: [],
    sobreMarca: "Consulte disponibilidade e condições comerciais com a equipe Info Store.",
    revisaoPendente: true,
    motivoPendencia
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
    const modelo = chave(produtoBase.modelo);
    const anterior = atualPorModelo.get(modelo);
    const enriquecido = enriquecidoPorModelo.get(modelo);
    const ordem = base.length - indice;

    console.log(
      `[${indice + 1}/${base.length}] Localizando Info Store: ${produtoBase.codigo} / ${produtoBase.modelo}`
    );

    const siteInfoStore = await localizarUrlInfoStore(
      produtoBase.codigo,
      produtoBase.modelo,
      anterior?.siteInfoStore
    );

    if (enriquecido?.imagem) {
      catalogo.push(criarProdutoNovo(produtoBase, enriquecido, ordem, siteInfoStore));
      continue;
    }

    if (anterior?.imagem) {
      catalogo.push({
        ...anterior,
        ordem,
        marca: marca(produtoBase.fabricante),
        modelo: produtoBase.modelo || "Não informado",
        nome: produtoBase.produto,
        codigoInfo: produtoBase.codigo,
        categoria: categoria(produtoBase.segmento),
        segmento: produtoBase.segmento,
        siteFabricante: undefined,
        imagens: Array.isArray(anterior.imagens) && anterior.imagens.length
          ? anterior.imagens
          : [anterior.imagem].filter(Boolean),
        siteInfoStore
      });
      continue;
    }

    const motivoPendencia = enriquecido
      ? "Imagem não disponível"
      : "Fonte ainda precisa de revisão";

    catalogo.push(criarProdutoPendente(produtoBase, ordem, siteInfoStore, motivoPendencia));
    pendencias.push({
      codigo: produtoBase.codigo,
      modelo: produtoBase.modelo,
      produto: produtoBase.produto,
      motivo: motivoPendencia
    });
  }

  await fs.writeFile(caminhos.saida, JSON.stringify(catalogo, null, 2), "utf8");
  await fs.writeFile(caminhos.pendencias, JSON.stringify(pendencias, null, 2), "utf8");

  console.log("");
  console.log("Prévia gerada.");
  console.log(`Produtos incluídos: ${catalogo.length}`);
  console.log(`Completos: ${catalogo.filter(item => !item.revisaoPendente).length}`);
  console.log(`Em revisão: ${catalogo.filter(item => item.revisaoPendente).length}`);
  console.log(`Incluídos com pendências: ${pendencias.length}`);
}

executar().catch(erro => {
  console.error("Erro ao gerar prévia:", erro.message);
  process.exitCode = 1;
});
