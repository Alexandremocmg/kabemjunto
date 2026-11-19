# Changelog

Todas as mudanças notáveis do Kabemjunto são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

---

## [Não lançado]

### Adicionado

- PWA instalável com ícones PNG e cache dos arquivos do build. Sem rede, o menu abre e a partida contra bots na mesa 3D (com o Three.js em cache) começa e é retomada ao recarregar na mesma janela; criar ou entrar em sala fica desabilitado com um aviso até a conexão voltar.
- Atualizações do service worker aguardam o fechamento das janelas da versão anterior. A suíte de navegador verifica o manifest, os ícones, a retomada da partida contra bots e as rotas que dependem de rede.

### Documentação — 2026-11-18

- README, contribuição e GDD reconciliados com `54c4601`; removidos badges fixos e afirmações de Sprint 0, backend futuro e PostgreSQL/Redis implementados.
- Corrigidos links do GDD e instruções Docker; explicitadas limitações de PWA, sessão Local e instância única.
- Seções antigas e plano identificados como históricos, com direcionamento para as fontes atuais.
- Adicionado relatório com evidências, pendências e limites da verificação.

### Funcionalidades após `v0.5.1`, consolidadas nesta revisão

As entradas abaixo descrevem o código, não certificam uma nova release ou deployment. O STATUS registra um deploy de Corta-Frente em `a912454`; a produção não foi revalidada nesta revisão.

- Salas públicas/privadas e abandono explícito (`dc1264d`).
- Descarte múltiplo e pilhas preparáveis fora da vez (`b67c019` a `576628f`).
- Compra com turno mantido quando a carta é jogável, starter Skip/Reverse e ajustes canônicos (`4f4daa8`, `ac1e89a`, `07c8f90`).
- Troca Mão deixa de bloquear compra voluntária (`571b74d`).
- Corta-Frente Local e Online, timer autoritativo, contratos e interface (`307f33a` a `a912454`).
- +2 Para Todos e baralho de 109 cartas (ADR-013, `28b5678`), rótulo/ícone e arte dedicada (`460c247`, `bff0b08`).
- Feedback de especiais dos bots (`6257085`), prevenção de descarte por arrasto acidental (`fc0d7d3`) e correção de pilha Local que bloqueava jogadas avulsas (`54c4601`).

### Alterado

- Snapshot de salas evoluído para schema v3 para versionar explicitamente o evento `MONTE_ESGOTADO`; leitura de v2 permanece suportada e a migração ocorre somente no próximo `save`.
- Validação persistida de `MONTE_ESGOTADO` agora exige `cartasSolicitadas >= 1` e `0 <= cartasObtidas < cartasSolicitadas`.
- Removida a API exportada de state machine sem consumidor no runtime, junto com seus testes isolados. O pacote `@kabemjunto/shared` é privado e o modelo de estados permanece no GDD como especificação conceitual, evitando código morto e emissão de build desnecessária.

---

## [0.5.1] - 2026-07-28

- Tag anotada em `06fbd0a`: elevação visual, logo oficial, lobby e coleção local.
- A mensagem da tag registra verificação de deploy Railway naquela entrega; não é uma verificação atual da produção.

---

## [0.5.0] — 2026-07-28 · Sprint 6 FECHADA ✅

Persistência, hardening, observabilidade e deploy real. Diário completo em [`briefings/sprint-6.md`](./briefings/sprint-6.md) e revisões formais em `feedback/2026-07-28-*.md`.

### Adicionado

