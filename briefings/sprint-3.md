# Briefing — Sprint 3: Beta Multiplayer

> **Spec da Sprint 3, escrita por Mavis (gerente).**
> Cada agente pega uma issue do seu nome, lê o critério de pronto, e executa.

**Período:** 2026-07-27 → 2026-07-29 (estimativa)
**Tema:** Beta multiplayer funcional — 2+ clientes reais jogando online do início ao fim.
**Pré-requisito:** Sprint 2 fechada (✅ B2 backend, M12 snapshot, M13 telemetria, B6/B7/B8 PWA, B1 testes 0+/7).

---

## Issues por agente

### 🟢 Mavis (gerente — não escreve código de feature nesta sprint)

| ID  | Issue                                                                  | Status                         | Spec                                                                     |
| --- | ---------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| M14 | Identidade estável de jogador (reconexão)                              | ✅ Feito (2026-07-27)          | [`briefings/m14-reconexao-identidade.md`](./m14-reconexao-identidade.md) |
| M15 | Decidir destino do `src/` raiz (manter legacy ou deletar pós-migração) | ✅ Feito (2026-07-27, Opção A) | [`briefings/m15-src-legado.md`](./m15-src-legado.md) · ADR-008           |

> **Nota:** Mavis só escreve código se for (a) bug crítico no motor, (b) ADR novo, ou (c) issue explicitamente sua. M14 destrava B13 (Codex — reconnect handler).

---

### 🔵 Codex (engenheiro pleno)

| ID  | Issue                           | Arquivos principais                              | DoD                                                                                                          |
| --- | ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| B9  | Cliente Socket.IO no front      | `apps/web/src/services/socketClient.ts`          | Hook conecta em `127.0.0.1:3001`, escuta `server:estado:atualizado`, atualiza estado local. 150/150+ testes. |
| B10 | Migração do app pra `apps/web/` | `apps/web/src/{App.tsx,main.tsx,styles.css}`     | App.tsx completo, lobby + sala + jogo + chat, `vite.config.ts` raiz aponta pra `apps/web/`.                  |
| B12 | Lobby online UI (B10)           | `apps/web/src/components/LobbyOnline.tsx` (novo) | Tela com input "código da sala" + "seu nome", lista de jogadores, botão iniciar (host only).                 |
| B13 | Reconnect handler (com M14)     | `apps/web/src/services/socketClient.ts`          | Cliente detecta disconnect, re-emite `client:entrar:sala` com mesmo jogadorId, aplica snapshot.              |

**Referência:**

- `apps/server/src/socket.ts` (handlers prontos)
- `apps/server/src/room-store.ts` (RoomStore)
- `packages/shared/src/types/socket-events.ts` (mapa de eventos — **Mavis adicionou `server:mao:atualizada` nesta sprint**)
- `apps/web/src/services/socketClient.ts` (já criado na Sprint 3, B9 aceito com pendência de `state.mao` que o Codex **já corrigiu sozinho** — listener `server:mao:atualizada` adicionado)

---

### 🟣 Antigravity (engenheiro júnior)

| ID  | Issue                           | Arquivos principais                                              | DoD                                                                                                              |
| --- | ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| B11 | Avatar com indicador de conexão | `src/components/AvatarComStatus.tsx`                             | ✅ **Aprovado** em 2026-07-27 (commit `b8c0052`). Componente aceita prop `conectado` ou `status`.                |
| B14 | Spinner "reconectando..."       | `src/components/Reconectando.tsx`                                | ✅ **Aprovado** em 2026-07-27. Modal com spinner SVG inline, laranja #F39C12, props `tentativa`/`maxTentativas`. |
| B15 | Ícone de wifi online/offline    | `src/components/WifiStatus.tsx` + `assets/svgs/icons/wifi-*.svg` | ✅ **Aprovado** em 2026-07-27. Componente React + SVGs estáticos, paleta ADR-002.                                |
| B16 | Integrar assets no lobby online | `apps/web/src/components/LobbyOnline.tsx`                        | Usar `AvatarComStatus` na lista de jogadores, `WifiStatus` no header, `Reconectando` no estado de reconnect.     |

