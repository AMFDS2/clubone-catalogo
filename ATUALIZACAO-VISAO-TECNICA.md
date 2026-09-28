# Atualização da visão técnica

Arquivos alterados:

- `script.js`: desenhos usam apenas cotas confirmadas, exibem referência e resumo de validação.
- `style.css`: estilos do resumo e dos estados técnicos.
- `scripts/extrair-ia-manuais.mjs`: correção de execução, normalização, reconciliação e auditoria das medidas.
- `scripts/validar-medidas-projeto.mjs`: validação local antes de publicar.
- `package.json`: novo comando de validação.

## Fluxo recomendado por modelo

```powershell
npm run extrair -- --modelo="RF70H25HETAZ" --force
npm run validar:medidas -- --modelo="RF70H25HETAZ"
npm run check
```

O extrator consulta a API e seleciona apenas modelos que realmente aceitam `generateContent`. A preferência atual começa em `gemini-3.8-flash`; nomes indisponíveis são descartados antes da extração.

```powershell
$env:GEMINI_MODEL="gemini-3.8-flash"
$env:GEMINI_REVIEW_MODEL="off"
```

Use `--completar` no lugar de `--force` para procurar somente campos pendentes. O comando de validação retorna código 2 quando encontra inconsistências; nesse caso, revise o JSON antes de publicar.

O desenho técnico não exibe valores em revisão, não localizados ou não aplicáveis. Esses valores permanecem na tabela de auditoria para acompanhamento.

## Extração offline e híbrida

O modo padrão é híbrido: tenta a leitura online e, se houver erro 429/503, continua localmente sem interromper o produto. Medidas já confirmadas são preservadas e o modo offline apenas complementa campos pendentes.

```powershell
# Sem qualquer chamada ao Gemini
npm run extrair:offline -- --modelo="RF70H25HETAZ" --force

# Padrão híbrido: online com fallback offline automático
npm run extrair -- --modelo="RF70H25HETAZ" --force

# Somente online
npm run extrair -- --modelo="RF70H25HETAZ" --online --force
```

O modo offline não inventa a coluna correta quando uma tabela contém valores concorrentes. Nessa situação, mantém o valor anterior confirmado ou grava os novos candidatos como `REVISAR`.

## Leitura técnica v4

Antes da chamada à IA, `scripts/indexar-manual.mjs` lê o texto e a posição dos elementos do PDF e cria um índice das páginas com maior probabilidade de conter:

- dimensões físicas do produto;
- nicho, recorte e instalação;
- folgas de ventilação;
- abertura de portas e gavetas;
- vistas frontal, lateral e superior;
- a coluna correspondente ao modelo solicitado.

Esse índice acompanha o PDF na análise e também fica salvo em `medidasProjeto.indiceTecnico`, permitindo conferir quais páginas sustentam o desenho. Folga, afastamento da parede e espaço de abertura não podem ser reutilizados como largura, altura ou profundidade do produto.

Cada medida `CONFIRMADO` precisa conter `valor`, `pagina` e `referencia`. O comando de validação também normaliza mm, cm e m antes de comparar profundidades e aberturas.

Para validar um único produto antes de avançar para os demais:

```powershell
npm run extrair -- --modelo="RF29DB9950QDAZ" --force
npm run validar:medidas -- --modelo="RF29DB9950QDAZ"
```

Depois confira no catálogo o resumo de validação e as vistas frontal/superior. Somente campos confirmados entram no SVG.

Importante: `OK` agora significa que pelo menos duas das três dimensões básicas foram confirmadas. Uma resposta online válida, porém vazia, aciona automaticamente a leitura offline. Se largura, altura ou profundidade continuarem ausentes, o terminal exibe `PENDENTE` e `npm run validar:medidas` retorna erro em vez de aprovar silenciosamente.

## Continuidade sem IA

Se os modelos online estiverem indisponíveis e o PDF não possuir texto estruturado, largura, altura e profundidade são recuperadas de `produto.dimensoes`, que já contém a ficha dimensional oficial usada pelo catálogo. Esses campos recebem a origem `CADASTRO_OFICIAL`; o catálogo os identifica como “Ficha oficial”, sem afirmar que vieram do manual. Nicho, folgas, portas, gavetas e pontos de instalação continuam dependendo do manual e permanecem vazios quando não forem comprovados.

Para o modelo RF29DB9950QDAZ, a tabela RF29D** foi conferida e registrada em `scripts/dados-tecnicos-validados.mjs`: itens 01 a 07, incluindo 125°, 1498 mm de largura aberta, 748 mm de gabinete e 1231 mm de profundidade aberta. A aba técnica passa a mostrar vistas frontal, superior e lateral. A blocagem 3D e a foto do produto foram removidas dessa aba por já aparecerem em outras áreas do catálogo.
