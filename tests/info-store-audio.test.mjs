import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extrairFichaAudio} from '../scripts/fabricantes/info-store-audio.mjs';
const real=JSON.parse(fs.readFileSync(new URL('./fixtures/jbl-hom0212.json',import.meta.url),'utf8'));
test('ficha real: mantém potência, modelo comercial e componentes separados',()=>{
 const r=extrairFichaAudio(real);assert.equal(r.especificacoes['Modelo comercial'],'JBL Bar 500MK2');assert.equal(r.especificacoes['POTÊNCIA TOTAL DE SAÍDA (MÁX. Rms)'],'375 W Rms');
 assert.deepEqual(r.dimensoes.produto,{largura:'940 mm',altura:'50.5 mm',profundidade:'104 mm'});
 assert.deepEqual(r.dimensoes.subwoofer,{largura:'325 mm',altura:'400 mm',profundidade:'325 mm'});
 assert.deepEqual(r.dimensoes.embalagem,{largura:'1020 mm',altura:'395 mm',profundidade:'490 mm'});
 assert.match(r.especificacoes['CONTEÚDO DA EMBALAGEM'],/subwoofer sem fio/);assert.match(r.especificacoes['CONTEÚDO DA EMBALAGEM'],/Modelo de montagem/);
});
test('não interpreta dados de outros segmentos',()=>{assert.equal(extrairFichaAudio({...real,productName:'Geladeira'}),null);});
test('não inventa unidade nem ordem dos eixos',()=>{const p={productName:'Soundbar', 'Ficha Técnica':['<table><tr><td>Dimensões</td><td>10 x 20 x 30</td></tr></table>']};const r=extrairFichaAudio(p);assert.deepEqual(r.dimensoes,{});assert.equal(r.especificacoes.Dimensões,'10 x 20 x 30');});
test('respeita A x L x P e converte cm explicitamente',()=>{const r=extrairFichaAudio({productName:'Soundbar','Ficha Tecnica':'<table><tr><td>Dimensões do produto (AxLxP)</td><td>5 x 90 x 10 cm</td></tr></table>'});assert.deepEqual(r.dimensoes.produto,{altura:'50 mm',largura:'900 mm',profundidade:'100 mm'});});
