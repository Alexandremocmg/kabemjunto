# 🃏 Kabemjunto

> **O jogo de cartas que te denuncia.** · 2 a 10 jogadores · 8 a 15 minutos por partida.

Kabemjunto é um jogo de cartas digital inspirado no UNO, mas com três camadas estratégicas próprias: a **regra do 7** (silêncio social), o **acúmulo assimétrico de ataques** (+2 sobre +4 é proibido) e a carta **0+ (Zero Mais)** que reflete ataques para o último atacante. Tematização brasileira, party game com 108 cartas, hot-seat local e multiplayer online.

[![CI](https://github.com/Alexandremocmg/kabemjunto/actions/workflows/ci.yml/badge.svg)](https://github.com/Alexandremocmg/kabemjunto/actions/workflows/ci.yml)
[![Release v0.3.1](https://img.shields.io/badge/release-v0.3.1-success)](https://github.com/Alexandremocmg/kabemjunto/releases/tag/v0.3.1)
![Tests: 170/170](https://img.shields.io/badge/tests-170%2F170-success)
![TS: strict](https://img.shields.io/badge/TypeScript-strict-blue)
![Lint: clean](https://img.shields.io/badge/lint-clean-success)
![Coverage: ≥80%](https://img.shields.io/badge/coverage-%E2%89%A580%25-success)

---

## 📚 Documentação

- **[GDD — Game Design Document](./GDD-Kabemjunto.md)** — documento mestre do jogo
- **[PLANO-EQUIPE-3DEVS.md](./PLANO-EQUIPE-3DEVS.md)** — plano de desenvolvimento multi-agente
- **[STATUS.md](./STATUS.md)** — caderno de comunicação do time (atualizado diariamente)
- **[DECISIONS.md](./DECISIONS.md)** — ADRs (decisões arquiteturais)
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — como contribuir

---

## 🎴 Como jogar (TL;DR)

- Cada jogador começa com **7 cartas**. O objetivo: descartar todas.
- Na sua vez, jogue **1 carta** que combine com o topo (mesma cor, número ou ação).
- Sem carta válida? Compre 1 do monte (e pode jogar de imediato se for válida).
- Ações coloridas: **Pula** (próximo perde a vez), **Inverte**, **+2**.
- Coringas: **Coringa** (muda cor), **+4** (compra 4 e muda cor), **0+** (reflete o ataque!), **Troca Mão**, **Gira Mão**.
- Regra do **7**: jogou 7 = silêncio até a próxima carta. Quem falar paga +2.

Detalhes completos em [`GDD-Kabemjunto.md §7`](./GDD-Kabemjunto.md#7-regras-oficiais-canônicas-resumo).

---

## 🚀 Quick start

### Pré-requisitos

- **Node.js** >= 20
- **npm** >= 10 (ou pnpm/yarn, mas o time usa npm por enquanto)

### Setup

```bash
# 1. Clone o repo
git clone <url-do-repo> kabemjunto
cd kabemjunto

# 2. Instale as dependências
npm install

# 3. Rode os testes (opcional, mas recomendado — deve passar 41/41)
npm test

# 4. Inicie o dev server
npm run dev
# → abre em http://localhost:5173
```

### Validação completa (CI local)

```bash
npm run validate
# → Roda: typecheck + lint + format:check + test + build
```

---

## 🛠️ Scripts disponíveis

| Script                 | O que faz                                                           |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | Inicia o Vite dev server (http://localhost:5173)                    |
| `npm run build`        | Build de produção (Vite + TypeScript check)                         |
| `npm run preview`      | Serve o build de produção localmente                                |
| `npm run typecheck`    | TypeScript sem emitir (checa tipos)                                 |
| `npm test`             | Roda os testes do motor (Vitest)                                    |
| `npm run test:watch`   | Modo watch (TDD)                                                    |
| `npm run test:cov`     | Testes com cobertura                                                |
| `npm run lint`         | ESLint em todo o projeto                                            |
| `npm run lint:fix`     | ESLint com auto-fix                                                 |
| `npm run format`       | Prettier write (formata tudo)                                       |
| `npm run format:check` | Prettier check (CI)                                                 |
| `npm run validate`     | Roda typecheck + lint + format:check + test + build (gate local/CI) |

---

## 🏗️ Arquitetura

### Stack

| Camada         | Stack                                             |
| -------------- | ------------------------------------------------- |
| Frontend       | TypeScript + React 18 + Vite                      |
| UI             | Tailwind (CSS puro), Framer Motion (animações)    |
| Estado         | Zustand + React Query                             |
| Áudio          | Web Audio API (síntese em tempo real, sem assets) |
| Backend (Beta) | Node + Fastify + Socket.IO                        |
| DB (Beta)      | PostgreSQL + Redis                                |
| Testes         | Vitest                                            |
| Lint/Format    | ESLint 9 + Prettier 3                             |
| CI             | GitHub Actions                                    |

### Estrutura de pastas

```
.
├── src/                          # Frontend React
│   ├── components/               # Componentes UI (CartaView, Lobby, MesaDeJogo, ...)
│   ├── services/                 # Wrappers de I/O (gameEngine, audioService)
│   ├── styles/                   # CSS
│   ├── App.tsx                   # Componente raiz
│   └── main.tsx                  # Entry point
├── packages/
│   └── shared/                   # Fonte única de verdade
│       └── src/
│           ├── types/            # Tipos canônicos (Carta, EstadoPartida, Jogador)
│           ├── rules/            # Motor de regras PURO (sem I/O)
│           ├── constants/        # Baralho 108, paleta de cores
│           └── fixtures/         # deck108.json
├── apps/
│   └── server/                   # Backend (em construção — Beta)
├── assets/                       # SVGs, SFX (gerados por Antigravity)
├── .github/                      # CI, templates de issue/PR
├── eslint.config.js              # ESLint 9 flat config
├── tsconfig.json                 # TS strict
├── DECISIONS.md                  # ADRs
├── PLANO-EQUIPE-3DEVS.md         # Plano multi-agente
└── STATUS.md                     # Caderno do time
```

### Regra de ouro: **o motor é puro**

`packages/shared/src/rules/*` é **puro** — zero I/O, zero áudio, zero DOM, zero dependência de browser. Isso permite que:

1. **O servidor (Beta)** valide jogadas sem precisar de browser
2. **Os testes** rodem em 23ms e sejam determinísticos (com seed)
3. **O front** tenha um wrapper fino (`src/services/gameEngine.ts`) que toca áudio baseado no que o motor retorna

Detalhe completo em [ADR-004](./DECISIONS.md#adr-004-refactor-do-motor-de-regras-para-packagessharedsrules).

---

## 🤖 Time multi-agente

Este projeto é mantido por **3 agentes de IA** sob coordenação de um humano:

| Agente           | Papel             | Escopo                                                      |
| ---------------- | ----------------- | ----------------------------------------------------------- |
| **Mavis** (lead) | Engenheiro sênior | Motor de regras, tipos, ADRs estruturais, code review final |
| **Codex**        | Engenheiro pleno  | UI/UX, API, WebSocket, CI/CD, devops                        |
| **Antigravity**  | Engenheiro júnior | Assets, SFX, CSS, copy, fixtures, README                    |

**Regra de lock estrito** (ADR-003): cada agente só toca em arquivos dentro do escopo da issue dele. Mavis revisa PRs. Detalhes em [`PLANO-EQUIPE-3DEVS.md §5.0`](./PLANO-EQUIPE-3DEVS.md#50-lock-estrito-por-issue-regra-de-convivência).

---

## 🗺️ Roadmap

| Fase                           | Status         | Marco                                                   |
| ------------------------------ | -------------- | ------------------------------------------------------- |
| **Sprint 0** — Bootstrap       | ✅ **Fechado** | Monorepo, motor puro, 41 testes, CI, lint, README       |
| **Sprint 1** — Motor detalhado | 🔜 Próximo     | State machine explícita, validação completa, edge cases |
| **Sprint 2** — Polimento MVP   | 📋 Planejado   | Cartas neutras, troca de mão, gira mão, UX              |
| **Sprint 3** — Fechamento MVP  | 📋 Planejado   | Playtest interno, telemetria, snapshot/restore          |
| **Beta** — Multiplayer         | 📋 Planejado   | Fastify + Socket.IO, salas, auth, reconnect             |
| **Release v1.0**               | 📋 Planejado   | PWA, mobile wrapper, loja de baralhos                   |

Detalhes em [`PLANO-EQUIPE-3DEVS.md §4`](./PLANO-EQUIPE-3DEVS.md#4-backlog-por-sprint-com-atribuição-de-dono) e [`GDD-Kabemjunto.md §03.6`](./GDD-Kabemjunto.md).

---

## 📸 Screenshots (preview)

_(Screenshots de mockup no GDD — implementação real virá com a Sprint 2)_

| Tela            | Mockup                       |
| --------------- | ---------------------------- |
| Menu principal  | `tela-01-menu-principal.png` |
| Lobby / Sala    | `tela-02-lobby-sala.png`     |
| Gameplay (mesa) | `tela-03-gameplay-mesa.png`  |
| Vitória         | `tela-04-vitoria.png`        |
| Loja            | `tela-05-loja.png`           |
| Tutorial        | `tela-06-tutorial.png`       |

---

## 📊 Status atual

- ✅ **Sprint 0 fechada** (2026-07-26)
- ✅ **41/41 testes passando** (23ms)
- ✅ **TypeScript strict 100%** verde
- ✅ **ESLint + Prettier** 0 erros
- ✅ **CI no GitHub Actions** configurado
- 🔜 **Sprint 1** começando

---

## 📝 Licença

A definir (provavelmente MIT). Por enquanto: **todos os direitos reservados**.

---

## 🙏 Créditos

- **Game design**: [@Mavis](https://github.com/) + iteração com a equipe
- **Código**: time multi-agente (Mavis, Codex, Antigravity)
- **GDD**: baseado no documento original de [@Mavis](https://github.com/)

Para contribuir, leia [`CONTRIBUTING.md`](./CONTRIBUTING.md).
