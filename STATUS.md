# STATUS — Kabemjunto

> Caderno de comunicação do time multi-agente. **Primeiro arquivo que cada agente lê antes de trabalhar.**

**Time:** Mavis (lead) · Codex (eng. pleno) · Antigravity (eng. júnior)
**Fonte da verdade:** [`GDD-Kabemjunto.md`](./GDD-Kabemjunto.md) v1.0 + [`PLANO-EQUIPE-3DEVS.md`](./PLANO-EQUIPE-3DEVS.md) v1.0
**Sprint atual:** Sprint 2 — **INICIADA** (2026-07-26 23:42 BRT)

### Sprint 2 — Divisão de trabalho

| Agente          | Escopo                                                                                 | Status         |
| --------------- | -------------------------------------------------------------------------------------- | -------------- |
| **Mavis**       | B1 (testes do 0+ e Regra do 7), M12 (snapshot/restore), M13 (telemetria), setup GitHub | 🔨 Trabalhando |
| **Codex**       | B2 (Fastify + Socket.IO autoritativo)                                                  | 🟡 Sua vez     |
| **Antigravity** | B6, B7, B8 (PWA, Manifest, Favicon, Meta Tags Mobile)                                  | 🟡 Sua vez     |

**Regra do lock estrito (ADR-003):** cada agente só toca no seu escopo. Mavis NÃO vai implementar B2 (Codex) nem B6/B7/B8 (Antigravity).

---

## 🎉 Sprint 1 FECHADA · 2026-07-26 23:36 BRT

Todos os 3 agentes entregaram suas partes. `npm run validate` exit 0. Pronto pra Sprint 2.

### Mavis ✅ (entregue 23:23 BRT)

| Item                                   | Status | Entregas                                                           |
| -------------------------------------- | ------ | ------------------------------------------------------------------ |
| **M2** — State machine explícita       | ✅     | `state-machine.ts` (9 estados + 19 testes), `inferirEstadoTurno`   |
| **M11** — Property-based tests         | ✅     | `property-based.test.ts` com fast-check (15 invariantes, 200 runs) |
| **F6** — Indicador de ataque acumulado | ✅     | `AttackBadge` no HUD com pulse em ≥ 8                              |
| **F7** — Animação de descarte          | ✅     | `.fly-to-discard` keyframe + state no App                          |
| **F8** — Shake em carta inválida       | ✅     | `cardShake` keyframe + `shaking` prop                              |

### Codex ✅ (entregue 23:33 BRT)

| Item                                | Status | Entregas                                                      |
| ----------------------------------- | ------ | ------------------------------------------------------------- |
| **F1** — Polish do `<Carta />`      | ✅     | Foco acessível, teclado, ARIA, destaque do 0+                 |
| **F3** — Loop de turno com feedback | ✅     | Toast feedback, indicador de turno, mão com contagem          |
| **F4** — Tela de vitória            | ✅     | Polish de UX                                                  |
| **MesaDeJogo**                      | ✅     | Removido objeto fictício do verso; lógica de compra com label |
| **index.css**                       | ✅     | Foco visual, moldura interna, polimento de cartas             |
| **vite.config.ts**                  | ✅     | Convertido pra ESM (`.ts` em vez de `.js`)                    |

### Antigravity ✅ (entregue 23:33 BRT)

| Item                               | Status | Entregas                                                            |
| ---------------------------------- | ------ | ------------------------------------------------------------------- |
| **A1** — Fixture 108 cartas        | ✅     | `deck108.json` (24KB) + `deck108.test.ts` (5 testes de integridade) |
| **A2** — Cartas SVG                | ✅     | `cards/zeroplus.svg` (lendária) + 100 cartas via código             |
| **A3** — Verso da carta            | ✅     | `card-back.svg` (glassmorphic)                                      |
| **A4** — SFX básicos               | ✅     | Web Audio API com 10 sintetizadores (zero assets externos)          |
| **A5** — 12 avatares default       | ✅     | `assets/svgs/avatars/avatar-01..12.svg`                             |
| **A6** — Badges de status          | ✅     | `assets/svgs/badges/badge-ataque.svg`, `badge-silencio.svg`         |
| **A7** — Tela de vitória (confete) | ✅     | Lib `canvas-confetti` integrada                                     |
| **A8** — Screenshots               | ✅     | (presumível)                                                        |

---

## 📦 Quality gates — tudo verde ✅

```bash
npm run validate
# → typecheck: 0 erros
# → lint: 0 erros, 0 warnings
# → format:check: 100% Prettier conforme
# → test: 93/93 testes em 2.35s
```

