# Kabemjunto

> O jogo de cartas que te denuncia. De 2 a 10 jogadores; duração estimada de 8 a 15 minutos.

Jogo de cartas com temática brasileira, **109 cartas**, regra do 7 (Silêncio), ataques acumuláveis assimétricos, reflexo com **0+**, **+2 Para Todos**, descarte múltiplo e **Corta-Frente**. Há partida contra bots no próprio navegador e modo Online, ambos na mesma **mesa 3D**, com servidor autoritativo no Online.

[![CI](https://github.com/Alexandremocmg/kabemjunto/actions/workflows/ci.yml/badge.svg)](https://github.com/Alexandremocmg/kabemjunto/actions/workflows/ci.yml)

Documentação reconciliada em **2026-11-18**, a partir de `54c4601`. A tag mais recente encontrada é `v0.5.1`; ela não inclui todas as mudanças posteriores da branch. A versão `1.0.0` no `package.json` também não comprova lançamento público v1.0. Contagens antigas de testes e relatos de deploy são evidências históricas, não resultados desta revisão.

## Jogar

- **Contra bots:** no menu, escolha de 2 a 10 jogadores (fichas de 2 a 6; "7+" abre 7 a 10) e toque em **Jogar agora**. A partida roda no navegador e fica no `sessionStorage` da aba; avatar e tema ficam no `localStorage`. Isso não equivale a uma conta ou backup entre dispositivos. Mesa compartilhada (hot-seat) não existe mais.
- **Na mesa:** arraste a carta que brilha até o centro (ou toque duas vezes). Cartas de mesma face: toque nelas para montar o grupo do descarte múltiplo. Sem jogada, toque no monte. Coringas abrem um anel de cores e a Troca Mão pede o adversário. Teclado: `Tab` chega à mão, setas trocam de carta, `Enter` joga, `Espaço` seleciona. Sem WebGL (ou com `?mesa=2d`), a mesma mesa aparece em 2D.
- **Online:** informe seu apelido, crie uma sala ou entre por código/listagem pública. Salas são privadas por padrão; somente o host inicia. As mãos são enviadas privadamente, e o servidor decide as jogadas. A retomada usa um token de sessão, sem cadastro por e-mail.
- **Objetivo:** descartar todas as cartas. Cada participante começa com 7. Jogue por cor, número ou ação; neutras permitem escolher cor, respeitando as restrições de ataque.
- **Compra:** sem jogada que bloqueie a compra, compre uma carta. Se ela for jogável, o turno é mantido; caso contrário, passa. `TROCA_MAO` é a exceção: tê-la na mão não obriga usá-la antes de comprar. Pagar ataque sempre passa a vez.
- **Ataques:** `+2` sobre `+2`, `+4` sobre `+2` e `+4` sobre `+4` acumulam. `+2` sobre `+4` é proibido. `0+` reflete a pilha ao último atacante, sem defesa do reflexo; sem ataque, funciona como coringa.
- **+2 Para Todos:** cada adversário compra 2 imediatamente, sem repasse ou defesa; quem jogou escolhe a cor. Não responde a ataque acumulado, não entra em lote e não participa do Corta-Frente.
- **Silêncio:** um 7 abre uma janela até o próximo descarte. No Online, chat e falas rápidas continuam disponíveis; a primeira mensagem de cada jogador nessa janela gera +2 imediato, sem passar o turno. Outro 7 abre uma nova janela de penalização.
- **Descarte múltiplo:** duas ou mais cartas da mesma face permitida (número sem ação, `+2`, Skip ou Reverse), inclusive de cores diferentes. A primeira precisa ser válida; a última define a cor. A pilha pode ser preparada fora da vez, mas só é jogada no turno correto.
- **Corta-Frente:** durante a janela (4 segundos contra bots, 5 no Online), outro jogador pode interceptar com carta idêntica em cor e número/ação. Somente números sem ação, `+2`, Skip e Reverse são elegíveis. O primeiro pedido válido no servidor vence e pode abrir nova janela.

Consulte [GDD, regras canônicas](./GDD-Kabemjunto.md#7-regras-oficiais-canônicas-resumo), incluindo vitória imediata, efeitos de mão e esgotamento do monte.

## Executar localmente

O CI e o Docker usam **Node.js 20**. Utilize npm com suporte a workspaces; o projeto mantém um `package-lock.json` na raiz.

```bash
git clone https://github.com/Alexandremocmg/kabemjunto.git
cd kabemjunto
npm ci
npm run dev
```

O supervisor inicia backend em `http://localhost:3001` e frontend em `http://localhost:5173`. O Vite pode escolher outra porta se 5173 estiver ocupada; confira o terminal. Para iniciar separadamente, use `npm run dev:server` e `npm run dev:web`.

O cliente usa a origem da página como destino Socket.IO por padrão; Vite encaminha `/socket.io` ao backend local, inclusive WebSocket. Para origens separadas, configure `VITE_SOCKET_URL` em `apps/web/.env.local` **antes do build**. Não use `localhost` nessa variável para links acessados em outro dispositivo. `VITE_TUNNEL_HOST` permite declarar o host aceito pelo servidor Vite ao usar túnel.

```bash
cloudflared tunnel --url http://127.0.0.1:5173 --http-host-header localhost:5173
```

## Instalar e jogar offline

1. Abra o build de produção em HTTPS ou localhost, com conexão, e aguarde o carregamento inicial. Em Chromium, use a opção de instalação no navegador. No Safari do iPhone, use **Compartilhar → Adicionar à Tela de Início**.
2. Após o service worker baixar os arquivos, reabra o jogo sem rede. No menu, use **Jogar contra bots**: a mesa 3D, as cartas e os bots funcionam offline. Criar ou entrar em sala exige conexão.
3. Para retomar uma partida após recarregar, mantenha a mesma aba ou janela. A partida fica na sessão dela. O modo Online precisa de conexão com o servidor.

O build web inclui `manifest.json`, ícones PNG e `sw.js`. O worker guarda somente os arquivos públicos do build. A próxima versão fica em espera até as abas e janelas controladas pela anterior serem fechadas. O Vite em modo dev não registra o worker. Para testar o build localmente, execute `npm run build` e `npm run preview`.

## Scripts e validação

| Comando                                   | Comportamento atual                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                             | Inicia e supervisiona servidor e frontend.                                 |
| `npm run dev:server` / `npm run dev:web`  | Inicia cada aplicação separadamente.                                       |
| `npm run build`                           | Compila shared, servidor e frontend, nessa ordem.                          |
| `npm run preview`                         | Serve o build web; multiplayer exige backend acessível.                    |
| `npm run typecheck`                       | Compila shared e verifica tipos de servidor e web.                         |
| `npm test` / `npm run test:watch`         | Vitest: motor, servidor e frontend; exclui `e2e/`.                         |
| `npm run test:cov`                        | Executa Vitest com cobertura.                                              |
| `npm run e2e`                             | Playwright/Chromium; inicia backend em 3101 e frontend em 5175.            |
| `npm run lint` / `npm run lint:fix`       | ESLint; a segunda opção modifica arquivos.                                 |
| `npm run format` / `npm run format:check` | Prettier; a primeira opção modifica arquivos.                              |
| `npm run validate`                        | Typecheck, lint, formatação, testes e build. Não inclui E2E nem cobertura. |

```bash
npm run validate
npm run test:cov
npx playwright install chromium
npm run e2e
```

O CI também executa auditoria de dependências de produção e exige pelo menos 80% de cobertura de statements no motor e na persistência. Consulte o [workflow](./.github/workflows/ci.yml). Resultados desta revisão estão no [relatório](./docs/REVISAO-2026-11-18.md).

## Arquitetura implementada

| Parte                    | Implementação                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Frontend                 | React 18, TypeScript, Vite e CSS; mesa em Three.js puro, carregada sob demanda (ADR-014).           |
| Estado da interface      | Hooks React e armazenamento do navegador; dependência declarada não comprova uso no runtime.        |
| Regras                   | Motor TypeScript compartilhado, sem DOM ou rede; RNG substituível nos fluxos que embaralham cartas. |
| Backend                  | Fastify 5 e Socket.IO; valida ações e distribui estado público e mãos privadas.                     |
| Persistência do servidor | Snapshot JSON atômico, schema v3, leitura compatível com v2; sem PostgreSQL/Redis implementados.    |
| Áudio                    | Web Audio API, síntese de efeitos.                                                                  |
| Testes                   | Vitest, fast-check e Playwright.                                                                    |

```text
apps/web/src/             Menu, mesa 3D/2D (`mesa/`) e serviços do navegador
apps/web/public/          Arte, manifest e ícones copiados pelo Vite
apps/server/src/          Salas, Socket.IO, persistência, configuração e operação
packages/shared/src/     Tipos, regras, constantes, fixtures e telemetria
e2e/                     Cenários Playwright
assets/                  Fontes de assets
docs/                    Relatórios e especificações complementares
briefings/ e feedback/    Planejamento e revisões históricos
```

`App.tsx` mostra o menu e leva à mesa contra bots (`mesa/MesaLocal3D.tsx`, motor no navegador) ou à sala Online (`mesa/MesaOnline3D.tsx`); as duas usam a mesma `Mesa3D`. Não há mais aplicação de runtime em `src/` na raiz. Os nomes `gerarBaralho108` e `BARALHO_COMPLETO_108` foram mantidos, mas geram **109** cartas (ADR-013). A fixture `deck108.json` continua com 108 e não representa o catálogo usado nas partidas.

O motor não exporta uma segunda API de state machine. No Online, timers de Corta-Frente pertencem ao `RoomStore`. Persistência e coordenação atuais pressupõem **instância única**; aumentar réplicas exige coordenação distribuída por sala (ADR-011).

## Docker e operação

A imagem serve `apps/web/dist` pelo Fastify, na mesma origem do Socket.IO. O entrypoint ajusta a posse do volume e executa o servidor como usuário `kabemjunto`.

```bash
docker build -t kabemjunto .
docker run -d --name kabemjunto -p 3001:3001 \
  -v kabemjunto-data:/data \
  -e CORS_ORIGINS=http://localhost:3001 \
  -e METRICS_TOKEN=SUBSTITUA_POR_UM_SEGREDO_UNICO \
  kabemjunto
```

Substitua o token ilustrativo antes de executar; mínimo de 16 caracteres. Em um domínio público, ajuste `CORS_ORIGINS` para a origem HTTPS correta. O exemplo usa continuação de linha Bash.

| Variável                                     | Uso                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                   | `development`, `test` ou `production`; padrão `development` fora da imagem.                                                       |
| `PORT` / `HOST`                              | Padrões `3001` / `0.0.0.0`.                                                                                                       |
| `ROOM_STORAGE_FILE`                          | Snapshot persistente; opcional fora do Docker, cujo padrão é `/data/rooms.json`. Sem arquivo configurado, salas ficam em memória. |
| `CORS_ORIGINS`                               | Obrigatória em produção; origens separadas por vírgula.                                                                           |
| `METRICS_TOKEN`                              | Obrigatório em produção, mínimo 16 caracteres; bearer de `/metrics`.                                                              |
| `KABEMJUNTO_E2E_FIXTURE`                     | `1` habilita fixtures somente fora de produção.                                                                                   |
| `VITE_SOCKET_URL`                            | Endpoint público alternativo do Socket.IO, embutido no build web.                                                                 |
| `VITE_TUNNEL_HOST`                           | Host adicional aceito pelo servidor de desenvolvimento Vite.                                                                      |
| `VITE_POSTHOG_API_KEY` / `VITE_POSTHOG_HOST` | Configuração opcional do sink PostHog no build web; sem chave, ele não envia eventos.                                             |

Endpoints: `/live` verifica o processo; `/ready` verifica carregamento e gravabilidade do storage configurado; `/health` fornece o healthcheck da aplicação; `/metrics` expõe Prometheus, protegido por bearer em produção; fora dela, a rota não exige autenticação.

O Dockerfile **não declara `VOLUME`**: monte o volume no comando ou no provedor. Faça backup do snapshot antes de atualizar. O leitor aceita v2 e v3; a gravação usa v3. A primeira gravação migra dados antigos, e rollback para leitor v2 exige a cópia anterior.

### Railway

O repositório contém `railway.json` com Dockerfile e healthcheck `/live`. O domínio registrado nas entregas anteriores é [Kabemjunto no Railway](https://web-production-52c52.up.railway.app); sua disponibilidade e versão não foram revalidadas nesta revisão.

Não há workflow de deploy Railway em `.github/workflows/`. O histórico registra publicação manual; confirme a configuração atual do provedor antes de presumir autodeploy. Um `git push` sozinho não comprova publicação.

Quando houver solicitação de deploy, confirme serviço, ambiente e volume; publique o SHA pretendido e confira assets, `/live`, `/ready`, `/health`, `/socket.io/?EIO=4&transport=polling` e uma partida com dois clientes, incluindo reconexão.

## Estado e próximos passos

**Implementado no código:** partida contra bots e Online na mesma mesa 3D, salas públicas e privadas, chat e falas rápidas, retomada por token, persistência de salas, descarte múltiplo, Corta-Frente, +2 Para Todos, dicas contextuais e personalização local de avatar/tema.

**Pendências identificadas:** validação estrutural do estado local restaurado e a meta de 60 fps de média em celular intermediário (ADR-014). O briefing mais recente é o da [Sprint 7](./briefings/sprint-7.md).

## Documentação

- [GDD mestre e regras canônicas](./GDD-Kabemjunto.md).
- [Revisão do código e da documentação — 2026-11-18](./docs/REVISAO-2026-11-18.md).
- [Como contribuir](./CONTRIBUTING.md) e [convenções dos agentes](./AGENTS.md).
- [Status e histórico do time](./STATUS.md) e [changelog](./CHANGELOG.md).
- [Decisões arquiteturais](./DECISIONS.md), incluindo ADR-011, ADR-012 e ADR-013.
- [Plano original de equipe](./PLANO-EQUIPE-3DEVS.md) e [briefings](./briefings/): contexto histórico.

As seções originais `01` a `04` e a cópia em `kabemjunto-gdd/gdd/` preservam propostas e pesquisas antigas. Para regras vigentes, use o GDD mestre; para operação e estrutura implementadas, este README e o código. As imagens `tela-01-...png` a `tela-06-...png` são referências visuais históricas.

## Licença e créditos

Licença ainda não definida: todos os direitos reservados. Game design, código, assets e documentação foram desenvolvidos pela equipe do projeto, com participação de Mavis, Codex e Antigravity.
