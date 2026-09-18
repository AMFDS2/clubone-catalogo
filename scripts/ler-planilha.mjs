import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pastaDados = path.join(raiz, "dados");
const caminhoSaida = path.join(pastaDados, "produtos-base.json");

function texto(valor) {
  if (valor == null) return "";
  if (typeof valor === "object") {
    if (valor.text) return String(valor.text);
    if (valor.result != null) return String(valor.result);
    if (Array.isArray(valor.richText)) return valor.richText.map(item => item.text || "").join("");
  }
  return String(valor);
}

function cabecalho(valor) {
  return texto(valor).trim().toUpperCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

function limpar(valor) { return texto(valor).trim().replace(/\s+/g, " "); }
function modelo(valor) { return limpar(valor).toUpperCase().replace(/\s+/g, ""); }

async function lerArquivo(caminho, modelosEncontrados) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);
  const planilha = workbook.getWorksheet("Produtos") || workbook.worksheets[0];
  if (!planilha) throw new Error(`Nenhuma aba encontrada em ${path.basename(caminho)}`);

  const colunas = {};
  planilha.getRow(1).eachCell({ includeEmpty: false }, (celula, numero) => {
    const nome = cabecalho(celula.value);
    if (nome) colunas[nome] = numero;
  });
  const obrigatorias = ["FABRICANTE", "SEGMENTO", "CODIGO", "PRODUTO", "MODELO"];
  const ausentes = obrigatorias.filter(nome => !colunas[nome]);
  if (ausentes.length) throw new Error(`${path.basename(caminho)}: colunas ausentes: ${ausentes.join(", ")}`);

  const produtos = [];
  const semModelo = [];
  for (let numero = 2; numero <= planilha.rowCount; numero++) {
    const linha = planilha.getRow(numero);
    const item = {
      fabricante: limpar(linha.getCell(colunas.FABRICANTE).value),
      segmento: limpar(linha.getCell(colunas.SEGMENTO).value),
      codigo: limpar(linha.getCell(colunas.CODIGO).value),
      produto: limpar(linha.getCell(colunas.PRODUTO).value),
      modelo: modelo(linha.getCell(colunas.MODELO).value)
    };
    if (!Object.values(item).some(Boolean)) continue;
    if (!item.modelo) { semModelo.push(numero); continue; }
    if (modelosEncontrados.has(item.modelo)) continue;
    modelosEncontrados.add(item.modelo);
    produtos.push({ id: item.modelo.toLowerCase(), ...item, statusPesquisa: "PENDENTE" });
  }
  console.log(`- ${path.basename(caminho)} (${planilha.name})`);
  return { produtos, semModelo };
}

async function executar() {
  const arquivos = (await fs.readdir(pastaDados))
    .filter(nome => nome.toLowerCase().endsWith(".xlsx"))
    .sort();
  if (!arquivos.length) throw new Error("Nenhuma planilha .xlsx encontrada em dados.");

  console.log("Lendo as planilhas de produtos...");
  const produtos = [];
  const modelosEncontrados = new Set();
  const avisos = [];
  for (const arquivo of arquivos) {
    const resultado = await lerArquivo(path.join(pastaDados, arquivo), modelosEncontrados);
    produtos.push(...resultado.produtos);
    if (resultado.semModelo.length) avisos.push(`${arquivo}:${resultado.semModelo.join(",")}`);
  }
  await fs.writeFile(caminhoSaida, JSON.stringify(produtos, null, 2), "utf8");
  console.log(`\nLeitura concluída.\nProdutos encontrados: ${produtos.length}\nArquivo gerado: ${caminhoSaida}`);
  if (avisos.length) console.warn(`Linhas ignoradas por falta de modelo: ${avisos.join("; ")}`);
}

executar().catch(erro => { console.error("Erro ao processar as planilhas:", erro.message); process.exitCode = 1; });
