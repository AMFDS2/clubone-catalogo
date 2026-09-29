import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import archiver from "archiver";

const RAIZ = process.cwd();
const ARQUIVO_CATALOGO = path.join(RAIZ, "produtos.preview.json");
const PASTA_SAIDA = path.join(RAIZ, "assets", "catalogos");
const ARQUIVO_ZIP = path.join(PASTA_SAIDA, "manuais-oficiais.zip");
const ARQUIVO_RELATORIO = path.join(PASTA_SAIDA, "relatorio-manuais.json");
const TIMEOUT_MS = 60_000;
const TENTATIVAS = 3;
const SOMENTE_VALIDAR = process.argv.includes("--dry-run");

function textoSeguro(valor = "", padrao = "sem-identificacao") {
  const limpo = String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return limpo || padrao;
}

function urlDireta(valor = "") {
  try {
    const url = new URL(String(valor));
    if (/^(docs|drive)\.google\.com$/i.test(url.hostname)) {
      const interna = url.searchParams.get("url");
      if (interna) return decodeURIComponent(interna);
    }
    return url.href;
  } catch {
    return "";
  }
}

function chaveURL(valor = "") {
  try {
    const url = new URL(valor);
    url.hash = "";
    return url.href.toLowerCase();
  } catch {
    return valor.toLowerCase();
  }
}

function extensaoDocumento(url = "", tipo = "") {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if ([".pdf", ".doc", ".docx", ".xls", ".xlsx"].includes(ext)) return ext;
  } catch {
    // Usa PDF como padrão para os manuais atuais.
  }
  return tipo === "planilha" ? ".xlsx" : ".pdf";
}

function coletarDocumentos(produtos = []) {
  const agrupados = new Map();

  for (const produto of produtos) {
    for (const documento of Array.isArray(produto.documentos) ? produto.documentos : []) {
      if (!documento?.url) continue;
      const url = urlDireta(documento.url);
      if (!url) continue;
      const chave = chaveURL(url);
      const registro = agrupados.get(chave) || {
        url,
        tipo: documento.tipo || "manual",
        nome: documento.nome || "Manual oficial",
        descricao: documento.descricao || "Documento oficial do fabricante",
        produtos: []
      };
      registro.produtos.push({
        fabricante: produto.marca || produto.fabricante || "Fabricante",
        modelo: produto.modelo || produto.codigoInfo || produto.id || "sem-modelo",
        codigo: produto.codigoInfo || "",
        produto: produto.nome || ""
      });
      agrupados.set(chave, registro);
    }
  }

  return [...agrupados.values()];
}

function caminhoNoZip(documento, indice) {
  const referencias = [...new Map(documento.produtos.map(item => [
    `${item.fabricante}|${item.modelo}`,
    item
  ])).values()];
  const fabricantes = [...new Set(referencias.map(item => textoSeguro(item.fabricante, "Fabricante")))];
  const modelos = referencias.map(item => textoSeguro(item.modelo, "sem-modelo"));
  const fabricante = fabricantes.length === 1 ? fabricantes[0] : "Multiplos-fabricantes";
  const grupoModelos = modelos.length <= 3
    ? modelos.join("__")
    : `${modelos.slice(0, 3).join("__")}__mais-${modelos.length - 3}`;
  const nome = textoSeguro(documento.nome, `documento-${indice + 1}`);
  const ext = extensaoDocumento(documento.url, documento.tipo);
  return `${fabricante}/${grupoModelos}/${String(indice + 1).padStart(3, "0")}-${nome}${ext}`;
}

async function esperar(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function baixar(documento) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resposta = await fetch(documento.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
          "Accept-Language": "pt-BR,pt;q=0.9"
        }
      });
      if (!resposta.ok || !resposta.body) {
        throw new Error(`HTTP ${resposta.status}`);
      }
      const contentType = resposta.headers.get("content-type") || "";
      if (/text\/html/i.test(contentType)) {
        throw new Error("O endereço retornou uma página HTML em vez do documento");
      }
      return resposta;
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < TENTATIVAS) await esperar(1500 * tentativa);
    }
  }
  throw ultimoErro || new Error("Falha desconhecida no download");
}

