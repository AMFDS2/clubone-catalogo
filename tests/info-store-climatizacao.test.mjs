import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairInfo, validarInfo, localizarInfo, mesclarInfo } from '../scripts/lib/info-store-climatizacao.mjs';
import { produtoCatalogo } from '../scripts/automatizar-climatizacao.mjs';
const item={codigo:'ARC123',modelo:'MY-AV1030BR',fabricante:'MYSTIC',produto:'MYSTIC JANELA'};
const tabela=(rows)=>'<table>'+rows.map(([a,b])=>`<tr><td>${a}</td><td>${b}</td></tr>`).join('')+'</table>';
const produto={brand:'MYSTIC',productReference:'ARC123',productName:'Mystic MY-AV1030BR',link:'https://www.infostore.com.br/mystic/p',description:'<p>Descrição do produto</p>', 'Ficha Tecnica':[tabela([['MODELO','MY-AV1030BR'],['VOLTAGEM','127V'],['DIMENSÕES DO PRODUTO (A × L × P)','44 × 47 × 34 cm']])],items:[{referenceId:[{Value:'ARC123'}],images:[{imageUrl:'https://infostore.vteximg.com.br/a.jpg'}]}]};
test('Ficha da Info Store confirma modelo e marca, não promove outro modelo',()=>{
 assert.equal(validarInfo(produto,item),true);
 assert.equal(validarInfo(produto,{...item,modelo:'MY-AV5080'}),false);
 assert.equal(validarInfo({...produto,brand:'MIDEA'},item),false);
 const extra=extrairInfo(produto,item,'CODIGO_E_MODELO');
 assert.deepEqual(extra.dimensoes.produto,{altura:'440 mm',largura:'470 mm',profundidade:'340 mm'});
 assert.equal(extra.especificacoes.Voltagem,'127V');assert.equal(extra.validadoFabricante,undefined);
 const catalogo=produtoCatalogo(item,{...extra,imagens:['assets/a.jpg'],pendencias:['Manual ausente']},{},{url:produto.link,confirmado:true});
 assert.equal(catalogo.imagem,'assets/a.jpg');assert.equal(catalogo.origemDados,'INFO_STORE');assert.equal(catalogo.descricao,'Descrição do produto');
});
test('Dimensões sem ordem ficam na ficha sem inventar vistas ou medidas de instalação',()=>{
 const p={...produto,'Ficha Tecnica':[tabela([['MODELO','MY-AV1030BR'],['DIMENSÕES DO PRODUTO','44 × 47 × 34 cm']])]};
 const extra=extrairInfo(p,item);assert.deepEqual(extra.dimensoes,{});assert.ok(extra.pendenciasFonte.some(p=>p.includes('ordem dos eixos')));
});
test('Fabricante tem prioridade por campo; Info Store preenche ausências',()=>{
 const p={validadoFabricante:true,descricao:'Fabricante',imagens:['assets/f.jpg'],especificacoes:{Voltagem:'220V'},dimensoes:{evaporadora:{largura:'800 mm'}},documentos:[]};
 const r=mesclarInfo(p,{descricao:'Loja',imagens:['assets/l.jpg'],especificacoes:{Voltagem:'127V',Ciclo:'Frio'},dimensoes:{evaporadora:{largura:'900 mm',altura:'300 mm'}},documentos:[],fonteInterna:produto.link});
 assert.equal(r.descricao,'Fabricante');assert.equal(r.especificacoes.Voltagem,'220V');assert.equal(r.especificacoes.Ciclo,'Frio');assert.equal(r.dimensoes.evaporadora.largura,'800 mm');assert.equal(r.dimensoes.evaporadora.altura,'300 mm');assert.equal(r.fontesCampos['especificacoes.Ciclo'],'INFO_STORE');
});
test('Pesquisa por modelo ainda exige o mesmo código, sem substituição aproximada',async()=>{
 const queries=[];const pagina=async url=>{queries.push(url);return JSON.stringify(url.includes('fq=')?[]:[produto]);};
 const r=await localizarInfo(item,pagina);assert.equal(r.confirmado,true);assert.ok(queries.some(q=>q.includes('ft=MY-AV1030BR')));
 const errado=await localizarInfo({...item,codigo:'ARC999'},pagina);assert.equal(errado.confirmado,false);
});
