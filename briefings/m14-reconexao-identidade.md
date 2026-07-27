# M14 — Identidade estável de jogador (Reconexão sem perder o estado)

> **Spec técnica escrita por Mavis (gerente/dono do motor).**
> Resolve o bloqueio identificado pelo Codex: o backend usava `socket.id` como `jogadorId`, então reconexão criava jogador novo.

**Status:** ⏳ Em progresso
**Issue origem:** dependência de B13 (Codex) — ver `briefings/sprint-3.md`
**Pré-requisito:** Sprint 2 fechada (✅ M12 snapshot, M13 telemetria), Sprint 3 B9/B10 entregues (✅)
**Bloqueia:** B13 (Codex — Reconnect handler)

---

## Problema

O backend (`apps/server/src/room-store.ts`) usa `socket.id` como `jogadorId`. Socket.IO gera um `socket.id` novo a cada conexão, então:

1. Cliente A entra na sala, recebe `socket.id = "abc123"`, é registrado como jogador `abc123`
2. Cliente A perde a conexão (Wi-Fi caiu, fechou a aba sem querer, etc.)
3. Socket.IO fecha o socket, dispara `disconnect` no servidor
4. Cliente A reabre, novo socket é criado com `socket.id = "xyz789"`
5. Cliente A re-emite `client:entrar:sala`
6. Servidor cria um jogador NOVO `xyz789`, **não restaura o `abc123`**

Resultado: mão perdida, pontos zerados, posição na mesa perdida. **Inaceitável pra um jogo competitivo.**

## Solução: token de sessão por jogador

Cada jogador recebe um `jogadorId` **independente do socket**, gerado na primeira entrada e persistido no cliente. O servidor mantém o mapeamento `jogadorId → socketId` (atualizado a cada reconnect).

### Fluxo normal (1ª entrada)

1. Cliente abre o app, `sessionStorage` vazio
2. Cliente preenche lobby, clica "Entrar"
3. **Cliente gera um UUID v4** (`crypto.randomUUID()`) — esse é o `jogadorId` dele
4. Cliente salva `{ jogadorId, salaId, nome }` no `sessionStorage`
5. Cliente emite `client:entrar:sala { jogadorId, salaId, nome }`
6. Servidor vê `jogadorId` novo → cria jogador com esse ID
7. Servidor mapeia `jogadorId → socketId` no `RoomSession`
8. Servidor responde `server:estado:atualizado` + `server:mao:atualizada` (privado)

### Fluxo de reconexão

1. Cliente A está na sala, `sessionStorage` tem `{ jogadorId: "uuid-A", salaId: "SALA1", nome: "Ana" }`
2. Wi-Fi cai, `disconnect` é disparado
3. Socket.IO fecha o socket, mas o `jogadorId` continua salvo no `sessionStorage`
4. UI mostra modal "Reconectando..." (componente do Antigravity, ✅)
5. Socket.IO reconecta automaticamente (configurado no `socketClient.ts`)
6. Ao reconectar, evento `connect` dispara, `socketClient` re-emite `client:entrar:sala { jogadorId: "uuid-A", salaId: "SALA1", nome: "Ana" }`
7. Servidor vê `jogadorId` existente (uuid-A) → **NÃO cria jogador novo**
8. Servidor atualiza o mapeamento `jogadorId → socketId` (novo socket)
9. Servidor marca o jogador como `conectado: true`
10. Servidor reenvia `server:estado:atualizado` (broadcast) + `server:mao:atualizada` (privado, pro novo socket)
11. UI atualiza, jogador volta a jogar de onde parou

### Casos de borda cobertos

| Cenário                                                             | Comportamento esperado                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Cliente entra 2x com nomes diferentes, mesmo `jogadorId`            | Servidor usa o **nome salvo no servidor** (não aceita o novo) — anti-impersonation |
| Cliente entra 2x com mesmo `jogadorId` e mesmo nome                 | OK, atualiza socket                                                                |
| Cliente entra em sala diferente com mesmo `jogadorId`               | ERRO: jogador está em outra sala. Servidor retorna `JOGADOR_EM_OUTRA_SALA`         |
| Cliente perde conexão, sala é fechada no servidor, depois reconecta | ERRO: `SALA_INEXISTENTE`. Cliente limpa `sessionStorage`                           |
| Cliente abre 2 abas com mesmo `jogadorId` (mesma sessão)            | Servidor aceita a 2ª como reconexão (1 sessão = 1 jogador)                         |
| Cliente abre 2 abas com `jogadorId`s diferentes, mesmo nome         | 2 jogadores distintos (OK, é o comportamento hotseat)                              |

---

## Mudanças por arquivo

### 1. `packages/shared/src/types/player.ts`

Adicionar interface `SessaoJogador`:

