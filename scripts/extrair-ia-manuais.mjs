import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.warn("⚠️ Chave GEMINI_API_KEY não encontrada. Pulando extração por IA.");
    process.exit(0);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
// Gravamos no arquivo base para que a automação seguinte (gerar-preview) não apague os dados
const ARQUIVO_JSON = path.resolve('produtos.json'); 

async function extrairDadosIA() {
  console.log('🤖 Iniciando extração automatizada de manuais oficiais via IA...\n');
  
  let conteudo;
  try {
    conteudo = await fs.readFile(ARQUIVO_JSON, 'utf-8');
  } catch (err) {
    console.error(`❌ Arquivo ${ARQUIVO_JSON} não encontrado. Execute o npm run enriquecer primeiro.`);
    return;
  }

  const produtos = JSON.parse(conteudo);
  let atualizados = 0;

  for (const produto of produtos) {
    if (produto.medidasIA || !produto.documentos || produto.documentos.length === 0) continue;

    const manualPdf = produto.documentos.find(doc => doc.tipo === 'manual' && (doc.urlOriginal || doc.url));
    if (!manualPdf) continue;

    console.log(`Processando: ${produto.modelo} - ${produto.nome.substring(0, 35)}...`);

    let sucesso = false;
    let tentativas = 0;

    while (!sucesso && tentativas < 3) {
      try {
        const urlLimpa = (manualPdf.urlOriginal || manualPdf.url).replace(/\\/g, '/');
        const respostaPdf = await fetch(urlLimpa, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' }
        });

        if (!respostaPdf.ok) break; 

        const arrayBuffer = await respostaPdf.arrayBuffer();
        if (Buffer.from(arrayBuffer.slice(0, 500)).toString('utf-8').toLowerCase().includes('<html')) {
          console.log(`  -> ⚠️ PDF protegido pelo fabricante. Tentaremos noutra atualização.`);
          break;
        }

        const prompt = `Analise este manual de instalação. Extraia as medidas exigidas e retorne APENAS um objeto JSON válido.
        Se a cota não estiver no manual, preencha com "-".
        Formato exato: {"respiro_lateral": "valor", "respiro_superior": "valor", "respiro_traseiro": "valor", "nicho_largura": "valor", "nicho_altura": "valor"}`;

        // Utilização do modelo correto e mais estável da Google para evitar Erro 503
        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents: [{ inlineData: { data: Buffer.from(arrayBuffer).toString('base64'), mimeType: 'application/pdf' } }, prompt]
        });

        const jsonMatch = (response.text || "").match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          produto.medidasIA = JSON.parse(jsonMatch[0]);
          atualizados++;
          sucesso = true;
          console.log(`  -> ✅ Sucesso! Nicho: ${produto.medidasIA.nicho_largura} x ${produto.medidasIA.nicho_altura}`);
          
          await fs.writeFile(ARQUIVO_JSON, JSON.stringify(produtos, null, 2));
        }

      } catch (erro) {
        if (erro.message.includes("503") || erro.message.includes("429")) {
          tentativas++;
          console.log(`  -> ⏳ Tráfego alto na Google. Repetindo em 10s...`);
          await new Promise(res => setTimeout(res, 10000));
        } else {
          break;
        }
      }
    }
    
    if (sucesso) await new Promise(res => setTimeout(res, 3000)); // Pausa breve para não sobrecarregar
  }

  console.log(`\n🎉 Extração concluída! ${atualizados} novos produtos automatizados.`);
}

extrairDadosIA();