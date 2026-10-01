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

    // ELETROPORTÁTEIS — mantém o envelope dimensional e diferencia a função.
    if (t.includes("air-fryer") || t.includes("cafeteira")) {
      const painel = Math.max(20, h * 0.2);
      return `<rect class="bloco-detalhe" x="${x + w * 0.18}" y="${y + painel * 0.28}" width="${w * 0.64}" height="${painel * 0.48}" rx="2" />
        <line class="bloco-detalhe" x1="${x + w * 0.15}" y1="${y + painel}" x2="${x + w * 0.85}" y2="${y + painel}" />
        <rect class="bloco-detalhe" x="${x + w * 0.16}" y="${y + painel + h * 0.08}" width="${w * 0.68}" height="${Math.max(18, h * 0.48)}" rx="4" />
        <line class="bloco-detalhe" x1="${x + w * 0.36}" y1="${y + painel + h * 0.15}" x2="${x + w * 0.64}" y2="${y + painel + h * 0.15}" stroke-width="2.5" />`;
    }

    if (t.includes("liquidificador") || t.includes("processador")) {
      return `<path class="bloco-detalhe" d="M ${x + w * 0.27} ${y + h * 0.1} L ${x + w * 0.73} ${y + h * 0.1} L ${x + w * 0.65} ${y + h * 0.62} L ${x + w * 0.35} ${y + h * 0.62} Z" />
        <rect class="bloco-detalhe" x="${x + w * 0.3}" y="${y + h * 0.64}" width="${w * 0.4}" height="${h * 0.25}" rx="3" />
        <circle class="bloco-detalhe" cx="${x + w * 0.5}" cy="${y + h * 0.76}" r="${Math.max(2, Math.min(w, h) * 0.04)}" />`;
    }

    if (t.includes("robo-aspirador")) {
      const r = Math.min(w, h) * 0.32;
      return `<circle class="bloco-detalhe" cx="${x + w / 2}" cy="${y + h / 2}" r="${r}" />
        <circle class="bloco-detalhe" cx="${x + w / 2}" cy="${y + h / 2}" r="${r * 0.18}" />
        <line class="bloco-detalhe" x1="${x + w / 2}" y1="${y + h / 2 - r}" x2="${x + w / 2}" y2="${y + h / 2 - r * 0.55}" />`;
    }

    if (t.includes("chaleira")) {
      return `<path class="bloco-detalhe" d="M ${x + w * 0.25} ${y + h * 0.22} Q ${x + w * 0.2} ${y + h * 0.72} ${x + w * 0.38} ${y + h * 0.84} L ${x + w * 0.68} ${y + h * 0.84} Q ${x + w * 0.78} ${y + h * 0.55} ${x + w * 0.68} ${y + h * 0.22} Z" />
        <path class="bloco-detalhe" d="M ${x + w * 0.68} ${y + h * 0.34} Q ${x + w * 0.94} ${y + h * 0.42} ${x + w * 0.72} ${y + h * 0.68}" />`;
    }

    if (t.includes("sanduicheira") || t.includes("torradeira")) {
      return `<rect class="bloco-detalhe" x="${x + w * 0.12}" y="${y + h * 0.28}" width="${w * 0.76}" height="${h * 0.48}" rx="5" />
        <line class="bloco-detalhe" x1="${x + w * 0.25}" y1="${y + h * 0.4}" x2="${x + w * 0.75}" y2="${y + h * 0.4}" />`;
    }

    if (t.includes("ferro-vaporizador")) {
      return `<path class="bloco-detalhe" d="M ${x + w * 0.18} ${y + h * 0.78} L ${x + w * 0.82} ${y + h * 0.78} L ${x + w * 0.62} ${y + h * 0.38} Q ${x + w * 0.38} ${y + h * 0.3} ${x + w * 0.18} ${y + h * 0.78} Z" />
        <path class="bloco-detalhe" d="M ${x + w * 0.4} ${y + h * 0.43} Q ${x + w * 0.58} ${y + h * 0.48} ${x + w * 0.66} ${y + h * 0.67}" />`;
    }

    if (t.includes("aspirador") || t.includes("umidificador") || t.includes("lavadora-pressao") || t.includes("espremedor") || t.includes("papa-bolinhas") || t === "portatil") {
      const raio = Math.max(4, Math.min(w, h) * 0.12);
      return `<rect class="bloco-detalhe" x="${x + w * 0.16}" y="${y + h * 0.16}" width="${w * 0.68}" height="${h * 0.68}" rx="${raio}" />
        <circle class="bloco-detalhe" cx="${x + w * 0.5}" cy="${y + h * 0.48}" r="${raio}" />
        <line class="bloco-detalhe" x1="${x + w * 0.3}" y1="${y + h * 0.72}" x2="${x + w * 0.7}" y2="${y + h * 0.72}" />`;
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

  function blocagemClimatizacaoProduto(dimensoes, produto) {
    const ehJanela = produto.tipoBloco === "ar-janela";
    const grupo = ehJanela
      ? (dimensoes.produto || dimensoes.evaporadora || {})
      : (dimensoes.evaporadora || dimensoes.produto || {});
    const largura = medida(grupo, ["largura", "width"]);
    const altura = medida(grupo, ["altura", "height"]);
    const profundidade = medida(grupo, ["profundidade", "depth"]);
    const peso = grupo.peso || "";

    if (!largura && !altura && !profundidade) {
      return '<p class="texto-tecnico">Dimensões da evaporadora em revisão.</p>';
    }

    const larguraNumero = numero(largura) || 800;
    const alturaNumero = numero(altura) || 300;
    const profundidadeNumero = numero(profundidade) || 220;
    const frente = 150;
    const corpo = limitar((alturaNumero / larguraNumero) * frente, 30, ehJanela ? 82 : 68);
    const recuo = limitar((profundidadeNumero / larguraNumero) * 74, 20, 54);
    const x = 28;
    const y = 82;
    const dx = recuo;
    const dy = -recuo * 0.46;
    const tipo = produto.tipoBloco || "ar-split";

    let detalhes = `<line class="bloco-detalhe" x1="${x + frente * 0.08}" y1="${y + corpo * 0.72}" x2="${x + frente * 0.92}" y2="${y + corpo * 0.72}" />`;
    if (tipo === "ar-piso-teto") {
      detalhes = `<line class="bloco-detalhe" x1="${x + frente * 0.08}" y1="${y + corpo * 0.62}" x2="${x + frente * 0.92}" y2="${y + corpo * 0.62}" />
        <line class="bloco-detalhe" x1="${x + frente * 0.14}" y1="${y + corpo * 0.78}" x2="${x + frente * 0.86}" y2="${y + corpo * 0.78}" />`;
    } else if (tipo === "ar-cassete") {
      detalhes = `<rect class="bloco-detalhe" x="${x + frente * 0.12}" y="${y + corpo * 0.18}" width="${frente * 0.76}" height="${corpo * 0.64}" rx="2" />`;
    } else if (ehJanela) {
      const raio = Math.min(frente, corpo) * 0.25;
      detalhes = `<circle class="bloco-detalhe" cx="${x + frente * 0.42}" cy="${y + corpo * 0.52}" r="${raio}" />
        <circle class="bloco-detalhe" cx="${x + frente * 0.42}" cy="${y + corpo * 0.52}" r="${raio * 0.22}" />
        <line class="bloco-detalhe" x1="${x + frente * 0.75}" y1="${y + corpo * 0.2}" x2="${x + frente * 0.75}" y2="${y + corpo * 0.82}" />`;
    }

    const desenho = `<g class="bloco-forma bloco-climatizacao bloco-${escapar(tipo)}">
        <polygon class="bloco-face-topo" points="${x},${y} ${x + frente},${y} ${x + frente + dx},${y + dy} ${x + dx},${y + dy}" />
        <polygon class="bloco-face-lateral" points="${x + frente},${y} ${x + frente + dx},${y + dy} ${x + frente + dx},${y + corpo + dy} ${x + frente},${y + corpo}" />
        <rect class="bloco-face-frente" x="${x}" y="${y}" width="${frente}" height="${corpo}" rx="${tipo === "ar-split" ? 8 : 2}" />
        ${detalhes}
      </g>
      ${linhasCota({
        ax1: x, ay1: y + corpo + 24, ax2: x + frente, ay2: y + corpo + 24,
        bx: x + frente + dx + 14, by1: y + dy, by2: y + corpo + dy,
        cx1: x + frente + 6, cy1: y + corpo + 17,
        cx2: x + frente + dx + 6, cy2: y + corpo + dy + 17
      })}`;

    const linha = (rotulo, valor) => `<div class="bloco-linha"><strong>${escapar(rotulo)}</strong><span>${escapar(valor || "—")}</span></div>`;
    const unidade = ehJanela ? "unidade" : "evaporadora";

    return `<div class="blocagem-dimensoes blocagem-climatizacao">
      <div class="blocagem-visual">
        <svg class="blocagem-svg" viewBox="0 0 260 235" role="img" aria-label="Blocagem dimensional da ${unidade} de ${escapar(produto.nome || produto.modelo || "ar-condicionado")}">
          ${desenho}
        </svg>
      </div>
      <div class="bloco-tabela">
        <h4>Dimensões da ${unidade}</h4>
        ${linha("A — Largura", largura)}
        ${linha("B — Altura", altura)}
        ${linha("C — Profundidade", profundidade)}
        ${peso ? linha("Peso", peso) : ""}
        <p class="blocagem-nota">Blocagem dimensional da ${unidade}. ${ehJanela ? "Vistas técnicas completas" : "Condensadora e vistas técnicas completas"} disponíveis em Medidas para projeto.</p>
      </div>
    </div>`;
  }

  function vistasClimatizacao(dimensoes, produto) {
    const gruposBase = produto.tipoBloco === "ar-janela"
      ? [["produto", "Unidade de janela"]]
      : [["evaporadora", "Evaporadora · unidade interna"], ["condensadora", "Condensadora · unidade externa"]];

    const grupos = gruposBase.filter(([chave]) => {
      const grupo = dimensoes[chave] || {};
      return [grupo.largura, grupo.altura, grupo.profundidade].filter(Boolean).length >= 2;
    });

    if (!grupos.length) {
      return '<p class="texto-tecnico climatizacao-sem-cotas">Dimensões técnicas ainda não confirmadas.</p>';
    }

    const detalheTecnico = (tipo, chave, rotulo, x, y, largura, altura) => {
      if (rotulo !== "Frontal") return "";
      if (chave === "condensadora") {
        const raio = Math.max(7, Math.min(largura, altura) * 0.28);
        return `<circle class="clima-detalhe" cx="${x + largura * 0.42}" cy="${y + altura / 2}" r="${raio}" />
          <circle class="clima-detalhe" cx="${x + largura * 0.42}" cy="${y + altura / 2}" r="${raio * 0.18}" />
          <line class="clima-detalhe" x1="${x + largura * 0.78}" y1="${y + altura * 0.2}" x2="${x + largura * 0.78}" y2="${y + altura * 0.8}" />`;
      }
      if (tipo === "ar-cassete") {
        return `<rect class="clima-detalhe" x="${x + largura * 0.12}" y="${y + altura * 0.22}" width="${largura * 0.76}" height="${altura * 0.56}" rx="2" />`;
      }
      if (tipo === "ar-piso-teto") {
        return `<line class="clima-detalhe" x1="${x + largura * 0.1}" y1="${y + altura * 0.66}" x2="${x + largura * 0.9}" y2="${y + altura * 0.66}" />
          <line class="clima-detalhe" x1="${x + largura * 0.16}" y1="${y + altura * 0.78}" x2="${x + largura * 0.84}" y2="${y + altura * 0.78}" />`;
      }
      return `<line class="clima-detalhe" x1="${x + largura * 0.08}" y1="${y + altura * 0.7}" x2="${x + largura * 0.92}" y2="${y + altura * 0.7}" />`;
    };

    const vista = (nomeGrupo, chave, rotulo, a, b, legendaA, legendaB) => {
      if (!a || !b) {
        return `<section class="climatizacao-vista climatizacao-vista-pendente"><h5>${escapar(rotulo)}</h5><p class="texto-tecnico">Cota não confirmada.</p></section>`;
      }

      const areaLargura = 118;
      const areaAltura = 82;
      const escala = Math.min(areaLargura / a, areaAltura / b);
      const largura = Math.max(15, a * escala);
      const altura = Math.max(12, b * escala);
      const x = 20 + (areaLargura - largura) / 2;
      const y = 24 + (areaAltura - altura) / 2;
      const cotaY = y + altura + 13;
      const cotaX = x + largura + 13;
      const tipo = produto.tipoBloco || "ar-split";

      return `<section class="climatizacao-vista" data-vista="${escapar(rotulo.toLowerCase())}">
        <h5>${escapar(rotulo)}</h5>
        <svg class="climatizacao-svg" viewBox="0 0 170 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapar(nomeGrupo + " — " + rotulo)}">
          <rect class="clima-corpo clima-${escapar(tipo)}" x="${x}" y="${y}" width="${largura}" height="${altura}" rx="2" />
          ${detalheTecnico(tipo, chave, rotulo, x, y, largura, altura)}
          <line class="clima-cota" x1="${x}" y1="${cotaY}" x2="${x + largura}" y2="${cotaY}" />
          <text class="clima-cota-texto" x="${x + largura / 2}" y="${cotaY + 12}" text-anchor="middle">${escapar(legendaA)}</text>
          <line class="clima-cota" x1="${cotaX}" y1="${y}" x2="${cotaX}" y2="${y + altura}" />
          <text class="clima-cota-texto" x="${cotaX + 10}" y="${y + altura / 2}" transform="rotate(-90 ${cotaX + 10} ${y + altura / 2})" text-anchor="middle">${escapar(legendaB)}</text>
        </svg>
      </section>`;
    };

    return grupos.map(([chave, nome]) => {
      const grupo = dimensoes[chave] || {};
      const largura = numero(grupo.largura);
      const altura = numero(grupo.altura);
      const profundidade = numero(grupo.profundidade);
      const tabela = [
        ["Largura", grupo.largura],
        ["Altura", grupo.altura],
        ["Profundidade", grupo.profundidade],
        ["Peso", grupo.peso]
      ].map(([rotulo, valor]) => `<div class="bloco-linha"><strong>${escapar(rotulo)}</strong><span>${escapar(valor || "Não informado")}</span></div>`).join("");

      return `<section class="climatizacao-unidade" data-unidade="${escapar(chave)}">
        <h4>${escapar(nome)}</h4>
        <div class="climatizacao-vistas">
          ${vista(nome, chave, "Frontal", largura, altura, grupo.largura, grupo.altura)}
          ${vista(nome, chave, "Superior", largura, profundidade, grupo.largura, grupo.profundidade)}
          ${vista(nome, chave, "Lateral", profundidade, altura, grupo.profundidade, grupo.altura)}
        </div>
        <div class="bloco-tabela">${tabela}</div>
        <p class="blocagem-nota">Envelope dimensional ilustrativo, sem folgas de instalação. Consulte o manual específico para afastamentos, tubulação e dreno.</p>
      </section>`;
    }).join("");
  }
  window.criarVistasClimatizacao = vistasClimatizacao;

  window.criarBlocagemDimensional = function criarBlocagemDimensional(dimensoes = {}, produto = {}) {
    const ehPortatil = produto.experiencia === "portatil" || /eletroport/i.test(String(produto.categoria || "")) || /portate/i.test(String(produto.segmento || ""));
    if (ehPortatil || produto.exibirBlocagem === false) return "";
    if (/^ar-/.test(produto.tipoBloco || "")) return blocagemClimatizacaoProduto(dimensoes, produto);
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