- Persistência durável de salas em snapshot JSON atômico (`apps/server/src/persistence.ts`), com recuperação após restart do processo.
- Retomada autenticada de sessão por token opaco rotativo (SHA-256, `timingSafeEqual`), emitido só ao socket autenticado; socket anterior é revogado na reconexão (B28).
- Hardening do runtime: configuração validada com Zod e fail-fast (`apps/server/src/config.ts`), Helmet, `@fastify/rate-limit` (120 req/min/IP), CORS por allowlist explícita em produção, `bodyLimit` de 32 KiB, `maxHttpBufferSize` de 16 KiB no Socket.IO, token bucket por socket+categoria (`apps/server/src/socket-security.ts`), payloads validados antes do `RoomStore`, shutdown gracioso em `SIGTERM`/`SIGINT` (B24).
- Observabilidade operacional: `/live`, `/ready` (probe de gravabilidade não destrutivo), `/metrics` em formato Prometheus protegido por bearer token em produção, métricas de baixa cardinalidade sem PII (`apps/server/src/observability.ts`) (B25).
- Container Docker multi-stage, usuário não-root, frontend estático servido no mesmo origin via `@fastify/static`; `railway.json` pro deploy (B26).
- Deploy real em produção no Railway, com volume persistente montado em `/data`.

### Corrigido

- Dois bugs na implementação de retomada de sessão: jogador novo nunca recebia token; `commit()` descartava os hashes de token ao persistir (quebrava restart).
- Erro de tipagem em `apps/server/src/socket.test.ts` que passava sem checagem de tipos no Vitest.
- Versões de plugin Fastify da spec original assumiam Fastify 4; corrigidas para as compatíveis com Fastify 5.10.0 (`@fastify/helmet@^12`, `@fastify/rate-limit@^10`).
- `tsconfig.tsbuildinfo` do host sendo copiado pra imagem Docker fazia o `tsc` de `packages/shared` pular a emissão (cache incremental confiava em `dist/` excluído pelo `.dockerignore`).
- Instrução `VOLUME` do Dockerfile rejeitada pelo builder Metal do Railway.
- `/ready` retornando 503 em produção: `chown` do Dockerfile não sobrevive à montagem do volume real; `docker-entrypoint.sh` corrige a posse em runtime antes de largar privilégio.

### Verificado

- `npm run validate`: typecheck, lint, Prettier, 242 testes e build.
- `npm run test:cov`: motor (`packages/shared/src/rules`) em 90,16% de cobertura de statements.
- `npm run e2e`: 7 cenários passando.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `docker build` limpo + smoke test real (usuário não-root, `/live`/`/ready`/`/health`/`/metrics` corretos).
- Restart real do container com volume: sala aguardando e partida ativa (2 jogadores) sobrevivem, com reconexão via `resumeToken`.
- URL HTTPS pública real (`https://web-production-52c52.up.railway.app`) validada: `/live`, `/ready`, `/health`, frontend e fluxo de criação de sala via Socket.IO sobre TLS.

---

## [0.4.0] — 2026-07-27 · Sprint 5 FECHADA ✅

O diário completo, com o inventário de commits, decisões, validações e instruções operacionais, está em [`docs/CHANGELOG-2026-07-27.md`](./docs/CHANGELOG-2026-07-27.md).

### Adicionado

- Multiplayer Online autoritativo com identidade estável, reconexão, salas, chat, ações especiais e mãos privadas.
- UI Local e Online mobile-first para 2–10 jogadores.
- Lobby Online com persistência de nome, validação, `NotFound` para sala inexistente e cópia de código.
- `npm run dev` supervisionando backend Fastify e frontend Vite simultaneamente.
- Proxy Socket.IO same-origin para uso via Cloudflare Tunnel.
- Playwright E2E para multiplayer, reload, proxy, acessibilidade, mesa Local com 10 jogadores e partida Online determinística até a vitória.
- Telemetria PostHog Cloud opcional para o evento `RECONECTADO`, validada no dashboard US Cloud.
- Lighthouse Accessibility 100/100 em build de produção.

### Corrigido

- Limite visual acidental de quatro jogadores.
- Ordem circular dos assentos incompatível com o sentido do motor.
- Perda do host durante reconexão.
- Entrada em sala inexistente que criava sala silenciosamente.
- Conexão externa quebrada por fallback para `127.0.0.1:3001`.
- Cópia de código sem fallback em browsers sem Clipboard API.
- Instalação limpa do monorepo no npm/GitHub Actions, com workspaces declarados e cache incremental fora do Git.
- Dependências Fastify atualizadas; auditoria de produção sem vulnerabilidades conhecidas.

