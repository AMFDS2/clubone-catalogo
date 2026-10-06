const ARQUIVO_CATALOGO = "produtos.preview.json";
const IMAGEM_FALLBACK = "assets/produto-sem-imagem.svg";
const STORAGE_KEY = "clubone_favoritos_v1";
const STORAGE_FILTROS = "clubone_filtros_recolhidos_v1";
const STORAGE_CAMPANHA = "clubone_campanha_recolhida_v1";

let todosProdutos = [];
let produtosFiltrados = [];
let produtoSelecionado = null;
const filtrosSelecionados = {
  fabricantes: new Set(),
  segmentos: new Set()
};

const filtroMedidas = {
  tipoProduto: "",
  largura: null,
  altura: null,
  profundidade: null,
  considerarFolgas: true
};

document.addEventListener("DOMContentLoaded", inicializar);

async function inicializar() {
  configurarEventosFixos();
  configurarFiltroMedidasProjeto();
  configurarCampanha();
  configurarEventosFavoritos();
  atualizarInterfaceFavoritos();

  try {
    const resposta = await fetch(ARQUIVO_CATALOGO, { cache: "no-store" });
    if (!resposta.ok) throw new Error(`Falha ao carregar ${ARQUIVO_CATALOGO}: ${resposta.status}`);

    const dados = await resposta.json();
    todosProdutos = Array.isArray(dados) ? dados.filter(produtoValido) : [];
    produtosFiltrados = [...todosProdutos];
    atualizarOpcoesTipoProduto();
    sincronizarFavoritosComCatalogo();
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
  const painelFiltros = document.getElementById("painelFiltros");
  const limparFiltros = document.getElementById("limparFiltros");

  const botaoFiltros = document.getElementById("alternarFiltrosLateral");

  const atualizarBotaoFiltros = () => {
    if (!botaoFiltros || !painelFiltros) return;
    const aberto = !painelFiltros.classList.contains("fechado");
    painelFiltros.hidden = !aberto;
    botaoFiltros.setAttribute("aria-expanded", String(aberto));
    botaoFiltros.setAttribute("aria-label", aberto ? "Recolher filtros" : "Mostrar filtros");
    const rotulo = botaoFiltros.querySelector(".alternar-filtros-rotulo");
    const icone = botaoFiltros.querySelector(".alternar-filtros-icone");
    if (rotulo) rotulo.textContent = "Filtros";
    if (icone) icone.textContent = aberto ? "⌃" : "⌄";
  };

  // Começa recolhido; respeita a escolha feita anteriormente pelo usuário.
  painelFiltros?.classList.toggle("fechado", localStorage.getItem(STORAGE_FILTROS) !== "0");

  atualizarBotaoFiltros();

  campoBusca?.addEventListener("input", aplicarFiltros);
  ordenacao?.addEventListener("change", aplicarFiltros);

  document.getElementById("filtrosFabricantes")?.addEventListener("change", atualizarSelecaoFiltro);
  document.getElementById("navegacaoSegmentos")?.addEventListener("click", evento => {
    const botao = evento.target.closest("button[data-segmento]");
    if (!botao) return;
    filtrosSelecionados.segmentos.clear();
    if (botao.dataset.segmento) filtrosSelecionados.segmentos.add(botao.dataset.segmento);
    renderizarFiltros();
    aplicarFiltros();
  });
  painelFiltros?.addEventListener("keydown", evento => {
    if (evento.key === "Escape") {
      painelFiltros.classList.add("fechado");
      localStorage.setItem(STORAGE_FILTROS, "1");
      atualizarBotaoFiltros();
      botaoFiltros?.focus();
    }
  });

  botaoFiltros?.addEventListener("click", () => {
    painelFiltros?.classList.toggle("fechado");
    localStorage.setItem(STORAGE_FILTROS, painelFiltros?.classList.contains("fechado") ? "1" : "0");
    atualizarBotaoFiltros();
  });

  limparFiltros?.addEventListener("click", () => {
    filtrosSelecionados.fabricantes.clear();
    filtrosSelecionados.segmentos.clear();
    limparFiltroMedidasProjeto();
    renderizarFiltros();
    aplicarFiltros();
  });
}

function configurarCampanha() {
  const fechar = document.getElementById("btnFecharCampanha");
  const abrir = document.getElementById("btnAbrirCampanha");
  const barra = document.getElementById("barraCampanha");
  if (!barra || !fechar || !abrir) return;

  const definirEstado = (recolhida) => {
    document.body.classList.toggle("campanha-fechada", recolhida);
    barra.setAttribute("aria-hidden", String(recolhida));
    abrir.setAttribute("aria-expanded", String(!recolhida));
    localStorage.setItem(STORAGE_CAMPANHA, recolhida ? "1" : "0");
  };

  definirEstado(localStorage.getItem(STORAGE_CAMPANHA) === "1");
  fechar.addEventListener("click", () => definirEstado(true));
  abrir.addEventListener("click", () => definirEstado(false));
}

function aplicarFiltros() {
  const busca = normalizarTexto(document.getElementById("busca").value.trim());

  produtosFiltrados = todosProdutos.filter(produto => {
    const fabricante = normalizarTexto(produto.marca || produto.fabricante);
    const segmento = normalizarTexto(produto.segmento || produto.categoria);
    const correspondeFabricante = !filtrosSelecionados.fabricantes.size || filtrosSelecionados.fabricantes.has(fabricante);
    const correspondeSegmento = !filtrosSelecionados.segmentos.size || filtrosSelecionados.segmentos.has(segmento);
    const correspondeTipoProduto = !filtroMedidas.tipoProduto || classificarTipoProduto(produto).chave === filtroMedidas.tipoProduto;
    const correspondeMedidas = produtoCompativelComFiltroMedidas(produto);

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

    return correspondeFabricante && correspondeSegmento && correspondeTipoProduto && correspondeMedidas && (!busca || conteudo.includes(busca));
  });

  ordenarProdutos();
  renderizarProdutos(produtosFiltrados);
  atualizarResumoFiltroMedidas();

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
  atualizarOpcoesTipoProduto();
  aplicarFiltros();
}

function produtosDoSegmento() {
  return todosProdutos.filter(produto => !filtrosSelecionados.segmentos.size || filtrosSelecionados.segmentos.has(normalizarTexto(produto.segmento || produto.categoria)));
}

function renderizarFiltros() {
  const produtos = produtosDoSegmento();
  const marcasDisponiveis = new Set(produtos.map(p => normalizarTexto(p.marca || p.fabricante)));
  for (const marca of filtrosSelecionados.fabricantes) {
    if (!marcasDisponiveis.has(marca)) filtrosSelecionados.fabricantes.delete(marca);
  }
  preencherGrupoFiltro("filtrosFabricantes", "fabricantes", produtos.map(item => item.marca || item.fabricante));
  atualizarOpcoesTipoProduto();
  if (document.getElementById("navegacaoSegmentos")?.children.length) atualizarEstadoSegmentos();
  else renderizarSegmentos();
}

function renderizarSegmentos() {
  const container = document.getElementById("navegacaoSegmentos");
  if (!container) return;
  const nomes = {"video": "TV e vídeo", "linha branca": "Linha branca", "climatizacao": "Climatização", "portateis": "Portáteis"};
  const segmentos = new Map();
  todosProdutos.forEach(produto => {
    const valor = produto.segmento || produto.categoria;
    if (valor) segmentos.set(normalizarTexto(valor), valor);
  });
  const botoes = [["", "Todos os produtos"], ...[...segmentos].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))];
  container.innerHTML = botoes.map(([chave, valor]) => `<button type="button" class="segmento-nav" data-segmento="${escaparHTML(chave)}" aria-pressed="false">${escaparHTML(nomes[chave] || valor)}</button>`).join("");
  atualizarEstadoSegmentos();
}

