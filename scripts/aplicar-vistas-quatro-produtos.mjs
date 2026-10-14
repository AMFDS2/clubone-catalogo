import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aplicarDadosTecnicosValidados } from "./dados-tecnicos-validados.mjs";

const pastaScripts = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(pastaScripts, "..");
const catalogoPath = path.join(raiz, "produtos.preview.json");
const modelosAlvo = new Set([
  "02543FBA130",
  "02544FBA130",
  "02547FBA135",
  "1512QDBA199"
]);

const dimensoesOficiais = {
  "02543FBA130": { largura: "835 mm", altura: "1900 mm", profundidade: "742 mm" },
  "02544FBA130": { largura: "835 mm", altura: "1900 mm", profundidade: "760 mm" },
  "02547FBA135": { largura: "835 mm", altura: "1900 mm", profundidade: "760 mm" },
  "1512QDBA199": { largura: "600 mm", altura: "850 mm", profundidade: "659 mm" }
};

const normalizarModelo = valor => String(valor || "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");

const campoCadastro = valor => ({
  valor: String(valor || ""),
  pagina: "Fonte oficial",
  referencia: "Cadastro dimensional oficial do produto",
  status: "CONFIRMADO",
  observacao: "Cota básica proveniente da ficha oficial cadastrada.",
  fonte: "CADASTRO_OFICIAL"
});

function completarDimensoesBasicas(produto, dados) {
  dados.dimensoesProduto ||= {};
  const modelo = normalizarModelo(produto.modelo);
  const cadastradas = produto?.dimensoes?.produto || produto?.dimensoes || {};
  const dimensoes = { ...(dimensoesOficiais[modelo] || {}), ...cadastradas };

  for (const eixo of ["largura", "altura", "profundidade"]) {
    const atual = dados.dimensoesProduto[eixo];
    if (atual?.status === "CONFIRMADO" && atual?.valor) continue;
    if (dimensoes[eixo]) dados.dimensoesProduto[eixo] = campoCadastro(dimensoes[eixo]);
  }
}

async function executar() {
  const catalogo = JSON.parse(await fs.readFile(catalogoPath, "utf8"));
  if (!Array.isArray(catalogo)) throw new Error("produtos.preview.json não contém uma lista de produtos.");

  const encontrados = new Set();
  let camposAplicados = 0;

  for (const produto of catalogo) {
    const modelo = normalizarModelo(produto.modelo);
    if (!modelosAlvo.has(modelo)) continue;

    encontrados.add(modelo);
    produto.medidasProjeto ||= {};
    produto.medidasProjeto.produto ||= {
      modelo: produto.modelo || "",
      marca: produto.marca || produto.fabricante || "",
      tipo: produto.tipoBloco || produto.segmento || ""
    };

    completarDimensoesBasicas(produto, produto.medidasProjeto);
    camposAplicados += aplicarDadosTecnicosValidados(produto, produto.medidasProjeto);
  }

  await fs.writeFile(catalogoPath, `${JSON.stringify(catalogo, null, 2)}\n`, "utf8");

  const ausentes = [...modelosAlvo].filter(modelo => !encontrados.has(modelo));
  console.log(`Produtos atualizados: ${encontrados.size}`);
  console.log(`Campos técnicos aplicados: ${camposAplicados}`);
  if (ausentes.length) console.warn(`Modelos ainda ausentes do catálogo: ${ausentes.join(", ")}`);
  console.log("Atualização concluída sem chamar a IA e sem baixar novamente os manuais.");
}

executar().catch(erro => {
  console.error(`Erro ao aplicar as vistas: ${erro?.message || erro}`);
  process.exitCode = 1;
});
