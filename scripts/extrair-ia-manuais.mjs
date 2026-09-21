import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

// Coloque a sua chave gerada no Google AI Studio aqui para uso local
const API_KEY = process.env.GEMINI_API_KEY; 
const ai = new GoogleGenAI({ apiKey: API_KEY });

const ARQUIVO_JSON = path.resolve('produtos.preview.json');

async function extrairDadosIA() {
  console.log('Iniciando extração de dados com IA...\n');
  
  let conteudo;
  try {
    conteudo = await fs.readFile(ARQUIVO_JSON, 'utf-8');
  } catch (err) {
    console.error("❌ Arquivo produtos.preview.json não encontrado na raiz.");
    return;
  }

  const produtos = JSON.parse(conteudo);
  let atualizados = 0;

  for (const produto of produtos) {
    // Ignora se o produto já tem os dados da IA ou se não possui manual em PDF
    if (produto.medidasIA || !produto.documentos || produto.documentos.length === 0) continue;

    const manualPdf = produto.documentos.find(doc => doc.tipo === 'manual' && (doc.urlOriginal || doc.url));
    if (!manualPdf) continue;

    const url = manualPdf.urlOriginal || manualPdf.url;
    console.log(`Processando: ${produto.modelo} - ${produto.nome.substring(0, 35)}...`);

    try {
      const urlLimpa = url.replace(/\\/g, '/');
      const respostaPdf = await fetch(urlLimpa, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*'
        }
      });

      if (!respostaPdf.ok) {
        console.log(`  -> ❌ Falha ao baixar PDF (Status: ${respostaPdf.status})`);
        continue;
      }

      const arrayBuffer = await respostaPdf.arrayBuffer();
      const conteudoInicial = Buffer.from(arrayBuffer.slice(0, 500)).toString('utf-8').toLowerCase();
      
      if (conteudoInicial.includes('<!doctype html') || conteudoInicial.includes('<html')) {
        console.log(`  -> ❌ Bloqueado pelo fabricante (Site retornou HTML)`);
        continue;
      }

      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const prompt = `Analise este manual de instalação. Extraia as medidas exigidas e retorne APENAS um objeto JSON válido.
      Se a cota não estiver no manual, preencha com "-".
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
        contents: [{ inlineData: { data: base64Data, mimeType: 'application/pdf' } }, prompt]
      });

      let textoLimpo = response.text || "";
      const jsonMatch = textoLimpo.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const dadosJson = JSON.parse(jsonMatch[0]);
        produto.medidasIA = dadosJson; // Adiciona os dados ao produto
        atualizados++;
        console.log(`  -> ✅ Sucesso! Nicho: ${dadosJson.nicho_largura} x ${dadosJson.nicho_altura}`);
        
        // Salva o JSON imediatamente para não perder dados
        await fs.writeFile(ARQUIVO_JSON, JSON.stringify(produtos, null, 2));
      } else {
        console.log(`  -> ❌ Resposta da IA fora do formato esperado.`);
      }

      // Pausa de 5 segundos entre cada manual para respeitar o limite gratuito do Google (evitar erro 503)
      await new Promise(res => setTimeout(res, 5000));

    } catch (erro) {
      console.log(`  -> ❌ Erro: ${erro.message}`);
    }
  }

  console.log(`\n🎉 Processo concluído! ${atualizados} manuais lidos e guardados com sucesso no JSON.`);
}

extrairDadosIA();