```ts
/**
 * Identidade persistente de um jogador, independente do socket.
 * Gerada na primeira entrada e persistida no cliente.
 * Permite reconexão sem perder estado.
 */
export interface SessaoJogador {
  /** UUID v4, gerado pelo cliente via crypto.randomUUID(). */
  jogadorId: JogadorId;
  /** Sala atual. */
  salaId: string;
  /** Nome de exibição. */
  nome: string;
}
```

### 2. `packages/shared/src/types/socket-events.ts`

Atualizar `ClientEntrarSalaEvent`:

```ts
/** Jogador está entrando em uma sala. */
export interface ClientEntrarSalaEvent {
  /** Identidade estável do jogador (UUID v4). Persistida no cliente. */
  jogadorId: string;
  salaId: string;
  nome: string;
}
```

Adicionar novo código de erro em `ServerErroEvent.codigo`:

```ts
| 'JOGADOR_EM_OUTRA_SALA'
```

### 3. `apps/server/src/room-store.ts`

- `JoinRoomInput` agora aceita `jogadorId: string` (em vez de derivar de `socketId`)
- `RoomSession` mantém:
  - `jogadores: Map<JogadorId, JogadorPublico>` (lookup por identidade estável)
  - `socketByPlayer: Map<JogadorId, string>` (mapeia identidade → socket atual)
- `join()`:
  - Se `jogadorId` já existe em OUTRA sala → throw `JOGADOR_EM_OUTRA_SALA`
  - Se `jogadorId` já existe NESTA sala → atualiza socket + `conectado: true`, mantém nome/avatar
  - Se `jogadorId` é novo → cria jogador
- `disconnect()` agora SÓ marca `conectado: false`, **não remove** o jogador
- Novo método `getByJogadorId(jogadorId, salaId): RoomSession | undefined` (helper)

### 4. `apps/server/src/socket.ts`

- Handler `client:entrar:sala` agora usa `payload.jogadorId` (não `socket.id`)
- Ao entrar, broadcast `server:sala:atualizada` (mostra `conectado: true`)
- Ao entrar, envia `server:mao:atualizada` privado pro socket
- Handler `disconnect` chama `store.disconnect(socket.id)` (procura pelo socket → jogadorId)

### 5. `apps/web/src/services/socketClient.ts`

- `SessionCredentials` agora tem `jogadorId: string`
- `readSession()` lê o sessionStorage e exige `jogadorId` (gera novo se faltar — fallback)
- `saveSession()` persiste `jogadorId` junto
- Helper `ensureJogadorId()`: se não tem, gera via `crypto.randomUUID()`

### 6. Testes

Adicionar em `apps/server/src/room-store.test.ts`:

- ✅ Mesmo `jogadorId` entrando 2x restaura (não duplica)
- ✅ `jogadorId` em sala diferente retorna `JOGADOR_EM_OUTRA_SALA`
- ✅ `disconnect` não remove o jogador, só marca `conectado: false`
- ✅ Reconexão: 2x entrar com mesmo `jogadorId`, depois `disconnect`, depois 3ª entrada → mesmo jogador

Adicionar em `apps/web/src/services/socketClient.test.ts` (novo):

- ✅ `readSession` gera `jogadorId` novo se faltar
- ✅ `saveSession` persiste os 3 campos
- ✅ UUID é válido (formato v4)

---

## Definição de pronto

- [ ] Servidor aceita `jogadorId` no `client:entrar:sala`
- [ ] Servidor rejeita `jogadorId` em sala diferente (`JOGADOR_EM_OUTRA_SALA`)
- [ ] Servidor restaura jogador existente quando mesmo `jogadorId` entra de novo
- [ ] Servidor envia `server:mao:atualizada` ao entrar (privado, pro socket)
- [ ] Cliente gera UUID v4 via `crypto.randomUUID()` se `sessionStorage` vazio
- [ ] Cliente persiste `{jogadorId, salaId, nome}` no `sessionStorage`
- [ ] Cliente re-emite `client:entrar:sala` com mesmo `jogadorId` ao reconectar
- [ ] Testes de RoomStore cobrem 2 jogadores, 1 desconecta, 1 fica, reconexão
- [ ] `npm run validate` verde
- [ ] `briefings/sprint-3.md` atualizado: M14 ✅

## Fora de escopo (vai pra Sprint 4)

- Autenticação real (login/senha, OAuth)
- Token JWT assinado (agora o `jogadorId` é "confiança no cliente" — bom pra MVP, ruim pra anti-cheat sério)
- Persistência do `jogadorId` em cookie (só sessionStorage por enquanto)
- Validação de `jogadorId` no formato UUID no servidor (cliente pode mandar qualquer string)

## Compatibilidade com B9/B10/B12 (Codex)

O `apps/web/src/services/socketClient.ts` atual do Codex já tem `SessionCredentials = { salaId, nome }`. Vai precisar adicionar `jogadorId`. Mudança pequena (1 type, 1 helper). Vou commitar os 2 juntos (M14) pra evitar estado quebrado.
