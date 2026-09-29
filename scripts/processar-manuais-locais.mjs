import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extrairOffline } from "./extrair-offline-manuais.mjs";
import { aplicarDadosTecnicosValidados } from "./dados-tecnicos-validados.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogoPath = path.join(raiz, "produtos.preview.json");
const argumento = process.argv.find(item => item.startsWith("--manuais="));
const pastaManuais = path.resolve(argumento?.split("=").slice(1).join("=") || path.join(raiz, "manuais-oficiais"));
const somenteModelo = normalizar(process.argv.find(item => item.startsWith("--modelo="))?.split("=").slice(1).join("=") || "");
const relatorioPath = path.join(raiz, "dados", "relatorio-manuais-locais.json");
const grupos = {
  dimensoesProduto: ["largura", "altura", "profundidade"],
  dimensoesNicho: ["largura", "altura", "profundidade"],
  folgas: ["superior", "lateral", "traseira", "frontal"],
  abertura: ["anguloPorta", "distanciaPortasAbertas", "distanciaGavetasEstendidas"],
  geometriaInstalacao: ["larguraProduto", "alturaProduto", "profundidadeTotalProduto", "profundidadeGabinete", "larguraComPortasAbertas", "profundidadeComPortasAbertas", "profundidadeComGavetasEstendidas", "anguloAbertura", "anguloAberturaEsquerda", "anguloAberturaDireita", "afastamentoTraseiro", "folgaLateral", "folgaLateralEsquerda", "folgaLateralDireita", "zeroClearance", "avancoFrontal"],
  instalacao: ["pontoEletrico", "pontoAgua", "pontoGas", "dreno"]
};
function normalizar(valor = "") { return String(valor).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function vazio() { return { valor: "", pagina: "", referencia: "", status: "NAO_LOCALIZADO", observacao: "" }; }
function baseVazia() { const r = { observacoes: [] }; for (const [g, cs] of Object.entries(grupos)) r[g] = Object.fromEntries(cs.map(c => [c, vazio()])); return r; }
function numeroMm(valor) { const t = String(valor || "").replace(",", "."); const n = Number(t.match(/\d+(?:\.\d+)?/)?.[0]); if (!Number.isFinite(n)) return null; if (/\bcm\b/i.test(t)) return n * 10; if (/\bm\b/i.test(t) && !/mm/i.test(t)) return n * 1000; return n; }
function cadastrada(produto, chave) { const d = produto.dimensoes || {}; for (const k of [chave, chave[0].toUpperCase() + chave.slice(1)]) if (d[k]) return numeroMm(d[k]); return null; }
function auditar(produto, dados) { for (const chave of ["largura", "altura", "profundidade"]) { const c = dados.dimensoesProduto?.[chave]; const e = cadastrada(produto, chave), o = numeroMm(c?.valor); if (c?.status === "CONFIRMADO" && e && o && Math.abs(o - e) / e > .12) { c.status = "REVISAR"; c.observacao = `Diverge da ficha oficial (${e} mm); pode ser embalagem, nicho ou outra família.`; } } }
function combinar(anterior, novo) { const r = anterior ? structuredClone(anterior) : baseVazia(); for (const [g, cs] of Object.entries(grupos)) { r[g] ||= {}; for (const c of cs) { const a = r[g][c], n = novo?.[g]?.[c]; if ((!a || a.status !== "CONFIRMADO") && n?.status === "CONFIRMADO") r[g][c] = n; else if (!a) r[g][c] = n || vazio(); } } r.observacoes = [...new Set([...(anterior?.observacoes || []), ...(novo?.observacoes || [])])]; return r; }
function completarEvidenciaLegada(dados, produto = {}) {
  for (const [grupo, campos] of Object.entries(grupos)) for (const nome of campos) {
    const campo = dados?.[grupo]?.[nome];
    if (campo?.status !== "CONFIRMADO") continue;
    if (!String(campo.valor || "").trim() || !String(campo.pagina || "").trim()) {
      campo.status = "REVISAR";
      campo.observacao ||= "Registro sem valor ou página suficientes; requer conferência no manual.";
      continue;
    }
    if (!String(campo.referencia || "").trim()) {
      campo.referencia = `${produto.modelo || "Produto"} / ${grupo}.${nome}`;
      campo.observacao ||= "Confirmação preservada da validação técnica anterior.";
      campo.fonte ||= "VALIDACAO_ANTERIOR";
    }
  }
}
async function listar() {
  const out = [];
  const itens = await fs.readdir(pastaManuais, { withFileTypes: true });

  for (const item of itens) {
    if (!item.isDirectory()) continue;
    const caminhoItem = path.join(pastaManuais, item.name);
    const subItens = await fs.readdir(caminhoItem, { withFileTypes: true });

    // 1. Verifica se os PDFs já estão diretamente nesta pasta (estrutura de 1 nível)
    const pdfsDiretos = subItens
      .filter(n => !n.isDirectory() && /\.pdf$/i.test(n.name))
      .map(n => path.join(caminhoItem, n.name));

    if (pdfsDiretos.length > 0) {
      out.push({
        fabricante: "GERAL",
        pasta: item.name,
        modelos: item.name.split("__").filter(x => !/^mais-/i.test(x)).map(normalizar),
        arquivos: pdfsDiretos
      });
    } else {
      // 2. Caso haja o segundo nível (Fabricante -> Pasta do Modelo -> PDFs)
      for (const dir of subItens) {
        if (!dir.isDirectory()) continue;
        const base = path.join(caminhoItem, dir.name);
        const nomes = (await fs.readdir(base)).filter(n => /\.pdf$/i.test(n));
        out.push({
          fabricante: item.name,
          pasta: dir.name,
          modelos: dir.name.split("__").filter(x => !/^mais-/i.test(x)).map(normalizar),
          arquivos: nomes.map(n => path.join(base, n))
        });
      }
    }
  }

  try {
    const relatorio = JSON.parse(await fs.readFile(path.join(pastaManuais, "RELATORIO-MANUAIS.json"), "utf8"));
    for (const item of relatorio.baixados || []) {
      const arquivo = path.join(pastaManuais, ...String(item.arquivo).split(/[\\/]+/));
      const grupo = out.find(x => x.arquivos.includes(arquivo));
      if (grupo) {
        grupo.modelos = [...new Set([...grupo.modelos, ...(item.produtos || []).map(p => normalizar(p.modelo))])];
      }
    }
  } catch { /* pacote antigo sem relatório */ }

  return out;
}
async function textoPdf(bytes) { const pdf = await getDocument({ data: new Uint8Array(bytes), disableWorker: true }).promise; const paginas = []; for (let n = 1; n <= pdf.numPages; n++) { const c = await (await pdf.getPage(n)).getTextContent(); paginas.push({ pagina: n, texto: c.items.map(i => i.str).join(" ").replace(/\s+/g, " ") }); } return paginas; }
function achar(paginas, regex, rotulo) { for (const p of paginas) { const m = p.texto.match(regex); if (m) return { valor: m[1].trim(), pagina: String(p.pagina), referencia: rotulo, status: "CONFIRMADO", observacao: "Informação explícita no manual oficial.", fonte: "MANUAL_LOCAL" }; } return vazio(); }
function dadosArquiteto(paginas, medidas) {
  const tensao = achar(paginas, /(?:tens[aã]o|voltagem)[^\d]{0,25}((?:127|220|110|240)\s*V(?:\s*[\/ou-]+\s*(?:127|220)\s*V)?)/i, "Tensão/voltagem");
  const potencia = achar(paginas, /pot[eê]ncia(?:\s+(?:nominal|total))?[^\d]{0,25}([\d.,]+\s*(?:W|kW))/i, "Potência");
  const frequencia = achar(paginas, /frequ[eê]ncia[^\d]{0,25}([\d.,]+\s*Hz)/i, "Frequência");
  const peso = achar(paginas, /(?:peso\s+l[ií]quido|peso\s+do\s+produto)[^\d]{0,25}([\d.,]+\s*kg)/i, "Peso líquido");
  const capacidade = achar(paginas, /capacidade\s+(?:total|l[ií]quida|do\s+forno)[^\d]{0,25}([\d.,]+\s*(?:L|litros?))/i, "Capacidade");
  const requisitos = [];
  if (paginas.some(p => /(?:ponto|entrada|fornecimento).{0,15}[aá]gua/i.test(p.texto))) requisitos.push("Ponto de água: conferir posição e pressão no manual");
  if (paginas.some(p => /(?:ponto|entrada|tipo).{0,15}g[aá]s/i.test(p.texto))) requisitos.push("Ponto de gás: conferir tipo, registro e posição no manual");
  if (paginas.some(p => /dreno|mangueira.{0,15}drenagem|sa[ií]da.{0,15}[aá]gua/i.test(p.texto))) requisitos.push("Drenagem: prever conforme orientação do manual");
  const revisar = Object.entries(grupos).flatMap(([g, cs]) => cs.filter(c => medidas[g]?.[c]?.status === "REVISAR").map(c => `${g}.${c}`));
  return { uso: "Dados de pré-projeto; validar no manual antes de fechar marcenaria, elétrica, hidráulica ou gás.", dimensoesProduto: medidas.dimensoesProduto, nichoEInstalacao: medidas.dimensoesNicho, folgas: medidas.folgas, abertura: medidas.abertura, infraestrutura: { tensao, potencia, frequencia, requisitos }, peso, capacidade, revisaoObrigatoria: revisar };
}
async function executar() {
  const catalogo = JSON.parse(await fs.readFile(catalogoPath, "utf8")); const manuais = await listar();
  const relatorio = { geradoEm: new Date().toISOString(), pastaManuais, produtos: [], resumo: {} }; let processados = 0, semManual = 0, erros = 0;
  for (const produto of catalogo) { const modelo = normalizar(produto.modelo); if (somenteModelo && modelo !== somenteModelo) continue; const grupo = manuais.find(x => x.modelos.includes(modelo)); if (!grupo) { semManual++; relatorio.produtos.push({ modelo: produto.modelo, status: "SEM_MANUAL_CORRESPONDENTE" }); continue; }
    process.stdout.write(`Lendo ${produto.modelo}... `); try { const pdfs = []; let paginas = []; for (const arquivo of grupo.arquivos) { const bytes = await fs.readFile(arquivo); pdfs.push({ manual: { nome: path.basename(arquivo), url: arquivo }, bytes }); paginas = paginas.concat(await textoPdf(bytes)); }
      const extraido = await extrairOffline(produto, pdfs); auditar(produto, extraido); const medidas = combinar(produto.medidasProjeto, extraido); aplicarDadosTecnicosValidados(produto, medidas); completarEvidenciaLegada(medidas, produto); medidas.fonte = { nome: pdfs.map(p => p.manual.nome).join(" + "), tipo: "MANUAL_LOCAL", pasta: grupo.pasta, extraidoEm: new Date().toISOString() }; medidas.revisado = false; produto.medidasProjeto = medidas; produto.dadosArquitetura = dadosArquiteto(paginas, medidas);
      const confirmados = Object.entries(grupos).flatMap(([g, cs]) => cs.filter(c => medidas[g]?.[c]?.status === "CONFIRMADO").map(c => `${g}.${c}`)); relatorio.produtos.push({ modelo: produto.modelo, status: "PROCESSADO", manual: grupo.pasta, confirmados: confirmados.length, camposConfirmados: confirmados, revisar: produto.dadosArquitetura.revisaoObrigatoria }); processados++; console.log(`${confirmados.length} campo(s) confirmado(s)`);
    } catch (erro) { erros++; relatorio.produtos.push({ modelo: produto.modelo, status: "ERRO", erro: erro.message }); console.log(`ERRO: ${erro.message}`); }
  }
  for (const produto of catalogo) completarEvidenciaLegada(produto.medidasProjeto || {}, produto);
  relatorio.resumo = { produtosCatalogo: catalogo.length, manuais: manuais.length, processados, semManual, erros }; await fs.writeFile(catalogoPath, `${JSON.stringify(catalogo, null, 2)}\n`); await fs.mkdir(path.dirname(relatorioPath), { recursive: true }); await fs.writeFile(relatorioPath, `${JSON.stringify(relatorio, null, 2)}\n`); console.log(`\nConcluído: ${processados} processados, ${semManual} sem manual exato, ${erros} erros.`);
}
executar().catch(erro => { console.error(erro); process.exitCode = 1; });
