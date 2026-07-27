# Briefing — Sprint 5: Release Robusto (v0.4.0)

> **Spec da Sprint 5, escrita por Mavis (gerente).**
> Pós-v0.3.1, foco em release com qualidade.

**Período estimado:** 2026-07-28 → 2026-07-30
**Tema:** Release robusto — consolidar dual app, instrumentar PostHog, E2E, acessibilidade, animações.
**Caminho escolhido:** **B (Robusto, ~18h)**
**Pré-requisito:** Sprint 3+4 fechadas (✅ v0.3.1 released 2026-07-27).

**ADR-009** publicada: consolidação do app único em `apps/web/`.

**Revisão Mavis (2026-07-27 19:10 BRT):** implementação funcional aprovada com condições. A tag `v0.4.0` permanece bloqueada pelas evidências listadas no fechamento.

---

## Issues por agente

### 🟢 Mavis (gerente — motor + infra)

#### **M16 — Consolidar dual app** (4-6h)

**Objetivo:** Eliminar `src/` raiz e `apps/web/` separados, ter um app único `apps/web/`.

**Tarefas:**

1. Mover `src/components/*.tsx` (exceto `sprint3.test.ts`) → `apps/web/src/components/`
2. Mover `src/services/audioService.ts` → `apps/web/src/services/`
3. Mover `src/styles/index.css` → `apps/web/src/styles/`
4. Atualizar `apps/web/src/App.tsx` pra incluir modo single-player (toggle no header)
5. Atualizar `vite.config.ts` raiz pra buildar `apps/web/`
6. Deletar `src/` raiz inteiro
7. Atualizar `package.json` raiz: `dev` agora roda `apps/web`
8. Atualizar CI (se já existir): build de `apps/web/` em vez de `src/`

**DoD:**

- `src/` raiz **deletado**
- `npm run dev` → `http://localhost:5173` mostra o app consolidado
- Single-player e multiplayer convivem (toggle "Modo: single-player / multiplayer" no header)
- 160/160+ testes verdes
- Documentar em ADR-009

**Arquivos:**

- `src/` (deletar tudo)
- `apps/web/src/App.tsx` (refactor com toggle)
- `apps/web/src/components/` (recebe os componentes do `src/`)
- `apps/web/src/services/audioService.ts` (novo)
- `apps/web/src/styles/index.css` (novo)
- `vite.config.ts` (atualizar root)
- `package.json` (atualizar scripts)
- `DECISIONS.md` (ADR-009)

#### **M19 — CI no GitHub Actions** (1-2h)

**Objetivo:** Garantir que todo PR roda `npm run validate` antes do merge.

**Tarefas:**

1. Verificar `.github/workflows/ci.yml` (já existe?)
2. Se existir, ajustar pra rodar `npm run validate` em vez de scripts separados
3. Adicionar check de cobertura (≥80% no motor)
4. Adicionar badge no README

**DoD:**

- Push em PR dispara CI
- CI falha se `npm run validate` falhar
- README tem badge de status

**Arquivos:**

- `.github/workflows/ci.yml`
- `README.md`

---

### 🔵 Codex (engenheiro pleno)

#### **B17 — Substituir `consoleSink` por `posthogSink` real** (2-3h)

**Objetivo:** Telemetria vai pra PostHog Cloud (free tier), não console.

**Tarefas:**

1. Criar `apps/web/src/services/posthogSink.ts` que implementa `TelemetrySink`
2. Usar env var `VITE_POSTHOG_API_KEY` e `VITE_POSTHOG_HOST`
3. No `main.tsx`, em prod, usar `posthogSink` em vez de `consoleSink`
4. Documentar setup no README (criar conta PostHog, pegar API key)

**DoD:**

- Evento `RECONETADO` aparece no PostHog dashboard em prod
- Em dev, continua `consoleSink` (zero overhead)
- API key via env var (não commitada)

**Arquivos:**

- `apps/web/src/services/posthogSink.ts` (novo)
- `apps/web/src/main.tsx` (atualizar)
- `README.md` (instruções de setup)

#### **B18 — Testes E2E com Playwright** (3-4h)

**Objetivo:** Garantir que 2 clientes reais conseguem jogar online do início ao fim.

**Tarefas:**

1. Adicionar `@playwright/test` como devDep
2. Criar `e2e/` na raiz com testes:
   - `jogo-completo.spec.ts` — 2 abas, criar sala, entrar, jogar, ganhar
   - `reconexao.spec.ts` — 2 abas, 1 desconecta no meio, reconecta, continua
3. Configurar `playwright.config.ts` com 2 contexts simultâneos
4. Adicionar `npm run e2e` script
5. CI roda E2E em PR (matrix: 1 worker)

**DoD:**

- 2+ testes E2E verdes
- Roda em < 60s
- CI inclui step `npm run e2e`

