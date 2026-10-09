export default async function handler(req, res) {
  const codigo = String(req.query?.codigo || "").trim().toUpperCase();
  if (!/^[A-Z0-9._/-]{2,40}$/.test(codigo)) {
    return res.status(400).json({ erro: "Código inválido" });
  }

  try {
    const endpoint = `https://www.infostore.com.br/api/catalog_system/pub/products/search?fq=alternateIds_RefId:${encodeURIComponent(codigo)}`;
    const resposta = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (!resposta.ok) throw new Error(`Info Store respondeu ${resposta.status}`);
    const lista = await resposta.json();
    const produto = Array.isArray(lista) ? lista[0] : null;
    if (!produto) return res.status(404).json({ erro: "Produto não localizado" });

    const ofertas = (produto.items || []).flatMap(item =>
      (item.sellers || []).map(seller => ({ item, seller, oferta: seller.commertialOffer || {} }))
    ).filter(item => Number(item.oferta.Price) > 0);
    const selecionada = ofertas.sort((a, b) => Number(a.oferta.Price) - Number(b.oferta.Price))[0];
    if (!selecionada) return res.status(404).json({ erro: "Produto sem oferta disponível" });

    const oferta = selecionada.oferta;
    const pix = (oferta.Installments || []).find(item => /pix/i.test(item.PaymentSystemName || ""));
    const parcelas = (oferta.Installments || [])
      .filter(item => Number(item.NumberOfInstallments) > 1 && Number(item.InterestRate) === 0 && !/pix/i.test(item.PaymentSystemName || ""))
      .sort((a, b) => Number(b.NumberOfInstallments) - Number(a.NumberOfInstallments))[0];
    const categoriaBruta = (produto.categories || [])[0] || "";
    const categoria = categoriaBruta.split("/").filter(Boolean).pop() || "Produtos";

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      codigo,
      nome: produto.productName,
      categoria,
      url: produto.link,
      preco: Number(oferta.Price),
      precoLista: Number(oferta.ListPrice || oferta.Price),
      precoPix: Number(pix?.TotalValuePlusInterestRate || pix?.Value || oferta.Price),
      parcelas: parcelas ? { quantidade: Number(parcelas.NumberOfInstallments), valor: Number(parcelas.Value) } : null,
      estoque: Number(oferta.AvailableQuantity || 0),
      disponivel: Number(oferta.AvailableQuantity || 0) > 0,
      consultadoEm: new Date().toISOString()
    });
  } catch (erro) {
    console.error("Falha ao consultar preço Info Store:", erro);
    return res.status(502).json({ erro: "Não foi possível consultar o preço agora" });
  }
};
