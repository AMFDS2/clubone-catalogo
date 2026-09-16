import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const caminhos = {
  base: path.join(raiz, "dados", "produtos-base.json"),
  atual: path.join(raiz, "produtos.json"),
  enriquecimento: path.join(raiz, "dados", "enriquecimento-automatico.json"),
  saida: path.join(raiz, "produtos.preview.json"),
  pendencias: path.join(raiz, "dados", "produtos-nao-incluidos.json")
};

function chave(valor = "") { return String(valor).trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function marca(fabricante = "") { return String(fabricante).toLowerCase().includes("samsung") ? "Samsung" : String(fabricante).trim(); }
function categoria(segmento = "") {
  const mapa = { VIDEO: "Video", AUDIO: "Audio", "ÁUDIO": "Audio", "LINHA BRANCA": "Linha Branca", AUTOMACAO: "Automacao", "AUTOMAÇÃO": "Automacao", REDES: "Redes", INFORMATICA: "Informática", "INFORMÁTICA": "Informática" };
  return mapa[String(segmento).trim().toUpperCase()] || segmento;
}
async function ler(caminho) { try { return JSON.parse(await fs.readFile(caminho, "utf8")); } catch { return []; } }

function destaques(lista = []) {
  return lista.filter(item => item?.valor).slice(0, 5).map(item => ({ titulo: item.valor, rotulo: item.rotulo, icone: "◇" }));
}

function limparEspecificacoes(especificacoes = {}) {
  return Object.fromEntries(Object.entries(especificacoes).filter(([, valor]) => valor !== "" && valor != null));
}

function criarProdutoNovo(base, enriquecido, ordem) {
  const cat = categoria(base.segmento);
  return {
    id: chave(base.modelo).toLowerCase(),
    ordem,
    marca: marca(base.fabricante),
    modelo: base.modelo,
    nome: enriquecido.tituloOficial || base.produto,
    descricao: enriquecido.descricao || base.produto,
    codigoInfo: base.codigo,
    categoria: cat,
    segmento: base.segmento,
    imagem: enriquecido.imagem,
    siteInfoStore: "https://www.infostore.com.br/",
    destaques: destaques(enriquecido.destaques),
    especificacoes: {
      Modelo: base.modelo,
      Categoria: cat,
      "Código Info Store": base.codigo,
      ...limparEspecificacoes(enriquecido.especificacoes)
    },
    dimensoes: enriquecido.dimensoes || {},
    instalacao: "Valide medidas, ventilação, pontos elétricos, hidráulicos e requisitos estruturais antes da instalação.",
    documentos: [],
    sobreMarca: "A Samsung oferece soluções de tecnologia e eletrodomésticos para projetos residenciais e comerciais.",
    revisaoPendente: enriquecido.statusExtracao !== "EXTRAIDO"
  };
}

async function executar() {
  const [base, atual, enriquecimentos] = await Promise.all([ler(caminhos.base), ler(caminhos.atual), ler(caminhos.enriquecimento)]);
  const atualPorModelo = new Map(atual.map(item => [chave(item.modelo), item]));
  const enriquecidoPorModelo = new Map(enriquecimentos.map(item => [chave(item.modelo), item]));
  const catalogo = [];
  const pendencias = [];

  base.forEach((produtoBase, indice) => {
    const modelo = chave(produtoBase.modelo);
    const anterior = atualPorModelo.get(modelo);
    const enriquecido = enriquecidoPorModelo.get(modelo);
    const ordem = base.length - indice;

    if (enriquecido?.imagem) {
      catalogo.push(criarProdutoNovo(produtoBase, enriquecido, ordem));
      return;
    }

    if (anterior?.imagem) {
      catalogo.push({
        ...anterior,
        ordem,
        marca: marca(produtoBase.fabricante),
        modelo: produtoBase.modelo,
        codigoInfo: produtoBase.codigo,
        categoria: categoria(produtoBase.segmento),
        segmento: produtoBase.segmento,
        siteFabricante: undefined,
        siteInfoStore: anterior.siteInfoStore || "https://www.infostore.com.br/"
      });
      return;
    }

    pendencias.push({ modelo: produtoBase.modelo, motivo: enriquecido ? "Imagem não disponível" : "Fonte ainda precisa de revisão" });
  });

  await fs.writeFile(caminhos.saida, JSON.stringify(catalogo, null, 2), "utf8");
  await fs.writeFile(caminhos.pendencias, JSON.stringify(pendencias, null, 2), "utf8");

  console.log("Prévia gerada.");
  console.log(`Produtos incluídos: ${catalogo.length}`);
  console.log(`Completos: ${catalogo.filter(item => !item.revisaoPendente).length}`);
  console.log(`Em revisão: ${catalogo.filter(item => item.revisaoPendente).length}`);
  console.log(`Ainda não incluídos: ${pendencias.length}`);
}

executar().catch(erro => { console.error("Erro ao gerar prévia:", erro.message); process.exitCode = 1; });
