import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const campoVazio = () => ({ valor: "", pagina: "", referencia: "", status: "NAO_LOCALIZADO", observacao: "" });
const estrutura = {
  dimensoesProduto: ["largura", "altura", "profundidade"],
  dimensoesNicho: ["largura", "altura", "profundidade"],
  folgas: ["superior", "lateral", "traseira", "frontal"],
  abertura: ["anguloPorta", "distanciaPortasAbertas", "distanciaGavetasEstendidas"],
  geometriaInstalacao: ["larguraProduto", "alturaProduto", "profundidadeTotalProduto", "profundidadeGabinete", "larguraComPortasAbertas", "profundidadeComPortasAbertas", "profundidadeComGavetasEstendidas", "anguloAbertura", "anguloAberturaEsquerda", "anguloAberturaDireita", "afastamentoTraseiro", "folgaLateral", "folgaLateralEsquerda", "folgaLateralDireita", "zeroClearance", "avancoFrontal"],
  instalacao: ["pontoEletrico", "pontoAgua", "pontoGas", "dreno"]
};

const regras = [
  ["geometriaInstalacao", "larguraComPortasAbertas", /largura.{0,25}(?:total.{0,12})?(?:com\s+)?portas?\s+abertas?|dist[aâ]ncia.{0,20}portas?\s+abertas?/i, "medida"],
  ["geometriaInstalacao", "profundidadeComPortasAbertas", /profundidade.{0,25}(?:com\s+)?portas?\s+abertas?/i, "medida"],
  ["geometriaInstalacao", "profundidadeComGavetasEstendidas", /profundidade.{0,25}gavetas?\s+(?:totalmente\s+)?(?:abertas?|estendidas?)/i, "medida"],
  ["geometriaInstalacao", "profundidadeGabinete", /profundidade.{0,18}(?:do\s+)?gabinete|profundidade.{0,18}sem\s+portas?/i, "medida"],
  ["geometriaInstalacao", "afastamentoTraseiro", /afastamento.{0,18}traseir|dist[aâ]ncia.{0,18}parede.{0,18}traseir/i, "medida"],
  ["geometriaInstalacao", "folgaLateralEsquerda", /folga.{0,12}lateral.{0,12}esquerd/i, "medida"],
  ["geometriaInstalacao", "folgaLateralDireita", /folga.{0,12}lateral.{0,12}direit/i, "medida"],
  ["geometriaInstalacao", "folgaLateral", /folga.{0,18}lateral|laterais.{0,18}(?:mín|min|recomend)/i, "medida"],
  ["folgas", "superior", /folga.{0,18}superior|acima.{0,18}(?:mín|min|recomend)/i, "medida"],
  ["folgas", "lateral", /folga.{0,18}lateral|laterais.{0,18}(?:mín|min|recomend)/i, "medida"],
  ["folgas", "traseira", /folga.{0,18}traseir|atr[aá]s.{0,18}(?:mín|min|recomend)/i, "medida"],
  ["folgas", "frontal", /folga.{0,18}frontal|espa[cç]o.{0,18}frontal/i, "medida"],
  ["geometriaInstalacao", "anguloAberturaEsquerda", /[aâ]ngulo.{0,18}(?:porta\s+)?esquerd/i, "angulo"],
  ["geometriaInstalacao", "anguloAberturaDireita", /[aâ]ngulo.{0,18}(?:porta\s+)?direit/i, "angulo"],
  ["geometriaInstalacao", "anguloAbertura", /[aâ]ngulo.{0,18}(?:de\s+)?abertura/i, "angulo"],
  ["abertura", "anguloPorta", /[aâ]ngulo.{0,18}(?:da\s+)?porta|abertura.{0,12}\d{2,3}\s*°/i, "angulo"],
  ["dimensoesNicho", "largura", /largura.{0,18}(?:do\s+)?(?:nicho|gabinete|marcenaria)/i, "medida"],
  ["dimensoesNicho", "altura", /altura.{0,18}(?:do\s+)?(?:nicho|gabinete|marcenaria)/i, "medida"],
  ["dimensoesNicho", "profundidade", /profundidade.{0,18}(?:do\s+)?(?:nicho|marcenaria)/i, "medida"],
  ["geometriaInstalacao", "larguraProduto", /largura.{0,18}(?:do\s+)?produto/i, "medida"],
  ["geometriaInstalacao", "alturaProduto", /altura.{0,18}(?:do\s+)?produto/i, "medida"],
  ["geometriaInstalacao", "profundidadeTotalProduto", /profundidade.{0,12}total|profundidade.{0,18}(?:do\s+)?produto/i, "medida"],
  ["dimensoesProduto", "largura", /(?:^|\s)largura(?:\s*\([a-z]\))?\s*[:\-]?/i, "medida"],
  ["dimensoesProduto", "altura", /(?:^|\s)altura(?:\s*\([a-z]\))?\s*[:\-]?/i, "medida"],
  ["dimensoesProduto", "profundidade", /(?:^|\s)profundidade(?:\s*\([a-z]\))?\s*[:\-]?/i, "medida"]
];

