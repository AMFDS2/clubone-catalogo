import assert from 'node:assert/strict';
import {produtoElectroluxCompativel} from '../scripts/fabricantes/electrolux.mjs';
const item={modelo:'09140GBC006',produto:'PURIFICADOR AGUA TOUCH PE12B BRA BIVOLT'};
for(const nome of ['Refil para purificador PE12B','Kit 2 Filtros para PE12B','Filtro original Electrolux PE12B','Purificador PE12G','Purificador PE12BX'])assert.equal(produtoElectroluxCompativel({productName:nome},item),false,nome);
assert.equal(produtoElectroluxCompativel({productName:'Purificador de Água Electrolux PE12B com filtro Acqua Pure'},item),true);
assert.equal(produtoElectroluxCompativel({productName:'Refil PE12B',productReference:'09140GBC006'},item),false);
console.log('OK: rejeita refis, kits, modelos diferentes e coincidências parciais; aceita aparelho com modelo correto.');
