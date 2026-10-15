import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pastaScripts = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(pastaScripts, "..");
const caminhoFontes = path.join(raiz, "dados", "fontes-oficiais.json");
const caminhoEnriquecimento = path.join(raiz, "dados", "enriquecimento-automatico.json");

const fontesConfirmadas = new Map([
  ["02543FBA130", "https://loja.electrolux.com.br/geladeira-electrolux-frost-free-585l-efficient-com-autosense-e-dispenser-de-agua-e-gelo-3-portas-cor-inox-look--im8is-/p"],
  ["02544FBA130", "https://loja.electrolux.com.br/geladeira-electrolux-multidoor-com-flexispace-home-pro-541l--iq8is--1/p"],
  ["02547FBA135", "https://loja.electrolux.com.br/geladeira-electrolux-multidoor-com-flexispace-pro-series-583l--iq8ib-/p"],
  ["1512QDBA199", "https://loja.electrolux.com.br/maquina-de-lavar-frontal-electrolux-12kg-cinza-onix-inverter-com-agua-quente-e-lavagem-inteligente--lfc12-/p"]
]);

const normalizar = valor => String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function lerJSON(caminho) {
  return JSON.parse(await fs.readFile(caminho, "utf8"));
}

async function executar() {
  const fontes = await lerJSON(caminhoFontes);
  const agora = new Date().toISOString();
  let fontesAtualizadas = 0;

  const novasFontes = fontes.map(item => {
    const modelo = normalizar(item.modelo);
    const url = fontesConfirmadas.get(modelo);
    if (!url) return item;
    fontesAtualizadas++;
    return {
      ...item,
      statusFonte: "LOCALIZADO",
      fonteInterna: url,
      alternativas: [url],
      origemFonte: "FABRICANTE",
      correspondencia: "MODELO_CONFIRMADO",
      dataConsulta: agora
    };
  });

  const enriquecimento = await lerJSON(caminhoEnriquecimento);
  const enriquecimentoLimpo = enriquecimento.filter(
    item => !fontesConfirmadas.has(normalizar(item.modelo))
  );
  const removidos = enriquecimento.length - enriquecimentoLimpo.length;

  await fs.writeFile(caminhoFontes, `${JSON.stringify(novasFontes, null, 2)}\n`, "utf8");
  await fs.writeFile(caminhoEnriquecimento, `${JSON.stringify(enriquecimentoLimpo, null, 2)}\n`, "utf8");

  console.log(`Fontes oficiais corrigidas: ${fontesAtualizadas}`);
  console.log(`Cadastros incorretos removidos para reextração: ${removidos}`);
  console.log("Agora execute o enriquecimento dos quatro modelos e gere novamente o catálogo.");
}

executar().catch(erro => {
  console.error(`Erro ao reparar cadastros: ${erro?.message || erro}`);
  process.exitCode = 1;
});