### Verificado

- `npm run validate`: typecheck, lint, Prettier, 171 testes e build.
- `npm run e2e`: 7 cenários passando.
- Backend `/health`, frontend `5173` e proxy `/socket.io` respondendo `200`.
- GitHub Actions verde em `quality-gate` e `E2E (Playwright)`.
- PostHog US Cloud recebeu e exibiu `RECONECTADO` após queda/reconexão real.

---

## [0.3.0] — 2026-07-27 · Sprint 3 FECHADA ✅ (release candidate)

### Sprint 3 — Beta Multiplayer + Estrutura de gestão multi-agente

#### Adicionado (Mavis)

- **M14 — Identidade estável de jogador** em `packages/shared/src/rules/` (apoiado por `packages/shared/src/types/player.ts`):
  - `SessaoJogador` interface nova
  - `ClientEntrarSalaEvent` agora exige `jogadorId` (UUID v4 gerado pelo cliente)
  - `RoomStore.join()` rejeita jogador em outra sala, restaura jogador existente (reconexão)
  - `RoomStore.disconnect()` só marca `conectado: false`, não remove
  - Servidor envia `server:mao:atualizada` (privado) na reconexão
  - 7 testes novos cobrindo reconexão, anti-impersonation, JOGADOR_EM_OUTRA_SALA
- **M15 — Decisão dual app** (Opção A) — manter `src/` legacy + `apps/web/` online. ADR-008.
- **Estrutura de gestão do time multi-agente** (sugestão do user, validada e aprovada):
  - `AGENTS.md` (raiz) — entry point do time
  - `agents/{mavis,codex,antigravity}.md` — perfis com escopo, restrições, skills
  - `briefings/sprint-N.md` — spec da sprint
  - `feedback/<data>-<issue>-<agente>.md` — review formal
  - `briefings/m14-reconexao-identidade.md`, `briefings/m15-src-legado.md` — specs dedicadas
- **ADR-007** — Mavis como gerente + revisor + dono do motor
- **ADR-008** — Dual app (`src/` legacy + `apps/web/` online)
- 4 skills instaladas (Vercel React, Composition Patterns, Frontend Design, Web Design Guidelines)

#### Adicionado (Codex)

- **B9 — Cliente Socket.IO** em `apps/web/src/services/socketClient.ts` (251 linhas):
  - Hook `useGameSocket()` com reconnection, sessionStorage, event handlers pra 10 eventos
- **B10 — Migração do app pra `apps/web/`**:
  - `apps/web/src/App.tsx` (211 linhas) — lobby + sala + jogo + chat
  - `apps/web/src/styles.css` (306 linhas) — design system coerente com ADR-002
  - `apps/web/src/main.tsx` — bootstrap novo
- **B12 — Lobby online** — integrado no `App.tsx` (extração pra `LobbyOnline.tsx` ficou pra Sprint 4 polish)
- **B13 — Reconnect handler** — usa M14 (identidade estável) como base, instrumentação UX fica pra Sprint 4
- `apps/web/src/services/socketClient.test.ts` (3 testes)

#### Adicionado (Antigravity)

- **B11 — AvatarComStatus** (`src/components/AvatarComStatus.tsx`, 92 linhas) — anel verde/cinza conforme status
- **B14 — Reconectando** (`src/components/Reconectando.tsx`, 115 linhas) — modal com spinner SVG inline
- **B15 — WifiStatus** (`src/components/WifiStatus.tsx` + `assets/svgs/icons/wifi-{online,offline}.svg`) — componente React + SVGs estáticos
- `src/components/sprint3.test.ts` (6 testes)

### Decisões arquiteturais (ADRs)

- **ADR-006** — Servidor autoritativo
- **ADR-007** — Mavis como gerente/revisor
- **ADR-008** — Dual app