function criarResultado() {
  const resultado = { observacoes: [] };
  for (const [grupo, nomes] of Object.entries(estrutura)) {
    resultado[grupo] = Object.fromEntries(nomes.map(nome => [nome, campoVazio()]));
  }
  return resultado;
}

function linhasDaPagina(itens) {
  const linhas = new Map();
  for (const item of itens) {
    const y = Math.round((item.transform?.[5] || 0) / 3) * 3;
    if (!linhas.has(y)) linhas.set(y, []);
    linhas.get(y).push({ x: item.transform?.[4] || 0, texto: String(item.str || "").trim() });
  }
  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, partes]) => partes.sort((a, b) => a.x - b.x).map(item => item.texto).filter(Boolean).join(" "))
    .filter(Boolean);
}

function extrairValor(texto, tipo) {
  const regex = tipo === "angulo"
    ? /\b\d{2,3}(?:[.,]\d+)?\s*(?:°|graus?)\b/i
    : /\b\d{1,4}(?:[.,]\d+)?\s*(?:mm|cm|m)\b/i;
  return texto.match(regex)?.[0]?.replace(/\s+/g, " ") || "";
}

function adicionarCandidato(mapa, grupo, nome, candidato) {
  const chave = `${grupo}.${nome}`;
  if (!mapa.has(chave)) mapa.set(chave, []);
  if (!mapa.get(chave).some(item => item.valor === candidato.valor && item.pagina === candidato.pagina)) {
    mapa.get(chave).push(candidato);
  }
}

function aplicarCandidatos(resultado, candidatos) {
  for (const [chave, itens] of candidatos) {
    const [grupo, nome] = chave.split(".");
    const valores = [...new Set(itens.map(item => item.valor))];
    const escolhido = itens[0];
    resultado[grupo][nome] = {
      valor: valores.length === 1 ? escolhido.valor : valores.join(" / "),
      pagina: [...new Set(itens.map(item => item.pagina))].join(", "),
      referencia: escolhido.referencia,
      status: valores.length === 1 && escolhido.forte ? "CONFIRMADO" : "REVISAR",
      observacao: valores.length === 1
        ? "Extração local do texto do manual."
        : "Mais de um valor associado ao campo; conferir a tabela ou o desenho."
    };
  }
}

function copiarConfirmado(resultado, origem, destino) {
  const [go, no] = origem;
  const [gd, nd] = destino;
  if (resultado[go][no].status === "CONFIRMADO" && resultado[gd][nd].status === "NAO_LOCALIZADO") {
    resultado[gd][nd] = { ...resultado[go][no] };
  }
}

export async function extrairOffline(produto, pdfs) {
  const resultado = criarResultado();
  const candidatos = new Map();
  const evidencias = [];

  for (const item of pdfs) {
    const documento = await getDocument({ data: new Uint8Array(item.bytes), disableWorker: true }).promise;
    for (let pagina = 1; pagina <= documento.numPages; pagina++) {
      const conteudo = await (await documento.getPage(pagina)).getTextContent();
      const linhas = linhasDaPagina(conteudo.items);
      for (let indice = 0; indice < linhas.length; indice++) {
        const linha = linhas[indice];
        const contexto = [linhas[indice - 1], linha, linhas[indice + 1]].filter(Boolean).join(" | ");
        for (const [grupo, nome, padrao, tipo] of regras) {
          if (!padrao.test(linha)) continue;
          const valor = extrairValor(linha, tipo) || extrairValor(contexto, tipo);
          if (!valor) continue;
          const forte = Boolean(extrairValor(linha, tipo)) && linha.length <= 180;
          const referencia = linha.slice(0, 150);
          adicionarCandidato(candidatos, grupo, nome, { valor, pagina: String(pagina), referencia, forte });
          evidencias.push(`pág. ${pagina}: ${referencia}`);
        }
      }
    }
  }

  aplicarCandidatos(resultado, candidatos);
  copiarConfirmado(resultado, ["dimensoesProduto", "largura"], ["geometriaInstalacao", "larguraProduto"]);
  copiarConfirmado(resultado, ["dimensoesProduto", "altura"], ["geometriaInstalacao", "alturaProduto"]);
  copiarConfirmado(resultado, ["dimensoesProduto", "profundidade"], ["geometriaInstalacao", "profundidadeTotalProduto"]);
  copiarConfirmado(resultado, ["geometriaInstalacao", "larguraProduto"], ["dimensoesProduto", "largura"]);
  copiarConfirmado(resultado, ["geometriaInstalacao", "alturaProduto"], ["dimensoesProduto", "altura"]);
  copiarConfirmado(resultado, ["geometriaInstalacao", "profundidadeTotalProduto"], ["dimensoesProduto", "profundidade"]);
  resultado.observacoes.push(`Extração offline: ${evidencias.length} evidência(s) localizada(s) para ${produto.modelo || "o produto"}.`);
  resultado.evidenciasOffline = [...new Set(evidencias)].slice(0, 80);
  return resultado;
}
