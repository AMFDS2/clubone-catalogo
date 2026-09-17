const ARQUIVO_CATALOGO = "produtos.preview.json";
const IMAGEM_FALLBACK = "assets/produto-sem-imagem.png";

let todosProdutos = [];
let produtosFiltrados = [];
let produtoSelecionado = null;
const filtrosSelecionados = {
  fabricantes: new Set(),
  segmentos: new Set()
};

document.addEventListener("DOMContentLoaded", inicializar);

async function inicializar() {
  configurarEventosFixos();

  try {
    const resposta = await fetch(ARQUIVO_CATALOGO, { cache: "no-store" });
    if (!resposta.ok) throw new Error(`Falha ao carregar ${ARQUIVO_CATALOGO}: ${resposta.status}`);

    const dados = await resposta.json();
    todosProdutos = Array.isArray(dados) ? dados.filter(produtoValido) : [];
    produtosFiltrados = [...todosProdutos];
    renderizarFiltros();
    ordenarProdutos();
    renderizarProdutos(produtosFiltrados);

    if (produtosFiltrados.length) mostrarDetalhes(produtosFiltrados[0].id);
  } catch (erro) {
    console.error(erro);
    document.getElementById("produtos").innerHTML = estadoMensagem(
      "Não foi possível carregar os produtos. Abra o projeto usando o Live Server."
    );
  }
}

function produtoValido(produto) {
  return Boolean(produto && produto.id && produto.modelo && produto.nome);
}

