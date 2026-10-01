import * as cheerio from 'cheerio';
export const limpar = v => String(v ?? '').replace(/\s+/g, ' ').trim();
export const chave = v => limpar(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
export const normalizar = v => limpar(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const ehClimatizacao = p => /climatizacao/.test(normalizar(p.segmento || p.categoria));
export const marca = v => limpar(v).replace(/\s*\(NAC\)\s*/i, '').toLowerCase().replace(/^./, c => c.toUpperCase());
export const tipo = p => /cassete/i.test(p.produto || p.nome) ? 'ar-cassete' : /piso.?teto/i.test(p.produto || p.nome) ? 'ar-piso-teto' : /janela/i.test(p.produto || p.nome) ? 'ar-janela' : 'ar-split';
// Prefixos só confirmam a outra unidade quando há um componente completo exato.
export function confirmarModelo(modelo, referencias) {
  const partes = String(modelo).split('/').map(chave).filter(Boolean);
  const tokens = referencias.flatMap(r => String(r || '').toUpperCase().split(/[^A-Z0-9-]+|X(?=\d)/).map(chave)).filter(Boolean);
  const completos = partes.filter(p => p.length >= (partes.length === 1 ? 4 : 5));
  if (!partes.length || !completos.length || !completos.some(p => tokens.includes(p))) return false;
  return partes.every(p => tokens.includes(p) || (p.length < 7 && /^(38|42)/.test(p) && tokens.some(t => t.startsWith(p))));
}
export function mm(v) {
  const m = limpar(v).match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)$/i);
  if (!m) return ''; // Nunca supõe unidade.
  const n = Number(m[1].replace(',', '.')) * ({ mm: 1, cm: 10, m: 1000 }[m[2].toLowerCase()]);
  return n > 0 ? `${Math.round(n * 1000) / 1000} mm` : '';
}
export const completo = g => ['largura', 'altura', 'profundidade'].every(k => mm(g?.[k]));
export function propriedades(produto) {
  const props = {};
  for (const [k, v] of Object.entries(produto || {})) if (Array.isArray(v) && v.every(x => typeof x === 'string')) props[k] = v[0];
  for (const grupo of produto.specificationGroups || []) for (const p of grupo.specifications || []) props[p.name] = p.values?.[0];
  for (const p of produto.additionalProperty || []) props[p.name] = p.value;
  return props;
}
const campos = [
  ['Capacidade de refrigeração', ['Capacidade total de refrigeração (BTU/h)', 'Capacidade de Refrigeração', 'Capacidade - Ar condicionado', 'Capacidade']],
  ['Voltagem', ['Tensão (V)', 'Tensão', 'Voltagem']], ['Ciclo', ['Ciclo (frio/quente e frio)', 'Ciclo']],
  ['Compressor', ['Compressor', 'Tecnologia Inverter']],
  ['Classificação energética', ['Classificação Energética', 'Classificação energética (INMETRO)', 'Eficiência energética']],
  ['Fluido refrigerante', ['Fluido Refrigerante', 'Gás refrigerante']],
  ['Consumo anual', ['Consumo de Energia kWh/ano', 'Consumo de energia']],
  ['IDRS', ['Índice de Desempenho de Resfriamento Sazonal - IDRS (Wh/Wh)', 'IDRS']],
  ['Wi-Fi', ['Wi-Fi', 'Produto conectado', 'Conectividade']], ['Frequência', ['Frequência (Hz)', 'Frequência']],
  ['Vazão de ar', ['Vazão de ar  (m³/h)', 'Vazão de ar (m³/h)']], ['Cor', ['Cor']],
  ['Ruído interno', ['Nível de ruído (unidade interna)', 'Nível de ruído interno']],
  ['Ruído externo', ['Nível de ruído (unidade externa)', 'Nível de ruído externo']]
];
export function extrairPropriedades(props) {
  const entradas = Object.entries(props).map(([k,v]) => [normalizar(k), limpar(v)]);
  const get = nomes => nomes.map(normalizar).map(n => entradas.find(([k]) => k === n)?.[1]).find(Boolean) || '';
  const especificacoes = Object.fromEntries(campos.map(([k, ns]) => [k, get(ns)]).filter(([,v]) => v));
  const dimensoes = {};
  for (const [grupo, componente, unidade, embalado] of [
    ['evaporadora', 'Evaporadora', 'interna', false], ['condensadora', 'Condensadora', 'externa', false],
    ['embalagemEvaporadora', 'Evaporadora', 'interna', true], ['embalagemCondensadora', 'Condensadora', 'externa', true]
  ]) {
    const d = {};
    for (const [eixo, rotulo] of [['largura','Largura'], ['altura','Altura'], ['profundidade','Profundidade']]) {
      const val = get([`${rotulo} do produto${embalado ? ' embalado' : ''} (unidade ${unidade})`, `Produto${embalado ? ' Embalado' : ''} ${rotulo} ${componente} (cm)`]);
      const campoCm = `Produto${embalado ? ' Embalado' : ''} ${rotulo} ${componente} (cm)`;
      const possuiUnidadeNoRotulo = entradas.some(([k,v]) => k === normalizar(campoCm) && v === val);
      const explicito = /^\d+(?:[.,]\d+)?$/.test(val) && possuiUnidadeNoRotulo ? `${val} cm` : val;
      if (mm(explicito)) d[eixo] = mm(explicito);
    }
    const peso = get([`Peso do produto${embalado ? ' embalado' : ''} (unidade ${unidade})`, `Produto${embalado ? ' Embalado' : ''} Peso ${componente} (kg)`]);
    if (peso) d.peso = peso;
    if (Object.keys(d).length) dimensoes[grupo] = d;
  }
  return { especificacoes, dimensoes };
}
export function referenciasProduto(p) {
  return [p.name, p.sku, p.productName, p.productReference, p.referenceCode, p.productReferenceCode,
    propriedades(p)['Código do Produto'], ...(p.items || []).flatMap(s => [s.nameComplete, s.name, ...(s.referenceId || []).map(r => r.Value)])];
}
export function extrairEstruturado(p, item) {
  if (!confirmarModelo(item.modelo, referenciasProduto(p))) return null;
  const props = propriedades(p);
  const { especificacoes, dimensoes } = extrairPropriedades(props);
  const documentos = Object.entries(props).filter(([k,v]) => /manual|instalacao|guia|ficha tecnica/.test(normalizar(k)) && /\.pdf(?:[?#]|$)/i.test(v || '')).map(([nome,url]) => ({nome, url, tipo: /instala/i.test(nome) ? 'instalacao' : 'manual', fonte: marca(item.fabricante), descricao: 'Documento disponibilizado na página oficial do produto'}));
  const imgs = typeof p.image === 'string' ? [p.image] : p.image || [];
  const urlsImagens = [...new Set([...imgs.map(i => typeof i === 'string' ? i : i.url), ...(p.items || []).flatMap(s => (s.images || []).map(i => i.imageUrl))].filter(Boolean))];
  return { tituloOficial: p.isVariantOf?.name || p.productName || p.name,
    descricao: limpar(cheerio.load(`<div>${p.description || ''}</div>`)('div').text()), especificacoes, dimensoes, documentos,
    urlsImagens: urlsImagens.slice(0, 8), referenciasConfirmadas: referenciasProduto(p).filter(Boolean), validadoFabricante: true };
}
export function extrairMidea(html, item) {
  const $ = cheerio.load(html);
  try { return extrairEstruturado(JSON.parse($('#__NEXT_DATA__').text()).props.pageProps.data.product, item); } catch { return null; }
}
export function extrairAgratto(html, item) {
  const $ = cheerio.load(html); let p;
  $('script[type="application/ld+json"]').each((_, el) => { try { const d = JSON.parse($(el).text()); if (d['@type'] === 'Product') p = d; } catch {} });
  if (!p || !confirmarModelo(item.modelo, [p.name])) return null;
  const urlsImagens = (Array.isArray(p.image) ? p.image : [p.image]).filter(Boolean);
  $('img').each((_,el) => {
    if (!confirmarModelo(item.modelo, [$(el).attr('alt') || ''])) return;
    const u = $(el).attr('data-src') || $(el).attr('src');
    if (u?.startsWith('https:') && !urlsImagens.includes(u)) urlsImagens.push(u);
  });
  return {tituloOficial: p.name, descricao: limpar(p.description), urlsImagens: urlsImagens.slice(0,6), especificacoes: {}, dimensoes: {}, documentos: [],
    validadoFabricante: true, referenciasConfirmadas: [p.name], pendenciasFonte: ['Ficha técnica e manual publicados em pastas do fabricante: confirmar o arquivo exato antes da importação']};
}
export function pendenciasTecnicas(extra, item) {
  const p = [...(extra.pendenciasFonte || [])];
  if (!extra.validadoFabricante && !extra.validadoInfoStore) p.push('Modelo não confirmado na fonte oficial ou Info Store');
  if (!extra.descricao) p.push('Descrição ausente nas fontes consultadas');
  if (!extra.imagens?.length) p.push('Imagem local ausente');
  if (!extra.documentos?.length) p.push('Manual local ausente nas fontes consultadas');
  for (const grupo of tipo(item) === 'ar-janela' ? ['produto'] : ['evaporadora','condensadora']) if (!completo(extra.dimensoes?.[grupo])) p.push(`Dimensões completas de ${grupo} ausentes`);
  for (const k of ['Capacidade de refrigeração','Voltagem','Ciclo']) if (!extra.especificacoes?.[k]) p.push(`${k} não confirmado`);
  if (/\bINV\b/i.test(item.produto) && !extra.especificacoes?.Compressor && !/inverter/i.test(extra.tituloOficial || '')) p.push('Planilha indica inverter, mas a tecnologia não está confirmada nos campos oficiais');
  if (/\bINV\b/i.test(item.produto) && (/fixo|on.?off|convencional/i.test(`${extra.tituloOficial || ''} ${extra.especificacoes?.Compressor || ''}`) || /^nao$/i.test(normalizar(extra.especificacoes?.Compressor)))) p.push('Divergência: planilha indica inverter; fonte principal indica compressor fixo/on-off');
  return [...new Set(p)];
}

export function extrairGenerico(html,item) {
  const $=cheerio.load(html);let resultado=null;
  $('script[type="application/ld+json"]').each((_,el)=>{
    try {
      const d=JSON.parse($(el).text());const objetos=Array.isArray(d)?d:d['@graph'] || [d];
      for(const p of objetos) {
        if(p['@type']==='Product' || Array.isArray(p['@type']) && p['@type'].includes('Product')) {
          const extra=extrairEstruturado(p,item); if(extra) resultado=extra;
        }
      }
    } catch {}
  });
  return resultado;
}
