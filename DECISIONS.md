# DECISIONS (ADRs) — Kabemjunto

Este arquivo registra as Decisões de Arquitetura (ADRs) do projeto Kabemjunto.

## Índice de ADRs

- [ADR-001: Modelagem Canônica das 108 Cartas e Tipos Shared](#adr-001-modelagem-canônica-das-108-cartas-e-tipos-shared)
- [ADR-002: Palette de Cores HSL e Sistema de Design SVG/CSS](#adr-002-palette-de-cores-hsl-e-sistema-de-design-svgcss)
- [ADR-003: Lock Estrito por Issue (Regra de Convivência Multi-Agente)](#adr-003-lock-estrito-por-issue-regra-de-convivência-multi-agente)
- [ADR-004: Refactor do Motor de Regras para `packages/shared/src/rules/`](#adr-004-refactor-do-motor-de-regras-para-packagessharedsrules)

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
