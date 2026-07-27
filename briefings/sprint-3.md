# Briefing — Sprint 3: Beta Multiplayer

> **Spec da Sprint 3, escrita por Mavis (gerente).**
> Cada agente pega uma issue do seu nome, lê o critério de pronto, e executa.

**Período:** 2026-07-27 → 2026-07-29 (estimativa)
**Tema:** Beta multiplayer funcional — 2+ clientes reais jogando online do início ao fim.
**Pré-requisito:** Sprint 2 fechada (✅ B2 backend, M12 snapshot, M13 telemetria, B6/B7/B8 PWA, B1 testes 0+/7).

---

## Issues por agente

### 🟢 Mavis (gerente — não escreve código de feature nesta sprint)

| ID  | Issue                                                                  | Status          | Spec                                                                     |
| --- | ---------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| M14 | Identidade estável de jogador (reconexão)                              | 🔄 Em progresso | [`briefings/m14-reconexao-identidade.md`](./m14-reconexao-identidade.md) |
| M15 | Decidir destino do `src/` raiz (manter legacy ou deletar pós-migração) | ⏳ A fazer      | —                                                                        |

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

- [ ] 2 clientes reais (2 abas do navegador) entram na mesma sala e iniciam partida
- [ ] Cartas jogadas via socket aparecem pra todos os jogadores
- [ ] Desconectar 1 cliente no meio e reconectar mantém a partida inteira
- [ ] Lobby online mostra lista de jogadores atualizada em tempo real
- [ ] `npm run validate` verde (150+ testes, 0 erros TS/ESLint, Prettier conforme)
- [ ] `apps/web/src/App.tsx` é o app oficial (substitui `src/App.tsx` raiz)
- [ ] Nenhum arquivo em `packages/shared/src/rules/**` foi tocado por Codex/Antigravity
- [ ] Telemetria loga eventos `RECONECTADO` quando aplicável
- [ ] Documentação atualizada (CHANGELOG, DECISIONS, STATUS)

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
