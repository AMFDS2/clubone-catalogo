(function () {
  "use strict";

  function texto(valor = "") {
    return String(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapar(valor = "") {
    return String(valor)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function numero(valor = "") {
    const encontrado = String(valor).replace(",", ".").match(/\d+(?:\.\d+)?/);
    return encontrado ? Number(encontrado[0]) : 0;
  }

  function limitar(valor, minimo, maximo) {
    return Math.min(maximo, Math.max(minimo, valor));
  }

  function grupoMedidas(dimensoes = {}) {
    return dimensoes.produto || dimensoes.semBase || dimensoes.semEmbalagem || dimensoes.comBase || {};
  }

  function medida(grupo = {}, nomes = []) {
    const normalizados = nomes.map(texto);
    const entrada = Object.entries(grupo).find(([nome]) => normalizados.includes(texto(nome)));
    return entrada?.[1] || "";
  }

  function detectarTipo(produto = {}) {
    if (produto.tipoBloco) return produto.tipoBloco;

    const modelo = texto(produto.modelo).replace(/[^a-z0-9]/g, "");
    const conjunto = texto([produto.nome, produto.nomePlanilha, produto.modelo, produto.categoria].filter(Boolean).join(" "));

    if (produto.categoria === "Video" || /^un/.test(modelo) || conjunto.includes(" tv ")) return "tv";
    if (conjunto.includes("cooktop") || /^na/.test(modelo)) return "cooktop";
    if (conjunto.includes("coifa") || conjunto.includes("depurador")) return "coifa";
    if (conjunto.includes("fogao") || /^nsg/.test(modelo)) return "fogao";
    if (conjunto.includes("secadora") || /^dv/.test(modelo)) return "secadora";
    if (conjunto.includes("lava louca") || /^dw/.test(modelo)) return "lava-loucas";
    if (conjunto.includes("lava e seca") || conjunto.includes("lavadora") || conjunto.includes("maq lav") || /^(ww|wd)/.test(modelo)) return "lavadora";
    if (conjunto.includes("micro") || /^(mg|ms|mc)/.test(modelo)) return "microondas";
    if (conjunto.includes("forno") || /^nv/.test(modelo)) return "forno";
    if (conjunto.includes("soundbar")) return "soundbar";
    return "geladeira";
  }

  function geometria(largura, altura, profundidade, tipo) {
    const w = numero(largura) || 700;
    const h = numero(altura) || 1000;
    const d = numero(profundidade) || 600;

    if (tipo === "cooktop") {
      const frente = 150;
      const recuo = limitar((d / w) * 62, 44, 78);
      const espessura = limitar((h / w) * 60, 8, 18);
      return { frente, recuo, espessura };
    }

    if (tipo === "tv" || tipo === "soundbar") {
      const frente = 154;
      const corpo = tipo === "soundbar" ? 24 : limitar((h / w) * frente, 66, 100);
      const recuo = limitar((d / w) * 42, 7, 20);
      return { frente, corpo, recuo };
    }

    const maior = Math.max(w, h);
    const frente = limitar((w / maior) * 142, 64, 122);
    const corpo = limitar((h / maior) * 142, 90, 150);
    // Em projeção isométrica, a profundidade precisa continuar legível.
    // O fator 42 preserva a relação com a largura sem deixar a face lateral
    // artificialmente estreita em produtos profundos, como geladeiras.
    const recuo = limitar((d / Math.max(w, 1)) * 42, 24, 52);
    return { frente, corpo, recuo };
  }

  function linhasCota({ ax1, ay1, ax2, ay2, bx, by1, by2, cx1, cy1, cx2, cy2 }) {
    return `
      <g class="bloco-cotas">
        <line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" />
        <line x1="${ax1}" y1="${ay1 - 5}" x2="${ax1}" y2="${ay1 + 5}" />
        <line x1="${ax2}" y1="${ay2 - 5}" x2="${ax2}" y2="${ay2 + 5}" />
        <text x="${(ax1 + ax2) / 2}" y="${ay1 + 16}">A</text>

        <line x1="${bx}" y1="${by1}" x2="${bx}" y2="${by2}" />
        <line x1="${bx - 5}" y1="${by1}" x2="${bx + 5}" y2="${by1}" />
        <line x1="${bx - 5}" y1="${by2}" x2="${bx + 5}" y2="${by2}" />
        <text x="${bx + 11}" y="${(by1 + by2) / 2 + 4}">B</text>

        <line x1="${cx1}" y1="${cy1}" x2="${cx2}" y2="${cy2}" />
        <line x1="${cx1 - 4}" y1="${cy1 - 4}" x2="${cx1 + 4}" y2="${cy1 + 4}" />
        <line x1="${cx2 - 4}" y1="${cy2 - 4}" x2="${cx2 + 4}" y2="${cy2 + 4}" />
        <text x="${(cx1 + cx2) / 2}" y="${(cy1 + cy2) / 2 + 15}">C</text>
      </g>`;
  }

  function blocoCooktop(g) {
    const x = 34;
    const y = 82;
    const w = g.frente;
    const dx = g.recuo;
    const dy = -g.recuo * 0.48;
    const t = g.espessura;
    const pontos = `${x},${y} ${x + w},${y} ${x + w + dx},${y + dy} ${x + dx},${y + dy}`;
    const queimadores = [
      [x + w * 0.24 + dx * 0.55, y + dy * 0.56, 12],
      [x + w * 0.52 + dx * 0.55, y + dy * 0.56, 14],
      [x + w * 0.80 + dx * 0.55, y + dy * 0.56, 11],
      [x + w * 0.35 + dx * 0.40, y + dy * 0.20, 11],
      [x + w * 0.70 + dx * 0.40, y + dy * 0.20, 11]
    ];

    return `
      <g class="bloco-forma bloco-cooktop">
        <polygon class="bloco-face-topo" points="${pontos}" />
        <polygon class="bloco-face-frente" points="${x},${y} ${x + w},${y} ${x + w},${y + t} ${x},${y + t}" />
        <polygon class="bloco-face-lateral" points="${x + w},${y} ${x + w + dx},${y + dy} ${x + w + dx},${y + dy + t} ${x + w},${y + t}" />
        ${queimadores.map(([cx, cy, r]) => `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.48}" />`).join("")}
      </g>
      ${linhasCota({
        ax1: x, ay1: y + t + 20, ax2: x + w, ay2: y + t + 20,
        bx: x + w + dx + 12, by1: y + dy, by2: y + dy + t,
        cx1: x + w + 6, cy1: y + t + 15,
        cx2: x + w + dx + 6, cy2: y + dy + t + 15
      })}`;
  }

  function detalhesFrontais(tipo, x, y, w, h) {
    // Normaliza o tipo para não quebrar com acentos ou variações de texto
    const t = String(tipo || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // 1. TV / VÍDEO / MONITORES
    if (t.includes("tv") || t.includes("monitor") || t.includes("video")) {
      const borda = Math.max(6, Math.min(w, h) * 0.03);
      return `<rect class="bloco-detalhe" x="${x + borda}" y="${y + borda}" width="${w - borda * 2}" height="${h - borda * 2}" rx="2" />`;
    }

    // 2. LAVADORA, SECADORA E LAVA E SECA
    if (t.includes("lavadora") || t.includes("secadora") || t.includes("lava") && t.includes("seca")) {
      const altPainel = Math.max(25, h * 0.15);
      const r = Math.min(w * 0.32, (h - altPainel) * 0.34);
      const cy = y + altPainel + (h - altPainel) * 0.52;
      return `<line class="bloco-detalhe" x1="${x}" y1="${y + altPainel}" x2="${x + w}" y2="${y + altPainel}" />
        <rect class="bloco-detalhe" x="${x + w * 0.06}" y="${y + altPainel * 0.22}" width="${w * 0.32}" height="${altPainel * 0.55}" rx="2" />
        <circle class="bloco-detalhe" cx="${x + w * 0.58}" cy="${y + altPainel * 0.5}" r="${altPainel * 0.22}" />
        <circle class="bloco-detalhe" cx="${x + w / 2}" cy="${cy}" r="${r}" />
        <circle class="bloco-detalhe" cx="${x + w / 2}" cy="${cy}" r="${r * 0.75}" />
        <line class="bloco-detalhe" x1="${x + w * 0.08}" y1="${y + h - h * 0.08}" x2="${x + w * 0.92}" y2="${y + h - h * 0.08}" stroke-dasharray="4,4" />`;
    }

    // 3. FOGÃO DE PISO
    if (t.includes("fogao") && !t.includes("cooktop")) {
      const altMesa = Math.max(30, h * 0.16);
      const altPainelInferior = Math.max(25, h * 0.12);
      return `<line class="bloco-detalhe" x1="${x}" y1="${y + altMesa}" x2="${x + w}" y2="${y + altMesa}" />
        <circle class="bloco-detalhe" cx="${x + w * 0.16}" cy="${y + altMesa * 0.5}" r="5" />
        <circle class="bloco-detalhe" cx="${x + w * 0.32}" cy="${y + altMesa * 0.5}" r="5" />
        <rect class="bloco-detalhe" x="${x + w * 0.42}" y="${y + altMesa * 0.3}" width="${w * 0.16}" height="${altMesa * 0.4}" rx="1" />
        <circle class="bloco-detalhe" cx="${x + w * 0.68}" cy="${y + altMesa * 0.5}" r="5" />
        <circle class="bloco-detalhe" cx="${x + w * 0.84}" cy="${y + altMesa * 0.5}" r="5" />
        <rect class="bloco-detalhe" x="${x + w * 0.1}" y="${y + altMesa + (h - altMesa - altPainelInferior) * 0.18}" width="${w * 0.8}" height="${(h - altMesa - altPainelInferior) * 0.68}" rx="3" />
        <line class="bloco-detalhe" x1="${x + w * 0.18}" y1="${y + altMesa + (h - altMesa - altPainelInferior) * 0.1}" x2="${x + w * 0.82}" y2="${y + altMesa + (h - altMesa - altPainelInferior) * 0.1}" stroke-width="2.5" />
        <line class="bloco-detalhe" x1="${x}" y1="${y + h - altPainelInferior}" x2="${x + w}" y2="${y + h - altPainelInferior}" />`;
    }

    // 4. COOKTOP (Vista frontal estreita / embutimento)
    if (t.includes("cooktop")) {
      const altMesa = Math.max(15, h * 0.3);
      return `<line class="bloco-detalhe" x1="${x}" y1="${y + altMesa}" x2="${x + w}" y2="${y + altMesa}" />
        <circle class="bloco-detalhe" cx="${x + w * 0.25}" cy="${y + altMesa * 0.5}" r="4" />
        <circle class="bloco-detalhe" cx="${x + w * 0.42}" cy="${y + altMesa * 0.5}" r="4" />
        <circle class="bloco-detalhe" cx="${x + w * 0.58}" cy="${y + altMesa * 0.5}" r="4" />
        <circle class="bloco-detalhe" cx="${x + w * 0.75}" cy="${y + altMesa * 0.5}" r="4" />`;
    }

    // 5. MICRO-ONDAS — porta sempre contida na face frontal
    if (t.includes("microondas") || t.includes("micro-ondas")) {
      const margem = Math.max(7, Math.min(w, h) * 0.07);
      const painelW = Math.max(22, w * 0.2);
      const portaX = x + margem;
      const portaY = y + margem;
      const portaW = Math.max(24, w - painelW - margem * 3);
      const portaH = Math.max(24, h - margem * 2);
      const painelX = portaX + portaW + margem;
      return `<!-- Porta panorâmica contida no gabinete -->
        <rect class="bloco-detalhe" x="${portaX}" y="${portaY}" width="${portaW}" height="${portaH}" rx="3" />
        <rect class="bloco-detalhe" x="${portaX + 5}" y="${portaY + 5}" width="${Math.max(14, portaW - 10)}" height="${Math.max(14, portaH - 10)}" rx="2" />
        <!-- Painel lateral -->
        <line class="bloco-detalhe" x1="${painelX - margem / 2}" y1="${portaY}" x2="${painelX - margem / 2}" y2="${portaY + portaH}" />
        <rect class="bloco-detalhe" x="${painelX}" y="${portaY + 5}" width="${Math.max(12, painelW - margem)}" height="${Math.max(6, portaH * 0.14)}" rx="1" />
        <circle class="bloco-detalhe" cx="${painelX + (painelW - margem) / 2}" cy="${portaY + portaH * 0.45}" r="2.5" />
        <circle class="bloco-detalhe" cx="${painelX + (painelW - margem) / 2}" cy="${portaY + portaH * 0.64}" r="2.5" />
        <line class="bloco-detalhe" x1="${portaX + 5}" y1="${portaY + 4}" x2="${portaX + portaW - 5}" y2="${portaY + 4}" stroke-width="2" />`;
    }

    // 6. FORNO DE EMBUTIR
    if (t.includes("forno")) {
      const altPainel = Math.max(30, h * 0.18);
      const altPuxador = y + altPainel + Math.max(8, h * 0.05);
      const inicioVidro = altPuxador + Math.max(8, h * 0.05);
      const altVidro = Math.max(20, y + h - inicioVidro - 10);
      const largVidro = w * 0.76;
      return `<!-- Painel superior com display digital -->
        <line class="bloco-detalhe" x1="${x}" y1="${y + altPainel}" x2="${x + w}" y2="${y + altPainel}" />
        <rect class="bloco-detalhe" x="${x + w * 0.35}" y="${y + altPainel * 0.28}" width="${w * 0.3}" height="${altPainel * 0.45}" rx="1" />
        <!-- Puxador horizontal -->
        <line class="bloco-detalhe" x1="${x + w * 0.15}" y1="${altPuxador}" x2="${x + w * 0.85}" y2="${altPuxador}" stroke-width="2.5" />
        <!-- Vidro panorâmico frontal -->
        <rect class="bloco-detalhe" x="${x + (w - largVidro) / 2}" y="${inicioVidro}" width="${largVidro}" height="${altVidro}" rx="2" />`;
    }

    // 7. LAVA-LOUÇAS
    if (t.includes("lava") && (t.includes("louca") || t.includes("loucas"))) {
      const altPainel = Math.max(25, h * 0.15);
      const altRodape = y + h - Math.max(35, h * 0.12);
      return `<!-- Painel de comando e botões -->
        <line class="bloco-detalhe" x1="${x}" y1="${y + altPainel}" x2="${x + w}" y2="${y + altPainel}" />
        <rect class="bloco-detalhe" x="${x + w * 0.3}" y="${y + altPainel * 0.25}" width="${w * 0.4}" height="${altPainel * 0.5}" rx="1" />
        <!-- Friso / Pega da porta basculante -->
        <line class="bloco-detalhe" x1="${x + w * 0.2}" y1="${y + altPainel + 10}" x2="${x + w * 0.8}" y2="${y + altPainel + 10}" />
        <!-- Recuo inferior de rodapé de marcenaria -->
        <line class="bloco-detalhe" x1="${x}" y1="${altRodape}" x2="${x + w}" y2="${altRodape}" stroke-dasharray="4,4" />
        <line class="bloco-detalhe" x1="${x + w * 0.08}" y1="${altRodape}" x2="${x + w * 0.08}" y2="${y + h}" />
        <line class="bloco-detalhe" x1="${x + w * 0.92}" y1="${altRodape}" x2="${x + w * 0.92}" y2="${y + h}" />`;
    }

    // 7. SOUNDBAR
    if (t.includes("soundbar") || t.includes("audio")) {
      return `<circle class="bloco-detalhe" cx="${x + 15}" cy="${y + h / 2}" r="3" />
        <circle class="bloco-detalhe" cx="${x + w - 15}" cy="${y + h / 2}" r="3" />
        <line class="bloco-detalhe" x1="${x + 25}" y1="${y + h / 2}" x2="${x + w - 25}" y2="${y + h / 2}" stroke-dasharray="2,2" />`;
    }

    // 8. GELADEIRA / REFRIGERADOR (Identifica French Door ou Duplex)
    if (t.includes("geladeira") || t.includes("refrigerador") || t.includes("french") || t.includes("side")) {
      if (w >= 750) {
        // French Door / Side by Side (2 portas superiores + gavetão inferior)
        const altGaveta = h * 0.38;
        return `<line class="bloco-detalhe" x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h - altGaveta}" />
          <line class="bloco-detalhe" x1="${x + w / 2 - 10}" y1="${y + h * 0.15}" x2="${x + w / 2 - 10}" y2="${y + h * 0.45}" stroke-width="2" />
          <line class="bloco-detalhe" x1="${x + w / 2 + 10}" y1="${y + h * 0.15}" x2="${x + w / 2 + 10}" y2="${y + h * 0.45}" stroke-width="2" />
          <line class="bloco-detalhe" x1="${x}" y1="${y + h - altGaveta}" x2="${x + w}" y2="${y + h - altGaveta}" />
          <line class="bloco-detalhe" x1="${x + w * 0.3}" y1="${y + h - altGaveta + 14}" x2="${x + w * 0.7}" y2="${y + h - altGaveta + 14}" stroke-width="2" />`;
      }
      // Duplex convencional
      const divPorta = h * 0.35;
      return `<line class="bloco-detalhe" x1="${x}" y1="${y + divPorta}" x2="${x + w}" y2="${y + divPorta}" />
        <line class="bloco-detalhe" x1="${x + w - 12}" y1="${y + divPorta * 0.4}" x2="${x + w - 12}" y2="${y + divPorta * 0.9}" stroke-width="2" />
        <line class="bloco-detalhe" x1="${x + w - 12}" y1="${y + divPorta + 15}" x2="${x + w - 12}" y2="${y + divPorta + (h - divPorta) * 0.4}" stroke-width="2" />`;
    }

    // Padrão genérico de fallback
    return `<line class="bloco-detalhe" x1="${x}" y1="${y + h * 0.56}" x2="${x + w}" y2="${y + h * 0.56}" />
      <line class="bloco-detalhe" x1="${x + w - 12}" y1="${y + 25}" x2="${x + w - 12}" y2="${y + h * 0.45}" />`;
  }
  function blocoFrontal(g, tipo) {
    const x = 48;
    const y = 42;
    const w = g.frente;
    const h = g.corpo;
    const dx = g.recuo;
    const dy = -g.recuo * 0.52;

    return `
      <g class="bloco-forma bloco-${escapar(tipo)}">
        <polygon class="bloco-face-topo" points="${x},${y} ${x + w},${y} ${x + w + dx},${y + dy} ${x + dx},${y + dy}" />
        <polygon class="bloco-face-lateral" points="${x + w},${y} ${x + w + dx},${y + dy} ${x + w + dx},${y + h + dy} ${x + w},${y + h}" />
        <rect class="bloco-face-frente" x="${x}" y="${y}" width="${w}" height="${h}" rx="2" />
        ${detalhesFrontais(tipo, x, y, w, h)}
      </g>
      ${linhasCota({
        ax1: x, ay1: y + h + 20, ax2: x + w, ay2: y + h + 20,
        bx: x + w + dx + 13, by1: y + dy, by2: y + h + dy,
        cx1: x + w + 6, cy1: y + h + 15,
        cx2: x + w + dx + 6, cy2: y + h + dy + 15
      })}`;
  }

  function blocoCoifa(g) {
    const x = 48;
    const y = 54;
    const w = limitar(g.frente, 105, 138);
    const chamineW = w * 0.34;
    const chamineH = limitar(g.corpo * 0.58, 62, 92);
    const dx = limitar(g.recuo, 20, 38);
    const baseH = 24;
    const baseY = y + chamineH;
    const chamineX = x + (w - chamineW) / 2;
    return `
      <g class="bloco-forma bloco-coifa">
        <polygon class="bloco-face-topo" points="${x},${baseY} ${x + w},${baseY} ${x + w + dx},${baseY - dx * 0.45} ${x + dx},${baseY - dx * 0.45}" />
        <polygon class="bloco-face-lateral" points="${x + w},${baseY} ${x + w + dx},${baseY - dx * 0.45} ${x + w + dx},${baseY + baseH - dx * 0.45} ${x + w},${baseY + baseH}" />
        <rect class="bloco-face-frente" x="${x}" y="${baseY}" width="${w}" height="${baseH}" rx="2" />
        <rect class="bloco-face-frente" x="${chamineX}" y="${y}" width="${chamineW}" height="${chamineH}" rx="1" />
        <polygon class="bloco-face-lateral" points="${chamineX + chamineW},${y} ${chamineX + chamineW + 12},${y - 7} ${chamineX + chamineW + 12},${baseY - 7} ${chamineX + chamineW},${baseY}" />
        <line class="bloco-detalhe" x1="${x + 14}" y1="${baseY + 9}" x2="${x + w - 14}" y2="${baseY + 9}" />
        <circle class="bloco-detalhe" cx="${x + w * 0.82}" cy="${baseY + 16}" r="2" />
      </g>
      ${linhasCota({
        ax1: x, ay1: baseY + baseH + 20, ax2: x + w, ay2: baseY + baseH + 20,
        bx: x + w + dx + 13, by1: y - 7, by2: baseY + baseH - dx * 0.45,
        cx1: x + w + 5, cy1: baseY + baseH + 14,
        cx2: x + w + dx + 5, cy2: baseY + baseH - dx * 0.45 + 14
      })}`;
  }

  function vistasClimatizacao(dimensoes, produto) {
    const grupos = produto.tipoBloco === "ar-janela" ? [["produto", "Unidade de janela"]] : [["evaporadora", "Evaporadora · unidade interna"], ["condensadora", "Condensadora · unidade externa"]];
    return grupos.map(([chave, nome]) => {
      const g = dimensoes[chave] || {};
      const w = numero(g.largura), h = numero(g.altura), d = numero(g.profundidade);
      const tabela = ["largura", "altura", "profundidade", "peso"].map(k => `<div class="bloco-linha"><strong>${escapar(k)}</strong><span>${escapar(g[k] || "Em revisão")}</span></div>`).join("");
      const vista = (rotulo, a, b, la, lb) => {
        if (!a || !b) return `<section><h5>${rotulo}</h5><p class="texto-tecnico">Cotas em revisão.</p></section>`;
        const escala = 125 / Math.max(a, b), sw = a * escala, sh = b * escala;
        return `<section><h5>${rotulo}</h5><svg viewBox="0 0 200 185" role="img" aria-label="${escapar(nome + " " + rotulo)}"><rect x="30" y="22" width="${sw}" height="${sh}" fill="#f7f5f0" stroke="#333"/><line x1="30" y1="${sh+32}" x2="${sw+30}" y2="${sh+32}" stroke="#888"/><text x="${sw/2+30}" y="${sh+48}" text-anchor="middle" font-size="10">${escapar(la)}</text><text x="${sw+38}" y="${sh/2+22}" font-size="10" transform="rotate(-90 ${sw+38} ${sh/2+22})" text-anchor="middle">${escapar(lb)}</text></svg></section>`;
      };
      return `<section class="climatizacao-unidade"><h4>${escapar(nome)}</h4><div class="climatizacao-vistas">${vista("Frontal",w,h,g.largura,g.altura)}${vista("Superior",w,d,g.largura,g.profundidade)}${vista("Lateral",d,h,g.profundidade,g.altura)}</div><div class="bloco-tabela">${tabela}</div><p class="blocagem-nota">Envelope dimensional ilustrativo, sem folgas de instalação. Consulte o manual específico para afastamentos, tubulação e dreno.</p></section>`;
    }).join("");
  }
  window.criarBlocagemDimensional = function criarBlocagemDimensional(dimensoes = {}, produto = {}) {
    if (/^ar-/.test(produto.tipoBloco || "")) return vistasClimatizacao(dimensoes, produto);
    const grupo = grupoMedidas(dimensoes);
    const largura = medida(grupo, ["largura", "width"]);
    const altura = medida(grupo, ["altura", "height"]);
    const profundidade = medida(grupo, ["profundidade", "depth"]);
    const peso = grupo.peso || dimensoes.peso || produto.especificacoes?.["Peso líquido"] || produto.especificacoes?.Peso || "";

    if (!largura && !altura && !profundidade) {
      return '<p class="texto-tecnico">Dimensões em revisão.</p>';
    }

    const tipo = detectarTipo(produto);
    const g = geometria(largura, altura, profundidade, tipo);
    const desenho = tipo === "cooktop" ? blocoCooktop(g) : tipo === "coifa" ? blocoCoifa(g) : blocoFrontal(g, tipo);
    const nota = dimensoes.semBase && !dimensoes.produto ? "Medidas consideradas sem base/suporte." : "Blocagem dimensional ilustrativa.";

    const linha = (rotulo, valor) => `
      <div class="bloco-linha">
        <strong>${escapar(rotulo)}</strong>
        <span>${escapar(valor || "—")}</span>
      </div>`;

    return `
      <div class="blocagem-dimensoes">
        <div class="blocagem-visual">
          <svg class="blocagem-svg" viewBox="0 0 260 235" role="img" aria-label="Blocagem dimensional de ${escapar(produto.nome)}">
            ${desenho}
          </svg>
        </div>
        <div class="bloco-tabela">
          <h4>Dimensões do produto</h4>
          ${linha("A — Largura", largura)}
          ${linha("B — Altura", altura)}
          ${linha("C — Profundidade", profundidade)}
          ${peso ? linha("Peso", peso) : ""}
          <p class="blocagem-nota">${escapar(nota)}</p>
        </div>
      </div>`;
  };
})();
