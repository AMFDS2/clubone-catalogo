import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const raiz = fileURLToPath(new URL('../../', import.meta.url));
export async function lerJSON(arquivo, padrao = []) {
  try { return JSON.parse(await fs.readFile(path.join(raiz, arquivo), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return padrao; throw e; }
}
export async function gravarJSON(arquivo, valor) {
  const p = path.join(raiz, arquivo); await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p + '.tmp', JSON.stringify(valor, null, 2)); await fs.rename(p + '.tmp', p);
}
export function localSeguro(url) {
  return typeof url === 'string' && /^(assets|manuais-oficiais)\//.test(url) && !url.split('/').includes('..') && !/[\\?#]/.test(url);
}
export async function existeLocal(url) {
  if (!localSeguro(url)) return false;
  try { return (await fs.stat(path.join(raiz, url))).isFile(); } catch { return false; }
}
export async function baixar(url, destino, tipo) {
  if (!/^https:\/\//i.test(url)) throw new Error('Fonte deve usar HTTPS');
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 18);
  const pasta = path.join(raiz, destino); await fs.mkdir(pasta, { recursive: true });
  const existentes = await fs.readdir(pasta);
  const anterior = existentes.find(f => f.startsWith(hash + '.'));
  if (anterior) return `${destino}/${anterior}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: {'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pt-BR,pt;q=0.9'} });
  if (!r.ok) throw new Error(`Arquivo HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  const b = Buffer.from(await r.arrayBuffer());
  let ext;
  if (tipo === 'pdf') {
    if (!b.subarray(0,1024).includes(Buffer.from('%PDF-'))) throw new Error('Documento recebido não é PDF');
    ext = 'pdf';
  } else {
    if (!ct.startsWith('image/') || /svg/i.test(ct)) throw new Error('Imagem recebida inválida');
    const png = b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = b[0] === 255 && b[1] === 216;
    const webp = b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP';
    if (!png && !jpg && !webp) throw new Error('Formato de imagem não reconhecido');
    ext = png ? 'png' : webp ? 'webp' : 'jpg';
  }
  const arquivo = `${hash}.${ext}`;
  await fs.writeFile(path.join(pasta, arquivo + '.tmp'), b); await fs.rename(path.join(pasta, arquivo + '.tmp'), path.join(pasta, arquivo));
  return `${destino}/${arquivo}`;
}
export async function textoURL(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: {'User-Agent':'Mozilla/5.0', 'Accept-Language':'pt-BR,pt;q=0.9'} });
  if (!r.ok) throw new Error(`Página HTTP ${r.status}: ${url}`);
  const b = Buffer.from(await r.arrayBuffer());
  const latin = /(?:charset=["']?(?:iso-8859-1|windows-1252))/i.test(r.headers.get('content-type') || b.subarray(0,5000).toString());
  return b.toString(latin ? 'latin1' : 'utf8');
}
