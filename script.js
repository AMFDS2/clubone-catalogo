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
  <div class="produto">

    <img src="${produto.imagem}" alt="${produto.descricao}">

    <h2>${produto.modelo}</h2>

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