**Arquivos:**

- `e2e/*.spec.ts` (novo)
- `playwright.config.ts` (novo)
- `package.json` (adicionar devDep + script)
- `.github/workflows/ci.yml` (adicionar step E2E)

#### **B19 — Acessibilidade do Lobby** (2h)

**Objetivo:** Tab navigation, Enter submete, ARIA labels completos, foco visível.

**Tarefas:**

1. `LobbyOnline.tsx`: garantir Tab entre inputs, Enter submete o form
2. Adicionar `aria-describedby` nos inputs (link com mensagem de erro)
3. Adicionar `aria-live="polite"` no container de erro
4. Garantir que foco vai pro primeiro input quando entra no lobby
5. Adicionar `:focus-visible` no CSS (não só `:focus`)

**DoD:**

- Lighthouse Accessibility ≥ 95
- Tab order: nome → código → botão entrar → botão criar
- Enter submete o form
- Mensagem de erro anunciada pra screen reader

**Arquivos:**

- `apps/web/src/components/LobbyOnline.tsx`
- `apps/web/src/styles.css` (adicionar :focus-visible)

---

### 🟣 Antigravity (engenheiro júnior)

#### **A11 — Página 404 / not-found estilizada** (1h)

**Tarefas:**

1. Criar `apps/web/src/components/NotFound.tsx`
2. Adicionar route catch-all no `App.tsx` (ou no React Router se houver)
3. Visual coerente com paleta ADR-002
4. Link "Voltar pro lobby" (ou refresh)

**DoD:**

- Rota inexistente mostra página estilizada (não erro genérico)
- Botão funcional

**Arquivos:**

- `apps/web/src/components/NotFound.tsx` (novo)
- `apps/web/src/App.tsx`

#### **A12 — Animações de vitória (confetti + banner)** (2h)

**Tarefas:**

1. Adicionar `canvas-confetti` (já está nas deps da raiz, verificar)
2. Criar `apps/web/src/components/VitoriaAnimada.tsx`
3. Quando `estado.vencedor` for definido, disparar confetti
4. Banner "VOCÊ GANHOU!" (ou "Você perdeu...") com cor da paleta
5. Botão "Jogar de novo" (recarrega página ou volta pro lobby)

**DoD:**

- Vitória dispara confetti visível por ~3s
- Banner centralizado, animação de entrada
- Botão funcional

**Arquivos:**

- `apps/web/src/components/VitoriaAnimada.tsx` (novo)
- `apps/web/src/App.tsx` (integrar)
- `apps/web/src/styles.css` (animação do banner)

---

## Cronograma sugerido (3 dias)

| Dia                    | Mavis                                                    | Codex                  | Antigravity   |
| ---------------------- | -------------------------------------------------------- | ---------------------- | ------------- |
| **Dia 1** (2026-07-28) | M16 (consolidação, fase 1: mover arquivos)               | B17 (PostHog)          | A11 (404)     |
| **Dia 2** (2026-07-29) | M16 (fase 2: refactor App.tsx + deletar src/) + M19 (CI) | B18 (E2E) + B19 (a11y) | A12 (vitória) |
| **Dia 3** (2026-07-30) | Review final + ADR-009 + CHANGELOG + tag v0.4.0          | Fixes + testes         | Fixes         |

---

## Definição de Pronto (Sprint 5 fechada quando TUDO isso for verdade)

- [x] `src/` raiz deletado, app consolidado em `apps/web/`
- [x] `npm run dev` mostra app único (Local + Online com toggle)
- [x] `npm run e2e` verde (6 testes Playwright)
- [ ] E2E Online conclui uma partida até a vitória (B20)
- [ ] PostHog recebe e exibe `RECONECTADO` em produção
- [ ] CI externo confirma `validate` + `e2e` no último SHA
- [ ] Lighthouse Accessibility ≥ 95
- [x] Vitória dispara confetti
- [x] 404 page estilizada
- [x] `npm run validate` verde (171 testes)
- [x] `apps/web/src/components/` contém os componentes consolidados
- [x] ADR-009 publicada
- [ ] v0.4.0 tagged + pushed

---

## Riscos conhecidos

- **M16 é arriscado**: mover 10+ componentes + CSS pode quebrar import paths. Mitigação: rodar validate após cada movimento.
- **B18 (E2E) é flaky**: Playwright em CI pode dar timeout. Mitigação: 1 worker + retry 2x.
- **B17 (PostHog) requer conta**: usuário precisa criar conta PostHog + pegar API key. Mavis bloqueia até isso.

---

## Comunicação

- Cada agente reporta no fim da issue: arquivos criados, testes, como reproduzir local
- Mavis revisa em < 4h
- Lock estrito restaurado (Sprint 5 não é exceção)
