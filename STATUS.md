# STATUS — Kabemjunto

> Caderno de comunicação do time multi-agente. **Primeiro arquivo que cada agente lê antes de trabalhar.**

**Time:** Mavis (lead) · Codex (eng. pleno) · Antigravity (eng. júnior)
**Fonte da verdade:** [`GDD-Kabemjunto.md`](./GDD-Kabemjunto.md) v1.0 + [`PLANO-EQUIPE-3DEVS.md`](./PLANO-EQUIPE-3DEVS.md) v1.0
**Branch:** `main`
**Sprint atual:** Sprint 5 — **em andamento** — release robusta v0.4.0

### Atualização técnica — TROCA_MAO

- ✅ Motor implementa `TROCA_MAO` com alvo obrigatório, troca imutável e evento `MAO_TROCADA`.
- ✅ Contrato multiplayer transporta `alvoTrocaId` do cliente ao `RoomStore` e ao motor autoritativo.
- ✅ UI de `Troca Mão`: dialog no desktop, bottom sheet no mobile e seleção acessível por teclado.
- ✅ Testes: 170/170; cobertura do motor: 89,16%; build e 3 E2E verdes.

---

## 🎉 Sprint 2 FECHADA · 2026-07-27 00:00 BRT

Todos os 3 agentes entregaram. `npm run validate` exit 0 (144/144 testes em ~4s). Pronto pra Sprint 3 ou release.

### Mavis ✅ (entregue 23:56 BRT)

| Item                               | Status | Entregas                                                                                                        |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| **M12** — Snapshot/restore         | ✅     | `packages/shared/src/rules/snapshot.ts` (5 funções + classe `SnapshotStack` com undo/redo), 19 testes           |
| **M13** — Telemetria mínima        | ✅     | `packages/shared/src/telemetry/telemetry.ts` (off por default, LGPD-friendly, console sink), 16 testes          |
| **B1** — Testes do 0+ e Regra do 7 | ✅     | `zero-plus-silence.test.ts` (12 testes) + **fix do bug** `girarMaos` para 2 jogadores (era no-op, agora é swap) |

**Wrappers atualizados:**

- `src/services/gameEngine.ts` agora despacha `logEvents(resultado.eventos)` automaticamente
- `telemetry.ts` é auto-configurado (enabled só em `import.meta.env.PROD`)

### Codex ✅ (entregue ~00:00 BRT)

| Item                                      | Status | Entregas                                                                                                                                       |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **B2** — Fastify + Socket.IO autoritativo | ✅     | `apps/server/src/server.ts`, `room-store.ts` (em memória), `socket.ts` (handlers) + 4 testes                                                   |
| Validação                                 | ✅     | `RoomStore` (criar, entrar, iniciar, jogar, comprar, sair) + estado público sem vazar mãos + chat sanitizado + disconnect handling + `/health` |
| **Servidor**                              | ✅     | `http://127.0.0.1:3001` com `/health` retornando 200                                                                                           |

### Antigravity ✅ (entregue ~00:00 BRT)

