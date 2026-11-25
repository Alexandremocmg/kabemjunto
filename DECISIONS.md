# DECISIONS (ADRs) — Kabemjunto

Este arquivo registra as Decisões de Arquitetura (ADRs) do projeto Kabemjunto.

## Índice de ADRs

- [ADR-001: Modelagem Canônica das 108 Cartas e Tipos Shared](#adr-001-modelagem-canônica-das-108-cartas-e-tipos-shared)
- [ADR-002: Palette de Cores HSL e Sistema de Design SVG/CSS](#adr-002-palette-de-cores-hsl-e-sistema-de-design-svgcss)
- [ADR-003: Lock Estrito por Issue (Regra de Convivência Multi-Agente)](#adr-003-lock-estrito-por-issue-regra-de-convivência-multi-agente)
- [ADR-004: Refactor do Motor de Regras para `packages/shared/src/rules/`](#adr-004-refactor-do-motor-de-regras-para-packagessharedsrules)
- [ADR-005: Telemetria Opcional e Off-by-Default (LGPD)](#adr-005-telemetria-opcional-e-off-by-default-lgpd)
- [ADR-006: Servidor Autoritativo (Validação no Back, Motor Compartilhado)](#adr-006-servidor-autoritativo-validação-no-back-motor-compartilhado)
- [ADR-007: Mavis como Gerente/Revisor (Especialização por Papel)](#adr-007-mavis-como-gerenterevisor-especialização-por-papel)
- [ADR-008: Dual App (Manter `src/` Legacy + `apps/web/` Novo)](#adr-008-dual-app-manter-src-legacy--appsweb-novo)
- [ADR-009: Consolidação do App Único em `apps/web/` (Fim do Dual App)](#adr-009-consolidação-do-app-único-em-appsweb-fim-do-dual-app)
- [ADR-010: Redesign da Mesa Mobile e Carta 7 Visualmente Secreta](#adr-010-redesign-da-mesa-mobile-e-carta-7-visualmente-secreta)
- [ADR-011: Persistência Atômica em Instância Única e Container Same-Origin](#adr-011-persistência-atômica-em-instância-única-e-container-same-origin)
- [ADR-012: Remover a API de State Machine sem Consumidor](#adr-012-remover-a-api-de-state-machine-sem-consumidor)
- [ADR-013: Carta "+2 Para Todos" (MAIS_DOIS_TODOS) e Expansão do Baralho para 109](#adr-013-carta-2-para-todos-mais_dois_todos-e-expansão-do-baralho-para-109)
- [ADR-014: Mesa 3D com Three.js, Camada Acessível em DOM e Fallback 2D](#adr-014-mesa-3d-com-threejs-camada-acessível-em-dom-e-fallback-2d)
- [ADR-015: "Jogar agora": sala pública rápida completada com bots](#adr-015-jogar-agora-sala-pública-rápida-completada-com-bots)

---

### ADR-001: Modelagem Canônica das 108 Cartas e Tipos Shared

- **Status:** Aprovado · 2026-07-26 · @Antigravity / @Mavis
- **Contexto:** O baralho do Kabemjunto contém 108 cartas, sendo 100 coloridas (4 cores: Laranja, Azul, Verde, Preto) e 8 neutras.
- **Decisão:** Criar os tipos em `packages/shared/src/types/index.ts` e exportar a fixture determinística `deck108.json` com IDs únicos (ex: `LARANJA_NUM_7_1`, `NEUTRA_ZEROPLUS_1`).
- **Consequências:** Todas as validações no motor e renderizadores UI utilizarão os mesmos IDs e enumerações sem inconsistência.

---

### ADR-002: Palette de Cores HSL e Sistema de Design SVG/CSS

- **Status:** Aprovado · 2026-07-26 · @Antigravity
- **Contexto:** As cores das cartas precisam ser vibrantes, legíveis em modo escuro/claro e acessíveis para daltônicos.
- **Decisão:**
  - Laranja: `#F39C12` (HSL: 37, 90%, 51%)
  - Azul: `#3498DB` (HSL: 204, 70%, 53%)
  - Verde: `#27AE60` (HSL: 145, 63%, 42%)
  - Preto/Chumbo: `#2C3E50` (HSL: 210, 29%, 24%)
  - Símbolos com alto contraste + ícone acessível único por cor (Circulo = Laranja, Losango = Azul, Triângulo = Verde, Estrela = Preto).

---

### ADR-003: Lock Estrito por Issue (Regra de Convivência Multi-Agente)

- **Status:** Aprovado · 2026-07-26 · @Mavis
- **Contexto:** Na primeira tentativa de execução em paralelo, o agente Antigravity (escopo "suporte/assets") extrapolou e implementou o motor de regras inteiro (que era escopo do Mavis) em `src/services/gameEngine.ts`. Resultou em violações arquiteturais: motor acoplado a `audioService`, sem testes, sem imutabilidade. Precisamos de uma regra operacional para evitar isso.
- **Decisão:** Adotar **lock estrito por issue**. Cada agente só pode:
  1. Abrir/modificar arquivos que estão **explicitamente listados** na issue que ele pegou.
  2. Se precisar tocar em arquivo fora do escopo, abrir issue separada e esperar.
  3. Mudanças em arquivos compartilhados (ex: `packages/shared/types/`, `tsconfig.json`, `package.json`) exigem aprovação explícita de Mavis antes do PR.
- **Consequências:**
  - ✅ Reduz pisada-de-pé em 95% (estimativa baseada no incidente).
  - ✅ Permite rodar 3 agentes em paralelo com segurança.
  - ❌ Mais overhead de coordenação (mais issues menores em vez de um PR grande).
  - ❌ Mavis vira gargalo para mudanças estruturais (mitigação: ADR só para mudanças pequenas; PR review semanal).
- **Workaround para edições urgentes:** Antigravity/Codex podem propor mudança via issue, Mavis aprova em < 4h, ou já é feito por Mavis no próximo turno.
- **Exceções documentadas (escopo de cada agente):**

  | Agente      | Pode tocar                                                                                                                                                                           | NÃO pode tocar                                                            |
  | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
  | Mavis       | `packages/shared/**`, ADR-004 (rules), arquivos estruturais, motor de regras, qualquer arquivo (tem ownership final)                                                                 | —                                                                         |
  | Codex       | `apps/web/src/components/**` (lógica), `apps/web/src/pages/**`, `apps/web/src/store/**`, `apps/server/src/routes/**`, `apps/server/src/sockets/**`, CI, deploy, package.json de apps | `packages/shared/**` (regra pura é de Mavis)                              |
  | Antigravity | `assets/**`, `src/styles/**`, `src/components/**` (só CSS), `*.md`, fixtures JSON de cartas (não regras), SFX, copy, README                                                          | `packages/shared/**`, `apps/server/src/game/**`, qualquer lógica de regra |

- **Mecanismo de enforcement:** Mavis revisa PRs. Se um agente tocar em arquivo fora do escopo, o PR é rejeitado com link para esta ADR.

---

### ADR-004: Refactor do Motor de Regras para `packages/shared/src/rules/`

- **Status:** Aprovado · 2026-07-26 · @Mavis
- **Contexto:** Na Sprint 0, Antigravity implementou o motor de jogo em `src/services/gameEngine.ts` (escopo do frontend) com várias violações:
  1. Acoplado a `audioService` (`audioService.play(...)` dentro das funções de regra)
  2. `as any` em 4 lugares para bypassar TS strict
  3. `JSON.parse(JSON.stringify(estado))` para clonagem (quebra contrato readonly)
  4. Sem testes (motor com lógica de jogo crítica)
  5. Campos `avatar`, `pontos`, `corAtiva` adicionados no engine mas não no tipo

  Isso dificulta (a) mover o motor para o servidor autoritativo no Beta, (b) escrever testes determinísticos, (c) trocar o motor de I/O.

- **Decisão:** Mover o motor de regras para `packages/shared/src/rules/` (compartilhado entre front e back), com:
  1. **Pureza:** nenhuma função importa áudio, DOM, fs, ou qualquer I/O
  2. **Determinismo:** RNG opcional (default `Math.random`, com `embaralharComSeed` para testes)
  3. **Imutabilidade:** todas as funções retornam novo `EstadoPartida` (nunca mutam)
  4. **Resultado estruturado:** `executarJogada` retorna `{ novoEstado, sfx, eventos }` — o wrapper frontend consome `sfx` para tocar áudio
  5. **Tipos sincronizados:** `Jogador` agora tem `avatar` e `pontos`; `EstadoPartida` agora tem `corAtiva`
  6. **TS strict ligado:** zero `as any`, `noUncheckedIndexedAccess`, etc.
  7. **Testes:** 41 testes cobrindo os 15 edge cases do GDD §04.5, validação de acúmulo, invariantes

  Wrapper frontend `src/services/gameEngine.ts` é fina camada: chama o motor puro e dispara áudio baseado no retorno.

- **Consequências:**
  - ✅ Motor é compartilhável com o servidor (Beta): zero refactor para validar jogadas no backend
  - ✅ Testes determinísticos (21ms para 41 testes)
  - ✅ TS strict verde em todo o monorepo
  - ✅ Type-safe: zero `as any`
  - ✅ Camadas claras: motor puro → wrapper frontend (side effects) → componentes React
  - ❌ Pequena duplicação conceitual: tipos `Jogador.avatar`/`pontos` vivem no shared mas só são usados no front (mitigação: server pode ignorar)
  - ❌ Wrapper frontend precisa manter mapeamento de `acao → sfx` (já feito)

- **Estrutura final do motor:**

  ```
  packages/shared/src/rules/
  ├── shuffle.ts          # embaralhar(), embaralharComSeed()
  ├── create-game.ts      # criarPartidaInicial() + AVATARES_DEFAULT
  ├── validate-play.ts    # validarJogada() + cartasAPagar()
  ├── execute-play.ts     # executarJogada() — coração do motor
  ├── buy-cards.ts        # comprarCartas() + reembaralhamento
  ├── bot-turn.ts         # executarTurnoBot() com 3 níveis
  ├── index.ts            # barrel
  └── create-game.test.ts # 41 testes
  ```

- **Wrapper frontend:**

  ```typescript
  // src/services/gameEngine.ts
  import { executarJogada } from '@shared';
  import { audioService } from './audioService';

  export function jogarCarta(estado, idx, cor) {
    const r = executarJogada({ estado, cartaIndex: idx, corEscolhida: cor });
    tocarSFX(r.sfx); // Despacha o side effect de áudio
    return r.novoEstado;
  }
  ```

---

### ADR-005: Telemetria Opcional e Off-by-Default (LGPD)

- **Status:** Aprovado · 2026-07-27 · @Mavis
- **Contexto:** O motor já retorna `eventos` em `ResultadoJogada` / `ResultadoCompra` (decisão natural durante ADR-004). Precisamos decidir **se** coletar esses eventos em produção, e **como** fazê-lo respeitando a LGPD.
- **Decisão:**
  1. Módulo `packages/shared/src/telemetry/telemetry.ts` com API explícita: `configureTelemetry`, `logEvent`, `logEvents`, `logCustom`, `makeContext`.
  2. `enabled: false` por padrão. Quem quiser ligar chama `configureTelemetry({ enabled: true, sampleRate, sink, context })` no boot.
  3. Sinks plugáveis: `consoleSink` (dev), `noopSink` (testes), `TelemetrySink` é interface aberta pra PostHog/Sentry/custom no futuro.
  4. Erros em sinks (sync ou async) **nunca** derrubam o jogo — são logados em `console.error` e descartados.
  5. **LGPD:** `EventoPartida` carrega só IDs (jogador, sala, partida), não PII. Nomes de jogadores ficam só no estado (não são logados por padrão).
  6. Wrapper frontend `src/services/gameEngine.ts` chama `logEvents(resultado.eventos)` automaticamente — **mas como `enabled=false` por padrão, é zero-overhead em dev/prod local**.
- **Consequências:**
  - ✅ Telemetria não vaza dados sem opt-in explícito.
  - ✅ Estrutura pronta pra Beta: ligar PostHog é 1 chamada de `configureTelemetry`.
  - ✅ Testes do motor continuam determinísticos (sink = `noopSink`).
  - ❌ Telemetria off → perdemos dados de debug em prod até alguém ligar. (Mitigação: doc claro de como ligar no README.)
- **Configuração sugerida (quando ligar em prod):**

  ```typescript
  // src/main.tsx
  if (import.meta.env.PROD) {
    configureTelemetry({
      enabled: true,
      sampleRate: 0.1, // 10% das partidas
      sink: posthogSink, // implementar adapter PostHog
      context: { modo: 'ONLINE' },
    });
  }
  ```

---

### ADR-006: Servidor Autoritativo (Validação no Back, Motor Compartilhado)

- **Status:** Aprovado · 2026-07-27 · @Mavis / @Codex
- **Contexto:** O jogo é competitivo (denúncia, UNO, ataques, 0+). Confiar no cliente abre brechas de cheating: jogador pode editar estado local, jogar carta que não tem, mentir sobre silenciamento, etc. Também precisamos de multiplayer real entre 2-10 jogadores.
- **Decisão:**
  1. **`apps/server/`** com Fastify + Socket.IO é a **fonte da verdade** do estado durante partida online.
  2. Toda entrada de jogador (`client:jogar`, `client:comprar`, `client:escolher:cor`, `client:chat:msg`) passa por `RoomStore`, que:
     - Confere que é a vez do jogador (`NAO_SUA_VEZ`)
     - Confere que a carta está na mão (`JOGADA_INVALIDA`)
     - Chama o **motor compartilhado** (`@kabemjunto/shared`) — mesma função que o cliente usa pra UI.
  3. **Cliente nunca é confiável:** se o cliente mandar `cartaId` que não tem, `executarJogada` lança → `RoomError('JOGADA_INVALIDA')` → `server:jogada:rejeitada` + `server:erro` pro socket.
  4. **Estado público sem mãos:** `toPublicState(estado)` projeta o estado, omitindo `jogador.mao`. Cliente só vê `quantidadeCartas` e a carta do topo.
  5. **Reconexão** (futuro Sprint 3) usará M12 (`SnapshotStack`) pra restaurar estado sem reiniciar a partida.
  6. **Chat sanitizado** server-side (remove `<` `>`, trim, max 240 chars) — defesa em profundidade, mesmo com sanitização no front.
- **Consequências:**
  - ✅ Cheating estruturalmente bloqueado: cliente não tem como jogar carta que não tem.
  - ✅ Motor escrito 1 vez, validado em 2 lugares (front e back) — zero divergência.
  - ✅ Estado público seguro: `toPublicState` é o único caminho do servidor pro cliente.
  - ✅ Reconexão barata (snapshot + diff).
  - ❌ Latência: cada jogada vai e volta do servidor. Mitigação: Fastify + Socket.IO local-first é < 5 ms; WAN fica em < 80 ms.
  - ❌ Estado em memória (Sprint 2): restart do servidor = partida perdida. Mitigação: Sprint 3+ adiciona Redis/Postgres.
- **Diagrama de fluxo de uma jogada online:**

  ```
  cliente → socket 'client:jogar' { cartaId, corEscolhida? }
       ↓
  RoomStore.play() {
    if (vezDe !== socketId) → NAO_SUA_VEZ
    if (carta não está na mão) → JOGADA_INVALIDA
    resultado = executarJogada(...)  // motor puro
    saveState(...)
  }
       ↓
  broadcast 'server:estado:atualizado' { estado: toPublicState(resultado) }
  + socket.emit 'server:jogada:aceita' { cartaId, jogadorId }
  ```

---

### ADR-007: Mavis como Gerente/Revisor (Especialização por Papel)

- **Status:** Aprovado · 2026-07-27 · @Mavis
- **Contexto:** Nas Sprints 0-2, o Mavis (eu) atuou como **engenheiro pleno + lead técnico** — escrevia código de feature (motor, telemetria, ADRs) E revisava o trabalho dos outros agentes. Em paralelo, o time cresceu: Codex começou a tocar UI complexa (B9/B10/B12) e Antigravity acumulou assets (B11/B13/B14). Carga do Mavis na Sprint 2 foi: M12 (snapshot) + M13 (telemetria) + B1 (testes 0+/7) + fix do bug `girarMaos` + rever + commitar tudo. **Não escala** se o time crescer mais.
- **Decisão:**
  1. A partir da **Sprint 3** (2026-07-27), Mavis vira **Gerente + Revisor + Dono do motor**. Não escreve código de feature.
  2. **Mavis escreve apenas:**
     - Specs em `briefings/sprint-N.md`
     - ADRs em `DECISIONS.md` (decisões estruturais)
     - Código crítico do motor (`packages/shared/src/rules/**`, `packages/shared/src/telemetry/**`)
     - Issues explicitamente suas (ex: M14 — identidade estável)
     - Feedback em `feedback/<data>-<issue>-<agente>.md` (revisão formal)
  3. **Codex e Antigravity executam** issues do Mavis. Eles escrevem código de feature.
  4. **Critério de aprovação de PR** (Mavis revisa, mas com filtro):
     - CI verde (`npm run validate`) = passa direto
     - Mudança em `packages/shared/src/rules/**` ou `packages/shared/src/telemetry/**` = revisão linha a linha
     - Mudança estrutural (`package.json`, `tsconfig*`, `eslint*`, ADRs, novo diretório) = revisão do Mavis
     - Mudança em escopo de Codex/Antigravity = review leve, só pra garantir que não importou nada do motor sem motivo
  5. **Comunicação inter-agente via arquivos** versionados no repo:
     - `AGENTS.md` (raiz) — entry point do time
     - `agents/<nome>.md` — perfil de cada agente (escopo, restrições)
     - `briefings/sprint-N.md` — spec da sprint (issues por agente, DoD)
     - `feedback/<data>-<issue>-<agente>.md` — review formal (status, problemas, pendências, decisão)
  6. **Mavis é o guardião do lock estrito** (ADR-003). Qualquer PR que toque em arquivo fora do escopo do agente = rejeitado.
- **Consequências:**
  - ✅ Mavis não vira gargalo de execução (delega feature work)
  - ✅ Codex/Antigravity ganham ownership claro das issues deles
  - ✅ Tudo documentado no repo (rastreável, versionado, sobrevive a restart de agentes)
  - ✅ Time pode crescer sem sobrecarregar Mavis
  - ❌ Mudança estrutural tem que passar pelo Mavis (mitigação: Mavis revisa em < 4h)
  - ❌ Se Mavis sumir, ninguém revisa motor (mitigação: 2ª pessoa com conhecimento de motor)
- **Quem revisa o Mavis?** Mavis é o **último reviewer** no fluxo normal, mas pra mudanças no motor há 2 caminhos:
  1. Mavis revisa seu próprio código (autorevisão documentada em `feedback/`)
  2. Pair review com Codex/Antigravity em mudanças grandes (1x por sprint)
- **Lição aprendida (Sprint 0):** Antigravity extrapolou escopo e implementou motor em `src/services/gameEngine.ts`. Isso motivou ADR-003 (lock) e, eventualmente, ADR-007 (especialização de papéis). **Prevenir é melhor que remediar.**

---

### ADR-008: Dual App (Manter `src/` Legacy + `apps/web/` Novo)

- **Status:** Aprovado · 2026-07-27 · @User / @Mavis
- **Contexto:** Com a criação de `apps/web/` para o frontend multiplayer online PWA, o repositório passou a conter duas árvores de código frontend paralelas: `src/` (single-player hotseat local funcional) e `apps/web/src/` (multiplayer online em desenvolvimento).
- **Decisão:** Adotar a **Opção A**:
  1. Manter `src/` raiz como ambiente funcional de demonstração single-player/hotseat offline durante a Sprint 3.
  2. `apps/web/src/` evolui o multiplayer online sem riscos de quebra do ambiente offline.
  3. A consolidação final ou unificação em app único será avaliada na Sprint 4 após o fechamento do Beta Multiplayer.
- **Consequências:**
  - ✅ Zero risco de regressão no jogo single-player offline durante a Sprint 3.
  - ✅ Ritmo acelerado no desenvolvimento das issues multiplayer (B13, B16).
  - ❌ Manutenção temporária de 2 entrypoints por 1 sprint adicional.

---

### ADR-010: Redesign da Mesa Mobile e Carta 7 Visualmente Secreta

- **Status:** Proposta aprovada para implementação · 2026-07-27 · @User / @Mavis
- **Contexto:** A inspeção visual da mesa mostrou sobreposição de textos,
  cartas sem hierarquia, compra isolada e ausência de uma narrativa visual para
  eventos especiais. O produto forneceu referências visuais da tela atual,
  proposta de mesa e especificação técnica das cartas neutras.
- **Decisões:**
  1. A mesa será mobile-first, com feltro verde, núcleo central, monte de
     compra à esquerda, descarte à direita e mão em leque no rodapé.
  2. O Monte de Compra será o controle de compra; não haverá botão separado
     `Comprar` na mesa.
  3. A carta 7 será visualmente secreta: face idêntica à carta numérica da cor,
     sem ícone ou ilustração de silêncio. O estado será comunicado pelo banner,
     modal e feed de eventos.
  4. A mão usará seleção em dois toques: primeiro toque seleciona, segundo
     confirma. O servidor/motor continua responsável pela validação final.
  5. A Fase 1 suporta a composição espacial de 2–4 jogadores. A expansão para
     5–10 jogadores terá uma decisão visual própria.
  6. Eventos de silêncio, ataque e reflexo do `0+` usarão uma fila serializada,
     com fallback textual e suporte a `prefers-reduced-motion`.
  7. O MVP não terá número de rodadas, pontuação cumulativa ou temporizador
     obrigatório. Uma eventual configuração de tempo será autoritativa no
     servidor; ranking numérico depende de regra de pontuação futura.
  8. `+4 sobre +4` permanece regra canônica no MVP; não será exposto como toggle
     antes de existir variante formal no motor, servidor e contratos de sala.
- **Referência detalhada:** `docs/UI-REDESIGN-FASE-1.md`.
- **Consequências:**
  - ✅ A tela prioriza entendimento da jogada e dos clímax sociais.
  - ✅ A surpresa da carta 7 é preservada sem esconder o estado ativo.
  - ✅ Compra, seleção e eventos têm affordance mobile e acessível.
  - ❌ O modo de 5–10 jogadores e partidas em rodadas ficam para decisões
    posteriores.

---

### ADR-011: Persistência Atômica em Instância Única e Container Same-Origin

- **Status:** Aprovado · 2026-07-27 · @Mavis
- **Contexto:** A Sprint 5 entregou multiplayer autoritativo funcional, mas o
  `RoomStore` vive somente em memória. Um restart perde salas e partidas. O app
  também depende de processos separados em desenvolvimento, CORS permissivo e
  health check insuficiente para operação. A Sprint 6 precisa de recuperação,
  deploy estável e observabilidade sem introduzir uma arquitetura distribuída
  prematura.
- **Decisão:**
  1. Persistir snapshots versionados das salas em JSON sobre volume local,
     usando gravação atômica (`arquivo temporário` + `rename`) antes de confirmar
     a mutação ao cliente.
  2. Persistir somente estado autoritativo durável. `socketId` e o mapa
     `socketByPlayer` são transitórios e nunca entram no snapshot. Após restart,
     todos os jogadores são restaurados como desconectados e retomam pelo
     `jogadorId` estável.
  3. Arquivo ausente significa primeiro boot. Snapshot inválido ou versão
     desconhecida deve falhar explicitamente e deixar `/ready` vermelho; o
     servidor nunca apaga nem substitui silenciosamente dados corrompidos.
  4. Operar uma única instância autoritativa. O arquivo não será compartilhado
     entre réplicas. Escala horizontal exige nova ADR e migração para banco
     transacional/coordenação distribuída, preferencialmente Postgres para
     snapshots e Redis para presença/pub-sub quando houver necessidade real.
  5. Empacotar frontend estático, Fastify e Socket.IO em um container
     same-origin. O volume padrão é `/data` e o caminho vem de
     `ROOM_STORAGE_FILE`.
  6. Produção usa configuração validada, CORS allowlist, Helmet, rate limits,
     validação runtime de payloads, fixture E2E desativada e shutdown gracioso.
  7. Observabilidade usa logs Pino JSON e métricas Prometheus de baixa
     cardinalidade. Nome, conteúdo de chat, mãos, tokens, `salaId`, `jogadorId` e
     `socketId` não podem aparecer em labels ou logs operacionais.
  8. Railway com volume é o alvo operacional inicial sugerido por suportar
     processo Node/WebSocket e storage persistente de baixo custo. O Dockerfile
     permanece portável para Fly, Render pago ou VPS. Um plano que durma pode
     fornecer URL estável, mas não pode ser descrito como always-on.
  9. Antes do primeiro deploy, o snapshot sobe para schema v2 e a retomada passa
     a exigir token opaco de alta entropia. O servidor persiste somente SHA-256,
     rotaciona o token na retomada e revoga o socket anterior. Snapshot v1 é
     rejeitado explicitamente porque nunca foi implantado e não existe migração
     segura capaz de entregar credenciais aos jogadores antigos.
  10. O alvo inicial confirmado é Railway, serviço único same-origin com volume
      de 500 MB em `/data`. O domínio Railway é a origem CORS exata. Ativação de
      plano pago permanece decisão separada do proprietário.
  11. O evento persistido `MONTE_ESGOTADO` exige schema **v3**. O leitor v3
      aceita snapshots v2 antigos sem reescrevê-los durante `load`; o próximo
      `save` grava v3. Um arquivo rotulado v2 não pode conter o evento novo.
      Isso mantém a fronteira de compatibilidade explícita: rollback para um
      binário v2 exige backup operacional capturado antes da primeira gravação
      v3, em vez de tentar abrir estado novo com um validador antigo. Em v3,
      `cartasSolicitadas >= 1` e `0 <= cartasObtidas < cartasSolicitadas`.
- **Alternativas rejeitadas nesta sprint:**
  - **Postgres desde o início:** robusto para múltiplas réplicas, porém adiciona
    conta, migrações, pool e I/O assíncrono sem demanda atual.
  - **Redis como única persistência:** adequado a presença/cache, menos adequado
    como fonte durável única sem configuração específica de persistência.
  - **SQLite nativo:** bom para instância única, mas adiciona dependência nativa e
    complexidade de build desnecessária para snapshots pequenos.
  - **Filesystem efêmero:** incompatível com o objetivo de recuperação.
- **Gatilhos de revisão:**
  - necessidade de duas ou mais réplicas;
  - volume de snapshots que torne a gravação completa perceptível;
  - SLA/backup que exija PITR;
  - matchmaking compartilhado entre regiões;
  - indisponibilidade aceitável menor que o restart de uma instância.
- **Consequências:**
  - ✅ Recuperação simples, auditável e testável sem serviço externo.
  - ✅ Deploy portátil e Socket.IO same-origin.
  - ✅ Segredos e PII ficam fora de logs/métricas.
  - ✅ Tokens brutos permanecem somente no `sessionStorage` do cliente e nunca
    entram em snapshot, logs, métricas ou telemetria.
  - ❌ Uma única instância continua sendo ponto único de falha.
  - ❌ Volume persistente e backup dependem do provedor escolhido.

---

### ADR-012: Remover a API de State Machine sem Consumidor

- **Status:** Aprovado · 2026-07-30 · @Mavis
- **Contexto:** `packages/shared/src/rules/state-machine.ts` exportava estados e
  transições e tinha uma suíte própria, mas nenhum fluxo de `apps/server`,
  `apps/web` ou das demais regras chamava essa API. O turno real já era executado
  pelas funções puras `validarJogada`, `executarJogada` e `comprarCartas`. Manter
  duas representações executáveis permitiu divergência: a tabela descrevia a
  janela após comprar uma carta, enquanto o runtime chegou a implementar outro
  comportamento. O pacote `@kabemjunto/shared` tem `private: true`, portanto não
  existe contrato publicado no registry a preservar.
- **Decisão:**
  1. Remover `state-machine.ts`, seu teste isolado e seu export do barrel.
  2. Não substituir o módulo por outra API até existir um consumidor real e uma
     única fonte executável para o fluxo.
  3. Manter a state machine no GDD apenas como **modelo conceitual** para design,
     revisão e testes de conformidade; as funções puras do motor são o runtime.
  4. Tratar a remoção como higiene de API/build: código morto não integra a
     superfície privada do pacote nem gera declarações/JavaScript sem uso.
- **Consequências:**
  - ✅ Elimina uma falsa sensação de cobertura e uma fonte paralela de verdade.
  - ✅ Reduz a superfície exportada e os artefatos emitidos no build.
  - ✅ Preserva o vocabulário de estados no GDD sem fingir que ele é uma API.
  - ❌ Integrações internas que quisessem adotar uma máquina executável no futuro
    precisarão de nova decisão e testes dirigidos por um consumidor real.

---

### ADR-013: Carta "+2 Para Todos" (MAIS_DOIS_TODOS) e Expansão do Baralho para 109

- **Status:** Aprovado · 2026-08-01 · @User
- **Contexto:** O produto propôs uma nova carta de ataque global/AoE: ao ser
  descartada, todos os adversários (não quem a jogou) compram 2 cartas
  imediatamente, sem janela de defesa/repasse. Isso não se encaixa no sistema
  de `ataqueAcumulado`/`ataqueStack` existente (`+2`/`+4`), que é sempre
  direcional (um único alvo, empilhável, com resposta). O produto também
  decidiu expandir o baralho canônico de 108 para 109 cartas para acomodar
  exatamente 1 cópia dessa carta nova.
- **Decisão:**
  1. Nova ação `MAIS_DOIS_TODOS` no enum `Acao`, carta do tipo **NEUTRA**
     (`cor: 'NEUTRO'`), com escolha de cor pós-jogada reaproveitando o mesmo
     fluxo já usado por `MAIS_QUATRO` (`corEscolhida`). Ser NEUTRA já a exclui
     automaticamente de: Corta-Frente (`isEligibleForInterception` só aceita
     números e `+2`/Skip/Reverse coloridos) e Descarte Múltiplo
     (`podeParticiparDoLote` só aceita números e `+2`/Skip/Reverse coloridos)
     — nenhuma das duas listas precisou mudar.
  2. Efeito resolvido como **transição pura atômica** em `execute-play.ts`
     (mesmo padrão de `TROCA_MAO`/`GIRA_MAO`), **fora** do sistema de
     ataque acumulado: nunca soma a `ataqueAcumulado`, nunca é aceita pela
     janela de resposta a ataque (`validarJogadaEmAtaque` só permite
     `ZERO_MAIS`/`MAIS_DOIS`/`MAIS_QUATRO`; qualquer outra ação já cai no
     `catch-all` de rejeição — nenhuma mudança de código necessária ali).
  3. Distribuição de 2 cartas por adversário, em ordem de turno a partir do
     próximo jogador, reaproveitando a mecânica de compra com reciclagem de
     `comprarCartas` (mesmo truque já usado por `ZERO_MAIS` ao refletir um
     ataque: chama `comprarCartas` com `vezDe` temporariamente apontado para
     cada alvo). Herda de graça o comportamento canônico de reciclagem do
     descarte e a regra all-or-nothing: se o baralho não tiver as 2 cartas
     completas para um alvo, a partida termina imediatamente pelo critério
     de menor mão (mesma regra que já vale para `+2`/`+4`).
  4. Vitória imediata: se `MAIS_DOIS_TODOS` é a última carta da mão de quem
     jogou, a vitória acontece no instante do descarte e a distribuição é
     cancelada — mesmo padrão já existente para `TROCA_MAO`/`GIRA_MAO`
     (`venceAntesDeEfeitoDeMao` em `execute-play.ts`).
  5. Baralho expandido de 108 para 109 cartas (`gerarBaralho108()` ganha uma
     carta a mais). Os identificadores `BARALHO_COMPLETO_108`/
     `gerarBaralho108` **não foram renomeados** — tratados como rótulo
     histórico, não como contrato; renomear é uma decisão separada, de
     escopo puramente cosmético, se o produto quiser.
  6. Consequência direta no schema de persistência do servidor
     (`apps/server/src/persistence.ts`): a whitelist local `ACTIONS` (que
     espelha `Acao` para validar snapshots) precisa incluir `MAIS_DOIS_TODOS`
     — sem isso, qualquer evento/carta com essa ação falharia a validação do
     snapshot ao salvar/restaurar uma sala. Não é uma extensão de escopo: é
     a mesma lista que já teria quebrado silenciosamente se esquecida.
- **Fora de escopo desta ADR (follow-up):** arte/ícone dedicado da carta
  (hoje ela renderiza com o fallback textual genérico, sem `.webp` próprio),
  atualização da tabela de composição do baralho no GDD/§7, exposição na
  Coleção local (`PainelColecao`), e qualquer decisão de raridade final
  (usado `RARA` como placeholder, no mesmo nível de `TROCA_MAO`/`GIRA_MAO`).
- **Consequências:**
  - ✅ Zero mudança nas regras de Corta-Frente ou Descarte Múltiplo: a
    exclusão é uma consequência automática de ser `NEUTRA`, não uma lista
    especial mantida à mão.
  - ✅ Reaproveita 100% da mecânica de compra-com-reciclagem já testada;
    nenhuma lógica de baralho/reembaralhamento nova foi escrita.
  - ❌ O baralho deixa de ser literalmente "108 cartas" — um traço citado
    como identidade do produto em vários lugares (GDD, memória do projeto,
    branding). Fica registrado aqui como decisão deliberada do produto, não
    como efeito colateral.
  - ❌ UI/arte ficam pendentes; a carta é jogável (motor completo, testado),
    mas sem apresentação visual própria até um follow-up.

---

### ADR-014: Mesa 3D com Three.js, Camada Acessível em DOM e Fallback 2D

- **Status:** Proposta · Fases 1 (local), 2 (online, menu, dicas) e 3 (limpeza) implementadas · 2026-11-17 · @User
- **Contexto:** O produto pediu uma mesa 3D mais fluida e simples, sem mudar
  regras, protocolo nem servidor. A mesa 2D atual exigia toque duplo para
  jogar e tinha dois componentes de mesa paralelos (`AppSingleplayer` e
  `MesaOnline`).
- **Decisões:**
  1. **Three.js puro** (`three@0.186.1`), sem react-three-fiber. As cartas são
     objetos que voam entre mão, descarte e assentos; isso é mais simples e
     barato de animar de forma imperativa (`apps/web/src/mesa/cena/CenaMesa.ts`)
     do que por reconciliação declarativa. O React só entrega um instantâneo
     (estado público + mão) e recebe intenções.
  2. **Um contrato para os dois modos** (`ControladorMesa`): a mesa só vê o
     estado público e a própria mão, e só envia intenções. No local, o motor
     puro roda no navegador com bots no lugar do socket (`useMesaLocal`); no
     online, um adaptador fino sobre `useGameSocket` (`useMesaOnline`, ligado
     na Fase 2).
  3. **Arrastar até o centro joga.** Tocar seleciona (grupo de descarte
     múltiplo); tocar de novo na carta selecionada também joga, para quem não
     consegue arrastar. Cor em anel sobre o descarte; alvo da Troca Mão
     tocando no assento.
  4. **Camada acessível em DOM**: cada carta tem um botão real alinhado à sua
     projeção na tela (invisível ao ponteiro, visível no foco do teclado),
     com `aria-live` para os anúncios da partida. Enter joga, Espaço
     seleciona, setas trocam de carta. `prefers-reduced-motion` desliga voos,
     pulsos e giros.
  5. **Mesa 2D simples na própria mesa nova** (Fase 3): sem WebGL, com perda
     de contexto ou com `?mesa=2d`, a `Mesa3D` troca o canvas por uma mesa em
     DOM (a camada acessível fica visível, com as cartas desenhadas pelo
     `CartaView`) e avisa quando foi por falta de WebGL. Mesmas regras de
     interação, sem baixar o Three.js. Com isso as mesas antigas
     (`AppSingleplayer`, `MesaOnline` e componentes que só elas usavam) e o
     CSS delas saíram.
  6. **Orçamento de performance**: geometria de carta única com 2 grupos de
     material (frente com borda, verso); adversários em um `InstancedMesh`
     com materiais próprios (compartilhar material entre malha instanciada e
     comum força troca de shader a cada desenho); faces em cache por chave e
     pré-geradas em tempo ocioso; descarte limitado a 4 cartas visíveis;
     redesenho só quando algo muda; pixel ratio até 2, reduzido sozinho se os
     quadros ficam lentos; Three.js só no pedaço carregado sob demanda.
  7. **Menu com dois caminhos** (Fase 2, redesenhado depois do primeiro teste
     de uso): a tela inicial mostra a logo, um leque de cartas e duas escolhas
     do mesmo peso. "Jogar contra bots" vem primeiro, em destaque, com o
     número de jogadores em fichas (2 a 6; 7 a 10 atrás do botão "7+") e o botão
     "Jogar agora"; "Jogar com amigos" traz "Criar sala" e o código com
     "Entrar". O apelido é um campo só, no topo, e é opcional contra bots.
     Salas públicas ficam recolhidas. O primeiro desenho escondia o card de
     bots abaixo de "Criar sala", e quem abria o jogo achava que só havia
     online. O alternador Local/Online saiu. "Personalizar perfil" fica no
     cabeçalho (o tema escolhido vale para a mesa 3D). No celular o campo de
     apelido não recebe foco sozinho (o teclado cobriria as escolhas) e o
     aviso "Offline" não aparece enquanto ninguém tentou conectar.
  8. **Online na mesma mesa** (Fase 2): `MesaOnline3D` liga `useMesaOnline` à
     `Mesa3D`. Falas rápidas no HUD (com aviso de +2 durante o silêncio),
     balões sobre os assentos, menu ☰ com sala, jogadores e chat, e painel de
     "Partida encerrada" quando o adversário abandona.
  9. **Dicas contextuais no lugar do tutorial** (Fase 2): cada regra
     (arrastar, comprar, ataque, silêncio, grupo de cartas, 0+) é explicada
     uma vez, no momento em que importa; "Entendi" não mostra de novo e "Não
     mostrar dicas" desliga todas (`kabemjunto.dicas-vistas`).
  10. **Saída confirmada pelo servidor** (Fase 2, correção): o cliente enviava
      `client:abandonar:partida` e desconectava no mesmo instante; o Socket.IO
      do servidor despacha eventos no tick seguinte e descarta os que chegam
      junto com a desconexão, então o abandono às vezes se perdia e o
      adversário ficava numa partida sem fim (valia também para a mesa 2D).
      Agora o cliente só desconecta depois da resposta do servidor (máx. 1,5 s).
  11. **Peso das cartas, opcional** (2026-11-25): ao pousar no descarte, a carta
      ganha um pop de escala que acomoda em 0,26 s, uma leve inclinação que
      achata e uma sombra suave que acompanha o voo (maior e mais fraca quanto
      mais alta). Só vale para cartas que voam até o descarte, sejam suas ou de
      bots; as cartas da mão ficam como estão, porque a camada acessível se
      alinha ao destino delas. Desligado por padrão: `?peso=1` liga, `?peso=0`
      desliga, e a escolha fica em `kabemjunto.peso` no aparelho.
      `prefers-reduced-motion` desliga tudo. As curvas são puras e testadas
      (`cena/assentada.ts`); a cena usa uma reserva fixa de 6 sombras
      reaproveitadas e `estatisticas().sombrasDeVoo` volta a 0 quando as cartas
      param. **Ainda não medido em celular:** o custo é um pouco de aritmética
      em ~0,26 s por jogada e o render ligado nesse intervalo; compare fps com
      e sem a opção antes de ligar por padrão.
- **Medição (Fase 1, build de produção, 375×812 @2x, CPU 4× mais lenta,
  6 jogadores, Intel HD 630):** mediana de 16,7 ms por quadro (60 fps),
  média entre 49 e 56 fps, p95 de 33 ms, picos de 150 a 200 ms nos eventos
  de jogada; 33 a 42 chamadas de desenho. Depois da Fase 3, o bundle inicial
  ficou em 78 kB gzip (antes 101 kB) e o CSS inicial em 4,6 kB (antes 12 kB);
  a mesa sem Three.js tem 16 kB e o Three.js, 144 kB, só na 3D. Na Fase 1, o acréscimo ao bundle inicial do menu tinha sido de +1,1 kB gzip.
- **Consequências:**
  - ✅ Jogar vira um gesto só; o estado da mesa é sempre visível (vez, cor,
    sentido, ataque, Corta-Frente com anel de contagem).
  - ✅ Motor e servidor intocados.
  - ❌ A meta de 60 fps de média no perfil acima ainda não foi atingida: os
    picos nos eventos vêm da renderização do React e da criação de material
    por carta. Próximo passo: atlas de faces (um material para todas).
  - ❌ Hot-seat (vários humanos no mesmo aparelho) saiu do menu; só a mesa
    2D (fallback) ainda o oferece, pela tela de fim de partida.

---

### ADR-015: "Jogar agora": sala pública rápida completada com bots

**Status:** Aceito · **Data:** 2026-11-25

**Contexto.** O menu mandava o botão principal para uma partida **local** (bots no navegador). Quem chegava
pela vitrine nunca encontrava outra pessoa, e salas online exigiam combinar um código. O pedido do dono do
produto: ao clicar em jogar, entrar numa sala pública e, se faltar gente, completar com bots.

**Decisão.**

1. **Evento novo `client:jogar:rapido`** (`jogadorId`, `nome`, `tamanho` de 2 a 10). O servidor procura uma sala
   rápida com o mesmo tamanho, vaga e mais de 2 s de espera restante; se não houver, cria uma sala pública
   (`Sala.rapida = { tamanhoAlvo, iniciaEm }`). O código da sala volta em `server:sessao:emitida`, como na
   entrada comum. Salas rápidas **não** aparecem na listagem de salas públicas (existem por poucos segundos
   e ninguém entra nelas por código).
2. **Espera de 10 s** (`QUICKPLAY_WAIT_MS`, 0 a 120000). Com a mesa cheia de pessoas a partida começa na hora;
   no fim do prazo o servidor completa as vagas com bots e começa. O anfitrião pode antecipar com "Começar agora
   com bots" (`client:iniciar:partida`, que numa sala rápida completa com bots em vez de exigir 2 pessoas).
3. **Bots no servidor**, pelo mesmo motor que já jogava no cliente (`executarTurnoBot`, nível médio). Um
   `QuickPlayDirector` observa cada estado gravado pelo `RoomStore` (`setCommitHandler`) e agenda a vez do bot
   com uma pausa de 0,9 a 1,7 s. Observar o `commit` evita lógica duplicada: jogada, compra, janela de
   Corta-Frente que expira e reconexão já passam por ali.
4. **Corta-Frente em sala com bots:** a janela de 5 s só abre se algum **humano** puder interceptar. Abrir a
   janela sempre travaria a mesa 5 s a cada jogada; abri-la só quando alguém tem carta idêntica vazaria a mão.
   Por isso a regra olha só as cartas dos humanos (`shouldOpenInterception`), e os bots não interceptam.
5. **Limpeza:** sala rápida terminada, ou sem nenhum humano conectado por 60 s, sai da memória. Reconexões
   rápidas mantêm a vaga (token de retomada, como nas salas comuns).
6. **Persistência:** o snapshot de salas guarda `rapida` e a validação rejeita valores malformados.
7. **Cliente:** "Jogar agora" vira o caminho principal e abre a tela "Mesa pública" (contagem, lugares, bots
   que vão completar). "Só contra bots, neste aparelho" mantém a partida local. Sem internet o botão principal já
   joga localmente; com internet mas sem resposta do servidor em 8 s, a busca vira partida local em vez de deixar
   a pessoa esperando.

**Consequências.**

- Quem jogar sozinho sempre começa em até 10 s, e as pessoas que chegarem juntas se encontram na mesma mesa.
- Bots passam a rodar no servidor, que antes só mediava humanos: mais CPU por sala, mas o custo por jogada é
  pequeno (uma decisão por 1 s).
- ⚠ Atualizar a VPS exige reiniciar `kabemjunto.service` (ver `docs/OPERACAO-VPS.md`). Salas antigas sem `rapida`
  continuam válidas.
- ❌ Ainda não medido com jogadores reais; o tempo de espera (10 s) é um palpite a revisar com dados.
