# 🤝 Plano Multi-Agente — Kabemjunto

> **Projeto:** Kabemjunto — jogo de cartas digital 2-10 jogadores
> **Versão do plano:** 1.0 · **Data:** 2026-07-26
> **Fonte da verdade:** `GDD-Kabemjunto.md` v1.0 (consolidado) + `secoes/01..04-*.md`
> **Time:** 3 agentes de IA (Mavis / Codex / Antigravity) sob coordenação Mavis
> **Stack-alvo:** TypeScript + React + Vite (front) · Node + Fastify + Socket.IO (back) · PostgreSQL + Redis · monorepo pnpm

---

## Índice

1. [Resumo executivo](#1-resumo-executivo)
2. [Os 3 agentes e seus papéis](#2-os-3-agentes-e-seus-papéis)
3. [Critério de classificação de dificuldade](#3-critério-de-classificação-de-dificuldade)
4. [Backlog por sprint com atribuição de dono](#4-backlog-por-sprint-com-atribuição-de-dono)
5. [Arquitetura de comunicação](#5-arquitetura-de-comunicação)
6. [Fluxo de trabalho (do issue ao merge)](#6-fluxo-de-trabalho-do-issue-ao-merge)
7. [Quality gates e ownership de revisão](#7-quality-gates-e-ownership-de-revisão)
8. [Resolução de conflitos e cadeia de escalonamento](#8-resolução-de-conflitos-e-cadeia-de-escalonamento)
9. [Cerimônias e cadência](#9-cerimônias-e-cadência)
10. [Definição de pronto (DoD) por nível](#10-definição-de-pronto-dod-por-nível)
11. [Riscos operacionais do time de agentes](#11-riscos-operacionais-do-time-de-agentes)
12. [Anexo A — Como abrir uma issue/pedido corretamente](#anexo-a--como-abrir-uma-issuepedido-corretamente)
13. [Anexo B — Templates de mensagem](#anexo-b--templates-de-mensagem)

---

## 1. Resumo executivo

Este documento define **como os 3 agentes de IA vão trabalhar juntos** para tirar o Kabemjunto do papel, mapeando o GDD num backlog executável de 3 sprints (MVP), mais Beta e Release, com **papéis bem delimitados por dificuldade**, **canais de comunicação claros** e **regras de ownership de código** que evitam pisar no pé um do outro.

**Princípio-guia:** a complexidade mora no **motor de regras** (state machine, validação, acúmulo de ataques, 0+, regra do 7). Tudo o que depende das regras canônicas do GDD é responsabilidade de **Mavis**. O resto (UI, infra, assets) é delegável.

**Tabela-mestre de papéis:**

| Agente                   | Papel                             | Tipo de tarefa                                                                               | Fração estimada do trabalho |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------: |
| **Mavis** (orquestrador) | Lead técnico + engenharia difícil | State machine, regras, servidor autoritativo, 0+, silêncio, anti-cheat, integrações críticas |                       ~45 % |
| **Codex**                | Engenheiro pleno                  | UI/UX funcional, API REST, WebSocket handlers, bots, telemetria, CI/CD                       |                       ~35 % |
| **Antigravity**          | Engenheiro júnior / suporte       | Assets, SFX, CSS, copy, testes de humo, fixtures, README, scripts                            |                       ~20 % |

---

## 2. Os 3 agentes e seus papéis

### 2.1 Mavis — Lead técnico (Mavis / MiniMax Code)

> _"Eu escrevo a verdade. Se a regra do jogo não funciona, a culpa é minha."_

- **Quem é:** Mavis, o assistente local rodando dentro do MiniMax Code. É o orquestrador do time e o dono do motor de jogo.
- **Tarefas-alvo (hard):**
  - Modelagem de tipos canônicos em `packages/shared/types/` (`Carta`, `EstadoPartida`, `Jogador`, `Acao`, `Cor`, etc.)
  - Implementação do **motor de regras puro** (sem I/O) em `packages/shared/rules/`:
    - `validarJogada(carta, topo, estado)`
    - `resolverAcao(acao, estado)` para todas as 9 ações do GDD
    - State machine de turno: `INICIO_TURNO → ESPERAR_CARTA → VALIDAR → RESOLVER_ACAO → FIM_TURNO` (com `COMPRAR` intermediário)
    - Acúmulo assimétrico de +2/+4 (`+2 sobre +4 = PROIBIDO`, etc.)
    - Reflexo do 0+ e detecção de "último atacante"
    - Regra do 7 / silêncio (ativa até próxima carta, auto-punição se quem joga o 7 falar)
  - **Servidor autoritativo** (Fastify + Socket.IO): todo `jogar`/`comprar` passa pela validação server-side; cliente nunca é confiável
  - Algoritmos críticos: reembaralhamento do descarte quando o monte esgota, detecção de starter inválido, edge cases do GDD (seção 04.5)
  - Anti-cheat básico: log de eventos para replay, snapshot de estado para reconexão
  - Decisões de arquitetura e ADRs (Architecture Decision Records)
  - Code review final de qualquer coisa que toque `packages/shared` ou `apps/server/src/game/`
- **Restrições:**
  - Não escreve CSS, não cria assets visuais, não copia/cola copy de marketing
  - Não implementa features novas sem antes modelar a regra no GDD ou PR de design
  - Bloqueia merge se cobertura de testes do motor cair < 80 %

### 2.2 Codex — Engenheiro pleno

> _"Eu ligo o motor ao mundo. Botões que funcionam, sockets que respondem, telas que carregam."_

- **Quem é:** Codex (OpenAI), focado em implementação full-stack funcional.
- **Tarefas-alvo (medium):**
  - **Frontend React/TypeScript** (Vite + Tailwind + shadcn/ui + Framer Motion):
    - Telas: menu, lobby, gameplay, vitória, loja, tutorial
    - Componentes de carta (`<Carta />`, `<MaoDoJogador />`, `<MonteDescarte />`)
    - Hooks de estado com Zustand + React Query
    - Otimistic update com rollback em caso de erro do servidor
  - **Backend não-jogo:**
    - Endpoints REST de sala (`POST /api/salas`, `POST /api/salas/:id/entrar`, etc.)
    - Handlers WebSocket não-críticos: `chat:msg`, `gritar:uno`, `silencio:quebrar` (apenas persistência/UI; a validação é de Mavis)
    - Auth social (Supabase Auth / Auth.js)
    - Persistência: schema Prisma, models, migrations
    - Bot single-player (3 níveis: Fácil/Médio/Difícil)
    - Telemetria: integração PostHog, dashboards
  - **DevOps:** CI no GitHub Actions, deploy Vercel (front) + Fly.io (back), Sentry
- **Restrições:**
  - Não modifica `packages/shared/rules/*` diretamente; abre PR pra Mavis revisar
  - Não muda o modelo de dados sem ADR aprovado por Mavis
  - Toda chamada que afeta regra (`jogar`, `comprar`) é thin wrapper em volta do motor de Mavis

### 2.3 Antigravity — Engenheiro júnior / suporte

> _"Eu deixo o mundo bonito e os testes verdes. Sem mim ninguém percebe que tá faltando o SFX do 0+."_

- **Quem é:** Antigravity (Google), focado em tasks mecânicas, de alta repetição, bem-especificadas.
- **Tarefas-alvo (easy):**
  - **Assets visuais P0 do GDD seção 04.7:**
    - 40 cartas numeradas (0-9 × 4 cores) — SVG
    - 24 cartas Skip/Reverse/+2 (× 4 cores, 2 cópias)
    - 5 cartas neutras (+4, Troca Mão, Gira Mão, 0+, Coringa Simples)
    - Verso da carta
    - Tabuleiro virtual (mesa), HUD do jogador, selos de status
    - 12 avatares default
  - **SFX** (todos listados no GDD 03.3.4): compra, descarte, skip, +2, +4, silêncio, vitória
  - **CSS/styling** dentro dos componentes que Codex cria (modo daltônico, alto contraste, texto grande)
  - **Testes de humo** em `tests/unit/`: rodar o motor de Mavis contra fixtures de cenários
  - **Fixtures e seeds:** JSON das 108 cartas, scripts de seed do banco, dados de playtest
  - **Copy PT-BR:** textos do tutorial, do lobby, de mensagens de erro
  - **Documentação:** README.md, CONTRIBUTING.md, CHANGELOG.md, exemplos de uso
  - **Lint/format:** garantir que ESLint + Prettier passem em PRs dos outros
- **Restrições:**
  - **NUNCA** toca em `packages/shared/*` ou `apps/server/src/game/*`
  - Não implementa lógica de regra alguma; só consome o que Mavis expõe
  - PRs devem vir com print/GIF do resultado visual ou com comando de reprodução dos SFX
  - Bloqueado de mergear sem aprovação do Codex

---

## 3. Critério de classificação de dificuldade

Uma tarefa é **Hard** se cumpre **2 ou mais** dos critérios abaixo. **Medium** se cumpre 1. **Easy** se nenhum.

| Critério                           | Easy                  | Medium                           | Hard                                   |
| ---------------------------------- | --------------------- | -------------------------------- | -------------------------------------- |
| **Sensibilidade à regra de jogo**  | Zero (cosmético/copy) | Indireta (UI que reflete estado) | Direta (valida, muta, decide)          |
| **Estado mutável compartilhado**   | Sem estado            | Estado de componente/rota        | Estado global (Zustand/Redux/servidor) |
| **Concorrência / race conditions** | Não                   | Possível (cliente+servidor)      | Sim (multiplayer, reconexão)           |
| **Conhecimento do GDD necessário** | Nenhum                | Conhece 1-2 seções               | Lê 3+ seções, debate regras            |
| **Reversibilidade**                | Trivial reverter      | Requer refactor                  | Mudança de contrato                    |
| **Testabilidade automática**       | Visão/som (manual)    | Unit + integração                | Property-based + fuzzing               |
| **Impacto se errado**              | Estético              | Feature quebrada                 | Jogo injusto / quebra save             |
| **Acoplamento**                    | Standalone            | 1-2 módulos                      | Núcleo compartilhado                   |

**Regra de ouro:** _se eu ("eu" = quem vai pegar) não consigo explicar em 2 frases como testo que está certo, é hard demais pra mim._ Antigravity passa a tarefa pra Codex; Codex passa pra Mavis.

---

## 4. Backlog por sprint com atribuição de dono

> Cada item tem: `ID` · `Sprint` · `Descrição` · `Dificuldade` · **Dono** · `Dependências`. Itens em itálico são stretch goals (se sobrar tempo da sprint).

### 4.1 Sprint 0 — Bootstrap (Semana 0, antes do MVP)

| ID   | Tarefa                                                                       | Dificuldade | Dono        | Dependências |
| ---- | ---------------------------------------------------------------------------- | ----------- | ----------- | ------------ |
| S0-1 | Criar monorepo pnpm com `apps/web`, `apps/server`, `packages/shared`         | Medium      | Codex       | —            |
| S0-2 | Setup ESLint + Prettier + Vitest + TypeScript estrito em todos os pacotes    | Easy        | Antigravity | S0-1         |
| S0-3 | CI no GitHub Actions (lint + test + build em PR)                             | Medium      | Codex       | S0-1, S0-2   |
| S0-4 | Definir tipos canônicos em `packages/shared/types/` (Carta, Cor, Acao, etc.) | Hard        | Mavis       | S0-1         |
| S0-5 | README raiz + CONTRIBUTING.md com guia de como rodar                         | Easy        | Antigravity | S0-1         |
| S0-6 | Adicionar `STATUS.md` na raiz (caderno de comunicação do time, ver §5.3)     | Easy        | Mavis       | S0-1         |

### 4.2 Sprint 1 — MVP Motor + Hot-seat (Semanas 1-2)

| ID  | Tarefa                                                                          | Dificuldade | Dono        | Dependências |
| --- | ------------------------------------------------------------------------------- | ----------- | ----------- | ------------ |
| M1  | Função `validarJogada()` pura + testes com matriz do GDD 04.5                   | Hard        | Mavis       | S0-4         |
| M2  | State machine de turno completa (8 estados) em `packages/shared/rules/`         | Hard        | Mavis       | S0-4         |
| M3  | Setup da partida: embaralhar, distribuir 7, virar starter (rejeitando neutra)   | Hard        | Mavis       | M1           |
| M4  | Resolução de Skip, Reverse, +2, +4, Coringa Simples                             | Hard        | Mavis       | M2           |
| M5  | Lógica de acúmulo assimétrico de ataques (+2 sobre +2 OK, +2 sobre +4 PROIBIDO) | Hard        | Mavis       | M4           |
| M6  | Detecção de vitória (última carta descartada)                                   | Hard        | Mavis       | M3           |
| M7  | Testes unitários do motor (cobertura > 80 %, casos do GDD 04.5)                 | Hard        | Mavis       | M1..M6       |
| F1  | Componente `<Carta />` (placeholder, sem arte final) com props do modelo        | Medium      | Codex       | S0-4         |
| F2  | Tela de setup (escolher nº de jogadores 2-4)                                    | Medium      | Codex       | F1           |
| F3  | Loop de turno jogável: mão, descarte, comprar, jogar                            | Medium      | Codex       | F1, M2       |
| F4  | Tela de fim de jogo (mostra vencedor)                                           | Easy        | Codex       | M6           |
| A1  | Fixture JSON das 60 cartas do MVP (id, cor, valor, acao)                        | Easy        | Antigravity | S0-4         |
| A2  | Cartas placeholder (retângulo colorido com número/símbolo)                      | Easy        | Antigravity | F1           |
| A3  | Verso da carta placeholder (padrão geométrico simples)                          | Easy        | Antigravity | A1           |
| A4  | SFX básicos (compra, descarte, +2, vitória) — sons livres ou gerados            | Easy        | Antigravity | M2           |

### 4.3 Sprint 2 — MVP Polish + Cartas neutras (Semanas 3-4)

| ID  | Tarefa                                                                                | Dificuldade | Dono        | Dependências |
| --- | ------------------------------------------------------------------------------------- | ----------- | ----------- | ------------ |
| M8  | Resolução de Troca Mão, Gira Mão                                                      | Hard        | Mavis       | M4           |
| M9  | Reembaralhamento do descarte quando monte esgota                                      | Medium      | Mavis       | M3           |
| M10 | Edge cases do GDD 04.5 (starter inválido, compra que esgota monte, +4 sem cor na mão) | Hard        | Mavis       | M5, M9       |
| M11 | Property-based tests com fast-check para o motor                                      | Hard        | Mavis       | M7           |
| F5  | Modal de escolha de cor ao jogar Coringa Simples / +4                                 | Medium      | Codex       | F3, M4       |
| F6  | Indicador visual de ataque acumulado (badge "+6" no topo)                             | Medium      | Codex       | M5           |
| F7  | Animação de descarte (slide + flip 3D, 350 ms ease-out)                               | Medium      | Codex       | A2           |
| F8  | Animação de "shake" em carta inválida                                                 | Easy        | Codex       | A2           |
| A5  | 12 avatares default (silhuetas estilizadas, sem cor única)                            | Easy        | Antigravity | A2           |
| A6  | Selos de status (sua vez, sentido, ataque acumulado)                                  | Easy        | Antigravity | F6           |
| A7  | Tela de vitória animada (confete)                                                     | Easy        | Antigravity | A4           |
| A8  | README com screenshots e GIF de gameplay hot-seat                                     | Easy        | Antigravity | F4           |

### 4.4 Sprint 3 — MVP fechamento + Playtest interno (Semanas 5-6)

| ID  | Tarefa                                                                     | Dificuldade | Dono        | Dependências |
| --- | -------------------------------------------------------------------------- | ----------- | ----------- | ------------ |
| M12 | Snapshot + restore de estado para "desfazer última jogada" (dev tool)      | Hard        | Mavis       | M11          |
| M13 | Telemetria mínima: logar `jogar`, `comprar`, `fim` em formato NDJSON       | Hard        | Mavis       | M12          |
| F9  | Modo debug (visualizar estado, avançar turno manualmente)                  | Medium      | Codex       | M12          |
| F10 | Tela de estatísticas pós-partida (nº de cartas, maior ataque sofrido)      | Medium      | Codex       | M13          |
| A9  | Survey de playtest (formulário Google) + planilha de feedback              | Easy        | Antigravity | F10          |
| A10 | Cálculo final de balanceamento: comparar tempo real vs meta do GDD §03.1.4 | Easy        | Antigravity | M13, F10     |

### 4.5 Beta (Meses 4-5) — preview

| ID  | Tarefa                                                 | Dificuldade | Dono        |
| --- | ------------------------------------------------------ | ----------- | ----------- |
| B1  | Motor: 0+ (reflexo) + Regra do 7 (silêncio)            | **Hard**    | Mavis       |
| B2  | Servidor: WebSocket autoritativo (Fastify + Socket.IO) | **Hard**    | Mavis       |
| B3  | Servidor: reconexão com snapshot de estado (5 min)     | **Hard**    | Mavis       |
| B4  | Front: lobby (criar/entrar sala, código de 6 chars)    | Medium      | Codex       |
| B5  | Front: UI multiplayer (avatares, indicadores remotos)  | Medium      | Codex       |
| B6  | Back: schema Prisma, migrations, models                | Medium      | Codex       |
| B7  | Bot single-player (3 níveis)                           | Medium      | Codex       |
| B8  | Auth social (Google)                                   | Medium      | Codex       |
| A11 | SFX do 0+ (WHOOSH reverso + coro)                      | Easy        | Antigravity |
| A12 | SFX do silêncio quebrado (ah cômico)                   | Easy        | Antigravity |
| A13 | Microinteração "shh" do 7 (tela escurece 20 %)         | Easy        | Antigravity |
| A14 | Tutorial animado 5 telas                               | Easy        | Antigravity |

### 4.6 Release v1.0 (Meses 6-7) — preview

| ID  | Tarefa                                                   | Dificuldade | Dono        |
| --- | -------------------------------------------------------- | ----------- | ----------- |
| R1  | Loja de baralhos temáticos (F2P, nada pay-to-win)        | Hard        | Mavis       |
| R2  | PWA instalável + wrapper Capacitor (iOS/Android)         | Hard        | Mavis       |
| R3  | Painel de balanceamento (lê telemetria, expõe KPIs)      | Hard        | Mavis       |
| R4  | Modo torneio com tempo de turno configurável             | Medium      | Codex       |
| R5  | Leaderboard + missões diárias                            | Medium      | Codex       |
| R6  | Deploy produção (Vercel + Fly.io sa-east-1)              | Medium      | Codex       |
| A15 | Coleção base de baralhos temáticos (3 skins)             | Easy        | Antigravity |
| A16 | Banner de "Regra alternativa" (modo silêncio permanente) | Easy        | Antigravity |

---

## 5. Arquitetura de comunicação

### 5.0 Lock estrito por issue (regra de convivência)

> Decidido em 2026-07-26 após incidente de extrapolação de escopo pelo Antigravity na Sprint 0. Ver ADR-003 no `DECISIONS.md`.

**Regra:** cada agente só pode abrir/modificar arquivos **explicitamente listados na issue que ele pegou**. Mudanças em arquivos fora do escopo exigem issue separada (ou aprovação explícita de Mavis).

**Escopo permitido por agente (referência rápida):**

| Agente          | Pode tocar                                                                                                                                                     | NÃO pode tocar                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Mavis**       | `packages/shared/**`, arquivos estruturais (tsconfig, package.json raiz), motor de regras, qualquer arquivo (tem ownership final)                              | —                                                                         |
| **Codex**       | `apps/web/src/components/**` (lógica), `apps/web/src/pages/**`, `apps/web/src/store/**`, `apps/server/src/routes/**`, `apps/server/src/sockets/**`, CI, deploy | `packages/shared/**` (regra pura é de Mavis)                              |
| **Antigravity** | `assets/**`, `src/styles/**`, `src/components/**` (só CSS), `*.md`, fixtures JSON de cartas (não regras), SFX, copy, README                                    | `packages/shared/**`, `apps/server/src/game/**`, qualquer lógica de regra |

**Mecanismo:** Mavis revisa PRs. PR que toca arquivo fora do escopo do autor é rejeitado com link para esta seção.

**Exceção de emergência:** se um agente precisar urgentemente tocar em arquivo fora do escopo, abre issue `URGENT:` e marca Mavis. Mavis aprova em < 4h ou faz ele mesmo.

---

### 5.1 Canais

| Canal                        | Uso                                                                                           | Quem posta                       | Quem lê              |
| ---------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- | -------------------- |
| **GitHub Issues**            | Tarefas novas, bugs, decisões com ADR                                                         | Qualquer um                      | Todos                |
| **PR + descrição**           | Entrega de trabalho; discussão de design no PR                                                | Quem entrega                     | Quem revisa (ver §7) |
| **`STATUS.md` (raiz)**       | Diário do time: o que fiz ontem / vou fazer hoje / bloqueios                                  | Cada agente, no fim do dia       | Todos                |
| **`DECISIONS.md` (raiz)**    | ADRs (Architecture Decision Records) curtos — 1 decisão por arquivo `decisions/NNN-titulo.md` | Mavis decide; todos podem propor | Todos                |
| **Comentário na issue**      | Discussão sobre escopo, dúvida de regra                                                       | Quem precisa                     | Quem pode responder  |
| **Tag `@agent`** na issue/PR | Pedido direto: `@Mavis`, `@Codex`, `@Antigravity`                                             | Qualquer um                      | O agente tagged      |
| **DM/chat (humano)**         | Escalar para o usuário quando 3 agentes discordam por mais de 2 rounds                        | Mavis                            | Usuário              |

### 5.2 Cadência de atualizações

| Evento                    | Onde posta                                         | Formato                               |
| ------------------------- | -------------------------------------------------- | ------------------------------------- |
| Pegou uma issue           | Comentário na issue                                | `👋 Pegando: ISS-XX`                  |
| Bloqueado                 | `STATUS.md` + comentário                           | `🚧 ISS-XX: <motivo>, preciso de <X>` |
| PR aberto                 | PR + atualiza `STATUS.md`                          | `🔨 PR #NNN: ISS-XX`                  |
| PR merged                 | `STATUS.md`                                        | `✅ ISS-XX merged`                    |
| Decisão técnica           | `decisions/NNN-titulo.md` + link no `DECISIONS.md` | Formato ADR                           |
| Conflito com outro agente | Comentário na issue/PR + `@Mavis`                  | Ver §8                                |

### 5.3 O caderno `STATUS.md` (o "standup assíncrono")

Este é o **coração da comunicação** entre os 3 agentes. É um arquivo markdown na raiz, atualizado por cada agente no fim do seu turno de trabalho. Estrutura:

```markdown
# STATUS — Kabemjunto · Sprint X

> Última atualização: 2026-07-26 21:00 (BRT) por Mavis

## 🟢 Mavis (lead)

**Ontem:** M5 — acúmulo de ataques, 8 testes passando
**Hoje:** M6 — detecção de vitória + M10 edge cases
**Bloqueios:** nenhum

## 🟡 Codex

**Ontem:** F3 — loop de turno jogável, PR #12 aberto
**Hoje:** F5 — modal de escolha de cor do coringa
**Bloqueios:** esperando M4 do Mavis pra fechar F3

## 🔵 Antigravity

**Ontem:** A2 — 5 cartas placeholder prontas
**Hoje:** A3 — verso da carta + A4 SFX
**Bloqueios:** A4 precisa de lista de SFX priorizada (postar no canal?)
```

**Regra:** o `STATUS.md` é **a primeira coisa que cada agente lê** antes de começar a trabalhar. Custa 30 segundos e economiza horas de retrabalho.

### 5.4 Async-first, sync-só-quando-necessário

- **Default:** tudo é async. Issue, PR, `STATUS.md`. Cada agente trabalha no seu ritmo.
- **Sync (chamado explícito):** quando um agente precisa de input do outro pra continuar, marca a issue com `🚧 @agente` e segue em outra task. **Não espera bloqueado**.
- **Timeout:** se um agente não responder em **4 horas úteis** (configurável), Mavis (orquestrador) toma a decisão padrão documentada no ADR correspondente e segue.

---

## 6. Fluxo de trabalho (do issue ao merge)

```
[1] Issue criada (humano ou agente)
         ↓
[2] Triagem: Mavis classifica dificuldade (E/M/H) e atribui dono
         ↓
[3] Agente pega a issue (comenta "👋 Pegando: ISS-XX")
         ↓
[4] Agente abre branch + trabalha + abre PR
         ↓
[5] PR reviewed pelo "revisor natural" (ver §7)
         ↓
[6] CI passa (lint + test + build)
         ↓
[7] Aprovação do revisor
         ↓
[8] Merge para main
         ↓
[9] Status atualizado em STATUS.md
```

**Regra:** **PR sem issue linkada é bloqueado.** Não se faz trabalho invisível. Cada commit referencia uma issue: `git commit -m "fix: edge case do 0+ (closes ISS-42)"`.

**Regra de PR pequeno:** se um PR passa de **400 linhas de diff** (excluindo `pnpm-lock.yaml` e assets), ele é grande demais — quebrar em 2 PRs. Exceção: PRs de bootstrap (S0-1).

---

## 7. Quality gates e ownership de revisão

### 7.1 Quem revisa o quê

| Caminho tocado no PR                                      | Revisor primário                                             | Revisor secundário                   |
| --------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| `packages/shared/types/**`                                | **Mavis**                                                    | —                                    |
| `packages/shared/rules/**`                                | **Mavis**                                                    | — (Mavis é o único que escreve aqui) |
| `apps/server/src/game/**`                                 | **Mavis**                                                    | —                                    |
| `apps/server/src/routes/**`, `apps/server/src/sockets/**` | Codex                                                        | Mavis (se toca persistência)         |
| `apps/server/src/db/**` (Prisma, models)                  | Codex                                                        | Mavis (migrations)                   |
| `apps/web/src/components/**` (lógica)                     | Codex                                                        | Antigravity (se é só CSS)            |
| `apps/web/src/components/**` (só CSS/assets)              | Antigravity                                                  | Codex                                |
| `apps/web/src/pages/**`                                   | Codex                                                        | —                                    |
| `apps/web/src/store/**` (Zustand)                         | Codex                                                        | Mavis (se é estado de jogo)          |
| `tests/**`                                                | Quem escreveu a feature testa; quem revisa checa a cobertura | —                                    |
| `assets/**`, `public/**`                                  | Antigravity                                                  | Codex (se integra com UI)            |
| `.github/**`, `Dockerfile`, `infra/**`                    | Codex                                                        | Mavis (se afeta deploy)              |
| `*.md` (docs)                                             | Qualquer um do time                                          | —                                    |

### 7.2 Quality gates (todos os PRs)

- ✅ CI verde (lint + type-check + test)
- ✅ Cobertura de testes do motor (`packages/shared/rules/`) **mantida ou aumentada** (mínimo 80 %)
- ✅ Descrição do PR segue template (ver Anexo B)
- ✅ PR linka a issue que fecha
- ✅ Sem `console.log`, `TODO` sem issue, ou `any` em TypeScript
- ✅ Se for PR de Antigravity: print/GIF ou comando de reprodução

### 7.3 Quality gates extras para Mavis

- ✅ ADR criado se a PR muda contrato (tipo, schema, endpoint)
- ✅ Property-based test para invariantes novas do motor
- ✅ Documentação inline nas funções públicas do motor (JSDoc)

### 7.4 Quality gates extras para Codex

- ✅ Storybook (ou similar) para componentes novos
- ✅ Teste de integração pra endpoint novo
- ✅ Otimistic update com rollback documentado

### 7.4 Quality gates extras para Antigravity

- ✅ Lint/format sem warning
- ✅ Assets com versão leve (SVG otimizado, SFX < 100 KB)

---

## 8. Resolução de conflitos e cadeia de escalonamento

### 8.1 Matriz de decisão

| Tipo de conflito                                                                                   | Decisor                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Como uma regra do GDD deve ser interpretada (ex: +2 sobre +4 proibido mas e se o 0+ está no meio?) | **Mavis** (último recurso: usuário)                                                                         |
| Como UI/UX deve ser (ex: animação de descarte)                                                     | **Codex** (último recurso: usuário)                                                                         |
| Onde um asset vai, qual paleta, qual SFX                                                           | **Antigravity** (último recurso: Codex)                                                                     |
| Conflito entre Mavis e Codex (ex: contrato de API vs modelo de dados)                              | **Mavis** (decisão técnica) → se persistir, escala pra usuário                                              |
| Conflito que afeta regra de jogo + UI (ex: como mostrar o reflexo do 0+)                           | **Mavis** define a mecânica, **Codex** define a animação. Mavis tem a palavra final sobre o que é mostrado. |
| 3 discordam                                                                                        | **Usuário decide.** Mavis documenta as 3 posições em `decisions/` e marca `awaiting:user`                   |

### 8.2 Regra dos 2 rounds

- Se dois agentes discordam por **mais de 2 rounds** (PR comments ou issues) sem convergir:
  1. Mavis posta ADR curto com recomendação + razão
  2. Code review time-boxed: **24h** para objeção
  3. Sem objeção: ADR vira lei. Com objeção: escala para usuário

### 8.3 Precedência de regras

Ordem de prioridade quando há ambiguidade:

1. **Regras oficiais canônicas** (GDD §7 — "Regras oficiais canônicas")
2. **Contratos em `packages/shared/types/`** (TypeScript types são contrato)
3. **Pseudocódigo do GDD** (seções 02 e 04)
4. **Diagramas** (state machine, árvore de decisão)
5. **Texto livre do GDD**
6. **Decisões de design** (`decisions/NNN-*.md`)

Se 2 fontes acima conflitam: a de **menor número** vence (regras > contratos > pseudocódigo).

---

## 9. Cerimônias e cadência

| Cerimônia                      | Frequência                           | Formato                                                                   | Quem participa |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------- | -------------- |
| **Triagem de issues**          | Diária (automatizada via label)      | Mavis atribui dono + label de dificuldade                                 | Mavis          |
| **Atualização de `STATUS.md`** | A cada "turno" de trabalho do agente | Async, fim do turno                                                       | Todos          |
| **Review semanal**             | Semanal (sexta 17h BRT)              | Mavis posta review no `STATUS.md`: % issues fechadas, bloqueios, velocity | Todos leem     |
| **Playtest quinzenal**         | A cada 2 semanas                     | Mavis posta script de cenários; Codex roda; Antigravity coleta feedback   | Todos          |
| **Retrospectiva de sprint**    | Final de sprint (3 semanas)          | Mavis posta em `decisions/sprint-N-retro.md`                              | Todos          |
| **Backlog grooming**           | Início de sprint                     | Mavis ajusta escopo do próximo sprint                                     | Mavis          |

---

## 10. Definição de pronto (DoD) por nível

### 10.1 Easy (Antigravity)

- [ ] Asset criado/alterado e commitado no caminho correto
- [ ] Lint e format passando
- [ ] Print/GIF ou comando de reprodução anexado ao PR
- [ ] README/docs atualizados se o asset é referenciado em texto
- [ ] Aprovação de Codex

### 10.2 Medium (Codex)

- [ ] Feature implementada end-to-end (front + back se aplicável)
- [ ] Testes unitários OU de integração (mínimo 1 caso feliz + 1 caso de erro)
- [ ] CI verde
- [ ] Descrição do PR com: o que mudou, como testar, screenshots se UI
- [ ] ADR linkado se mexeu em contrato
- [ ] Aprovação do revisor natural (ver §7.1)

### 10.3 Hard (Mavis)

- [ ] Todos os critérios de Medium
- [ ] Cobertura de testes do motor mantida ou aumentada
- [ ] Property-based test para invariantes
- [ ] Pseudocódigo do GDD implementado e testado
- [ ] ADR criado se mudou contrato
- [ ] Documentação inline (JSDoc) em funções públicas
- [ ] Edge cases do GDD §04.5 cobertos
- [ ] Code review do próprio Mavis (auto-review antes de pedir merge)

---

## 11. Riscos operacionais do time de agentes

| Risco                                                          | Probabilidade | Impacto | Mitigação                                                                           |
| -------------------------------------------------------------- | ------------- | ------- | ----------------------------------------------------------------------------------- |
| Codex refatora `packages/shared/rules/` sem avisar Mavis       | Média         | Alto    | Branch protection rule: PRs em `packages/shared/rules/**` exigem aprovação de Mavis |
| Antigravity tenta implementar lógica de regra "porque é fácil" | Baixa         | Alto    | Code review + checklist DoD bloqueia; treinamento inicial com exemplos do GDD       |
| Mavis vira gargalo (revisor obrigatório de tudo)               | Alta          | Médio   | Codex revisa PRs de Antigravity; Mavis só revisa o que toca regra/servidor de jogo  |
| 3 agentes divergem em interpretação de regra                   | Média         | Alto    | Precedência §8.3 + ADR + escala pra usuário                                         |
| `STATUS.md` fica desatualizado                                 | Alta          | Médio   | Mavis verifica diariamente; lembra o time via comentário na issue                   |
| PR grande demais passa do review                               | Média         | Médio   | Regra dos 400 linhas (§6)                                                           |
| Conflito de merge em `packages/shared/types/`                  | Média         | Alto    | Mavis merge primeiro, em série (não em paralelo)                                    |
| Agente trava esperando outro                                   | Média         | Médio   | Regra do não-bloqueio (§5.4): sempre ter 1 task paralela                            |

---

## Anexo A — Como abrir uma issue/pedido corretamente

**Para humanos que pedem tarefas:**

```markdown
## Tarefa

<o que quero, em 1 frase>

## Contexto

<por que isso é necessário, linkando GDD ou issue relacionada>

## Dificuldade esperada

- [ ] Easy (Antigravity)
- [ ] Medium (Codex)
- [ ] Hard (Mavis)
- [ ] Não sei — Mavis classifica

## Acceptance criteria

- [ ] critério 1
- [ ] critério 2
- [ ] critério 3

## Dependências

- bloqueado por ISS-XX?
- bloqueia ISS-YY?
```

**Para agentes que postam tarefas:**

Use o template acima + preencha a seção "Como testar" com o passo a passo pra reproduzir.

---

## Anexo B — Templates de mensagem

### B.1 Pegando uma issue

```markdown
👋 Pegando: ISS-42

Vou trabalhar em `packages/shared/rules/zero-plus.ts`.
Estimativa: 2h.
PR esperado até fim do dia.
```

### B.2 PR aberto

```markdown
## O que mudou

- Implementa `resolverAcao('ZERO_MAIS', estado)` em packages/shared/rules/
- Adiciona teste de propriedade: 1000 jogos aleatórios verificam que 0+ sempre encerra a pilha
- Cobre edge case: 0+ sem ataque acumulado (Gira Mão puro)

## Como testar

1. `pnpm --filter shared test rules/zero-plus.test.ts`
2. Cenário manual: jogar +2, +2, 0+ → próximo deve receber 4 cartas
3. Cenário manual: jogar 0+ sem ataque anterior → mão gira mas ninguém compra

## Issue

Closes #42

## Checklist

- [x] CI verde
- [x] Cobertura mantida (85% → 87%)
- [x] ADR não necessário (não muda contrato)
- [x] Pseudocódigo do GDD §02.7 implementado
```

### B.3 Bloqueio

```markdown
🚧 ISS-42: bloqueado

Motivo: preciso da função `validarJogada()` estável (M1) antes de implementar 0+
@Mavis: consegue priorizar M1? M5 está esperando.
Workaround: estou seguindo em F3 (loop de turno UI) enquanto isso.
```

### B.4 Decisão técnica (ADR)

```markdown
# ADR-003: Servidor autoritativo para validação de jogada

## Status

Proposto · 2026-07-26 · @Mavis

## Contexto

Cliente pode ser manipulado (DevTools, MITM). Precisamos garantir que jogadas inválidas nunca cheguem ao estado do jogo.

## Decisão

Toda `jogar` e `comprar` passa por `validarJogada()` no servidor. Cliente faz optimistic update com rollback.

## Consequências

- +200ms latência em rede ruim (aceitável, target < 300ms)
- Cliente precisa de UI de "jogada rejeitada" com shake animation
- Telemetria do servidor é a única fonte de verdade para stats

## Alternativas consideradas

- Validação só cliente: rejeitada (anti-cheat zero)
- Validação cliente + servidor: rejeitada (cliente pode mentir)
```

---

**Fim do Plano Multi-Agente — Kabemjunto v1.0**

> Próximos passos:
>
> 1. Revisar este plano com o time (estimativa: 30 min)
> 2. Criar S0-1 a S0-6 no GitHub Issues e atribuir donos
> 3. Mavis posta o `STATUS.md` inicial
> 4. Sprint 1 começa na segunda
