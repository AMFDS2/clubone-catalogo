const ARQUIVO_CATALOGO = "produtos.preview.json";
const IMAGEM_FALLBACK = "assets/produto-sem-imagem.svg";

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
      "N\u00E3o foi poss\u00EDvel carregar os produtos. Abra o projeto usando o Live Server."
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
          <p>${escaparHTML(produto.marca)} \u2022 ${escaparHTML(produto.modelo)}</p>
          <p>${escaparHTML(produto.categoria)}</p>
        </span>
        <span class="produto-favorito" aria-hidden="true">${ativo ? "\u2605" : "\u2606"}</span>
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
  const dimensoes = typeof criarBlocagemDimensional === "function"
    ? criarBlocagemDimensional(produto.dimensoes || {}, produto)
    : criarDimensoes(produto.dimensoes || {}, produto);
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
        <p class="subtitulo produto-identificacao">${escaparHTML(produto.marca)} <span aria-hidden="true">\u2022</span> Modelo ${escaparHTML(produto.modelo)}</p>
        <p class="codigo-produto">C\u00F3digo Info Store: <strong>${escaparHTML(produto.codigoInfo || "Consultar")}</strong></p>
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
    <button type="button" class="tab ativo" data-tab="especificacoes">Especificações
    </button>

    <button type="button" class="tab" data-tab="dimensoes">
      Dimens\u00F5es
    </button>

    <button type="button" class="tab" data-tab="documentos">
      Documentos
    </button>
  </nav>

  <section class="painel-tab ativo" id="painel-especificacoes">
    <div class="grade-tecnica">
      <div class="tabela-especificacoes">
        ${especificacoes}
      </div>

      <div>
        <div class="card-dimensoes">
          <h3>Dimens\u00F5es</h3>
          ${dimensoes}
        </div>

        ${criarAviso()}
      </div>
    </div>
  </section>

  <section class="painel-tab" id="painel-dimensoes">
    <div class="card-dimensoes">
      <h3>Dimens\u00F5es do produto</h3>
      ${dimensoes}
    </div>

    ${criarAviso()}
  </section>

  <section class="painel-tab" id="painel-documentos">
    <div class="card-documentos">
      <h3>Documentos oficiais</h3>

      <div class="lista-documentos">
        ${documentos}
      </div>
    </div>
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
  return `<a href="${escaparHTML(url)}" target="_blank" rel="noopener noreferrer" class="botao-preto">Ver na Info Store \u2197</a>`;
}

function criarDestaques(destaques = []) {
  const lista = Array.isArray(destaques) ? destaques : [];

  return lista
    .filter(item => {
      if (!item || (!item.titulo && !item.valor)) return false;

      const valor = String(item.titulo || item.valor).trim();

      // Descrições extensas não devem aparecer como destaque.
      return valor.length <= 48;
    })
    .slice(0, 5)
    .map(item => {
      const valor = String(item.titulo || item.valor).trim();
      const rotulo = item.rotulo || "";
      const icone = criarIconeDestaque(rotulo, valor);

      const classeTexto =
        valor.length > 32
          ? "destaque-valor muito-longo"
          : valor.length > 20
            ? "destaque-valor longo"
            : "destaque-valor";

      return `
        <div class="destaque" title="${escaparHTML(valor)}">
          <span class="destaque-icone" aria-hidden="true">
            ${icone}
          </span>

          <span class="destaque-texto">
            <strong class="${classeTexto}">
              ${escaparHTML(valor)}
            </strong>

            ${rotulo
              ? `<small>${escaparHTML(rotulo)}</small>`
              : ""}
          </span>
        </div>`;
    }).join("");
}

