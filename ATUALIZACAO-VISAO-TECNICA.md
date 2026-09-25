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

O padrão desta versão é `gemini-2.5-flash`. Para forçar esse modelo apenas na sessão atual do PowerShell:

```powershell
$env:GEMINI_MODEL="gemini-2.5-flash"
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
