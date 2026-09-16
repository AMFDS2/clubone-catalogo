# Club One — arquivos corrigidos

Substitua no projeto original:

- `index.html`
- `script.js`
- `style.css`
- `package.json`
- `scripts/enriquecer-produtos.mjs`
- `scripts/gerar-catalogo-preview.mjs`

Mantenha as pastas `assets`, `dados` e os outros scripts já existentes.

Depois execute:

```powershell
npm install
npm run enriquecer
npm run gerar
npm run check
```

Abra o projeto pelo Live Server e atualize com `Ctrl + F5`.

O catálogo público usa somente `siteInfoStore`. As URLs oficiais consultadas permanecem apenas em arquivos internos da pasta `dados`.

## Base necessária

A planilha permanece com cinco colunas: `FABRICANTE`, `SEGMENTO`, `CODIGO`, `PRODUTO` e `MODELO`.

- Fabricantes e segmentos viram filtros automaticamente.
- O link da Info Store é gerado pelo código.
- Não é necessário cadastrar ambiente nem URL manualmente.
- Para habilitar o download completo, coloque o PDF em `assets/catalogos/catalogo-completo.pdf`.
