const campoManual = (valor, pagina, referencia, observacao = "") => ({
  valor,
  pagina: String(pagina),
  referencia,
  status: "CONFIRMADO",
  observacao,
  fonte: "MANUAL_VALIDADO"
});

const garantirEstrutura = dados => {
  dados.folgas ||= {};
  dados.abertura ||= {};
  dados.geometriaInstalacao ||= {};
  dados.observacoes ||= [];
};

const regras = [
  {
    corresponde: modelo => modelo.startsWith("RF29DB9950QD"),

    aplicar(dados) {
      garantirEstrutura(dados);

      const pagina = 22;
      const familia = "RF29D**";
      const nota = "Tabela dimensional da família RF29D**.";

      dados.folgas.superior = campoManual(
        "superior a 50 mm",
        pagina,
        `${familia} / item 01`,
        nota
      );

      dados.abertura.anguloPorta = campoManual(
        "125°",
        pagina,
        `${familia} / item 02`,
        nota
      );

      dados.abertura.distanciaPortasAbertas = campoManual(
        "1498 mm",
        pagina,
        `${familia} / item 03`,
        nota
      );

      dados.geometriaInstalacao.anguloAbertura = campoManual(
        "125°",
        pagina,
        `${familia} / item 02`,
        nota
      );

      dados.geometriaInstalacao.larguraComPortasAbertas = campoManual(
        "1498 mm",
        pagina,
        `${familia} / item 03`,
        nota
      );

      dados.geometriaInstalacao.folgaLateralEsquerda = campoManual(
        "295 mm",
        pagina,
        `${familia} / item 04`,
        nota
      );

      dados.geometriaInstalacao.folgaLateralDireita = campoManual(
        "295 mm",
        pagina,
        `${familia} / item 04`,
        nota
      );

      dados.geometriaInstalacao.profundidadeGabinete = campoManual(
        "748 mm",
        pagina,
        `${familia} / item 05`,
        nota
      );

      dados.geometriaInstalacao.avancoFrontal = campoManual(
        "55 mm",
        pagina,
        `${familia} / item 06`,
        nota
      );

      dados.geometriaInstalacao.profundidadeComPortasAbertas = campoManual(
        "1231 mm",
        pagina,
        `${familia} / item 07`,
        nota
      );

      dados.observacoes = [
        ...new Set([
          ...dados.observacoes,
          "Cotas de abertura conferidas na tabela RF29D** do manual."
        ])
      ];

      return 10;
    }
  },

  {
    corresponde: modelo => modelo === "RF27CG5910B1AZ",

    aplicar(dados) {
      garantirEstrutura(dados);

      const pagina = 21;
      const familia = "RF27CG5*1***";
      const nota =
        "Cotas conferidas na coluna RF27CG5*1*** da tabela dimensional do manual.";

      // A leitura automática confundiu uma anotação do manual com folga superior.
      // Como essa cota não foi confirmada na tabela desta família, ela não deve ser exibida.
      delete dados.folgas.superior;

      dados.folgas.traseira = campoManual(
        "50 mm",
        pagina,
        `${familia} / item 01`,
        nota
      );

      dados.folgas.lateral = campoManual(
        "283 mm",
        pagina,
        `${familia} / item 04`,
        "Espaço lateral necessário para abertura completa das portas."
      );

      dados.abertura.anguloPorta = campoManual(
        "125°",
        pagina,
        `${familia} / item 02`,
        nota
      );

      dados.abertura.distanciaPortasAbertas = campoManual(
        "1474 mm",
        pagina,
        `${familia} / item 03`,
        "Largura total do produto com as duas portas abertas."
      );

      dados.geometriaInstalacao.afastamentoTraseiro = campoManual(
        "50 mm",
        pagina,
        `${familia} / item 01`,
        nota
      );

      dados.geometriaInstalacao.folgaLateral = campoManual(
        "283 mm",
        pagina,
        `${familia} / item 04`,
        "Espaço lateral necessário para abertura completa."
      );

      dados.geometriaInstalacao.folgaLateralEsquerda = campoManual(
        "283 mm",
        pagina,
        `${familia} / item 04`,
        "Espaço necessário no lado esquerdo para abertura completa."
      );

      dados.geometriaInstalacao.folgaLateralDireita = campoManual(
        "283 mm",
        pagina,
        `${familia} / item 04`,
        "Espaço necessário no lado direito para abertura completa."
      );

      dados.geometriaInstalacao.anguloAbertura = campoManual(
        "125°",
        pagina,
        `${familia} / item 02`,
        nota
      );

      dados.geometriaInstalacao.anguloAberturaEsquerda = campoManual(
        "125°",
        pagina,
        `${familia} / item 02`,
        "Ângulo máximo da porta esquerda."
      );

      dados.geometriaInstalacao.anguloAberturaDireita = campoManual(
        "125°",
        pagina,
        `${familia} / item 02`,
        "Ângulo máximo da porta direita."
      );

      dados.geometriaInstalacao.larguraComPortasAbertas = campoManual(
        "1474 mm",
        pagina,
        `${familia} / item 03`,
        "Largura total com as duas portas abertas."
      );

      dados.geometriaInstalacao.profundidadeGabinete = campoManual(
        "635 mm",
        pagina,
        `${familia} / item 06`,
        "Profundidade do gabinete sem considerar toda a projeção frontal."
      );

      dados.geometriaInstalacao.avancoFrontal = campoManual(
        "48 mm",
        pagina,
        `${familia} / item 08`,
        "Projeção frontal indicada no desenho dimensional."
      );

      dados.geometriaInstalacao.profundidadeComPortasAbertas = campoManual(
        "1118 mm",
        pagina,
        `${familia} / item 09`,
        "Profundidade do produto com as portas abertas."
      );

      dados.observacoes = [
        ...new Set([
          ...dados.observacoes,
          "Foi utilizada exclusivamente a coluna RF27CG5*1*** correspondente ao modelo RF27CG5910B1AZ.",
          "Abertura máxima das portas: 125°.",
          "Largura total com portas abertas: 1474 mm.",
          "Profundidade com portas abertas: 1118 mm.",
          "O desenho informa 1150 mm como profundidade total de espaço necessário para instalação e abertura.",
          "Manter afastamento traseiro mínimo de 50 mm.",
          "Considerar 283 mm de espaço lateral para a abertura completa de cada porta."
        ])
      ];

      return 14;
    }
  },

  {
    corresponde: modelo => modelo === "01572RB1135",

    aplicar(dados) {
      garantirEstrutura(dados);

      const paginaAbertura = "Dimensões da abertura da porta";
      const paginaInstalacao = "Espaçamento mínimo de instalação";
      const notaAbertura =
        "Cotas conferidas visualmente no desenho Dimensões da abertura da porta.";
      const notaInstalacao =
        "Distâncias mínimas indicadas pelo fabricante para garantir o desempenho do aparelho.";

      dados.folgas.superior = campoManual(
        "150 mm",
        paginaInstalacao,
        "Acima: mínimo de 15 cm",
        notaInstalacao
      );

      dados.folgas.lateral = campoManual(
        "100 mm",
        paginaInstalacao,
        "Lateral: mínimo de 10 cm",
        notaInstalacao
      );

      dados.folgas.traseira = campoManual(
        "100 mm",
        paginaInstalacao,
        "Atrás: mínimo de 10 cm",
        notaInstalacao
      );

      dados.geometriaInstalacao.folgaLateral = campoManual(
        "100 mm",
        paginaInstalacao,
        "Folga lateral mínima",
        notaInstalacao
      );

      dados.geometriaInstalacao.folgaLateralEsquerda = campoManual(
        "100 mm",
        paginaInstalacao,
        "Folga mínima no lado esquerdo",
        notaInstalacao
      );

      dados.geometriaInstalacao.folgaLateralDireita = campoManual(
        "100 mm",
        paginaInstalacao,
        "Folga mínima no lado direito",
        notaInstalacao
      );

      dados.geometriaInstalacao.afastamentoTraseiro = campoManual(
        "100 mm",
        paginaInstalacao,
        "Afastamento mínimo da parede traseira",
        notaInstalacao
      );

      dados.abertura.anguloPorta = campoManual(
        "135°",
        paginaAbertura,
        "Ângulo de abertura das portas",
        notaAbertura
      );

      dados.abertura.distanciaPortasAbertas = campoManual(
        "1661 mm",
        paginaAbertura,
        "Largura total com as duas portas abertas",
        notaAbertura
      );

      dados.geometriaInstalacao.anguloAbertura = campoManual(
        "135°",
        paginaAbertura,
        "Ângulo de abertura das portas",
        notaAbertura
      );

      dados.geometriaInstalacao.anguloAberturaEsquerda = campoManual(
        "135°",
        paginaAbertura,
        "Porta esquerda aberta",
        notaAbertura
      );

      dados.geometriaInstalacao.anguloAberturaDireita = campoManual(
        "135°",
        paginaAbertura,
        "Porta direita aberta",
        notaAbertura
      );

      dados.geometriaInstalacao.larguraComPortasAbertas = campoManual(
        "1661 mm",
        paginaAbertura,
        "Largura total com as portas abertas",
        notaAbertura
      );

      dados.geometriaInstalacao.profundidadeGabinete = campoManual(
        "570 mm",
        paginaAbertura,
        "Profundidade do gabinete até o eixo das portas",
        notaAbertura
      );

      dados.geometriaInstalacao.profundidadeComPortasAbertas = campoManual(
        "950 mm",
        paginaAbertura,
        "Profundidade total necessária com as portas abertas",
        notaAbertura
      );

      dados.observacoes = [
        ...new Set([
          ...dados.observacoes,
          "Manter no mínimo 150 mm acima, 100 mm nas laterais e 100 mm atrás do aparelho.",
          "O aparelho não deve ser instalado sob móveis que avancem além do alinhamento da parede.",
          "As duas portas possuem abertura máxima de 135°.",
          "O espaço total indicado para abertura das portas é de 1661 × 950 mm.",
          "O nivelamento deve ser realizado pelos pés ajustáveis na base do aparelho."
        ])
      ];

      return 15;
    }
  }
];

export function aplicarDadosTecnicosValidados(produto = {}, dados = {}) {
  const modelo = String(produto.modelo || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const regra = regras.find(item => item.corresponde(modelo));

  return regra ? regra.aplicar(dados) : 0;
}
