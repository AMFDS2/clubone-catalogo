import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const caminhoAtual = fileURLToPath(import.meta.url);
const pastaScripts = path.dirname(caminhoAtual);
const pastaProjeto = path.resolve(pastaScripts, "..");

const caminhoPlanilha = path.join(
  pastaProjeto,
  "dados",
  "produtos_catalogo.xlsx"
);

const caminhoSaida = path.join(
  pastaProjeto,
  "dados",
  "produtos-base.json"
);

function converterCelulaEmTexto(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  if (typeof valor === "object") {
    if (valor.text) {
      return String(valor.text);
    }

    if (valor.result !== undefined) {
      return String(valor.result);
    }

    if (Array.isArray(valor.richText)) {
      return valor.richText
        .map(parte => parte.text || "")
        .join("");
    }
  }

  return String(valor);
}

function normalizarCabecalho(valor) {
  return converterCelulaEmTexto(valor)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizarModelo(valor) {
  return converterCelulaEmTexto(valor)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizarTexto(valor) {
  return converterCelulaEmTexto(valor)
    .trim()
    .replace(/\s+/g, " ");
}

async function executar() {
  console.log("Lendo a planilha...");

  try {
    await fs.access(caminhoPlanilha);
  } catch {
    throw new Error(
      `Planilha não encontrada em: ${caminhoPlanilha}`
    );
  }

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.readFile(caminhoPlanilha);

  const planilha =
    workbook.getWorksheet("Produtos") ||
    workbook.worksheets[0];

  if (!planilha) {
    throw new Error(
      'Nenhuma aba foi encontrada na planilha.'
    );
  }

  console.log(`Aba localizada: ${planilha.name}`);

  const linhaCabecalho = planilha.getRow(1);
  const colunas = {};

  linhaCabecalho.eachCell(
    { includeEmpty: false },
    (celula, numeroColuna) => {
      const cabecalho = normalizarCabecalho(
        celula.value
      );

      if (cabecalho) {
        colunas[cabecalho] = numeroColuna;
      }
    }
  );

  const colunasObrigatorias = [
    "FABRICANTE",
    "SEGMENTO",
    "CODIGO",
    "PRODUTO",
    "MODELO"
  ];

  const colunasAusentes = colunasObrigatorias.filter(
    coluna => !colunas[coluna]
  );

  if (colunasAusentes.length > 0) {
    throw new Error(
      `Colunas obrigatórias ausentes: ${colunasAusentes.join(", ")}`
    );
  }

  const produtos = [];
  const modelosEncontrados = new Set();
  const modelosDuplicados = [];
  const linhasSemModelo = [];

  for (
    let numeroLinha = 2;
    numeroLinha <= planilha.rowCount;
    numeroLinha++
  ) {
    const linha = planilha.getRow(numeroLinha);

    const fabricante = normalizarTexto(
      linha.getCell(colunas.FABRICANTE).value
    );

    const segmento = normalizarTexto(
      linha.getCell(colunas.SEGMENTO).value
    );

    const codigo = normalizarTexto(
      linha.getCell(colunas.CODIGO).value
    );

    const nome = normalizarTexto(
      linha.getCell(colunas.PRODUTO).value
    );

    const modelo = normalizarModelo(
      linha.getCell(colunas.MODELO).value
    );

    const linhaEstaVazia =
      !fabricante &&
      !segmento &&
      !codigo &&
      !nome &&
      !modelo;

    if (linhaEstaVazia) {
      continue;
    }

    if (!modelo) {
      linhasSemModelo.push(numeroLinha);
      continue;
    }

    if (modelosEncontrados.has(modelo)) {
      modelosDuplicados.push({
        linha: numeroLinha,
        modelo
      });

      continue;
    }

    modelosEncontrados.add(modelo);

    produtos.push({
      id: modelo.toLowerCase(),
      fabricante,
      segmento,
      codigo,
      produto: nome,
      modelo,
      statusPesquisa: "PENDENTE"
    });
  }

  await fs.writeFile(
    caminhoSaida,
    JSON.stringify(produtos, null, 2),
    "utf8"
  );

  console.log("");
  console.log("Leitura concluída.");
  console.log(`Produtos encontrados: ${produtos.length}`);
  console.log(`Arquivo gerado: ${caminhoSaida}`);

  if (linhasSemModelo.length > 0) {
    console.warn("");
    console.warn(
      `Linhas ignoradas por falta de modelo: ${linhasSemModelo.join(", ")}`
    );
  }

  if (modelosDuplicados.length > 0) {
    console.warn("");
    console.warn("Modelos duplicados ignorados:");

    modelosDuplicados.forEach(item => {
      console.warn(
        `- Linha ${item.linha}: ${item.modelo}`
      );
    });
  }
}

executar().catch(erro => {
  console.error("");
  console.error("Erro ao processar a planilha:");
  console.error(erro.message);

  process.exitCode = 1;
});