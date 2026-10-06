import { del, list } from '@vercel/blob';

const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;
const PREFIXO = 'orcamentos/';
const LOTE_DELETE = 100;

function autorizado(req) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;

  const auth = String(req.headers?.authorization || '');
  return auth === `Bearer ${segredo}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }

  if (!autorizado(req)) {
    return res.status(401).json({ erro: 'Não autorizado.' });
  }

  try {
    const limite = Date.now() - TRES_DIAS_MS;

    let cursor;
    let hasMore = true;
    let verificados = 0;
    const expirados = [];

    while (hasMore) {
      const pagina = await list({
        prefix: PREFIXO,
        limit: 1000,
        cursor
      });

      for (const blob of pagina.blobs || []) {
        verificados += 1;

        const uploadedAt = new Date(blob.uploadedAt).getTime();
        if (Number.isFinite(uploadedAt) && uploadedAt <= limite) {
          expirados.push(blob.url);
        }
      }

      hasMore = Boolean(pagina.hasMore);
      cursor = pagina.cursor;
    }

    for (let i = 0; i < expirados.length; i += LOTE_DELETE) {
      await del(expirados.slice(i, i + LOTE_DELETE));
    }

    return res.status(200).json({
      ok: true,
      retencaoHoras: 72,
      verificados,
      apagados: expirados.length
    });
  } catch (erro) {
    console.error('Erro ao limpar PDFs expirados:', erro);
    return res.status(500).json({
      ok: false,
      erro: 'Não foi possível limpar os PDFs expirados.'
    });
  }
}
