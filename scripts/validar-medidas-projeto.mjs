import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogo = JSON.parse(await fs.readFile(path.join(raiz, "produtos.preview.json"), "utf8"));
const argumentoModelo = process.argv.find(item => item.startsWith("--modelo="));
const filtro = argumentoModelo?.split("=").slice(1).join("=").toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
const grupos = ["dimensoesProduto", "dimensoesNicho", "folgas", "abertura", "geometriaInstalacao", "instalacao"];

const normalizarModelo = valor => String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const numero = campo => {
  const texto = String(campo?.valor || "").trim();
  const encontrado = texto.replace(/\./g, "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (!encontrado) return NaN;
  const valor = Number(encontrado[0]);
  if (/\bcm\b/i.test(texto)) return valor * 10;
  if (/\bm\b/i.test(texto) && !/\bmm\b/i.test(texto)) return valor * 1000;
  return valor;
};

function validar(produto) {
  const dados = produto.medidasProjeto;
  const erros = [];
  if (!dados) return ["Medidas de projeto ainda não extraídas."];

  for (const grupo of grupos) {
    for (const [nome, campo] of Object.entries(dados[grupo] || {})) {
      if (campo.status === "CONFIRMADO" && (!campo.valor || !campo.pagina || !campo.referencia)) {
        erros.push(`${grupo}.${nome}: CONFIRMADO sem valor, página ou referência auditável.`);
      }
      if (campo.status === "REVISAR") {
        erros.push(`${grupo}.${nome}: exige revisão técnica (${campo.valor || "sem valor"}).`);
      }
      if (["NAO_LOCALIZADO", "NAO_APLICAVEL"].includes(campo.status) && campo.valor) {
        erros.push(`${grupo}.${nome}: ${campo.status} não pode conter valor.`);
      }
    }
  }

  const g = dados.geometriaInstalacao || {};
  const d = dados.dimensoesProduto || {};
  const basicas = [
    ["largura", d.largura, g.larguraProduto],
    ["altura", d.altura, g.alturaProduto],
    ["profundidade", d.profundidade, g.profundidadeTotalProduto]
  ];
  for (const [nome, principal, duplicado] of basicas) {
    if (principal?.status !== "CONFIRMADO" && duplicado?.status !== "CONFIRMADO") {
      erros.push(`dimensão básica ${nome}: não confirmada; desenho técnico bloqueado.`);
    }
  }
  const largura = numero(g.larguraProduto);
  const larguraAberta = numero(g.larguraComPortasAbertas);
  if (Number.isFinite(largura) && Number.isFinite(larguraAberta) && larguraAberta <= largura) {
    erros.push("larguraComPortasAbertas deve superar larguraProduto.");
  }
  const profundidade = numero(g.profundidadeTotalProduto);
  const gabinete = numero(g.profundidadeGabinete);
  if (Number.isFinite(profundidade) && Number.isFinite(gabinete) && gabinete > profundidade) {
    erros.push("profundidadeGabinete não pode superar profundidadeTotalProduto.");
  }
  const profundidadeAberta = numero(g.profundidadeComPortasAbertas);
  if (Number.isFinite(profundidade) && Number.isFinite(profundidadeAberta) && profundidadeAberta <= profundidade) {
    erros.push("profundidadeComPortasAbertas deve superar profundidadeTotalProduto.");
  }
  for (const nome of ["anguloAbertura", "anguloAberturaEsquerda", "anguloAberturaDireita"]) {
    const valor = numero(g[nome]);
    if (Number.isFinite(valor) && (valor <= 0 || valor > 180)) erros.push(`${nome}: ângulo fora do intervalo físico.`);
  }
  return erros;
}

const selecionados = catalogo.filter(produto => !filtro || normalizarModelo(produto.modelo) === filtro);
let comErro = 0;
for (const produto of selecionados) {
  const erros = validar(produto);
  if (!erros.length) continue;
  comErro++;
  console.log(`\n${produto.modelo || produto.id}:`);
  erros.forEach(erro => console.log(`  - ${erro}`));
}

console.log(`\nValidação concluída: ${selecionados.length} produto(s), ${comErro} com pendências.`);
process.exitCode = comErro ? 2 : 0;
