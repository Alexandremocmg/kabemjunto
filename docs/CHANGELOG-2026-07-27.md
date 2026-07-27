# Diário de mudanças — 2026-07-27

## Escopo do dia

Este documento consolida as alterações realizadas no Kabemjunto em 27/07/2026, desde a consolidação do app web em `apps/web/` até a estabilização do multiplayer Online via túnel público.

## Entregas por frente

### Arquitetura e organização

- Consolidação do app executável em `apps/web/`, encerrando o uso operacional do dual app.
- Remoção de configurações legadas da raiz que apontavam para o app antigo.
- Registro das decisões ADR-008 e ADR-009 sobre dual app e consolidação.
- Estrutura de gestão multiagente com `AGENTS.md`, perfis, briefings e feedbacks.
- Documento de handover de Mavis documentando a transição de responsabilidade de revisão/gestão, sem criar uma nova ADR numerada.

### Multiplayer autoritativo

- Identidade estável por `jogadorId`, persistida e restaurada durante reconexões.
- Servidor Fastify + Socket.IO com `RoomStore` em memória.
- Validação de jogadas, compras, chat e ações especiais no servidor usando o motor compartilhado.
- Mão privada enviada somente ao socket do jogador correspondente.
- Estado público sem exposição das cartas privadas.
- Reconexão sem remoção do jogador da sala.
- Preservação do host durante reconexões.
- Suporte autoritativo para `Troca Mão`, incluindo seleção de alvo.
- Diferenciação entre criar uma sala e entrar em uma sala existente.
- Código inexistente retorna `SALA_INEXISTENTE` e exibe o estado `NotFound`, em vez de criar sala silenciosamente.

### UI Local e eventos de partida

- Mesa Local mobile-first com núcleo, monte, descarte, assentos, status e mão.
- Persistência do modo e do estado da partida durante reload da sessão.
- Lobby Local, fluxo de vitória e retorno ao lobby.
- Painel de coleção/customização local.
- Expiração automática de overlays de eventos.
- Eventos visuais e feedbacks para silêncio, ataque, `0+`, troca de mão e vitória.
- `Troca Mão` com seleção de alvo sem permitir selecionar o próprio jogador.

### UI Online e mobile

- Mesa Online alinhada à hierarquia visual mobile-first.
- Seleção de cartas em dois toques.
- Escolha de cor para cartas neutras/coringas.
- Feedback de jogada aceita/rejeitada com `role="status"` e `role="alert"`.
- Estados `Conectando`, `Online`, `Reconectando` e `Offline`.
- Assento local fixado visualmente na borda inferior, próximo à mão.
- Assentos distribuídos em anel elíptico responsivo.
- Ordem visual alinhada ao sentido do motor e rotação Online baseada no jogador local.
- Suporte visual Local e Online para 2–10 jogadores.
- Correção do limite acidental que renderizava somente quatro jogadores.
- Validação mobile em `390x844` sem overflow horizontal.
- Código da sala com botão de copiar, feedback de sucesso e fallback para browsers sem Clipboard API.
- Nome do jogador persistido em `localStorage`.
- Validação de nome obrigatório e código de sala entre 4 e 6 caracteres.
- Mensagens de validação associadas aos campos com `aria-live`.

### Rede, túnel e desenvolvimento

- Socket.IO usa `VITE_SOCKET_URL` quando configurado.
- Sem configuração explícita, Socket.IO usa a origem atual da aplicação.
- Vite encaminha `/socket.io` para `http://127.0.0.1:3001`, incluindo WebSocket.
- O comando raiz `npm run dev` passou a iniciar backend e frontend juntos.
- Adicionados `npm run dev:server` e `npm run dev:web` para execução individual.
- Criado `scripts/dev-all.mjs` com supervisão dos processos e compatibilidade Windows.
- Documentado o comando Cloudflare com `--http-host-header localhost:5173`.
- Corrigido o uso indevido do fallback `127.0.0.1` em browsers externos.
- Investigado e encerrado o preview antigo que ocupava a porta `5173` e servia bundle desatualizado.

### Qualidade e automação

- CI com quality gates e job Playwright E2E.
- Testes E2E cobrindo entrada de dois clientes, início da partida, reload, mesa Local com 10 jogadores, sala inexistente, proxy Socket.IO e acessibilidade do lobby.
- Meta tags PWA/SEO conferidas: manifest, theme color, viewport seguro, Apple touch icon e descrição.
- Documentação de operação atualizada no `README.md`, `STATUS.md` e `CHANGELOG.md`.

## Histórico Git do dia

Commits de produto e documentação realizados em 27/07/2026:

```text
6d8cb95 fix(dev): start full online stack and harden lobby UX
d41b9e9 fix(web): proxy socket connection for public tunnels
7f9d2ac feat(phase5): complete online session and lobby flow
616200e fix(table): align seats with turn order and support ten players
d06f1dd feat(online): align multiplayer table with mobile UX
9cf8620 fix(local): select target for hand swap
c3349a6 fix(local): keep player seat and session state
ffdaa70 fix(ui): expire game event overlays
9cd7660 feat(ui): add local collection customization
9025bfe feat(ui): add local lobby and victory flow
a0fcc01 feat(ui): complete phase 2 game events
c033260 feat(ui): implement phase 1 mobile game table
0f05650 fix: preserve room host identity across reconnects
61b0a00 chore: allow explicit tunnel host in vite dev server
abe0a18 feat: add accessible hand swap target picker
86e11d6 feat: implement hand swap across authoritative multiplayer
e9a0c6f fix: restore production build quality gates
e3405c8 fix(B18): valida reconexao e isola ambiente e2e
546568e ci: M19 — adiciona job E2E no CI + badges no README
a9b4656 feat(telemetry): B17 — substitui consoleSink por posthogSink
5038915 test(B18): adiciona cobertura e2e do multiplayer
dccd8fa chore: deleta configs legados da raiz
94252e4 docs: ADR-009 e STATUS atualizado
cb4b963 refactor(M16): consolida dual app em apps/web/
35bfa6f docs: Sprint 5 detalhada
cfa414b docs: cria briefing Sprint 5
1bbec23 docs(sprint-3): fecha Sprint 3 com polish
2fa7e46 polish: B12/B13/B16 + telemetria RECONETADO
e2a9395 release: v0.3.0 — Sprint 3 fechada
24f169a feat(server): extrai buildServer() para testes de integração
62a4cc7 docs: CHANGELOG Sprint 1+2, ADR-005 e ADR-006
```

Também foram preservados no working tree, vindos do colega, o complemento de `DECISIONS.md` e `briefings/handover-mavis.md`.

## Estado final verificado

```text
npm run validate  ✅
171 testes Vitest ✅
6/6 cenários E2E ✅
produção Vite build ✅
backend /health 200 ✅
proxy /socket.io 200 ✅
frontend 5173 200 ✅
```

Cobertura observada no motor compartilhado: aproximadamente 89%.

## Como executar atualmente

```bash
npm install
npm run dev
```

O comando inicia:

- backend em `http://localhost:3001`;
- frontend em `http://localhost:5173`.

Para expor o frontend via Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:5173 --http-host-header localhost:5173
```

Para frontend/backend em origens distintas, configurar `VITE_SOCKET_URL` antes do build.

## Fora do escopo do dia

- Persistência de salas em banco de dados.
- Redis para escalabilidade horizontal.
- Autenticação formal de contas.
- Ranking, pontuação cumulativa e partidas em rodadas.
- Deploy permanente com domínio próprio.
