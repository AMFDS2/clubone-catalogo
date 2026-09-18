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
    if (tipo === "tv") {
      return `<rect class="bloco-detalhe" x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="2" />
        <line class="bloco-detalhe" x1="${x + w / 2}" y1="${y + h}" x2="${x + w / 2}" y2="${y + h + 13}" />
        <line class="bloco-detalhe" x1="${x + w * 0.35}" y1="${y + h + 13}" x2="${x + w * 0.65}" y2="${y + h + 13}" />`;
    }
    if (["lavadora", "secadora"].includes(tipo)) {
      const r = Math.min(w * 0.32, h * 0.26);
      return `<line class="bloco-detalhe" x1="${x}" y1="${y + 28}" x2="${x + w}" y2="${y + 28}" />
        <circle class="bloco-detalhe" cx="${x + w / 2}" cy="${y + h * 0.6}" r="${r}" />
        <circle class="bloco-detalhe" cx="${x + w / 2}" cy="${y + h * 0.6}" r="${r * 0.76}" />
        <rect class="bloco-detalhe" x="${x + 9}" y="${y + 9}" width="${w * 0.35}" height="8" rx="1" />`;
    }
    if (tipo === "fogao") {
      return `<line class="bloco-detalhe" x1="${x}" y1="${y + 35}" x2="${x + w}" y2="${y + 35}" />
        <circle class="bloco-detalhe" cx="${x + w * 0.2}" cy="${y + 18}" r="4" />
        <circle class="bloco-detalhe" cx="${x + w * 0.38}" cy="${y + 18}" r="4" />
        <rect class="bloco-detalhe" x="${x + w * 0.47}" y="${y + 13}" width="${w * 0.18}" height="10" rx="1" />
        <circle class="bloco-detalhe" cx="${x + w * 0.75}" cy="${y + 18}" r="4" />
        <circle class="bloco-detalhe" cx="${x + w * 0.9}" cy="${y + 18}" r="4" />
        <rect class="bloco-detalhe" x="${x + 10}" y="${y + 48}" width="${w - 20}" height="${h - 62}" rx="2" />
        <line class="bloco-detalhe" x1="${x + 18}" y1="${y + 59}" x2="${x + w - 18}" y2="${y + 59}" />`;
    }
    if (["forno", "microondas"].includes(tipo)) {
      return `<rect class="bloco-detalhe" x="${x + 10}" y="${y + 35}" width="${w - 20}" height="${h - 49}" rx="2" />
        <line class="bloco-detalhe" x1="${x + 10}" y1="${y + 25}" x2="${x + w - 10}" y2="${y + 25}" />`;
    }
    if (tipo === "lava-loucas") {
      return `<line class="bloco-detalhe" x1="${x}" y1="${y + 29}" x2="${x + w}" y2="${y + 29}" />
        <line class="bloco-detalhe" x1="${x + 13}" y1="${y + 15}" x2="${x + w - 13}" y2="${y + 15}" />`;
    }
    if (tipo === "soundbar") {
      return `<circle class="bloco-detalhe" cx="${x + 15}" cy="${y + h / 2}" r="3" />
        <circle class="bloco-detalhe" cx="${x + w - 15}" cy="${y + h / 2}" r="3" />`;
    }
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

  window.criarBlocagemDimensional = function criarBlocagemDimensional(dimensoes = {}, produto = {}) {
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
