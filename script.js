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

    const produto = todosProdutos.find(
        p => p.modelo === modelo
    );

    document.getElementById("detalhes").innerHTML = `

        <div class="painel-produto">

            <h1>${produto.modelo}</h1>

            <div class="cabecalho-produto">

                <div class="imagem-produto">

    ${produto.imagem}

</div>

                <div class="info-produto">

                    <p>
                        <strong>Marca</strong><br>
                        ${produto.marca}
                    </p>

                    <p>
                        <strong>Categoria</strong><br>
                        ${produto.categoria}
                    </p>

                    <p>
                        <strong>Descrição</strong><br>
                        ${produto.descricao}
                    </p>

                </div>

            </div>

            <hr>

            <h3>Dados para Especificação</h3>

<div class="bloco-tecnico">

    <h3>Dados para Especificação</h3>

<div class="bloco-tecnico">

    <p>
        <strong>Modelo:</strong>
        ${produto.modelo}
    </p>

    <p>
        <strong>Marca:</strong>
        ${produto.marca}
    </p>

    <p>
        <strong>Categoria:</strong>
        ${produto.categoria}
    </p>

</div>

<h3>Dimensões Técnicas</h3>

<div class="bloco-tecnico">

    Em atualização.

</div>

<h3>Dimensões Técnicas</h3>

<div class="bloco-tecnico">

    Em atualização.

</div>

</div>

<h3>Dimensões Técnicas</h3>

<div class="bloco-tecnico">

    Em atualização.

</div>

    `;

}
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