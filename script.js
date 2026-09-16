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
    const listaEspecificacoes =
    produto.especificacoes
        .map(item => `<li>${item}</li>`)
        .join("");
document.getElementById("detalhes").innerHTML = `

<div class="painel-produto">

    <span class="badge">
        ${produto.categoria}
    </span>

    <h1>${produto.modelo}</h1>

    <h2>${produto.descricao}</h2>

    <hr>

    <div class="acoes">

        <button class="botao-preto">
            SITE DO FABRICANTE
        </button>

        <button class="botao-borda">
            CONSULTAR DISPONIBILIDADE
        </button>

    </div>

    <hr>

    <h3>ESPECIFICAÇÕES</h3>

    <div class="bloco-tecnico">

    <h4>Características</h4>

    <ul>

        ${listaEspecificacoes}

    </ul>

</div>

    <h3>DIMENSÕES</h3>

    <div class="bloco-tecnico">

        ${produto.dimensoes || "Em atualização"}

    </div>
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