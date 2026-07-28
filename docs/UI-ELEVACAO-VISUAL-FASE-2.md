# Elevação Visual — Fase 2: evidências de QA

**Data:** 2026-07-28
**Status:** validada localmente; sem commit, push ou deploy.

## Escopo entregue e aprovado

1. Cartas premium, verso e mesa responsiva local/online.
2. Logo oficial do Kabemjunto — wordmark verde/prata, coroa dourada e bigode em fundo preto.
3. Lobby e entrada online premium, preservando a criação/entrada de sala e os estados reais de conexão.
4. Coleção visual local: prévia de baralho, avatares e temas Floresta, Neon e Areia.

Não foram introduzidos regras, backend, Socket.IO, economia, loja, moedas, inventário, raridade, desbloqueios ou cartas fora do baralho canônico.

## Evidências de qualidade

| Gate                   | Resultado medido                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `npm run validate`     | Passou: 20 arquivos de teste, 263 testes; typecheck, ESLint, Prettier e build concluídos. |
| `npm run test:cov`     | Passou: 20 arquivos de teste, 263 testes.                                                 |
| `npm run e2e`          | Passou: 19/19 cenários.                                                                   |
| `npm audit --omit=dev` | 0 vulnerabilidades encontradas.                                                           |
| `git diff --check`     | Passou sem erros de whitespace.                                                           |

Os avisos de telemetria e `MaxListenersExceededWarning` vistos durante a suíte pertencem a cenários de teste já existentes; todos os comandos encerraram com código 0.

## Responsividade e acessibilidade verificadas

- Mesa local: viewport `390×844`, sem overflow horizontal e sem colisões críticas entre header, status, assentos, núcleo, resumo e mão.
- Lobby online: `390×844` e `1280×800`, logo carregada, foco inicial no nome, CTA Criar sala acima de Entrar em sala e sem overflow.
- Coleção local: `390×844` como bottom sheet e `1280×800` como modal central; foco inicial em Fechar, Escape e clique no backdrop fecham, radiogroups preservam estado único e assets carregam.

Capturas locais de QA foram geradas em `tmp/` e devem permanecer fora de versionamento.

## Build de produção

Foram verificados no diretório `apps/web/dist/assets/cards/kabemjunto/`:

- `brand-kabemjunto.webp` — 800×314
- `card-back.webp`
- `mais-quatro.webp`
- `zero-mais.webp`
- `troca-mao.webp`

## Escopo de versionamento futuro

Incluir somente código, testes E2E focais, documentação e assets runtime de `apps/web/public/assets/cards/kabemjunto/`.

Excluir de qualquer commit:

- `imagem_game/` (fontes e referências brutas);
- `tmp/` (capturas e scripts de QA);
- `coverage/`, `dist/` e artefatos de execução;
- arquivos não relacionados ao slice visual.
