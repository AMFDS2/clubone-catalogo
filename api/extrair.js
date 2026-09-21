const { GoogleGenAI } = require('@google/genai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ erro: 'URL não fornecida.' });
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const urlLimpa = url.replace(/\\/g, '/');

    const respostaPdf = await fetch(urlLimpa, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*'
      }
    });

    if (!respostaPdf.ok) {
       return res.status(respostaPdf.status).json({ erro: 'Falha no download', detalhe: `O fabricante recusou o acesso (Status ${respostaPdf.status}).` });
    }

    const arrayBuffer = await respostaPdf.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const prompt = `Analise este manual de instalação. Extraia as medidas exigidas e retorne APENAS um JSON estrito neste formato, sem textos adicionais:
    {
      "respiro_lateral": "valor com unidade",
      "respiro_superior": "valor com unidade",
      "respiro_traseiro": "valor com unidade",
      "nicho_largura": "valor",
      "nicho_altura": "valor"
    }`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        { inlineData: { data: base64Data, mimeType: 'application/pdf' } },
        prompt
      ]
    });

    const textoLimpo = response.text.replace(/```json|```/g, '').trim();
    res.status(200).json(JSON.parse(textoLimpo));

  } catch (erro) {
    console.error("Erro capturado na API:", erro);
    res.status(500).json({ erro: 'Erro interno', detalhe: erro.message });
  }
};