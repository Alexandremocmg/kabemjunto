# 🃏 Kabemjunto

> **O jogo de cartas que te denuncia.** · 2 a 10 jogadores · 8 a 15 minutos por partida.

Kabemjunto é um jogo de cartas digital inspirado no UNO, mas com três camadas estratégicas próprias: a **regra do 7** (silêncio social), o **acúmulo assimétrico de ataques** (+2 sobre +4 é proibido) e a carta **0+ (Zero Mais)** que reflete ataques para o último atacante. Tematização brasileira, party game com 109 cartas (ADR-013), mesa 3D, partida contra bots e multiplayer online.

[![CI](https://github.com/Alexandremocmg/kabemjunto/actions/workflows/ci.yml/badge.svg)](https://github.com/Alexandremocmg/kabemjunto/actions/workflows/ci.yml)
[![Release v0.3.1](https://img.shields.io/badge/release-v0.3.1-success)](https://github.com/Alexandremocmg/kabemjunto/releases/tag/v0.3.1)
![Tests: 437 unit + 44 E2E](https://img.shields.io/badge/tests-437%20unit%20%2B%2044%20E2E-success)
![TS: strict](https://img.shields.io/badge/TypeScript-strict-blue)
![Lint: clean](https://img.shields.io/badge/lint-clean-success)
![Coverage: ≥80%](https://img.shields.io/badge/coverage-%E2%89%A580%25-success)

---

## 📚 Documentação

- **[GDD — Game Design Document](./GDD-Kabemjunto.md)** — documento mestre do jogo
- **[PLANO-EQUIPE-3DEVS.md](./PLANO-EQUIPE-3DEVS.md)** — plano de desenvolvimento multi-agente
- **[STATUS.md](./STATUS.md)** — caderno de comunicação do time (atualizado diariamente)
- **[Diário de mudanças de 2026-07-27](./docs/CHANGELOG-2026-07-27.md)** — consolidação completa das entregas, commits e validações
- **[Handover de Mavis](./briefings/handover-mavis.md)** — contexto operacional para o próximo gerente/revisor
- **[DECISIONS.md](./DECISIONS.md)** — ADRs (decisões arquiteturais)
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — como contribuir

---

## 🎴 Como jogar (TL;DR)

- Cada jogador começa com **7 cartas**. O objetivo: descartar todas.
- Na sua vez, jogue **1 carta** que combine com o topo (mesma cor, número ou ação).
- Sem carta válida? Compre 1 do monte (e pode jogar de imediato se for válida).
- Ações coloridas: **Pula** (próximo perde a vez), **Inverte**, **+2**.
- Coringas: **Coringa** (muda cor), **+4** (compra 4 e muda cor), **0+** (reflete o ataque!), **Troca Mão**, **Gira Mão**.
- Regra do **7**: jogou 7 = silêncio até a próxima carta. Quem falar paga +2.
- **Corta-Frente**: com uma carta idêntica ao descarte, você pode jogá-la fora da vez antes do tempo acabar.

### Na mesa

- **Arraste uma carta que brilha até o centro** para jogar. Também vale tocar na carta e tocar de novo.
- Cartas de mesma face: toque nelas para juntar e jogue o grupo de uma vez (descarte múltiplo).
- Nenhuma carta serve? Toque no monte.
- Coringas abrem um anel de cores; a Troca Mão pede o adversário e depois a cor.
- Teclado: `Tab` chega à mão, setas trocam de carta, `Enter` joga, `Espaço` seleciona.
- Na primeira partida, dicas curtas explicam cada regra quando ela aparece.
- Sem WebGL (ou com `?mesa=2d`), a mesma mesa aparece em 2D simples, com as mesmas regras.

Detalhes completos em [`GDD-Kabemjunto.md §7`](./GDD-Kabemjunto.md#7-regras-oficiais-canônicas-resumo).

---

## 🚀 Quick start

### Pré-requisitos

- **Node.js** >= 20
- **npm** >= 10 (ou pnpm/yarn, mas o time usa npm por enquanto)

### Setup

```bash
# 1. Clone o repo
git clone <url-do-repo> kabemjunto
cd kabemjunto

# 2. Instale as dependências
npm install

# 3. Rode os testes (opcional, mas recomendado — todos devem passar)
npm test

# 4. Inicie o dev server
npm run dev
# → inicia backend (http://localhost:3001) e frontend (http://localhost:5173)
# → abre em http://localhost:5173
```

### Exposição pública / túnel

O frontend usa o mesmo host da aplicação como endpoint padrão do Socket.IO. O Vite encaminha `/socket.io` para `http://127.0.0.1:3001`, incluindo WebSocket.

Para publicar frontend e backend em origens separadas, defina `VITE_SOCKET_URL` **antes do build**:

```bash
VITE_SOCKET_URL=https://seu-backend.example.com npm run build
```

Para um túnel Cloudflare apontando para o frontend local:

```bash
cloudflared tunnel --url http://127.0.0.1:5173 --http-host-header localhost:5173
```

Não use `127.0.0.1` ou `localhost` como `VITE_SOCKET_URL` em um link acessado por outro dispositivo: esses endereços apontam para o dispositivo do jogador.

### Validação completa (CI local)

```bash
npm run validate
# → Roda: typecheck + lint + format:check + test + build
```

---

## 🐳 Deploy com Docker

A imagem é única: Fastify + Socket.IO servem o frontend estático (`apps/web/dist`) no mesmo origin/porta. Multi-stage, executa como usuário não-root.

```bash
# Build local
docker build -t kabemjunto .

# Run local (produção exige CORS_ORIGINS e METRICS_TOKEN — ver abaixo)
docker run -d --name kabemjunto \
  -p 3001:3001 \
  -v kabemjunto-data:/data \
  -e CORS_ORIGINS=https://seu-dominio.example.com \
  -e METRICS_TOKEN=<segredo-com-16+-caracteres> \
  kabemjunto
```

### Variáveis de ambiente

| Variável                 | Obrigatória em produção | Descrição                                                                                                     |
| ------------------------ | :---------------------: | ------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`               |            —            | `development` \| `test` \| `production`. Falha cedo se inválida.                                              |
| `PORT` / `HOST`          |            —            | Padrão `3001` / `0.0.0.0`.                                                                                    |
| `ROOM_STORAGE_FILE`      |       recomendada       | Caminho do snapshot JSON em volume persistente (ex.: `/data/rooms.json`). Sem ela, salas ficam só em memória. |
| `CORS_ORIGINS`           |           ✅            | Lista de origens separadas por vírgula. Sem `Origin` (health/probes) sempre passa.                            |
| `METRICS_TOKEN`          |           ✅            | Bearer token (16+ caracteres) que protege `/metrics`.                                                         |
| `KABEMJUNTO_E2E_FIXTURE` |            —            | Nunca liga em produção, mesmo setada — só afeta ambiente de teste/dev.                                        |

### Endpoints operacionais

- `GET /live` — processo vivo.
- `GET /ready` — 200 só depois que o storage carrega e um probe não destrutivo confirma que o volume `/data` continua gravável.
- `GET /metrics` — formato Prometheus; exige `Authorization: Bearer <METRICS_TOKEN>` em produção.

### Volume persistente

O container declara `VOLUME ["/data"]`. Monte um volume real nesse caminho e aponte `ROOM_STORAGE_FILE=/data/rooms.json` — sem isso, um restart do container perde todas as salas. Restart com volume montado foi validado manualmente: sala criada antes do restart continua presente depois (jogadores voltam como `conectado: false` até reconectar pelo `resumeToken`).

O schema atual do snapshot é **v3**. O servidor lê v2 sem alterar o arquivo no `load` e grava v3 no próximo `save`; v3 adiciona `MONTE_ESGOTADO` ao histórico. Antes de atualizar uma instalação com snapshot v2, faça backup operacional do arquivo: rollback para um binário v2 requer essa cópia anterior à primeira gravação v3. Não rotule o evento novo como v2.

### Deploy no Railway

`railway.json` aponta para o `Dockerfile` e configura o healthcheck em `/live`. O projeto/volume/segredos (`METRICS_TOKEN`, `CORS_ORIGINS`, domínio) são provisionados diretamente no provedor — nenhum segredo fica no repositório.

#### Regra operacional: GitHub não publica Railway automaticamente

Neste projeto, **um `git push origin main` não cria um deploy Railway por si só**: não há workflow de deploy no GitHub Actions nem source/autodeploy Railway conectado. Antes de dizer que uma alteração está pública, confira o deployment ativo e compare os assets servidos pelo domínio com os assets produzidos no build.

> Um deploy de `production` altera o serviço ativo e pode consumir o plano do provedor. Faça-o somente após autorização explícita do proprietário.

Depois de um commit aprovado e enviado, publique no serviço já vinculado:

```bash
railway status
railway up --service web --environment production --ci \
  --message "deploy <sha-curto>: <resumo>"
```

O comando deve terminar com `Deploy complete`. Em seguida, confirme **todos** os itens abaixo no domínio permanente, substituindo `PROD` pela URL Railway:

```bash
PROD='https://web-production-52c52.up.railway.app'

# O deployment/volume correto está online e os assets mudaram para o build novo.
railway status
curl -sS "$PROD/" | grep -Eo '/assets/index-[A-Za-z0-9_-]+\.(js|css)' | sort -u

# Processo, storage e serviço HTTP estão prontos.
curl -sS -w ' HTTP=%{http_code}\n' "$PROD/live"
curl -sS -w ' HTTP=%{http_code}\n' "$PROD/ready"
curl -sS -w ' HTTP=%{http_code}\n' "$PROD/health"

# Same-origin Socket.IO responde com frame Engine.IO e HTTP 200.
curl -sS -w '\nHTTP=%{http_code}\n' \
  "$PROD/socket.io/?EIO=4&transport=polling"
```

Por fim, faça smoke real no navegador público: criar sala com um cliente, entrar com outro, iniciar partida, validar reconexão/estado Online e confirmar a funcionalidade alterada. HTML 200 isolado não comprova que o deploy serve o frontend novo nem que Socket.IO está funcional.

---

## 🛠️ Scripts disponíveis

| Script                 | O que faz                                                               |
| ---------------------- | ----------------------------------------------------------------------- |
| `npm run dev`          | Sobe backend (http://localhost:3001) e frontend (http://localhost:5173) |
| `npm run build`        | Build de produção (shared + server + web)                               |
| `npm run preview`      | Serve o build de produção do frontend                                   |
| `npm run typecheck`    | TypeScript sem emitir (shared, server e web)                            |
| `npm test`             | Testes unitários e de componente (Vitest)                               |
| `npm run test:watch`   | Modo watch (TDD)                                                        |
| `npm run test:cov`     | Testes com cobertura                                                    |
| `npm run e2e`          | Testes E2E no navegador (Playwright: sobe server e web de teste)        |
| `npm run lint`         | ESLint em todo o projeto                                                |
| `npm run lint:fix`     | ESLint com auto-fix                                                     |
| `npm run format`       | Prettier write (formata tudo)                                           |
| `npm run format:check` | Prettier check (CI)                                                     |
| `npm run validate`     | Roda typecheck + lint + format:check + test + build (gate local/CI)     |

---

## 🏗️ Arquitetura

### Stack

| Camada       | Stack                                                                      |
| ------------ | -------------------------------------------------------------------------- |
| Frontend     | TypeScript (strict) + React 18 + Vite 5                                    |
| Mesa         | Three.js puro (3D, carregado sob demanda) + camada em DOM (acessível e 2D) |
| Estado       | Hooks do React; partida local na `sessionStorage`                          |
| Áudio        | Web Audio API (síntese em tempo real, sem assets)                          |
| Backend      | Node + Fastify 5 + Socket.IO (servidor autoritativo)                       |
| Persistência | Snapshot JSON atômico em volume, instância única (ADR-011)                 |
| Testes       | Vitest + fast-check (propriedades) + Playwright (E2E)                      |
| Lint/Format  | ESLint 9 + Prettier 3                                                      |
| CI / Deploy  | GitHub Actions; Docker + Railway (deploy manual)                           |

### Estrutura de pastas

```
.
├── apps/
│   ├── web/                      # Frontend React (Vite)
│   │   └── src/
│   │       ├── mesa/             # Mesa de jogo: 3D, 2D, interação, dicas, controladores
│   │       │   └── cena/         # Cena Three.js (texturas, geometria, animação)
│   │       ├── components/       # Lobby/menu, coleção, vitória, status de conexão
│   │       ├── services/         # Socket.IO, wrapper do motor, áudio, telemetria
│   │       └── App.tsx           # Menu → partida local ou sala online
│   └── server/                   # Fastify + Socket.IO (salas, retomada, persistência)
├── packages/
│   └── shared/                   # Fonte única de verdade
│       └── src/
│           ├── types/            # Tipos canônicos (Carta, EstadoPartida, Jogador, eventos)
│           ├── rules/            # Motor de regras PURO (sem I/O)
│           ├── constants/        # Baralho de 109 cartas, paleta de cores
│           └── fixtures/         # deck108.json (nome histórico)
├── e2e/                          # Playwright: menu, salas, mesa 3D local e online
├── assets/                       # SVGs, SFX
├── .github/                      # CI, templates de issue/PR
├── DECISIONS.md                  # ADRs (a mesa 3D é a ADR-014)
└── STATUS.md                     # Caderno do time
```

### Regra de ouro: **o motor é puro**

`packages/shared/src/rules/*` é **puro** — zero I/O, zero áudio, zero DOM, zero dependência de browser. Isso permite que:

1. **O servidor (Beta)** valide jogadas sem precisar de browser
2. **Os testes** rodem em 23ms e sejam determinísticos (com seed)
3. **O front** tenha um wrapper fino (`src/services/gameEngine.ts`) que toca áudio baseado no que o motor retorna

Detalhe completo em [ADR-004](./DECISIONS.md#adr-004-refactor-do-motor-de-regras-para-packagessharedsrules).

`@kabemjunto/shared` é um pacote **privado do monorepo**. A state machine descrita no GDD é um modelo conceitual para revisar o fluxo; a antiga API exportada de estados foi removida porque não tinha consumidor no runtime e duplicava as funções executáveis do motor. Veja [ADR-012](./DECISIONS.md#adr-012-remover-a-api-de-state-machine-sem-consumidor).

---

## 🤖 Time multi-agente

Este projeto é mantido por **3 agentes de IA** sob coordenação de um humano:

| Agente           | Papel             | Escopo                                                      |
| ---------------- | ----------------- | ----------------------------------------------------------- |
| **Mavis** (lead) | Engenheiro sênior | Motor de regras, tipos, ADRs estruturais, code review final |
| **Codex**        | Engenheiro pleno  | UI/UX, API, WebSocket, CI/CD, devops                        |
| **Antigravity**  | Engenheiro júnior | Assets, SFX, CSS, copy, fixtures, README                    |

**Regra de lock estrito** (ADR-003): cada agente só toca em arquivos dentro do escopo da issue dele. Mavis revisa PRs. Detalhes em [`PLANO-EQUIPE-3DEVS.md §5.0`](./PLANO-EQUIPE-3DEVS.md#50-lock-estrito-por-issue-regra-de-convivência).

---

## 🗺️ Roadmap

O andamento detalhado, sprint a sprint, está em [`STATUS.md`](./STATUS.md). Hoje:

- ✅ Motor puro completo (109 cartas, Silêncio, 0+, Corta-Frente, descarte múltiplo, Troca/Gira Mão, +2 Para Todos).
- ✅ Multiplayer online com servidor autoritativo, salas públicas/privadas, retomada após recarregar e persistência em volume.
- ✅ Mesa 3D (local e online) com alternativa 2D, menu de dois caminhos e dicas contextuais (ADR-014).
- 🔜 Performance: 60 fps de média em celular intermediário (hoje 49–56 no perfil de teste; ver ADR-014).
- 📋 PWA instalável, loja de baralhos.

---

## 📸 Screenshots (preview)

_(Mockups do GDD, anteriores à mesa 3D atual.)_

| Tela            | Mockup                       |
| --------------- | ---------------------------- |
| Menu principal  | `tela-01-menu-principal.png` |
| Lobby / Sala    | `tela-02-lobby-sala.png`     |
| Gameplay (mesa) | `tela-03-gameplay-mesa.png`  |
| Vitória         | `tela-04-vitoria.png`        |
| Loja            | `tela-05-loja.png`           |
| Tutorial        | `tela-06-tutorial.png`       |

---

## 📊 Status atual

- ✅ `npm run validate` verde: TypeScript strict, ESLint, Prettier, 437 testes unitários/de componente e build.
- ✅ 44 testes E2E (Playwright) cobrindo menu, salas, mesa 3D local e online, mesa 2D e acessibilidade.
- ✅ CI no GitHub Actions (com cobertura ≥ 80% nas regras).

---

## 📝 Licença

A definir (provavelmente MIT). Por enquanto: **todos os direitos reservados**.

---

## 🙏 Créditos

- **Game design**: [@Mavis](https://github.com/) + iteração com a equipe
- **Código**: time multi-agente (Mavis, Codex, Antigravity)
- **GDD**: baseado no documento original de [@Mavis](https://github.com/)

Para contribuir, leia [`CONTRIBUTING.md`](./CONTRIBUTING.md).
