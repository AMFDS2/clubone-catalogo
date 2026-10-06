import { lerJSON, gravarJSON, existeLocal } from './lib/arquivos-locais.mjs';

const catalogo = await lerJSON('produtos.preview.json');
const relatorio = [];

function direta(documento = {}) {
  const valor = documento.urlOriginal || documento.url || '';
  try {
    const url = new URL(valor);
    if (url.hostname === 'docs.google.com') return url.searchParams.get('url') || valor;
    return url.href;
  } catch {
    return valor;
  }
}

function origemOficialPermitida(valor = '') {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && /(^|\.)(samsung\.com|electrolux\.com\.br|electrolux\.com|electrolux-ui\.com|electrolux-medialibrary\.com|midea\.com\.br|midea\.com)$/.test(url.hostname);
  } catch {
    return false;
  }
}

for (const produto of catalogo) {
  const problemas = [];
  const documentos = [];
  const pendentes = [];
  const candidatos = [...(produto.documentos || []), ...(produto.documentosPendentes || [])];
  const unicos = [...new Map(candidatos.map(documento => [direta(documento), documento])).values()];

  for (const documento of unicos) {
    const oficial = direta(documento);

    // Regra atual: PDFs oficiais permanecem online. Não são copiados para assets.
    // A extração técnica pode baixá-los apenas em memória quando necessário.
    if (origemOficialPermitida(oficial)) {
      documentos.push({
        ...documento,
        url: oficial,
        urlOriginal: oficial
      });
      continue;
    }

    // Mantém apenas documentos locais que já existam e que não tenham fonte oficial externa.
    if (await existeLocal(documento.url)) {
      documentos.push(documento);
      continue;
    }

    problemas.push(`${documento.nome || 'Documento'}: fonte oficial não reconhecida ou arquivo local ausente`);
    pendentes.push({ ...documento, urlOriginal: oficial });
  }

  produto.documentos = documentos;
  if (pendentes.length) produto.documentosPendentes = pendentes;
  else delete produto.documentosPendentes;

  const imagens = (produto.imagens?.length ? produto.imagens : [produto.imagem]).filter(Boolean);
  const faltantes = [];
  for (const url of imagens) {
    if (!url.includes('produto-sem-imagem') && !await existeLocal(url)) faltantes.push(url);
  }
  if (faltantes.length) problemas.push(`${faltantes.length} imagem(ns) não incluída(s) no pacote original`);

  if (problemas.length) {
    produto.revisaoPendente = true;
    produto.pendenciasArquivos = problemas;
    relatorio.push({ codigo: produto.codigoInfo, modelo: produto.modelo, problemas });
  } else {
    delete produto.pendenciasArquivos;
  }
}

await gravarJSON('produtos.preview.json', catalogo);
await gravarJSON('dados/relatorio-arquivos-locais.json', relatorio);
console.log(`Documentos online preservados: ${catalogo.reduce((n, p) => n + p.documentos.length, 0)}; produtos com arquivos pendentes: ${relatorio.length}.`);