function atualizarEstadoSegmentos() {
  document.querySelectorAll("#navegacaoSegmentos button[data-segmento]").forEach(botao => {
    const ativo = botao.dataset.segmento ? filtrosSelecionados.segmentos.has(botao.dataset.segmento) : !filtrosSelecionados.segmentos.size;
    botao.classList.toggle("ativo", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
  });
}

function preencherGrupoFiltro(containerId, tipo, valores) {
  const contagens = new Map();
  valores.filter(Boolean).forEach(valor => {
    const chave = normalizarTexto(valor);
    const atual = contagens.get(chave) || { nome: valor, quantidade: 0 };
    atual.quantidade += 1;
    contagens.set(chave, atual);
  });

  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = [...contagens.entries()]
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
  container.classList.toggle("poucos-produtos", produtos.length <= 3);
  const quantidade = document.getElementById("quantidadeProdutos");
  const favs = getFavoritos();

  if (quantidade) {
    quantidade.textContent = `${produtos.length} ${produtos.length === 1 ? "produto encontrado" : "produtos encontrados"}`;
  }

  if (!produtos.length) {
    container.innerHTML = estadoMensagem("Nenhum produto encontrado.");
    return;
  }

  container.innerHTML = produtos.map(produto => {
    const ativo = produto.id === produtoSelecionado;
    const estaSalvo = favs.some(f => String(f.id) === String(produto.id));

    return `
      <button type="button" class="produto ${ativo ? "ativo" : ""}" data-produto-id="${escaparHTML(produto.id)}">
        <span class="produto-imagem">
          <img src="${escaparHTML(produto.imagem || IMAGEM_FALLBACK)}" alt="${escaparHTML(produto.nome)}" loading="lazy">
        </span>
        <span class="produto-informacoes">
          ${criarSeloCompatibilidadeCard(produto)}
          <h3>${escaparHTML(produto.nome)}</h3>
          <p>${escaparHTML(produto.marca || produto.fabricante || "")} • ${escaparHTML(produto.modelo)}</p>
          <p>${escaparHTML(produto.categoria || produto.segmento || "")}</p>
        </span>
        <span class="produto-favorito" data-favorito-id="${escaparHTML(produto.id)}" aria-hidden="true">${estaSalvo ? "★" : "☆"}</span>
      </button>`;
  }).join("");

  container.querySelectorAll(".produto").forEach(botao => {
    botao.addEventListener("click", (e) => {
      if (e.target.closest(".produto-favorito")) {
        e.stopPropagation();
        const pId = botao.dataset.produtoId;
        const prod = todosProdutos.find(item => String(item.id) === String(pId));
        if (prod) toggleFavorito(normalizarProdutoParaFavorito(prod));
        return;
      }
      mostrarDetalhes(botao.dataset.produtoId, true);
    });
  });

  configurarFallbackImagens(container);
}


function configurarFiltroMedidasProjeto() {
  const painelFiltros = document.getElementById("painelFiltros");
  if (!painelFiltros || document.getElementById("filtroMedidasProjeto")) return;

  const bloco = document.createElement("section");
  bloco.id = "filtroMedidasProjeto";
  bloco.className = "filtro-medidas-projeto";
  bloco.innerHTML = `
    <div class="filtro-medidas-cabecalho">
      <div>
        <span class="filtro-medidas-kicker">Compatibilidade</span>
        <h3>Medidas do vão</h3>
      </div>
      <span class="filtro-medidas-tag">mm</span>
    </div>
    <p class="filtro-medidas-intro">Informe as medidas internas máximas disponíveis no projeto.</p>
    <label class="filtro-tipo-produto">
      <span>Tipo de produto</span>
      <select id="filtroTipoProduto">
        <option value="">Todos os tipos</option>
      </select>
    </label>
    <div class="filtro-medidas-campos">
      <label>
        <span>Largura</span>
        <input id="filtroLargura" inputmode="decimal" type="number" min="1" step="1" placeholder="Ex.: 920">
        <small>mm</small>
      </label>
      <label>
        <span>Altura</span>
        <input id="filtroAltura" inputmode="decimal" type="number" min="1" step="1" placeholder="Ex.: 1900">
        <small>mm</small>
      </label>
      <label>
        <span>Profundidade</span>
        <input id="filtroProfundidade" inputmode="decimal" type="number" min="1" step="1" placeholder="Ex.: 800">
        <small>mm</small>
      </label>
    </div>
    <label class="filtro-medidas-check">
      <input id="filtroConsiderarFolgas" type="checkbox" checked>
      <span>
        <strong>Considerar folgas técnicas</strong>
        <small>Soma apenas as folgas superior e traseira confirmadas no manual.</small>
      </span>
    </label>
    <div id="resumoFiltroMedidas" class="filtro-medidas-resumo" aria-live="polite">
      Digite uma ou mais medidas para filtrar.
    </div>
    <button id="aplicarMedidasProjeto" class="aplicar-medidas-projeto" type="button">Ver produtos compatíveis</button>
    <button id="limparMedidasProjeto" class="limpar-medidas-projeto" type="button">Limpar medidas</button>
    <p class="filtro-medidas-nota">A largura considera o corpo do produto. Espaço para abertura das portas continua indicado na ficha técnica para conferência do arquiteto.</p>`;

  const limpar = painelFiltros.querySelector("#limparFiltros");
  if (limpar) painelFiltros.insertBefore(bloco, limpar);
  else painelFiltros.appendChild(bloco);

  ["filtroLargura", "filtroAltura", "filtroProfundidade"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", () => {
      lerFiltroMedidasProjeto();
      aplicarFiltros();
      atualizarResumoFiltroMedidas();
    });
  });

  document.getElementById("filtroTipoProduto")?.addEventListener("change", () => {
    lerFiltroMedidasProjeto();
    aplicarFiltros();
  });

  document.getElementById("filtroConsiderarFolgas")?.addEventListener("change", () => {
    lerFiltroMedidasProjeto();
    aplicarFiltros();
    atualizarResumoFiltroMedidas();
  });

  document.getElementById("limparMedidasProjeto")?.addEventListener("click", () => {
    limparFiltroMedidasProjeto();
    aplicarFiltros();
  });

  document.getElementById("aplicarMedidasProjeto")?.addEventListener("click", () => {
    lerFiltroMedidasProjeto();
    aplicarFiltros();
    if (!painelFiltros.classList.contains("fechado")) {
      document.getElementById("alternarFiltrosLateral")?.click();
    }
    document.getElementById("produtos")?.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function lerFiltroMedidasProjeto() {
  filtroMedidas.tipoProduto = document.getElementById("filtroTipoProduto")?.value || "";
  filtroMedidas.largura = numeroPositivo(document.getElementById("filtroLargura")?.value);
  filtroMedidas.altura = numeroPositivo(document.getElementById("filtroAltura")?.value);
  filtroMedidas.profundidade = numeroPositivo(document.getElementById("filtroProfundidade")?.value);
  filtroMedidas.considerarFolgas = document.getElementById("filtroConsiderarFolgas")?.checked !== false;
}

function limparFiltroMedidasProjeto() {
  filtroMedidas.tipoProduto = "";
  filtroMedidas.largura = null;
  filtroMedidas.altura = null;
  filtroMedidas.profundidade = null;
  filtroMedidas.considerarFolgas = true;

  const largura = document.getElementById("filtroLargura");
  const altura = document.getElementById("filtroAltura");
  const profundidade = document.getElementById("filtroProfundidade");
  const folgas = document.getElementById("filtroConsiderarFolgas");
  const tipoProduto = document.getElementById("filtroTipoProduto");
  if (tipoProduto) tipoProduto.value = "";
  if (largura) largura.value = "";
  if (altura) altura.value = "";
  if (profundidade) profundidade.value = "";
  if (folgas) folgas.checked = true;
  atualizarResumoFiltroMedidas();
}


function ehProdutoPortatil(produto = {}) {
  const segmento = normalizarTexto(produto.segmento || "");
  const categoria = normalizarTexto(produto.categoria || "");
  return segmento === "portateis" || categoria.includes("eletroportateis") || categoria === "portateis";
}

function criarDimensoesCompactasPortatil(produto = {}) {
  const dimensoes = obterDimensoesParaBlocagem(produto);
  const medidas = dimensoes.produto || dimensoes.semBase || dimensoes.semEmbalagem || dimensoes.comBase || dimensoes || {};
  const valor = (...chaves) => {
    for (const chave of chaves) {
      const achado = Object.entries(medidas).find(([nome]) => normalizarTexto(nome) === normalizarTexto(chave));
      if (achado && achado[1] !== undefined && achado[1] !== null && String(achado[1]).trim()) return achado[1];
    }
    return "";
  };
  const largura = valor("largura", "width");
  const altura = valor("altura", "height");
  const profundidade = valor("profundidade", "depth");
  const peso = medidas.peso || dimensoes.peso || produto.especificacoes?.["Peso líquido"] || produto.especificacoes?.Peso || "";

  const itens = [
    ["Largura", largura], ["Altura", altura], ["Profundidade", profundidade], ["Peso", peso]
  ].filter(([, v]) => v !== "" && v != null);

  if (!itens.length) return `<p class="texto-tecnico">Dimensões ainda não cadastradas.</p>`;

  return `<div class="dimensoes-portatil-compactas">
    ${itens.map(([rotulo, v]) => `<div class="medida-portatil"><span>${escaparHTML(rotulo)}</span><strong>${escaparHTML(v)}</strong></div>`).join("")}
  </div>`;
}

function criarPainelMarcaPortatil(produto = {}) {
  const marca = produto.marca || produto.fabricante || "Fabricante";
  return `<div class="painel-marca-portatil">
    <span class="aplicacao-kicker">Marca</span>
    <h3>${escaparHTML(marca)}</h3>
    <p>Produto apresentado com base nas informações técnicas e imagens cadastradas para este modelo.</p>
    <div class="marca-modelo-portatil"><span>Modelo</span><strong>${escaparHTML(produto.modelo || "Consultar")}</strong></div>
  </div>`;
}

function criarAvisoPortatil() {
  return `<div class="aviso aviso-portatil"><span class="aviso-icone">ⓘ</span><div><strong>Antes de usar</strong><p>Confira a voltagem, as dimensões e as orientações de uso do fabricante para o modelo escolhido.</p></div></div>`;
}

function classificarTipoProduto(produto = {}) {
  const texto = normalizarTexto([
    produto.tipoBloco,
    produto.nome,
    produto.nomePlanilha,
    produto.categoria,
    produto.segmento,
    produto.descricao
  ].filter(Boolean).join(" "));

  const tipos = [
    ["freezer", "Freezer", /freezer/],
    ["adega", "Adega / Cervejeira / Frigobar", /adega|cervejeira|frigobar/],
    ["geladeira", "Geladeira / Refrigerador", /geladeira|refrigerador|french door|side by side|multidoor|multi door/],
    ["forno", "Forno", /forno/],
    ["microondas", "Micro-ondas", /micro[- ]?ondas|microondas/],
    ["cooktop", "Cooktop / Fogão", /cooktop|fogao|fogão/],
    ["coifa", "Coifa / Depurador", /coifa|depurador/],
    ["lavanderia", "Lavadora / Lava e seca", /lava e seca|lavadora|maquina de lavar|máquina de lavar|secadora/],
    ["lava-loucas", "Lava-louças", /lava[- ]?loucas|lava[- ]?louças/],
    ["ar-condicionado", "Ar-condicionado", /ar[- ]?condicionado|split/],
    ["tv", "TV", /\btv\b|televisor|televisao|televisão/],
    ["audio", "Áudio", /soundbar|caixa de som|audio|áudio/]
  ];

  const encontrado = tipos.find(([, , padrao]) => padrao.test(texto));
  return encontrado
    ? { chave: encontrado[0], rotulo: encontrado[1] }
    : { chave: "outros", rotulo: "Outros produtos" };
}

function atualizarOpcoesTipoProduto() {
  const select = document.getElementById("filtroTipoProduto");
  if (!select) return;

  const contagens = new Map();
  produtosDoSegmento().filter(produto => !filtrosSelecionados.fabricantes.size || filtrosSelecionados.fabricantes.has(normalizarTexto(produto.marca || produto.fabricante))).forEach(produto => {
    if (ehProdutoPortatil(produto)) return;
    const tipo = classificarTipoProduto(produto);
    const atual = contagens.get(tipo.chave) || { rotulo: tipo.rotulo, quantidade: 0 };
    atual.quantidade += 1;
    contagens.set(tipo.chave, atual);
  });

  select.innerHTML = [
    '<option value="">Todos os tipos</option>',
    ...[...contagens.entries()]
      .sort((a, b) => a[1].rotulo.localeCompare(b[1].rotulo, "pt-BR"))
      .map(([chave, item]) => `<option value="${escaparHTML(chave)}">${escaparHTML(item.rotulo)} (${item.quantidade})</option>`)
  ].join("");

  if (filtroMedidas.tipoProduto && !contagens.has(filtroMedidas.tipoProduto)) filtroMedidas.tipoProduto = "";
  select.value = filtroMedidas.tipoProduto;
}

function filtroMedidasAtivo() {
  return Boolean(filtroMedidas.largura || filtroMedidas.altura || filtroMedidas.profundidade);
}

function numeroPositivo(valor) {
  const numero = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function numeroMedidaMm(campo) {
  const valor = campo && typeof campo === "object" && "valor" in campo ? campo.valor : campo;
  if (valor === null || valor === undefined || valor === "") return null;

  const texto = String(valor)
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .trim();

  const correspondencia = texto.match(/\d+(?:[.,]\d+)*/);
  if (!correspondencia) return null;

  let numeroTexto = correspondencia[0];
  const possuiPonto = numeroTexto.includes(".");
  const possuiVirgula = numeroTexto.includes(",");

  if (possuiPonto && possuiVirgula) {
    const ultimoPonto = numeroTexto.lastIndexOf(".");
    const ultimaVirgula = numeroTexto.lastIndexOf(",");
    const separadorDecimal = ultimoPonto > ultimaVirgula ? "." : ",";
    const separadorMilhar = separadorDecimal === "." ? "," : ".";
    numeroTexto = numeroTexto.split(separadorMilhar).join("");
    numeroTexto = numeroTexto.replace(separadorDecimal, ".");
  } else if (possuiPonto || possuiVirgula) {
    const separador = possuiVirgula ? "," : ".";
    const partes = numeroTexto.split(separador);
    const unidadeMmOuAusente = /(?:^|\s)mm\b/.test(texto) || !/(?:cm|metro|metros|\bm\b|pol|polegada|\bin\b|\")/.test(texto);
    const pareceMilhar = unidadeMmOuAusente && partes.length > 1 && partes.slice(1).every(parte => parte.length === 3);
    numeroTexto = pareceMilhar ? partes.join("") : numeroTexto.replace(separador, ".");
  }

  let numero = Number(numeroTexto);
  if (!Number.isFinite(numero) || numero <= 0) return null;

  if (/(?:polegada|polegadas|\bpol\b|\bin\b|")/.test(texto)) numero *= 25.4;
  else if (/(?:^|\s)cm\b/.test(texto)) numero *= 10;
  else if (/(?:^|\s)m\b|metro|metros/.test(texto) && !/(?:^|\s)mm\b/.test(texto)) numero *= 1000;

  return Math.round(numero * 10) / 10;
}

function normalizarChaveMedida(valor = "") {
  return normalizarTexto(valor).replace(/[^a-z0-9]/g, "");
}

function buscarMedidaEmGrupo(grupo, aliases = []) {
  if (!grupo || typeof grupo !== "object" || Array.isArray(grupo)) return null;
  const chavesAceitas = aliases.map(normalizarChaveMedida);

  for (const [chave, valor] of Object.entries(grupo)) {
    const chaveNormalizada = normalizarChaveMedida(chave);
    if (!chavesAceitas.includes(chaveNormalizada)) continue;
    const medida = numeroMedidaMm(valor);
    if (medida) return medida;
  }

  return null;
}

function obterGruposDimensionais(produto = {}, dados = {}) {
  const dimensoesCadastro = produto.dimensoes || {};
  return [
    dados.dimensoesProduto,
    dados.dimensoes,
    dados.geometriaInstalacao,
    dimensoesCadastro.produto,
    dimensoesCadastro.semBase,
    dimensoesCadastro.semEmbalagem,
    dimensoesCadastro.comBase,
    dimensoesCadastro,
    produto.especificacoes
  ].filter(grupo => grupo && typeof grupo === "object");
}

function buscarPrimeiraMedida(grupos, aliases) {
  for (const grupo of grupos) {
    const medida = buscarMedidaEmGrupo(grupo, aliases);
    if (medida) return medida;
  }
  return null;
}

function extrairDimensoesFiltro(produto = {}) {
  const dados = produto.medidasProjeto || {};
  const geometria = dados.geometriaInstalacao || {};
  const folgas = dados.folgas || {};
  const grupos = obterGruposDimensionais(produto, dados);

  const largura = buscarPrimeiraMedida(grupos, [
    "larguraProduto", "larguraDoProduto", "larguraSemEmbalagem", "largura", "width"
  ]);
  const altura = buscarPrimeiraMedida(grupos, [
    "alturaProduto", "alturaDoProduto", "alturaSemEmbalagem", "altura", "height"
  ]);
  const profundidade = buscarPrimeiraMedida(grupos, [
    "profundidadeTotalProduto", "profundidadeProduto", "profundidadeDoProduto", "profundidadeSemEmbalagem", "profundidade", "depth"
  ]);

  const folgaSuperior = filtroMedidas.considerarFolgas ? numeroMedidaMm(folgas.superior) : 0;
  const folgaTraseira = filtroMedidas.considerarFolgas
    ? (numeroMedidaMm(folgas.traseira) || numeroMedidaMm(geometria.afastamentoTraseiro))
    : 0;

  return {
    largura,
    altura,
    profundidade,
    larguraNecessaria: largura,
    alturaNecessaria: altura ? altura + (folgaSuperior || 0) : null,
    profundidadeNecessaria: profundidade ? profundidade + (folgaTraseira || 0) : null,
    folgaSuperior: folgaSuperior || 0,
    folgaTraseira: folgaTraseira || 0
  };
}

function produtoCompativelComFiltroMedidas(produto) {
  if (!filtroMedidasAtivo()) return true;
  if (ehProdutoPortatil(produto)) return false;
  const medidas = extrairDimensoesFiltro(produto);

  if (filtroMedidas.largura && (!medidas.larguraNecessaria || medidas.larguraNecessaria > filtroMedidas.largura)) return false;
  if (filtroMedidas.altura && (!medidas.alturaNecessaria || medidas.alturaNecessaria > filtroMedidas.altura)) return false;
  if (filtroMedidas.profundidade && (!medidas.profundidadeNecessaria || medidas.profundidadeNecessaria > filtroMedidas.profundidade)) return false;
  return true;
}

function criarSeloCompatibilidadeCard(produto) {
  if (!filtroMedidasAtivo()) return "";
  const medidas = extrairDimensoesFiltro(produto);
  const faltantes = [];
  if (filtroMedidas.largura && !medidas.larguraNecessaria) faltantes.push("largura");
  if (filtroMedidas.altura && !medidas.alturaNecessaria) faltantes.push("altura");
  if (filtroMedidas.profundidade && !medidas.profundidadeNecessaria) faltantes.push("profundidade");
  if (faltantes.length) return `<span class="selo-compatibilidade pendente">Medidas incompletas</span>`;
  return `<span class="selo-compatibilidade compativel">✓ Compatível com o vão</span>`;
}

function atualizarResumoFiltroMedidas() {
  const resumo = document.getElementById("resumoFiltroMedidas");
  if (!resumo) return;
  if (!filtroMedidasAtivo()) {
    resumo.className = "filtro-medidas-resumo";
    resumo.textContent = "Digite uma ou mais medidas para filtrar.";
    return;
  }

  const totalComMedidas = produtosFiltrados.length;
  const medidasInformadas = [
    filtroMedidas.largura ? `L ${filtroMedidas.largura} mm` : "",
    filtroMedidas.altura ? `A ${filtroMedidas.altura} mm` : "",
    filtroMedidas.profundidade ? `P ${filtroMedidas.profundidade} mm` : ""
  ].filter(Boolean).join(" × ");
  const tipoSelecionado = document.getElementById("filtroTipoProduto")?.selectedOptions?.[0]?.textContent || "";
  resumo.className = "filtro-medidas-resumo ativo";
  resumo.innerHTML = `<strong>${totalComMedidas}</strong> ${totalComMedidas === 1 ? "produto compatível" : "produtos compatíveis"}<span>${escaparHTML([tipoSelecionado, medidasInformadas].filter(Boolean).join(" • "))}</span>`;
}

function obterDimensoesConfirmadasProduto(produto = {}) {
  const dados = produto.medidasProjeto || {};
  const dimensoesProjeto = dados.dimensoesProduto || {};
  const dimensoesFisicas = dados.dimensoesFisicasProduto || {};
  const dimensoesLegadas =
    dados["dimensoes Fisicas"] ||
    dados.dimensoesFisicas ||
    {};

  const dimensoesCadastro =
    produto.dimensoes?.produto ||
    produto.dimensoes ||
    {};

  function campoConfirmado(...campos) {
    for (const campo of campos) {
      if (campo === null || campo === undefined || campo === "") continue;

      if (typeof campo !== "object") {
        return {
          valor: String(campo).trim(),
          pagina: "Fonte oficial",
          referencia: "Cadastro dimensional oficial do produto",
          status: "CONFIRMADO",
          fonte: "CADASTRO_OFICIAL"
        };
      }

      const status = String(campo.status || "").toUpperCase();
      let valor = campo.valor;
      if (valor === null || valor === undefined || String(valor).trim() === "") continue;
      if (status && status !== "CONFIRMADO" && status !== "MANUAL_VALIDADO") continue;

      valor = String(valor).trim();
      if (campo.unidade && !/[a-zA-Z]/.test(valor)) valor = `${valor} ${campo.unidade}`;
      return { ...campo, valor, status: "CONFIRMADO" };
    }
    return {};
  }

  return {
    largura: campoConfirmado(
      dimensoesProjeto.largura,
      dimensoesProjeto.larguraExternaProduto,
      dimensoesFisicas.largura,
      dimensoesFisicas.larguraProduto,
      dimensoesLegadas.largura,
      dimensoesLegadas.larguraProduto,
      dimensoesLegadas.larguraExternaProduto,
      dimensoesCadastro.largura
    ),
    altura: campoConfirmado(
      dimensoesProjeto.altura,
      dimensoesProjeto.alturaExternaProduto,
      dimensoesFisicas.altura,
      dimensoesFisicas.alturaProduto,
      dimensoesLegadas.altura,
      dimensoesLegadas.alturaProduto,
      dimensoesLegadas.alturaExternaProduto,
      dimensoesCadastro.altura
    ),
    profundidade: campoConfirmado(
      dimensoesProjeto.profundidade,
      dimensoesProjeto.profundidadeTotalProduto,
      dimensoesFisicas.profundidade,
      dimensoesFisicas.profundidadeProduto,
      dimensoesFisicas.profundidadeTotalProduto,
      dimensoesLegadas.profundidade,
      dimensoesLegadas.profundidadeProduto,
      dimensoesLegadas.profundidadeTotalProduto,
      dimensoesCadastro.profundidade
    )
  };
}

function produtoPossuiVistaTecnica(produto = {}) {
  const dimensoesConfirmadas = obterDimensoesConfirmadasProduto(produto);

  function possuiValor(campo) {
    if (campo === null || campo === undefined) return false;

    if (typeof campo !== "object") {
      return String(campo).trim() !== "";
    }

    const valor = campo.valor;

    if (
      valor === null ||
      valor === undefined ||
      String(valor).trim() === ""
    ) {
      return false;
    }

    const status = String(campo.status || "").toUpperCase();

    return (
      !status ||
      status === "CONFIRMADO" ||
      status === "MANUAL_VALIDADO"
    );
  }

  const largura = possuiValor(dimensoesConfirmadas.largura);
  const altura = possuiValor(dimensoesConfirmadas.altura);
  const profundidade = possuiValor(dimensoesConfirmadas.profundidade);

  return Boolean(
    (largura && altura) ||
    (altura && profundidade) ||
    (largura && profundidade)
  );
}

function criarMedidasProjeto(produto = {}, dimensoesHtml = "") {
  const dados = produto.medidasProjeto;

  if (!dados) {
    const possuiManual = Array.isArray(produto.documentos) && produto.documentos.some(documento => documento?.url);
    return `
      <div class="medidas-projeto-vazio">
        <strong>Medidas de instalação ainda não processadas</strong>
        <p>${possuiManual
          ? "Existe um manual oficial cadastrado. Execute a automação de IA para preencher esta área."
          : "Adicione um manual oficial em PDF para habilitar a extração automática."}</p>
      </div>
      <div class="card-dimensoes">${dimensoesHtml}</div>
      ${criarAviso()}`;
  }

  const statusConfig = {
    CONFIRMADO: { classe: "confirmado", icone: "✓", texto: "Confirmado na fonte oficial" },
    REVISAR: { classe: "revisar", icone: "●", texto: "Revisão recomendada" },
    NAO_LOCALIZADO: { classe: "nao-localizado", icone: "—", texto: "Não localizado" },
    NAO_APLICAVEL: { classe: "nao-aplicavel", icone: "○", texto: "Não se aplica" }
  };

  function linha(rotulo, campo = {}) {
    const config = statusConfig[campo.status] || statusConfig.NAO_LOCALIZADO;
    const valor = campo.status === "NAO_APLICAVEL" ? "Não se aplica" : (campo.valor || "Não informado");
    const pagina = campo.pagina
      ? `<small>${campo.fonte === "CADASTRO_OFICIAL" ? escaparHTML(campo.pagina) : `pág. ${escaparHTML(campo.pagina)}`}</small>`
      : "";
    const referencia = campo.referencia ? `<small>ref. ${escaparHTML(campo.referencia)}</small>` : "";
    const observacao = campo.observacao ? ` title="${escaparHTML(campo.observacao)}"` : "";
    return `
      <div class="medida-ia-linha"${observacao}>
        <span class="medida-ia-item">${escaparHTML(rotulo)} ${pagina} ${referencia}</span>
        <strong>${escaparHTML(valor)}</strong>
        <span class="medida-status ${config.classe}"><i>${config.icone}</i>${config.texto}</span>
      </div>`;
  }

  function grupo(titulo, campos = []) {
    return `
      <section class="medidas-ia-card">
        <h4>${escaparHTML(titulo)}</h4>
        ${campos.map(([rotulo, campo]) => linha(rotulo, campo)).join("")}
      </section>`;
  }

  const dimensoesProduto = obterDimensoesConfirmadasProduto(produto);
  const dimensoesNicho = dados.dimensoesNicho || {};
  const folgas = dados.folgas || {};
  const abertura = dados.abertura || {};
  const instalacao = dados.instalacao || {};
  const fonte = dados.fonte || {};
  const usaCadastroOficial = fonte.tipo === "MANUAL_E_CADASTRO_OFICIAL";
  const observacoes = Array.isArray(dados.observacoes) ? dados.observacoes.filter(Boolean) : [];
  const camposValidacao = [
    ...Object.values(dados.dimensoesProduto || {}), ...Object.values(dados.dimensoesNicho || {}),
    ...Object.values(dados.folgas || {}), ...Object.values(dados.abertura || {}),
    ...Object.values(dados.geometriaInstalacao || {}), ...Object.values(dados.instalacao || {}),
    ...Object.values(dados["dimensoes Fisicas"] || dados.dimensoesFisicas || {}),
    ...Object.values(dados.nichoInstalacao || {}),
    ...Object.values(dados.espacosFolgas || {}),
    ...Object.values(dados.folgasEVentilacao || {}),
    ...Object.values(dados.instalacaoEletrica || {})
  ].filter(campo => campo && typeof campo === "object" && campo.status);
  const contagemCalculada = camposValidacao.reduce((acc, campo) => {
    acc[campo.status] = (acc[campo.status] || 0) + 1;
    return acc;
  }, { CONFIRMADO: 0, REVISAR: 0, NAO_LOCALIZADO: 0, NAO_APLICAVEL: 0 });
  const aplicaveis = camposValidacao.length - contagemCalculada.NAO_APLICAVEL;
  const validacaoCalculada = {
    status: contagemCalculada.REVISAR ? "REVISAO_NECESSARIA" : (contagemCalculada.CONFIRMADO ? "APROVADO_PARA_DESENHO" : "DADOS_INSUFICIENTES"),
    percentualConfirmado: aplicaveis ? Math.round((contagemCalculada.CONFIRMADO / aplicaveis) * 100) : 0,
    contagem: contagemCalculada
  };
  const confirmadosOriginais = Number(dados.validacao?.contagem?.CONFIRMADO || 0);
  const validacao = contagemCalculada.CONFIRMADO > confirmadosOriginais
    ? validacaoCalculada
    : (dados.validacao || validacaoCalculada);
  const contagem = validacao.contagem || {};
  const validacaoTexto = validacao.status === "APROVADO_PARA_DESENHO"
    ? "Cotas confirmadas liberadas para o desenho"
    : validacao.status === "REVISAO_NECESSARIA"
      ? "Há cotas que exigem revisão técnica"
      : "Dados insuficientes para desenho completo";
  const vistasTecnicas = criarVistasTecnicasProjeto(produto, dados);

  return `
    <div class="medidas-projeto-cabecalho">
      <div>
        <span class="selo-ia">${usaCadastroOficial ? "Dados técnicos oficiais" : "Dados extraídos do manual"}</span>
        <h3>Medidas para projeto</h3>
      </div>
      <div class="fonte-medidas">
        <strong>${escaparHTML(fonte.nome || "Manual oficial")}</strong>
        <span>${dados.revisado ? "Revisado" : "Revisão técnica recomendada"}</span>
      </div>
    </div>

    <div class="resumo-validacao ${escaparHTML((validacao.status || "DADOS_INSUFICIENTES").toLowerCase())}">
      <div><strong>${escaparHTML(validacaoTexto)}</strong><span>${Number(validacao.percentualConfirmado || 0)}% dos campos aplicáveis confirmados</span></div>
      <div class="resumo-validacao-contagens">
        <span><b>${Number(contagem.CONFIRMADO || 0)}</b> confirmados</span>
        <span><b>${Number(contagem.REVISAR || 0)}</b> revisar</span>
        <span><b>${Number(contagem.NAO_LOCALIZADO || 0)}</b> não localizados</span>
      </div>
    </div>

    ${vistasTecnicas}

    <div class="medidas-projeto-destaque medidas-projeto-destaque-sem-blocagem">
      ${grupo("Dimensões do produto", [
        ["Largura", dimensoesProduto.largura],
        ["Altura", dimensoesProduto.altura],
        ["Profundidade", dimensoesProduto.profundidade]
      ])}
    </div>

    <div class="medidas-ia-grade">
      ${grupo("Dimensões recomendadas do nicho", [
        ["Largura", dimensoesNicho.largura],
        ["Altura", dimensoesNicho.altura],
        ["Profundidade", dimensoesNicho.profundidade]
      ])}
      ${grupo("Folgas e ventilação", [
        ["Respiro superior", folgas.superior],
        ["Respiro lateral", folgas.lateral],
        ["Respiro traseiro", folgas.traseira],
        ["Espaço frontal", folgas.frontal]
      ])}
      ${grupo("Abertura", [
        ["Ângulo da porta", abertura.anguloPorta],
        ["Portas abertas", abertura.distanciaPortasAbertas],
        ["Gavetas estendidas", abertura.distanciaGavetasEstendidas]
      ])}
      ${grupo("Pontos de instalação", [
        ["Ponto elétrico", instalacao.pontoEletrico],
        ["Ponto de água", instalacao.pontoAgua],
        ["Ponto de gás", instalacao.pontoGas],
        ["Dreno", instalacao.dreno]
      ])}
    </div>

    ${observacoes.length ? `
      <section class="observacoes-manual">
        <strong>Observações do manual</strong>
        <ul>${observacoes.map(item => `<li>${escaparHTML(item)}</li>`).join("")}</ul>
      </section>` : ""}

    <div class="legenda-medidas">
      <span><i class="confirmado">✓</i> Confirmado na fonte oficial</span>
      <span><i class="revisar">●</i> Revisão recomendada</span>
      <span><i class="nao-localizado">—</i> Não localizado</span>
      <span><i class="nao-aplicavel">○</i> Não se aplica</span>
    </div>
    <p class="aviso-ia">${usaCadastroOficial ? "Dimensões básicas provenientes da ficha oficial; dados de instalação complementados pelo manual quando disponíveis." : "Informações extraídas por IA a partir do manual oficial."} Confirme as cotas antes da execução do projeto.</p>`;
}

function criarVistasTecnicasGenericas(produto = {}, dados = {}) {
  const dimensoes = obterDimensoesConfirmadasProduto(produto);
  const nicho = dados.dimensoesNicho || {};
  const valor = campo => campo?.status === "CONFIRMADO" && campo?.valor ? campo.valor : "";
  const largura = valor(dimensoes.largura) || valor(dados.geometriaInstalacao?.larguraProduto);
  const altura = valor(dimensoes.altura) || valor(dados.geometriaInstalacao?.alturaProduto);
  const profundidade = valor(dimensoes.profundidade) || valor(dados.geometriaInstalacao?.profundidadeTotalProduto);
  const pagina = (...campos) => campos.find(campo => campo?.status === "CONFIRMADO" && campo?.pagina)?.pagina || "—";
  const referencia = (...campos) => campos.find(campo => campo?.status === "CONFIRMADO" && campo?.referencia)?.referencia || "";
  const imagem = obterImagensProduto(produto)[0] || IMAGEM_FALLBACK;
  const textoProduto = normalizarTexto(`${produto.tipoBloco || ""} ${produto.nome || ""}`);
  const embutir = /forno|micro|cooktop|lava loucas|lavadora|secadora|coifa/.test(textoProduto);
  const cotasNicho = [valor(nicho.largura), valor(nicho.altura), valor(nicho.profundidade)].filter(Boolean);

  const cabecalho = (titulo, subtitulo, campos) => {
    const pag = pagina(...campos);
    const ref = referencia(...campos);
    const origem = pag === "Fonte oficial" ? "Ficha oficial" : `Manual • pág. ${escaparHTML(pag)}`;
    return `<div class="vista-projeto-titulo"><div><strong>${titulo}</strong><span>${subtitulo}</span></div><small>${pag !== "—" ? `${origem}${ref ? ` • ref. ${escaparHTML(ref)}` : ""}` : "Cota não localizada"}</small></div>`;
  };

  const indisponivel = eixo => `<div class="vista-indisponivel"><span>—</span><strong>Vista ${eixo} aguardando cotas</strong><p>O desenho será liberado quando os dois eixos estiverem confirmados no manual.</p></div>`;
  const desenho = (eixoX, eixoY, rotuloX, rotuloY, nome) => eixoX && eixoY ? `
    <svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista ${nome} técnica">
      <defs><marker id="seta-${nome}" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7z"></path></marker></defs>
      ${embutir && cotasNicho.length >= 2 ? `<rect class="nicho-generico" x="128" y="52" width="264" height="270" rx="2"></rect><text class="nota-nicho" x="260" y="38">NICHO / MARCENARIA</text>` : ""}
      <rect class="produto-generico" x="164" y="78" width="192" height="218" rx="3"></rect>
      <line class="cota-tecnica" x1="164" y1="338" x2="356" y2="338" marker-start="url(#seta-${nome})" marker-end="url(#seta-${nome})"></line>
      <text class="cota-valor" x="260" y="367">${escaparHTML(eixoX)}</text><text class="cota-legenda" x="260" y="389">${rotuloX}</text>
      <line class="cota-tecnica" x1="126" y1="78" x2="126" y2="296" marker-start="url(#seta-${nome})" marker-end="url(#seta-${nome})"></line>
      <text class="cota-valor cota-altura" x="96" y="187">${escaparHTML(eixoY)}</text><text class="cota-legenda" x="78" y="320">${rotuloY}</text>
    </svg>` : indisponivel(nome);

  return `<div class="vistas-projeto-grade">
    <section class="vista-projeto-card ${largura && altura ? "" : "vista-pendente"}">${cabecalho("Vista frontal", "Largura × altura", [dimensoes.largura, dimensoes.altura])}${desenho(largura, altura, "largura", "altura", "frontal")}</section>
    <section class="vista-projeto-card ${profundidade && altura ? "" : "vista-pendente"}">${cabecalho("Vista lateral", "Profundidade × altura", [dimensoes.profundidade, dimensoes.altura])}${desenho(profundidade, altura, "profundidade", "altura", "lateral")}</section>
    <section class="vista-projeto-card ${largura && profundidade ? "" : "vista-pendente"}">${cabecalho("Vista superior", "Largura × profundidade", [dimensoes.largura, dimensoes.profundidade])}${desenho(largura, profundidade, "largura", "profundidade", "superior")}</section>
    <section class="vista-projeto-card vista-produto-real">${cabecalho("Imagem do produto", "Referência visual — sem valor de cota", [])}<img src="${escaparHTML(imagem)}" alt="${escaparHTML(produto.nome || produto.modelo)}"></section>
  </div>`;
}

function criarVistasTecnicasEletro(produto = {}, dados = {}, tipo = "generico") {
  const dimensoes = obterDimensoesConfirmadasProduto(produto);
  const imagem = obterImagensProduto(produto)[0] || IMAGEM_FALLBACK;
  const nichoAtual = dados.dimensoesNicho || {};
  const nichoLegado = dados.nichoInstalacao || {};
  const folgasAtuais = dados.folgas || {};
  const folgasLegadas = dados.folgasEVentilacao || dados.espacosFolgas || {};
  const sufixo = String(produto.modelo || tipo).replace(/[^a-z0-9]/gi, "").slice(0, 18) || tipo;

  function campoConfirmado(...campos) {
    return campos.find(campo => {
      if (!campo) return false;
      if (typeof campo !== "object") return String(campo).trim();
      const status = String(campo.status || "").toUpperCase();
      return campo.valor && (!status || status === "CONFIRMADO" || status === "MANUAL_VALIDADO");
    });
  }

  function valor(...campos) {
    const campo = campoConfirmado(...campos);
    if (!campo) return "";
    if (typeof campo !== "object") return String(campo).trim();
    const bruto = String(campo.valor || "").trim();
    return campo.unidade && !/[a-zA-Z²°]/.test(bruto) ? `${bruto} ${campo.unidade}` : bruto;
  }

  function pagina(...campos) {
    const campo = campoConfirmado(...campos);
    if (!campo || typeof campo !== "object") return "";
    if (campo.fonte === "CADASTRO_OFICIAL" || campo.pagina === "Fonte oficial") return "Ficha oficial";
    return campo.pagina ? `Manual • pág. ${campo.pagina}` : "Cota confirmada";
  }

  const largura = valor(dimensoes.largura);
  const altura = valor(dimensoes.altura);
  const profundidade = valor(dimensoes.profundidade);
  const larguraNicho = valor(nichoAtual.largura, nichoLegado.larguraNichoMinima, nichoLegado.larguraNichoRecomendada);
  const alturaNichoMin = valor(nichoAtual.altura, nichoLegado.alturaNichoMinima, nichoLegado.alturaNichoRecomendada);
  const alturaNichoMax = valor(nichoLegado.alturaNichoMaxima);
  const profundidadeNicho = valor(nichoAtual.profundidade, nichoLegado.profundidadeNichoMinima, nichoLegado.profundidadeNichoRecomendada);
  const folgaSuperior = valor(folgasAtuais.superior, folgasLegadas.folgaSuperior);
  const folgaEsquerda = valor(folgasLegadas.folgaLateralEsquerda);
  const folgaDireita = valor(folgasLegadas.folgaLateralDireita);
  const folgaLateral = valor(folgasAtuais.lateral, folgaEsquerda, folgaDireita);
  const folgaTraseira = valor(folgasAtuais.traseira, folgasLegadas.afastamentoTraseiro);

  const origemDimensoes = pagina(dimensoes.largura, dimensoes.altura, dimensoes.profundidade);
  const origemNicho = pagina(
    nichoAtual.largura,
    nichoLegado.larguraNichoMinima,
    nichoAtual.altura,
    nichoLegado.alturaNichoMinima,
    nichoAtual.profundidade,
    nichoLegado.profundidadeNichoMinima
  );

  const cabecalho = (titulo, subtitulo, origem = origemDimensoes) => `
    <div class="vista-projeto-titulo">
      <div><strong>${titulo}</strong><span>${subtitulo}</span></div>
      <small>${escaparHTML(origem || "Cota não localizada")}</small>
    </div>`;

  const indisponivel = eixo => `<div class="vista-indisponivel"><span>—</span><strong>Vista ${eixo} aguardando cotas</strong><p>O desenho será liberado quando os dois eixos estiverem confirmados.</p></div>`;
  const definicoes = nome => `<defs>
    <marker id="seta-${sufixo}-${nome}" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7z"></path></marker>
    <style>
      .produto-frontal circle,.produto-frontal ellipse{fill:#f6f3ed;stroke:#292824;stroke-width:1.8}
      .produto-frontal path{fill:none;stroke:#292824;stroke-width:1.8;stroke-linejoin:round}
    </style>
  </defs>`;

  function cotas(x1, x2, y1, y2, valorX, valorY, nome, rotuloX, rotuloY, xCotaVertical, yCotaHorizontal = 338) {
    const seta = `url(#seta-${sufixo}-${nome})`;
    // Mantém a cota de altura fora do desenho, inclusive em produtos largos
    // como TVs, cooktops e freezers horizontais.
    const posicaoCotaVertical = Number.isFinite(xCotaVertical)
      ? xCotaVertical
      : Math.min(112, x1 - 42);
    return `
      <line class="cota-tecnica" x1="${x1}" y1="${yCotaHorizontal}" x2="${x2}" y2="${yCotaHorizontal}" marker-start="${seta}" marker-end="${seta}"></line>
      <text class="cota-valor" x="${(x1 + x2) / 2}" y="${yCotaHorizontal + 28}">${escaparHTML(valorX)}</text>
      <text class="cota-legenda" x="${(x1 + x2) / 2}" y="${yCotaHorizontal + 50}">${escaparHTML(rotuloX)}</text>
      <line class="cota-tecnica" x1="${posicaoCotaVertical}" y1="${y1}" x2="${posicaoCotaVertical}" y2="${y2}" marker-start="${seta}" marker-end="${seta}"></line>
      <text class="cota-valor" x="${posicaoCotaVertical - 33}" y="${(y1 + y2) / 2}" transform="rotate(-90 ${posicaoCotaVertical - 33} ${(y1 + y2) / 2})">${escaparHTML(valorY)}</text>
      <text class="cota-legenda" x="${posicaoCotaVertical}" y="${y2 + 24}">${escaparHTML(rotuloY)}</text>`;
  }

  function notaTecnica(texto) {
    return texto ? `<text class="cota-legenda" x="260" y="404">${escaparHTML(texto)}</text>` : "";
  }

  function vistaForno(posicao) {
    if (posicao === "frontal" && largura && altura) {
      const notaNicho = larguraNicho && alturaNichoMin
        ? `Nicho: ${larguraNicho} × ${alturaNichoMin}${alturaNichoMax ? `–${alturaNichoMax}` : ""}${profundidadeNicho ? ` × mín. ${profundidadeNicho}` : ""}`
        : "";
      return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica do forno de embutir">
        ${definicoes("forno-frontal")}
        ${larguraNicho && alturaNichoMin ? `<g class="nicho-tecnico"><path d="M137 52H383V316H137Z"></path></g><text class="nota-nicho" x="260" y="40">NICHO / MARCENARIA</text>` : ""}
        <g class="produto-frontal">
          <rect x="150" y="66" width="220" height="238" rx="2"></rect>
          <line x1="150" y1="116" x2="370" y2="116"></line>
          <circle cx="181" cy="91" r="8"></circle><circle cx="339" cy="91" r="8"></circle>
          <rect x="229" y="82" width="62" height="18" rx="2"></rect>
          <line x1="180" y1="139" x2="340" y2="139"></line>
          <rect x="179" y="157" width="162" height="123" rx="3"></rect>
          <line x1="188" y1="289" x2="332" y2="289"></line>
        </g>
        ${cotas(150, 370, 66, 304, largura, altura, "forno-frontal", "largura externa", "altura externa")}
        ${notaTecnica(notaNicho)}
      </svg>`;
    }
    if (posicao === "lateral" && profundidade && altura) {
      return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica do forno de embutir">
        ${definicoes("forno-lateral")}
        <g class="produto-frontal">
          <rect x="165" y="66" width="190" height="238" rx="2"></rect>
          <rect x="148" y="60" width="18" height="250" rx="2"></rect>
          <line x1="148" y1="116" x2="355" y2="116"></line>
          <line x1="137" y1="140" x2="165" y2="140"></line>
          <path d="M355 88h13v188h-13" fill="none"></path>
        </g>
        ${cotas(148, 368, 60, 310, profundidade, altura, "forno-lateral", "profundidade total", "altura externa")}
        ${profundidadeNicho ? notaTecnica(`Profundidade mínima do nicho: ${profundidadeNicho}`) : ""}
      </svg>`;
    }
    if (posicao === "superior" && largura && profundidade) {
      return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica do forno de embutir">
        ${definicoes("forno-superior")}
        <g class="produto-frontal">
          <rect x="150" y="72" width="220" height="228" rx="2"></rect>
          <rect x="142" y="286" width="236" height="16" rx="2"></rect>
          <line x1="164" y1="94" x2="356" y2="94"></line>
          <line x1="164" y1="278" x2="356" y2="278"></line>
        </g>
        ${cotas(142, 378, 72, 302, largura, profundidade, "forno-superior", "largura externa", "profundidade total")}
        ${folgaSuperior ? notaTecnica(`Ventilação confirmada no manual: ${folgaSuperior}`) : ""}
      </svg>`;
    }
    return indisponivel(posicao);
  }

  function vistaFogao(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica do fogão">
      ${definicoes("fogao-frontal")}
      <g class="produto-frontal">
        <rect x="153" y="77" width="214" height="224" rx="3"></rect>
        <path d="M153 77L175 58H345L367 77" fill="none"></path>
        <rect x="160" y="82" width="200" height="45" rx="2"></rect>
        <circle cx="184" cy="104" r="7"></circle><circle cx="222" cy="104" r="7"></circle><circle cx="260" cy="104" r="7"></circle><circle cx="298" cy="104" r="7"></circle><circle cx="336" cy="104" r="7"></circle>
        <line x1="178" y1="146" x2="342" y2="146"></line>
        <rect x="179" y="161" width="162" height="106" rx="4"></rect>
        <line x1="167" y1="281" x2="353" y2="281"></line>
        <line x1="174" y1="301" x2="174" y2="313"></line><line x1="346" y1="301" x2="346" y2="313"></line>
      </g>
      ${cotas(153, 367, 58, 313, largura, altura, "fogao-frontal", "largura externa", "altura total")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica do fogão">
      ${definicoes("fogao-lateral")}
      <g class="produto-frontal">
        <rect x="152" y="94" width="216" height="207" rx="3"></rect>
        <path d="M152 94L171 77H368V103H152" fill="none"></path>
        <path d="M344 77V49H368V94" fill="none"></path>
        <line x1="152" y1="133" x2="368" y2="133"></line>
        <line x1="172" y1="151" x2="351" y2="151"></line>
        <rect x="169" y="167" width="180" height="100" rx="3"></rect>
        <line x1="172" y1="301" x2="172" y2="313"></line><line x1="348" y1="301" x2="348" y2="313"></line>
      </g>
      ${cotas(152, 368, 49, 313, profundidade, altura, "fogao-lateral", "profundidade total", "altura total")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica do fogão com cinco queimadores">
      ${definicoes("fogao-superior")}
      <g class="produto-frontal">
        <rect x="151" y="67" width="218" height="238" rx="3"></rect>
        <circle cx="196" cy="116" r="22"></circle><circle cx="324" cy="116" r="22"></circle>
        <circle cx="260" cy="181" r="29"></circle>
        <circle cx="196" cy="250" r="18"></circle><circle cx="324" cy="250" r="18"></circle>
        <line x1="151" y1="282" x2="369" y2="282"></line>
      </g>
      ${cotas(151, 369, 67, 305, largura, profundidade, "fogao-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaCervejeira(posicao) {
    const notaFolgas = [folgaSuperior && `superior ${folgaSuperior}`, folgaLateral && `laterais ${folgaLateral}`, folgaTraseira && `traseira ${folgaTraseira}`].filter(Boolean).join(" • ");
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica da cervejeira">
      ${definicoes("cervejeira-frontal")}
      <g class="produto-frontal">
        <rect x="171" y="51" width="178" height="259" rx="5"></rect>
        <rect x="184" y="70" width="152" height="203" rx="3"></rect>
        <line x1="198" y1="108" x2="322" y2="108"></line><line x1="198" y1="145" x2="322" y2="145"></line><line x1="198" y1="182" x2="322" y2="182"></line><line x1="198" y1="219" x2="322" y2="219"></line>
        <line x1="322" y1="83" x2="322" y2="157"></line>
        <line x1="184" y1="287" x2="336" y2="287"></line><line x1="190" y1="294" x2="330" y2="294"></line>
      </g>
      ${cotas(171, 349, 51, 310, largura, altura, "cervejeira-frontal", "largura externa", "altura total")}
      ${notaTecnica(notaFolgas ? `Folgas mínimas: ${notaFolgas}` : "")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica da cervejeira">
      ${definicoes("cervejeira-lateral")}
      <g class="produto-frontal">
        <rect x="165" y="51" width="190" height="259" rx="4"></rect>
        <rect x="151" y="58" width="14" height="245" rx="2"></rect>
        <line x1="144" y1="88" x2="151" y2="88"></line><line x1="144" y1="88" x2="144" y2="162"></line>
        <path d="M355 62h9v232h-9" fill="none"></path>
        <line x1="178" y1="287" x2="344" y2="287"></line>
      </g>
      ${cotas(144, 364, 51, 310, profundidade, altura, "cervejeira-lateral", "profundidade total", "altura total")}
      ${folgaTraseira ? notaTecnica(`Afastamento traseiro mínimo: ${folgaTraseira}`) : ""}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica da cervejeira">
      ${definicoes("cervejeira-superior")}
      <g class="produto-frontal">
        <rect x="170" y="69" width="180" height="232" rx="4"></rect>
        <rect x="163" y="288" width="194" height="14" rx="2"></rect>
        <line x1="184" y1="89" x2="336" y2="89"></line>
      </g>
      ${cotas(163, 357, 69, 302, largura, profundidade, "cervejeira-superior", "largura externa", "profundidade total")}
      ${folgaLateral ? notaTecnica(`Folga lateral mínima confirmada: ${folgaLateral}`) : ""}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaFrigobar(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica do frigobar">
      ${definicoes("frigobar-frontal")}
      <g class="produto-frontal">
        <rect x="172" y="58" width="176" height="250" rx="7"></rect>
        <line x1="172" y1="105" x2="348" y2="105"></line>
        <line x1="331" y1="78" x2="331" y2="142"></line>
        <line x1="184" y1="287" x2="336" y2="287"></line>
        <line x1="188" y1="308" x2="188" y2="316"></line><line x1="332" y1="308" x2="332" y2="316"></line>
      </g>
      ${cotas(172, 348, 58, 316, largura, altura, "frigobar-frontal", "largura externa", "altura total")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica do frigobar">
      ${definicoes("frigobar-lateral")}
      <g class="produto-frontal">
        <rect x="169" y="58" width="186" height="250" rx="6"></rect>
        <rect x="154" y="65" width="15" height="236" rx="3"></rect>
        <line x1="145" y1="87" x2="154" y2="87"></line><line x1="145" y1="87" x2="145" y2="151"></line>
        <line x1="181" y1="287" x2="343" y2="287"></line>
        <line x1="185" y1="308" x2="185" y2="316"></line><line x1="339" y1="308" x2="339" y2="316"></line>
      </g>
      ${cotas(145, 355, 58, 316, profundidade, altura, "frigobar-lateral", "profundidade total", "altura total")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica do frigobar">
      ${definicoes("frigobar-superior")}
      <g class="produto-frontal">
        <rect x="171" y="68" width="178" height="234" rx="5"></rect>
        <rect x="164" y="288" width="192" height="14" rx="2"></rect>
        <line x1="184" y1="88" x2="336" y2="88"></line>
      </g>
      ${cotas(164, 356, 68, 302, largura, profundidade, "frigobar-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaLavaLoucas(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica da lava-louças">
      ${definicoes("lava-loucas-frontal")}
      <g class="produto-frontal">
        <rect x="158" y="58" width="204" height="250" rx="3"></rect>
        <rect x="158" y="58" width="204" height="43" rx="3"></rect>
        <rect x="176" y="72" width="58" height="13" rx="2"></rect>
        <circle cx="324" cy="79" r="6"></circle><circle cx="343" cy="79" r="4"></circle>
        <line x1="184" y1="116" x2="336" y2="116"></line>
        <rect x="174" y="130" width="172" height="137" rx="3"></rect>
        <line x1="170" y1="283" x2="350" y2="283"></line>
        <rect x="174" y="289" width="172" height="19" rx="1"></rect>
      </g>
      ${cotas(158, 362, 58, 308, largura, altura, "lava-loucas-frontal", "largura externa", "altura total")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica da lava-louças">
      ${definicoes("lava-loucas-lateral")}
      <g class="produto-frontal">
        <rect x="158" y="58" width="204" height="250" rx="3"></rect>
        <rect x="146" y="60" width="12" height="246" rx="2"></rect>
        <line x1="146" y1="101" x2="362" y2="101"></line>
        <line x1="172" y1="283" x2="348" y2="283"></line>
        <path d="M362 77h10v210h-10" fill="none"></path>
      </g>
      ${cotas(146, 372, 58, 308, profundidade, altura, "lava-loucas-lateral", "profundidade total", "altura total")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica da lava-louças">
      ${definicoes("lava-loucas-superior")}
      <g class="produto-frontal">
        <rect x="158" y="69" width="204" height="233" rx="3"></rect>
        <rect x="150" y="286" width="220" height="16" rx="2"></rect>
        <line x1="173" y1="91" x2="347" y2="91"></line>
      </g>
      ${cotas(150, 370, 69, 302, largura, profundidade, "lava-loucas-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaLavadora(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica da lavadora">
      ${definicoes("lavadora-frontal")}
      <g class="produto-frontal">
        <rect x="162" y="54" width="196" height="255" rx="8"></rect>
        <path d="M162 98L177 54H343L358 98" fill="none"></path>
        <rect x="181" y="66" width="88" height="20" rx="3"></rect>
        <circle cx="314" cy="76" r="11"></circle><circle cx="341" cy="76" r="5"></circle>
        <line x1="172" y1="108" x2="348" y2="108"></line>
        <path d="M186 124Q260 146 334 124V273Q260 290 186 273Z" fill="none"></path>
        <line x1="178" y1="291" x2="342" y2="291"></line>
      </g>
      ${cotas(162, 358, 54, 309, largura, altura, "lavadora-frontal", "largura externa", "altura total")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica da lavadora">
      ${definicoes("lavadora-lateral")}
      <g class="produto-frontal">
        <rect x="157" y="54" width="206" height="255" rx="8"></rect>
        <path d="M157 98L178 54H346L363 98" fill="none"></path>
        <line x1="178" y1="73" x2="346" y2="73"></line>
        <line x1="170" y1="108" x2="350" y2="108"></line>
        <path d="M363 86h10v191h-10" fill="none"></path>
        <line x1="178" y1="291" x2="344" y2="291"></line>
      </g>
      ${cotas(157, 373, 54, 309, profundidade, altura, "lavadora-lateral", "profundidade total", "altura total")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica da lavadora com tampa">
      ${definicoes("lavadora-superior")}
      <g class="produto-frontal">
        <rect x="160" y="67" width="200" height="237" rx="7"></rect>
        <rect x="179" y="94" width="162" height="153" rx="8"></rect>
        <ellipse cx="260" cy="169" rx="65" ry="58"></ellipse>
        <rect x="181" y="261" width="91" height="22" rx="3"></rect>
        <circle cx="316" cy="272" r="11"></circle>
      </g>
      ${cotas(160, 360, 67, 304, largura, profundidade, "lavadora-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaMicroondas(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica do micro-ondas">
      ${definicoes("microondas-frontal")}
      <g class="produto-frontal">
        <rect x="135" y="91" width="250" height="188" rx="5"></rect>
        <rect x="151" y="108" width="166" height="143" rx="4"></rect>
        <rect x="330" y="110" width="39" height="25" rx="2"></rect>
        <circle cx="349" cy="158" r="6"></circle><circle cx="349" cy="181" r="6"></circle><circle cx="349" cy="204" r="6"></circle>
        <rect x="338" y="225" width="22" height="18" rx="2"></rect>
        <line x1="306" y1="119" x2="306" y2="238"></line>
      </g>
      ${cotas(135, 385, 91, 279, largura, altura, "microondas-frontal", "largura externa", "altura externa")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica do micro-ondas">
      ${definicoes("microondas-lateral")}
      <g class="produto-frontal">
        <rect x="143" y="91" width="234" height="188" rx="5"></rect>
        <rect x="132" y="96" width="11" height="178" rx="2"></rect>
        <line x1="175" y1="124" x2="345" y2="124"></line><line x1="175" y1="137" x2="345" y2="137"></line><line x1="175" y1="150" x2="345" y2="150"></line>
        <path d="M377 111h10v147h-10" fill="none"></path>
      </g>
      ${cotas(132, 387, 91, 279, profundidade, altura, "microondas-lateral", "profundidade total", "altura externa")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica do micro-ondas">
      ${definicoes("microondas-superior")}
      <g class="produto-frontal">
        <rect x="136" y="75" width="248" height="224" rx="5"></rect>
        <line x1="151" y1="96" x2="369" y2="96"></line>
        <line x1="151" y1="111" x2="236" y2="111"></line><line x1="151" y1="123" x2="236" y2="123"></line>
        <rect x="128" y="285" width="264" height="14" rx="2"></rect>
      </g>
      ${cotas(128, 392, 75, 299, largura, profundidade, "microondas-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaCooktop(posicao) {
    const temRecorteConfirmado = Boolean(larguraNicho && profundidadeNicho);
    const notaRecorte = temRecorteConfirmado
      ? `Recorte confirmado: ${larguraNicho} × ${profundidadeNicho}`
      : "Recorte da bancada não localizado na fonte oficial";

    if (posicao === "frontal" && largura && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista axonométrica técnica do cooktop">
      ${definicoes("cooktop-axonometrica")}
      <g class="produto-frontal">
        <!-- mesa superior em projeção axonométrica -->
        <path d="M132 142 L322 88 L407 139 L216 195 Z"></path>
        <path d="M216 195 L407 139 L407 151 L216 207 Z"></path>
        <path d="M132 142 L216 195 L216 207 L132 154 Z"></path>
        <!-- corpo embutido, indicado com linhas ocultas -->
        <path d="M174 169 L228 202 L228 245 L367 204 L367 154" stroke-dasharray="7 5"></path>
        <!-- queimadores em perspectiva -->
        <!-- matriz padronizada: 2 traseiras + central + 2 dianteiras -->
        <ellipse cx="195" cy="143" rx="19" ry="11"></ellipse><ellipse cx="195" cy="143" rx="10" ry="6"></ellipse>
        <ellipse cx="301" cy="113" rx="19" ry="11"></ellipse><ellipse cx="301" cy="113" rx="10" ry="6"></ellipse>
        <ellipse cx="269" cy="142" rx="28" ry="16"></ellipse><ellipse cx="269" cy="142" rx="18" ry="10"></ellipse><ellipse cx="269" cy="142" rx="9" ry="5"></ellipse>
        <ellipse cx="234" cy="168" rx="18" ry="10"></ellipse><ellipse cx="234" cy="168" rx="9" ry="5"></ellipse>
        <ellipse cx="341" cy="138" rx="18" ry="10"></ellipse><ellipse cx="341" cy="138" rx="9" ry="5"></ellipse>
        <!-- cinco comandos alinhados na borda frontal -->
        <ellipse cx="274" cy="171" rx="4.5" ry="2.7"></ellipse>
        <ellipse cx="293" cy="166" rx="4.5" ry="2.7"></ellipse>
        <ellipse cx="312" cy="160" rx="4.5" ry="2.7"></ellipse>
        <ellipse cx="331" cy="155" rx="4.5" ry="2.7"></ellipse>
        <ellipse cx="350" cy="149" rx="4.5" ry="2.7"></ellipse>
      </g>
      <!-- linhas auxiliares e cotas externas -->
      <line class="cota-tecnica" x1="216" y1="207" x2="216" y2="238" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="407" y1="151" x2="407" y2="182" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="216" y1="231" x2="407" y2="175" marker-start="url(#seta-${sufixo}-cooktop-axonometrica)" marker-end="url(#seta-${sufixo}-cooktop-axonometrica)"></line>
      <text class="cota-valor" x="311" y="196" transform="rotate(-16.3 311 196)" style="paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round">${escaparHTML(largura)}</text>

      <line class="cota-tecnica" x1="132" y1="154" x2="101" y2="166" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="216" y1="207" x2="185" y2="219" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="104" y1="171" x2="185" y2="222" marker-start="url(#seta-${sufixo}-cooktop-axonometrica)" marker-end="url(#seta-${sufixo}-cooktop-axonometrica)"></line>
      <text class="cota-valor" x="143" y="188" transform="rotate(32.2 143 188)" style="paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round">${escaparHTML(profundidade)}</text>

      <line class="cota-tecnica" x1="407" y1="139" x2="437" y2="139" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="407" y1="207" x2="437" y2="207" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="431" y1="139" x2="431" y2="207" marker-start="url(#seta-${sufixo}-cooktop-axonometrica)" marker-end="url(#seta-${sufixo}-cooktop-axonometrica)"></line>
      <text class="cota-valor" x="425" y="173" transform="rotate(-90 425 173)" style="paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round">${escaparHTML(altura)}</text>
      <text class="cota-legenda" x="260" y="279">VISTA AXONOMÉTRICA • SEM ESCALA</text>
    </svg>`;

    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Corte lateral técnico do cooktop e da bancada">
      ${definicoes("cooktop-corte-lateral")}
      <g class="produto-frontal">
        <!-- tampo da bancada em corte -->
        <path d="M92 190 H428 V220 H352 M168 220 H92 Z"></path>
        <path d="M98 195 l22 20 M122 190 l28 28 M392 190 l28 28 M368 190 l28 28" stroke-width="1"></path>
        <!-- mesa e corpo embutido do cooktop -->
        <rect x="135" y="169" width="250" height="21" rx="3"></rect>
        <path d="M166 190 V278 H354 V190"></path>
        <path d="M181 207 H339" stroke-dasharray="7 5"></path>
        <path d="M208 169 v-22 h42 v22 M281 169 v-22 h42 v22"></path>
        ${temRecorteConfirmado ? `<line x1="168" y1="220" x2="352" y2="220" stroke-dasharray="7 5"></line>` : ""}
      </g>
      <line class="cota-tecnica" x1="135" y1="190" x2="135" y2="327" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="385" y1="190" x2="385" y2="327" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="135" y1="321" x2="385" y2="321" marker-start="url(#seta-${sufixo}-cooktop-corte-lateral)" marker-end="url(#seta-${sufixo}-cooktop-corte-lateral)"></line>
      <text class="cota-valor" x="260" y="315" style="paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round">${escaparHTML(profundidade)}</text>

      <line class="cota-tecnica" x1="92" y1="147" x2="141" y2="147" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="92" y1="278" x2="166" y2="278" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="98" y1="147" x2="98" y2="278" marker-start="url(#seta-${sufixo}-cooktop-corte-lateral)" marker-end="url(#seta-${sufixo}-cooktop-corte-lateral)"></line>
      <text class="cota-valor" x="92" y="212" transform="rotate(-90 92 212)" style="paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round">${escaparHTML(altura)}</text>
      <text class="cota-legenda" x="260" y="296">CORTE ESQUEMÁTICO DA INSTALAÇÃO</text>
      <text class="cota-legenda" x="260" y="365">PROFUNDIDADE EXTERNA</text>
      <text class="cota-legenda" x="260" y="395">${escaparHTML(notaRecorte)}</text>
    </svg>`;

    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Planta técnica superior do cooktop">
      ${definicoes("cooktop-planta")}
      <g class="produto-frontal">
        <rect x="130" y="72" width="260" height="190" rx="5"></rect>
        ${temRecorteConfirmado ? `<rect x="149" y="90" width="222" height="136" rx="2" stroke-dasharray="8 6"></rect>` : ""}
        <!-- a mesma matriz da vista axonométrica -->
        <circle cx="187" cy="112" r="20"></circle><circle cx="187" cy="112" r="10"></circle>
        <circle cx="333" cy="112" r="20"></circle><circle cx="333" cy="112" r="10"></circle>
        <circle cx="260" cy="159" r="29"></circle><circle cx="260" cy="159" r="19"></circle><circle cx="260" cy="159" r="10"></circle>
        <circle cx="190" cy="207" r="18"></circle><circle cx="190" cy="207" r="9"></circle>
        <circle cx="330" cy="207" r="18"></circle><circle cx="330" cy="207" r="9"></circle>
        <!-- cinco comandos em linha na borda frontal -->
        <circle cx="170" cy="244" r="5"></circle>
        <circle cx="215" cy="244" r="5"></circle>
        <circle cx="260" cy="244" r="5"></circle>
        <circle cx="305" cy="244" r="5"></circle>
        <circle cx="350" cy="244" r="5"></circle>
      </g>
      <line class="cota-tecnica" x1="130" y1="262" x2="130" y2="334" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="390" y1="262" x2="390" y2="334" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="130" y1="328" x2="390" y2="328" marker-start="url(#seta-${sufixo}-cooktop-planta)" marker-end="url(#seta-${sufixo}-cooktop-planta)"></line>
      <text class="cota-valor" x="260" y="322" style="paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round">${escaparHTML(largura)}</text>

      <line class="cota-tecnica" x1="82" y1="72" x2="136" y2="72" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="82" y1="262" x2="136" y2="262" stroke-opacity=".45"></line>
      <line class="cota-tecnica" x1="88" y1="72" x2="88" y2="262" marker-start="url(#seta-${sufixo}-cooktop-planta)" marker-end="url(#seta-${sufixo}-cooktop-planta)"></line>
      <text class="cota-valor" x="82" y="167" transform="rotate(-90 82 167)" style="paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round">${escaparHTML(profundidade)}</text>

      ${temRecorteConfirmado ? `<text class="cota-legenda" x="260" y="290">LINHA TRACEJADA: RECORTE ${escaparHTML(larguraNicho)} × ${escaparHTML(profundidadeNicho)}</text>` : `<text class="cota-legenda" x="260" y="290">PLANTA DO PRODUTO • RECORTE AINDA NÃO CONFIRMADO</text>`}
      <text class="cota-legenda" x="260" y="365">LARGURA EXTERNA</text>
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaFreezerHorizontal(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica do freezer horizontal">
      ${definicoes("freezer-horizontal-frontal")}
      <g class="produto-frontal">
        <rect x="112" y="116" width="296" height="172" rx="5"></rect>
        <rect x="105" y="99" width="310" height="25" rx="5"></rect>
        <line x1="123" y1="135" x2="397" y2="135"></line>
        <rect x="351" y="148" width="35" height="22" rx="2"></rect>
        <line x1="130" y1="288" x2="130" y2="304"></line><line x1="390" y1="288" x2="390" y2="304"></line>
      </g>
      ${cotas(105, 415, 99, 304, largura, altura, "freezer-horizontal-frontal", "largura externa", "altura total")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica do freezer horizontal">
      ${definicoes("freezer-horizontal-lateral")}
      <g class="produto-frontal">
        <rect x="148" y="116" width="224" height="172" rx="5"></rect>
        <rect x="140" y="99" width="240" height="25" rx="5"></rect>
        <line x1="159" y1="137" x2="361" y2="137"></line>
        <line x1="165" y1="288" x2="165" y2="304"></line><line x1="355" y1="288" x2="355" y2="304"></line>
      </g>
      ${cotas(140, 380, 99, 304, profundidade, altura, "freezer-horizontal-lateral", "profundidade total", "altura total")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica do freezer horizontal">
      ${definicoes("freezer-horizontal-superior")}
      <g class="produto-frontal">
        <rect x="105" y="82" width="310" height="205" rx="6"></rect>
        <rect x="119" y="96" width="282" height="177" rx="4"></rect>
        <line x1="260" y1="96" x2="260" y2="273"></line>
        <rect x="226" y="258" width="68" height="9" rx="2"></rect>
      </g>
      ${cotas(105, 415, 82, 287, largura, profundidade, "freezer-horizontal-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaAdega(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica da adega climatizada">
      ${definicoes("adega-frontal")}
      <g class="produto-frontal">
        <rect x="177" y="51" width="166" height="258" rx="6"></rect>
        <rect x="188" y="70" width="144" height="211" rx="3"></rect>
        <rect x="225" y="78" width="70" height="16" rx="2"></rect>
        <line x1="199" y1="111" x2="321" y2="111"></line><line x1="199" y1="145" x2="321" y2="145"></line><line x1="199" y1="179" x2="321" y2="179"></line><line x1="199" y1="213" x2="321" y2="213"></line><line x1="199" y1="247" x2="321" y2="247"></line>
        <path d="M213 101l18 10-18 10M307 101l-18 10 18 10M213 135l18 10-18 10M307 135l-18 10 18 10M213 169l18 10-18 10M307 169l-18 10 18 10" fill="none"></path>
        <line x1="318" y1="105" x2="318" y2="170"></line>
        <line x1="190" y1="294" x2="330" y2="294"></line>
      </g>
      ${cotas(177, 343, 51, 309, largura, altura, "adega-frontal", "largura externa", "altura total")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica da adega climatizada">
      ${definicoes("adega-lateral")}
      <g class="produto-frontal">
        <rect x="164" y="51" width="191" height="258" rx="5"></rect>
        <rect x="150" y="58" width="14" height="244" rx="2"></rect>
        <line x1="143" y1="88" x2="150" y2="88"></line><line x1="143" y1="88" x2="143" y2="153"></line>
        <line x1="181" y1="294" x2="340" y2="294"></line>
      </g>
      ${cotas(143, 355, 51, 309, profundidade, altura, "adega-lateral", "profundidade total", "altura total")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica da adega climatizada">
      ${definicoes("adega-superior")}
      <g class="produto-frontal">
        <rect x="174" y="69" width="172" height="233" rx="5"></rect>
        <rect x="166" y="288" width="188" height="14" rx="2"></rect>
        <line x1="188" y1="89" x2="332" y2="89"></line>
      </g>
      ${cotas(166, 354, 69, 302, largura, profundidade, "adega-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaTelevisor(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica do televisor">
      ${definicoes("tv-frontal")}
      <g class="produto-frontal">
        <rect x="98" y="91" width="324" height="188" rx="3"></rect>
        <rect x="109" y="102" width="302" height="166" rx="1"></rect>
      </g>
      ${cotas(98, 422, 91, 279, largura, altura, "tv-frontal", "largura sem suporte", "altura sem suporte", 72, 309)}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica do televisor sem suporte">
      ${definicoes("tv-lateral")}
      <g class="produto-frontal">
        <rect x="247" y="78" width="27" height="218" rx="3"></rect>
        <rect x="252" y="94" width="17" height="174" rx="2"></rect>
      </g>
      ${cotas(247, 274, 78, 296, profundidade, altura, "tv-lateral", "espessura sem suporte", "altura sem suporte", 214, 326)}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica do televisor sem suporte">
      ${definicoes("tv-superior")}
      <g class="produto-frontal">
        <rect x="98" y="171" width="324" height="28" rx="3"></rect>
        <rect x="110" y="178" width="300" height="14" rx="2"></rect>
      </g>
      ${cotas(98, 422, 171, 199, largura, profundidade, "tv-superior", "largura sem suporte", "espessura sem suporte", 72, 232)}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaLavanderiaFrontal(posicao) {
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica da lavadora ou secadora frontal">
      ${definicoes("lavanderia-frontal")}
      <g class="produto-frontal">
        <rect x="164" y="54" width="192" height="255" rx="6"></rect>
        <rect x="177" y="67" width="78" height="23" rx="3"></rect>
        <rect x="270" y="67" width="44" height="18" rx="2"></rect><circle cx="334" cy="77" r="11"></circle>
        <line x1="164" y1="103" x2="356" y2="103"></line>
        <circle cx="260" cy="197" r="69"></circle><circle cx="260" cy="197" r="54"></circle><circle cx="260" cy="197" r="39"></circle>
        <line x1="179" y1="289" x2="341" y2="289"></line>
      </g>
      ${cotas(164, 356, 54, 309, largura, altura, "lavanderia-frontal", "largura externa", "altura total")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica da lavadora ou secadora frontal">
      ${definicoes("lavanderia-lateral")}
      <g class="produto-frontal">
        <rect x="153" y="54" width="214" height="255" rx="6"></rect>
        <rect x="141" y="61" width="12" height="241" rx="2"></rect>
        <line x1="153" y1="103" x2="367" y2="103"></line>
        <circle cx="160" cy="197" r="45"></circle>
        <path d="M367 81h12v196h-12" fill="none"></path>
        <line x1="170" y1="289" x2="350" y2="289"></line>
      </g>
      ${cotas(141, 379, 54, 309, profundidade, altura, "lavanderia-lateral", "profundidade total", "altura total")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica da lavadora ou secadora frontal">
      ${definicoes("lavanderia-superior")}
      <g class="produto-frontal">
        <rect x="162" y="66" width="196" height="238" rx="6"></rect>
        <rect x="151" y="286" width="218" height="18" rx="3"></rect>
        <line x1="178" y1="89" x2="342" y2="89"></line>
        <circle cx="260" cy="184" r="62"></circle>
      </g>
      ${cotas(151, 369, 66, 304, largura, profundidade, "lavanderia-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaCoifa(posicao) {
    const ehIlha = /ilha/.test(normalizarTexto(produto.nome || ""));
    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica da coifa">
      ${definicoes("coifa-frontal")}
      <g class="produto-frontal">
        <rect x="220" y="50" width="80" height="153" rx="2"></rect>
        <rect x="207" y="50" width="106" height="16" rx="2"></rect>
        <path d="M220 188L146 244H374L300 188Z"></path>
        <rect x="135" y="239" width="250" height="31" rx="4"></rect>
        <line x1="154" y1="252" x2="366" y2="252"></line>
        <circle cx="239" cy="257" r="4"></circle><circle cx="281" cy="257" r="4"></circle>
        ${ehIlha ? `<line x1="194" y1="50" x2="194" y2="27"></line><line x1="326" y1="50" x2="326" y2="27"></line><line x1="194" y1="27" x2="326" y2="27"></line>` : ""}
      </g>
      ${cotas(135, 385, 27, 270, largura, altura, "coifa-frontal", "largura externa", "altura total")}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica da coifa">
      ${definicoes("coifa-lateral")}
      <g class="produto-frontal">
        <rect x="231" y="50" width="58" height="153" rx="2"></rect>
        <path d="M231 188L170 244H350L289 188Z"></path>
        <rect x="160" y="239" width="200" height="31" rx="4"></rect>
        <line x1="178" y1="252" x2="342" y2="252"></line>
        ${ehIlha ? `<line x1="204" y1="50" x2="204" y2="27"></line><line x1="316" y1="50" x2="316" y2="27"></line>` : ""}
      </g>
      ${cotas(160, 360, 27, 270, profundidade, altura, "coifa-lateral", "profundidade total", "altura total")}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica da coifa">
      ${definicoes("coifa-superior")}
      <g class="produto-frontal">
        <rect x="133" y="86" width="254" height="199" rx="5"></rect>
        <rect x="214" y="132" width="92" height="108" rx="3"></rect>
        <line x1="153" y1="104" x2="367" y2="104"></line><line x1="153" y1="267" x2="367" y2="267"></line>
        <circle cx="175" cy="185" r="7"></circle><circle cx="345" cy="185" r="7"></circle>
      </g>
      ${cotas(133, 387, 86, 285, largura, profundidade, "coifa-superior", "largura externa", "profundidade total")}
    </svg>`;
    return indisponivel(posicao);
  }

  function vistaRefrigerador(posicao) {
    const texto = normalizarTexto(`${produto.nome || ""} ${produto.modelo || ""} ${produto.moldeTecnico || ""} ${produto.familiaTecnica || ""}`);
    const sideBySide = /side by side|rs60|rs58|rs50/.test(texto);
    const quatroPortas = /4 portas|quatro portas|multidoor|multi door|rf29|rf27/.test(texto);
    const frenchDoor = !quatroPortas && /french door|3 portas|tres portas|rf70|rf80/.test(texto);
    const duplex = !sideBySide && !quatroPortas && !frenchDoor;
    const notaPortas = sideBySide ? "Duas portas verticais" : quatroPortas ? "Configuração multidoor / quatro portas" : frenchDoor ? "Duas portas superiores e gaveta inferior" : "Configuração duplex";

    let detalhesFrente = "";
    if (sideBySide) detalhesFrente = `
      <line x1="260" y1="58" x2="260" y2="309"></line>
      <line x1="247" y1="100" x2="247" y2="222"></line><line x1="273" y1="100" x2="273" y2="222"></line>
      <rect x="194" y="114" width="37" height="56" rx="3"></rect>`;
    else if (quatroPortas) detalhesFrente = `
      <line x1="260" y1="58" x2="260" y2="309"></line><line x1="158" y1="190" x2="362" y2="190"></line>
      <line x1="247" y1="91" x2="247" y2="164"></line><line x1="273" y1="91" x2="273" y2="164"></line>`;
    else if (frenchDoor) detalhesFrente = `
      <line x1="260" y1="58" x2="260" y2="205"></line><line x1="158" y1="205" x2="362" y2="205"></line>
      <line x1="247" y1="91" x2="247" y2="177"></line><line x1="273" y1="91" x2="273" y2="177"></line>
      <line x1="183" y1="226" x2="337" y2="226"></line><line x1="183" y1="282" x2="337" y2="282"></line>`;
    else detalhesFrente = `
      <line x1="158" y1="128" x2="362" y2="128"></line>
      <line x1="343" y1="79" x2="343" y2="111"></line><line x1="343" y1="150" x2="343" y2="232"></line>`;

    if (posicao === "frontal" && largura && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica do refrigerador">
      ${definicoes("refrigerador-frontal")}
      <g class="produto-frontal">
        <rect x="158" y="58" width="204" height="251" rx="7"></rect>
        ${detalhesFrente}
        <line x1="177" y1="291" x2="343" y2="291"></line>
        <line x1="181" y1="309" x2="181" y2="317"></line><line x1="339" y1="309" x2="339" y2="317"></line>
      </g>
      ${cotas(158, 362, 58, 317, largura, altura, "refrigerador-frontal", "largura externa", "altura total")}
      ${notaTecnica(notaPortas)}
    </svg>`;
    if (posicao === "lateral" && profundidade && altura) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação lateral técnica do refrigerador">
      ${definicoes("refrigerador-lateral")}
      <g class="produto-frontal refrigerador-lateral-detalhado">
        <!-- Gabinete recuado + porta projetada: leitura mais próxima de um refrigerador real -->
        <path d="M176 58H344Q356 58 358 70V297Q356 309 344 309H176Z"></path>
        <rect x="155" y="66" width="21" height="235" rx="4"></rect>
        <path d="M155 78h-9v88h9M358 82h11v194h-11"></path>
        <line x1="176" y1="128" x2="344" y2="128"></line>
        <path d="M187 292H337"></path>
        <path d="M191 309v8M333 309v8"></path>
        <path d="M176 58l-11 8M176 309l-11-8"></path>
        <text class="nota-nicho" x="259" y="336">porta / gabinete</text>
      </g>
      ${cotas(146, 369, 58, 317, profundidade, altura, "refrigerador-lateral", "profundidade total", "altura total", 112, 344)}
    </svg>`;
    if (posicao === "superior" && largura && profundidade) return `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica fechada do refrigerador">
      ${definicoes("refrigerador-superior")}
      <g class="produto-frontal refrigerador-superior-detalhado">
        <!-- Corpo, portas e puxadores vistos de cima -->
        <rect x="156" y="82" width="208" height="190" rx="5"></rect>
        <path d="M156 82H364V102H156Z"></path>
        <path d="M148 272H372Q368 293 350 297H170Q152 293 148 272Z"></path>
        <line x1="260" y1="272" x2="260" y2="296"></line>
        <path d="M178 111H342"></path>
        <path d="M364 108h9v137h-9"></path>
        <path d="M156 108h-7v137h7"></path>
        <path d="M247 280v10M273 280v10"></path>
      </g>
      ${cotas(148, 372, 82, 297, largura, profundidade, "refrigerador-superior", "largura externa", "profundidade total", 112, 328)}
      ${notaTecnica("Vista fechada — abertura exibida somente quando confirmada no manual")}
    </svg>`;
    return indisponivel(posicao);
  }

  const desenhistas = {
    forno: vistaForno,
    fogao: vistaFogao,
    cervejeira: vistaCervejeira,
    frigobar: vistaFrigobar,
    "lava-loucas": vistaLavaLoucas,
    lavadora: vistaLavadora,
    microondas: vistaMicroondas,
    cooktop: vistaCooktop,
    "freezer-horizontal": vistaFreezerHorizontal,
    adega: vistaAdega,
    televisor: vistaTelevisor,
    "lavanderia-frontal": vistaLavanderiaFrontal,
    coifa: vistaCoifa,
    refrigerador: vistaRefrigerador
  };
  const titulos = {
    forno: "forno de embutir",
    fogao: "fogão",
    cervejeira: "cervejeira",
    frigobar: "frigobar",
    "lava-loucas": "lava-louças",
    lavadora: "lavadora",
    microondas: "micro-ondas",
    cooktop: "cooktop",
    "freezer-horizontal": "freezer horizontal",
    adega: "adega climatizada",
    televisor: "televisor",
    "lavanderia-frontal": "lavadora ou secadora frontal",
    coifa: "coifa",
    refrigerador: "refrigerador"
  };
  const desenhar = desenhistas[tipo] || vistaCervejeira;
  const tituloTipo = titulos[tipo] || "produto";
  const origemFrontal = tipo === "forno" && origemNicho ? `${origemDimensoes}${origemNicho !== origemDimensoes ? ` • ${origemNicho}` : ""}` : origemDimensoes;

  if (tipo === "cooktop") {
    const temRecorteConfirmado = Boolean(larguraNicho && profundidadeNicho);
    const origemPlanta = temRecorteConfirmado && origemNicho
      ? `${origemDimensoes}${origemNicho !== origemDimensoes ? ` • ${origemNicho}` : ""}`
      : origemDimensoes;

    return `<div class="vistas-projeto-grade vistas-projeto-cooktop">
      <section class="vista-projeto-card ${largura && profundidade && altura ? "" : "vista-pendente"}">${cabecalho("Vista axonométrica", "Dimensões externas do cooktop", origemDimensoes)}${desenhar("frontal")}</section>
      <section class="vista-projeto-card ${profundidade && altura ? "" : "vista-pendente"}">${cabecalho("Corte lateral", "Produto e plano da bancada", origemDimensoes)}${desenhar("lateral")}</section>
      <section class="vista-projeto-card ${largura && profundidade ? "" : "vista-pendente"}">${cabecalho(temRecorteConfirmado ? "Planta e recorte" : "Planta superior", temRecorteConfirmado ? "Produto e abertura da bancada" : "Dimensões externas do produto", origemPlanta)}${desenhar("superior")}</section>
      <section class="vista-projeto-card vista-produto-real">${cabecalho("Imagem do produto", "Referência visual — sem valor de cota", "Imagem comercial")}<img src="${escaparHTML(imagem)}" alt="${escaparHTML(produto.nome || produto.modelo)}"></section>
    </div>`;
  }

  return `<div class="vistas-projeto-grade vistas-projeto-${tipo}">
    <section class="vista-projeto-card ${largura && altura ? "" : "vista-pendente"}">${cabecalho("Vista frontal", `Elevação técnica do ${tituloTipo}`, origemFrontal)}${desenhar("frontal")}</section>
    <section class="vista-projeto-card ${profundidade && altura ? "" : "vista-pendente"}">${cabecalho("Vista lateral", "Profundidade × altura")}${desenhar("lateral")}</section>
    <section class="vista-projeto-card ${largura && profundidade ? "" : "vista-pendente"}">${cabecalho("Vista superior", "Largura × profundidade")}${desenhar("superior")}</section>
    <section class="vista-projeto-card vista-produto-real">${cabecalho("Imagem do produto", "Referência visual — sem valor de cota", "Imagem comercial")}<img src="${escaparHTML(imagem)}" alt="${escaparHTML(produto.nome || produto.modelo)}"></section>
  </div>`;
}

function criarVistasTecnicasProjeto(produto = {}, dados = {}) {
  const textoProduto = normalizarTexto(`${produto.tipoBloco || ""} ${produto.nome || ""} ${produto.modelo || ""}`);
  const tipoDeclarado = normalizarTexto(produto.tipoBloco || "");
  const modeloDeclarado = normalizarTexto(produto.modelo || "").replace(/[^a-z0-9]/g, "");
  const campoConfirmado = campo => campo?.status === "CONFIRMADO" && campo?.valor !== undefined && campo?.valor !== null && String(campo.valor).trim() !== "" && campo.valor !== "NAO_LOCALIZADO";
  const fisicasLegadas = dados.dimensoesFisicas || dados.Dimensoes_Fisicas || {};
  const portasLegadas = dados.portasAbertura || dados.Portas_Abertura || dados.portasEAbertura || {};
  const modeloSamsung = String(produto.modelo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const campoManualSamsung = (valor, unidade, paginaManual, referenciaManual) => ({ valor, unidade, pagina: String(paginaManual), referencia: referenciaManual, status: "CONFIRMADO" });
  let aberturaTabelaSamsung = {};

  // Somente famílias sem a vista aberta no layout atual. French Door (RF) não entra nesta regra.
  if (modeloSamsung.startsWith("RS58T5561B1")) {
    aberturaTabelaSamsung = {
      largura: campoManualSamsung("1731", "mm", 18, "tabela Afastamento / item 06 / modelo RS58T5561B1"),
      profundidade: campoManualSamsung("1179", "mm", 18, "tabela Afastamento / item 08 / modelo RS58T5561B1"),
      anguloEsquerda: campoManualSamsung("165", "°", 18, "tabela Afastamento / item 02 / modelo RS58T5561B1"),
      anguloDireita: campoManualSamsung("170", "°", 18, "tabela Afastamento / item 03 / modelo RS58T5561B1")
    };
  } else if (modeloSamsung.startsWith("RS60T5")) {
    aberturaTabelaSamsung = {
      largura: campoManualSamsung("1731", "mm", 19, "tabela Afastamento / item 06 / família RS60T5*"),
      profundidade: campoManualSamsung("1179", "mm", 19, "tabela Afastamento / item 08 / família RS60T5*"),
      anguloEsquerda: campoManualSamsung("165", "°", 19, "tabela Afastamento / item 02 / família RS60T5*"),
      anguloDireita: campoManualSamsung("170", "°", 19, "tabela Afastamento / item 03 / família RS60T5*")
    };
  } else {
    const tabelaRT = {
      RT31: ["850", "1201"],
      RT35: ["850", "1263"],
      RT38: ["1006", "1311"],
      RT42: ["1006", "1311"],
      RT47: ["1006", "1356"],
      RT53: ["1006", "1396"]
    };
    const familiaRT = Object.keys(tabelaRT).find(familia => modeloSamsung.startsWith(familia));
    if (familiaRT) {
      const [projecaoAberta, profundidadeAberta] = tabelaRT[familiaRT];
      aberturaTabelaSamsung = {
        largura: campoManualSamsung(projecaoAberta, "mm", 18, `tabela Afastamento / item 04 / família ${familiaRT}`),
        profundidade: campoManualSamsung(profundidadeAberta, "mm", 18, `tabela Afastamento / item 05 / família ${familiaRT}`),
        anguloEsquerda: campoManualSamsung("115", "°", 18, `tabela Afastamento / item 02 / família ${familiaRT}`),
        anguloDireita: campoManualSamsung("115", "°", 18, `tabela Afastamento / item 02 / família ${familiaRT}`)
      };
    }
  }
  const usarCompatibilidadeAberturaSamsung = Object.keys(aberturaTabelaSamsung).length > 0;
  const fisicasAbertura = usarCompatibilidadeAberturaSamsung ? fisicasLegadas : {};
  const portasAbertura = usarCompatibilidadeAberturaSamsung ? portasLegadas : {};

  const possuiAberturaConfirmadaLegada = [
    fisicasAbertura.profundidadeComPortasAbertas,
    fisicasAbertura.larguraComPortasAbertas,
    fisicasAbertura.larguraComPortasAbertas90,
    fisicasAbertura.larguraComPortasAbertasMax,
    portasAbertura.anguloAberturaPortaEsquerda,
    portasAbertura.anguloAberturaPortaDireita,
    aberturaTabelaSamsung.largura,
    aberturaTabelaSamsung.profundidade
  ].some(campoConfirmado);
  const ehFornoEmbutir = tipoDeclarado === "forno" || (!/micro.?ondas|microondas/.test(textoProduto) && /forno de embutir|\bforno\b/.test(textoProduto));
  const ehFogao = tipoDeclarado === "fogao" || /\bfogao\b/.test(textoProduto);
  if (ehFornoEmbutir) return criarVistasTecnicasEletro(produto, dados, "forno");
  if (ehFogao) return criarVistasTecnicasEletro(produto, dados, "fogao");
  if (/cervejeira|beer center|home bar/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "cervejeira");
  if (/freezer horizontal|conservador horizontal/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "freezer-horizontal");
  if (/adega|wine cooler/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "adega");
  if (/smart tv|televisor|\btv\b/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "televisor");
  if (/frigobar|mini.?bar/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "frigobar");
  if (tipoDeclarado === "lava loucas" || tipoDeclarado === "lava-loucas" || /lava.?loucas/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "lava-loucas");
  if (/secadora|lava e seca|washer dryer/.test(textoProduto) || /^(wd|wf|dv)/.test(modeloDeclarado)) return criarVistasTecnicasEletro(produto, dados, "lavanderia-frontal");
  if (tipoDeclarado === "lavadora" || /maquina de lavar|lavadora/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "lavadora");
  if (tipoDeclarado === "microondas" || /micro.?ondas/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "microondas");
  if (tipoDeclarado === "cooktop" || /cooktop/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "cooktop");
  if (tipoDeclarado === "coifa" || /\bcoifa\b/.test(textoProduto)) return criarVistasTecnicasEletro(produto, dados, "coifa");
  const geladeiraComAberturaEspecial = /side by side|french door|3 portas|tres portas|4 portas|quatro portas|multidoor|multi door|rs60|rs58|rs50|rf29|rf27|rf70|rf80/.test(textoProduto);
  if (/geladeira|refrigerador/.test(textoProduto) && !geladeiraComAberturaEspecial && !possuiAberturaConfirmadaLegada) return criarVistasTecnicasEletro(produto, dados, "refrigerador");
  if (!/geladeira|refrigerador|adega|freezer/.test(textoProduto)) return criarVistasTecnicasGenericas(produto, dados);

  const dimensoes = obterDimensoesConfirmadasProduto(produto);
  const folgas = dados.folgas || {};
  const abertura = dados.abertura || {};
  const geometria = dados.geometriaInstalacao || {};
  const requisitosLegados = usarCompatibilidadeAberturaSamsung ? (dados.folgasVentilacao || dados.Requisitos_Instalacao || dados.instalacaoENicho || {}) : {};
  const valor = (campo, vazio = "") => campo?.status === "CONFIRMADO" && campo?.valor ? campo.valor : vazio;
  const valorLegado = (campo, vazio = "") => {
    if (!campoConfirmado(campo)) return vazio;
    const bruto = String(campo.valor).trim();
    const unidade = String(campo.unidade || "").trim();
    return unidade && !bruto.toLowerCase().endsWith(unidade.toLowerCase()) ? `${bruto} ${unidade}`.replace(/\s+°/, "°") : bruto;
  };
  const referencia = (...campos) => campos.find(campo => campo?.status === "CONFIRMADO" && campo?.referencia)?.referencia || "";
  const pagina = (...campos) => {
    const paginaDireta = campos.find(campo => campo?.pagina)?.pagina;
    if (paginaDireta) return paginaDireta;
    if (!usarCompatibilidadeAberturaSamsung) return "—";
    const referenciaComPagina = campos.find(campo => campoConfirmado(campo) && /p[aá]gina\s*\d+/i.test(campo?.referencia || ""))?.referencia || "";
    return referenciaComPagina.match(/p[aá]gina\s*(\d+)/i)?.[1] || "—";
  };
  const largura = valor(geometria.larguraProduto, valor(dimensoes.largura));
  const altura = valor(geometria.alturaProduto, valor(dimensoes.altura));
  const profundidade = valor(geometria.profundidadeTotalProduto, valor(dimensoes.profundidade));
  const profundidadeGabinete = valor(geometria.profundidadeGabinete, valorLegado(fisicasAbertura.profundidadeSemPortas || fisicasAbertura.profundidadeGabineteSemPortas));
  const profundidadeVistaSuperior = profundidadeGabinete || (usarCompatibilidadeAberturaSamsung ? profundidade : "");
  const superior = valor(folgas.superior, valorLegado(requisitosLegados.afastamentoSuperior));
  const lateral = valor(geometria.folgaLateral, valorLegado(requisitosLegados.afastamentoLateral));
  const lateralEsquerda = valor(geometria.folgaLateralEsquerda, valorLegado(requisitosLegados.afastamentoLateralEsquerdo));
  const lateralDireita = valor(geometria.folgaLateralDireita, valorLegado(requisitosLegados.afastamentoLateralDireito));
  const traseira = valor(geometria.afastamentoTraseiro, valorLegado(requisitosLegados.afastamentoTraseiro));
  const anguloLegadoEsquerda = valorLegado(portasAbertura.anguloAberturaPortaEsquerda, valorLegado(aberturaTabelaSamsung.anguloEsquerda));
  const anguloLegadoDireita = valorLegado(portasAbertura.anguloAberturaPortaDireita, valorLegado(aberturaTabelaSamsung.anguloDireita));
  const angulo = valor(geometria.anguloAbertura, valor(abertura.anguloPorta, anguloLegadoDireita || anguloLegadoEsquerda));
  const anguloEsquerda = valor(geometria.anguloAberturaEsquerda, anguloLegadoEsquerda);
  const anguloDireita = valor(geometria.anguloAberturaDireita, anguloLegadoDireita);
  const larguraPortasAbertas = valor(geometria.larguraComPortasAbertas, valorLegado(fisicasAbertura.larguraComPortasAbertas || fisicasAbertura.larguraComPortasAbertasMax || fisicasAbertura.larguraComPortasAbertas90, valorLegado(aberturaTabelaSamsung.largura)));
  const profundidadePortasAbertas = valor(geometria.profundidadeComPortasAbertas, valorLegado(fisicasAbertura.profundidadeComPortasAbertas, valorLegado(aberturaTabelaSamsung.profundidade)));
  const gavetas = valor(geometria.profundidadeComGavetasEstendidas, valor(abertura.distanciaGavetasEstendidas, valorLegado(fisicasAbertura.profundidadeComGavetasEstendidas)));
  const paginaFrontal = pagina(dimensoes.largura, dimensoes.altura, dimensoes.profundidade, folgas.superior);
  const paginaSuperior = pagina(geometria.larguraComPortasAbertas, geometria.profundidadeComPortasAbertas, geometria.anguloAberturaEsquerda, geometria.anguloAberturaDireita, geometria.anguloAbertura, abertura.anguloPorta, fisicasAbertura.profundidadeComPortasAbertas, fisicasAbertura.larguraComPortasAbertas, portasAbertura.anguloAberturaPortaEsquerda, portasAbertura.anguloAberturaPortaDireita, aberturaTabelaSamsung.largura, aberturaTabelaSamsung.profundidade);
  const paginaLateral = pagina(geometria.profundidadeGabinete, geometria.profundidadeTotalProduto, dimensoes.profundidade, geometria.profundidadeComPortasAbertas);
  const referenciaFrontal = referencia(geometria.larguraProduto, dimensoes.largura, geometria.alturaProduto, dimensoes.altura);
  const referenciaSuperior = referencia(geometria.larguraComPortasAbertas, geometria.profundidadeComPortasAbertas, geometria.anguloAberturaEsquerda, geometria.anguloAberturaDireita, geometria.anguloAbertura, abertura.anguloPorta, fisicasAbertura.profundidadeComPortasAbertas, fisicasAbertura.larguraComPortasAbertas, portasAbertura.anguloAberturaPortaEsquerda, portasAbertura.anguloAberturaPortaDireita, aberturaTabelaSamsung.largura, aberturaTabelaSamsung.profundidade);
  const referenciaLateral = referencia(geometria.profundidadeGabinete, geometria.profundidadeTotalProduto, dimensoes.profundidade, geometria.profundidadeComPortasAbertas);
  const imagem = obterImagensProduto(produto)[0] || IMAGEM_FALLBACK;
  const molde = normalizarTexto(produto.moldeTecnico || produto.familiaTecnica || "");
  const modeloNormalizado = normalizarTexto(produto.modelo || "").replace(/\s/g, "");
  const sideBySide = /side by side/.test(molde) || /side by side|rs60|rs58/.test(textoProduto) || /^01572rb1135/.test(modeloNormalizado);
  const quatroPortas = !sideBySide && (/quatro portas/.test(molde) || /4 portas|quatro portas|iq8|multidoor|multi door|rf29|rf27/.test(textoProduto));
  const tresPortas = !sideBySide && !quatroPortas && (/tres portas|french door/.test(molde) || /3 portas|tres portas|im7|im8|french|rf70|rf80/.test(textoProduto));
  const frenchDoor = quatroPortas || tresPortas;
  const duasPortasVerticais = frenchDoor || sideBySide;
  const aberturaConfirmada = Boolean(angulo || anguloEsquerda || anguloDireita || larguraPortasAbertas || profundidadePortasAbertas || gavetas);
  const frontalConfirmada = Boolean(largura && altura);

  const cabecalho = (titulo, subtitulo, paginaManual, referenciaManual = "") => `
    <div class="vista-projeto-titulo">
      <div><strong>${titulo}</strong><span>${subtitulo}</span></div>
      <small>${paginaManual !== "—" ? `${paginaManual === "Fonte oficial" ? "Ficha oficial" : `Manual • pág. ${escaparHTML(paginaManual)}`}${referenciaManual ? ` • ref. ${escaparHTML(referenciaManual)}` : ""}` : "Cota não localizada"}</small>
    </div>`;

  const vistaSuperior = aberturaConfirmada ? `
    <svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica do refrigerador e abertura das portas">
      <defs>
        <marker id="seta-topo" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7z"></path></marker>
        <pattern id="hachura-parede" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12"></line></pattern>
      </defs>
      <g class="parede-planta"><rect x="58" y="30" width="404" height="20"></rect><text x="260" y="23">PAREDE / FUNDO DO NICHO</text></g>
      <g class="marcenaria-planta"><path d="M58 58H138V220H104M462 58H382V220H416"></path></g>
      <line class="eixo-tecnico" x1="260" y1="52" x2="260" y2="350"></line>
      <g class="produto-topo-tecnico">
        <rect x="138" y="68" width="244" height="152" rx="2"></rect>
        <line x1="138" y1="220" x2="382" y2="220"></line>
        <circle cx="138" cy="220" r="5"></circle><circle cx="382" cy="220" r="5"></circle>
      </g>
      ${duasPortasVerticais ? `
        <g class="portas-planta">
          <path d="M138 214 L77 314 L92 323 L153 223 Z"></path>
          <path d="M382 214 L443 314 L428 323 L367 223 Z"></path>
          <path class="arco-abertura" d="M260 220 A122 122 0 0 1 84 318"></path>
          <path class="arco-abertura" d="M260 220 A122 122 0 0 0 436 318"></path>
        </g>` : `
        <g class="portas-planta">
          <path d="M382 214 L443 314 L428 323 L367 223 Z"></path>
          <path class="arco-abertura" d="M138 220 A244 244 0 0 0 436 318"></path>
        </g>`}
      <g class="cotas-planta">
        <path d="M138 62V50M382 62V50"></path>
        <line x1="138" y1="56" x2="382" y2="56" marker-start="url(#seta-topo)" marker-end="url(#seta-topo)"></line>
        <text class="cota-valor" x="260" y="48">${escaparHTML(largura)}</text>
        <path d="M390 68H414M390 220H414"></path>
        <line x1="406" y1="68" x2="406" y2="220" marker-start="url(#seta-topo)" marker-end="url(#seta-topo)"></line>
        ${profundidadeVistaSuperior ? `<text class="cota-valor cota-profundidade" x="428" y="144">${escaparHTML(profundidadeVistaSuperior)}</text>` : ""}
        <path d="M77 328V360M443 328V360"></path>
        <line x1="77" y1="350" x2="443" y2="350" marker-start="url(#seta-topo)" marker-end="url(#seta-topo)"></line>
        ${larguraPortasAbertas ? `<text class="cota-valor" x="260" y="374">${escaparHTML(larguraPortasAbertas)}</text>` : ""}
        <text class="cota-legenda" x="260" y="391">largura total com portas abertas</text>
        <path d="M462 50H482M443 323H482"></path>
        <line x1="474" y1="50" x2="474" y2="323" marker-start="url(#seta-topo)" marker-end="url(#seta-topo)"></line>
        ${profundidadePortasAbertas ? `<text class="cota-valor cota-profundidade-aberta" x="494" y="186">${escaparHTML(profundidadePortasAbertas)}</text>` : ""}
      </g>
      ${sideBySide && (anguloEsquerda || anguloDireita) ? `
        <text class="angulo-porta" x="174" y="294">ESQ. ${escaparHTML(anguloEsquerda || "—")}</text>
        <text class="angulo-porta" x="346" y="294">DIR. ${escaparHTML(anguloDireita || "—")}</text>`
        : angulo ? `<text class="angulo-porta" x="260" y="302">ABERTURA ${escaparHTML(angulo)}</text>` : ""}
      <g class="legenda-pivos"><path d="M138 220l-26 15"></path><text x="108" y="245">dobradiça</text><path d="M382 220l26 15"></path><text x="412" y="245">dobradiça</text></g>
    </svg>` : (largura && profundidade ? `
    <svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista superior técnica fechada do refrigerador">
      <defs><marker id="seta-topo-fechado" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7z"></path></marker></defs>
      <g class="parede-planta"><rect x="70" y="42" width="380" height="18"></rect><text x="260" y="30">PAREDE / FUNDO</text></g>
      <rect class="produto-generico" x="142" y="92" width="236" height="190" rx="3"></rect>
      <line class="cota-tecnica" x1="142" y1="322" x2="378" y2="322" marker-start="url(#seta-topo-fechado)" marker-end="url(#seta-topo-fechado)"></line>
      <text class="cota-valor" x="260" y="350">${escaparHTML(largura)}</text><text class="cota-legenda" x="260" y="374">largura</text>
      <line class="cota-tecnica" x1="414" y1="92" x2="414" y2="282" marker-start="url(#seta-topo-fechado)" marker-end="url(#seta-topo-fechado)"></line>
      <text class="cota-valor cota-profundidade" x="440" y="187">${escaparHTML(profundidade)}</text>
      <text class="nota-nicho" x="260" y="302">VISTA FECHADA — ABERTURA AINDA NÃO CONFIRMADA</text>
    </svg>` : `
    <div class="vista-indisponivel"><span>—</span><strong>Abertura não localizada no manual</strong><p>O sistema não desenha o giro da porta sem ângulo ou distância confirmada.</p></div>`);

  return `
    <div class="vistas-projeto-grade">
      <section class="vista-projeto-card ${frontalConfirmada ? "" : "vista-pendente"}">
        ${cabecalho("Vista frontal", "Produto, nicho e folgas técnicas", paginaFrontal, referenciaFrontal)}
        ${frontalConfirmada ? `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Elevação frontal técnica do refrigerador">
          <defs><marker id="seta-frente" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7z"></path></marker></defs>
          <g class="nicho-tecnico"><path d="M154 48H370V328H154Z"></path><path d="M154 48l18-16h216v280l-18 16"></path><path d="M370 48l18-16M370 328l18-16"></path></g>
          <text class="nota-nicho" x="270" y="27">NICHO / MARCENARIA</text>
          <g class="produto-frontal">
            <rect x="176" y="70" width="172" height="246" rx="2"></rect>
            ${quatroPortas ? `<line x1="262" y1="70" x2="262" y2="316"></line><line x1="176" y1="210" x2="348" y2="210"></line><line x1="246" y1="105" x2="246" y2="184"></line><line x1="278" y1="105" x2="278" y2="184"></line><line x1="246" y1="232" x2="246" y2="292"></line><line x1="278" y1="232" x2="278" y2="292"></line>` : tresPortas ? `<line x1="262" y1="70" x2="262" y2="210"></line><line x1="176" y1="210" x2="348" y2="210"></line><line x1="246" y1="105" x2="246" y2="184"></line><line x1="278" y1="105" x2="278" y2="184"></line>` : sideBySide ? `<line x1="262" y1="70" x2="262" y2="316"></line><line x1="248" y1="112" x2="248" y2="246"></line><line x1="276" y1="112" x2="276" y2="246"></line>` : `<line x1="176" y1="118" x2="348" y2="118"></line><line x1="326" y1="142" x2="326" y2="250"></line>`}
          </g>
          <g class="linhas-extensao"><path d="M176 316V358M348 316V358M166 70H118M166 316H118"></path></g>
          <line class="cota-tecnica" x1="176" y1="350" x2="348" y2="350" marker-start="url(#seta-frente)" marker-end="url(#seta-frente)"></line>
          <text class="cota-valor" x="262" y="376">${escaparHTML(largura)}</text>
          <line class="cota-tecnica" x1="126" y1="70" x2="126" y2="316" marker-start="url(#seta-frente)" marker-end="url(#seta-frente)"></line>
          <text class="cota-valor cota-altura" x="96" y="193">${escaparHTML(altura)}</text>
          <g class="chamadas-tecnicas">
            ${superior ? `<path d="M348 70H400"></path><text x="406" y="66">Folga superior</text><text class="destaque" x="406" y="82">${escaparHTML(superior)}</text>` : ""}
            ${(sideBySide ? lateralDireita : lateral) ? `<path d="M348 174H400"></path><text x="406" y="170">${sideBySide ? "Folga dir." : "Folga lateral"}</text><text class="destaque" x="406" y="186">${escaparHTML(sideBySide ? lateralDireita : lateral)}</text>` : ""}
            ${sideBySide && lateralEsquerda ? `<path d="M176 174H132"></path><text x="42" y="170">Folga esq.</text><text class="destaque" x="42" y="186">${escaparHTML(lateralEsquerda)}</text>` : ""}
            ${profundidade ? `<path d="M348 290l50 25"></path><text x="404" y="312">Profundidade</text><text class="destaque" x="404" y="328">${escaparHTML(profundidade)}</text>` : ""}
            ${traseira ? `<path d="M176 300l-38 24"></path><text x="44" y="335">Folga traseira: ${escaparHTML(traseira)}</text>` : ""}
          </g>
        </svg>` : `<div class="vista-indisponivel"><span>—</span><strong>Vista frontal aguardando cotas</strong><p>Largura e altura precisam estar confirmadas no manual antes de gerar o desenho.</p></div>`}
      </section>
      <section class="vista-projeto-card ${largura && profundidade ? "" : "vista-pendente"}">
        ${cabecalho("Vista superior", sideBySide ? "Abertura independente das portas" : `Abertura${gavetas ? ` — gavetas: ${escaparHTML(gavetas)}` : ""}`, paginaSuperior, referenciaSuperior)}
        ${vistaSuperior}
      </section>
      <section class="vista-projeto-card ${altura && profundidade ? "" : "vista-pendente"}">
        ${cabecalho("Vista lateral", "Profundidade total e profundidade do gabinete", paginaLateral, referenciaLateral)}
        ${altura && profundidade ? `<svg class="vista-tecnica-svg" viewBox="0 0 520 410" role="img" aria-label="Vista lateral técnica do refrigerador">
          <defs><marker id="seta-lateral" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7z"></path></marker></defs>
          <g class="produto-frontal"><rect x="150" y="58" width="218" height="250" rx="2"></rect><line x1="150" y1="190" x2="368" y2="190"></line></g>
          ${profundidadeGabinete ? `<line class="eixo-tecnico" x1="336" y1="58" x2="336" y2="308"></line><text class="nota-nicho" x="276" y="88">GABINETE ${escaparHTML(profundidadeGabinete)}</text>` : ""}
          <line class="cota-tecnica" x1="150" y1="350" x2="368" y2="350" marker-start="url(#seta-lateral)" marker-end="url(#seta-lateral)"></line>
          <text class="cota-valor" x="259" y="378">${escaparHTML(profundidade)}</text>
          <line class="cota-tecnica" x1="112" y1="58" x2="112" y2="308" marker-start="url(#seta-lateral)" marker-end="url(#seta-lateral)"></line>
          <text class="cota-valor cota-altura" x="82" y="183">${escaparHTML(altura)}</text>
        </svg>` : `<div class="vista-indisponivel"><span>—</span><strong>Vista lateral aguardando cotas</strong><p>Altura e profundidade precisam estar confirmadas.</p></div>`}
      </section>
    </div>`;
}

function obterDimensoesParaBlocagem(produto = {}) {
  const dimensoesCadastradas = produto.dimensoes || {};
  if (dimensoesCadastradas.evaporadora || dimensoesCadastradas.condensadora) return dimensoesCadastradas;
  const grupoCadastrado = dimensoesCadastradas.produto || dimensoesCadastradas;
  const possuiDimensoesCadastradas = [
    grupoCadastrado.largura,
    grupoCadastrado.altura,
    grupoCadastrado.profundidade
  ].some(valor => valor !== undefined && valor !== null && String(valor).trim() !== "");

  if (possuiDimensoesCadastradas) return dimensoesCadastradas;

  const dimensoesConfirmadas = obterDimensoesConfirmadasProduto(produto);
  const largura = dimensoesConfirmadas.largura?.valor || "";
  const altura = dimensoesConfirmadas.altura?.valor || "";
  const profundidade = dimensoesConfirmadas.profundidade?.valor || "";
  const peso = produto.especificacoes?.["Peso líquido"] || produto.especificacoes?.Peso || "";

  return {
    produto: { largura, altura, profundidade, peso }
  };
}

function mostrarDetalhes(idProduto, interacaoDoUsuario = false) {
  const produto = todosProdutos.find(item => String(item.id) === String(idProduto));
  if (!produto) return;

  produtoSelecionado = produto.id;
  renderizarProdutos(produtosFiltrados);

  requestAnimationFrame(() => {
    const selecionado = document.querySelector(
      `.produto[data-produto-id="${CSS.escape(String(produto.id))}"]`
    );
    selecionado?.scrollIntoView({ behavior: "auto", block: "nearest" });
  });

  const destaques = criarDestaques(produto.destaques);
  const especificacoes = criarEspecificacoes(produto.especificacoes);
  const ehPortatil = ehProdutoPortatil(produto);
  
  // A blocagem usa primeiro as dimensões do cadastro e, quando elas estiverem
  // vazias, reaproveita somente medidas confirmadas extraídas do manual.
  const dimensoesFonte = obterDimensoesParaBlocagem(produto);
  const geradorBlocagem = window.criarBlocagemDimensional;
  const dimensoes = ehPortatil
    ? criarDimensoesCompactasPortatil(produto)
    : (typeof geradorBlocagem === "function"
        ? geradorBlocagem(dimensoesFonte, produto)
        : criarDimensoes(dimensoesFonte, produto));
  const ehClima = normalizarTexto(produto.segmento || produto.categoria).includes("climatizacao");
  const exibirMedidasProjeto = !ehPortatil && (ehClima || produtoPossuiVistaTecnica(produto));
  const geradorVistasClima = window.criarVistasClimatizacao;
  const medidasProjeto = ehClima
    ? (typeof geradorVistasClima === "function"
        ? geradorVistasClima(dimensoesFonte, produto)
        : dimensoes)
    : exibirMedidasProjeto
      ? criarMedidasProjeto(produto, dimensoes)
      : "";
    
  const documentos = criarDocumentos(produto.documentos);
  const painelMarcaPortatil = ehPortatil ? criarPainelMarcaPortatil(produto) : "";
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

  const favs = getFavoritos();
  const estaFavoritado = favs.some(item => String(item.id) === String(produto.id));

  // NOVA LÓGICA: Montar a Tabela da IA de forma independente
  const ia = produto.medidasIA;
  const tabelaIA = !ehPortatil && ia && !produto.medidasProjeto ? `
    <div style="margin-top: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #eee;">
      <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 14px; text-transform: uppercase; color: #111;">Especificações de Instalação (Manuais Oficiais)</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr style="border-bottom: 1px solid #e4e0d9;">
          <td style="padding: 10px 0; font-weight: 600; color: #444;">Medidas do Nicho (L x A)</td>
          <td style="padding: 10px 0; text-align: right;">${escaparHTML(ia.nicho_largura || '-')} x ${escaparHTML(ia.nicho_altura || '-')}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e4e0d9;">
          <td style="padding: 10px 0; font-weight: 600; color: #444;">Respiro Lateral (Mínimo)</td>
          <td style="padding: 10px 0; text-align: right; color: #e52633;">${escaparHTML(ia.respiro_lateral || '-')}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e4e0d9;">
          <td style="padding: 10px 0; font-weight: 600; color: #444;">Respiro Superior (Mínimo)</td>
          <td style="padding: 10px 0; text-align: right; color: #e52633;">${escaparHTML(ia.respiro_superior || '-')}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: 600; color: #444;">Respiro Traseiro</td>
          <td style="padding: 10px 0; text-align: right; color: #e52633;">${escaparHTML(ia.respiro_traseiro || '-')}</td>
        </tr>
      </table>
      <div style="margin-top: 10px; font-size: 11px; color: #999; text-align: right;">
        Informações técnicas extraídas por IA a partir do manual oficial.
      </div>
    </div>
  ` : '';

  document.getElementById("detalhes").innerHTML = `
    <button type="button" class="voltar-produtos" id="voltarProdutos">← Voltar aos produtos</button>
    <div class="produto-hero">
      <div class="produto-resumo">
        <span class="badge">${escaparHTML(produto.categoria || produto.segmento || "")}</span>
        <h1 class="nome-produto">${escaparHTML(produto.nome)}</h1>
        <p class="subtitulo produto-identificacao">${escaparHTML(produto.marca || produto.fabricante || "")} <span aria-hidden="true">•</span> Modelo ${escaparHTML(produto.modelo)}</p>
        ${produto.revisaoPendente ? '<p class="texto-tecnico">Cadastro com pendências. Veja os detalhes em Downloads.</p>' : ""}
        <p class="codigo-produto">Código Info Store: <strong>${escaparHTML(produto.codigoInfo || "Consultar")}</strong></p>
        
        ${destaques ? `<div class="destaques">${destaques}</div>` : ""}
        
        <div class="acoes">
          ${botaoInfoStore}
          <button type="button" id="btn-favoritar-detalhe" class="botao-secundario ${estaFavoritado ? "ativo" : ""}" data-id="${escaparHTML(produto.id)}">
            ${estaFavoritado ? "★ Remover dos favoritos" : "♡ Adicionar aos favoritos"}
          </button>
        </div>
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
        <button type="button" class="tab ativo" data-tab="especificacoes">Especificações</button>
                ${exibirMedidasProjeto ? `<button type="button" class="tab" data-tab="dimensoes">Medidas para projeto ${ehClima ? "" : '<span class="tab-selo-ia">IA</span>'}</button>` : ""}
        ${ehPortatil ? `<button type="button" class="tab" data-tab="marca">Marca</button>` : `<button type="button" class="tab" data-tab="documentos">Downloads</button>`}
      </nav>

      <section class="painel-tab ativo" id="painel-especificacoes">
        <div class="grade-tecnica">
          <div class="tabela-especificacoes">${especificacoes}</div>
          <div>
            <div class="card-dimensoes ${ehPortatil ? "card-dimensoes-portatil" : ""}">
              <h3 class="dimensoes-subtitulo">${ehPortatil ? "Medidas do produto" : "Dimensões"}</h3>
              ${dimensoes}
            </div>
            ${tabelaIA}
            ${ehPortatil ? criarAvisoPortatil() : criarAviso()}
          </div>
        </div>
      </section>


      ${exibirMedidasProjeto ? `<section class="painel-tab" id="painel-dimensoes">${medidasProjeto}</section>` : ""}

      ${ehPortatil ? `<section class="painel-tab" id="painel-marca">${painelMarcaPortatil}</section>` : `<section class="painel-tab" id="painel-documentos">
        <div class="card-documentos">
          <h3 class="dimensoes-subtitulo">Documentos e Manuais</h3>
          ${ehClima && produto.pendencias?.length ? `<p class="texto-tecnico">Pendências deste produto: ${escaparHTML(produto.pendencias.join("; "))}.</p>` : ""}
          <div class="lista-documentos">${documentos}</div>
        </div>
      </section>`}
    </div>`;

  configurarAbas();
  configurarGaleria();
  document.getElementById("voltarProdutos")?.addEventListener("click", () => {
    document.querySelector(".sidebar").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    document.getElementById("alternarFiltrosLateral")?.focus({ preventScroll: true });
  });
  configurarFallbackImagens(document.getElementById("detalhes"));

  if (interacaoDoUsuario && window.matchMedia("(max-width: 1100px), (hover: none) and (pointer: coarse) and (max-width: 1400px)").matches) {
    requestAnimationFrame(() => {
      document.getElementById("detalhes").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
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
  try {
    const destino = new URL(url);
    if (destino.protocol !== "https:" || !/^(www\.)?infostore\.com\.br$/.test(destino.hostname) || !/\/p$/.test(destino.pathname)) return "";
  } catch { return ""; }
  return `<a href="${escaparHTML(url)}" target="_blank" rel="noopener noreferrer" class="botao-preto">Ver na Info Store ↗</a>`;
}

function criarDestaques(destaques = []) {
  const lista = Array.isArray(destaques) ? destaques : [];
  const possuiCapacidadePrincipal = lista.some(item => {
    if (!item || (!item.titulo && !item.valor)) return false;
    return normalizarTexto(item.rotulo || "").trim() === "capacidade";
  });

  return lista
    .filter(item => {
      if (!item || (!item.titulo && !item.valor)) return false;
      const valor = String(item.titulo || item.valor).trim();
      if (valor.length > 48) return false;

      const rotulo = normalizarTexto(item.rotulo || "");
      if (rotulo.includes("temperatura")) {
        return valorTemperaturaValido(valor);
      }

      if (rotulo.trim() === "capacidade total" && possuiCapacidadePrincipal) return false;

      return true;
    })
    .slice(0, 5)
    .map(item => {
      const valor = String(item.titulo || item.valor).trim();
      const rotulo = item.rotulo || "";
      const icone = criarIconeDestaque(rotulo, valor);

      return `
        <div class="destaque" title="${escaparHTML(valor)}">
          <span class="destaque-icone" aria-hidden="true">${icone}</span>
          <div class="destaque-texto">
            ${rotulo ? `<strong class="destaque-rotulo">${escaparHTML(rotulo)}</strong>` : ""}
            <span class="destaque-valor">${escaparHTML(valor)}</span>
          </div>
        </div>`;
    }).join("");
}

function valorTemperaturaValido(valor = "") {
  const texto = String(valor)
    .replace(/\u00a0/g, " ")
    .trim();

  if (!texto || texto.length > 48) return false;

  return /(?:[-+]?\d+(?:[.,]\d+)?\s*(?:°|º)\s*[cf]\b)|(?:[-+]?\d+(?:[.,]\d+)?\s*(?:graus?|celsius|fahrenheit)\b)/i.test(texto);
}

function criarIconeDestaque(rotulo = "", valor = "") {
  const texto = normalizarTexto(`${rotulo} ${valor}`);

  if (texto.includes("capacidade") || texto.includes("litro") || texto.includes(" kg")) {
    return `<svg viewBox="0 0 24 24"><path d="M5 7h14v13H5z"></path><path d="M8 7V4h8v3"></path></svg>`;
  }
  if (texto.includes("voltagem") || texto.includes("127") || texto.includes("220") || texto.includes("bivolt")) {
    return `<svg viewBox="0 0 24 24"><path d="M13 2 6 13h6l-1 9 7-12h-6z"></path></svg>`;
  }
  if (texto.includes("cor") || texto.includes("inox") || texto.includes("preto") || texto.includes("branco")) {
    return `<svg viewBox="0 0 24 24"><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"></path></svg>`;
  }
  if (texto.includes("frost") || texto.includes("refrigeração") || texto.includes("refrigeracao")) {
    return `<svg viewBox="0 0 24 24"><path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5l-15.6 11"></path><path d="m9 4 3 3 3-3M9 20l3-3 3 3"></path></svg>`;
  }
  if (texto.includes("smartthings") || texto.includes("wi-fi") || texto.includes("wifi") || texto.includes("mobile")) {
    return `<svg viewBox="0 0 24 24"><path d="M5 9a10 10 0 0 1 14 0"></path><path d="M8 12a6 6 0 0 1 8 0"></path><path d="M10.8 15a2 2 0 0 1 2.4 0"></path><circle cx="12" cy="18" r="1"></circle></svg>`;
  }
  if (texto.includes("crystal") || texto.includes("uhd") || texto.includes("qled") || texto.includes("neo qled") || texto.includes("oled")) {
    return `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>`;
  }
  if (texto.includes("120hz") || texto.includes("144hz") || texto.includes("frequência") || texto.includes("frequencia")) {
    return `<svg viewBox="0 0 24 24"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9"></path><path d="M5.5 15A7 7 0 0 0 18 17.5l2-2.5"></path></svg>`;
  }
  if (texto.includes("gaming") || texto.includes("game") || texto.includes("motion xcelerator")) {
    return `<svg viewBox="0 0 24 24"><path d="M8 8h8a5 5 0 0 1 4.7 6.7l-1 3a2 2 0 0 1-3.3.8L14 16h-4l-2.4 2.5a2 2 0 0 1-3.3-.8l-1-3A5 5 0 0 1 8 8z"></path><path d="M7 12v4M5 14h4"></path><circle cx="16" cy="13" r=".7"></circle><circle cx="18" cy="15" r=".7"></circle></svg>`;
  }
  if (texto.includes("upscaling") || texto.includes("4k") || texto.includes("8k")) {
    return `<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path><path d="M3 8l5-5M21 8l-5-5M3 16l5 5M21 16l-5 5"></path></svg>`;
  }
  if (texto.includes("tizen") || texto.includes("sistema operacional")) {
    return `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect></svg>`;
  }
  return `<svg viewBox="0 0 24 24"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"></path><path d="M18.5 16l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z"></path></svg>`;
}

function criarEspecificacoes(especificacoes = {}) {
  const dados = especificacoes && typeof especificacoes === "object" && !Array.isArray(especificacoes)
    ? especificacoes
    : {};
  const itens = Object.entries(dados).filter(([, valor]) => valor !== "" && valor != null);
  if (!itens.length) return estadoMensagem("Especificações ainda não cadastradas.");
  return itens.map(([titulo, valor]) => `
    <div class="linha-especificacao"><span>${escaparHTML(titulo)}</span><span>${escaparHTML(valor)}</span></div>`).join("");
}

function criarDimensoes(dimensoes = {}, produto = {}) {
  const textoProduto = normalizarTexto(
    [produto.nome, produto.modelo, produto.categoria, produto.segmento].filter(Boolean).join(" ")
  );
  const categoriaProduto = normalizarTexto(produto.categoria || produto.segmento || "");
  const modeloProduto = normalizarTexto(produto.modelo || "");
  
  const ehTV = categoriaProduto === "video" || textoProduto.startsWith("tv ") || textoProduto.includes(" tv ") || textoProduto.includes("televisor");
  const ehCooktop = textoProduto.includes("cooktop");
  const ehFogao = textoProduto.startsWith("fog ") || textoProduto.includes(" fog ") || textoProduto.includes("fogao") || modeloProduto.startsWith("nsg");
  const ehMicroondas = /micro[- ]?ondas|microondas/.test(textoProduto) || /^(mg|ms|mc)/.test(modeloProduto);
  const ehForno = !ehMicroondas && textoProduto.includes("forno");
  const ehLavadora = textoProduto.includes("lava e seca") || textoProduto.includes("lavadora") || textoProduto.includes("maquina de lavar") || textoProduto.includes("maq lav") || textoProduto.includes("lav roupa") || modeloProduto.startsWith("ww") || modeloProduto.startsWith("wd");
  const ehLavaLoucas = textoProduto.includes("lava loucas") || textoProduto.includes("lava-loucas") || textoProduto.includes("lava louca") || modeloProduto.startsWith("dw");
  const ehFreezerHorizontal = /freezer horizontal|freezer chest|horizontal freezer/.test(textoProduto);
  const ehFreezerVertical = !ehFreezerHorizontal && /freezer vertical|freezer/.test(textoProduto);
  const ehFrigobar = /frigobar|mini ?bar|minibar/.test(textoProduto);
  const ehAdegaCervejeira = /adega|cervejeira|wine cooler|beer center/.test(textoProduto);
  const ehQuatroPortas = /4 portas|quatro portas|iq8|multidoor|multi door/.test(textoProduto);
  const ehTresPortas = !ehQuatroPortas && /3 portas|tres portas|im7|im8/.test(textoProduto);
  const ehSideBySide = !ehQuatroPortas && !ehTresPortas && /side by side|side-by-side|rs58|rs60/.test(textoProduto);

  const medidas = dimensoes.produto || dimensoes.semBase || dimensoes.semEmbalagem || dimensoes.comBase || {};

  function buscarMedida(nomes = []) {
    const entrada = Object.entries(medidas).find(([nome]) => nomes.includes(normalizarTexto(nome)));
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
  const profundidade = buscarMedida(["profundidade", "depth"]);
  const peso = medidas.peso || dimensoes.peso || produto.especificacoes?.["Peso líquido"] || produto.especificacoes?.["Peso"] || "";

  if (!largura && !altura && !profundidade) {
    return `<p class="texto-tecnico">Dimensões em revisão.</p>`;
  }

  let formaProduto = "";

  if (ehTV) {
    formaProduto = `<g class="forma-produto forma-tv"><rect x="25" y="46" width="165" height="98" rx="3"></rect><rect x="33" y="54" width="149" height="82" rx="1" class="tela-tv"></rect><path d="M190 46 L198 52 L198 138 L190 144"></path></g>`;
  } else if (ehCooktop) {
    formaProduto = `<g class="forma-produto forma-cooktop">
      <defs>
        <!-- O recorte impede que qualquer queimador ultrapasse a mesa. -->
        <clipPath id="recorte-mesa-cooktop">
          <path d="M31 76 L150 43 L199 74 L80 108 Z"></path>
        </clipPath>
      </defs>

      <!-- mesa e corpo embutido em projeção axonométrica -->
      <path d="M31 76 L150 43 L199 74 L80 108 Z"></path>
      <path d="M80 108 L199 74 L199 89 L80 123 Z"></path>
      <path d="M31 76 L80 108 L80 123 L31 91 Z"></path>

      <!-- cinco queimadores concêntricos, distribuídos como na referência -->
      <g class="queimadores-cooktop" clip-path="url(#recorte-mesa-cooktop)">
        <!-- traseiro esquerdo -->
        <ellipse cx="78" cy="73" rx="13" ry="7"></ellipse>
        <ellipse cx="78" cy="73" rx="7" ry="3.8"></ellipse>

        <!-- traseiro direito -->
        <ellipse cx="143" cy="56" rx="12" ry="6.5"></ellipse>
        <ellipse cx="143" cy="56" rx="6.2" ry="3.4"></ellipse>

        <!-- central, maior -->
        <ellipse cx="118" cy="75" rx="18" ry="10"></ellipse>
        <ellipse cx="118" cy="75" rx="12" ry="6.5"></ellipse>
        <ellipse cx="118" cy="75" rx="6" ry="3.2"></ellipse>

        <!-- dianteiro esquerdo -->
        <ellipse cx="91" cy="92" rx="12" ry="6.5"></ellipse>
        <ellipse cx="91" cy="92" rx="6.2" ry="3.4"></ellipse>

        <!-- dianteiro direito -->
        <ellipse cx="163" cy="73" rx="12" ry="6.5"></ellipse>
        <ellipse cx="163" cy="73" rx="6.2" ry="3.4"></ellipse>

        <!-- comandos alinhados na faixa frontal da mesa -->
        <ellipse cx="126" cy="94" rx="2.5" ry="1.6"></ellipse>
        <ellipse cx="137" cy="91" rx="2.5" ry="1.6"></ellipse>
        <ellipse cx="148" cy="88" rx="2.5" ry="1.6"></ellipse>
        <ellipse cx="159" cy="85" rx="2.5" ry="1.6"></ellipse>
        <ellipse cx="170" cy="82" rx="2.5" ry="1.6"></ellipse>
      </g>
    </g>`;
  } else if (ehFogao) {
    formaProduto = `<g class="forma-produto forma-fogao"><rect x="55" y="47" width="110" height="137" rx="3"></rect><path d="M55 47 L151 47 L174 62 L76 62 Z"></path><rect x="61" y="63" width="98" height="25" rx="2"></rect><circle cx="74" cy="75" r="4"></circle><circle cx="89" cy="75" r="4"></circle><circle cx="131" cy="75" r="4"></circle><circle cx="146" cy="75" r="4"></circle><rect x="98" y="70" width="23" height="10" rx="1"></rect><rect x="66" y="98" width="88" height="66" rx="2"></rect><line x1="75" y1="108" x2="145" y2="108"></line><path d="M165 70 L174 62 L174 169 L165 184"></path><line x1="68" y1="184" x2="68" y2="190"></line><line x1="151" y1="184" x2="151" y2="190"></line></g>`;
  } else if (ehMicroondas) {
    formaProduto = `<g class="forma-produto forma-microondas">
      <rect x="34" y="65" width="139" height="91" rx="4"></rect>
      <path d="M34 65 L49 53 L188 53 L173 65 Z"></path>
      <path d="M173 65 L188 53 L188 143 L173 156 Z"></path>
      <rect x="43" y="75" width="96" height="69" rx="3" class="porta-vidro"></rect>
      <rect x="48" y="80" width="86" height="59" rx="2"></rect>
      <line x1="143" y1="75" x2="143" y2="144"></line>
      <rect x="149" y="81" width="18" height="9" rx="1"></rect>
      <circle cx="158" cy="102" r="3"></circle>
      <circle cx="158" cy="115" r="3"></circle>
      <circle cx="158" cy="128" r="3"></circle>
      <line x1="52" y1="70" x2="132" y2="70"></line>
    </g>`;
  } else if (ehForno) {
    formaProduto = `<g class="forma-produto forma-forno"><rect x="55" y="38" width="104" height="142" rx="3"></rect><rect x="64" y="72" width="86" height="86" rx="2"></rect><line x1="64" y1="61" x2="150" y2="61"></line><circle cx="75" cy="50" r="3"></circle><circle cx="88" cy="50" r="3"></circle><path d="M159 38 L174 49 L174 168 L159 180"></path></g>`;
  } else if (ehLavadora) {
    formaProduto = `<g class="forma-produto forma-lavadora"><rect x="58" y="29" width="101" height="156" rx="4"></rect><line x1="58" y1="59" x2="159" y2="59"></line><circle cx="108" cy="119" r="36"></circle><circle cx="108" cy="119" r="27"></circle><rect x="70" y="40" width="36" height="8" rx="1"></rect><circle cx="142" cy="45" r="5"></circle><path d="M159 29 L174 40 L174 173 L159 185"></path></g>`;
  } else if (ehLavaLoucas) {
    formaProduto = `<g class="forma-produto forma-lava-loucas"><rect x="58" y="29" width="101" height="156" rx="3"></rect><line x1="58" y1="59" x2="159" y2="59"></line><line x1="72" y1="46" x2="145" y2="46"></line><rect x="75" y="70" width="66" height="4" rx="2"></rect><path d="M159 29 L174 40 L174 173 L159 185"></path></g>`;
  } else if (ehFreezerHorizontal) {
    formaProduto = `<g class="forma-produto forma-freezer-horizontal"><rect x="28" y="86" width="153" height="82" rx="4"></rect><path d="M28 86 L44 70 L196 70 L181 86 Z"></path><path d="M181 86 L196 70 L196 151 L181 168 Z"></path><line x1="44" y1="76" x2="178" y2="76"></line><line x1="37" y1="168" x2="37" y2="177"></line><line x1="172" y1="168" x2="172" y2="177"></line></g>`;
  } else if (ehFrigobar || ehAdegaCervejeira || ehFreezerVertical) {
    formaProduto = `<g class="forma-produto forma-porta-unica"><rect x="68" y="22" width="79" height="166" rx="3"></rect><path d="M147 22 L164 35 L164 176 L147 188"></path><line x1="136" y1="54" x2="136" y2="119"></line>${ehAdegaCervejeira ? `<rect class="porta-vidro" x="76" y="36" width="63" height="137" rx="2"></rect><line x1="82" y1="62" x2="133" y2="62"></line><line x1="82" y1="86" x2="133" y2="86"></line><line x1="82" y1="110" x2="133" y2="110"></line><line x1="82" y1="134" x2="133" y2="134"></line>` : ""}</g>`;
  } else if (ehQuatroPortas) {
    formaProduto = `<g class="forma-produto forma-geladeira-quatro-portas"><rect x="52" y="22" width="108" height="166" rx="3"></rect><path d="M160 22 L176 35 L176 176 L160 188"></path><line x1="106" y1="22" x2="106" y2="188"></line><line x1="52" y1="108" x2="160" y2="108"></line><line x1="96" y1="48" x2="96" y2="91"></line><line x1="116" y1="48" x2="116" y2="91"></line><line x1="96" y1="123" x2="96" y2="165"></line><line x1="116" y1="123" x2="116" y2="165"></line></g>`;
  } else if (ehTresPortas) {
    formaProduto = `<g class="forma-produto forma-geladeira-tres-portas"><rect x="52" y="22" width="108" height="166" rx="3"></rect><path d="M160 22 L176 35 L176 176 L160 188"></path><line x1="106" y1="22" x2="106" y2="111"></line><line x1="52" y1="111" x2="160" y2="111"></line><line x1="96" y1="48" x2="96" y2="91"></line><line x1="116" y1="48" x2="116" y2="91"></line><line x1="72" y1="127" x2="140" y2="127"></line></g>`;
  } else if (ehSideBySide) {
    formaProduto = `<g class="forma-produto forma-geladeira-side-by-side"><rect x="52" y="22" width="108" height="166" rx="3"></rect><path d="M160 22 L176 35 L176 176 L160 188"></path><line x1="106" y1="22" x2="106" y2="188"></line><line x1="96" y1="48" x2="96" y2="156"></line><line x1="116" y1="48" x2="116" y2="156"></line></g>`;
  } else {
    formaProduto = `<g class="forma-produto forma-geladeira"><rect x="68" y="22" width="79" height="166" rx="3"></rect><path d="M147 22 L164 35 L164 176 L147 188"></path><line x1="68" y1="106" x2="147" y2="106"></line><line x1="136" y1="48" x2="136" y2="91"></line><line x1="136" y1="119" x2="136" y2="156"></line></g>`;
  }

  // Verifica se o JSON já possui as medidas executivas extraídas previamente pela IA
  const ia = produto.medidasIA;
  const tabelaIA = ia ? `
    <div style="margin-top: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #eee;">
      <h4 class="dimensoes-subtitulo" style="margin-top: 0; margin-bottom: 15px; font-size: 14px; text-transform: uppercase; color: #111;">Especificações de Instalação (Manuais Oficiais)</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr style="border-bottom: 1px solid #e4e0d9;">
          <td style="padding: 10px 0; font-weight: 600; color: #444;">Medidas do Nicho (L x A)</td>
          <td style="padding: 10px 0; text-align: right;">${escaparHTML(ia.nicho_largura || '-')} x ${escaparHTML(ia.nicho_altura || '-')}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e4e0d9;">
          <td style="padding: 10px 0; font-weight: 600; color: #444;">Respiro Lateral (Mínimo)</td>
          <td style="padding: 10px 0; text-align: right; color: #e52633;">${escaparHTML(ia.respiro_lateral || '-')}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e4e0d9;">
          <td style="padding: 10px 0; font-weight: 600; color: #444;">Respiro Superior (Mínimo)</td>
          <td style="padding: 10px 0; text-align: right; color: #e52633;">${escaparHTML(ia.respiro_superior || '-')}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: 600; color: #444;">Respiro Traseiro</td>
          <td style="padding: 10px 0; text-align: right; color: #e52633;">${escaparHTML(ia.respiro_traseiro || '-')}</td>
        </tr>
      </table>
      <div style="margin-top: 10px; font-size: 11px; color: #999; text-align: right;">
        Informações técnicas extraídas por IA a partir do manual oficial.
      </div>
    </div>
  ` : '';

  return `
    <div class="dimensoes-tecnicas">
      <div class="desenho-dimensoes">
        <svg class="diagrama-produto" viewBox="0 0 230 225" role="img" aria-label="Representação dimensional de ${escaparHTML(produto.nome)}">
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
        <h4 class="dimensoes-subtitulo">Dimensões do projeto</h4>
        ${criarLinha("Largura (A)", largura)}
        ${criarLinha("Altura (B)", altura)}
        ${criarLinha("Profundidade (C)", profundidade)}
        ${peso ? `<div class="peso-produto"><strong>Peso:</strong> ${escaparHTML(peso)}</div>` : ""}
      </div>
    </div>
    ${tabelaIA}
  `;
}

function urlDocumentoPermitida(url = "") {
  const valor = String(url || "").trim();
  if (!valor) return false;

  // Arquivos locais gerados/indexados pelo próprio catálogo.
  if (/^(assets|manuais-oficiais)\//.test(valor)) {
    return !valor.split("/").includes("..") && !/[\\]/.test(valor);
  }

  // Manuais oficiais externos: aceita somente HTTPS.
  // Query string e hash são permitidos porque alguns fabricantes usam esses
  // parâmetros nos links oficiais de download.
  try {
    const destino = new URL(valor);
    return destino.protocol === "https:" && !destino.username && !destino.password;
  } catch {
    return false;
  }
}

function urlDocumentoExibicao(documento = {}) {
  // O catálogo pode manter uma cópia local para leitura técnica/offline,
  // mas o usuário deve abrir a fonte oficial online sempre que disponível.
  const oficial = String(documento.urlOriginal || "").trim();
  if (urlDocumentoPermitida(oficial)) return oficial;
  return String(documento.url || "").trim();
}

function criarDocumentos(documentos = []) {
  const lista = Array.isArray(documentos) ? documentos : [];
  const validos = lista
    .map(documento => ({ ...documento, urlExibicao: urlDocumentoExibicao(documento) }))
    .filter(documento =>
      documento &&
      documento.nome &&
      urlDocumentoPermitida(documento.urlExibicao)
    );

  if (!validos.length) {
    return `<p class="texto-tecnico">Nenhum documento disponível no momento.</p>`;
  }

  return validos.map(documento => `
    <a href="${escaparHTML(documento.urlExibicao)}" target="_blank" rel="noopener noreferrer" class="documento-link">
      <span class="documento-informacoes">
        <strong>${escaparHTML(documento.nome)}</strong>
        <small>${escaparHTML(documento.descricao || "Documento oficial do fabricante")}</small>
      </span>
      <span class="documento-acao">Abrir PDF ↗</span>
    </a>`).join("");
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

function getFavoritos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function localizarProdutoAtual(item = {}) {
  const id = String(item.id || "").trim();
  const modelo = normalizarTexto(item.modelo || "");
  const codigo = normalizarTexto(item.codigo || item.codigoInfo || "");

  return todosProdutos.find(produto => {
    const mesmoId = id && String(produto.id) === id;
    const mesmoModelo = modelo && normalizarTexto(produto.modelo || "") === modelo;
    const mesmoCodigo = codigo && normalizarTexto(produto.codigoInfo || "") === codigo;
    return mesmoId || mesmoModelo || mesmoCodigo;
  });
}

function obterFavoritosAtualizados() {
  return getFavoritos().map(item => {
    const produtoAtual = localizarProdutoAtual(item);
    if (!produtoAtual) return item;

    return {
      ...normalizarProdutoParaFavorito(produtoAtual),
      quantidade: Math.max(1, Number(item.quantidade) || 1)
    };
  });
}

function sincronizarFavoritosComCatalogo() {
  const atuais = getFavoritos();
  if (!atuais.length || !todosProdutos.length) return;

  const atualizados = obterFavoritosAtualizados();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizados));
  atualizarInterfaceFavoritos();
}

function saveFavoritos(favs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  atualizarInterfaceFavoritos();
}

function toggleFavorito(produto) {
  let favs = getFavoritos();
  const index = favs.findIndex(item => String(item.id) === String(produto.id));

  if (index >= 0) {
    favs.splice(index, 1);
  } else {
    favs.push(produto);
  }

  saveFavoritos(favs);
}

function normalizarProdutoParaFavorito(produto) {
  return {
    id: String(produto.id),
    nome: produto.nome,
    fabricante: produto.marca || produto.fabricante || "Info Store",
    modelo: produto.modelo || "-",
    codigo: produto.codigoInfo || "-",
    imagem: produto.imagem || IMAGEM_FALLBACK,
    quantidade: 1
  };
}

function atualizarInterfaceFavoritos() {
  const favs = getFavoritos();
  
  const badge = document.getElementById("fav-contador");
  if (badge) badge.innerText = favs.length;

  const btnAdd = document.getElementById("btn-favoritar-detalhe");
  if (btnAdd) {
    const atualId = String(btnAdd.getAttribute("data-id"));
    const estaSalvo = favs.some(item => String(item.id) === atualId);
    btnAdd.classList.toggle("ativo", estaSalvo);
    btnAdd.innerHTML = estaSalvo ? "★ Remover dos favoritos" : "♡ Adicionar aos favoritos";
  }

  document.querySelectorAll(".produto-favorito").forEach(el => {
    const pId = String(el.getAttribute("data-favorito-id"));
    const estaSalvo = favs.some(item => String(item.id) === pId);
    el.textContent = estaSalvo ? "★" : "☆";
  });

  renderDrawerFavoritos(favs);
}

function renderDrawerFavoritos(favs) {
  const container = document.getElementById("lista-favoritos");
  const footer = document.getElementById("drawer-footer");
  if (!container) return;

  if (favs.length === 0) {
    if (footer) footer.style.display = "none";
    container.innerHTML = `
      <div style="padding: 40px 15px; text-align: center; color: var(--suave); font-size: 12px; line-height: 1.6;">
        Nenhum produto selecionado para o projeto ainda.
      </div>`;
    return;
  }

  if (footer) footer.style.display = "block";

  container.innerHTML = favs.map(item => `
    <div class="item-fav" data-id="${escaparHTML(item.id)}">
      <img src="${escaparHTML(item.imagem)}" alt="${escaparHTML(item.nome)}" />
      <div class="item-info">
        <h4>${escaparHTML(item.nome)}</h4>
        <span style="display: block; font-size: 11px; color: var(--dourado); font-weight: 600; margin: 2px 0;">
          ${escaparHTML(item.fabricante)} • Mod: ${escaparHTML(item.modelo || "-")}
        </span>
        <span style="font-size: 11px; color: var(--suave);">Cód: ${escaparHTML(item.codigo)}</span>
        
        <div class="seletor-qtd" style="display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; background: #f3f1ed; border-radius: 4px; padding: 2px 6px;">
          <button type="button" class="btn-qtd" data-acao="diminuir" data-id="${escaparHTML(item.id)}" style="background:none;border:none;cursor:pointer;font-weight:700;font-size:12px;padding:0 4px;">−</button>
          <span style="font-size: 11px; font-weight: 700; min-width: 14px; text-align: center;">${item.quantidade || 1}</span>
          <button type="button" class="btn-qtd" data-acao="aumentar" data-id="${escaparHTML(item.id)}" style="background:none;border:none;cursor:pointer;font-weight:700;font-size:12px;padding:0 4px;">+</button>
        </div>
      </div>
      <button class="btn-remove-item" type="button" data-remove-id="${escaparHTML(item.id)}" title="Remover item">&times;</button>
    </div>
  `).join("");
}

function truncarTextoCanvas(ctx, texto = "", larguraMax = 400) {
  let valor = String(texto || "");
  if (ctx.measureText(valor).width <= larguraMax) return valor;
  while (valor.length > 1 && ctx.measureText(`${valor}…`).width > larguraMax) {
    valor = valor.slice(0, -1);
  }
  return `${valor}…`;
}

function canvasParaJPEG(canvas, qualidade = 0.88) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error("Falha ao preparar uma página do PDF."));
      blob.arrayBuffer()
        .then(buffer => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, "image/jpeg", qualidade);
  });
}

function asciiBytes(texto = "") {
  return new TextEncoder().encode(String(texto));
}

function concatenarBytes(partes = []) {
  const tamanho = partes.reduce((soma, parte) => soma + parte.length, 0);
  const saida = new Uint8Array(tamanho);
  let offset = 0;
  for (const parte of partes) {
    saida.set(parte, offset);
    offset += parte.length;
  }
  return saida;
}

function montarPDFComJPEGs(paginas = [], larguraImagem = 1240, alturaImagem = 1754) {
  if (!paginas.length) throw new Error("Nenhuma página foi criada para o PDF.");

  const paisagem = larguraImagem > alturaImagem;
  const paginaLargura = paisagem ? 841.89 : 595.28;
  const paginaAltura = paisagem ? 595.28 : 841.89;
  const totalObjetos = 2 + paginas.length * 3;
  const objetos = new Array(totalObjetos + 1);
  const idsPaginas = [];

  objetos[1] = asciiBytes("<< /Type /Catalog /Pages 2 0 R >>");

  paginas.forEach((jpeg, indice) => {
    const pageId = 3 + indice * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const nomeImagem = `Im${indice + 1}`;
    idsPaginas.push(`${pageId} 0 R`);

    const imageHeader = asciiBytes(
      `<< /Type /XObject /Subtype /Image /Width ${larguraImagem} /Height ${alturaImagem} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    );
    const imageFooter = asciiBytes("\nendstream");
    objetos[imageId] = concatenarBytes([imageHeader, jpeg, imageFooter]);

    const comando = `q\n${paginaLargura} 0 0 ${paginaAltura} 0 0 cm\n/${nomeImagem} Do\nQ\n`;
    const comandoBytes = asciiBytes(comando);
    objetos[contentId] = asciiBytes(`<< /Length ${comandoBytes.length} >>\nstream\n${comando}endstream`);

    objetos[pageId] = asciiBytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${paginaLargura} ${paginaAltura}] ` +
      `/Resources << /XObject << /${nomeImagem} ${imageId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>`
    );
  });

  objetos[2] = asciiBytes(
    `<< /Type /Pages /Kids [${idsPaginas.join(" ")}] /Count ${paginas.length} >>`
  );

  const cabecalho = asciiBytes("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  const partes = [cabecalho];
  const offsets = new Array(totalObjetos + 1).fill(0);
  let posicao = cabecalho.length;

  for (let id = 1; id <= totalObjetos; id++) {
    offsets[id] = posicao;
    const inicio = asciiBytes(`${id} 0 obj\n`);
    const fim = asciiBytes("\nendobj\n");
    partes.push(inicio, objetos[id], fim);
    posicao += inicio.length + objetos[id].length + fim.length;
  }

  const xrefOffset = posicao;
  let xref = `xref\n0 ${totalObjetos + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjetos; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${totalObjetos + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  partes.push(asciiBytes(xref));

  return new Blob(partes, { type: "application/pdf" });
}

function carregarImagemCanvas(src = "") {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const imagem = new Image();
    imagem.decoding = "async";
    if (/^https?:\/\//i.test(src)) imagem.crossOrigin = "anonymous";
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => resolve(null);
    imagem.src = src;
  });
}

async function primeiraImagemDisponivel(candidatos = []) {
  for (const src of candidatos.filter(Boolean)) {
    const imagem = await carregarImagemCanvas(src);
    if (imagem) return imagem;
  }
  return null;
}

function desenharImagemContida(ctx, imagem, x, y, largura, altura, margem = 0) {
  if (!imagem?.naturalWidth || !imagem?.naturalHeight) return false;
  const maxL = Math.max(1, largura - margem * 2);
  const maxA = Math.max(1, altura - margem * 2);
  const escala = Math.min(maxL / imagem.naturalWidth, maxA / imagem.naturalHeight);
  const w = imagem.naturalWidth * escala;
  const h = imagem.naturalHeight * escala;
  ctx.drawImage(imagem, x + (largura - w) / 2, y + (altura - h) / 2, w, h);
  return true;
}

function quebrarTextoCanvas(ctx, texto = "", larguraMax = 400, maxLinhas = 2) {
  const palavras = String(texto || "").trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return [""];
  const linhas = [];
  let atual = "";
  for (const palavra of palavras) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(teste).width <= larguraMax) {
      atual = teste;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = palavra;
    if (linhas.length >= maxLinhas - 1) break;
  }
  if (atual && linhas.length < maxLinhas) linhas.push(atual);
  const consumido = linhas.join(" ");
  if (consumido.length < String(texto || "").trim().length) {
    linhas[linhas.length - 1] = truncarTextoCanvas(ctx, `${linhas[linhas.length - 1]}…`, larguraMax);
  }
  return linhas.slice(0, maxLinhas);
}

async function criarPDFOrcamento(favs = []) {
  if (!favs.length) throw new Error("Nenhum item selecionado para o orçamento.");

  // A4 paisagem em alta resolução. Mantém o visual da referência enviada.
  const LARGURA = 1754;
  const ALTURA = 1240;
  const MARGEM = 72;
  const TOPO = 158;
  const Y_TITULO = 262;
  const Y_TABELA = 402;
  const ALTURA_CABECALHO = 68;
  const ALTURA_LINHA = 154;
  const RODAPE = 94;
  const linhasPorPagina = Math.max(1, Math.floor((ALTURA - Y_TABELA - ALTURA_CABECALHO - RODAPE) / ALTURA_LINHA));
  const totalPaginas = Math.ceil(favs.length / linhasPorPagina);
  const paginasJPEG = [];
  const totalPecas = favs.reduce((soma, item) => soma + Math.max(1, Number(item.quantidade) || 1), 0);
  const dataAtual = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const logoInfo = await primeiraImagemDisponivel([
    "assets/logoin.png",
    "assets/logo-info-store.png",
    "assets/logo-info.png"
  ]);
  const logoClub = await primeiraImagemDisponivel([
    "assets/logo-club-one.png",
    "assets/logo-clubone.png",
    "assets/clubone.png",
    "assets/club-one.png"
  ]);

  for (let pagina = 0; pagina < totalPaginas; pagina++) {
    const canvas = document.createElement("canvas");
    canvas.width = LARGURA;
    canvas.height = ALTURA;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("O navegador não conseguiu preparar o PDF.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LARGURA, ALTURA);

    // Cabeçalho institucional
    ctx.fillStyle = "#132f69";
    ctx.fillRect(0, 0, LARGURA, TOPO);
    ctx.fillStyle = "#e52633";
    ctx.fillRect(0, TOPO - 5, LARGURA, 5);

    if (!desenharImagemContida(ctx, logoInfo, MARGEM, 28, 150, 88, 4)) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 31px Arial, sans-serif";
      ctx.fillText("info store", MARGEM, 82);
    }
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.fillRect(MARGEM + 174, 38, 2, 72);
    if (!desenharImagemContida(ctx, logoClub, MARGEM + 204, 26, 178, 92, 4)) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "400 28px Arial, sans-serif";
      ctx.fillText("CLUB ONE", MARGEM + 208, 82);
    }

    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 18px Arial, sans-serif";
    ctx.fillText("SOLICITAÇÃO DE ESPECIFICAÇÃO", LARGURA - MARGEM, 52);
    ctx.fillStyle = "#dbe5fb";
    ctx.font = "400 17px Arial, sans-serif";
    ctx.fillText(`Emitido em: ${dataAtual}`, LARGURA - MARGEM, 96);
    ctx.textAlign = "left";

    ctx.fillStyle = "#161616";
    ctx.font = "700 36px Arial, sans-serif";
    ctx.fillText("LISTA DE INTERESSE", MARGEM, Y_TITULO);
    ctx.fillStyle = "#646464";
    ctx.font = "400 18px Arial, sans-serif";
    ctx.fillText("Relação de itens selecionados para levantamento comercial e orçamentário.", MARGEM, Y_TITULO + 50);

    // Colunas inspiradas na referência anexada
    const xItem = MARGEM + 44;
    const xDescricao = MARGEM + 190;
    const xFabricante = 990;
    const xModelo = 1205;
    const xCodigo = 1430;
    const xQtd = 1642;

    ctx.fillStyle = "#edf3ff";
    ctx.fillRect(MARGEM, Y_TABELA, LARGURA - MARGEM * 2, ALTURA_CABECALHO);
    ctx.strokeStyle = "#cad8f4";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(MARGEM, Y_TABELA); ctx.lineTo(LARGURA - MARGEM, Y_TABELA); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(MARGEM, Y_TABELA + ALTURA_CABECALHO); ctx.lineTo(LARGURA - MARGEM, Y_TABELA + ALTURA_CABECALHO); ctx.stroke();
    ctx.fillStyle = "#142b63";
    ctx.font = "700 15px Arial, sans-serif";
    ctx.fillText("ITEM", xItem, Y_TABELA + 42);
    ctx.fillText("DESCRIÇÃO DO PRODUTO", xDescricao, Y_TABELA + 42);
    ctx.fillText("FABRICANTE", xFabricante, Y_TABELA + 42);
    ctx.fillText("MODELO", xModelo, Y_TABELA + 42);
    ctx.fillText("CÓDIGO", xCodigo, Y_TABELA + 42);
    ctx.fillText("QTD", xQtd, Y_TABELA + 42);

    const inicio = pagina * linhasPorPagina;
    const itensPagina = favs.slice(inicio, inicio + linhasPorPagina);
    for (let i = 0; i < itensPagina.length; i++) {
      const item = itensPagina[i];
      const y = Y_TABELA + ALTURA_CABECALHO + i * ALTURA_LINHA;
      const imagemProduto = await carregarImagemCanvas(item.imagem || "");

      ctx.strokeStyle = "#ded8cf";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGEM, y + ALTURA_LINHA);
      ctx.lineTo(LARGURA - MARGEM, y + ALTURA_LINHA);
      ctx.stroke();

      if (!desenharImagemContida(ctx, imagemProduto, MARGEM + 22, y + 20, 108, 108, 7)) {
        ctx.fillStyle = "#f4f5f7";
        ctx.fillRect(MARGEM + 32, y + 28, 88, 88);
      }

      ctx.fillStyle = "#111111";
      ctx.font = "600 19px Arial, sans-serif";
      const linhasNome = quebrarTextoCanvas(ctx, item.nome || "Produto", 730, 2);
      linhasNome.forEach((linha, indice) => ctx.fillText(linha, xDescricao, y + 63 + indice * 29));

      ctx.fillStyle = "#e52633";
      ctx.font = "700 16px Arial, sans-serif";
      ctx.fillText(truncarTextoCanvas(ctx, String(item.fabricante || item.marca || "-").toUpperCase(), 178), xFabricante, y + 72);

      ctx.fillStyle = "#424242";
      ctx.font = "400 17px Arial, sans-serif";
      ctx.fillText(truncarTextoCanvas(ctx, item.modelo || "-", 190), xModelo, y + 72);
      ctx.fillText(truncarTextoCanvas(ctx, item.codigo || item.codigoInfo || "-", 170), xCodigo, y + 72);
      ctx.fillStyle = "#111111";
      ctx.font = "700 18px Arial, sans-serif";
      ctx.fillText(String(Math.max(1, Number(item.quantidade) || 1)), xQtd + 15, y + 72);
    }

    const yRodape = ALTURA - 68;
    ctx.strokeStyle = "#d8d3cb";
    ctx.beginPath(); ctx.moveTo(MARGEM, yRodape - 36); ctx.lineTo(LARGURA - MARGEM, yRodape - 36); ctx.stroke();
    ctx.fillStyle = "#77736d";
    ctx.font = "400 14px Arial, sans-serif";
    ctx.fillText("CLUB ONE ARQUITETURA & DESIGN • INFO STORE", MARGEM, yRodape);
    ctx.textAlign = "right";
    ctx.fillStyle = "#161616";
    ctx.font = "700 15px Arial, sans-serif";
    const sufixoPagina = totalPaginas > 1 ? ` • PÁGINA ${pagina + 1}/${totalPaginas}` : "";
    ctx.fillText(`TOTAL: ${favs.length} ${favs.length === 1 ? "ITEM" : "ITENS"} (${totalPecas} ${totalPecas === 1 ? "PEÇA" : "PEÇAS"})${sufixoPagina}`, LARGURA - MARGEM, yRodape);
    ctx.textAlign = "left";

    paginasJPEG.push(await canvasParaJPEG(canvas, 0.9));
  }

  return montarPDFComJPEGs(paginasJPEG, LARGURA, ALTURA);
}
function baixarBlob(blob, nomeArquivo = "lista-interesse-info-store.pdf") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function baixarMemorialPDF() {
  const favs = obterFavoritosAtualizados();
  if (!favs.length) return;

  try {
    const blob = await criarPDFOrcamento(favs);
    baixarBlob(blob);
  } catch (erro) {
    console.error("Falha ao gerar PDF:", erro);
    alert("Não foi possível gerar o PDF. Atualize a página e tente novamente.");
  }
}

let ORCAMENTO_PENDENTE = null;

const CONTATOS_ORCAMENTO = {
  adaires: { nome: "Adaires", telefone: "5592982893772" },
  marcelo: { nome: "Marcelo", telefone: "5592982506370" },
  ana: { nome: "Ana", telefone: "5592992411779" }
};

function montarMensagemOrcamento(favs = [], contato = {}) {
  const totalPecas = favs.reduce(
    (soma, item) => soma + Math.max(1, Number(item.quantidade) || 1),
    0
  );

  const linhasItens = favs.map((item, indice) => {
    const nome = String(item.nome || "Produto").trim();
    const marca = String(item.fabricante || item.marca || "").trim();
    const modelo = String(item.modelo || "-").trim();
    const codigo = String(item.codigo || item.codigoInfo || "-").trim();
    const quantidade = Math.max(1, Number(item.quantidade) || 1);

    return [
      `${indice + 1}. ${nome}`,
      marca ? `   Marca: ${marca}` : "",
      `   Modelo: ${modelo}`,
      `   Código Info Store: ${codigo}`,
      `   Quantidade: ${quantidade}`
    ].filter(Boolean).join("\n");
  });

  return [
    `Olá, ${contato.nome || "equipe Info Store"}! Gostaria de solicitar um orçamento para os itens selecionados no Catálogo Info Store.`,
    "",
    ...linhasItens.flatMap((linha, indice) => indice < linhasItens.length - 1 ? [linha, ""] : [linha]),
    "",
    `Total: ${favs.length} ${favs.length === 1 ? "item" : "itens"} (${totalPecas} ${totalPecas === 1 ? "peça" : "peças"}).`,
    "",
    "Poderia verificar valores e disponibilidade?"
  ].join("\n");
}

function abrirSelecaoConsultor() {
  const favs = obterFavoritosAtualizados();
  if (!favs.length) {
    alert("Selecione ao menos um produto antes de solicitar o orçamento.");
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  ORCAMENTO_PENDENTE = { favs };

  const status = document.getElementById("status-orcamento");
  if (status) status.textContent = "Agora escolha com quem deseja falar.";

  const modal = document.getElementById("modal-consultores");
  modal?.classList.remove("hidden");
  modal?.querySelector(".opcao-consultor")?.focus();
}

function fecharSelecaoConsultor() {
  document.getElementById("modal-consultores")?.classList.add("hidden");
}

function solicitarOrcamentoWhatsApp(chaveContato) {
  const contato = CONTATOS_ORCAMENTO[chaveContato];
  const favs = ORCAMENTO_PENDENTE?.favs || obterFavoritosAtualizados();

  if (!contato || !favs.length) return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));

  const mensagem = montarMensagemOrcamento(favs, contato);
  const url = `https://wa.me/${contato.telefone}?text=${encodeURIComponent(mensagem)}`;

  fecharSelecaoConsultor();
  const whatsapp = window.open(url, "_blank");
  if (whatsapp) whatsapp.opener = null;
  else window.location.href = url;
}

function configurarEventosFavoritos() {
  const drawer = document.getElementById("drawer-favoritos");
  
  document.getElementById("btn-abrir-favoritos")?.addEventListener("click", () => {
    drawer?.classList.remove("hidden");
  });

  document.getElementById("btn-fechar-favoritos")?.addEventListener("click", () => {
    drawer?.classList.add("hidden");
  });

  document.getElementById("btn-solicitar-orcamento")?.addEventListener("click", abrirSelecaoConsultor);
  document.getElementById("btn-baixar-pdf")?.addEventListener("click", baixarMemorialPDF);

  document.querySelectorAll("[data-fechar-consultores]").forEach(botao => {
    botao.addEventListener("click", fecharSelecaoConsultor);
  });

  document.querySelectorAll("[data-consultor]").forEach(botao => {
    botao.addEventListener("click", () => {
      solicitarOrcamentoWhatsApp(botao.getAttribute("data-consultor"));
    });
  });

  document.addEventListener("keydown", evento => {
    if (evento.key === "Escape") fecharSelecaoConsultor();
  });

  document.addEventListener("click", (e) => {
    const btnQtd = e.target.closest(".btn-qtd");
    if (btnQtd) {
      const id = btnQtd.getAttribute("data-id");
      const acao = btnQtd.getAttribute("data-acao");
      let favs = getFavoritos();
      const item = favs.find(p => String(p.id) === String(id));

      if (item) {
        if (!item.quantidade) item.quantidade = 1;
        if (acao === "aumentar") item.quantidade += 1;
        if (acao === "diminuir" && item.quantidade > 1) item.quantidade -= 1;
        saveFavoritos(favs);
      }
      return;
    }

    const btnDetalhe = e.target.closest("#btn-favoritar-detalhe");
    if (btnDetalhe) {
      const pId = btnDetalhe.getAttribute("data-id");
      const produto = todosProdutos.find(item => String(item.id) === String(pId));
      if (produto) {
        toggleFavorito(normalizarProdutoParaFavorito(produto));
      }
      return;
    }

    const btnRemover = e.target.closest(".btn-remove-item");
    if (btnRemover) {
      const idRemover = btnRemover.getAttribute("data-remove-id");
      let favs = getFavoritos().filter(item => String(item.id) !== String(idRemover));
      saveFavoritos(favs);
      return;
    }
  });
}
