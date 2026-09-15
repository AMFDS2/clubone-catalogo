let todosProdutos = [];

fetch("produtos.json")
  .then(response => response.json())
  .then(produtos => {

    todosProdutos = produtos;

    renderizarProdutos(produtos);

    document
      .getElementById("busca")
      .addEventListener("input", pesquisar);

  });

function renderizarProdutos(produtos) {

  let html = "";

  produtos.forEach(produto => {

 html += `
<div
    class="produto"
    onclick="mostrarDetalhes('${produto.modelo}')"
>
    <imgoduto.imagem}

    <h2>${produto.modelo}</h2>

    <a href="produto.html?modelo=${produto.modelo}">
        Ver detalhes
    </a>

    <p>${produto.marca}</p>

    <p>${produto.descricao}</p>

    <p>${produto.categoria}</p>

</div>
`;

  });

  document.getElementById("produtos").innerHTML = html;

}

function filtrarCategoria(categoria) {

  if (categoria === "Todos") {

    renderizarProdutos(todosProdutos);
    return;

  }

  const filtrados = todosProdutos.filter(produto =>
    produto.categoria === categoria
  );

  renderizarProdutos(filtrados);

}
function mostrarDetalhes(modelo) {

    const produto = todosProdutos.find(p =>
        p.modelo === modelo
    );

    document.getElementById("detalhes").innerHTML = `

        <h1>${produto.modelo}</h1>

        <p>
            <strong>Marca:</strong>
            ${produto.marca}
        </p>

        <p>
            <strong>Categoria:</strong>
            ${produto.categoria}
        </p>

        <p>
            ${produto.descricao}
        </p>

    `;

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

}