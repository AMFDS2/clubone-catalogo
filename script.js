let todosProdutos = [];
let produtosFiltrados = [];
let produtoSelecionado = null;
let categoriaSelecionada = "Todos";

/* =====================================
   INICIALIZAÇÃO
===================================== */

document.addEventListener("DOMContentLoaded", inicializar);

async function inicializar() {
  configurarEventosFixos();

  try {
    const resposta = await fetch("produtos.json");

    if (!resposta.ok) {
      throw new Error(
        `Não foi possível carregar produtos.json. Status: ${resposta.status}`
      );
    }

    todosProdutos = await resposta.json();
    produtosFiltrados = [...todosProdutos];

    renderizarProdutos(produtosFiltrados);

    if (todosProdutos.length > 0) {
      mostrarDetalhes(todosProdutos[0].id);
    }
  } catch (erro) {
    console.error(erro);

    document.getElementById("produtos").innerHTML = `
      <div class="sem-resultados">
        Não foi possível carregar os produtos.
        <br><br>
        Abra o projeto usando o Live Server.
      </div>
    `;
  }
}


/* =====================================
   EVENTOS FIXOS
===================================== */

function configurarEventosFixos() {
  const campoBusca = document.getElementById("busca");
  const categorias = document.getElementById("categorias");
  const ordenacao = document.getElementById("ordenacao");
  const menuMobile = document.getElementById("menuMobile");
  const menuPrincipal = document.querySelector(".menu-principal");

  campoBusca.addEventListener("input", aplicarFiltros);

  ordenacao.addEventListener("change", aplicarFiltros);

  categorias.addEventListener("click", evento => {
    const botao = evento.target.closest(".categoria");

    if (!botao) {
      return;
    }

    categoriaSelecionada = botao.dataset.categoria;

    document
      .querySelectorAll(".categoria")
      .forEach(item => item.classList.remove("ativo"));

    botao.classList.add("ativo");

    aplicarFiltros();
  });

  menuMobile.addEventListener("click", () => {
    menuPrincipal.classList.toggle("aberto");
  });
}


/* =====================================
   FILTRAGEM
===================================== */

