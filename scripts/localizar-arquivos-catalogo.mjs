import path from 'node:path';
import fs from 'node:fs/promises';
import { lerJSON, gravarJSON, existeLocal, baixar, raiz } from './lib/arquivos-locais.mjs';
import { ehClimatizacao } from './lib/climatizacao.mjs';
const offline = process.argv.includes('--offline');
const catalogo = await lerJSON('produtos.preview.json');
const relatorios = [await lerJSON('manuais-oficiais/RELATORIO-MANUAIS.json', {}), await lerJSON('assets/catalogos/relatorio-manuais.json', {})];
const conhecidos = new Map();
function direta(d) {
  const v = d.urlOriginal || d.url;
  try { const u = new URL(v); return u.hostname === 'docs.google.com' ? u.searchParams.get('url') || v : v; } catch { return v; }
}
for (const r of relatorios) for (const d of r.baixados || []) {
  const semMarca = d.arquivo.split('/').slice(1).join('/');
  for (const local of [`manuais-oficiais/${semMarca}`, `manuais-oficiais/${d.arquivo}`]) {
    if (await existeLocal(local)) { conhecidos.set(d.url, local); break; }
  }
}
const relatorio = [];
for (const produto of catalogo) {
  const problemas=[];
  const docs=[],pendentes=[];
  const candidatos=[...(produto.documentos || []),...(produto.documentosPendentes || [])];
  const unicos=[...new Map(candidatos.map(d=>[direta(d),d])).values()];
  for (const d of unicos) {
    if (await existeLocal(d.url)) { docs.push(d); continue; }
    const url = direta(d);
    const existente = conhecidos.get(url);
    if (existente) { docs.push({...d, url:existente, urlOriginal:url}); continue; }
    if (!offline) {
      try {
        const h=new URL(url).hostname;
        if (!/(^|\.)(samsung\.com|electrolux\.com\.br|electrolux\.com|electrolux-ui\.com|electrolux-medialibrary\.com|midea\.com\.br|midea\.com)$/.test(h)) throw new Error('Origem de PDF não reconhecida');
        const local=await baixar(url,'assets/documentos','pdf');docs.push({...d,url:local,urlOriginal:url}); continue;
      } catch(e) {problemas.push(`${d.nome}: ${e.message}`);}
    } else problemas.push(`${d.nome}: PDF local ausente`);
    pendentes.push({...d,urlOriginal:url});
  }
  produto.documentos = docs;
  if(pendentes.length) produto.documentosPendentes=pendentes; else delete produto.documentosPendentes;
  const imagens=(produto.imagens?.length ? produto.imagens : [produto.imagem]).filter(Boolean);
  const faltantes=[];
  for (const u of imagens) if (!u.includes('produto-sem-imagem') && !await existeLocal(u)) faltantes.push(u);
  if(faltantes.length) problemas.push(`${faltantes.length} imagem(ns) não incluída(s) no pacote original`);
  if(problemas.length) {
    produto.revisaoPendente=true;
    produto.pendenciasArquivos=problemas;
    relatorio.push({codigo:produto.codigoInfo,modelo:produto.modelo,problemas});
  } else delete produto.pendenciasArquivos;
}
await gravarJSON('produtos.preview.json',catalogo);
await gravarJSON('dados/relatorio-arquivos-locais.json',relatorio);
console.log(`Documentos locais: ${catalogo.reduce((n,p)=>n+p.documentos.length,0)}; produtos com arquivos pendentes: ${relatorio.length}.`);
