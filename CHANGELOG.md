# Changelog

Todas as mudanças notáveis do Kabemjunto são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

---

## [Unreleased] — Sprint 1 em andamento

### Planejado

- M1..M7 do motor detalhado (state machine explícita, validação completa, edge cases)
- F1..F4 do front (UI de cartas, lobby, loop de turno, vitória)
- A1..A4 de assets (cartas placeholder, verso, SFX)

---

## [0.1.0] — 2026-07-26 · Sprint 0 FECHADA ✅

### Adicionado

- 🎉 **Bootstrap do projeto** — monorepo (estrutura flat com npm), TypeScript strict, Vite + React 18
- 🎴 **Motor de regras puro** em `packages/shared/src/rules/` (7 arquivos):
  - `shuffle.ts` — Fisher-Yates com seed determinística
  - `create-game.ts` — `criarPartidaInicial` com validação
  - `validate-play.ts` — `validarJogada` (matriz completa do GDD §02.6)
  - `execute-play.ts` — `executarJogada` (coração do motor, retorna `{ novoEstado, sfx, eventos }`)
  - `buy-cards.ts` — `comprarCartas` com reembaralhamento do descarte
  - `bot-turn.ts` — `executarTurnoBot` com 3 níveis (Fácil/Médio/Difícil)
- 📦 **Tipos canônicos** em `packages/shared/src/types/`:
  - `card.ts` — `Carta`, `Cor`, `Acao`, `TipoCarta`, `Raridade`
  - `player.ts` — `Jogador`, `JogadorPublico`
  - `game.ts` — `EstadoPartida`, `EstadoPartidaPublico`, `Sala`, `EventoPartida`
  - `socket-events.ts` — Mapa de eventos Socket.IO (para Beta)
- 🎨 **UI React** em `src/components/`:
  - Lobby, MesaDeJogo, CartaView, MaoDoJogador, ModalEscolhaCor, HUDJogador, RegraDoSilencioBanner, PainelVitoria, TutorialModal
- 🔊 **Áudio via Web Audio API** em `src/services/audioService.ts` (síntese em tempo real, 10 SFXs)
- 🎴 **Baralho de 108 cartas** em `packages/shared/src/constants/cards.ts` (gerador determinístico)
- 🃏 **Assets SVG** (verso da carta, 0+) em `assets/svgs/`
- 🧪 **41 testes unitários** (Vitest) cobrindo os 15 edge cases do GDD §04.5 — 23ms
- 🛠️ **Tooling**:
  - ESLint 9 (flat config) + TypeScript ESLint + React Hooks + Prettier compat
  - Prettier 3 com config de 100 col, single quotes, semicolons
  - EditorConfig via Prettier defaults
- 🤖 **CI no GitHub Actions**:
  - `ci.yml` — lint + typecheck + test:cov + build (com check de cobertura ≥ 80%)
  - `pr-size-check.yml` — warning se PR > 400 linhas
  - Dependabot semanal (npm + github-actions)
- 📋 **Templates**:
  - `.github/pull_request_template.md`
  - `.github/ISSUE_TEMPLATE/bug_report.md`
  - `.github/ISSUE_TEMPLATE/feature_request.md`
- 📚 **Documentação**:
  - `README.md` — quick start, arquitetura, scripts, roadmap
  - `CONTRIBUTING.md` — fluxo de contribuição, regra de lock estrito
  - `PLANO-EQUIPE-3DEVS.md` — plano multi-agente completo
  - `STATUS.md` — caderno de comunicação do time
  - `DECISIONS.md` — 4 ADRs publicados

### Decisões arquiteturais (ADRs)

- **ADR-001** — Modelagem canônica das 108 cartas e tipos shared (Antigravity)
- **ADR-002** — Paleta de cores HSL e sistema de design SVG/CSS (Antigravity)
- **ADR-003** — Lock estrito por issue (regra de convivência multi-agente) (Mavis)
- **ADR-004** — Refactor do motor para `packages/shared/src/rules/` (Mavis)

### Métricas

| Métrica                 | Valor          |
| ----------------------- | -------------- |
| Linhas de código TS/TSX | ~2.500         |
| Testes                  | 41             |
| Cobertura do motor      | ≥ 80% (linhas) |
| Tempo de testes         | 23ms           |
| Erros de TypeScript     | 0              |
| Erros de ESLint         | 0              |
| PRs mergeados           | 1 (este)       |

---

## [0.0.0] — Pré-Sprint 0

Versão inicial com GDD e plano multi-agente. Sem código.
