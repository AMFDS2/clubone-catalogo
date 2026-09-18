const HOSTS_OFICIAIS = new Set([
  "downloadcenter.samsung.com",
  "org.downloadcenter.samsung.com"
]);

function limparTexto(valor = "") {
  return String(valor).replace(/\s+/g, " ").trim();
}

function normalizar(valor = "") {
  return limparTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function decodificarHTML(valor = "") {
  return String(valor)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u003a/gi, ":")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .trim();
}

function prepararURL(valor = "", fonte = "https://www.samsung.com/br/") {
  const decodificada = decodificarHTML(valor).replace(/["'<>),;]+$/g, "");
  if (!decodificada) return "";

  try {
    const url = new URL(decodificada, fonte);
    if (!HOSTS_OFICIAIS.has(url.hostname.toLowerCase())) return "";
    if (!/\.pdf(?:$|[?#])/i.test(url.href)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function classificarDocumento(rotulo = "", url = "") {
  const referencia = normalizar(`${rotulo} ${decodeURIComponent(url)}`);

  if (/install|instalacao|installation|guia de instalacao/.test(referencia)) {
    return {
      tipo: "instalacao",
      nome: "Guia de instalação",
      descricao: "Orientações oficiais para instalação"
    };
  }

  if (/quick|guia rapido|quick guide/.test(referencia)) {
    return {
      tipo: "guia-rapido",
      nome: "Guia rápido",
      descricao: "Guia rápido oficial do fabricante"
    };
  }

  if (/spec|especifica|ficha tecnica|datasheet/.test(referencia)) {
    return {
      tipo: "ficha-tecnica",
      nome: "Ficha técnica",
      descricao: "Especificações oficiais do produto"
    };
  }

  if (/regulatory|certifica|inmetro|energy|energetica/.test(referencia)) {
    return {
      tipo: "certificacao",
      nome: "Certificação do produto",
      descricao: "Documento oficial de conformidade"
    };
  }

  return {
    tipo: "manual",
    nome: "Manual do usuário",
    descricao: "Manual oficial do fabricante"
  };
}

function extrairArrayJSON(html = "", marcador = '"manuals"') {
  const posicaoMarcador = html.indexOf(marcador);
  if (posicaoMarcador < 0) return [];
  const inicio = html.indexOf("[", posicaoMarcador + marcador.length);
  if (inicio < 0) return [];

  let profundidade = 0;
  let dentroString = false;
  let escapado = false;

  for (let i = inicio; i < html.length; i++) {
    const caractere = html[i];
    if (dentroString) {
      if (escapado) escapado = false;
      else if (caractere === "\\") escapado = true;
      else if (caractere === '"') dentroString = false;
      continue;
    }
    if (caractere === '"') {
      dentroString = true;
      continue;
    }
    if (caractere === "[") profundidade++;
    if (caractere === "]") {
      profundidade--;
      if (profundidade === 0) {
        try {
          return JSON.parse(html.slice(inicio, i + 1));
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

async function baixarPaginaSuporte(modelo = "") {
  const original = String(modelo).trim().toUpperCase();
  if (!original) return "";

  const modelos = [...new Set([
    original,
    original.split("/")[0],
    original.replace(/\s+/g, "")
  ].filter(Boolean))];

  for (const valor of modelos) {
    const url = `https://www.samsung.com/br/support/model/${encodeURIComponent(valor)}/`;

    try {
      const resposta = await fetch(url, {
        signal: AbortSignal.timeout(45000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          "Accept-Language": "pt-BR,pt;q=0.9"
        }
      });

      if (!resposta.ok) continue;
      const html = await resposta.text();
      if (html.includes('"manuals"')) return html;
    } catch {
      // Tenta a próxima variação do modelo.
    }
  }

  return "";
}

export async function extrairDocumentosOficiais($, html = "", fonteInterna = "", modelo = "") {
  const candidatos = [];

  function adicionar(urlBruta, rotulo = "") {
    const url = prepararURL(urlBruta, fonteInterna);
    if (!url) return;
    candidatos.push({ url, rotulo: limparTexto(rotulo) });
  }

  $("a[href]").each((_, elemento) => {
    const link = $(elemento);
    adicionar(
      link.attr("href"),
      [
        link.text(),
        link.attr("title"),
        link.attr("aria-label"),
        link.attr("data-an-la")
      ].filter(Boolean).join(" ")
    );
  });

  const htmlDecodificado = decodificarHTML(html);
  const expressoes = [
    /https?:\/\/downloadcenter\.samsung\.com\/[^\s"'<>]+?\.pdf(?:\?[^\s"'<>]*)?/gi,
    /https?:\/\/org\.downloadcenter\.samsung\.com\/[^\s"'<>]+?\.pdf(?:\?[^\s"'<>]*)?/gi
  ];

  expressoes.forEach(expressao => {
    for (const correspondencia of htmlDecodificado.matchAll(expressao)) {
      const inicio = Math.max(0, correspondencia.index - 180);
      const contexto = htmlDecodificado.slice(inicio, correspondencia.index + correspondencia[0].length + 80);
      adicionar(correspondencia[0], contexto.replace(/<[^>]+>/g, " "));
    }
  });

  try {
    const htmlSuporte = await baixarPaginaSuporte(modelo);
    const manuais = extrairArrayJSON(htmlSuporte, '"manuals"');

    manuais.forEach(manual => {
      const caminho = String(manual?.filePath || "").replace(/^\/+/, "");
      const urlDireta = caminho
        ? `https://downloadcenter.samsung.com/content/${caminho}`
        : manual?.downloadUrl || "";

      adicionar(
        urlDireta,
        [
          manual?.description,
          manual?.englishDescription,
          manual?.fileName,
          ...(Array.isArray(manual?.languageList)
            ? manual.languageList.map(idioma => idioma?.name || idioma?.code)
            : [])
        ]
          .filter(Boolean)
          .join(" ")
      );
    });
  } catch {
    // A ausência da página de suporte não impede os demais dados.
  }

  const unicos = new Map();

  candidatos.forEach(candidato => {
    const chave = candidato.url.split("?")[0].toLowerCase();
    const atual = unicos.get(chave);
    if (!atual || candidato.rotulo.length > atual.rotulo.length) {
      unicos.set(chave, candidato);
    }
  });

  const ordem = {
    manual: 1,
    instalacao: 2,
    "guia-rapido": 3,
    "ficha-tecnica": 4,
    certificacao: 5
  };

  return [...unicos.values()]
    .map(candidato => ({
      ...classificarDocumento(candidato.rotulo, candidato.url),
      url: candidato.url.split("#")[0],
      fonte: "Samsung",
      prioridadeIdioma: /bpt|portugu[eê]s|portuguese|brazil|[_-]por(?:[_-]|\.)/i.test(
        `${candidato.rotulo} ${decodeURIComponent(candidato.url)}`
      ) ? 0 : 1
    }))
    .filter(documento => {
      try {
        const url = new URL(documento.url);
        return HOSTS_OFICIAIS.has(url.hostname.toLowerCase()) &&
          /\.pdf(?:$|\?)/i.test(url.href);
      } catch {
        return false;
      }
    })
    .filter(documento => documento.tipo === "manual")
    .sort((a, b) =>
      a.prioridadeIdioma - b.prioridadeIdioma ||
      (ordem[a.tipo] || 99) - (ordem[b.tipo] || 99)
    )
    .slice(0, 1)
    .map(({ prioridadeIdioma, ...documento }) => documento);
}