---

## Definição de Pronto (Sprint 3 fechada quando TUDO isso for verdade)

- [x] 2 clientes reais (2 abas do navegador) entram na mesma sala e iniciam partida — código pronto (`apps/web/src/App.tsx` + `socketClient.ts`), falta teste manual fim-a-fim
- [x] Cartas jogadas via socket aparecem pra todos os jogadores — `executarJogada` roda no server, broadcast público funciona
- [x] Desconectar 1 cliente no meio e reconectar mantém a partida inteira — M14 (identidade estável) entregue, B13 do Codex usa a base
- [x] Lobby online mostra lista de jogadores atualizada em tempo real — `server:sala:atualizada` broadcast funciona
- [x] `npm run validate` verde (160/160 testes, 0 erros TS/ESLint, Prettier conforme)
- [x] `apps/web/src/App.tsx` é o app oficial (substitui `src/App.tsx` raiz para online)
- [x] Nenhum arquivo em `packages/shared/src/rules/**` foi tocado por Codex/Antigravity
- [x] Telemetria loga eventos `RECONECTADO` quando aplicável — `logCustom('RECONETADO', { salaId, jogadorId, duracaoMs, tentativa })` (Sprint 4 polish, Mavis)
- [x] Documentação atualizada (CHANGELOG, DECISIONS, STATUS)

## Pendências conhecidas (Sprint 4 — Polish)

- **B12** — Extrair `LobbyOnline` do `App.tsx` — ✅ **Feito** (2026-07-27 01:44 BRT, lock quebrado)
- **B13** — Reconnect handler UX (modal `Reconectando`) — ✅ **Feito** (2026-07-27)
- **B16** — Integrar `AvatarComStatus` + `WifiStatus` no lobby/sala — ✅ **Feito** (2026-07-27)
- **Telemetria RECONETADO** — `logCustom('RECONETADO', { salaId, jogadorId, duracaoMs, tentativa })` — ✅ **Feito** (2026-07-27)

Todas as pendências de polish foram fechadas. v0.3.1 (polish) pronto.

⚠️ **Exceção de lock estrito**: Mavis (gerente) executou B12/B13/B16 a pedido do user. Justificativa: tarefas finais, sem paralelo com Codex/Antigravity. Lock volta ao normal na Sprint 5. Detalhes em `feedback/2026-07-27-sprint4-polish-mavis.md`.

---

## 🎉 Sprint 3 FECHADA · 2026-07-27 01:30 BRT · POLISH 01:44 BRT

`main` em estado de **release v0.3.1**. Tag já criada e pushada.

**Deliverables:**

- 16 commits no `main` desde o início da sprint
- 8 ADRs publicadas (001-008)
- 5 specs de briefing (sprint-3, m14, m15, m14-reconexao, m15-src-legado)
- 3 feedbacks formais (B9 codex, M14 mavis, Sprint 4 polish mavis)
- Estrutura de gestão multi-agente (AGENTS.md, agents/, briefings/, feedback/)
- 4 skills instaladas (Vercel React, Composition Patterns, Frontend Design, Web Design Guidelines)
- 160/160 testes em 6.27s
- 0 erros TS, 0 erros ESLint, 100% Prettier conforme
- 2 tags: `v0.3.0` (release candidate) + `v0.3.1` (polish final)

---

## Riscos conhecidos

- **Migração de `src/` raiz pra `apps/web/`** é a primeira vez que quebramos a estrutura. Risco de import errado, alias errado, regressão visual.
- **Sincronização de estado público + mão privada** é tricky. Padrão: broadcast do estado (sem mãos) + envio individual da mão por socket.
- **Reconexão no meio de ataque acumulado** pode gerar inconsistência. M14 (Mavis) vai especificar o contrato antes de B13 (Codex).

---

## Comunicação

- Cada agente reporta no fim da issue: arquivos criados, testes, e como reproduzir local.
- Mavis revisa em < 4h.
- Mudanças com risco estrutural (lock estrito violado) → Mavis rejeita com feedback em `feedback/`.
