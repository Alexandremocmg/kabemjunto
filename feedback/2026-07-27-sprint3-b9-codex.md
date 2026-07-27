# Feedback — B9 (Sprint 3) — Codex

> **Issue:** B9 — Cliente Socket.IO no frontend
> **Agente:** Codex
> **Data:** 2026-07-27
> **Revisor:** Mavis

## Status

🟡 **Aprovação parcial.** Código está bom, escopo foi corrigido durante a review.

## O que foi entregue

- `apps/web/src/services/socketClient.ts` (202 linhas) — hook React completo com reconnection, sessionStorage, event handlers pra todos os 9 eventos do socket. **Código de produção.**
- `apps/web/src/App.tsx` (206 linhas) — lobby + sala + jogo + chat, responsivo, ARIA. **Código de produção, com 1 bug.**
- `apps/web/src/styles.css` (306 linhas) — design system coerente com ADR-002, safe area insets. **Código de produção.**

## Problemas encontrados na review

### 🔴 1. Lock estrito violado inicialmente

Codex começou o trabalho em `apps/web/src/`, uma pasta que o pipeline atual (`tsconfig.json` raiz + `vite.config.ts` raiz) **não inclui**. Isso significava que os erros de TypeScript ficavam invisíveis e o trabalho era "órfão".

**Maneira correta:** trabalhar no `src/` raiz (escopo permitido) ou completar a migração de `src/` → `apps/web/` **e** atualizar o pipeline.

**Ação do Mavis:** reverter `apps/web/src/main.tsx` e `apps/web/package.json` (estado inconsistente), depois **aceitar a migração** (faz parte do plano §1) e completar a integração no pipeline em issue separada (B10).

### 🟠 2. Mudança estrutural no `package.json` sem aviso

`apps/web/package.json` mudou de `"@kabemjunto/shared": "workspace:*"` para `"file:../../packages/shared"`. Isso tira o protocol de monorepo e pode quebrar o install.

**Ação do Mavis:** reverter. Codex não deve tocar em `package.json` sem aprovação do Mavis (lock estrito + ADR-003).

### 🟡 3. Tipo de evento `server:mao:atualizada` não estava no shared

Codex adicionou o evento direto em `apps/server/src/socket.ts` mas o tipo canônico vive em `packages/shared/src/types/socket-events.ts` (escopo Mavis).

**Ação do Mavis:** reverter o socket.ts, adicionar `ServerMaoAtualizadaEvent` + entrada no `SocketEventMap` no shared (commit junto com esta feedback).

### 🟡 4. Bug em `App.tsx`: `online.state.mao` não existe

O `useGameSocket` hook **não escuta** o evento `server:mao:atualizada` (não está no `ServerEvents` do hook). Então mesmo com o servidor enviando, o cliente nunca popula `state.mao`, e o `.map()` quebra em runtime.

**Ação:** Codex precisa:

1. Adicionar `'server:mao:atualizada': (payload: ServerMaoAtualizadaEvent) => void` ao `ServerEvents` type do hook
2. Escutar o evento no `useEffect`: `setState((current) => ({ ...current, mao: payload.mao }))`
3. Garantir que o `SocketGameState` tem `mao?: ReadonlyArray<Carta>`

## Pendência pro Codex (B9 + B13)

- [ ] Adicionar `server:mao:atualizada` ao `ServerEvents` do `socketClient.ts` e popular `state.mao`
- [ ] Atualizar `apps/web/src/main.tsx` pra importar `App` e `styles.css` (desfazer o revert do Mavis)
- [ ] Atualizar `vite.config.ts` raiz pra buildar `apps/web/` (com cuidado — mudança estrutural, pedir OK ao Mavis)
- [ ] Decidir destino do `src/` raiz (manter legacy ou deletar) — alinhamento com M15 (Mavis)

## O que Mavis fez nesta review

1. ✅ Leu todos os 3 arquivos novos (App.tsx, styles.css, socketClient.ts)
2. ✅ Leu o diff do `apps/server/src/socket.ts` modificado
3. ✅ Reverteu: `apps/web/src/main.tsx`, `apps/web/package.json`, `apps/server/src/socket.ts`
4. ✅ Adicionou `ServerMaoAtualizadaEvent` no shared (escopo Mavis)
5. ✅ Criou esta feedback + `AGENTS.md` + `agents/*.md` + `briefings/sprint-3.md`
6. ✅ Atualizou `.gitignore` (tsbuildinfo + lockfiles de sub-projetos)
7. ⏳ Vai commitar tudo em 1-2 commits e pushar

## Lição

Quando o agente precisa trabalhar em diretório que **não está no pipeline de validação**, ele tem que avisar Mavis antes — não começar em silêncio. Isso é exatamente o que o `AGENTS.md` (criado nesta review) documenta agora: **mudança estrutural exige aprovação do Mavis antes do PR**.
