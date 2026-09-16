import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const caminhoAtual = fileURLToPath(import.meta.url);
const pastaScripts = path.dirname(caminhoAtual);
const pastaProjeto = path.resolve(pastaScripts, "..");

const caminhoProdutosBase = path.join(
  pastaProjeto,
  "dados",
  "produtos-base.json"
);

const caminhoCatalogoAtual = path.join(
  pastaProjeto,
  "produtos.json"
);

const caminhoPendencias = path.join(
  pastaProjeto,
  "dados",
  "pendencias-catalogo.json"
);

const caminhoRelatorio = path.join(
  pastaProjeto,
  "dados",
  "relatorio-catalogo.json"
);

function normalizarModelo(valor = "") {
  return String(valor)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function temImagemValida(produto) {
  return Boolean(
    produto.imagem &&
    !produto.imagem.includes("produto-sem-imagem")
  );
}

function temDimensoes(produto) {
  return Boolean(
    produto.dimensoes &&
    Object.keys(produto.dimensoes).length > 0
  );
}

function temEspecificacoes(produto) {
  return Boolean(
    produto.especificacoes &&
    Object.keys(produto.especificacoes).length > 0
  );
}

async function lerJSON(caminho) {
  const conteudo = await fs.readFile(caminho, "utf8");
  return JSON.parse(conteudo);
}

async function executar() {
  console.log("Comparando planilha com o catálogo atual...");

  const produtosBase = await lerJSON(caminhoProdutosBase);
  const catalogoAtual = await lerJSON(caminhoCatalogoAtual);

  const catalogoPorModelo = new Map();

  catalogoAtual.forEach(produto => {
    const modelo = normalizarModelo(produto.modelo);

    if (modelo) {
      catalogoPorModelo.set(modelo, produto);
    }
  });

  const cadastrados = [];
  const incompletos = [];
  const novos = [];

  produtosBase.forEach(produtoBase => {
    const modelo = normalizarModelo(produtoBase.modelo);
    const produtoAtual = catalogoPorModelo.get(modelo);

    if (!produtoAtual) {
      novos.push({
        ...produtoBase,
        statusPesquisa: "NOVO",
        motivos: [
          "Modelo ainda não existe no produtos.json"
        ]
      });

      return;
    }

    const motivos = [];

    if (!temImagemValida(produtoAtual)) {
      motivos.push("Imagem principal ausente");
    }

    if (!temDimensoes(produtoAtual)) {
      motivos.push("Dimensões ausentes");
    }

    if (!temEspecificacoes(produtoAtual)) {
      motivos.push("Especificações ausentes");
    }

    if (motivos.length > 0) {
      incompletos.push({
        ...produtoBase,
        statusPesquisa: "REVISAR",
        motivos
      });

      return;
    }

    cadastrados.push({
      ...produtoBase,
      statusPesquisa: "CADASTRADO"
    });
  });

  const pendencias = [
    ...novos,
    ...incompletos
  ];

  const relatorio = {
    dataVerificacao: new Date().toISOString(),
    resumo: {
      produtosNaPlanilha: produtosBase.length,
      produtosCadastrados: cadastrados.length,
      produtosIncompletos: incompletos.length,
      produtosNovos: novos.length,
      totalPendencias: pendencias.length
    },
    cadastrados,
    incompletos,
    novos
  };

  await fs.writeFile(
    caminhoPendencias,
    JSON.stringify(pendencias, null, 2),
    "utf8"
  );

  await fs.writeFile(
    caminhoRelatorio,
    JSON.stringify(relatorio, null, 2),
    "utf8"
  );

  console.log("");
  console.log("Verificação concluída.");
  console.log(`Produtos na planilha: ${produtosBase.length}`);
  console.log(`Já cadastrados: ${cadastrados.length}`);
  console.log(`Incompletos: ${incompletos.length}`);
  console.log(`Novos: ${novos.length}`);
  console.log(`Total de pendências: ${pendencias.length}`);

  console.log("");
  console.log("Arquivos gerados:");
  console.log("- dados/pendencias-catalogo.json");
  console.log("- dados/relatorio-catalogo.json");
}

executar().catch(erro => {
  console.error("");
  console.error("Erro ao verificar o catálogo:");
  console.error(erro.message);

  process.exitCode = 1;
});