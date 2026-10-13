import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const normal=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const ler=async(arquivo,opcional=false)=>{try{const v=JSON.parse(await fs.readFile(path.join(raiz,arquivo),'utf8'));if(!Array.isArray(v))throw Error(`${arquivo}: formato inesperado`);return v;}catch(e){if(opcional&&e.code==='ENOENT')return [];throw e;}};
const correcoes=await ler('scripts/correcoes/produtos-20261013.json');
const arquivos=['produtos.preview.json','dados/enriquecimento-automatico.json','dados/fontes-oficiais.json'];
const [catalogo,cache,fontes]=await Promise.all(arquivos.map((p,i)=>ler(p,i>0)));
// Valida toda a atualização antes de escrever qualquer dado.
for(const c of correcoes){
 const encontrados=catalogo.filter(p=>normal(p.codigoInfo)===normal(c.codigo));
 if(encontrados.length!==1)throw Error(`${c.codigo}: esperado um cadastro, encontrados ${encontrados.length}. Nenhum dado foi alterado.`);
 if(normal(encontrados[0].modelo)!==normal(c.modeloEsperado))throw Error(`${c.codigo}: o modelo foi alterado no seu cadastro. Revise antes de aplicar. Nenhum dado foi alterado.`);
 for(const img of c.produto.imagens){if(!img.startsWith('assets/produtos/')||img.includes('..'))throw Error('Caminho de imagem inválido');await fs.access(path.join(raiz,img));}
}
const momento=new Date().toISOString(),backup=path.join(raiz,'backups','correcao-produtos-'+momento.replace(/[:.]/g,'-'));
await fs.mkdir(backup,{recursive:true});
for(const arquivo of arquivos){try{await fs.copyFile(path.join(raiz,arquivo),path.join(backup,path.basename(arquivo)));}catch(e){if(e.code!=='ENOENT')throw e;}}
for(const c of correcoes){
 const i=catalogo.findIndex(p=>normal(p.codigoInfo)===normal(c.codigo)),anterior=catalogo[i];
 const novo={...anterior,...c.produto,revisaoPendente:false};
 // Os dados antigos vieram de refis; não mesclar medidas/documentos contaminados.
 delete novo.medidasProjeto;delete novo.siteFabricante;delete novo.precoOnline;
 novo.especificacoes={...c.produto.especificacoes,Modelo:anterior.modelo,'Código Info Store':c.codigo};
 novo.destaques=['Cor','Voltagem','Potência','Potência de áudio','Canais de áudio','Tecnologia'].filter(k=>novo.especificacoes[k]).slice(0,4).map(k=>({titulo:novo.especificacoes[k],rotulo:k,icone:'◇'}));
 novo.pendencias=c.codigo==='HOM0168'?['Link do produto na Info Store ainda não localizado.']:[];
 catalogo[i]=novo;
 const registro={modelo:anterior.modelo,codigo:c.codigo,produtoPlanilha:anterior.nomePlanilha||anterior.nome,tituloOficial:novo.nome,descricao:novo.descricao,imagem:novo.imagem,imagens:novo.imagens,imagemAmbiente:'',dimensoes:novo.dimensoes,documentos:novo.documentos,especificacoes:novo.especificacoes,destaques:novo.destaques,statusExtracao:'EXTRAIDO',pendencias:novo.pendencias,fonteInterna:c.fonte,fonteApoio:novo.siteInfoStore,dataConsulta:momento};
 const ci=cache.findIndex(p=>normal(p.codigo)===normal(c.codigo));if(ci<0)cache.push(registro);else cache[ci]=registro;
 const f=fontes.find(p=>normal(p.codigo)===normal(c.codigo));
 if(f)Object.assign(f,{fonteInterna:c.fonte,origemFonte:c.origem,statusFonte:'LOCALIZADO',correspondencia:c.origem==='INFO_STORE'?'CODIGO_INFO':'MODELO_EXATO'});
 console.log(`${c.codigo}: ${novo.nome} — ${novo.imagens.length} imagens`);
}
for(const [i,valor] of [catalogo,cache,fontes].entries()){
 const destino=path.join(raiz,arquivos[i]);await fs.mkdir(path.dirname(destino),{recursive:true});
 const tmp=destino+'.correcao.tmp';await fs.writeFile(tmp,JSON.stringify(valor,null,2)+'\n');await fs.rename(tmp,destino);
}
console.log('Correção aplicada. Backup:',path.relative(raiz,backup));
console.log('Não é necessário executar npm run gerar: o catálogo e o enriquecimento já foram atualizados.');