function aplicarFiltros() {
  const busca = document
    .getElementById("busca")
    .value
    .trim()
    .toLowerCase();

  produtosFiltrados = todosProdutos.filter(produto => {
    const correspondeCategoria =
      categoriaSelecionada === "Todos" ||
      normalizarTexto(produto.categoria) ===
        normalizarTexto(categoriaSelecionada);

    const conteudoPesquisavel = [
      produto.marca,
      produto.modelo,
      produto.nome,
      produto.descricao,
      produto.codigoInfo,
      produto.categoria,
      produto.segmento
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const correspondeBusca =
      !busca || conteudoPesquisavel.includes(busca);

    return correspondeCategoria && correspondeBusca;
  });

  ordenarProdutos();
  renderizarProdutos(produtosFiltrados);

  const produtoAindaVisivel = produtosFiltrados.some(
    produto => produto.id === produtoSelecionado
  );

  if (!produtoAindaVisivel && produtosFiltrados.length > 0) {
    mostrarDetalhes(produtosFiltrados[0].id);
  }

  if (produtosFiltrados.length === 0) {
    produtoSelecionado = null;

    document.getElementById("detalhes").innerHTML = `
      <div class="estado-vazio">
        <h1>Nenhum produto encontrado</h1>
        <p>Tente buscar outro modelo ou selecionar outra categoria.</p>
      </div>
    `;
  }
}

function ordenarProdutos() {
  const ordenacao = document.getElementById("ordenacao").value;

  if (ordenacao === "modelo") {
    produtosFiltrados.sort((a, b) =>
      a.modelo.localeCompare(b.modelo, "pt-BR")
    );
  }

  if (ordenacao === "categoria") {
    produtosFiltrados.sort((a, b) =>
      a.categoria.localeCompare(b.categoria, "pt-BR")
    );
  }

  if (ordenacao === "recentes") {
    produtosFiltrados.sort(
      (a, b) => (b.ordem || 0) - (a.ordem || 0)
    );
  }
}


/* =====================================
   LISTA DE PRODUTOS
===================================== */

function renderizarProdutos(produtos) {
  const container = document.getElementById("produtos");
  const quantidade = document.getElementById("quantidadeProdutos");

  quantidade.textContent =
    `${produtos.length} ${produtos.length === 1 ? "produto encontrado" : "produtos encontrados"}`;

  if (produtos.length === 0) {
    container.innerHTML = `
      <div class="sem-resultados">
        Nenhum produto encontrado.
      </div>
    `;

    return;
  }

  container.innerHTML = produtos
    .map(produto => {
      const estaAtivo = produto.id === produtoSelecionado;

      return `
        <button
          type="button"
          class="produto ${estaAtivo ? "ativo" : ""}"
          data-produto-id="${escaparHTML(produto.id)}"
        >
          <span class="produto-imagem">
            <img
              src="${escaparHTML(produto.imagem)}"
              alt="${escaparHTML(produto.nome)}"
              loading="lazy"
              onerror="this.src='assets/produto-sem-imagem.png'"
            >
          </span>

          <span class="produto-informacoes">
            <h3>
              ${escaparHTML(produto.marca)}
              ${escaparHTML(produto.modelo)}
            </h3>

            <p>${escaparHTML(produto.nome)}</p>
            <p>${escaparHTML(produto.categoria)}</p>
          </span>

          <span class="produto-favorito" aria-hidden="true">
            ${estaAtivo ? "★" : "☆"}
          </span>
        </button>
      `;
    })
    .join("");

  container
    .querySelectorAll(".produto")
    .forEach(botao => {
      botao.addEventListener("click", () => {
        mostrarDetalhes(botao.dataset.produtoId);
      });
    });
}


/* =====================================
   DETALHES DO PRODUTO
===================================== */

function mostrarDetalhes(idProduto) {
  const produto = todosProdutos.find(
    item => item.id === idProduto
  );

  if (!produto) {
    return;
  }

  produtoSelecionado = produto.id;

  renderizarProdutos(produtosFiltrados);

  const destaques = criarDestaques(produto.destaques);
  const especificacoes = criarEspecificacoes(
    produto.especificacoes
  );
  const dimensoes = criarDimensoes(produto.dimensoes);
  const documentos = criarDocumentos(produto.documentos);

  document.getElementById("detalhes").innerHTML = `
    <div class="produto-hero">

      <div class="produto-resumo">

        <span class="badge">
          ${escaparHTML(produto.categoria)}
        </span>

        <h1>
          ${escaparHTML(produto.marca)}
          ${escaparHTML(produto.modelo)}
        </h1>

        <p class="subtitulo">
          ${escaparHTML(produto.nome)}
        </p>

        <p class="codigo-produto">
          Código Info Store:
          <strong>
            ${escaparHTML(produto.codigoInfo || "Consultar")}
          </strong>
        </p>

        <div class="destaques">
          ${destaques}
        </div>

        <div class="acoes">

          <a
            href="${escaparHTML(produto.siteFabricante)}"
            target="_blank"
            rel="noopener noreferrer"
            class="botao-preto"
          >
            Site do fabricante ↗
          </a>

          <a
            href="${escaparHTML(produto.siteInfoStore)}"
            target="_blank"
            rel="noopener noreferrer"
            class="botao-borda"
          >
            Consultar disponibilidade
          </a>

        </div>

      </div>

      <div class="produto-imagem-principal">
        <img
          src="${escaparHTML(produto.imagem)}"
          alt="${escaparHTML(produto.nome)}"
          onerror="this.src='assets/produto-sem-imagem.png'"
        >
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
          data-tab="instalacao"
        >
          Instalação
        </button>

        <button
          type="button"
          class="tab"
          data-tab="documentos"
        >
          Documentos
        </button>

        <button
          type="button"
          class="tab"
          data-tab="marca"
        >
          Sobre a marca
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
              <h3>Dimensões (mm)</h3>
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
        id="painel-instalacao"
      >
        <div class="card-instalacao">
          <h3>Orientações para instalação</h3>

          <p class="texto-tecnico">
            ${escaparHTML(
              produto.instalacao ||
              "Consulte o manual técnico do fabricante antes da instalação. Verifique medidas, ventilação, pontos elétricos e requisitos estruturais."
            )}
          </p>
        </div>
      </section>

      <section
        class="painel-tab"
        id="painel-documentos"
      >
        <div class="card-documentos">
          <h3>Documentos técnicos</h3>
          <div class="lista-documentos">
            ${documentos}
          </div>
        </div>
      </section>

      <section
        class="painel-tab"
        id="painel-marca"
      >
        <div class="card-marca">
          <h3>Sobre ${escaparHTML(produto.marca)}</h3>

          <p class="texto-tecnico">
            ${escaparHTML(
              produto.sobreMarca ||
              "Conheça as soluções da marca para projetos residenciais e comerciais. Consulte disponibilidade, especificações e condições com a equipe Info Store."
            )}
          </p>
        </div>
      </section>

    </div>
  `;

  configurarAbas();
}


/* =====================================
   CRIAÇÃO DOS COMPONENTES
===================================== */

function criarDestaques(destaques = []) {
  if (!destaques.length) {
    return "";
  }

  return destaques
    .map(destaque => `
      <div class="destaque">

        <span class="destaque-icone">
          ${escaparHTML(destaque.icone || "◇")}
        </span>

        <span class="destaque-texto">
          ${escaparHTML(destaque.titulo)}
        </span>

      </div>
    `)
    .join("");
}

function criarEspecificacoes(especificacoes = {}) {
  const itens = Object.entries(especificacoes);

  if (!itens.length) {
    return `
      <div class="sem-resultados">
        Especificações ainda não cadastradas.
      </div>
    `;
  }

  return itens
    .map(([titulo, valor]) => `
      <div class="linha-especificacao">
        <span>${escaparHTML(titulo)}</span>
        <span>${escaparHTML(valor)}</span>
      </div>
    `)
    .join("");
}

function criarDimensoes(dimensoes = {}) {
  const grupos = Object.entries(dimensoes);

  if (!grupos.length) {
    return `
      <p class="texto-tecnico">
        Dimensões ainda não cadastradas.
      </p>
    `;
  }

  return `
    <div class="dimensoes-grade">
      ${grupos
        .map(([grupo, medidas]) => `
          <div class="dimensao-coluna">

            <h4>${formatarTitulo(grupo)}</h4>

            ${Object.entries(medidas)
              .map(([nome, valor]) => `
                <div class="dimensao-item">
                  <span>${formatarTitulo(nome)}</span>
                  <strong>${escaparHTML(valor)}</strong>
                </div>
              `)
              .join("")}

          </div>
        `)
        .join("")}
    </div>
  `;
}

function criarDocumentos(documentos = []) {
  if (!documentos.length) {
    return `
      <p class="texto-tecnico">
        Nenhum documento disponível no momento.
      </p>
    `;
  }

  return documentos
    .map(documento => `
      <a
        href="${escaparHTML(documento.url)}"
        target="_blank"
        rel="noopener noreferrer"
        class="documento-link"
      >
        <span>${escaparHTML(documento.nome)}</span>
        <span>Baixar ↓</span>
      </a>
    `)
    .join("");
}

function criarAviso() {
  return `
    <div class="aviso">

      <span class="aviso-icone">ⓘ</span>

      <div>
        <strong>Observações importantes</strong>

        <p>
          Consulte o manual técnico do fabricante para informações
          completas de instalação, compatibilidade e recomendações.
          Imagens meramente ilustrativas.
        </p>
      </div>

    </div>
  `;
}


/* =====================================
   ABAS
===================================== */

function configurarAbas() {
  const botoes = document.querySelectorAll(".tab");
  const paineis = document.querySelectorAll(".painel-tab");

  botoes.forEach(botao => {
    botao.addEventListener("click", () => {
      const tabSelecionada = botao.dataset.tab;

      botoes.forEach(item =>
        item.classList.remove("ativo")
      );

      paineis.forEach(painel =>
        painel.classList.remove("ativo")
      );

      botao.classList.add("ativo");

      const painelSelecionado = document.getElementById(
        `painel-${tabSelecionada}`
      );

      if (painelSelecionado) {
        painelSelecionado.classList.add("ativo");
      }
    });
  });
}


/* =====================================
   FUNÇÕES AUXILIARES
===================================== */

function formatarTitulo(texto) {
  return String(texto)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, letra => letra.toUpperCase());
}

function normalizarTexto(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escaparHTML(valor = "") {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}