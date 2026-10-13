// Fluxo focado: localiza e enriquece apenas as soundbars JBL da planilha atual.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function executar(arquivo,env={}){
 console.log(`\n>>> ${arquivo}`);
 const r=spawnSync(process.execPath,[path.join(raiz,'scripts',arquivo)],{cwd:raiz,stdio:'inherit',env:{...process.env,...env}});
 if(r.error)throw r.error;if(r.status!==0)throw Error(`${arquivo} não concluiu. Verifique o erro acima.`);
}
try{
 executar('ler-planilha.mjs');
 executar('verificar-catalogo.mjs');
 const base=JSON.parse(readFileSync(path.join(raiz,'dados','produtos-base.json'),'utf8'));
 const codigos=[...new Set(base.filter(p=>/jbl/i.test(p.fabricante||'')&&/sound\s*bar/i.test(p.produto||'')).map(p=>String(p.codigo||'').trim()).filter(Boolean))];
 if(!codigos.length)throw Error('Nenhuma soundbar JBL com código Info Store encontrada na planilha. Confira FABRICANTE, PRODUTO e CODIGO.');
 console.log(`\nSoundbars JBL: ${codigos.join(', ')}`);
 const env={TESTAR_CODIGOS:codigos.join(','),FORCAR_ATUALIZACAO:'1',FORCAR_PORTATEIS:'0'};
 executar('localizar-fontes.mjs',env);
 executar('enriquecer-produtos.mjs',env);
 executar('gerar-catalogo-preview.mjs');
 console.log('\nAtualização concluída. Confira o catálogo e os registros REVISAR/ERRO do enriquecimento.');
 console.log('Este fluxo não extrai manuais nem inventa medidas ausentes.');
}catch(e){console.error(e.message);process.exitCode=1;}
