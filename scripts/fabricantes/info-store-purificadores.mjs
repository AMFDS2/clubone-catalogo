import * as cheerio from 'cheerio';
const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function extrairFichaPurificadoresInfoStore(produto={}) {
 if(!/^purificador\b/i.test(produto.productName||''))return null;
 const ficha=Object.entries(produto).find(([k])=>normal(k)==='ficha tecnica')?.[1];
 const $=cheerio.load(Array.isArray(ficha)?ficha.join('\n'):String(ficha||''));
 const especificacoes={},dimensoes={},recursos=[];
 $('tr').each((_,tr)=>{
  const colunas=$(tr).find('td,th').toArray().map(c=>$(c).text().replace(/\s+/g,' ').trim());
  const [nome,bruto]=colunas;const valor=(bruto||'').split(/\s*\|\s*/)[0].trim();if(!valor)return;
  const n=normal(nome);
  if(n.includes('dimens')&&n.includes('produto')){
   const ordem=n.match(/\(\s*([alp])\s*[x×]\s*([alp])\s*[x×]\s*([alp])\s*\)/);
   const valores=valor.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
   if(ordem&&valores&&!/embalagem/i.test(valor)){
    const eixos={a:'altura',l:'largura',p:'profundidade'};dimensoes.produto={};
    for(let i=1;i<=3;i++)dimensoes.produto[eixos[ordem[i]]]=`${Number(valores[i].replace(',','.'))*({mm:1,cm:10,m:1000}[valores[4].toLowerCase()])} mm`;
   }return;
  }
  if(/embalagem/i.test(valor))return;
  if(n==='modelo'){especificacoes['Modelo comercial']=valor;return;}
  if(n==='referencia'||n==='marca')return;
  if(n.includes('peso do produto')){especificacoes['Peso líquido']=valor;return;}
  const par=valor.match(/^([^:]{2,80}):\s*(.+)$/);
  if(!nome||/^especificacoes|^recursos/.test(n)){
   if(par){const rotulo=par[1].trim();if(!/consumo de energia/i.test(rotulo))especificacoes[/^(voltagem|tensao eletrica)$/i.test(normal(rotulo))?'Voltagem':rotulo]=par[2];}
   else recursos.push(valor);
  }else especificacoes[nome]=valor;
 });
 const cor=(produto.productName||'').match(/\b(branco|cinza|grafite|preto)\s*$/i)?.[1];
 if(cor)especificacoes.Cor=cor[0].toUpperCase()+cor.slice(1).toLowerCase();
 if(recursos.length)especificacoes.Recursos=[...new Set(recursos)].join('; ');
 return {especificacoes,dimensoes};
}
