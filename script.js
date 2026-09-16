let todosProdutos = [];
let produtoSelecionado = "";

// Carrega produtos
fetch("produtos.json")
  .then(response => response.json())
  .then(produtos => {

    todosProdutos = produtos;

    renderizarProdutos(produtos);

    // Abre automaticamente o primeiro produto
    if (produtos.length > 0) {
      mostrarDetalhes(produtos[0].modelo);
    }

    document
      .getElementById("busca")
      .addEventListener("input", pesquisar);

  });

// Renderiza lista da esquerda
function renderizarProdutos(produtos) {

  let html = "";

  produtos.forEach(produto => {

    html += `
      <div
        class="produto ${produtoSelecionado === produto.modelo ? "ativo" : ""}"
        onclick="mostrarDetalhes('${produto.modelo}')"
      >

        <h2>${produto.modelo}</h2>

        <p>${produto.descricao}</p>

        <p>
          ${produto.marca} • ${produto.categoria}
        </p>

      </div>
    `;

  });

  document.getElementById("produtos").innerHTML = html;

}

// Mostra detalhes do produto
function mostrarDetalhes(modelo) {

  produtoSelecionado = modelo;

  renderizarProdutos(todosProdutos);

  const produto = todosProdutos.find(
    p => p.modelo === modelo
  );

  if (!produto) return;

  const listaEspecificacoes =
    produto.especificacoes
      .map(item => `<li>${item}</li>`)
      .join("");

  const listaDocumentos =
    produto.documentos
      .map(item => `<li>${item}</li>`)
      .join("");

  document.getElementById("detalhes").innerHTML = `

    <span class="badge">
      ${produto.categoria}
    </span>

    <h1>${produto.modelo}</h1>

    <p class="subtitulo">
      ${produto.descricao}
    </p>

    <div class="acoes">

      ${produto.site}
        SITE DO FABRICANTE
      </a>

      <a
        href="https://www.infostore.com.br"
        target="_blank"
        class="botao-borda"
      >
        CONSULTAR DISPONIBILIDADE
      </a>

    </div>

    <div class="tabs">

      <span>ESPECIFICAÇÕES</span>
      <span>DIMENSÕES</span>
      <span>DOCUMENTOS</span>

    </div>

    <div class="bloco-tecnico">

      <h3>Características</h3>

      <ul>
        ${listaEspecificacoes}
      </ul>

    </div>

    <div class="bloco-tecnico">

      <h3>Dimensões</h3>

      <p>${produto.dimensoes}</p>

    </div>

    <div class="bloco-tecnico">

      <h3>Documentos</h3>

      <ul>
        ${listaDocumentos}
      </ul>

    </div>

  `;

}

// Filtro por categoria
function filtrarCategoria(categoria) {

  if (categoria === "Todos") {

    renderizarProdutos(todosProdutos);

    return;

  }

  const filtrados = todosProdutos.filter(
    produto => produto.categoria === categoria
  );

  renderizarProdutos(filtrados);

}

// Busca
function pesquisar() {

  const texto = document
    .getElementById("busca")
    .value
    .toLowerCase();

  const filtrados = todosProdutos.filter(produto => {

    return (
      produto.modelo.toLowerCase().includes(texto) ||
      produto.marca.toLowerCase().includes(texto) ||
      produto.categoria.toLowerCase().includes(texto)
    );

  });

  renderizarProdutos(filtrados);

  if (filtrados.length > 0) {
    mostrarDetalhes(filtrados[0].modelo);
  }

}