import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { confirmarModelo, mm, extrairPropriedades, extrairEstruturado, extrairMidea, pendenciasTecnicas } from '../scripts/lib/climatizacao.mjs';
import { produtoCatalogo } from '../scripts/automatizar-climatizacao.mjs';

test('Conjunto invertido é exato; prefixo exige outro componente completo',()=>{
  assert.equal(confirmarModelo('JE09F/JI09F',['JI09F/JE09F']),true);
  assert.equal(confirmarModelo('38EZVCA09M5/42EZ',['42EZVCA09M5x38EZVCA09M5']),true);
  assert.equal(confirmarModelo('38EZVCA09M5/42EZ',['42EZVCA12M5x38EZVCA12M5']),false);
  assert.equal(confirmarModelo('38CCV/40KVQF36C5A',['40KVQF36C5A/38CCVF36515MC']),true);
  assert.equal(confirmarModelo('38TF/42AFFCI09S5',['38TFCI09S5/42AFFCI09S5']),true);
});
test('Unidade obrigatória; decimal convertido sem arredondamento de centímetros',()=>{
  assert.equal(mm('28,6 cm'),'286 mm');assert.equal(mm('0,74 m'),'740 mm');assert.equal(mm('740'),'');assert.equal(mm('740 x 469 mm'),'');
});
test('Separa evaporadora e condensadora, exclui embalagem do envelope físico',()=>{
 const r=extrairPropriedades({'Produto Altura Evaporadora (cm)':'28,6 cm','Produto Altura Condensadora (cm)':'46,9 cm','Produto Embalado Altura Evaporadora (cm)':'34,5 cm','Largura do produto':'74 cm'});
 assert.equal(r.dimensoes.evaporadora.altura,'286 mm');assert.equal(r.dimensoes.condensadora.altura,'469 mm');assert.equal(r.dimensoes.embalagemEvaporadora.altura,'345 mm');assert.equal(r.dimensoes.produto,undefined);
});
test('Produto errado e JSON-LD de recomendações não enriquecem o modelo',()=>{
 const b={modelo:'38EZVCA09M5/42EZ',fabricante:'MIDEA (NAC)'};
 assert.equal(extrairEstruturado({name:'42EZVCA12M5x38EZVCA12M5'},b),null);
 assert.equal(extrairMidea('<script type="application/ld+json">{"name":"38EZVCA09M5"}</script>',b),null);
});
test('Ausência de documentos, duas unidades e fonte sempre produz revisão',()=>{
 const p=pendenciasTecnicas({imagens:['x'],especificacoes:{Voltagem:'220'}},{produto:'MIDEA INV 9000'});
 assert.ok(p.some(x=>x.includes('Manual')));assert.ok(p.some(x=>x.includes('evaporadora')));assert.ok(p.some(x=>x.includes('fonte oficial')));
});
test('Link de busca sem confirmação não aparece como página do produto',()=>{
 const p=produtoCatalogo({modelo:'ABC123',codigo:'ARC001',fabricante:'MIDEA (NAC)',produto:'INV',segmento:'CLIMATIZACAO'},{pendencias:[]},{}, {url:'https://www.infostore.com.br/busca',confirmado:false});
 assert.equal(p.siteInfoStore,'');assert.equal(p.revisaoPendente,true);
});
test('Frontend não abre PDFs externos e desenha as duas unidades',()=>{
 const context={document:{addEventListener(){}},window:{},Set,URL};vm.createContext(context);
 vm.runInContext(fs.readFileSync(new URL('../script.js',import.meta.url),'utf8'),context);
 assert.ok(!vm.runInContext('criarDocumentos([{nome:"Manual",url:"https://docs.google.com/a"}])',context).includes('<a '));
 assert.ok(vm.runInContext('criarDocumentos([{nome:"Manual",url:"assets/documentos/a.pdf"}])',context).includes('<a '));
 assert.equal(vm.runInContext('criarBotaoInfoStore("https://example.org/a/p")',context),'');
 assert.equal(vm.runInContext('criarBotaoInfoStore("https://www.infostore.com.br/busca")',context),'');
 vm.runInContext(fs.readFileSync(new URL('../blocagem.js',import.meta.url),'utf8'),context);
 const html=context.window.criarBlocagemDimensional({evaporadora:{largura:'723 mm',altura:'286 mm',profundidade:'199 mm'},condensadora:{largura:'740 mm',altura:'469 mm',profundidade:'252 mm'}},{tipoBloco:'ar-split'});
 assert.ok(html.includes('Evaporadora'));assert.ok(html.includes('Condensadora'));assert.equal((html.match(/<svg/g)||[]).length,6);
});

test('Centímetros explícitos no nome do campo permitem valores numéricos; genéricos não',()=>{
 const r=extrairPropriedades({'Produto Altura Evaporadora (cm)':'28,5','Largura do produto':'74'});
 assert.equal(r.dimensoes.evaporadora.altura,'285 mm'); assert.equal(r.dimensoes.produto,undefined);
});
