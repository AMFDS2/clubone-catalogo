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

<p>
  ${escaparHTML(produto.marca)}
  • ${escaparHTML(produto.modelo)}
</p>

<p>${escaparHTML(produto.categoria)}</p>
        </span>
        <span class="produto-favorito" aria-hidden="true">${ativo ? "★" : "☆"}</span>
      </button>`;
  }).join("");

  container.querySelectorAll(".produto").forEach(botao => {
    botao.addEventListener("click", () => mostrarDetalhes(botao.dataset.produtoId));
  });

  configurarFallbackImagens(container);
}

function mostrarDetalhes(idProduto) {
  const produto = todosProdutos.find(item => item.id === idProduto);
  if (!produto) return;

  produtoSelecionado = produto.id;
  renderizarProdutos(produtosFiltrados);

  const destaques = criarDestaques(produto.destaques);
  const especificacoes = criarEspecificacoes(produto.especificacoes);
  const dimensoes = criarDimensoes(produto.dimensoes);
  const documentos = criarDocumentos(produto.documentos);
  const botaoInfoStore = criarBotaoInfoStore(criarLinkSeguroInfoStore(produto));

  document.getElementById("detalhes").innerHTML = `
    <div class="produto-hero">
      <div class="produto-resumo">
        <span class="badge">${escaparHTML(produto.categoria)}</span>
        <h1 class="nome-produto">
  ${escaparHTML(produto.nome)}
</h1>

<p class="subtitulo produto-identificacao">
  ${escaparHTML(produto.marca)}
  <span aria-hidden="true">•</span>
  Modelo ${escaparHTML(produto.modelo)}
</p>
        <p class="codigo-produto">Código Info Store: <strong>${escaparHTML(produto.codigoInfo || "Consultar")}</strong></p>
        ${destaques ? `<div class="destaques">${destaques}</div>` : ""}
        ${botaoInfoStore ? `<div class="acoes">${botaoInfoStore}</div>` : ""}
      </div>

      <div class="produto-imagem-principal">
        <img src="${escaparHTML(produto.imagem || IMAGEM_FALLBACK)}" alt="${escaparHTML(produto.nome)}">
      </div>
    </div>

    <div class="area-tecnica">
      <nav class="tabs" aria-label="Informações do produto">
        <button type="button" class="tab ativo" data-tab="especificacoes">Especificações</button>
        <button type="button" class="tab" data-tab="dimensoes">Dimensões</button>
        <button type="button" class="tab" data-tab="instalacao">Instalação</button>
        <button type="button" class="tab" data-tab="documentos">Documentos</button>
        <button type="button" class="tab" data-tab="marca">Sobre a marca</button>
      </nav>

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
  configurarFallbackImagens(document.getElementById("detalhes"));
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

function criarDimensoes(dimensoes = {}) {
  const grupos = Object.entries(dimensoes).filter(([, medidas]) => medidas && Object.keys(medidas).length);
  if (!grupos.length) return `<p class="texto-tecnico">Dimensões em revisão.</p>`;

  return `<div class="dimensoes-grade">${grupos.map(([grupo, medidas]) => `
    <div class="dimensao-coluna"><h4>${escaparHTML(formatarTitulo(grupo))}</h4>${Object.entries(medidas).map(([nome, valor]) => `
      <div class="dimensao-item"><span>${escaparHTML(formatarTitulo(nome))}</span><strong>${escaparHTML(valor)}</strong></div>`).join("")}</div>`).join("")}</div>`;
}

function criarDocumentos(documentos = []) {
  const validos = documentos.filter(documento => documento && documento.nome && documento.url);
  if (!validos.length) return `<p class="texto-tecnico">Nenhum documento disponível no momento.</p>`;
  return validos.map(documento => `
    <a href="${escaparHTML(documento.url)}" target="_blank" rel="noopener noreferrer" class="documento-link"><span>${escaparHTML(documento.nome)}</span><span>Baixar ↓</span></a>`).join("");
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
function criarLinkSeguroInfoStore(produto = {}) {
  const modelo = String(
    produto.modelo || ""
  ).trim();

  const codigo = String(
    produto.codigoInfo || ""
  ).trim();

  const termo = modelo || codigo;

  if (!termo) {
    return "https://www.infostore.com.br/";
  }

  const termoCaminho = termo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (
    `https://www.infostore.com.br/${termoCaminho}` +
    `?_q=${encodeURIComponent(termo)}` +
    "&map=ft"
  );
}
