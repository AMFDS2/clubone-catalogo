import * as cheerio from 'cheerio';
const limpar=v=>String(v||'').replace(/\s+/g,' ').trim();
const normal=v=>limpar(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

// A VTEX entrega a ficha de áudio como uma tabela HTML, não como campos separados.
export function extrairFichaAudio(produto={},item={}) {
  if(![produto.productName,item.produto].some(v=>/^\s*(sound\s*bar|barra de som)\b/i.test(v||'')))return null;
  const especificacoes={},dimensoes={},linhas=[];
  for(const [chave,conteudo] of Object.entries(produto)){
    if(!/^ficha\s*tecnica$/i.test(normal(chave)))continue;
    const $=cheerio.load((Array.isArray(conteudo)?conteudo:[conteudo]).join('\n'));
    $('script,style').remove();
    $('table').each((_,table)=>{
      let rotulo='';
      $(table).find('tr').each((_,tr)=>{
        const cells=$(tr).children('td,th');if(cells.length<2)return;
        const nome=limpar($(cells[0]).text());if(nome)rotulo=nome;
        const valor=limpar(cells.slice(1).map((_,td)=>$(td).text()).get().join(' '));
        if(!rotulo||!valor)return;
        linhas.push({rotulo,valor});
        const campo=normal(rotulo)==='modelo'?'Modelo comercial':rotulo;
        especificacoes[campo]=especificacoes[campo]?`${especificacoes[campo]}; ${valor}`:valor;
      });
    });
  }
  for(const {rotulo,valor} of linhas){
    const r=normal(rotulo),v=normal(valor);
    if(!r.includes('dimens'))continue;
    // Só converte quando a ordem dos eixos e a unidade estão explícitas.
    const ordem=`${r} ${v}`.match(/\b([lap])\s*[x×]\s*([lap])\s*[x×]\s*([lap])\b/);
    const tripla=valor.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
    if(!ordem||new Set(ordem.slice(1)).size!==3||!tripla)continue;
    const contexto=`${r} ${v}`;
    let grupo=/embalagem|caixa de transporte/.test(contexto)?'embalagem':/subwoofer/.test(contexto)?'subwoofer':/surround|satelite|traseira/.test(contexto)?'surround':/soundbar|barra de som|barra principal/.test(contexto)?'produto':null;
    if(!grupo&&/dimensoes do produto/.test(r)&&linhas.filter(l=>l.rotulo===rotulo).length===1)grupo='produto';
    if(!grupo)continue;
    const escala={mm:1,cm:10,m:1000}[tripla[4].toLowerCase()],campos={l:'largura',a:'altura',p:'profundidade'};
    const medidas=Object.fromEntries(ordem.slice(1).map((e,i)=>[campos[e],`${Number((Number(tripla[i+1].replace(',','.'))*escala).toFixed(3))} mm`]));
    if(!dimensoes[grupo])dimensoes[grupo]=medidas;
  }
  return {especificacoes,dimensoes};
}
