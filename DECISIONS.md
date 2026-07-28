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
