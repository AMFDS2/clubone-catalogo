import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizarOferta,compativel,escolher,tiposPara} from '../api/complementos.js';
const base={id:'tv',nome:'Smart TV 55',categoria:'Video',codigoInfo:'TVV01'};
const oferta=(nome='Soundbar Teste')=>({productName:nome,link:'https://www.infostore.com.br/soundbar/p',brand:'Teste',allSpecifications:[],items:[{itemId:'1',name:'Modelo',referenceId:[{Key:'RefId',Value:'HOM01'}],images:[{imageUrl:'https://infostore.vteximg.com.br/arquivos/ids/1/teste.jpg'}],sellers:[{commertialOffer:{Price:100,AvailableQuantity:2}}]}]});
test('somente acessórios reais: geladeira com soundbar não é soundbar',()=>{assert.equal(normalizarOferta(oferta('Geladeira Family Hub com Soundbar'),'soundbar',base),null);assert(normalizarOferta(oferta(),'soundbar',base));});
test('sem estoque, sem referência ou fora da Info Store não entra',()=>{for(const mudar of [p=>p.items[0].sellers[0].commertialOffer.AvailableQuantity=0,p=>p.items[0].referenceId=[],p=>p.link='https://example.com/p',p=>p.items[0].sellers[0].commertialOffer.Price=0]){const p=oferta();mudar(p);assert.equal(normalizarOferta(p,'soundbar',base),null);}});
test('foto e nome da variante pertencem à oferta com estoque',()=>{const p=oferta();const ruim=structuredClone(p.items[0]);ruim.sellers[0].commertialOffer.AvailableQuantity=0;ruim.name='Sem estoque';p.items.unshift(ruim);assert.equal(normalizarOferta(p,'soundbar',base).preco,100);});
test('não confirma compatibilidade sem evidência e rejeita VESA/peso incompatíveis',()=>{assert.equal(compativel(base,{},'suporte').status,'pendente');assert.equal(compativel({especificacoes:{VESA:'200 x 200'}},{especificacoes:{VESA:'400 x 400'}},'suporte').status,'incompativel');assert.equal(compativel({especificacoes:{'Peso sem base':'20 kg'}},{especificacoes:{'Peso máximo suportado':'15 kg'}},'suporte').status,'incompativel');assert.equal(compativel({especificacoes:{VESA:'200x200'}},{especificacoes:{VESA:'200x200'}},'suporte').status,'pendente');});
test('IA não injeta produtos: ids desconhecidos ignorados e no máximo um por tipo',()=>{const p=normalizarOferta(oferta(),'soundbar',base);const outro={...p,id:'2'};assert.deepEqual(escolher([p,outro],['inventado','2']).map(x=>x.id),['2']);});
test('TV recebe três grupos; segmento sem regra retorna vazio',()=>{assert.deepEqual(tiposPara(base),['suporte','soundbar','alexa']);assert.deepEqual(tiposPara({nome:'Produto desconhecido'}),[]);});

import handler from '../api/complementos.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('endpoint: valida origem/ID, usa IA somente para IDs reais e funciona sem chave',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'complementos-'));const cwd=process.cwd(),originalFetch=global.fetch,key=process.env.GEMINI_API_KEY,model=process.env.COMPLEMENTOS_IA_MODEL;
 const bases=['com-ia','sem-ia','ia-inventa'].map(id=>({...base,id}));await writeFile(path.join(dir,'produtos.preview.json'),JSON.stringify(bases));process.chdir(dir);
 let iaCalls=0,inventar=false;
 global.fetch=async(url,opts)=>{
  if(String(url).includes('generativelanguage')){iaCalls++;assert(!opts.body.includes('cliente'));return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({ids:[inventar?'inventado':'info-2']})}]}}]})};}
  if(String(url).includes('/soundbar?')){const a=oferta();const b=oferta('Soundbar Segunda');b.items[0].itemId='2';b.items[0].referenceId=[{Key:'RefId',Value:'HOM02'}];return {ok:true,json:async()=>[a,b]};}
  return {ok:true,json:async()=>[]};
 };
 const call=async(id,origin)=>{let out;await handler({method:'POST',headers:{host:'catalogo.test',...(origin?{origin}:{})},body:{produtoId:id}},{setHeader(){},status(s){this.code=s;return this;},json(d){out={status:this.code,...d};}});return out;};
 try{
  assert.equal((await call('com-ia','https://evil.test')).status,403);assert.equal((await call('desconhecido')).status,404);
  process.env.GEMINI_API_KEY='teste-sem-chave-real';process.env.COMPLEMENTOS_IA_MODEL='modelo-teste';
  const a=await call('com-ia');assert.equal(a.modo,'ia');assert.equal(a.sugestoes[0].id,'info-2');assert.equal(a.sugestoes[0].compatibilidade.status,'pendente');
  delete process.env.GEMINI_API_KEY;const b=await call('sem-ia');assert.equal(b.modo,'catalogo');assert.equal(iaCalls,1);
  process.env.GEMINI_API_KEY='teste';inventar=true;const c=await call('ia-inventa');assert.equal(c.modo,'catalogo');assert.equal(c.sugestoes[0].id,'info-1');
 }finally{process.chdir(cwd);global.fetch=originalFetch;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(model===undefined)delete process.env.COMPLEMENTOS_IA_MODEL;else process.env.COMPLEMENTOS_IA_MODEL=model;await rm(dir,{recursive:true});}
});