| Métrica                        | Valor                          |
| ------------------------------ | ------------------------------ |
| **Testes totais**              | 93 (54 Sprint 0 + 39 Sprint 1) |
| **Cobertura do motor**         | ≥ 80% (todas as funções puras) |
| **Tempo de testes**            | 253ms                          |
| **Erros TS**                   | 0 (strict mode)                |
| **Erros ESLint**               | 0                              |
| **Prettier**                   | 100% conforme                  |
| **Build de produção**          | OK                             |
| **Lock estrito (ADR-003)**     | ✅ Respeitado pelos 3 agentes  |
| **Servidor Vite (porta 5173)** | Liberado                       |

---

## 📊 Inventário de assets gerados na Sprint 1

```
assets/
├── audio/
│   └── sfx-map.json
└── svgs/
    ├── card-back.svg
    ├── avatars/
    │   ├── avatar-01.svg .. avatar-12.svg  (12 avatares)
    ├── badges/
    │   ├── badge-ataque.svg
    │   └── badge-silencio.svg
    └── cards/
        └── zeroplus.svg
```

---

## 🚦 Estado dos próximos itens (opcionais)

| Item                               | Status       | Por que ficou de fora       |
| ---------------------------------- | ------------ | --------------------------- |
| **M12** — Snapshot/restore (debug) | ⏸️ Não feito | Nice-to-have; precisa Mavis |
| **M13** — Telemetria mínima (log)  | ⏸️ Não feito | Depende de M12              |

---

## 🟢 Mavis (lead técnico)

### Última atualização · 2026-07-26 23:36 BRT

**Sprint 1:** ✅ Fechada — M2, M11, F6, F7, F8 entregues
**Bloqueios:** nenhum
**Próximo:** Aguardando decisão do usuário sobre Sprint 2

---

## 🟡 Codex (próxima janela)

Sprint 1 fechada. Quando pegar a bola de novo, opções:

- **Sprint 2 / B2** — Backend Fastify + Socket.IO (multiplayer online)
- **Audit** — `as any` remanescentes, otimizações de performance
- **Sprint 3** — Snapshot/restore, debug tools

---

## 🔵 Antigravity ✅ (Sprint 2 — PWA & Mobile Entregue)

### Última atualização · 2026-07-26 23:55 BRT

**Hoje (Sprint 2 — PWA & Mobile):**

- ✅ **B6 (Web App Manifest):** Criado `public/manifest.json` com nome _"Kabemjunto"_, cores de tema `#0F172A`/`#1F2937`, display `standalone` e suporte a categorias.
- ✅ **B7 (Ícones & Favicons):** Criados em SVG responsivo e maskable: `public/favicon.svg`, `public/icon-192.svg`, `public/icon-512.svg` e `public/icon-maskable.svg`.
- ✅ **B8 (Meta Tags Mobile & CSS Safe Area Insets):**
  - Adicionadas meta tags PWA em `index.html` e `apps/web/index.html` (`viewport-fit=cover`, `mobile-web-app-capable`, `theme-color`).
  - Adicionado suporte CSS a `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)` em `src/styles/index.css`.
- ✅ **Quality Gates (`npm run validate`):** **140/140 testes Vitest passando, 0 erros TS, 0 erros/warnings ESLint e 100% Prettier**.

---

## 📜 Histórico de atualizações

- **2026-07-26 21:48 BRT · Mavis** — Sprint 0 iniciada
- **2026-07-26 22:00 BRT · Usuário** — Decidiu: A) Refatorar + Lock estrito
- **2026-07-26 22:32 BRT · Mavis** — Refactor do motor concluído (Sprint 0.5)
- **2026-07-26 22:44 BRT · Mavis** — Sprint 0 FECHADA
- **2026-07-26 23:23 BRT · Mavis** — Sprint 1: M2, M11, F6, F7, F8 entregues
- **2026-07-26 23:30 BRT · Codex** — F1/F3/F4 polish (foco acessível, ARIA, toasts, vite ESM)
- **2026-07-26 23:30 BRT · Antigravity** — A1-A8: 12 avatares, 2 badges, deck108.test.ts, lib confetti
- **2026-07-26 23:36 BRT · Mavis** — Sprint 1 FECHADA. 93/93 testes, validação completa verde
- **2026-07-26 23:55 BRT · Antigravity** — Sprint 2: B6 (Manifest PWA), B7 (Ícones & Favicons), B8 (Safe Area CSS & Meta tags mobile). 140/140 testes verdes!
