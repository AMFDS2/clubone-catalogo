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

  document.getElementById("detalhes").innerHTML = `

<div class="painel-produto">

    <span class="badge">
        ${produto.categoria}
    </span>

    <h1>${produto.modelo}</h1>

    <p class="subtitulo">
        ${produto.descricao}
    </p>

    <div class="acoes">

        <a
            href="${produto.siteFabricante}"
            SITE DO FABRICANTE
        </a>

        <a
            href="#"
            class="botao-borda"
       >

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

        ${produto.dimensoes}

    </div>

</div>

`;
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

    <a
        href="${produto.site}"
FABRICANTE
    </a>

    <a
        href="https://www.infostore.com.br"
        target="_blank"
        class
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