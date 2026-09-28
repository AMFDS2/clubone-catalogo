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

  // Controle lateral exclusivo. O botão antigo pode continuar oculto no HTML
  // sem impedir que este apareça acima do painel de filtros.
  document.getElementById("botaoFiltros")?.classList.add("botao-filtro-legado");
  let botaoFiltros = document.getElementById("alternarFiltrosLateral");
  if (!botaoFiltros && painelFiltros) {
    botaoFiltros = document.createElement("button");
    botaoFiltros.id = "alternarFiltrosLateral";
    botaoFiltros.type = "button";
    botaoFiltros.className = "alternar-filtros";
    botaoFiltros.setAttribute("aria-controls", "painelFiltros");
    botaoFiltros.setAttribute("aria-expanded", "true");
    botaoFiltros.innerHTML = `
      <span class="alternar-filtros-rotulo">Filtros</span>
      <span class="alternar-filtros-icone" aria-hidden="true">⌃</span>`;
    painelFiltros.parentNode.insertBefore(botaoFiltros, painelFiltros);
  }

  const atualizarBotaoFiltros = () => {
    if (!botaoFiltros || !painelFiltros) return;
    const aberto = !painelFiltros.classList.contains("fechado");
    botaoFiltros.setAttribute("aria-expanded", String(aberto));
    botaoFiltros.setAttribute("aria-label", aberto ? "Recolher filtros" : "Mostrar filtros");
    const rotulo = botaoFiltros.querySelector(".alternar-filtros-rotulo");
    const icone = botaoFiltros.querySelector(".alternar-filtros-icone");
    if (rotulo) rotulo.textContent = aberto ? "Recolher filtros" : "Mostrar filtros";
    if (icone) icone.textContent = aberto ? "⌃" : "⌄";
  };

  const filtrosRecolhidos = localStorage.getItem(STORAGE_FILTROS);
  if (filtrosRecolhidos === "1" || (filtrosRecolhidos === null && window.matchMedia("(max-width: 900px)").matches)) {
    painelFiltros?.classList.add("fechado");
  }

  atualizarBotaoFiltros();

  campoBusca?.addEventListener("input", aplicarFiltros);
  ordenacao?.addEventListener("change", aplicarFiltros);

  document.getElementById("filtrosFabricantes")?.addEventListener("change", atualizarSelecaoFiltro);
  document.getElementById("filtrosSegmentos")?.addEventListener("change", atualizarSelecaoFiltro);

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
  todosProdutos.forEach(produto => {
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

  const dimensoesProduto = dados.dimensoesProduto || {};
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
    ...Object.values(dados.geometriaInstalacao || {}), ...Object.values(dados.instalacao || {})
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
  const validacao = dados.validacao || validacaoCalculada;
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
  const dimensoes = dados.dimensoesProduto || {};
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
    <section class="vista-projeto-card">${cabecalho("Vista frontal", "Largura × altura", [dimensoes.largura, dimensoes.altura])}${desenho(largura, altura, "largura", "altura", "frontal")}</section>
    <section class="vista-projeto-card">${cabecalho("Vista lateral", "Profundidade × altura", [dimensoes.profundidade, dimensoes.altura])}${desenho(profundidade, altura, "profundidade", "altura", "lateral")}</section>
    <section class="vista-projeto-card">${cabecalho("Vista superior", "Largura × profundidade", [dimensoes.largura, dimensoes.profundidade])}${desenho(largura, profundidade, "largura", "profundidade", "superior")}</section>
    <section class="vista-projeto-card vista-produto-real">${cabecalho("Imagem do produto", "Referência visual — sem valor de cota", [])}<img src="${escaparHTML(imagem)}" alt="${escaparHTML(produto.nome || produto.modelo)}"></section>
  </div>`;
}

function criarVistasTecnicasProjeto(produto = {}, dados = {}) {
  const textoProduto = normalizarTexto(`${produto.tipoBloco || ""} ${produto.nome || ""} ${produto.modelo || ""}`);
  if (!/geladeira|refrigerador|adega|freezer/.test(textoProduto)) return criarVistasTecnicasGenericas(produto, dados);

  const dimensoes = dados.dimensoesProduto || {};
  const folgas = dados.folgas || {};
  const abertura = dados.abertura || {};
  const geometria = dados.geometriaInstalacao || {};
  const valor = (campo, vazio = "") => campo?.status === "CONFIRMADO" && campo?.valor ? campo.valor : vazio;
  const referencia = (...campos) => campos.find(campo => campo?.status === "CONFIRMADO" && campo?.referencia)?.referencia || "";
  const pagina = (...campos) => campos.find(campo => campo?.pagina)?.pagina || "—";
  const largura = valor(geometria.larguraProduto, valor(dimensoes.largura));
  const altura = valor(geometria.alturaProduto, valor(dimensoes.altura));
  const profundidade = valor(geometria.profundidadeTotalProduto, valor(dimensoes.profundidade));
  const profundidadeGabinete = valor(geometria.profundidadeGabinete);
  const superior = valor(folgas.superior);
  const lateral = valor(geometria.folgaLateral);
  const lateralEsquerda = valor(geometria.folgaLateralEsquerda, "");
  const lateralDireita = valor(geometria.folgaLateralDireita, "");
  const traseira = valor(geometria.afastamentoTraseiro);
  const angulo = valor(geometria.anguloAbertura, valor(abertura.anguloPorta, ""));
  const anguloEsquerda = valor(geometria.anguloAberturaEsquerda, "");
  const anguloDireita = valor(geometria.anguloAberturaDireita, "");
  const larguraPortasAbertas = valor(geometria.larguraComPortasAbertas, "");
  const profundidadePortasAbertas = valor(geometria.profundidadeComPortasAbertas, "");
  const gavetas = valor(geometria.profundidadeComGavetasEstendidas, valor(abertura.distanciaGavetasEstendidas, ""));
  const paginaFrontal = pagina(dimensoes.largura, dimensoes.altura, dimensoes.profundidade, folgas.superior);
  const paginaSuperior = pagina(geometria.larguraComPortasAbertas, geometria.profundidadeComPortasAbertas, geometria.anguloAberturaEsquerda, geometria.anguloAberturaDireita, geometria.anguloAbertura, abertura.anguloPorta);
  const paginaLateral = pagina(geometria.profundidadeGabinete, geometria.profundidadeTotalProduto, dimensoes.profundidade, geometria.profundidadeComPortasAbertas);
  const referenciaFrontal = referencia(geometria.larguraProduto, dimensoes.largura, geometria.alturaProduto, dimensoes.altura);
  const referenciaSuperior = referencia(geometria.larguraComPortasAbertas, geometria.profundidadeComPortasAbertas, geometria.anguloAberturaEsquerda, geometria.anguloAberturaDireita, geometria.anguloAbertura, abertura.anguloPorta);
  const referenciaLateral = referencia(geometria.profundidadeGabinete, geometria.profundidadeTotalProduto, dimensoes.profundidade, geometria.profundidadeComPortasAbertas);
  const imagem = obterImagensProduto(produto)[0] || IMAGEM_FALLBACK;
  const quatroPortas = /4 portas|quatro portas|iq8|multidoor|multi door/.test(textoProduto);
  const tresPortas = !quatroPortas && /3 portas|tres portas|im7|im8|french|rf70|rf80/.test(textoProduto);
  const frenchDoor = quatroPortas || tresPortas;
  const sideBySide = produto.moldeTecnico === "geladeira-side-by-side" || produto.familiaTecnica === "side-by-side" || /side by side|rs60|rs58/.test(textoProduto);
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
        <text class="cota-valor cota-profundidade" x="428" y="144">${escaparHTML(profundidadeGabinete)}</text>
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
      <section class="vista-projeto-card">
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
      <section class="vista-projeto-card">
        ${cabecalho("Vista superior", sideBySide ? "Abertura independente das portas" : `Abertura${gavetas ? ` — gavetas: ${escaparHTML(gavetas)}` : ""}`, paginaSuperior, referenciaSuperior)}
        ${vistaSuperior}
      </section>
      <section class="vista-projeto-card">
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
  
  // O seu blocagem.js atua aqui.
  const dimensoes = typeof criarBlocagemDimensional === "function"
    ? criarBlocagemDimensional(produto.dimensoes || {}, produto)
    : criarDimensoes(produto.dimensoes || {}, produto);
  const medidasProjeto = criarMedidasProjeto(produto, dimensoes);
    
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

  const favs = getFavoritos();
  const estaFavoritado = favs.some(item => String(item.id) === String(produto.id));

  // NOVA LÓGICA: Montar a Tabela da IA de forma independente
  const ia = produto.medidasIA;
  const tabelaIA = ia ? `
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
    <div class="produto-hero">
      <div class="produto-resumo">
        <span class="badge">${escaparHTML(produto.categoria || produto.segmento || "")}</span>
        <h1 class="nome-produto">${escaparHTML(produto.nome)}</h1>
        <p class="subtitulo produto-identificacao">${escaparHTML(produto.marca || produto.fabricante || "")} <span aria-hidden="true">•</span> Modelo ${escaparHTML(produto.modelo)}</p>
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
        <button type="button" class="tab" data-tab="dimensoes">Medidas para projeto ${produto.medidasProjeto ? '<span class="tab-selo-ia">IA</span>' : ""}</button>
        <button type="button" class="tab" data-tab="documentos">Downloads</button>
      </nav>

      <section class="painel-tab ativo" id="painel-especificacoes">
        <div class="grade-tecnica">
          <div class="tabela-especificacoes">${especificacoes}</div>
          <div>
            <div class="card-dimensoes">
              <h3 class="dimensoes-subtitulo">Dimensões</h3>
              ${dimensoes}
            </div>
            ${tabelaIA}
            ${criarAviso()}
          </div>
        </div>
      </section>

      <section class="painel-tab" id="painel-dimensoes">
        ${medidasProjeto}
      </section>

      <section class="painel-tab" id="painel-documentos">
        <div class="card-documentos">
          <h3 class="dimensoes-subtitulo">Documentos e Manuais</h3>
          <div class="lista-documentos">${documentos}</div>
        </div>
      </section>
    </div>`;

  configurarAbas();
  configurarGaleria();
  configurarFallbackImagens(document.getElementById("detalhes"));

  if (interacaoDoUsuario && window.matchMedia("(max-width: 900px)").matches) {
    requestAnimationFrame(() => {
      document.getElementById("detalhes").scrollIntoView({ behavior: "smooth", block: "start" });
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
  const lista = Array.isArray(destaques) ? destaques : [];

  return lista
    .filter(item => {
      if (!item || (!item.titulo && !item.valor)) return false;
      const valor = String(item.titulo || item.valor).trim();
      return valor.length <= 48;
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
  const ehForno = textoProduto.includes("forno") || textoProduto.includes("micro-ondas") || textoProduto.includes("microondas");
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
    formaProduto = `<g class="forma-produto forma-tv"><rect x="25" y="46" width="165" height="98" rx="3"></rect><rect x="33" y="54" width="149" height="82" rx="1" class="tela-tv"></rect><line x1="107" y1="144" x2="107" y2="163"></line><line x1="76" y1="164" x2="138" y2="164"></line><path d="M190 46 L198 52 L198 138 L190 144"></path></g>`;
  } else if (ehCooktop) {
    formaProduto = `<g class="forma-produto forma-cooktop"><path d="M29 79 L154 57 L190 87 L63 112 Z"></path><path d="M63 112 L190 87 L190 101 L63 127 Z"></path><path d="M29 79 L63 112 L63 127 L29 94 Z"></path><ellipse cx="72" cy="88" rx="16" ry="9"></ellipse><ellipse cx="122" cy="78" rx="16" ry="9"></ellipse><ellipse cx="104" cy="104" rx="15" ry="8"></ellipse><ellipse cx="154" cy="94" rx="15" ry="8"></ellipse></g>`;
  } else if (ehFogao) {
    formaProduto = `<g class="forma-produto forma-fogao"><rect x="55" y="47" width="110" height="137" rx="3"></rect><path d="M55 47 L151 47 L174 62 L76 62 Z"></path><rect x="61" y="63" width="98" height="25" rx="2"></rect><circle cx="74" cy="75" r="4"></circle><circle cx="89" cy="75" r="4"></circle><circle cx="131" cy="75" r="4"></circle><circle cx="146" cy="75" r="4"></circle><rect x="98" y="70" width="23" height="10" rx="1"></rect><rect x="66" y="98" width="88" height="66" rx="2"></rect><line x1="75" y1="108" x2="145" y2="108"></line><path d="M165 70 L174 62 L174 169 L165 184"></path><line x1="68" y1="184" x2="68" y2="190"></line><line x1="151" y1="184" x2="151" y2="190"></line></g>`;
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

function criarDocumentos(documentos = []) {
  const lista = Array.isArray(documentos) ? documentos : [];
  const validos = lista.filter(documento => documento && documento.nome && documento.url);

  if (!validos.length) {
    return `<p class="texto-tecnico">Nenhum documento oficial disponível no momento.</p>`;
  }

  return validos.map(documento => `
    <a href="${escaparHTML(documento.url)}" target="_blank" rel="noopener noreferrer" class="documento-link">
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

function baixarMemorialPDF() {
  const favs = obterFavoritosAtualizados();
  if (!favs.length) return;

  // Mantém a gaveta e o documento sincronizados com os dados atuais do catálogo.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));

  const totalPecas = favs.reduce(
    (soma, item) => soma + Math.max(1, Number(item.quantidade) || 1),
    0
  );

  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const janelaImpressao = window.open("", "_blank", "width=980,height=820");
  if (!janelaImpressao) {
    alert("O navegador bloqueou a janela de impressão. Libere pop-ups para gerar a lista.");
    return;
  }

  // As linhas são construídas separadamente para evitar template string aninhada.
  const linhasTabela = favs.map((item) => {
    const imagem = escaparHTML(item.imagem || IMAGEM_FALLBACK);
    const nome = escaparHTML(item.nome || "Produto");
    const fabricante = escaparHTML(item.fabricante || item.marca || "Info Store");
    const modelo = escaparHTML(item.modelo || "-");
    const codigo = escaparHTML(item.codigo || item.codigoInfo || "-");
    const quantidade = Math.max(1, Number(item.quantidade) || 1);

    return [
      '<tr>',
      '<td class="col-item"><img src="' + imagem + '" alt=""></td>',
      '<td><span class="produto-nome">' + nome + '</span></td>',
      '<td><span class="tag-fab">' + fabricante + '</span></td>',
      '<td class="col-mod">' + modelo + '</td>',
      '<td class="col-cod">' + codigo + '</td>',
      '<td class="col-qtd">' + quantidade + '</td>',
      '</tr>'
    ].join("");
  }).join("");

  const totalItensTexto = favs.length === 1 ? "item" : "itens";
  const totalPecasTexto = totalPecas === 1 ? "peça" : "peças";

  const conteudoHtml = [
    '<!DOCTYPE html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Lista de Interesse - Club One &amp; Info Store</title>',
    '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet">',
    '<style>',
    '@page { size: A4 portrait; margin: 0; }',
    '* { box-sizing: border-box; }',
    'body { font-family: Manrope, Arial, sans-serif; margin: 0; padding: 0; color: #20201e; background: #ffffff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }',
    '.topbar-documento { background: linear-gradient(105deg, #0d1f4d, #142b63) !important; border-bottom: 2px solid #e52633 !important; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; }',
    '.logos { display: flex; align-items: center; gap: 20px; }',
    '.logo-info { height: 36px; object-fit: contain; }',
    '.logo-club { height: 27px; object-fit: contain; opacity: .92; }',
    '.separador { width: 1px; height: 28px; background: rgba(255,255,255,.22); }',
    '.meta-documento { text-align: right; }',
    '.meta-documento strong { display: block; font-family: Montserrat, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #fff; margin-bottom: 4px; }',
    '.meta-documento span { font-size: 11px; color: #cbd8f4; }',
    '.conteudo-pagina { padding: 40px; }',
    '.titulo-bloco { margin-bottom: 30px; }',
    '.titulo-bloco h1 { font-family: Montserrat, sans-serif; font-size: 20px; font-weight: 600; text-transform: uppercase; margin: 0 0 6px; color: #11110f; }',
    '.titulo-bloco p { margin: 0; font-size: 12px; color: #6d6b67; }',
    'table { width: 100%; border-collapse: collapse; margin-top: 10px; }',
    'th { font-family: Montserrat, sans-serif; font-size: 9px; font-weight: 600; text-transform: uppercase; background: #eef3fd !important; color: #142b63; padding: 10px 14px; text-align: left; border-top: 1px solid #d6e0f5; border-bottom: 1px solid #d6e0f5; }',
    'td { padding: 14px; border-bottom: 1px solid #ece8e1; font-size: 12px; vertical-align: middle; }',
    '.col-item { width: 55px; text-align: center; }',
    '.col-item img { width: 44px; height: 44px; object-fit: contain; display: block; margin: 0 auto; }',
    '.produto-nome { font-family: Manrope, sans-serif; font-weight: 500; font-size: 12px; color: #1a1a18; display: block; max-width: 320px; }',
    '.tag-fab { font-family: Montserrat, sans-serif; font-size: 10px; font-weight: 600; color: #e52633; text-transform: uppercase; }',
    '.col-mod { font-family: Manrope, sans-serif; font-size: 11px; color: #55534e; white-space: nowrap; }',
    '.col-cod { font-family: monospace; font-size: 11px; font-weight: 500; color: #33312e; white-space: nowrap; }',
    '.col-qtd { text-align: center; width: 50px; font-weight: 600; }',
    '.footer-documento { margin-top: 50px; padding-top: 18px; border-top: 1px solid #e4e0d9; display: flex; justify-content: space-between; align-items: center; font-size: 9px; font-weight: 500; color: #8c8881; text-transform: uppercase; }',
    '.footer-total { color: #11110f; font-weight: 600; }',
    '</style>',
    '</head>',
    '<body>',
    '<div class="topbar-documento">',
    '<div class="logos">',
    '<img class="logo-info" src="' + window.location.origin + '/assets/logoin.png" alt="Info Store">',
    '<span class="separador"></span>',
    '<img class="logo-club" src="' + window.location.origin + '/assets/logoclub.png" alt="Club One">',
    '</div>',
    '<div class="meta-documento">',
    '<strong>Solicitação de Especificação</strong>',
    '<span>Emitido em: ' + escaparHTML(dataAtual) + '</span>',
    '</div>',
    '</div>',
    '<div class="conteudo-pagina">',
    '<div class="titulo-bloco">',
    '<h1>Lista de Interesse</h1>',
    '<p>Relação de itens selecionados para levantamento comercial e orçamentário.</p>',
    '</div>',
    '<table>',
    '<thead><tr>',
    '<th class="col-item">Item</th>',
    '<th>Descrição do Produto</th>',
    '<th>Fabricante</th>',
    '<th>Modelo</th>',
    '<th>Código</th>',
    '<th class="col-qtd">Qtd</th>',
    '</tr></thead>',
    '<tbody>' + linhasTabela + '</tbody>',
    '</table>',
    '<div class="footer-documento">',
    '<span>Club One Arquitetura &amp; Design • Info Store</span>',
    '<span class="footer-total">Total: ' + favs.length + ' ' + totalItensTexto + ' (' + totalPecas + ' ' + totalPecasTexto + ')</span>',
    '</div>',
    '</div>',
    '</body>',
    '</html>'
  ].join("");

  janelaImpressao.document.open();
  janelaImpressao.document.write(conteudoHtml);
  janelaImpressao.document.close();

  // Dispara a impressão pelo contexto da página principal; evita <script> dentro do HTML gerado.
  janelaImpressao.addEventListener("load", () => {
    janelaImpressao.focus();
    janelaImpressao.print();
  }, { once: true });
}

function configurarEventosFavoritos() {
  const drawer = document.getElementById("drawer-favoritos");
  
  document.getElementById("btn-abrir-favoritos")?.addEventListener("click", () => {
    drawer?.classList.remove("hidden");
  });

  document.getElementById("btn-fechar-favoritos")?.addEventListener("click", () => {
    drawer?.classList.add("hidden");
  });

  document.getElementById("btn-gerar-memorial")?.addEventListener("click", baixarMemorialPDF);

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
