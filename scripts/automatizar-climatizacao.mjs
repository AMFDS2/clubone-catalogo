import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ehClimatizacao, chave, normalizar, marca, tipo, confirmarModelo, referenciasProduto, extrairEstruturado, extrairMidea, extrairAgratto, extrairGenerico, pendenciasTecnicas } from './lib/climatizacao.mjs';
import { raiz, lerJSON, gravarJSON, baixar, textoURL, existeLocal } from './lib/arquivos-locais.mjs';

import { localizarInfo, extrairInfo, mesclarInfo } from './lib/info-store-climatizacao.mjs';
import { documentosAgratto } from './lib/pdf-climatizacao.mjs';

const origens = { Midea: 'https://www.midea.com.br', Agratto: 'https://www.agratto.com.br', Electrolux: 'https://loja.electrolux.com.br', Samsung: 'https://www.samsung.com', Mystic: 'https://mysticlatinoamerica.com' };
const cache = new Map();
async function pagina(url) {
  if (!cache.has(url)) cache.set(url, (async () => {
    const caminho=path.join(raiz,'.cache','climatizacao',createHash('sha256').update(url).digest('hex')+'.txt');
    if (!process.argv.includes('--sem-cache')) {
      try { const st=await fs.stat(caminho); if(Date.now()-st.mtimeMs < 86400000) return await fs.readFile(caminho,'utf8'); } catch {}
    }
    const texto=await textoURL(url); await fs.mkdir(path.dirname(caminho),{recursive:true}); await fs.writeFile(caminho,texto); return texto;
  })());
  return cache.get(url);
}
async function mapaMidea() {
  const inicial = await pagina(`${origens.Midea}/sitemap.xml`);
  const sitemaps = [...inicial.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(u => /\/product-\d+\.xml$/.test(u));
  const todas = [];
  for (const u of sitemaps) {
    const xml = await pagina(u);
    todas.push(...[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replaceAll('&amp;','&')));
  }
  return [...new Set(todas)].filter(u => u.startsWith(origens.Midea + '/') && /ar-condicionado/.test(u) && !/outlet|\/kit-|quente|q-f|q_f/.test(u));
}
async function mapaAgratto() {
  const categorias = ['/ar-condicionado/residencial/liv','/ar-condicionado/residencial/zen-inverter','/ar-condicionado/comercial-leve/cassete'];
  const urls = [];
  for (const c of categorias) {
    try { const $ = cheerio.load(await pagina(origens.Agratto + c));
      $('a[href]').each((_,el) => { const u = new URL($(el).attr('href'), origens.Agratto).href; if (u.startsWith(origens.Agratto + '/') && /ar-condicionado-/.test(u)) urls.push(u); });
    } catch(e) { console.warn(e.message); }
  }
  return [...new Set(urls)];
}
function verificarOrigem(url, fabricante) {
  const h = new URL(url).hostname;
  const base = new URL(origens[fabricante]).hostname.replace(/^www\./,'');
  if (!(h === base || h.endsWith('.' + base))) throw new Error('Página fora do domínio oficial da marca');
}
async function coletarElectrolux(item) {
  for (const termo of [...new Set(item.modelo.split('/'))]) {
    const url = `${origens.Electrolux}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termo)}`;
    const lista = JSON.parse(await pagina(url));
    const p = lista.find(p => confirmarModelo(item.modelo, referenciasProduto(p)));
    if (p) return { ...extrairEstruturado(p, item), fonteInterna: p.link, origemFonte: 'FABRICANTE' };
  }
  return null;
}
async function coletarPagina(item, urls, fabricante) {
  for (const url of urls) {
    try {
      verificarOrigem(url, fabricante);
      const html = await pagina(url);
      const extra = fabricante === 'Midea' ? extrairMidea(html,item) : fabricante === 'Agratto' ? extrairAgratto(html,item) : extrairGenerico(html,item);
      if (extra) return { ...extra, fonteInterna: url, origemFonte: 'FABRICANTE' };
    } catch(e) { console.warn(e.message); }
  }
  return null;
}
function urlInfoValida(url) {
  try { const u=new URL(url); return u.protocol==='https:' && /^(www\.)?infostore\.com\.br$/.test(u.hostname) && /\/p$/.test(u.pathname); } catch { return false; }
}
export async function linkInfo(item, anterior) {
  // Valida por campo de referência, nunca pelo texto livre da descrição.
  const lista = JSON.parse(await pagina(`https://www.infostore.com.br/api/catalog_system/pub/products/search?fq=alternateIds_RefId:${encodeURIComponent(item.codigo)}`));
  const exatos = lista.filter(p => [p.productReference, ...(p.items || []).flatMap(s => (s.referenceId || []).map(r=>r.Value))].some(v=>chave(v)===chave(item.codigo)));
  if (exatos.length === 1) {
    const url = exatos[0].link || `https://www.infostore.com.br/${exatos[0].linkText}/p`;
    if (urlInfoValida(url)) return {url, confirmado:true};
  }
  // Um endereço anterior sem prova de SKU não é promovido a confirmado.
  return { url: urlInfoValida(anterior?.siteInfoStore) ? anterior.siteInfoStore : '', confirmado:false };
}
export function produtoCatalogo(base, extra, anterior, link) {
  const confirmado = extra.validadoFabricante === true || extra.validadoInfoStore === true;
  const pendencias = [...extra.pendencias];
  if (!link.confirmado) pendencias.push('Link do produto na Info Store ainda não confirmado pelo código');
  const dados = confirmado ? extra : {};
  const imgs = dados.imagens || [];
  const spec = dados.especificacoes || {};
  return { ...anterior, id: anterior?.id || chave(base.modelo).toLowerCase(), marca: marca(base.fabricante), modelo: base.modelo,
    codigoInfo: base.codigo, nome: dados.tituloOficial || base.produto, nomeOficial: dados.tituloOficial || '', nomePlanilha: base.produto,
    descricao: dados.descricao || base.produto, categoria:'Climatização', segmento:base.segmento, tipoBloco:tipo(base),
    imagem: imgs[0] || 'assets/produto-sem-imagem.svg', imagens: imgs.length ? imgs : ['assets/produto-sem-imagem.svg'],
    siteInfoStore: link.confirmado ? link.url : '',
    especificacoes: {Modelo:base.modelo, Categoria:'Climatização', 'Código Info Store':base.codigo, ...spec},
    dimensoes: dados.dimensoes || {}, documentos: dados.documentos || [],
    origemDados: dados.origemFonte || (dados.validadoFabricante ? 'FABRICANTE' : ''), fonteDados: dados.fonteInterna || '',
    fontesCampos: dados.fontesCampos || {},
    destaques: ['Capacidade de refrigeração','Compressor','Ciclo','Voltagem','Classificação energética'].filter(k=>spec[k]).map(k=>({rotulo:k,titulo:spec[k],icone:'◇'})),
    instalacao: 'Consulte o manual local para confirmar alimentação, dreno, tubulação, desnível e afastamentos específicos deste modelo.',
    revisaoPendente: pendencias.length > 0, motivoPendencia: pendencias.join('; '), pendencias,
    medidasProjeto: undefined, medidasIA: undefined, siteFabricante: undefined };
}
export async function executar() {
  const base = (await lerJSON('dados/produtos-base.json')).filter(ehClimatizacao);
  const atual = await lerJSON('produtos.preview.json');
  const extrasAntigos = await lerJSON('dados/enriquecimento-automatico.json');
  const fontesAntigas = await lerJSON('dados/fontes-oficiais.json');
  const transcricoes = await lerJSON('dados/transcricoes-climatizacao.json', {});
  const configuradas = await lerJSON('dados/fontes-climatizacao.json', {});
  const aliases = await lerJSON('dados/aliases-climatizacao.json', {});
  const somenteInfo = process.argv.includes('--info-store');
  const apenas = process.argv.find(a=>a.startsWith('--codigo='))?.split('=')[1];
  const selecionados = base.filter(p=>(!apenas || p.codigo===apenas) && (!process.argv.includes('--somente-pendentes') || atual.find(a=>a.codigoInfo===p.codigo)?.revisaoPendente));
  const offline = process.argv.includes('--offline');
  const forcar = process.argv.includes('--forcar');
  const precisamColeta=[];
  for(const p of selecionados) {
    const a=extrasAntigos.find(a=>a.codigo===p.codigo && a.fluxo==='CLIMATIZACAO');
    const valido=a?.validadoFabricante && a.imagens?.length && (await Promise.all([...a.imagens,...(a.documentos || []).map(d=>d.url)].map(existeLocal))).every(Boolean);
    if(forcar || !valido) precisamColeta.push(p);
  }
  let midea=[],agratto=[];
  if (!offline && !somenteInfo) {
    if (precisamColeta.some(p=>marca(p.fabricante)==='Midea')) midea=await mapaMidea();
    if (precisamColeta.some(p=>marca(p.fabricante)==='Agratto')) agratto=await mapaAgratto();
    // Cache compartilhado: cada página oficial é consultada uma única vez por execução.
    const urls=[...midea,...agratto];
    for(let i=0;i<urls.length;i+=4) {
      await Promise.allSettled(urls.slice(i,i+4).map(pagina));
      console.log(`Fontes consultadas: ${Math.min(i+4,urls.length)}/${urls.length}`);
    }
  }
  const resultados=[],links=new Map();
  for (const [i,item] of selecionados.entries()) {
    console.log(`[${i+1}/${selecionados.length}] ${item.codigo} ${item.modelo}`);
    const anterior=atual.find(p=>p.codigoInfo===item.codigo);
    const antigo=extrasAntigos.find(p=>p.codigo===item.codigo && p.fluxo==='CLIMATIZACAO');
    let extra;
    try {
      const reutilizavel = antigo?.validadoFabricante && antigo.imagens?.length &&
        (await Promise.all([...antigo.imagens,...(antigo.documentos || []).map(d=>d.url)].map(existeLocal))).every(Boolean);
      if (somenteInfo) extra=antigo ? {...antigo} : {};
      else if ((offline || !forcar) && reutilizavel) extra={...antigo};
      else if (offline) extra=antigo ? {...antigo} : {pendenciasFonte:['Sem coleta oficial local reutilizável; execute com acesso à internet']};
      else {
        const fabricante=marca(item.fabricante);
        const conf=configuradas[item.codigo];
        if(conf?.url) extra=await coletarPagina(item,[conf.url],fabricante);
        if(!extra && fabricante==='Electrolux') extra=await coletarElectrolux(item);
        if(!extra && fabricante==='Midea') extra=await coletarPagina(item,midea,fabricante);
        if(!extra && fabricante==='Agratto') extra=await coletarPagina(item,agratto,fabricante);
        extra ||= {pendenciasFonte:['Referência exata não localizada na fonte oficial; revisar modelo completo/conjunto']};
        extra.imagens=[];
        for (const u of extra.urlsImagens || []) {
          try { extra.imagens.push(await baixar(u,`assets/produtos/${chave(item.modelo).toLowerCase()}`,'imagem')); }
          catch(e) { (extra.pendenciasFonte ||= []).push(e.message); }
        }
        const docs=[];
        for(const d of extra.documentos || []) {
          try { const local=await baixar(d.url,'assets/documentos','pdf'); docs.push({...d,url:local,urlOriginal:d.url}); }
          catch(e) { (extra.pendenciasFonte ||= []).push(`${d.nome}: ${e.message}`); }
        }
        extra.documentos=docs;
      }
    } catch(e) { extra={pendenciasFonte:[e.message]}; }
    if (!offline && !somenteInfo && extra.validadoFabricante && marca(item.fabricante)==='Agratto') {
      try {
        const documentos=await documentosAgratto(extra,item,pagina);
        if(documentos.length) { extra.documentos=documentos; extra.pendenciasFonte=(extra.pendenciasFonte || []).filter(p=>!p.includes('pastas do fabricante')); }
      } catch(e) { (extra.pendenciasFonte ||= []).push(`Documentos Agratto: ${e.message}`); }
    }
    const transcricao=transcricoes[item.codigo];
    if(transcricao && transcricao.modelo===item.modelo && extra.validadoFabricante) {
      const ficha=(extra.documentos || []).find(d=>d.tipo==='ficha-tecnica');
      const manual=(extra.documentos || []).some(d=>d.tipo==='manual');
      if(ficha && manual) {
        const hash=createHash('sha256').update(await fs.readFile(path.join(raiz,ficha.url))).digest('hex');
        if(hash===transcricao.sha256Ficha) {
          extra.dimensoes={...extra.dimensoes,...transcricao.dimensoes};
          extra.especificacoes={...extra.especificacoes,...transcricao.especificacoes};
          extra.descricao=extra.descricao || transcricao.descricao;
          extra.transcricaoValidada={sha256:hash,pagina:transcricao.paginaFicha,criterio:transcricao.criterio};
        } else (extra.pendenciasFonte ||= []).push('Ficha técnica mudou: revisar transcrição visual antes de usar suas medidas');
      }
    }
    let link={url:'',confirmado:false};
    try {
      if(offline) link={url:anterior?.siteInfoStore || '',confirmado:anterior?.linkInfoConfirmado===true};
      else {
        const info=await localizarInfo(item,pagina,aliases[item.codigo]?.modelos || []);
        link=info.confirmado ? info : await linkInfo(item,anterior);
        if(info.produto && (!extra.validadoFabricante || pendenciasTecnicas(extra,item).length)) {
          const suplemento=extrairInfo(info.produto,item,info.criterio);
          suplemento.imagens=[];
          if(!extra.imagens?.length) for(const url of suplemento.urlsImagens) {
            try {suplemento.imagens.push(await baixar(url,`assets/produtos/${chave(item.modelo).toLowerCase()}`,'imagem'));}
            catch(e) {(suplemento.pendenciasFonte ||= []).push(`Foto Info Store: ${e.message}`);}
          }
          const docs=[];
          if(!extra.documentos?.length) for(const d of suplemento.documentos) {
            try {docs.push({...d,url:await baixar(d.url,'assets/documentos','pdf'),urlOriginal:d.url});}
            catch(e) {(suplemento.pendenciasFonte ||= []).push(`Documento Info Store: ${e.message}`);}
          }
          suplemento.documentos=docs;
          extra=mesclarInfo(extra,suplemento);
        }
      }
    } catch(e) {(extra.pendenciasFonte ||= []).push(`Info Store: ${e.message}`);}
    extra={...extra,modelo:item.modelo,codigo:item.codigo,produtoPlanilha:item.produto,fluxo:'CLIMATIZACAO',dataConsulta:offline ? extra.dataConsulta || null : new Date().toISOString()};
    extra.pendencias=pendenciasTecnicas(extra,item);
    extra.statusExtracao=extra.pendencias.length ? 'REVISAR':'EXTRAIDO';
    links.set(item.codigo,link); resultados.push(extra);
    const novo={...produtoCatalogo(item,extra,anterior,link),linkInfoConfirmado:link.confirmado};
    const idx=atual.findIndex(p=>p.codigoInfo===item.codigo);
    if(idx>=0) atual[idx]=novo; else atual.push(novo);
    // Checkpoint por produto: a interrupção não perde arquivos e registros concluídos.
    const ids=new Set(resultados.map(p=>p.codigo));
    await gravarJSON('dados/enriquecimento-automatico.json',[...extrasAntigos.filter(p=>!ids.has(p.codigo)),...resultados]);
    await gravarJSON('produtos.preview.json',atual);
  }
  const ids=new Set(resultados.map(p=>p.codigo));
  await gravarJSON('dados/fontes-oficiais.json',[...fontesAntigas.filter(p=>!ids.has(p.codigo)),...resultados.map(p=>({modelo:p.modelo,codigo:p.codigo,fonteInterna:p.fonteInterna || '',origemFonte:p.origemFonte || (p.validadoFabricante?'FABRICANTE':''),fonteInfoStore:p.fonteInfoStore || (p.validadoInfoStore?p.fonteInterna:''),fluxo:'CLIMATIZACAO',segmento:'CLIMATIZACAO',statusFonte:(p.validadoFabricante || p.validadoInfoStore)?'LOCALIZADO':'REVISAR',dataConsulta:p.dataConsulta}))]);
  const relatorio=base.map(b=> {const p=atual.find(p=>p.codigoInfo===b.codigo);return {codigo:b.codigo,modelo:b.modelo,marca:marca(b.fabricante),status:p?.revisaoPendente?'REVISAR':'EXTRAIDO',pendencias:p?.pendencias || ['Não processado'],imagens:p?.imagens?.filter(x=>!x.includes('produto-sem-imagem')).length || 0,documentos:p?.documentos?.length || 0,origemDados:p?.origemDados || '',fontesCampos:p?.fontesCampos || {}};});
  await gravarJSON('dados/relatorio-climatizacao.json',relatorio);
  console.log(`Climatização: ${relatorio.length} itens, ${relatorio.filter(p=>p.status==='EXTRAIDO').length} completos, ${relatorio.filter(p=>p.status==='REVISAR').length} em revisão.`);
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) executar().catch(e=>{console.error(e);process.exitCode=1;});