### Pendências conhecidas (Sprint 4 — Polish)

- [ ] B12 — Extrair `LobbyOnline` do `App.tsx` (composição)
- [ ] B13 — UX de reconexão (modal `Reconectando` no client)
- [ ] B16 — Integrar `AvatarComStatus` + `WifiStatus` + `Reconectando` no `LobbyOnline`
- [ ] Telemetria: instrumentar `RECONECTADO` event

### Métricas Sprint 3 (final)

| Métrica                 | Valor                                   |
| ----------------------- | --------------------------------------- |
| **Testes totais**       | 160 (Sprint 0-1-2: 144 + Sprint 3: +16) |
| **Cobertura do motor**  | ≥ 80%                                   |
| **Tempo de testes**     | 3.82s                                   |
| **Erros de TypeScript** | 0                                       |
| **Erros de ESLint**     | 0                                       |
| **Prettier**            | 100%                                    |
| **ADRs publicadas**     | 8 (001-008)                             |
| **Commits no `main`**   | 14 (desde início da sprint)             |

### Como rodar localmente

```bash
# Instalar deps
npm install

# Validar tudo (typecheck + lint + format + test)
npm run validate

# Frontend (single-player legacy)
npm run dev
# → http://localhost:5173

# Backend (multiplayer)
cd apps/server && npm run dev
# → http://localhost:3001/health
```

---

## [0.2.0] — 2026-07-27 · Sprint 1 + Sprint 2 FECHADAS ✅

### Sprint 1 — Motor maduro + UI de batalha

#### Adicionado (Mavis)

- **M2 — State machine explícita** do turno em `packages/shared/src/rules/state-machine.ts` com transições nomeadas (`INICIO_TURNO → ESPERAR_JOGADA → VALIDAR → RESOLVER_ACAO → FIM_TURNO`, ramificações `COMPRAR` e `ESCOLHER_COR`).
- **M11 — Property-based tests** com fast-check (200 numRuns/invariante): preservação de massa total de cartas, alternância de vez, monotonicidade de acúmulo, determinismo de shuffle com seed.
- **Snapshots** (preparação para M12) — função `criarSnapshot` + `restaurarSnapshot` para undo/redo futuro.
- Cobertura de testes do motor: ≥ 80 %.

#### Adicionado (Codex)

- **F1 polish** — ARIA labels, foco visível, navegação por teclado em componentes de carta.
- **F6 — `AttackBadge`** — badge visual mostrando o ataque acumulado.
- **F7 — Fly-to-discard** — animação da carta indo da mão do jogador até o monte de descarte.
- **F8 — Card-shake** — feedback visual quando o jogador tenta jogar carta inválida.

#### Adicionado (Antigravity)

- **12 avatares SVG** em `assets/svgs/avatars/` (avatar-01..12).
- **2 badges SVG** (`ataque.svg`, `silencio.svg`) em `assets/svgs/badges/`.
- **`cards/zeroplus.svg`** — placeholder visual da carta 0+.
- **`deck108.test.ts`** — testes de invariantes do baralho canônico (108 cartas, distribuição correta).

#### Métricas Sprint 1

- **93/93 testes** em ~3 s · typecheck 0 erros · lint 0 · prettier 100 %.

### Sprint 2 — Polimento, persistência, telemetria, PWA

#### Adicionado (Mavis)

- **M12 — Snapshot/restore completo** em `packages/shared/src/rules/snapshot.ts`:
  - `criarSnapshot(estado)`, `restaurarSnapshot(snapshot)`, `diffSnapshots(a, b)`
  - Classe `SnapshotStack` com `push` / `undo` / `redo` / `canUndo` / `canRedo` (preparada para reconnect/replay no Beta)
  - 19 testes cobrindo serialização, integridade, undo/redo, diff de jogadores/turno/silêncio/ataque.
