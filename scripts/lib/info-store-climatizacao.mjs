import * as cheerio from 'cheerio';
import { chave, normalizar, limpar, marca, confirmarModelo, extrairPropriedades } from './climatizacao.mjs';

export function urlInfoValida(url) {
  try { const u=new URL(url); return u.protocol==='https:' && /^(www\.)?infostore\.com\.br$/.test(u.hostname) && /\/p$/.test(u.pathname); } catch { return false; }
}
export function fichaInfo(p) {
  const campos={};
  for(const [k,v] of Object.entries(p)) {
    if(Array.isArray(v) && v.every(x=>typeof x==='string' && !/<[a-z][^>]*>/i.test(x)) && !/categories|clusters|allSpecifications/i.test(k)) campos[k]=limpar(v.join(' '));
    if(/ficha\s*t[eé]cnica/i.test(k)) {
      const $=cheerio.load(Array.isArray(v)?v.join('\n'):String(v));
      $('tr').each((_,tr)=>{const td=$(tr).find('td,th');if(td.length===2) campos[limpar(td.eq(0).text())]=limpar(td.eq(1).text());});
      delete campos[k];
    }
  }
  return campos;
}
export function validarInfo(p,item,aliases=[]) {
  if(chave(p.brand)!==chave(marca(item.fabricante))) return false;
  const campos=fichaInfo(p);
  const refs=[p.productName,...Object.entries(campos).filter(([k])=>/^(modelo|referencia|codigo do produto)$/.test(normalizar(k))).map(([,v])=>v)];
  return [item.modelo,...aliases].some(m=>confirmarModelo(m,refs));
}
export async function localizarInfo(item,pagina,aliases=[]) {
  const consultar=async query=>JSON.parse(await pagina('https://www.infostore.com.br/api/catalog_system/pub/products/search?'+query));
  const peloCodigo=await consultar('fq=alternateIds_RefId:'+encodeURIComponent(item.codigo));
  const refs=p=>([p.productReference,...(p.items||[]).flatMap(s=>(s.referenceId||[]).map(r=>r.Value))]);
  const exatos=peloCodigo.filter(p=>refs(p).some(v=>chave(v)===chave(item.codigo)));
  if(exatos.length===1 && validarInfo(exatos[0],item,aliases) && urlInfoValida(exatos[0].link)) return {produto:exatos[0],criterio:'CODIGO_E_MODELO',url:exatos[0].link,confirmado:true};
  // Pesquisa pelo modelo completo e pelos componentes; só aceita a ficha do mesmo SKU.
  for(const termo of [...new Set([item.modelo,...item.modelo.split('/'),...aliases])].filter(t=>chave(t).length>=5)) {
    const lista=await consultar('ft='+encodeURIComponent(termo));
    const candidatos=lista.filter(p=>validarInfo(p,item,aliases)&&urlInfoValida(p.link));
    const doCodigo=candidatos.filter(p=>refs(p).some(v=>chave(v)===chave(item.codigo)));
    if(doCodigo.length===1) return {produto:doCodigo[0],criterio:'PESQUISA_MODELO_E_CODIGO',url:doCodigo[0].link,confirmado:true};
  }
  return {url:'',confirmado:false};
}
function dimensoesTabela(campos) {
  const dimensoes={},pendencias=[];
  for(const [k,v] of Object.entries(campos)) {
    if(!/dimensoes/.test(normalizar(k)) || /embalagem/.test(normalizar(k))) continue;
    const ordem=normalizar(k).match(/\(([alp])\s*[x×]\s*([alp])\s*[x×]\s*([alp])\)/);
    if(!ordem) {pendencias.push('Info Store: ordem dos eixos não informada em '+k+'; medidas preservadas na ficha, sem gerar vistas');continue;}
    const eixos={a:'altura',l:'largura',p:'profundidade'};
    const segmentos=v.split(/[;•]/);
    for(const segmento of segmentos) {
      const m=segmento.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m)\b/i);
      if(!m) continue;
      const grupo=/evaporadora/i.test(segmento)?'evaporadora':/condensadora/i.test(segmento)?'condensadora':/painel/i.test(segmento)?'painel':'produto';
      const fator={mm:1,cm:10,m:1000}[m[4].toLowerCase()];
      dimensoes[grupo]=Object.fromEntries(ordem.slice(1).map((e,i)=>[eixos[e],`${Math.round(Number(m[i+1].replace(',','.'))*fator*1000)/1000} mm`]));
    }
  }
  return {dimensoes,pendencias};
}
export function extrairInfo(p,item,criterio) {
  const campos=fichaInfo(p);
  const equivalencias={'capacidade de refrigeracao':'Capacidade de refrigeração','voltagem':'Voltagem','tensao':'Voltagem','ciclo':'Ciclo','tecnologia do compressor':'Compressor','tipo de compressor':'Compressor','compressor':'Compressor','classificacao energetica':'Classificação energética','gas refrigerante':'Fluido refrigerante','fluido refrigerante':'Fluido refrigerante','consumo anual de energia':'Consumo anual','consumo de energia':'Consumo anual','wi-fi':'Wi-Fi','conectividade':'Wi-Fi','frequencia':'Frequência','vazao de ar':'Vazão de ar','idrs':'IDRS','cor':'Cor'};
  const {especificacoes,dimensoes:estruturadas}=extrairPropriedades(campos);
  for(const [k,v] of Object.entries(campos)) {
    if(['marca','modelo','referencia','categories','categoriesids','ficha tecnica'].includes(normalizar(k))) continue;
    const destino=equivalencias[normalizar(k)] || k.toLowerCase().replace(/^./,s=>s.toUpperCase());
    if(!especificacoes[destino]) especificacoes[destino]=v;
  }
  if(!especificacoes.Compressor && /inverter/i.test(campos.TIPO || campos.TECNOLOGIA || '')) especificacoes.Compressor=campos.TECNOLOGIA || 'Inverter';
  const {dimensoes,pendencias}=dimensoesTabela(campos);
  const $=cheerio.load(p.description || '');
  const descricao=$('p').slice(0,3).map((_,el)=>limpar($(el).text())).get().join('\n\n') || limpar($.root().text());
  const documentos=[];
  for(const [k,v] of Object.entries(p)) if(/manual|guia|ficha/i.test(k)) {
    const $doc=cheerio.load(Array.isArray(v)?v.join('\n'):String(v));
    const urls=[...String(v).matchAll(/https:\/\/[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?/gi)].map(m=>m[0]);
    $doc('a[href]').each((_,el)=>{const url=$doc(el).attr('href');if(/\.pdf(?:[?#]|$)/i.test(url)&&url.startsWith('https://')) urls.push(url);});
    for(const url of new Set(urls)) documentos.push({nome:limpar(k),url,tipo:/manual/i.test(k)?'manual':'ficha-tecnica',fonte:'Info Store',descricao:'Documento disponibilizado na página do produto na Info Store'});
  }
  return {tituloOficial:p.productName,descricao,especificacoes,dimensoes:{...estruturadas,...dimensoes},documentos,
    urlsImagens:[...new Set((p.items||[]).flatMap(s=>(s.images||[]).map(i=>i.imageUrl)).filter(Boolean))].slice(0,12),
    validadoInfoStore:true,origemFonte:'INFO_STORE',fonteInterna:p.link,referenciasConfirmadas:[item.codigo,campos.MODELO,campos['REFERÊNCIA']].filter(Boolean),criterioInfoStore:criterio,pendenciasFonte:pendencias};
}
export function mesclarInfo(principal,info) {
  if(!principal.validadoFabricante && !principal.validadoInfoStore) return {...info};
  const resultado={...principal,validadoInfoStore:true,fonteInfoStore:info.fonteInterna};
  const fontes={...(principal.fontesCampos||{})};
  for(const k of ['tituloOficial','descricao','imagens','documentos']) if(!resultado[k]?.length && info[k]?.length) {resultado[k]=info[k];fontes[k]='INFO_STORE';}
  const specsPrincipal=Object.fromEntries(Object.entries(principal.especificacoes || {}).filter(([k,v])=>!(/<[a-z][^>]*>/i.test(v) && (principal.origemFonte==='INFO_STORE' || principal.fontesCampos?.['especificacoes.'+k]==='INFO_STORE'))));
  resultado.especificacoes={...info.especificacoes,...specsPrincipal};
  resultado.dimensoes={...principal.dimensoes};
  for(const [g,d] of Object.entries(info.dimensoes||{})) resultado.dimensoes[g]={...d,...principal.dimensoes?.[g]};
  for(const k of Object.keys(info.especificacoes||{})) if(!principal.especificacoes?.[k]) fontes['especificacoes.'+k]='INFO_STORE';
  for(const [g,d] of Object.entries(info.dimensoes||{})) for(const k of Object.keys(d)) if(!principal.dimensoes?.[g]?.[k]) fontes['dimensoes.'+g+'.'+k]='INFO_STORE';
  resultado.fontesCampos=fontes;
  resultado.pendenciasFonte=[...(principal.pendenciasFonte||[]),...(info.pendenciasFonte||[]).filter(x=>!Object.keys(principal.dimensoes||{}).length)];
  return resultado;
}
