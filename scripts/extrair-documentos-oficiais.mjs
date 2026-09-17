const HOSTS_OFICIAIS = new Set([
  "downloadcenter.samsung.com",
  "org.downloadcenter.samsung.com",
  "www.samsung.com",
  "samsung.com"
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

export function extrairDocumentosOficiais($, html = "", fonteInterna = "") {
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
      url: candidato.url,
      fonte: "Samsung"
    }))
    .sort((a, b) => (ordem[a.tipo] || 99) - (ordem[b.tipo] || 99))
    .slice(0, 8);
}