function criarIconeDestaque(rotulo = "", valor = "") {
  const texto = normalizarTexto(`${rotulo} ${valor}`);

  if (
    texto.includes("capacidade") ||
    texto.includes("litro") ||
    texto.includes(" kg")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M5 7h14v13H5z"></path>
        <path d="M8 7V4h8v3"></path>
      </svg>`;
  }

  if (
    texto.includes("voltagem") ||
    texto.includes("127") ||
    texto.includes("220") ||
    texto.includes("bivolt")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M13 2 6 13h6l-1 9 7-12h-6z"></path>
      </svg>`;
  }

  if (
    texto.includes("cor") ||
    texto.includes("inox") ||
    texto.includes("preto") ||
    texto.includes("branco")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"></path>
      </svg>`;
  }

  if (
    texto.includes("frost") ||
    texto.includes("refrigeração") ||
    texto.includes("refrigeracao")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5l-15.6 11"></path>
        <path d="m9 4 3 3 3-3M9 20l3-3 3 3"></path>
      </svg>`;
  }

  if (
    texto.includes("smartthings") ||
    texto.includes("wi-fi") ||
    texto.includes("wifi") ||
    texto.includes("mobile")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M5 9a10 10 0 0 1 14 0"></path>
        <path d="M8 12a6 6 0 0 1 8 0"></path>
        <path d="M10.8 15a2 2 0 0 1 2.4 0"></path>
        <circle cx="12" cy="18" r="1"></circle>
      </svg>`;
  }
  if (
    texto.includes("crystal") ||
    texto.includes("uhd") ||
    texto.includes("qled") ||
    texto.includes("neo qled") ||
    texto.includes("oled")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="12" rx="2"></rect>
        <path d="M8 21h8M12 17v4"></path>
      </svg>`;
  }

  if (
    texto.includes("120hz") ||
    texto.includes("144hz") ||
    texto.includes("frequência") ||
    texto.includes("frequencia")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M20 7v5h-5"></path>
        <path d="M4 17v-5h5"></path>
        <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9"></path>
        <path d="M5.5 15A7 7 0 0 0 18 17.5l2-2.5"></path>
      </svg>`;
  }

  if (
    texto.includes("gaming") ||
    texto.includes("game") ||
    texto.includes("motion xcelerator")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M8 8h8a5 5 0 0 1 4.7 6.7l-1 3a2 2 0 0 1-3.3.8L14 16h-4l-2.4 2.5a2 2 0 0 1-3.3-.8l-1-3A5 5 0 0 1 8 8z"></path>
        <path d="M7 12v4M5 14h4"></path>
        <circle cx="16" cy="13" r=".7"></circle>
        <circle cx="18" cy="15" r=".7"></circle>
      </svg>`;
  }

  if (
    texto.includes("upscaling") ||
    texto.includes("4k") ||
    texto.includes("8k")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path>
        <path d="M3 8l5-5M21 8l-5-5M3 16l5 5M21 16l-5 5"></path>
      </svg>`;
  }

  if (
    texto.includes("tizen") ||
    texto.includes("sistema operacional")
  ) {
    return `
      <svg viewBox="0 0 24 24">
        <rect x="4" y="4" width="6" height="6" rx="1"></rect>
        <rect x="14" y="4" width="6" height="6" rx="1"></rect>
        <rect x="4" y="14" width="6" height="6" rx="1"></rect>
        <rect x="14" y="14" width="6" height="6" rx="1"></rect>
      </svg>`;
  }
    return `
    <svg viewBox="0 0 24 24">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"></path>
      <path d="M18.5 16l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z"></path>
    </svg>`;
}

function criarEspecificacoes(especificacoes = {}) {
  const dados = especificacoes && typeof especificacoes === "object" && !Array.isArray(especificacoes)
    ? especificacoes
    : {};
  const itens = Object.entries(dados).filter(([, valor]) => valor !== "" && valor != null);
  if (!itens.length) return estadoMensagem("Especifica\u00E7\u00F5es ainda n\u00E3o cadastradas.");
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
        <span>${escaparHTML(valor || "\u2014")}</span>
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
    produto.especificacoes?.["Peso l\u00EDquido"] ||
    produto.especificacoes?.["Peso"] ||
    "";

  if (!largura && !altura && !profundidade) {
    return `
      <p class="texto-tecnico">
        Dimens\u00F5es em revis\u00E3o.
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

      <!-- P\u00E9s -->
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
          aria-label="Representa\u00E7\u00E3o dimensional de ${escaparHTML(produto.nome)}"
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
          Dimens\u00F5es do produto
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
  const lista = Array.isArray(documentos) ? documentos : [];
  const validos = lista.filter(documento =>
    documento && documento.nome && documento.url
  );

  if (!validos.length) {
    return `<p class="texto-tecnico">Nenhum documento oficial dispon\u00EDvel no momento.</p>`;
  }

  return validos.map(documento => `
    <a href="${escaparHTML(documento.url)}"
       target="_blank"
       rel="noopener noreferrer"
       class="documento-link">
      <span class="documento-informacoes">
        <strong>${escaparHTML(documento.nome)}</strong>
        <small>${escaparHTML(documento.descricao || "Documento oficial do fabricante")}</small>
      </span>
      <span class="documento-acao">Abrir PDF \u2197</span>
    </a>`).join("");
}


function criarAviso() {
  return `<div class="aviso"><span class="aviso-icone">\u24D8</span><div><strong>Observa\u00E7\u00F5es importantes</strong><p>Valide as medidas e as condi\u00E7\u00F5es de instala\u00E7\u00E3o antes de fechar o projeto. Imagens meramente ilustrativas.</p></div></div>`;
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
      if (!imagem.src.endsWith(IMAGEM_FALLBACK)) {
        imagem.src = IMAGEM_FALLBACK;
        imagem.alt = "Imagem do produto indisponível";
      }
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