| Item                                  | Status | Entregas                                                                                                         |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| **B6** — Web App Manifest             | ✅     | `manifest.json` (nome, display, cores #0F172A, maskable)                                                         |
| **B7** — Ícones & Favicons SVG        | ✅     | `favicon.svg`, `icon-192.svg`, `icon-512.svg`, `icon-maskable.svg`                                               |
| **B8** — Meta Tags Mobile + Safe Area | ✅     | `index.html` com `viewport-fit=cover`, `mobile-web-app-capable`, `theme-color`; CSS com `env(safe-area-inset-*)` |

---

## 📦 Quality gates — tudo verde ✅

```bash
npm run validate
# → typecheck: 0 erros
# → lint: 0 erros, 0 warnings
# → format:check: 100% Prettier conforme
# → test: 144/144 testes em 3.85s
```

| Métrica                | Valor                                     |
| ---------------------- | ----------------------------------------- |
| **Testes totais**      | 144 (93 Sprint 0+1 + 39 Sprint 1 + 12 B1) |
| **Cobertura do motor** | ≥ 80%                                     |
| **Tempo de testes**    | 521ms                                     |
| **Erros TS**           | 0 (strict mode)                           |
| **Erros ESLint**       | 0                                         |
| **Prettier**           | 100% conforme                             |
| **Servidor backend**   | `/health` OK em `127.0.0.1:3001`          |

---

## 📊 Estrutura completa do projeto

```
src/                                # Frontend
├── components/                      # 9 componentes React
├── services/
│   ├── gameEngine.ts                # Wrapper fino + telemetria
│   └── audioService.ts              # SFX via Web Audio API
├── styles/index.css                 # + safe-area-inset
└── App.tsx

apps/server/                        # Backend (Codex)
├── src/
│   ├── server.ts                    # Fastify + Socket.IO autoritativo
│   ├── room-store.ts                # Estado em memória
│   ├── socket.ts                    # Handlers de evento
│   └── room-store.test.ts            # 4 testes
└── package.json

packages/shared/src/
├── rules/                           # Motor puro (Mavis)
│   ├── shuffle.ts | create-game.ts | validate-play.ts
│   ├── execute-play.ts              # + fix do girarMaos
│   ├── buy-cards.ts | bot-turn.ts | state-machine.ts
│   └── snapshot.ts                  # M12
├── telemetry/                       # M13
│   ├── telemetry.ts | telemetry.test.ts | index.ts
├── types/                           # Tipos canônicos
├── constants/cards.ts               # Gerador do baralho 108
└── fixtures/deck108.json            # Fixture determinística

assets/                              # Assets (Antigravity)
├── svgs/
│   ├── card-back.svg | favicon.svg | icon-192/512/maskable.svg
│   ├── avatars/avatar-01..12.svg    # 12 avatares
│   ├── badges/badge-{ataque,silencio}.svg
│   └── cards/zeroplus.svg
├── audio/sfx-map.json
└── manifest.json                    # PWA (Antigravity)

public/                              # Ícones PWA copiados (Antigravity)
.github/
├── workflows/ci.yml                 # Lint + test + build
├── workflows/pr-size-check.yml
├── dependabot.yml
├── pull_request_template.md
└── ISSUE_TEMPLATE/{bug_report,feature_request}.md

docs/
├── GDD-Kabemjunto.md
├── PLANO-EQUIPE-3DEVS.md
├── DECISIONS.md                     # ADRs 001..004
├── README.md
├── CONTRIBUTING.md
└── STATUS.md (este)
```

---

## 🟢 Mavis (lead técnico)

**Sprint 2:** ✅ Fechada — M12, M13, B1 entregues (com fix do bug do `girarMaos`)
**Sprint 3 (papel gerente/revisor):** M14 ✅ (2026-07-27 01:00 BRT) — Identidade estável de jogador destrava B13 (reconnect handler do Codex). Spec em `briefings/m14-reconexao-identidade.md`, feedback em `feedback/2026-07-27-m14-mavis.md`. M15 ✅ (2026-07-27 01:22 BRT) — Decisão de manter dual app (Opção A) documentada em ADR-008. Pendente: nenhum da minha lista.
**Sprint 5 (Release Robusto):** M16 ✅ (2026-07-27 06:35 BRT) — Consolidação dual app em `apps/web/` (fase 1-5). ADR-009 publicado. Pendente: M19 (CI, vou fazer).
**Bloqueios:** B17 (PostHog) precisa de API key do user
**Próximo:** M19 (CI + badge), apoiar B17/B18/B19 do Codex, A11/A12 do Antigravity (Sprint 5)

---

## 🟡 Codex (próxima janela)

**Sprint 2:** ✅ B2 entregue. **Tá livre** — o backend multiplayer está pronto.

---

## 🔵 Antigravity ✅ (Sprint 3 — Assets Multiplayer Entregues)

### Última atualização · 2026-07-27 00:31 BRT

**Hoje (Sprint 3 — Beta Multiplayer Assets):**

- ✅ **[B11] AvatarComStatus ([AvatarComStatus.tsx](file:///c:/Users/alexa/Downloads/Game_kabemjunto/src/components/AvatarComStatus.tsx)):**
  - Componente React que renderiza o avatar do jogador com anel e badge reluzente de conexão (`#22C55E` conectado / `#6B7280` desconectado).
- ✅ **[B13] Tela/spinner Reconectando ([Reconectando.tsx](file:///c:/Users/alexa/Downloads/Game_kabemjunto/src/components/Reconectando.tsx)):**
  - Modal overlay com spinner SVG em rotação contínua (Laranja `#F39C12`), mensagem pt-BR e indicador opcional de tentativas (`Tentativa 2/3...`).
- ✅ **[B14] Ícones Wifi / Socket Status ([WifiStatus.tsx](file:///c:/Users/alexa/Downloads/Game_kabemjunto/src/components/WifiStatus.tsx)):**
  - SVGs vetoriais 24x24 em `assets/svgs/icons/` (`wifi-online.svg`, `wifi-offline.svg`) com wrapper React `<WifiStatus status="online"|"offline" />`.
- ✅ **Suíte de Testes ([sprint3.test.ts](file:///c:/Users/alexa/Downloads/Game_kabemjunto/src/components/sprint3.test.ts)):**
  - 6 testes unitários criados cobrindo renderização estática e variações de estado de B11, B13 e B14.
- ✅ **Quality Gates (`npm run validate`):** **150/150 testes Vitest passando em 10 arquivos, 0 erros TS, 0 erros/warnings ESLint e 100% Prettier**.

---

## 📜 Histórico de atualizações

- **2026-07-26 21:48 BRT · Mavis** — Sprint 0 iniciada
- **2026-07-26 22:44 BRT · Mavis** — Sprint 0 FECHADA
- **2026-07-26 23:36 BRT · Mavis** — Sprint 1 FECHADA (93 testes)
- **2026-07-26 23:42 BRT · Mavis** — Sprint 2 kickoff
- **2026-07-26 23:56 BRT · Mavis** — M12/M13/B1 entregues (fix do `girarMaos`)
- **2026-07-27 00:00 BRT · Codex** — B2 entregue: Fastify + Socket.IO autoritativo
- **2026-07-27 00:15 BRT · Antigravity** — B6/B7/B8 entregues: PWA manifest, ícones SVG e Safe Area CSS
- **2026-07-27 00:31 BRT · Antigravity** — Sprint 3: [B11] AvatarComStatus, [B13] Reconectando modal, [B14] WifiStatus icons. 150/150 testes verdes!
- **2026-07-27 00:00 BRT · Antigravity** — B6/B7/B8 entregues: PWA + ícones + mobile meta tags
- **2026-07-27 00:08 BRT · Mavis** — Sprint 2 FECHADA. 144/144 testes em 3.85s. 0 erros TS/ESLint. 100% Prettier.

## 📜 Histórico de commits (main)

- `59f5302` — docs: STATUS Sprint 2 PWA deliverables (Antigravity)
- `499ff72` — feat(pwa): PWA webmanifest, favicons, app icons, safe area CSS (Antigravity + Mavis M12/M13 + Codex B2 — commit grande)
- `9bd5734` — docs: STATUS Sprint 1 asset completions
- `8c8cff1` — feat: Sprint 1 visual assets + tests (Antigravity)
- `dd4c651` — docs: STATUS git init progress
- `1aed955` — feat: initial commit v1.0 (Mavis)

### Codex — Sprint 3 B9/B10/B12

- B9: cliente Socket.IO tipado em `apps/web/src/services/socketClient.ts`, hook `useGameSocket`, estado publico sincronizado e mao privada atualizada pelo servidor.
- B10: lobby online em `apps/web/src/App.tsx` com criar/entrar por codigo, lista de jogadores, inicio pelo host e chat.
- B12 cliente: sessao persistida, reconexao automatica e indicador `Reconectando...`.
- Dependencia: restauracao server-side com identidade estavel ainda aguarda M14; o backend atual usa `socket.id` como identidade de jogador.

---

## 🎨 UI/UX — Fase 1 do redesign da mesa · 2026-07-27

Referências incorporadas:

- imagem da tela atual, usada para identificar overflow e sobreposição;
- imagem proposta da mesa mobile-first;
- especificação visual das cartas especiais e do verso do baralho;
- documento técnico `docs/UI-REDESIGN-FASE-1.md`.

Decisões registradas:

- carta 7 visualmente secreta, sem ícone de silêncio na face;
- monte de compra clicável com contador incorporado;
- mão em leque com seleção em dois toques;
- quatro assentos espaciais para 2–4 jogadores na primeira versão;
- banner/fila de eventos para silêncio, ataques e reflexo do 0+;
- sem rodadas, pontuação cumulativa ou temporizador obrigatório no MVP;
- `+4 sobre +4` permanece regra canônica e não vira toggle no MVP.

Estado: documentação atualizada e Fase 1 autorizada para implementação.

---

## ⚡ UI/UX — Fase 2: eventos de compra e punição · 2026-07-27

- Evento visual `COMPRA` com modal temporário.
- Histórico compacto dos três eventos mais recentes.
- Animação de cartas saindo do núcleo durante compra/punição.
- Feedback de sucesso duplicado removido; erros continuam no toast acessível.
- Validação mobile confirmou histórico sem colisão e sem overflow horizontal.
- Correção posterior confirmou que o modal de compra desaparece após 1,8 s.

---

## ⚡ UI/UX — Fase 3: lobby local e resultado · 2026-07-27

- Lobby Local com ação `JOGAR AGORA`, Hot-seat e configuração de nome/jogadores.
- Resultado com vencedor, ordem final e estatísticas extraídas do histórico.
- Sem pontuação inventada: jogadas, compras e efeitos são contagens autoritativas.
- Confetti desativado sob `prefers-reduced-motion`.

---

## ⚡ UI/UX — Fase 4: coleção e personalização local · 2026-07-27

- Dialog de coleção com seleção de avatar e tema.
- 12 avatares SVG publicados no bundle web.
- Preferências locais persistidas no navegador.
- Preview explicitamente separado do estado autoritativo do jogo.

---

## 🛠️ Correções de fluxo — 2026-07-27

- Assento do jogador humano centralizado na borda inferior da mesa mobile, próximo à mão.
- Modo Local e `EstadoPartida` persistidos em `sessionStorage` para recuperação após reload durante a sessão.
- Validação confirmou mesa preservada após recarregar, sem retorno ao Lobby e sem erros de console.