- **M13 — Telemetria mínima** em `packages/shared/src/telemetry/telemetry.ts`:
  - `configureTelemetry`, `logEvent`, `logEvents`, `logCustom`, `makeContext`
  - Sinks: `consoleSink` (dev), `noopSink` (testes)
  - **OFF por padrão** — `enabled = false` (LGPD-friendly)
  - Wrapper `src/services/gameEngine.ts` agora despacha `logEvents(resultado.eventos)` automaticamente após cada chamada do motor.
  - 16 testes cobrindo config, sample rate, error handling em sinks sync/async.
- **B1 — Testes do 0+ e Regra do 7** em `zero-plus-silence.test.ts` (12 testes novos):
  - 0+ sem ataque (só gira mãos)
  - 0+ com ataque (reflexo de N cartas pro último atacante)
  - 0+ com último atacante = próprio jogador
  - 0+ em 2 jogadores (swap, não rotação)
  - 7 ativa silêncio / próxima carta desativa
  - 7 como starter, 7s em sequência
  - Validação/comprar não bloqueiam sob silêncio (regra é social, não mecânica)
- **🐛 Fix do `girarMaos`** em `execute-play.ts` — era no-op em 2 jogadores (round-robin de 1 elemento). Agora faz swap correto: j1↔j2, ou rotação circular pra 3+. 12 testes novos no B1 cobrem o fix.

#### Adicionado (Codex · B2)

- **Backend autoritativo Fastify + Socket.IO** em `apps/server/`:
  - `server.ts` — bootstrap (CORS, pino-pretty, `/health`)
  - `room-store.ts` — `RoomStore` em memória (criar sala, entrar, iniciar, jogar, comprar, desconectar, `toPublicState` que NUNCA expõe mãos)
  - `socket.ts` — handlers `client:entrar:sala`, `client:iniciar:partida`, `client:jogar`, `client:comprar`, `client:escolher:cor`, `client:chat:msg`, `disconnect`
  - Validação 100 % via motor compartilhado (`@kabemjunto/shared`); cliente nunca é confiável
  - Chat sanitizado (remove `<` `>`, trim, slice 240 chars)
  - Disconnect marca jogador como `conectado: false` sem fechar a sala
  - 4 testes do `RoomStore` (criação, start, exposição pública sem mãos, jogada, compra)
  - Servidor em `http://127.0.0.1:3001` com `/health` retornando 200
- Nota: 15 vulnerabilidades transitivas reportadas pelo `npm` (mantidas como aviso, sem `npm audit fix` forçado).

#### Adicionado (Antigravity · B6/B7/B8)

- **PWA manifest** (`manifest.json` + copiado para `public/`) — nome "Kabemjunto — O Jogo de Cartas", `display: standalone`, cores `#0F172A` / `#1F2937`, ícones maskable.
- **Ícones SVG vetoriais**:
  - `favicon.svg` (aba do navegador)
  - `icon-192.svg` (PWA 192×192)
  - `icon-512.svg` (PWA 512×512)
  - `icon-maskable.svg` (Android adaptive)
- **Meta tags mobile** em `index.html` e `apps/web/index.html`:
  - `viewport-fit=cover`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, `theme-color=#0F172A`, `apple-touch-icon`
- **Safe area CSS** em `index.css` — `env(safe-area-inset-top/bottom/left/right)` pra encaixe perfeito em iPhone notch e gesture bars Android.

#### Decisões arquiteturais (ADRs)

- **ADR-005** — Telemetria opcional e off-by-default (LGPD-friendly)
- **ADR-006** — Servidor autoritativo (validação 100 % no back, motor compartilhado front/back)

#### Métricas Sprint 2 (final)

- **144/144 testes** em 3.85 s (93 Sprint 0+1 + 39 B1/M12/M13 + 4 B2 + 8 B6/B7/B8 supporting)
- typecheck 0 erros · ESLint 0 erros / 0 warnings · Prettier 100 % conforme
- Backend `/health` OK em `127.0.0.1:3001`
- Cobertura do motor ≥ 80 %

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
