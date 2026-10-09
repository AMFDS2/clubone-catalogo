/* Extensão comercial independente. Mantém o gerador anterior e o catálogo intactos. */
(() => {
  'use strict';
  const LIMITES = { fotos: 4, beneficios: 8, caracteres: 150 };
  let itens = [], resultado = null, ocupado = false, origemFoco;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const texto = html => {
    const d = new DOMParser().parseFromString(String(html || ''),'text/html');
    d.querySelectorAll('script,style').forEach(n => n.remove());
    d.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
    d.querySelectorAll('p,li,h1,h2,h3,div').forEach(n => n.append('\n'));
    return d.body.textContent || '';
  };
  function sugerirBeneficios(p) {
    const candidatos = [];
    for (const campo of ['diferenciais','beneficios','caracteristicasComerciais']) {
      for (const item of Array.isArray(p[campo]) ? p[campo] : []) {
        candidatos.push(typeof item === 'string' ? item : [item.titulo,item.descricao].filter(Boolean).join(' — '));
      }
    }
    // Traduções de expressões presentes no cadastro, sem acrescentar recursos ao modelo.
    const descricao = texto(p.descricao)
      .replace(/Modern Frame Design/gi,'Design em estilo de moldura.')
      .replace(/Art Mode/gi,'Modo Arte.')
      .replace(/Artful Picture Quality with QLED/gi,'Qualidade de imagem com tecnologia QLED.');
    const trechos = descricao.split(/\n|(?<=[.!?])\s+/).map(s => s.replace(/^[\s>•●✓\-]+/,'').replace(/\s+/g,' ').trim());
    const elegiveis = trechos.filter(s => s.length >= 8 && s.length <= LIMITES.caracteres && !/indisponivel|entrega|manaus|garantia|sujeito|imagem ilustrativa|principais caracteristicas|saiba mais|www\.|https:|conheca|nota fiscal/.test(normal(s)));
    candidatos.push(...elegiveis);
    for (const item of p.destaques || []) {
      const vOriginal = String(item.titulo || '').trim(), r = String(item.rotulo || '').trim();
      const v = ({Black:'Preto',White:'Branco',Silver:'Prata'})[vOriginal] || vOriginal;
      if (!v || /^(mobile|manuais|conheca|resumo do produto|smartphones|sim|nao)$/i.test(normal(v)) || /garantia|acessorios/.test(normal(r))) continue;
      candidatos.push(`${r}: ${v}`);
    }
    const vistos = new Set();
    return candidatos.map(s=>texto(s).replace(/\s+/g,' ').trim()).filter(s=>{
      const k=normal(s);if(!s || s.length>LIMITES.caracteres || vistos.has(k))return false;vistos.add(k);return true;
    }).slice(0,LIMITES.beneficios);
  }
  function fotos(p) {
    return [...new Set(imagensDoProdutoApresentacao(p))].filter(s=>{
      try { const u=new URL(s,location.href);return ['http:','https:'].includes(u.protocol) && !/manual|vista.tecnica|cotas|dimens|\.pdf/i.test(s); } catch { return false; }
    });
  }
  function status(s,erro=false) { $('ac-status').textContent=s;$('ac-status').classList.toggle('ac-erro',erro); }
  function invalidar() { resultado=null;$('ac-baixar').hidden=true;$('ac-previas').replaceChildren(); }
  function renderItens() {
    $('ac-itens').innerHTML=itens.map((i,n)=>`<article class="ac-item" data-indice="${n}">
      <div class="ac-item-topo"><h4>${n+1}. ${esc(i.produto.nome)}</h4><div class="ac-ordem"><button type="button" data-mover="-1" ${n===0?'disabled':''} aria-label="Mover ${esc(i.produto.modelo)} para cima">↑</button><button type="button" data-mover="1" ${n===itens.length-1?'disabled':''} aria-label="Mover ${esc(i.produto.modelo)} para baixo">↓</button></div></div>
      <label>Título comercial <input class="ac-titulo" value="${esc(i.titulo)}" maxlength="160"></label>
      <p class="ac-ajuda">Selecione de 1 a 4 fotos. A primeira selecionada será a foto principal.</p>
      <div class="ac-fotos">${i.opcoes.map((src,k)=>`<label><input type="checkbox" data-foto="${k}" ${i.fotos.includes(src)?'checked':''}><img src="${esc(src)}" alt="Foto ${k+1} de ${esc(i.produto.modelo)}" loading="lazy"><span>Foto ${k+1}</span></label>`).join('') || '<p>Não há fotos cadastradas para este item.</p>'}</div>
      <label class="ac-remover"><input type="checkbox" class="ac-remover-fundo" ${i.removerFundo?'checked':''}> Remover fundo branco das fotos (automático)</label>
      <label>Diferenciais para o cliente <textarea class="ac-beneficios" rows="6" placeholder="Um benefício por linha">${esc(i.beneficios.join('\n'))}</textarea></label>
      <p class="ac-ajuda">Até 8 diferenciais, com até 150 caracteres por linha. Sugestões extraídas do cadastro; revise as informações e adapte a redação.</p>
    </article>`).join('');
  }
  function abrir() {
    const favs=obterFavoritosAtualizados();if(!favs.length)return;
    origemFoco=document.activeElement;
    itens=favs.map(f=>{const p=produtoCompletoApresentacao(f),opcoes=fotos(p);return {produto:p,quantidade:Math.max(1,Number(f.quantidade)||1),titulo:p.nome || p.nomeOficial || p.modelo,opcoes,fotos:opcoes.slice(0,4),beneficios:sugerirBeneficios(p),removerFundo:true};});
    for(const campo of ['projeto','cliente','profissional','vendedor']) $('ac-'+campo).value=$('apresentacao-'+campo)?.value || '';
    invalidar();renderItens();status('A ordem abaixo segue a seleção dos produtos. Use as setas para reorganizar esta apresentação.');
    $('ac-dialog').showModal();$('ac-projeto').focus();
  }
  function fechar() { if(ocupado)return;$('ac-dialog').close();origemFoco?.focus(); }
  async function preco(p) {
    const codigo=String(p.codigoInfo || p.codigo || '').trim();if(!codigo)return null;
    const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);
    try {
      const r=await fetch(`/api/preco?codigo=${encodeURIComponent(codigo)}`,{cache:'no-store',signal:c.signal});if(!r.ok)return null;
      const v=await r.json();const u=new URL(v.url);if(u.hostname!=='www.infostore.com.br' && u.hostname!=='infostore.com.br')return null;
      if(v.codigo && normal(v.codigo)!==normal(codigo))return null;
      return Number.isFinite(Number(v.preco)) && Number(v.preco)>0 ? v : null;
    }catch{return null;}finally{clearTimeout(t);}
  }
  function carregarFoto(src) {
    return new Promise(resolve=>{
      const im=new Image();im.crossOrigin='anonymous';let feito=false;
      const terminar=v=>{if(feito)return;feito=true;clearTimeout(t);im.onload=im.onerror=null;resolve(v);};
      const t=setTimeout(()=>terminar(null),15000);
      im.onload=()=>terminar(im);im.onerror=()=>terminar(null);im.src=new URL(src,location.href).href;
    });
  }
  function linhas(ctx,t,w) {
    const out=[];let linha='';
    for(const palavra of String(t).trim().split(/\s+/)) {
      if(ctx.measureText(palavra).width>w){if(linha){out.push(linha);linha='';}let parte='';for(const c of palavra){if(ctx.measureText(parte+c).width>w){out.push(parte);parte='';}parte+=c;}linha=parte;continue;}
      const nova=linha?linha+' '+palavra:palavra;if(ctx.measureText(nova).width>w){out.push(linha);linha=palavra;}else linha=nova;
    }
    if(linha)out.push(linha);return out;
  }
  function bloco(ctx,t,x,y,w,max,font,min=18,peso=400) {
    let l=[];for(let f=font;f>=min;f--){ctx.font=`${peso} ${f}px Arial`;l=linhas(ctx,t,w);if(l.length<=max){l.forEach((s,j)=>ctx.fillText(s,x,y+j*f*1.3));return;}}
    throw Error('Texto longo demais para a página. Reduza o título ou um diferencial.');
  }
  function caixa(ctx,x,y,w,h,cor,raio=18) {ctx.fillStyle=cor;ctx.beginPath();ctx.roundRect(x,y,w,h,raio);ctx.fill();}
  function dinheiro(v){return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  // Remove apenas branco conectado à borda. Não altera os arquivos do catálogo.
  function removerFundoBranco(imagem) {
    const w=imagem.naturalWidth || imagem.width,h=imagem.naturalHeight || imagem.height;
    if(!w || !h || w*h>16000000)return imagem;
    try {
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(imagem,0,0);
      const image=ctx.getImageData(0,0,w,h),d=image.data;
      const claro=i=>{const j=i*4,min=Math.min(d[j],d[j+1],d[j+2]),max=Math.max(d[j],d[j+1],d[j+2]);return d[j+3]<8 || (min>=244 && max-min<=12);};
      // Imagens ambientadas, sem borda branca predominante, permanecem intactas.
      let total=0,brancos=0;
      const passo=Math.max(1,Math.floor(Math.min(w,h)/100));
      for(let x=0;x<w;x+=passo){total+=2;brancos+=Number(claro(x))+Number(claro((h-1)*w+x));}
      for(let y=0;y<h;y+=passo){total+=2;brancos+=Number(claro(y*w))+Number(claro(y*w+w-1));}
      if(brancos/total<0.85)return imagem;
      const fila=new Uint32Array(w*h),visitado=new Uint8Array(w*h);let inicio=0,fim=0;
      const adicionar=i=>{if(!visitado[i]&&claro(i)){visitado[i]=1;fila[fim++]=i;}};
      for(let x=0;x<w;x++){adicionar(x);adicionar((h-1)*w+x);}
      for(let y=0;y<h;y++){adicionar(y*w);adicionar(y*w+w-1);}
      while(inicio<fim){const i=fila[inicio++],x=i%w;
        if(x>0)adicionar(i-1);if(x<w-1)adicionar(i+1);if(i>=w)adicionar(i-w);if(i<w*(h-1))adicionar(i+w);
      }
      for(let i=0;i<fim;i++){const j=fila[i]*4,min=Math.min(d[j],d[j+1],d[j+2]);d[j+3]=Math.round(d[j+3]*Math.max(0,Math.min(1,(252-min)/8)));}
      ctx.putImageData(image,0,0);return cv;
    }catch{return imagem;}
  }
  function adicionarPrevia(canvas,rotulo) {
    const mini=document.createElement('canvas');mini.width=1754;mini.height=1240;
    const ctx=mini.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,0,0,1754,1240);
    const img=document.createElement('img');img.src=mini.toDataURL('image/jpeg',0.9);img.alt=rotulo;$('ac-previas').append(img);
    mini.width=mini.height=0;
  }
  function criarCapa(dados,logoInfo,arteCapa) {
    const W=1754,H=1240,totalPaginasApresentacao=itens.length+1;
    const canvas=document.createElement('canvas');canvas.width=3508;canvas.height=2480;
    const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.fillStyle = "#f7f8fb"; ctx.fillRect(0, 0, W, H);

    // Faixa institucional conforme a referência, sem marcas de clubes.
    const topo = ctx.createLinearGradient(0, 0, W, 0);
    topo.addColorStop(0, "#102b62"); topo.addColorStop(0.58, "#1b4284"); topo.addColorStop(1, "#102b62");
    ctx.fillStyle = topo; ctx.fillRect(0, 0, W, 152);
    ctx.fillStyle = "#e52633"; ctx.fillRect(0, 148, W, 4);
    if (!desenharImagemContida(ctx, logoInfo, 70, 24, 190, 98, 4)) {
      ctx.fillStyle = "#fff"; ctx.font = "700 34px Arial"; ctx.fillText("info store", 70, 86);
    }
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.font = "500 18px Arial";
    ctx.fillText("O melhor mix para projetos únicos.", W - 72, 78); ctx.textAlign = "left";

    // Arte fixa de desenho técnico: comunica arquitetura sem competir com
    // o projeto do cliente. Os produtos permanecem nas páginas internas.
    if (arteCapa) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.drawImage(arteCapa, 0, 152, W, H - 152);
      ctx.restore();
      // Véu claro assegura legibilidade absoluta dos dados à esquerda.
      const veuTexto = ctx.createLinearGradient(0, 0, 980, 0);
      veuTexto.addColorStop(0, "rgba(247,248,251,.99)");
      veuTexto.addColorStop(0.75, "rgba(247,248,251,.94)");
      veuTexto.addColorStop(1, "rgba(247,248,251,0)");
      ctx.fillStyle = veuTexto;
      ctx.fillRect(0, 152, 1060, H - 152);
    }

    ctx.fillStyle = "#14346f"; ctx.font = "700 65px Arial";
    ctx.fillText("Seleção de Produtos", 72, 285);
    ctx.fillStyle = "#e52633"; ctx.fillRect(74, 316, 104, 5);
    const tituloCapa = String(dados.projeto || "Seleção personalizada de produtos");
    ctx.fillStyle = "#173875"; ctx.font = "700 42px Arial";
    quebrarTextoCanvas(ctx, tituloCapa, 860, 2)
      .forEach((linha, indice) => ctx.fillText(linha, 72, 390 + indice * 51));
    ctx.fillStyle = "#667085"; ctx.font = "400 21px Arial";
    ctx.fillText("Produtos e diferenciais selecionados para o seu projeto.", 72, 510);

    // Categorias presentes na seleção, como pequenos marcadores editoriais.
    const categoriasCapa = [...new Set(itens.map(i=>categoriaApresentacao(i.produto)))].slice(0, 6);
    let xCategoria = 72, yCategoria = 560;
    categoriasCapa.forEach(categoria => {
      ctx.font = "600 14px Arial";
      const larguraChip = Math.min(220, Math.max(112, ctx.measureText(categoria).width + 42));
      if(xCategoria+larguraChip>1000){xCategoria=72;yCategoria+=60;}
      ctx.beginPath(); ctx.roundRect(xCategoria, yCategoria, larguraChip, 48, 10);
      ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.strokeStyle = "#d5deed"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#173875"; ctx.fillText(truncarTextoCanvas(ctx, categoria, larguraChip - 30), xCategoria + 20, yCategoria+30);
      xCategoria += larguraChip + 14;
    });

    const camposCapa = [
      ["CLIENTE", dados.cliente],
      ["ARQUITETO(A)", dados.profissional],
      ["VENDEDOR(A)", dados.vendedor]
    ].filter(([, valor]) => String(valor || "").trim());
    if (camposCapa.length) {
      ctx.beginPath(); ctx.roundRect(72, 700, 860, 270, 16);
      ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fill(); ctx.strokeStyle = "#d7dfec"; ctx.lineWidth = 1.5; ctx.stroke();
      camposCapa.forEach(([rotulo, valor], indice) => {
        const y = 754 + indice * 74;
        ctx.fillStyle = "#e52633"; ctx.font = "700 12px Arial"; ctx.fillText(rotulo, 104, y);
        ctx.fillStyle = "#173875"; ctx.font = "500 20px Arial";
        ctx.fillText(truncarTextoCanvas(ctx, String(valor), 650), 270, y);
        if (indice < camposCapa.length - 1) {
          ctx.strokeStyle = "#e5e9f1"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(104, y + 27); ctx.lineTo(900, y + 27); ctx.stroke();
        }
      });
    }

    ctx.fillStyle = "#173875"; ctx.font = "700 24px Arial"; ctx.fillText("Info Store — O melhor mix em tecnologia.", 72, 1080);
    ctx.fillStyle = "#e52633"; ctx.fillRect(72, 1100, 58, 3);

    const dataCapa = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    ctx.fillStyle = "#7a8495"; ctx.font = "400 14px Arial"; ctx.fillText(`Manaus • ${dataCapa}`, 72, 1174);
    ctx.textAlign = "right"; ctx.fillStyle = "#7a8495"; ctx.font = "400 13px Arial";
    ctx.fillText(`INFO STORE | APRESENTAÇÃO COMERCIAL  •  1/${totalPaginasApresentacao}`, W - 72, 1174);
    ctx.textAlign = "left";
    return canvas;
  }
  async function pagina(item,n,total,dados,logo,oferta,fotografias) {
    const W=1754,H=1240,canvas=document.createElement('canvas');canvas.width=W*2;canvas.height=H*2;const c=canvas.getContext('2d');c.scale(2,2);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
    c.fillStyle='#fff';c.fillRect(0,0,W,H);c.fillStyle='#17366c';c.fillRect(0,0,W,112);c.fillStyle='#ec263e';c.fillRect(0,112,W,5);
    if(logo)desenharImagemContida(c,logo,60,18,185,74);else{c.fillStyle='#fff';c.font='700 30px Arial';c.fillText('INFO STORE',60,69);}
    c.textAlign='right';c.fillStyle='#fff';c.font='700 20px Arial';c.fillText('SELEÇÃO PARA O SEU PROJETO',W-64,49);c.font='400 17px Arial';c.fillText(`${n+2} / ${total+1}  •  ${item.quantidade} ${item.quantidade===1?'unidade':'unidades'}`,W-64,80);c.textAlign='left';
    c.fillStyle='#52617b';bloco(c,dados.projeto || 'Produtos selecionados',64,160,1626,1,24,18,700);
    const contexto=[dados.cliente&&`Cliente: ${dados.cliente}`,dados.profissional&&`Arquiteto(a): ${dados.profissional}`,dados.vendedor&&`Atendimento: ${dados.vendedor}`].filter(Boolean).join('  •  ');
    bloco(c,contexto,64,192,1626,1,18,13);
    const extras=fotografias.slice(1), heroH=extras.length?628:884;
    caixa(c,64,230,748,heroH,'#f6f7fa');
    if(fotografias[0])desenharImagemContida(c,fotografias[0],84,250,708,heroH-40,8);else {c.fillStyle='#61708b';c.font='24px Arial';c.fillText('Imagem indisponível',245,560);}
    const tw=extras.length?(748-(extras.length-1)*18)/extras.length:0;
    extras.forEach((im,k)=>{const x=64+k*(tw+18);caixa(c,x,880,tw,234,'#f6f7fa',12);desenharImagemContida(c,im,x+12,892,tw-24,210,6);});
    const X=872,R=814;
    c.fillStyle='#d91e37';c.font='700 18px Arial';c.fillText(String(item.produto.marca || item.produto.fabricante || 'Info Store').toUpperCase(),X,253);
    c.fillStyle='#17366c';bloco(c,item.titulo,X,300,R,3,38,26,700);
    c.fillStyle='#66738b';bloco(c,`Modelo: ${item.produto.modelo || '—'}  •  Código: ${item.produto.codigoInfo || item.produto.codigo || '—'}`,X,432,R,1,18,12);
    c.fillStyle='#ec263e';c.fillRect(X,448,65,4);c.fillStyle='#17366c';c.font='700 19px Arial';c.fillText('DIFERENCIAIS QUE FAZEM A DIFERENÇA',X,487);
    // Uma única fonte por lista; altura real do texto e intervalo fixo entre itens.
    let fonteBeneficios=22, linhasBeneficios=[], entrelinha=0;
    const intervaloBeneficios=14, alturaDisponivel=445;
    for (;fonteBeneficios>=16;fonteBeneficios--) {
      c.font=`400 ${fonteBeneficios}px Arial`;
      linhasBeneficios=item.beneficios.map(b=>linhas(c,b,R-42));
      entrelinha=Math.round(fonteBeneficios*1.4);
      const altura=linhasBeneficios.reduce((s,l)=>s+l.length*entrelinha,0)
        +Math.max(0,linhasBeneficios.length-1)*intervaloBeneficios;
      if(altura<=alturaDisponivel)break;
    }
    if(fonteBeneficios<16)throw Error('Os diferenciais ocupam espaço demais. Encurte alguns textos para manter a leitura confortável.');
    let yBeneficio=530;
    linhasBeneficios.forEach((textoLinhas,k)=>{
      caixa(c,X,yBeneficio-18,24,24,'#eaf0fa',12);
      c.fillStyle='#17366c';c.textAlign='center';c.font='700 14px Arial';
      c.fillText(String(k+1),X+12,yBeneficio);c.textAlign='left';
      c.fillStyle='#263957';c.font=`400 ${fonteBeneficios}px Arial`;
      textoLinhas.forEach((linha,j)=>c.fillText(linha,X+42,yBeneficio+j*entrelinha));
      yBeneficio+=textoLinhas.length*entrelinha+intervaloBeneficios;
    });
    const py=995;caixa(c,X,py,R,137,'#17366c',16);c.fillStyle='#fff';
    if(oferta){
      const pix=Number(oferta.precoPix)>0 && Number(oferta.precoPix)<=Number(oferta.preco);
      c.font='400 16px Arial';c.fillText(pix?'VALOR UNITÁRIO NO PIX':'VALOR UNITÁRIO',X+25,py+29);
      c.font='700 42px Arial';c.fillText(dinheiro(pix?oferta.precoPix:oferta.preco),X+25,py+80);
      const parc=oferta.parcelas;const cond=parc && Number(parc.quantidade)>0 && Number(parc.valor)>0?`${parc.quantidade}x de ${dinheiro(parc.valor)}`:'';
      c.font='400 18px Arial';c.fillText([pix?`Preço: ${dinheiro(oferta.preco)}`:'',cond].filter(Boolean).join('  •  '),X+25,py+113);
    }else{c.font='700 30px Arial';c.fillText('Preço sob consulta',X+25,py+60);c.font='400 19px Arial';c.fillText('Consulte nossa equipe para preço e disponibilidade.',X+25,py+96);}
    c.fillStyle='#6b7587';c.font='16px Arial';c.fillText(`Consulta de preços: ${dados.data}. Valores unitários sujeitos a alteração e disponibilidade.`,64,1180);
    c.font='14px Arial';c.fillText('Imagens do catálogo. Acessórios e elementos de ambientação podem não acompanhar o produto.',64,1205);
    return canvas;
  }
  async function gerar() {
    if(ocupado)return;
    try {
      for(let n=0;n<itens.length;n++){
        const i=itens[n];if(!i.titulo.trim() || i.titulo.length>160)throw Error(`Item ${n+1}: informe um título de até 160 caracteres.`);
        if(!i.beneficios.length || i.beneficios.length>8 || i.beneficios.some(s=>s.length>150))throw Error(`Item ${n+1}: informe de 1 a 8 diferenciais, com até 150 caracteres por linha.`);
        if(i.opcoes.length && !i.fotos.length)throw Error(`Item ${n+1}: selecione ao menos uma foto.`);
      }
      ocupado=true;invalidar();$('ac-edicao').disabled=true;$('ac-gerar').disabled=true;$('ac-fechar').disabled=true;
      const dados=Object.fromEntries(['projeto','cliente','profissional','vendedor'].map(k=>[k,$('ac-'+k).value.trim()]));
      dados.data=new Date().toLocaleString('pt-BR',{timeZone:'America/Manaus',dateStyle:'short',timeStyle:'short'});
      status('Consultando preços na Info Store...');
      const ofertas=new Array(itens.length);let proximo=0;
      await Promise.all(Array.from({length:Math.min(4,itens.length)},async()=>{
        while(proximo<itens.length){const n=proximo++;ofertas[n]=await preco(itens[n].produto);}
      }));
      const [logo,arteCapa]=await Promise.all([carregarFoto('assets/logoin.png'),carregarFoto('assets/capa-arquitetura-tecnica.png')]);
      const paginas=[];let fotosAusentes=0;
      const capa=criarCapa(dados,logo,arteCapa);paginas.push(await canvasParaJPEG(capa,0.98));adicionarPrevia(capa,'Capa da apresentação');capa.width=capa.height=0;
      for(let n=0;n<itens.length;n++){
        status(`Preparando produto ${n+1} de ${itens.length}...`);
        const carregadas=await Promise.all(itens[n].fotos.map(carregarFoto));fotosAusentes+=carregadas.filter(x=>!x).length;
        const canvas=await pagina(itens[n],n,itens.length,dados,logo,ofertas[n],carregadas.filter(Boolean).map(im=>itens[n].removerFundo?removerFundoBranco(im):im));
        paginas.push(await canvasParaJPEG(canvas,0.98));
        adicionarPrevia(canvas,`Página ${n+2}: ${itens[n].titulo}`);canvas.width=canvas.height=0;
      }
      resultado=montarPDFComJPEGs(paginas,3508,2480);$('ac-baixar').hidden=false;
      const faltam=ofertas.filter(p=>!p).length;
      status(`${itens.length+1} páginas prontas: capa e ${itens.length} produtos, na ordem exibida.${faltam?` ${faltam} produto(s) com preço sob consulta.`:''}${fotosAusentes?` ${fotosAusentes} foto(s) não carregaram e foram omitidas.`:''} Confira a prévia e baixe o PDF.`);
      $('ac-baixar').focus();$('ac-previas').scrollIntoView({block:'start',behavior:'smooth'});
    }catch(e){invalidar();status(e.message || 'Não foi possível gerar. Tente novamente.',true);}
    finally{ocupado=false;$('ac-edicao').disabled=false;$('ac-gerar').disabled=false;$('ac-fechar').disabled=false;}
  }
  function iniciar() {
    const footer=$('drawer-footer');if(!footer || $('btn-apresentacao-completa'))return;
    const b=document.createElement('button');b.type='button';b.id='btn-apresentacao-completa';b.className='btn-apresentacao-cliente ac-botao';b.textContent='Apresentação completa por item';
    ($('btn-apresentacao-cliente') || footer.lastElementChild).insertAdjacentElement('afterend',b);b.addEventListener('click',abrir);
    document.body.insertAdjacentHTML('beforeend',`<dialog id="ac-dialog" aria-labelledby="ac-heading"><div class="ac-topo"><div><span>APRESENTAÇÃO COMERCIAL</span><h3 id="ac-heading">Um produto por página</h3></div><button type="button" id="ac-fechar" aria-label="Fechar apresentação">×</button></div>
      <fieldset id="ac-edicao"><div class="ac-dados">${[['projeto','Projeto'],['cliente','Cliente'],['profissional','Arquiteto(a)'],['vendedor','Vendedor(a)']].map(([id,label])=>`<label>${label}<input id="ac-${id}" maxlength="80" autocomplete="off"></label>`).join('')}</div>
      <p class="ac-ajuda">Fotos e diferenciais do catálogo, preço consultado na Info Store ao gerar. Capa no estilo tradicional e um produto por página, na ordem abaixo. PDF em alta resolução (300 dpi). Fotos ambientadas são preservadas; desmarque a remoção se preferir a imagem original.</p><div id="ac-itens"></div></fieldset>
      <div class="ac-acoes"><button type="button" id="ac-gerar">Gerar prévia completa</button><button type="button" id="ac-baixar" hidden>Baixar apresentação em PDF</button></div><p id="ac-status" role="status" aria-live="polite"></p><div id="ac-previas"></div></dialog>`);
    $('ac-fechar').addEventListener('click',fechar);$('ac-dialog').addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});
    $('ac-itens').addEventListener('click',e=>{const btn=e.target.closest('[data-mover]');if(!btn)return;const n=Number(btn.closest('[data-indice]').dataset.indice),m=n+Number(btn.dataset.mover);if(m<0||m>=itens.length)return;[itens[n],itens[m]]=[itens[m],itens[n]];invalidar();renderItens();$('ac-itens').querySelectorAll('.ac-item')[m].querySelector('input').focus();});
    $('ac-itens').addEventListener('input',e=>{const article=e.target.closest('[data-indice]');if(!article)return;const i=itens[Number(article.dataset.indice)];if(e.target.matches('.ac-titulo'))i.titulo=e.target.value;if(e.target.matches('.ac-beneficios'))i.beneficios=e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);invalidar();});
    $('ac-itens').addEventListener('change',e=>{if(e.target.matches('.ac-remover-fundo')){itens[Number(e.target.closest('[data-indice]').dataset.indice)].removerFundo=e.target.checked;invalidar();return;}if(!e.target.matches('[data-foto]'))return;const i=itens[Number(e.target.closest('[data-indice]').dataset.indice)],src=i.opcoes[Number(e.target.dataset.foto)];if(e.target.checked && i.fotos.length>=4){e.target.checked=false;status('Selecione no máximo quatro fotos por produto.',true);return;}i.fotos=e.target.checked?[...i.fotos,src]:i.fotos.filter(s=>s!==src);invalidar();});
    document.querySelector('.ac-dados').addEventListener('input',invalidar);
    $('ac-gerar').addEventListener('click',gerar);$('ac-baixar').addEventListener('click',()=>{if(resultado)baixarBlob(resultado,`apresentacao-completa-info-store-${new Date().toISOString().slice(0,10)}.pdf`);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
