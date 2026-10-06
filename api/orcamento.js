import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const MAX_PDF_BASE64 = 2_800_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }

  try {
    const pdfBase64 = String(req.body?.pdfBase64 || '').trim();

    if (!pdfBase64 || pdfBase64.length > MAX_PDF_BASE64) {
      return res.status(400).json({ erro: 'PDF ausente ou acima do limite permitido.' });
    }

    // PDFs em base64 começam com JVBERi (assinatura %PDF-).
    if (!pdfBase64.startsWith('JVBERi')) {
      return res.status(400).json({ erro: 'Arquivo inválido.' });
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      return res.status(400).json({ erro: 'Conteúdo não é um PDF válido.' });
    }

    const agora = new Date();
    const data = agora.toISOString().slice(0, 10);
    const pathname = `orcamentos/${data}/catalogo-${Date.now()}-${randomUUID()}.pdf`;

    const blob = await put(pathname, buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/pdf',
      cacheControlMaxAge: 60 * 60
    });

    return res.status(200).json({
      url: blob.url,
      pathname: blob.pathname
    });
  } catch (erro) {
    console.error('Erro ao publicar orçamento:', erro);
    return res.status(500).json({ erro: 'Não foi possível armazenar o PDF.' });
  }
}
