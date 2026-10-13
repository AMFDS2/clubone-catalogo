import assert from 'node:assert/strict';
import {extrairFichaPurificadoresInfoStore as extrair} from '../scripts/fabricantes/info-store-purificadores.mjs';
const r=extrair({productName:'Purificador Electrolux PN10X Preto','Ficha Tecnica':['<table><tr><td>DIMENSÕES DO PRODUTO (A x L x P)</td><td>33 x 14,4 x 20,9 cm | 33 x 18,5 x 26,8 cm (Com embalagem)</td></tr><tr><td>PESO DO PRODUTO</td><td>1,5 kg | 1,9 kg (Com embalagem)</td></tr></table>']});
assert.deepEqual(r.dimensoes.produto,{altura:'330 mm',largura:'144 mm',profundidade:'209 mm'});
assert.equal(r.especificacoes['Peso líquido'],'1,5 kg');assert.equal(r.especificacoes.Cor,'Preto');
assert.equal(extrair({productName:'Refil PN10X'}),null);
console.log('OK: produto separado da embalagem, eixos explícitos, cor e rejeição de refil.');
