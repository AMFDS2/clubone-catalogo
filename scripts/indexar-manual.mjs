import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const normalizar = valor => String(valor || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");

const sinais = [
  [/DIMENS|MEASUREMENTS?|MEDIDAS?/, 7, "dimensões"],
  [/INSTALA|INSTALLATION|NICHO|CUTOUT|RECORTE/, 6, "instalação/nicho"],
  [/PORTA.{0,25}ABERT|DOOR.{0,25}OPEN|OPENING ANGLE|ANGULO/, 6, "abertura"],
  [/LARGURA|WIDTH|ALTURA|HEIGHT|PROFUNDIDADE|DEPTH/, 4, "cotas"],
  [/FOLGA|CLEARANCE|VENTILA/, 4, "folgas"],
  [/VISTA (?:FRONTAL|SUPERIOR|LATERAL)|FRONT VIEW|TOP VIEW|SIDE VIEW/, 5, "vista técnica"],
  [/ESPECIFICA|SPECIFICATIONS?/, 3, "especificações"]
];

export function linhasDaPagina(itens = []) {
  const linhas = new Map();
  for (const item of itens) {
    const texto = String(item.str || "").trim();
    if (!texto) continue;
    const y = Math.round((item.transform?.[5] || 0) / 2) * 2;
    if (!linhas.has(y)) linhas.set(y, []);
    linhas.get(y).push({ x: item.transform?.[4] || 0, texto });
  }
  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, partes]) => partes.sort((a, b) => a.x - b.x).map(p => p.texto).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function pontuar(texto, modelo) {
  let pontos = 0;
  const tipos = new Set();
  const textoNormalizado = normalizar(texto);
  const modeloNormalizado = normalizar(modelo);
  if (modeloNormalizado && textoNormalizado.includes(modeloNormalizado)) {
    pontos += 16;
    tipos.add("modelo exato");
  } else if (modeloNormalizado.length >= 6 && textoNormalizado.includes(modeloNormalizado.slice(0, 6))) {
    pontos += 5;
    tipos.add("família do modelo");
  }
  for (const [regex, peso, tipo] of sinais) {
    if (regex.test(texto)) {
      pontos += peso;
      tipos.add(tipo);
    }
  }
  const medidas = texto.match(/\b\d{1,4}(?:[.,]\d+)?\s*(?:mm|cm|m|°|graus?)\b/gi) || [];
  pontos += Math.min(medidas.length, 8);
  return { pontos, tipos: [...tipos] };
}

export async function indexarPdfs(produto, pdfs, limitePaginas = 14) {
  const paginas = [];
  for (let documentoIndice = 0; documentoIndice < pdfs.length; documentoIndice++) {
    const item = pdfs[documentoIndice];
    const documento = await getDocument({ data: new Uint8Array(item.bytes), disableWorker: true }).promise;
    for (let pagina = 1; pagina <= documento.numPages; pagina++) {
      const conteudo = await (await documento.getPage(pagina)).getTextContent();
      const linhas = linhasDaPagina(conteudo.items);
      const texto = linhas.join("\n");
      const ranking = pontuar(texto, produto.modelo);
      paginas.push({
        documentoIndice,
        documento: item.manual?.nome || `Documento ${documentoIndice + 1}`,
        pagina,
        linhas,
        ...ranking
      });
    }
  }

  const selecionadas = paginas
    .filter(item => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.documentoIndice - b.documentoIndice || a.pagina - b.pagina)
    .slice(0, limitePaginas)
    .sort((a, b) => a.documentoIndice - b.documentoIndice || a.pagina - b.pagina);

  const resumo = selecionadas.map(item => {
    const texto = item.linhas.join("\n").slice(0, 6500);
    return `### ${item.documento} — página PDF ${item.pagina}\nTipos: ${item.tipos.join(", ") || "candidato"}\n${texto}`;
  }).join("\n\n");

  return { paginas, selecionadas, resumo };
}

