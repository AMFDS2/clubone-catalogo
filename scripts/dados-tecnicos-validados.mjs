const campoManual = (valor, pagina, referencia, observacao = "") => ({
  valor,
  pagina: String(pagina),
  referencia,
  status: "CONFIRMADO",
  observacao,
  fonte: "MANUAL_VALIDADO"
});

const campoOficial = (valor, referencia, observacao = "") => ({
  valor,
  pagina: "Fonte oficial",
  referencia,
  status: "CONFIRMADO",
  observacao,
  fonte: "CADASTRO_OFICIAL"
});

const garantirEstrutura = dados => {
  dados.dimensoesProduto ||= {};
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

      const paginaDimensoes = 20;
      const pagina = 21;
      const familia = "RF27CG5*1***";
      const nota =
        "Cotas conferidas na coluna RF27CG5*1*** da tabela dimensional do manual.";

      // A leitura automática confundiu uma anotação do manual com folga superior.
      // Como essa cota não foi confirmada na tabela desta família, ela não deve ser exibida.
      delete dados.folgas.superior;

      dados.dimensoesProduto.largura = campoManual("908 mm", paginaDimensoes, `${familia} / dimensão B`, "Largura total do produto.");
      dados.dimensoesProduto.altura = campoManual("1778 mm", paginaDimensoes, `${familia} / dimensão D`, "Altura total do produto, incluindo dobradiças.");
      dados.dimensoesProduto.profundidade = campoManual("748 mm", paginaDimensoes, `${familia} / dimensão A`, "Profundidade total do produto.");
      dados.geometriaInstalacao.larguraProduto = campoManual("908 mm", paginaDimensoes, `${familia} / dimensão B`, "Largura total do produto.");
      dados.geometriaInstalacao.alturaProduto = campoManual("1778 mm", paginaDimensoes, `${familia} / dimensão D`, "Altura total do produto.");
      dados.geometriaInstalacao.profundidadeTotalProduto = campoManual("748 mm", paginaDimensoes, `${familia} / dimensão A`, "Profundidade total do produto.");

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

      return 20;
    }
  },

  {
    corresponde: modelo => modelo === "RF70H25HETAZ",

    aplicar(dados) {
      garantirEstrutura(dados);
      const notaDimensoes = "Cotas do produto conferidas no desenho dimensional do manual oficial.";
      const notaAbertura = "Cotas de abertura conferidas no desenho de instalação do manual oficial.";

      dados.dimensoesProduto.largura = campoManual("912 mm", 20, "Dimensões do produto / largura", notaDimensoes);
      dados.dimensoesProduto.altura = campoManual("1749 mm", 20, "Dimensões do produto / altura", notaDimensoes);
      dados.dimensoesProduto.profundidade = campoManual("698 mm", 20, "Dimensões do produto / profundidade", notaDimensoes);
      dados.geometriaInstalacao.larguraProduto = campoManual("912 mm", 20, "Dimensões do produto / largura", notaDimensoes);
      dados.geometriaInstalacao.alturaProduto = campoManual("1749 mm", 20, "Dimensões do produto / altura", notaDimensoes);
      dados.geometriaInstalacao.profundidadeTotalProduto = campoManual("698 mm", 20, "Dimensões do produto / profundidade", notaDimensoes);
      dados.abertura.anguloPorta = campoManual("108°", 21, "Ângulo máximo de abertura das portas", notaAbertura);
      dados.abertura.distanciaPortasAbertas = campoManual("1140 mm", 21, "Largura com portas abertas", notaAbertura);
      dados.abertura.distanciaGavetasEstendidas = campoManual("1113 mm", 21, "Profundidade com gavetas estendidas", notaAbertura);
      dados.geometriaInstalacao.anguloAbertura = campoManual("108°", 21, "Ângulo máximo de abertura das portas", notaAbertura);
      dados.geometriaInstalacao.larguraComPortasAbertas = campoManual("1140 mm", 21, "Largura com portas abertas", notaAbertura);
      dados.geometriaInstalacao.profundidadeComGavetasEstendidas = campoManual("1113 mm", 21, "Profundidade com gavetas estendidas", notaAbertura);
      dados.observacoes = [...new Set([...dados.observacoes, "Dimensões e cotas de abertura do RF70H25HETAZ restauradas a partir do manual oficial."])];
      return 12;
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
  },
  {
    corresponde: modelo => modelo === "02543FBA130",

    aplicar(dados) {
      garantirEstrutura(dados);

      const referencia = "IM8IS / abertura funcional das gavetas";
      const nota = "A Electrolux informa que todas as gavetas podem ser acessadas com a porta aberta em até 90°. A vista representa essa posição funcional; o fabricante não publica a largura total com as portas abertas.";

      dados.abertura.anguloPorta = campoOficial("90°", referencia, nota);
      dados.abertura.representacaoPortas = campoOficial(
        "Duas portas superiores abertas",
        referencia,
        "Representação esquemática da abertura; sem largura ou profundidade total publicada."
      );
      dados.geometriaInstalacao.anguloAbertura = campoOficial("90°", referencia, nota);
      dados.geometriaInstalacao.anguloAberturaEsquerda = campoOficial("90°", referencia, nota);
      dados.geometriaInstalacao.anguloAberturaDireita = campoOficial("90°", referencia, nota);

      dados.observacoes = [
        ...new Set([
          ...dados.observacoes,
          "Vista superior com portas a 90° representa a posição funcional indicada pela Electrolux para acesso às gavetas.",
          "A largura e a profundidade totais com portas abertas não foram publicadas; não usar o desenho esquemático como cota de marcenaria."
        ])
      ];

      return 5;
    }
  },
  {
    corresponde: modelo => modelo === "02544FBA130",

    aplicar(dados) {
      garantirEstrutura(dados);

      const ref = "IQ8IS / configuração oficial de quatro portas";
      const nota = "A ficha oficial confirma a configuração Multidoor de quatro portas. O fabricante não publica cota total nem ângulo de abertura para este modelo; por isso, o giro é apenas esquemático.";

      dados.abertura.representacaoPortas = campoOficial(
        "Quatro portas com abertura lateral",
        ref,
        nota
      );

      dados.observacoes = [
        ...new Set([
          ...dados.observacoes,
          "Vista superior com as portas abertas em representação esquemática da configuração Multidoor.",
          "Não usar o giro desenhado como cota de marcenaria: o ângulo e as dimensões totais com portas abertas não foram publicados."
        ])
      ];

      return 1;
    }
  },
  {
    corresponde: modelo => modelo === "02547FBA135",

    aplicar(dados) {
      garantirEstrutura(dados);

      const ref = "IQ8IB / configuração oficial de quatro portas";
      const nota = "A ficha oficial confirma a configuração Multidoor de quatro portas. O fabricante não publica cota total nem ângulo de abertura para este modelo; por isso, o giro é apenas esquemático.";

      dados.abertura.representacaoPortas = campoOficial(
        "Quatro portas com abertura lateral",
        ref,
        nota
      );

      dados.observacoes = [
        ...new Set([
          ...dados.observacoes,
          "Vista superior com as portas abertas em representação esquemática da configuração Multidoor.",
          "Não usar o giro desenhado como cota de marcenaria: o ângulo e as dimensões totais com portas abertas não foram publicados."
        ])
      ];

      return 1;
    }
  },
  {
    corresponde: modelo => modelo === "1512QDBA199",

    aplicar(dados) {
      garantirEstrutura(dados);

      const referencia = "LFC12 / tipo de abertura frontal";
      const nota = "A ficha oficial confirma abertura frontal. O giro é representado de forma esquemática porque o fabricante não publica o ângulo nem a projeção total da porta aberta.";

      dados.abertura.representacaoPortas = campoOficial(
        "Porta frontal com abertura lateral",
        referencia,
        nota
      );

      dados.observacoes = [
        ...new Set([
          ...dados.observacoes,
          "A porta frontal aberta é apresentada de forma esquemática para leitura arquitetônica.",
          "Confirmar em campo a projeção da porta e a circulação frontal antes de executar a marcenaria."
        ])
      ];

      return 1;
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
