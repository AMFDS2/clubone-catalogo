fetch("produtos.json")
.then(response => response.json())
.then(produtos => {

    let html = "";

    produtos.forEach(produto => {

        html += `
            <div class="produto">
                <h2>${produto.modelo}</h2>
                <p>${produto.marca}</p>
                <p>${produto.categoria}</p>
            </div>
        `;

    });

    document.getElementById("produtos").innerHTML = html;

});