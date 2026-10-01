import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { raiz, baixar } from './arquivos-locais.mjs';
import { chave, confirmarModelo } from './climatizacao.mjs';
export async function textoPDF(local) {
  const b=await fs.readFile(path.join(raiz,local));
  const pdf=await getDocument({data:new Uint8Array(b),useSystemFonts:true}).promise;
  const paginas=[];
  for(let i=1;i<=pdf.numPages;i++) { const p=await pdf.getPage(i); const t=await p.getTextContent(); paginas.push(t.items.map(x=>x.str || '').join(' ')); }
  await pdf.destroy(); return paginas;
}
// Importa apenas PDFs nas pastas efetivamente vinculadas à página oficial.
// Um manual de família também precisa citar expressamente o modelo.
export async function documentosAgratto(extra,item,pagina) {
  const $=cheerio.load(await pagina(extra.fonteInterna));
  const pastas=[];
  $('.aba_personalizada a[href]').each((_,el)=> {
    const u=$(el).attr('href'); if (/^https:\/\/drive\.google\.com\/drive\/folders\/[\w-]+$/.test(u || '')) pastas.push(u);
  });
  const docs=[];
  for(const pasta of pastas.slice(0,2)) {
    const $p=cheerio.load(await pagina(pasta));
    const arquivos=[];
    $p('[data-id][data-tooltip]').each((_,el)=> {
      const id=$p(el).attr('data-id'),nome=$p(el).attr('data-tooltip');
      if(/\.pdf(?: PDF)?$/i.test(nome || '') && (confirmarModelo(item.modelo,[nome]) || /manual.*split/i.test(nome))) arquivos.push({id,nome:nome.replace(/ PDF$/,'')});
    });
    for(const a of arquivos) {
      const u=`https://drive.google.com/uc?export=download&id=${a.id}`;
      const local=await baixar(u,'assets/documentos','pdf');
      if(/manual/i.test(a.nome)) {
        const paginas=await textoPDF(local);
        if(!confirmarModelo(item.modelo,paginas)) continue;
      }
      docs.push({tipo:/ficha/i.test(a.nome)?'ficha-tecnica':'manual',nome:a.nome,url:local,urlOriginal:u,fonte:'Agratto',pastaOficial:pasta,descricao:'PDF vinculado à página oficial e associado ao modelo'});
    }
  }
  return docs;
}