async function executar() {
  if (!fs.existsSync(ARQUIVO_CATALOGO)) {
    throw new Error(`Arquivo não encontrado: ${ARQUIVO_CATALOGO}`);
  }

  const produtos = JSON.parse(fs.readFileSync(ARQUIVO_CATALOGO, "utf8"));
  const documentos = coletarDocumentos(Array.isArray(produtos) ? produtos : []);
  fs.mkdirSync(PASTA_SAIDA, { recursive: true });

  if (SOMENTE_VALIDAR) {
    console.log(`Produtos no catálogo: ${produtos.length}`);
    console.log(`Documentos vinculados: ${produtos.reduce((total, item) => total + (Array.isArray(item.documentos) ? item.documentos.length : 0), 0)}`);
    console.log(`URLs únicas para download: ${documentos.length}`);
    console.log("Validação concluída sem baixar arquivos.");
    return;
  }

  const saida = fs.createWriteStream(ARQUIVO_ZIP);
  const zip = archiver("zip", { zlib: { level: 7 } });
  const concluido = new Promise((resolve, reject) => {
    saida.on("close", resolve);
    saida.on("error", reject);
    zip.on("warning", erro => erro.code === "ENOENT" ? console.warn(erro.message) : reject(erro));
    zip.on("error", reject);
  });
  zip.pipe(saida);

  const relatorio = {
    geradoEm: new Date().toISOString(),
    produtosNoCatalogo: produtos.length,
    documentosEncontrados: documentos.length,
    produtosSemDocumento: produtos
      .filter(item => !Array.isArray(item.documentos) || !item.documentos.some(documento => documento?.url))
      .map(item => ({
        fabricante: item.marca || item.fabricante || "",
        modelo: item.modelo || "",
        codigo: item.codigoInfo || "",
        produto: item.nome || ""
      })),
    baixados: [],
    falhas: []
  };

  for (let indice = 0; indice < documentos.length; indice++) {
    const documento = documentos[indice];
    const destino = caminhoNoZip(documento, indice);
    process.stdout.write(`[${indice + 1}/${documentos.length}] ${documento.nome} — ${documento.produtos.map(p => p.modelo).join(", ")} ... `);
    try {
      const resposta = await baixar(documento);
      const contentType = resposta.headers.get("content-type") || "";
      const entrada = Readable.fromWeb(resposta.body);
      const transferido = new Promise((resolve, reject) => {
        entrada.once("end", resolve);
        entrada.once("error", reject);
      });
      zip.append(entrada, { name: destino });
      await transferido;
      relatorio.baixados.push({
        arquivo: destino,
        url: documento.url,
        contentType,
        produtos: documento.produtos
      });
      console.log("OK");
    } catch (erro) {
      relatorio.falhas.push({
        url: documento.url,
        erro: erro?.message || String(erro),
        produtos: documento.produtos
      });
      console.log(`FALHOU (${erro?.message || erro})`);
    }
  }

  relatorio.totalBaixados = relatorio.baixados.length;
  relatorio.totalFalhas = relatorio.falhas.length;
  const relatorioTexto = JSON.stringify(relatorio, null, 2);
  zip.append(relatorioTexto, { name: "RELATORIO-MANUAIS.json" });
  zip.append([
    "CLUB ONE — MANUAIS OFICIAIS",
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    `Documentos baixados: ${relatorio.totalBaixados}`,
    `Falhas: ${relatorio.totalFalhas}`,
    "",
    "Consulte RELATORIO-MANUAIS.json para ver as URLs oficiais e os modelos relacionados.",
    "Sempre confirme a revisão e as especificações do documento antes de fechar o projeto."
  ].join("\n"), { name: "LEIA-ME.txt" });

  await zip.finalize();
  await concluido;
  fs.writeFileSync(ARQUIVO_RELATORIO, relatorioTexto, "utf8");

  const tamanhoZip = fs.statSync(ARQUIVO_ZIP).size;

  console.log(`\nZIP criado: ${path.relative(RAIZ, ARQUIVO_ZIP)}`);
  console.log(`Tamanho: ${(tamanhoZip / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Baixados: ${relatorio.totalBaixados} | Falhas: ${relatorio.totalFalhas}`);
  if (tamanhoZip > 95 * 1024 * 1024) {
    console.warn("ATENÇÃO: o pacote ultrapassou 95 MB. O GitHub comum rejeita arquivos individuais acima de 100 MB; publique este ZIP em Releases ou em outro armazenamento de arquivos.");
  }
  if (relatorio.totalFalhas) {
    console.log(`Confira: ${path.relative(RAIZ, ARQUIVO_RELATORIO)}`);
  }
}

executar().catch(erro => {
  console.error(`Erro ao gerar pacote de manuais: ${erro?.message || erro}`);
  process.exitCode = 1;
});