function configurarEventosFixos() {
  const campoBusca = document.getElementById("busca");
  const ordenacao = document.getElementById("ordenacao");
  const menuMobile = document.getElementById("menuMobile");
  const menuPrincipal = document.getElementById("menuPrincipal");
  const botaoFiltros = document.getElementById("botaoFiltros");
  const painelFiltros = document.getElementById("painelFiltros");
  const limparFiltros = document.getElementById("limparFiltros");

  if (window.matchMedia("(max-width: 900px)").matches) {
    painelFiltros.classList.add("fechado");
    botaoFiltros.setAttribute("aria-expanded", "false");
  }

  campoBusca.addEventListener("input", aplicarFiltros);
  ordenacao.addEventListener("change", aplicarFiltros);

  document.getElementById("filtrosFabricantes").addEventListener("change", atualizarSelecaoFiltro);
  document.getElementById("filtrosSegmentos").addEventListener("change", atualizarSelecaoFiltro);

  botaoFiltros.addEventListener("click", () => {
    const aberto = !painelFiltros.classList.toggle("fechado");
    botaoFiltros.setAttribute("aria-expanded", String(aberto));
  });

  limparFiltros.addEventListener("click", () => {
    filtrosSelecionados.fabricantes.clear();
    filtrosSelecionados.segmentos.clear();
    renderizarFiltros();
    aplicarFiltros();
  });

  document.querySelectorAll("[data-abrir-filtro]").forEach(botao => {
    botao.addEventListener("click", () => {
      painelFiltros.classList.remove("fechado");
      botaoFiltros.setAttribute("aria-expanded", "true");
      document.getElementById(botao.dataset.abrirFiltro === "fabricantes" ? "grupoFabricantes" : "grupoSegmentos").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  menuMobile.addEventListener("click", () => {
    const aberto = menuPrincipal.classList.toggle("aberto");
    menuMobile.setAttribute("aria-expanded", String(aberto));
  });
}

function aplicarFiltros() {
  const busca = normalizarTexto(document.getElementById("busca").value.trim());

  produtosFiltrados = todosProdutos.filter(produto => {
    const fabricante = normalizarTexto(produto.marca || produto.fabricante);
    const segmento = normalizarTexto(produto.segmento || produto.categoria);
    const correspondeFabricante = !filtrosSelecionados.fabricantes.size || filtrosSelecionados.fabricantes.has(fabricante);
    const correspondeSegmento = !filtrosSelecionados.segmentos.size || filtrosSelecionados.segmentos.has(segmento);

    const conteudo = normalizarTexto([
      produto.marca,
      produto.modelo,
      produto.nome,
      produto.nomePlanilha,
      produto.descricao,
      produto.codigoInfo,
      produto.categoria,
      produto.segmento
    ].filter(Boolean).join(" "));

    return correspondeFabricante && correspondeSegmento && (!busca || conteudo.includes(busca));
  });

  ordenarProdutos();
  renderizarProdutos(produtosFiltrados);

  const aindaVisivel = produtosFiltrados.some(produto => produto.id === produtoSelecionado);
  if (!aindaVisivel && produtosFiltrados.length) mostrarDetalhes(produtosFiltrados[0].id);

  if (!produtosFiltrados.length) {
    produtoSelecionado = null;
    document.getElementById("detalhes").innerHTML = `
      <div class="estado-vazio"><h1>Nenhum produto encontrado</h1><p>Tente outro modelo ou categoria.</p></div>`;
  }
}

function atualizarSelecaoFiltro(evento) {
  const input = evento.target.closest("input[data-tipo-filtro]");
  if (!input) return;
  const conjunto = filtrosSelecionados[input.dataset.tipoFiltro];
  if (input.checked) conjunto.add(input.value);
  else conjunto.delete(input.value);
  aplicarFiltros();
}

function renderizarFiltros() {
  preencherGrupoFiltro("filtrosFabricantes", "fabricantes", todosProdutos.map(item => item.marca || item.fabricante));
  preencherGrupoFiltro("filtrosSegmentos", "segmentos", todosProdutos.map(item => item.segmento || item.categoria));
}

function preencherGrupoFiltro(containerId, tipo, valores) {
  const contagens = new Map();
  valores.filter(Boolean).forEach(valor => {
    const chave = normalizarTexto(valor);
    const atual = contagens.get(chave) || { nome: valor, quantidade: 0 };
    atual.quantidade += 1;
    contagens.set(chave, atual);
  });

  document.getElementById(containerId).innerHTML = [...contagens.entries()]
    .sort((a, b) => String(a[1].nome).localeCompare(String(b[1].nome), "pt-BR"))
    .map(([chave, item]) => `
      <label class="opcao-filtro">
        <input type="checkbox" data-tipo-filtro="${tipo}" value="${escaparHTML(chave)}" ${filtrosSelecionados[tipo].has(chave) ? "checked" : ""}>
        <span>${escaparHTML(item.nome)}</span><small>${item.quantidade}</small>
      </label>`).join("");
}

function ordenarProdutos() {
  const tipo = document.getElementById("ordenacao").value;
  produtosFiltrados.sort((a, b) => {
    if (tipo === "modelo") return String(a.modelo).localeCompare(String(b.modelo), "pt-BR");
    if (tipo === "categoria") return String(a.categoria).localeCompare(String(b.categoria), "pt-BR");
    return (b.ordem || 0) - (a.ordem || 0);
  });
}

function renderizarProdutos(produtos) {
  const container = document.getElementById("produtos");
  const quantidade = document.getElementById("quantidadeProdutos");
  quantidade.textContent = `${produtos.length} ${produtos.length === 1 ? "produto encontrado" : "produtos encontrados"}`;

  if (!produtos.length) {
    container.innerHTML = estadoMensagem("Nenhum produto encontrado.");
    return;
  }

  container.innerHTML = produtos.map(produto => {
    const ativo = produto.id === produtoSelecionado;
    return `
      <button type="button" class="produto ${ativo ? "ativo" : ""}" data-produto-id="${escaparHTML(produto.id)}">
        <span class="produto-imagem">
          <img src="${escaparHTML(produto.imagem || IMAGEM_FALLBACK)}" alt="${escaparHTML(produto.nome)}" loading="lazy">
        </span>
        <span class="produto-informacoes">
          <h3>${escaparHTML(produto.nome)}</h3>
          <p>${escaparHTML(produto.marca)} • ${escaparHTML(produto.modelo)}</p>
          <p>${escaparHTML(produto.categoria)}</p>
        </span>
        <span class="produto-favorito" aria-hidden="true">${ativo ? "★" : "☆"}</span>
      </button>`;
  }).join("");

  container.querySelectorAll(".produto").forEach(botao => {
    botao.addEventListener("click", () => mostrarDetalhes(botao.dataset.produtoId, true));
  });

  configurarFallbackImagens(container);
}

function mostrarDetalhes(idProduto, interacaoDoUsuario = false) {
  const produto = todosProdutos.find(item => item.id === idProduto);
  if (!produto) return;

  produtoSelecionado = produto.id;
  renderizarProdutos(produtosFiltrados);

  const destaques = criarDestaques(produto.destaques);
  const especificacoes = criarEspecificacoes(produto.especificacoes);
  const dimensoes = criarBlocagemDimensional(produto.dimensoes, produto);
  const documentos = criarDocumentos(produto.documentos);
  const botaoInfoStore = criarBotaoInfoStore(produto.siteInfoStore);
  const imagens = obterImagensProduto(produto);
  const imagemPrincipal = imagens[0] || IMAGEM_FALLBACK;
  const miniaturas = imagens.length > 1
    ? `<div class="galeria-miniaturas" aria-label="Galeria de imagens">
        ${imagens.map((imagem, indice) => `
          <button type="button" class="miniatura ${indice === 0 ? "ativo" : ""}" data-imagem="${escaparHTML(imagem)}" aria-label="Ver imagem ${indice + 1}">
            <img src="${escaparHTML(imagem)}" alt="" loading="lazy">
          </button>`).join("")}
       </div>`
    : "";

  document.getElementById("detalhes").innerHTML = `
    <div class="produto-hero">
      <div class="produto-resumo">
        <span class="badge">${escaparHTML(produto.categoria)}</span>
        <h1 class="nome-produto">${escaparHTML(produto.nome)}</h1>
        <p class="subtitulo produto-identificacao">${escaparHTML(produto.marca)} <span aria-hidden="true">•</span> Modelo ${escaparHTML(produto.modelo)}</p>
        <p class="codigo-produto">Código Info Store: <strong>${escaparHTML(produto.codigoInfo || "Consultar")}</strong></p>
        ${destaques ? `<div class="destaques">${destaques}</div>` : ""}
        ${botaoInfoStore ? `<div class="acoes">${botaoInfoStore}</div>` : ""}
      </div>

      <div class="produto-media">
        <div class="produto-imagem-principal">
          <img id="imagemPrincipalProduto" src="${escaparHTML(imagemPrincipal)}" alt="${escaparHTML(produto.nome)}">
        </div>
        ${miniaturas}
      </div>
    </div>

    <div class="area-tecnica">
      <nav class="tabs" aria-label="Informações do produto">
  <button
    type="button"
    class="tab ativo"
    data-tab="especificacoes"
  >
    Especificações
  </button>

  <button
    type="button"
    class="tab"
    data-tab="dimensoes"
  >
    Dimensões
  </button>

  <button
    type="button"
    class="tab"
    data-tab="documentos"
  >
    Documentos
  </button>
</nav>

<section
  class="painel-tab ativo"
  id="painel-especificacoes"
>
  <div class="grade-tecnica">
    <div class="tabela-especificacoes">
      ${especificacoes}
    </div>

    <div>
      <div class="card-dimensoes">
        <h3>Dimensões</h3>
        ${dimensoes}
      </div>

      ${criarAviso()}
    </div>
  </div>
</section>

<section
  class="painel-tab"
  id="painel-dimensoes"
>
  <div class="card-dimensoes">
    <h3>Dimensões do produto</h3>
    ${dimensoes}
  </div>

  ${criarAviso()}
</section>

<section
  class="painel-tab"
  id="painel-documentos"
>
  <div class="card-documentos">
    <h3>Documentos oficiais</h3>

    <div class="lista-documentos">
      ${documentos}
    </div>
  </div>
</section>

      <section class="painel-tab ativo" id="painel-especificacoes">
        <div class="grade-tecnica">
          <div class="tabela-especificacoes">${especificacoes}</div>
          <div><div class="card-dimensoes"><h3>Dimensões</h3>${dimensoes}</div>${criarAviso()}</div>
        </div>
      </section>

      <section class="painel-tab" id="painel-dimensoes">
        <div class="card-dimensoes"><h3>Dimensões do produto</h3>${dimensoes}</div>${criarAviso()}
      </section>

      <section class="painel-tab" id="painel-instalacao">
        <div class="card-instalacao"><h3>Orientações para instalação</h3><p class="texto-tecnico">${escaparHTML(produto.instalacao || "Valide medidas, ventilação, pontos elétricos, hidráulicos e requisitos estruturais antes da instalação.")}</p></div>
      </section>

      <section class="painel-tab" id="painel-documentos">
        <div class="card-documentos"><h3>Documentos técnicos</h3><div class="lista-documentos">${documentos}</div></div>
      </section>

      <section class="painel-tab" id="painel-marca">
        <div class="card-marca"><h3>Sobre ${escaparHTML(produto.marca)}</h3><p class="texto-tecnico">${escaparHTML(produto.sobreMarca || "Soluções de tecnologia e eletrodomésticos para projetos residenciais e comerciais.")}</p></div>
      </section>
    </div>`;

  configurarAbas();
  configurarGaleria();
  configurarFallbackImagens(document.getElementById("detalhes"));

  if (interacaoDoUsuario && window.matchMedia("(max-width: 900px)").matches) {
    requestAnimationFrame(() => {
      document.getElementById("detalhes").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }
}

function obterImagensProduto(produto = {}) {
  const lista = [
    ...(Array.isArray(produto.imagens) ? produto.imagens : []),
    produto.imagem
  ];

  return [...new Set(lista.filter(Boolean))].slice(0, 5);
}

function configurarGaleria() {
  const principal = document.getElementById("imagemPrincipalProduto");
  if (!principal) return;

  document.querySelectorAll(".miniatura").forEach(botao => {
    botao.addEventListener("click", () => {
      principal.src = botao.dataset.imagem;
      document.querySelectorAll(".miniatura").forEach(item => item.classList.remove("ativo"));
      botao.classList.add("ativo");
    });
  });
}

function criarBotaoInfoStore(url) {
  if (!url) return "";
  return `<a href="${escaparHTML(url)}" target="_blank" rel="noopener noreferrer" class="botao-preto">Ver na Info Store ↗</a>`;
}

function criarDestaques(destaques = []) {
  return destaques
    .filter(item => item && (item.titulo || item.valor))
    .slice(0, 5)
    .map(item => {
      const valor = item.titulo || item.valor;
      return `
        <div class="destaque">
          <span class="destaque-icone" aria-hidden="true">${escaparHTML(item.icone || "◇")}</span>
          <span class="destaque-texto"><strong>${escaparHTML(valor)}</strong>${item.rotulo ? `<small>${escaparHTML(item.rotulo)}</small>` : ""}</span>
        </div>`;
    }).join("");
}

function criarEspecificacoes(especificacoes = {}) {
  const itens = Object.entries(especificacoes).filter(([, valor]) => valor !== "" && valor != null);
  if (!itens.length) return estadoMensagem("Especificações ainda não cadastradas.");
  return itens.map(([titulo, valor]) => `
    <div class="linha-especificacao"><span>${escaparHTML(titulo)}</span><span>${escaparHTML(valor)}</span></div>`).join("");
}

function criarDimensoes(dimensoes = {}, produto = {}) {
  const textoProduto = normalizarTexto(
    [
      produto.nome,
      produto.modelo,
      produto.categoria,
      produto.segmento
    ].filter(Boolean).join(" ")
  );

  const categoriaProduto = normalizarTexto(
    produto.categoria || produto.segmento || ""
  );

  const modeloProduto = normalizarTexto(
  produto.modelo || ""
);
  const ehTV =
    categoriaProduto === "video" ||
    textoProduto.startsWith("tv ") ||
    textoProduto.includes(" tv ") ||
    textoProduto.includes("televisor");

  const ehCooktop =
    textoProduto.includes("cooktop");

  const ehFogao =
  textoProduto.startsWith("fog ") ||
  textoProduto.includes(" fog ") ||
  textoProduto.includes("fogao") ||
  modeloProduto.startsWith("nsg");

  const ehForno =
    textoProduto.includes("forno") ||
    textoProduto.includes("micro-ondas") ||
    textoProduto.includes("microondas");

  const ehLavadora =
  textoProduto.includes("lava e seca") ||
  textoProduto.includes("lavadora") ||
  textoProduto.includes("maquina de lavar") ||
  textoProduto.includes("maq lav") ||
  textoProduto.includes("lav roupa") ||
  modeloProduto.startsWith("ww") ||
  modeloProduto.startsWith("wd");

  const ehLavaLoucas =
  textoProduto.includes("lava loucas") ||
  textoProduto.includes("lava-loucas") ||
  textoProduto.includes("lava louca") ||
  modeloProduto.startsWith("dw");

  const medidas =
    dimensoes.produto ||
    dimensoes.semBase ||
    dimensoes.semEmbalagem ||
    dimensoes.comBase ||
    {};

  function buscarMedida(nomes = []) {
    const entrada = Object.entries(medidas).find(([nome]) =>
      nomes.includes(normalizarTexto(nome))
    );

    return entrada?.[1] || "";
  }

  function criarLinha(titulo, valor) {
    return `
      <div class="linha-dimensao-tecnica">
        <strong>${escaparHTML(titulo)}</strong>
        <span>${escaparHTML(valor || "—")}</span>
      </div>
    `;
  }

  const largura = buscarMedida(["largura", "width"]);
  const altura = buscarMedida(["altura", "height"]);
  const profundidade = buscarMedida([
    "profundidade",
    "depth"
  ]);

  const peso =
    medidas.peso ||
    dimensoes.peso ||
    produto.especificacoes?.["Peso líquido"] ||
    produto.especificacoes?.["Peso"] ||
    "";

  if (!largura && !altura && !profundidade) {
    return `
      <p class="texto-tecnico">
        Dimensões em revisão.
      </p>
    `;
  }

  let formaProduto = "";

  if (ehTV) {
    formaProduto = `
      <g class="forma-produto forma-tv">
        <rect
          x="25"
          y="46"
          width="165"
          height="98"
          rx="3"
        ></rect>

        <rect
          x="33"
          y="54"
          width="149"
          height="82"
          rx="1"
          class="tela-tv"
        ></rect>

        <line x1="107" y1="144" x2="107" y2="163"></line>
        <line x1="76" y1="164" x2="138" y2="164"></line>

        <path d="M190 46 L198 52 L198 138 L190 144"></path>
      </g>
    `;
  } else if (ehCooktop) {
    formaProduto = `
      <g class="forma-produto forma-cooktop">
        <path d="M29 79 L154 57 L190 87 L63 112 Z"></path>
        <path d="M63 112 L190 87 L190 101 L63 127 Z"></path>
        <path d="M29 79 L63 112 L63 127 L29 94 Z"></path>

        <ellipse cx="72" cy="88" rx="16" ry="9"></ellipse>
        <ellipse cx="122" cy="78" rx="16" ry="9"></ellipse>
        <ellipse cx="104" cy="104" rx="15" ry="8"></ellipse>
        <ellipse cx="154" cy="94" rx="15" ry="8"></ellipse>
      </g>
    `;
    } else if (ehFogao) {
  formaProduto = `
    <g class="forma-produto forma-fogao">
      <!-- Corpo -->
      <rect
        x="55"
        y="47"
        width="110"
        height="137"
        rx="3"
      ></rect>

      <!-- Mesa superior -->
      <path
        d="M55 47 L151 47 L174 62 L76 62 Z"
      ></path>

      <!-- Painel -->
      <rect
        x="61"
        y="63"
        width="98"
        height="25"
        rx="2"
      ></rect>

      <circle cx="74" cy="75" r="4"></circle>
      <circle cx="89" cy="75" r="4"></circle>
      <circle cx="131" cy="75" r="4"></circle>
      <circle cx="146" cy="75" r="4"></circle>

      <!-- Visor -->
      <rect
        x="98"
        y="70"
        width="23"
        height="10"
        rx="1"
      ></rect>

      <!-- Porta do forno -->
      <rect
        x="66"
        y="98"
        width="88"
        height="66"
        rx="2"
      ></rect>

      <line
        x1="75"
        y1="108"
        x2="145"
        y2="108"
      ></line>

      <!-- Profundidade lateral -->
      <path
        d="M165 70 L174 62 L174 169 L165 184"
      ></path>

      <!-- Pés -->
      <line x1="68" y1="184" x2="68" y2="190"></line>
      <line x1="151" y1="184" x2="151" y2="190"></line>
    </g>
  `;
  } else if (ehForno) {
    formaProduto = `
      <g class="forma-produto forma-forno">
        <rect x="55" y="38" width="104" height="142" rx="3"></rect>
        <rect x="64" y="72" width="86" height="86" rx="2"></rect>
        <line x1="64" y1="61" x2="150" y2="61"></line>
        <circle cx="75" cy="50" r="3"></circle>
        <circle cx="88" cy="50" r="3"></circle>
        <path d="M159 38 L174 49 L174 168 L159 180"></path>
      </g>
    `;
  } else if (ehLavadora) {
    formaProduto = `
      <g class="forma-produto forma-lavadora">
        <rect x="58" y="29" width="101" height="156" rx="4"></rect>
        <line x1="58" y1="59" x2="159" y2="59"></line>
        <circle cx="108" cy="119" r="36"></circle>
        <circle cx="108" cy="119" r="27"></circle>
        <rect x="70" y="40" width="36" height="8" rx="1"></rect>
        <circle cx="142" cy="45" r="5"></circle>
        <path d="M159 29 L174 40 L174 173 L159 185"></path>
      </g>
    `;
  } else if (ehLavaLoucas) {
    formaProduto = `
      <g class="forma-produto forma-lava-loucas">
        <rect x="58" y="29" width="101" height="156" rx="3"></rect>
        <line x1="58" y1="59" x2="159" y2="59"></line>
        <line x1="72" y1="46" x2="145" y2="46"></line>
        <rect x="75" y="70" width="66" height="4" rx="2"></rect>
        <path d="M159 29 L174 40 L174 173 L159 185"></path>
      </g>
    `;
  } else {
    formaProduto = `
      <g class="forma-produto forma-geladeira">
        <rect x="68" y="22" width="79" height="166" rx="3"></rect>
        <path d="M147 22 L164 35 L164 176 L147 188"></path>
        <line x1="68" y1="106" x2="147" y2="106"></line>
        <line x1="136" y1="48" x2="136" y2="91"></line>
        <line x1="136" y1="119" x2="136" y2="156"></line>
      </g>
    `;
  }

  return `
    <div class="dimensoes-tecnicas">
      <div class="desenho-dimensoes">
        <svg
          class="diagrama-produto"
          viewBox="0 0 230 225"
          role="img"
          aria-label="Representação dimensional de ${escaparHTML(produto.nome)}"
        >
          ${formaProduto}

          <g class="linhas-medidas">
            <line x1="36" y1="204" x2="170" y2="204"></line>
            <line x1="36" y1="198" x2="36" y2="210"></line>
            <line x1="170" y1="198" x2="170" y2="210"></line>

            <line x1="209" y1="30" x2="209" y2="184"></line>
            <line x1="203" y1="30" x2="215" y2="30"></line>
            <line x1="203" y1="184" x2="215" y2="184"></line>

            <line x1="174" y1="198" x2="198" y2="184"></line>

            <text x="99" y="221">A</text>
            <text x="218" y="111">B</text>
            <text x="194" y="211">C</text>
          </g>
        </svg>
      </div>

      <div class="tabela-dimensoes-tecnicas">
        <h4 class="dimensoes-subtitulo">
          Dimensões do produto
        </h4>

        ${criarLinha("A - Largura", largura)}
        ${criarLinha("B - Altura", altura)}
        ${criarLinha("C - Profundidade", profundidade)}

        ${
          peso
            ? `
              <div class="peso-produto">
                <strong>Peso:</strong>
                ${escaparHTML(peso)}
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function criarDocumentos(documentos = []) {
  const validos = documentos.filter(
    documento =>
      documento &&
      documento.nome &&
      documento.url
  );

  if (!validos.length) {
    return `
      <p class="texto-tecnico">
        Nenhum documento oficial disponível no momento.
      </p>
    `;
  }

  return validos.map(documento => `
    <a
      href="${escaparHTML(documento.url)}"
      target="_blank"
      rel="noopener noreferrer"
      class="documento-link"
    >
      <span class="documento-informacoes">
        <strong>
          ${escaparHTML(documento.nome)}
        </strong>

        <small>
          ${escaparHTML(
            documento.descricao ||
            "Documento oficial do fabricante"
          )}
        </small>
      </span>

      <span class="documento-acao">
        Abrir PDF ↗
      </span>
    </a>
  `).join("");
}

function criarAviso() {
  return `<div class="aviso"><span class="aviso-icone">ⓘ</span><div><strong>Observações importantes</strong><p>Valide as medidas e as condições de instalação antes de fechar o projeto. Imagens meramente ilustrativas.</p></div></div>`;
}

function configurarAbas() {
  const detalhes = document.getElementById("detalhes");
  const botoes = detalhes.querySelectorAll(".tab");
  const paineis = detalhes.querySelectorAll(".painel-tab");

  botoes.forEach(botao => botao.addEventListener("click", () => {
    botoes.forEach(item => item.classList.remove("ativo"));
    paineis.forEach(item => item.classList.remove("ativo"));
    botao.classList.add("ativo");
    detalhes.querySelector(`#painel-${botao.dataset.tab}`)?.classList.add("ativo");
  }));
}

function configurarFallbackImagens(raiz) {
  raiz.querySelectorAll("img").forEach(imagem => {
    imagem.addEventListener("error", () => {
      if (!imagem.src.endsWith(IMAGEM_FALLBACK)) imagem.src = IMAGEM_FALLBACK;
    }, { once: true });
  });
}

function estadoMensagem(mensagem) {
  return `<div class="sem-resultados">${escaparHTML(mensagem)}</div>`;
}

function formatarTitulo(texto = "") {
  const mapa = { semBase: "Sem base", comBase: "Com base", produto: "Produto", embalagem: "Embalagem" };
  return mapa[texto] || String(texto).replace(/([A-Z])/g, " $1").replace(/^./, letra => letra.toUpperCase());
}

function normalizarTexto(texto = "") {
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escaparHTML(valor = "") {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
