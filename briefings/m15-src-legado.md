# M15 — Destino do `src/` raiz (legacy single-player vs. apps/web/)

> **Spec de decisão, escrita por Mavis (gerente).**
> Após a migração pra `apps/web/`, o projeto tem **dois apps paralelos**. Decidir o que fazer.

**Status:** ⏳ Aguardando decisão do user (3 opções)
**Impacto:** médio — afeta build, deploy e onde cada agente trabalha
**Pré-requisito:** Sprint 3 em andamento (B9/B10/B12 do Codex usam `apps/web/`)

---

## Estado atual (2026-07-27)

```
src/                                    # LEGACY (single-player/hotseat, FUNCIONAL)
├── App.tsx (8 KB)                      # app completo com hotseat
├── main.tsx (248 B)                    # bootstrap
├── styles/index.css (12 KB)            # design system legacy
├── components/ (10 componentes)        # CartaView, HUDJogador, Lobby, etc
├── services/
│   ├── audioService.ts (6.8 KB)       # SFX via Web Audio API
│   └── gameEngine.ts (5 KB)            # wrapper do motor (hotseat)
└── components/sprint3.test.ts         # testes do Antigravity (B11/B13/B14)

apps/web/src/                           # NOVO (online multiplayer, EM DESENVOLVIMENTO)
├── App.tsx (8 KB)                      # lobby + sala + jogo + chat (Codex B9)
├── main.tsx (317 B)                    # bootstrap
├── styles.css (5 KB)                   # CSS novo
└── services/socketClient.ts (9.5 KB)   # hook do socket (Codex B9)
```

**Build atual:** `vite.config.ts` raiz aponta pra `./src` (não `./apps/web/src`).

---

## As 3 opções

### 🅰️ **A — Manter `src/` raiz como legacy + `apps/web/` como novo**

- **O que muda:** nada. Documenta em ADR-008 que temos 2 apps paralelos.
- **Prós:**
  - Zero risco (zero código jogado fora)
  - Hotseat continua funcionando (Mavis/Antigravity podem testar offline)
  - Online e offline têm pipelines separados
- **Contras:**
  - 2 builds, 2 deploys (se for pra produção)
  - Confuso pra novos devs ("qual app eu uso?")
  - Duplicação: 2 App.tsx, 2 CSS, 2 sistemas de estado
- **Esforço:** ~30 min (1 ADR + 1 parágrafo no README)
- **Recomendado se:** você quer fechar Sprint 3 rápido e resolver isso na Sprint 4 com calma.

### 🅱️ **B — Deletar `src/` raiz, consolidar tudo em `apps/web/`**

- **O que muda:**
  - Mover `src/components/*.tsx` (exceto `sprint3.test.ts` que fica) → `apps/web/src/components/`
  - Mover `src/services/audioService.ts` → `apps/web/src/services/`
  - Mover `src/styles/index.css` → `apps/web/src/styles/index.css`
  - Atualizar `vite.config.ts` raiz pra apontar pra `apps/web/`
  - Atualizar alias `@src` → `apps/web/src`
  - Deletar `src/`
- **Prós:**
  - Single source of truth
  - Single build pipeline
  - Single deploy
- **Contras:**
  - Perde o single-player (a menos que o Codex integre no `apps/web/src/App.tsx`)
  - Migração de 10+ componentes + CSS é arriscada (quebra fácil)
  - Sprint 3 vai atrasar (Codex fica ocupado migrando, não avançando B13)
- **Esforço:** ~4-6h (1 sprint inteira)
- **Recomendado se:** você quer limpar a casa antes de fechar o Beta.

### 🅲 **C — Pausar migração, separar `src/` (single-player) e `apps/web/` (multiplayer) formalmente**

- **O que muda:**
  - Documenta: `src/` é single-player/hotseat, `apps/web/src/` é online
  - Adiciona toggle "Modo: single-player / multiplayer" no `App.tsx` raiz
  - `vite.config.ts` continua buildando `src/`, adiciona build separado pra `apps/web/`
- **Prós:**
  - Single-player e multiplayer convivem (sem perder nenhum)
  - Cada modo é testável independentemente
- **Contras:**
  - Mais complexo (2 entrypoints, 2 builds)
  - Toggle no App adiciona UI extra
- **Esforço:** ~2h (1 issue pequena)
- **Recomendado se:** você quer ambos funcionando lado a lado na Sprint 3.

---

## Recomendação do Mavis

**🅰️ Opção A — Manter como está por enquanto, decidir Sprint 4.**

Motivo:

- Sprint 3 tá indo bem (B9/B10/B12 prontos, M14 entregue, Antigravity B11/B13/B14 prontos)
- Não quero atrapalhar o ritmo com refactor arriscado
- Mover single-player pro `apps/web/` é trabalho que compete com B13/B16 (que são mais valiosos pro Beta)
- Posso fazer B (migração) na Sprint 4 com calma, dedicada

Trade-off: vou ter 2 apps por ~1 sprint a mais. Aceitável.

---

## Próximo passo

Você (user) escolhe A, B ou C. Mavis documenta a decisão em ADR-008 e atualiza `briefings/sprint-3.md` com o status.

Se A: Mavis cria ADR-008 + atualiza STATUS (30 min).
Se B: Mavis escreve spec detalhada da migração + atribui pra Codex (4-6h de trabalho).
Se C: Mavis escreve spec + abre issue (2h).
