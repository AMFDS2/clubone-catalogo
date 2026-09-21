import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
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
    
    // Verificação de segurança contra falsos PDFs
    const conteudoInicial = Buffer.from(arrayBuffer.slice(0, 500)).toString('utf-8').toLowerCase();
    if (conteudoInicial.includes('<!doctype html') || conteudoInicial.includes('<html')) {
        return res.status(400).json({ 
          erro: 'Bloqueio do Fabricante', 
          detalhe: 'O link do manual não permitiu o download automático (retornou uma página web bloqueada).' 
        });
    }

    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const prompt = `Atue como um extrator de dados estruturados.
    Analise este manual de instalação. Extraia as medidas exigidas e retorne APENAS um objeto JSON válido, sem nenhum texto de introdução ou formatação extra.
    Se a cota não estiver no manual, preencha o valor com "Verificar manual".
    Formato exato exigido:
    {
      "respiro_lateral": "valor",
      "respiro_superior": "valor",
      "respiro_traseiro": "valor",
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

    let textoLimpo = response.text || "";
    const jsonMatch = textoLimpo.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
        throw new Error("A IA não conseguiu formatar os dados. Resposta bruta: " + textoLimpo.substring(0, 50));
    }

    let dadosJson;
    try {
        dadosJson = JSON.parse(jsonMatch[0]);
    } catch (err) {
        throw new Error("O formato lido continha erros estruturais. Tente novamente.");
    }

    res.status(200).json(dadosJson);

  } catch (erro) {
    console.error("Erro capturado na API:", erro);
    res.status(500).json({ erro: 'Erro interno', detalhe: erro.message });
  }
}