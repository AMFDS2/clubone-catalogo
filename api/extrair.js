import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  // Garantir que a rota apenas aceita pedidos POST do seu front-end
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { url } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    // 1. Transferir o PDF temporariamente para a memória do servidor
    const respostaPdf = await fetch(url);
    const arrayBuffer = await respostaPdf.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // 2. Enviar o documento e as instruções para o Gemini
    const prompt = "Atuando como arquiteto, analise este manual de instalação. Extraia as folgas mínimas exigidas (respiro superior, lateral e traseiro) e dimensões recomendadas do nicho. Retorne APENAS um JSON estruturado, sem texto adicional.";
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { inlineData: { data: base64Data, mimeType: 'application/pdf' } },
        prompt
      ]
    });

    // 3. Devolver os dados limpos ao front-end
    const textoLimpo = response.text.replace(/```json|```/g, '').trim();
    res.status(200).json(JSON.parse(textoLimpo));

  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Falha ao analisar o manual.' });
  }
}