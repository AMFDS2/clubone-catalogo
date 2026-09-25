import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { extrairOffline } from "./extrair-offline-manuais.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arquivoCatalogo = path.join(raiz, "produtos.preview.json");
const apiKey = process.env.GEMINI_API_KEY;
const modeloPrimario = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const modelosFallback = [...new Set([
  modeloPrimario,
  ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
])];
const modeloRevisao = process.env.GEMINI_REVIEW_MODEL === "off"
  ? ""
  : process.env.GEMINI_REVIEW_MODEL || "gemini-2.5-flash";
const forcar = process.argv.includes("--force");
const completar = process.argv.includes("--completar");
const rapido = process.argv.includes("--rapido");
const somenteOffline = process.argv.includes("--offline");
const somenteOnline = process.argv.includes("--online");
const modoHibrido = !somenteOffline && !somenteOnline;
const argumentoModelo = process.argv.find(item => item.startsWith("--modelo="));
const filtroModelo = argumentoModelo?.split("=").slice(1).join("=").trim().toUpperCase() || "";
const limiteBytes = 50 * 1024 * 1024;

if (!apiKey && !somenteOffline) {
  console.error("ERRO: defina GEMINI_API_KEY antes de executar a extração.");
  process.exit(1);
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const campoMedida = {
  type: "object",
  properties: {
    valor: { type: "string", description: "Valor com unidade exatamente como consta no manual, ou string vazia." },
    pagina: { type: "string", description: "Página do PDF em que a informação foi localizada, ou string vazia." },
    referencia: { type: "string", description: "Número/letra da cota na figura ou título exato da tabela; vazio quando não houver." },
    status: { type: "string", enum: ["CONFIRMADO", "REVISAR", "NAO_LOCALIZADO", "NAO_APLICAVEL"] },
    observacao: { type: "string" }
  },
  required: ["valor", "pagina", "referencia", "status", "observacao"]
};

const schema = {
  type: "object",
  properties: {
    dimensoesProduto: {
      type: "object",
      properties: { largura: campoMedida, altura: campoMedida, profundidade: campoMedida },
      required: ["largura", "altura", "profundidade"]
    },
    dimensoesNicho: {
      type: "object",
      properties: { largura: campoMedida, altura: campoMedida, profundidade: campoMedida },
      required: ["largura", "altura", "profundidade"]
    },
    folgas: {
      type: "object",
      properties: { superior: campoMedida, lateral: campoMedida, traseira: campoMedida, frontal: campoMedida },
      required: ["superior", "lateral", "traseira", "frontal"]
    },
    abertura: {
      type: "object",
      properties: {
        anguloPorta: campoMedida,
        distanciaPortasAbertas: campoMedida,
        distanciaGavetasEstendidas: campoMedida
      },
      required: ["anguloPorta", "distanciaPortasAbertas", "distanciaGavetasEstendidas"]
    },
    geometriaInstalacao: {
      type: "object",
      properties: {
        larguraProduto: campoMedida,
        alturaProduto: campoMedida,
        profundidadeTotalProduto: campoMedida,
        profundidadeGabinete: campoMedida,
        larguraComPortasAbertas: campoMedida,
        profundidadeComPortasAbertas: campoMedida,
        profundidadeComGavetasEstendidas: campoMedida,
        anguloAbertura: campoMedida,
        anguloAberturaEsquerda: campoMedida,
        anguloAberturaDireita: campoMedida,
        afastamentoTraseiro: campoMedida,
        folgaLateral: campoMedida,
        folgaLateralEsquerda: campoMedida,
        folgaLateralDireita: campoMedida,
        zeroClearance: campoMedida,
        avancoFrontal: campoMedida
      },
      required: [
        "larguraProduto", "alturaProduto", "profundidadeTotalProduto", "profundidadeGabinete",
        "larguraComPortasAbertas", "profundidadeComPortasAbertas",
        "profundidadeComGavetasEstendidas", "anguloAbertura", "anguloAberturaEsquerda",
        "anguloAberturaDireita", "afastamentoTraseiro", "folgaLateral",
        "folgaLateralEsquerda", "folgaLateralDireita", "zeroClearance", "avancoFrontal"
      ]
    },
    instalacao: {
      type: "object",
      properties: { pontoEletrico: campoMedida, pontoAgua: campoMedida, pontoGas: campoMedida, dreno: campoMedida },
      required: ["pontoEletrico", "pontoAgua", "pontoGas", "dreno"]
    },
    observacoes: { type: "array", items: { type: "string" } }
  },
  required: ["dimensoesProduto", "dimensoesNicho", "folgas", "abertura", "geometriaInstalacao", "instalacao", "observacoes"]
};

function normalizarModelo(valor = "") {
  return String(valor).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function urlOriginal(documento = {}) {
  return String(documento.urlOriginal || documento.url || "").replace(/\\/g, "/");
}

function selecionarManuais(produto = {}) {
  const documentos = Array.isArray(produto.documentos) ? produto.documentos : [];
  const pdfs = documentos.filter(documento => {
    const url = urlOriginal(documento);
    return url && /\.pdf(?:$|[?#])/i.test(url);
  });

  const unicos = new Map();
  pdfs.forEach(documento => unicos.set(urlOriginal(documento), documento));
  return [...unicos.values()]
    .sort((a, b) => {
      const prioridade = documento => /instala|installation|manual|user|guide/i.test(
        `${documento.tipo || ""} ${documento.nome || ""} ${documento.descricao || ""}`
      ) ? 0 : 1;
      return prioridade(a) - prioridade(b);
    })
    .slice(0, 4);
}

async function baixarPdf(url) {
  const resposta = await fetch(url, {
    signal: AbortSignal.timeout(60000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      Accept: "application/pdf,*/*"
    }
  });
  if (!resposta.ok) throw new Error(`download do manual retornou HTTP ${resposta.status}`);

  const tamanhoInformado = Number(resposta.headers.get("content-length") || 0);
  if (tamanhoInformado > limiteBytes) throw new Error("manual maior que 50 MB");

  const bytes = Buffer.from(await resposta.arrayBuffer());
  if (bytes.length > limiteBytes) throw new Error("manual maior que 50 MB");

  const inicio = bytes.subarray(0, 500).toString("utf8").toLowerCase();
  if (!bytes.subarray(0, 5).toString("ascii").startsWith("%PDF") || inicio.includes("<html")) {
    throw new Error("o endereço não devolveu um PDF válido");
  }
  return bytes;
}

async function extrair(produto, pdfs, modelo, instrucaoExtra = "") {
  const prompt = `Você é um extrator técnico para um catálogo destinado a arquitetos.
Analise exclusivamente o manual PDF anexado do produto modelo ${produto.modelo || "não informado"}.

Regras obrigatórias:
1. Não estime, não calcule e não complete medidas por conhecimento externo.
2. Use CONFIRMADO somente quando o valor estiver explicitamente presente no manual.
3. Use REVISAR quando houver informação relacionada, mas ambígua, condicionada ou dependente de configuração.
4. Use NAO_LOCALIZADO e valor vazio quando a informação não estiver no PDF.
5. Informe a página exata do PDF em todo campo confirmado ou para revisão.
6. Preserve a unidade encontrada; prefira milímetros quando o próprio manual apresentar milímetros.
7. Diferencie dimensão física do produto, medida do nicho e folga de ventilação.
8. Em observações, registre apenas avisos de instalação presentes no manual.
9. Compare todos os PDFs enviados: manual do usuário, instalação e fichas técnicas podem se complementar.
10. Em desenhos numerados, copie também o número/letra da cota para referencia.
11. Não use um campo genérico de "portas abertas" sem identificar o eixo da medida.
12. larguraComPortasAbertas é a distância horizontal total entre as extremidades das portas abertas.
13. profundidadeComPortasAbertas é a distância perpendicular da parede/fundo até a extremidade frontal da porta aberta.
14. profundidadeComGavetasEstendidas é a distância perpendicular da parede/fundo até a gaveta totalmente estendida.
15. Diferencie profundidadeTotalProduto de profundidadeGabinete/sem portas.
16. Afastamento entre parede traseira e produto deve ser afastamentoTraseiro, nunca folga superior.
17. Se a orientação do desenho ou o eixo da cota não estiver inequívoco, use REVISAR.
18. Para CONFIRMADO, exija valor, página e descrição/referência suficientes para auditoria.
19. Retorne apenas o JSON definido pelo esquema.
20. Quando uma tabela possuir colunas para modelos diferentes, selecione exclusivamente a coluna correspondente ao modelo solicitado.
21. Nunca utilize um valor da coluna de um modelo vizinho, semelhante ou da mesma família.
22. Para o modelo RF29DB9950QDAZ, utilize a coluna RF29D**, nunca a coluna RF23D**.
23. Registre em referencia o número da cota e a coluna utilizada, por exemplo: "RF29D** / item 05".
24. Se não for possível confirmar a coluna exata do modelo, use REVISAR, nunca CONFIRMADO.
25. Não substitua profundidade do gabinete pela profundidade externa total do produto.
26. Em produtos Side by Side, extraia separadamente os ângulos das portas esquerda e direita.
27. Em produtos Side by Side, extraia separadamente as folgas laterais esquerda e direita.
28. Não una valores diferentes em textos como "165° / 170°"; use os campos correspondentes a cada lado.
29. A cota horizontal entre as extremidades das portas abertas pertence a larguraComPortasAbertas.
30. A cota perpendicular da parede até a frente aberta pertence a profundidadeComPortasAbertas.
31. Se o manual apresentar várias famílias em colunas, confronte o modelo normalizado com o cabeçalho e registre a coluna em referencia.
${instrucaoExtra}`;

  const requisicao = {
    model: modelo,
    contents: [{
      role: "user",
      parts: [
        ...pdfs.map(item => ({ inlineData: { data: item.bytes.toString("base64"), mimeType: "application/pdf" } })),
        { text: `${prompt}\nO JSON deve conter todos os grupos e campos definidos pelo esquema técnico, inclusive campos vazios quando não localizados.` }
      ]
    }],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseJsonSchema: schema
    }
  };

  let resposta;
  try {
    resposta = await ai.models.generateContent(requisicao);
  } catch (erro) {
    if (!/400|invalid_argument|invalid argument/i.test(String(erro?.message || erro))) throw erro;
    process.stdout.write("esquema incompatível; tentando JSON simples; ");
    const requisicaoSimples = {
      ...requisicao,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };
    resposta = await ai.models.generateContent(requisicaoSimples);
  }

  const texto = resposta.text || "";
  if (!texto) throw new Error("Gemini devolveu uma resposta vazia");
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(limpo);
}

function camposTecnicos(dados = {}) {
  return [
    ["dimensoesProduto", "largura"], ["dimensoesProduto", "altura"], ["dimensoesProduto", "profundidade"],
    ["dimensoesNicho", "largura"], ["dimensoesNicho", "altura"], ["dimensoesNicho", "profundidade"],
    ["folgas", "superior"], ["folgas", "lateral"], ["folgas", "traseira"], ["folgas", "frontal"],
    ["abertura", "anguloPorta"], ["abertura", "distanciaPortasAbertas"], ["abertura", "distanciaGavetasEstendidas"],
    ["geometriaInstalacao", "larguraProduto"], ["geometriaInstalacao", "alturaProduto"],
    ["geometriaInstalacao", "profundidadeTotalProduto"], ["geometriaInstalacao", "profundidadeGabinete"],
    ["geometriaInstalacao", "larguraComPortasAbertas"], ["geometriaInstalacao", "profundidadeComPortasAbertas"],
    ["geometriaInstalacao", "profundidadeComGavetasEstendidas"], ["geometriaInstalacao", "anguloAbertura"],
    ["geometriaInstalacao", "anguloAberturaEsquerda"], ["geometriaInstalacao", "anguloAberturaDireita"],
    ["geometriaInstalacao", "afastamentoTraseiro"], ["geometriaInstalacao", "folgaLateral"],
    ["geometriaInstalacao", "folgaLateralEsquerda"], ["geometriaInstalacao", "folgaLateralDireita"],
    ["geometriaInstalacao", "zeroClearance"], ["geometriaInstalacao", "avancoFrontal"],
    ["instalacao", "pontoEletrico"], ["instalacao", "pontoAgua"], ["instalacao", "pontoGas"], ["instalacao", "dreno"]
  ];
}

function numeroMedida(campo = {}) {
  const encontrado = String(campo.valor || "").replace(/\./g, "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return encontrado ? Number(encontrado[0]) : NaN;
}

function marcarRevisao(campo, motivo) {
  if (!campo || campo.status === "NAO_LOCALIZADO" || campo.status === "NAO_APLICAVEL") return;
  campo.status = "REVISAR";
  campo.observacao = [campo.observacao, motivo].filter(Boolean).join(" | ");
}

const statusPermitidos = new Set(["CONFIRMADO", "REVISAR", "NAO_LOCALIZADO", "NAO_APLICAVEL"]);

function campoVazio(status = "NAO_LOCALIZADO") {
  return { valor: "", pagina: "", referencia: "", status, observacao: "" };
}

function normalizarCampo(campo) {
  const normalizado = { ...campoVazio(), ...(campo && typeof campo === "object" ? campo : {}) };
  for (const chave of ["valor", "pagina", "referencia", "observacao"]) {
    normalizado[chave] = String(normalizado[chave] ?? "").trim();
  }
  normalizado.status = statusPermitidos.has(normalizado.status) ? normalizado.status : "REVISAR";

  if (["NAO_LOCALIZADO", "NAO_APLICAVEL"].includes(normalizado.status)) {
    normalizado.valor = "";
    normalizado.pagina = "";
    normalizado.referencia = "";
  } else if (!normalizado.valor || !normalizado.pagina) {
    normalizado.status = "REVISAR";
    normalizado.observacao = [normalizado.observacao, "Evidência incompleta: valor e página são obrigatórios."].filter(Boolean).join(" | ");
  } else if (!normalizado.referencia) {
    normalizado.observacao = [normalizado.observacao, "Referência não registrada no formato legado; preservar até nova conferência."].filter(Boolean).join(" | ");
  }
  return normalizado;
}

function mesmaMedida(a = {}, b = {}) {
  const na = numeroMedida(a);
  const nb = numeroMedida(b);
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 0.01;
}

function reconciliarDuplicado(dados, caminhoA, caminhoB) {
  const [grupoA, nomeA] = caminhoA;
  const [grupoB, nomeB] = caminhoB;
  const a = dados[grupoA][nomeA];
  const b = dados[grupoB][nomeB];
  if (a.status === "CONFIRMADO" && b.status !== "CONFIRMADO") dados[grupoB][nomeB] = { ...a };
  else if (b.status === "CONFIRMADO" && a.status !== "CONFIRMADO") dados[grupoA][nomeA] = { ...b };
  else if (a.status === "CONFIRMADO" && b.status === "CONFIRMADO" && !mesmaMedida(a, b)) {
    marcarRevisao(a, `Diverge de ${grupoB}.${nomeB}: ${b.valor}.`);
    marcarRevisao(b, `Diverge de ${grupoA}.${nomeA}: ${a.valor}.`);
  }
}

function normalizarResultado(dados = {}) {
  const resultado = structuredClone(dados && typeof dados === "object" ? dados : {});
  for (const [grupo, nome] of camposTecnicos(resultado)) {
    if (!resultado[grupo] || typeof resultado[grupo] !== "object") resultado[grupo] = {};
    resultado[grupo][nome] = normalizarCampo(resultado[grupo][nome]);
  }
  resultado.observacoes = Array.isArray(resultado.observacoes)
    ? [...new Set(resultado.observacoes.map(item => String(item).trim()).filter(Boolean))]
    : [];
  reconciliarDuplicado(resultado, ["dimensoesProduto", "largura"], ["geometriaInstalacao", "larguraProduto"]);
  reconciliarDuplicado(resultado, ["dimensoesProduto", "altura"], ["geometriaInstalacao", "alturaProduto"]);
  reconciliarDuplicado(resultado, ["dimensoesProduto", "profundidade"], ["geometriaInstalacao", "profundidadeTotalProduto"]);
  return resultado;
}

function auditarGeometria(dados = {}) {
  const g = dados.geometriaInstalacao || {};
  for (const campo of Object.values(g)) {
    if (campo?.status === "CONFIRMADO" && (!campo.valor || !campo.pagina || !campo.referencia)) {
      marcarRevisao(campo, "Confirmação rejeitada: faltam valor, página ou referência.");
    }
  }

  const largura = numeroMedida(g.larguraProduto);
  const larguraAberta = numeroMedida(g.larguraComPortasAbertas);
  if (Number.isFinite(largura) && Number.isFinite(larguraAberta) && larguraAberta <= largura) {
    marcarRevisao(g.larguraComPortasAbertas, "A largura com portas abertas deve superar a largura do produto.");
  }

  const profundidadeGabinete = numeroMedida(g.profundidadeGabinete);
  const profundidadeTotal = numeroMedida(g.profundidadeTotalProduto);
  if (Number.isFinite(profundidadeGabinete) && Number.isFinite(profundidadeTotal) && profundidadeGabinete > profundidadeTotal) {
    marcarRevisao(g.profundidadeGabinete, "A profundidade do gabinete não pode superar a profundidade total do produto.");
  }

  const profundidadeAberta = numeroMedida(g.profundidadeComPortasAbertas);
  if (Number.isFinite(profundidadeTotal) && Number.isFinite(profundidadeAberta) && profundidadeAberta <= profundidadeTotal) {
    marcarRevisao(g.profundidadeComPortasAbertas, "A profundidade com portas abertas deve superar a profundidade total do produto.");
  }

  for (const nome of ["anguloAbertura", "anguloAberturaEsquerda", "anguloAberturaDireita"]) {
    const angulo = numeroMedida(g[nome]);
    if (Number.isFinite(angulo) && (angulo <= 0 || angulo > 180)) {
      marcarRevisao(g[nome], "Ângulo fora do intervalo físico de 1° a 180°.");
    }
  }
  return dados;
}

function camposPendentes(dados = {}) {
  return camposTecnicos(dados)
    .filter(([grupo, campo]) => ["REVISAR", "NAO_LOCALIZADO"].includes(dados?.[grupo]?.[campo]?.status))
    .map(([grupo, campo]) => `${grupo}.${campo}`);
}

function criarValidacao(dados = {}) {
  const campos = camposTecnicos(dados).map(([grupo, nome]) => dados?.[grupo]?.[nome] || campoVazio());
  const contagem = campos.reduce((acc, campo) => {
    acc[campo.status] = (acc[campo.status] || 0) + 1;
    return acc;
  }, { CONFIRMADO: 0, REVISAR: 0, NAO_LOCALIZADO: 0, NAO_APLICAVEL: 0 });
  const utilizaveis = campos.length - contagem.NAO_APLICAVEL;
  const percentualConfirmado = utilizaveis ? Math.round((contagem.CONFIRMADO / utilizaveis) * 100) : 0;
  const status = contagem.REVISAR
    ? "REVISAO_NECESSARIA"
    : contagem.CONFIRMADO ? "APROVADO_PARA_DESENHO" : "DADOS_INSUFICIENTES";
  return { status, percentualConfirmado, contagem };
}

function combinarResultados(primeiro = {}, segundo = {}) {
  const combinado = structuredClone(primeiro);

  for (const [grupo, campo] of camposTecnicos(primeiro)) {
    if (!combinado[grupo]) combinado[grupo] = {};
    const atual = combinado?.[grupo]?.[campo];
    const revisado = segundo?.[grupo]?.[campo];
    if (!revisado) continue;

    if (atual?.status !== "CONFIRMADO" && revisado.status === "CONFIRMADO") {
      combinado[grupo][campo] = revisado;
      continue;
    }

    if (atual?.status === "CONFIRMADO" && revisado.status === "CONFIRMADO" && atual.valor !== revisado.valor) {
      combinado[grupo][campo] = {
        ...atual,
        status: "REVISAR",
        observacao: `Resultados divergentes: ${atual.valor} e ${revisado.valor}. Conferir páginas ${atual.pagina || "?"} e ${revisado.pagina || "?"}.`
      };
    }
  }

  combinado.observacoes = [...new Set([
    ...(Array.isArray(primeiro.observacoes) ? primeiro.observacoes : []),
    ...(Array.isArray(segundo.observacoes) ? segundo.observacoes : [])
  ])];
  return combinado;
}

async function extrairComTentativas(produto, pdfs, modelo, instrucaoExtra = "", maximo = 3) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= maximo; tentativa++) {
    try {
      return await extrair(produto, pdfs, modelo, instrucaoExtra);
    } catch (erro) {
      ultimoErro = erro;
      if (!/429|503|quota|resource_exhausted|unavailable|high demand/i.test(erro.message) || tentativa === maximo) throw erro;
      const espera = tentativa * 12000;
      process.stdout.write(`aguardando ${espera / 1000}s; `);
      await new Promise(resolve => setTimeout(resolve, espera));
    }
  }
  throw ultimoErro;
}

function erroPermiteFallback(erro) {
  return /400|404|429|503|invalid_argument|not_found|no longer available|quota|resource_exhausted|unavailable|high demand/i
    .test(String(erro?.message || erro));
}

async function extrairComFallback(produto, pdfs, instrucaoExtra = "", modelos = modelosFallback) {
  let ultimoErro;
  for (const modelo of modelos) {
    process.stdout.write(`[${modelo}] `);
    try {
      const dados = await extrairComTentativas(
        produto,
        pdfs,
        modelo,
        instrucaoExtra,
        rapido ? 1 : 2
      );
      return { dados, modeloUsado: modelo };
    } catch (erro) {
      ultimoErro = erro;
      if (!erroPermiteFallback(erro)) throw erro;
      process.stdout.write(`indisponível; `);
    }
  }
  throw ultimoErro || new Error("nenhum modelo Gemini disponível");
}

async function salvar(catalogo) {
  const temporario = `${arquivoCatalogo}.tmp`;
  await fs.writeFile(temporario, `${JSON.stringify(catalogo, null, 2)}\n`, "utf8");
  await fs.rename(temporario, arquivoCatalogo);
}

async function executar() {
  const catalogo = JSON.parse(await fs.readFile(arquivoCatalogo, "utf8"));
  let atualizados = 0;
  let ignorados = 0;
  let erros = 0;

  for (const produto of catalogo) {
    if (filtroModelo && normalizarModelo(produto.modelo) !== normalizarModelo(filtroModelo)) continue;
    const pendentesAtuais = camposPendentes(produto.medidasProjeto || {});
    if (produto.medidasProjeto && !forcar && !(completar && pendentesAtuais.length)) { ignorados++; continue; }

    const manuais = selecionarManuais(produto);
    if (!manuais.length) { ignorados++; continue; }

    process.stdout.write(`Processando ${produto.modelo}: `);
    try {
      const pdfs = [];
      for (const manual of manuais) {
        try {
          pdfs.push({ manual, bytes: await baixarPdf(urlOriginal(manual)) });
        } catch (erro) {
          process.stdout.write(`PDF ignorado (${erro.message}); `);
        }
      }
      if (!pdfs.length) throw new Error("nenhum PDF oficial pôde ser baixado");

      const dadosAnteriores = produto.medidasProjeto || null;
      const baseParaBusca = completar && dadosAnteriores ? dadosAnteriores : null;
      const instrucaoInicial = baseParaBusca
        ? `Faça uma nova busca especialmente pelos campos ainda pendentes: ${pendentesAtuais.join(", ")}.`
        : "Extraia todos os campos do esquema.";

      let primeiraLeitura;
      let modeloUsado;
      if (somenteOffline) {
        process.stdout.write("[offline] ");
        primeiraLeitura = await extrairOffline(produto, pdfs);
        modeloUsado = "offline-pdfjs";
      } else {
        try {
          const primeiraExecucao = await extrairComFallback(produto, pdfs, instrucaoInicial);
          primeiraLeitura = primeiraExecucao.dados;
          modeloUsado = primeiraExecucao.modeloUsado;
        } catch (erro) {
          if (!modoHibrido || !/429|503|quota|resource_exhausted|unavailable|high demand/i.test(String(erro?.message || erro))) throw erro;
          process.stdout.write("serviço online indisponível; continuando offline; ");
          primeiraLeitura = await extrairOffline(produto, pdfs);
          modeloUsado = "offline-pdfjs-fallback";
        }
      }
      const preservarDadosAnteriores = Boolean(dadosAnteriores && (completar || modeloUsado.startsWith("offline-")));
      let dados = normalizarResultado(preservarDadosAnteriores
        ? combinarResultados(dadosAnteriores, primeiraLeitura)
        : primeiraLeitura);
      const pendentes = camposPendentes(dados);

      if (!somenteOffline && !modeloUsado.startsWith("offline-") && !rapido && pendentes.length && modeloRevisao && modeloRevisao !== modeloUsado) {
        process.stdout.write(`revisando ${pendentes.length} campo(s); `);
        try {
          const segundaLeitura = await extrairComTentativas(
            produto,
            pdfs,
            modeloRevisao,
            `Concentre a análise nestes campos: ${pendentes.join(", ")}. Examine também desenhos, notas de rodapé e tabelas técnicas. Não altere para CONFIRMADO sem página e evidência explícita.`,
            2
          );
          dados = normalizarResultado(combinarResultados(dados, segundaLeitura));
        } catch (erro) {
          process.stdout.write(`revisão indisponível (${erro.message}); mantendo Lite; `);
        }
      }

      dados = auditarGeometria(normalizarResultado(dados));
      produto.medidasProjeto = {
        ...dados,
        validacao: criarValidacao(dados),
        fonte: {
          nome: pdfs.map(item => item.manual.nome || "Manual oficial").join(" + "),
          url: urlOriginal(pdfs[0].manual),
          documentos: pdfs.map(item => ({ nome: item.manual.nome || "Manual oficial", url: urlOriginal(item.manual) })),
          modelo: modeloUsado,
          modeloRevisao: modeloRevisao || "",
          extraidoEm: new Date().toISOString()
        },
        revisado: false
      };
      atualizados++;
      await salvar(catalogo);
      console.log("OK");
      await new Promise(resolve => setTimeout(resolve, 2500));
    } catch (erro) {
      erros++;
      console.log(`ERRO - ${erro.message}`);
      if (/503|unavailable|high demand/i.test(erro.message)) {
        console.log("O serviço Gemini está temporariamente indisponível. Nenhum dado foi alterado; tente novamente em alguns minutos.");
      }
      if (/429|quota|resource_exhausted/i.test(erro.message)) {
        console.log("Limite gratuito atingido. Aguarde e execute novamente; os produtos já concluídos serão ignorados.");
        break;
      }
    }
  }
  console.log(`\nConcluído: ${atualizados} atualizado(s), ${ignorados} ignorado(s), ${erros} erro(s).`);
}

executar().catch(erro => {
  console.error(`Falha na extração: ${erro.message}`);
  process.exitCode = 1;
});
