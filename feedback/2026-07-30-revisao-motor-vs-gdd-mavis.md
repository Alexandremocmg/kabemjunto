# Revisão — Motor de regras vs. documentação canônica

**Revisor:** Mavis
**Data:** 2026-07-30
**Escopo:** `packages/shared/src/rules/**`, `apps/server/src/room-store.ts`,
`apps/web/src/services/gameEngine.ts` contra `GDD-Kabemjunto.md` §7 e
`02-game-design.md` §5 / §10.
**Motivo:** relato de que o jogo "não está como esperado".

---

## Resumo

Duas divergências **de regra** entre o motor e a documentação canônica, ambas
afetando diretamente a sensação de jogo. Corrigidas com testes que falhavam
antes da correção. Além disso, 6 observações menores registradas como
proposta, sem alteração de comportamento.

| #   | Achado                                               | Severidade  | Status                |
| --- | ---------------------------------------------------- | ----------- | --------------------- |
| 1   | Comprar 1 carta sempre perdia o turno                | **Alta**    | ✅ Corrigido          |
| 2   | Starter Skip/Reverse não tinha efeito                | **Média**   | ✅ Corrigido          |
| 3   | Teste do servidor não-determinístico (flaky latente) | Média       | ✅ Corrigido          |
| 4   | `state-machine.ts` é código morto                    | Baixa       | ✅ Removido (adendo)  |
| 5   | Compras voluntárias repetidas no mesmo turno         | Baixa       | ✅ Corrigido (adendo) |
| 6   | `+4` como última carta deixa ataque residual         | Baixa       | ✅ Corrigido (adendo) |
| 7   | `origem: 'STALEMATE'` declarado e nunca emitido      | Baixa       | ✅ Corrigido (adendo) |
| 8   | Tabela do GDD soma 68, não 108                       | Baixa (doc) | ✅ Corrigido (adendo) |
| 9   | Nota do `STATUS.md` sobre silêncio está obsoleta     | Baixa (doc) | ✅ Corrigido (adendo) |

---

## 1. Comprar 1 carta sempre perdia o turno (Alta)

**Canônico.** `GDD-Kabemjunto.md` §7: _"Sem carta válida: comprar 1 do Monte de
Compra. **Se a carta comprada puder ser jogada, pode descartar imediatamente.**
Senão, mantém na mão e passa o turno."_ E `02-game-design.md` §5.2 separa
explicitamente os dois casos:

| De                  | Para            | Gatilho                                        |
| ------------------- | --------------- | ---------------------------------------------- |
| `COMPRAR` (defesa)  | `FIM_TURNO`     | quem pagou ataque **perde** o turno            |
| `COMPRAR` (1 carta) | `ESPERAR_CARTA` | devolve ao mesmo jogador; **ele pode jogá-la** |

**O que havia.** `comprarCartas()` passava o turno em **todos** os casos
(`vezDe: proximoJogador`, incondicional). Os dois callers reais
(`RoomStore.buy` e `gameEngine.comprar`) não compensavam, então valia igual em
Local e Online: comprar era sempre perder a vez, mesmo comprando uma carta
jogável. É o candidato mais provável para "o jogo não está como eu esperava" —
comprar parecia punição dupla.

**Correção.** `buy-cards.ts` agora decide a posse do turno:

- pagando ataque (`ataqueAcumulado > 0`) → paga, zera a pilha e **passa** o turno;
- compra voluntária de 1 carta **jogável** → **mantém** o turno;
- carta não jogável, ou monte esgotado (§10.5) → passa o turno.

O resultado expõe `turnoMantido: boolean` para a UI não anunciar passagem de
turno indevidamente.

**Por que não há risco de travar o jogador:** o turno só é mantido quando a
carta comprada é jogável, ou seja, o jogador sempre tem uma jogada válida
disponível. Isso importa porque **não existe ação de "passar turno"** no
contrato (`socket-events.ts`) — manter o turno sem jogada válida criaria
softlock.

**Efeito colateral tratado:** o bot (`bot-turn.ts`) compra quando não tem
jogada; com o turno mantido ele entraria em laço infinito. Agora, se o turno
permanece, o bot joga a carta comprada na mesma ação.

## 2. Starter Skip/Reverse não tinha efeito (Média)

**Canônico.** `02-game-design.md` §10.7: o efeito da primeira carta virada
recai sobre o primeiro jogador — `SKIP` pula o primeiro; `REVERSE` com 3+
inverte o sentido e a vez vai para o último; `REVERSE` com 2 devolve a vez ao
primeiro.

**O que havia.** `criarPartidaInicial` fixava `vezDe: jogadores[0]` e
`sentido: 1` sempre. Só `+2` era tratado (via `calcularAtaqueInicial`).

**Correção.** Nova `calcularAbertura(starter, totalJogadores)` aplica as três
regras. Com 2 jogadores o sentido é indiferente para a ordem de turno
(`(idx ± 1) % 2` dá o mesmo jogador), então seguimos o pseudocódigo do GDD à
risca e mantemos `sentido: 1` nesse caso.

## 3. Teste do servidor não-determinístico (Média)

`room-store.test.ts > "calcula a compra no servidor e passa o turno"` usava o
baralho real embaralhado **sem seed** e afirmava `vezDe` diferente. Passou por
sorte na primeira execução após a correção nº 1 e falhou na seguinte — flaky
latente que existia desde antes (só não aparecia porque o turno passava
sempre). Reescrito para afirmar a **regra** em vez de um resultado fixo:
`turno mantido ⟺ (sem ataque ∧ carta comprada jogável)`. Validado com 5
execuções consecutivas verdes.

O mesmo padrão foi corrigido em `snapshot.test.ts`, que criava estado com
`Math.random` (sem `rng`) e dependia da antiga semântica de compra para ser
determinístico.

---

## Propostas (sem alteração de comportamento nesta revisão)

**4. `state-machine.ts` é código morto.** Os 8 estados e a tabela de
transições estão implementados, exportados e cobertos por 19 testes, mas
`transicionar`/`inferirEstadoTurno` **não são chamados em nenhum ponto do
fluxo real** (só nos próprios testes). Pior: a tabela modela
`COMPRANDO → CARTA_SELECIONADA` — isto é, a regra canônica que o motor real
violava (achado nº 1). O módulo dava uma falsa sensação de cobertura.
_Proposta:_ decidir entre ligá-la ao fluxo (vira fonte única do turno,
ganho real de testabilidade) ou removê-la; manter como está é dívida que
engana futuras revisões.

**5. Compras voluntárias repetidas no mesmo turno.** Com o turno mantido, o
jogador pode clicar em comprar novamente. Não é laço infinito (assim que sai
uma carta não jogável o turno passa) e não há incentivo — acumular cartas
afasta a vitória. Mas o GDD §7 fala em comprar **1** carta.
_Proposta:_ recusar a segunda compra voluntária no mesmo turno, ou permitir
comprar apenas quando não há jogada válida. Não fiz agora para não alterar UX
sem decisão do dono.

**6. `+4` como última carta deixa ataque residual.** GDD §10.8: vence após
escolher a cor e _"o efeito de +4 não é aplicado"_. Em `execute-play.ts` a
ação é resolvida antes do cheque de vitória, então o estado final fica com
`ataqueAcumulado: 4` mesmo com `finalizada: true`. Não afeta o resultado, mas
uma tela de vitória que leia esse campo mostraria um ataque inexistente.

**7. `origem: 'STALEMATE'` nunca é emitido.** O tipo em `game.ts` e o
validador de snapshot em `persistence.ts` aceitam o valor, mas nenhum caminho
o produz — o esgotamento de monte (§10.5) sai silencioso via `break`.
_Proposta:_ emitir o evento no esgotamento, para o histórico explicar por que
o turno passou sem compra.

**8. Tabela do GDD soma 68, não 108.** `GDD-Kabemjunto.md:71` diz
`108 (40 numeradas + 12 ação colorida + 8 neutras + 4x +4 + 4 especiais
únicas)` → 68. A composição real (e correta) é 100 coloridas (25 por cor: 19
numeradas + 6 de ação) + 8 neutras = 108, conforme `gerarBaralho108()` e o
teste `deck108.test.ts`. O texto detalhado de §7 está certo; só a linha-resumo
está inconsistente. _Proposta:_ corrigir a linha do GDD.

**9. Nota obsoleta no `STATUS.md`.** A regra permanente da Carta 7 diz que _"a
implementação futura deve trocar a representação de um único `jogadorQuebrou`
por um conjunto/lista"_. Isso **já foi feito**: `silence.ts` usa
`jogadoresQuebraram: JogadorId[]` e valida no servidor
(`socket.ts` → `penalizeSilenceBreak`). _Proposta:_ atualizar a nota para não
sugerir trabalho já concluído.

---

## Conformidade verificada (sem achados)

- Baralho 108 com a composição correta por cor.
- Setup: 7 cartas por jogador; starter nunca neutra (§10.6).
- Acúmulo assimétrico: `+2/+2`, `+4/+2`, `+4/+4` OK e `+2/+4` proibido.
- `0+`: sem ataque é coringa neutro puro; com ataque identifica o último
  atacante pelo histórico canônico, força a compra integral, encerra a pilha e
  passa a vez a partir do alvo, sem rebate (§10.9, §10.15).
- Regra do 7: janela até a próxima carta, punição de +2 uma vez por jogador
  por janela, sem passar turno, com `SILENCIO_QUEBRADO` + compras
  `REGRA_DO_7` auditáveis.
- Descarte múltiplo: mesma face, primeira válida contra a mesa, última define
  a cor, `+2` soma, Skip acumula, Reverse inverte só em quantidade ímpar, e
  neutras/7 corretamente proibidas no lote.
- Troca Mão / Gira Mão / Coringa Simples conforme §7.
- Vitória instantânea ao esvaziar a mão.

## Verificação

- `npm run validate` — typecheck, lint, Prettier, **327/327 testes**, build.
- `npx playwright test` — **26/26 E2E**.
- `room-store.test.ts` — 5 execuções consecutivas verdes (anti-flake).
- 9 testes novos em `gdd-turn-conformance.test.ts`, todos falhando antes das
  correções (8/9 vermelhos; o 9º passava por coincidência) e verdes depois.

## Pendências

Nada bloqueante nesta rodada — ver adendo abaixo, onde as 6 propostas foram
executadas.

---

## Adendo (mesmo dia) — execução das propostas 4–9

O dono pediu pra executar as propostas. Ordem: mais simples/seguras primeiro.

### 6. Ataque residual na vitória com +2/+4 — corrigido

`execute-play.ts` e `multiple-discard.ts`: no branch de vitória, agora
zeram `ataqueAcumulado`/`ataqueStack` no estado final (GDD §10.8 — "o
efeito de +4 não é aplicado" quando é a carta vencedora). Teste novo em
`gdd-turn-conformance.test.ts`. Dois testes existentes (`room-store.test.ts`
e `socket.test.ts`, cenário de descarte múltiplo terminando em vitória)
afirmavam o ataque residual como esperado — atualizados para afirmar
`finalizada`/`vencedor` e ataque zerado.

### 7. Evento de monte esgotado — corrigido (com desvio da proposta original)

`origem: 'STALEMATE'` em `CARTA_COMPRADA` não dá pra usar de verdade: quando
o monte esgota antes de completar a compra, **nenhuma carta é obtida**
naquele passo, então não há `cartaId` pra anexar o evento. Em vez de forçar
esse campo, criei um evento novo — `MONTE_ESGOTADO` (`jogadorId`,
`cartasSolicitadas`, `cartasObtidas`) — em `types/game.ts`, com validação
correspondente em `persistence.ts` (`EVENT_TYPES` + `isGameEvent`).
`buy-cards.ts` emite esse evento no ponto exato do esgotamento (cobre tanto
o caso de 0 cartas obtidas quanto compra parcial de um ataque grande). Dois
testes novos.

### 8 e 9. Documentação — corrigidas

- `GDD-Kabemjunto.md:71`: linha-resumo trocada de "40 numeradas + 12 ação
  colorida + 8 neutras + 4x +4 + 4 especiais únicas" (soma 68) para "100
  coloridas: 25 por cor × 4 cores + 8 neutras: 4x +4, Troca Mão, Gira Mão,
  0+, Coringa Simples" (soma 108, batendo com `gerarBaralho108()` e
  `deck108.test.ts`).
- `STATUS.md`: nota que pedia trocar `jogadorQuebrou` único por lista —
  já implementado (`jogadoresQuebraram: JogadorId[]` em `silence.ts`) —
  atualizada pra refletir isso em vez de pedir trabalho já feito.

### 4. `state-machine.ts` — removido

Confirmado por grep: só era importado por `rules/index.ts` e pelo próprio
teste, nenhum consumidor em `apps/`. Removidos `state-machine.ts` e
`state-machine.test.ts` (19 testes a menos, mas testavam código morto),
export retirado de `rules/index.ts`, e os 2 comentários em `snapshot.ts`
que citavam `inferirEstadoTurno` como alternativa de validação foram
trocados pra citar `validarJogada`.

### 5. Bloquear compra voluntária com carta válida na mão — corrigido

Este era o item de maior risco: fechar a brecha de "comprar de novo
tentando uma carta melhor" significa que `comprarCartas()` agora **recusa**
a compra voluntária (`ataqueAcumulado === 0`) se o jogador já tem qualquer
carta jogável na mão — `throw new Error('Você tem uma carta válida na mão —
jogue-a em vez de comprar.')`. Pagar ataque nunca é bloqueado por essa
regra.

**Efeitos em cadeia (esperados, todos corrigidos):**

- `RoomStore.buy()` agora captura o erro e traduz pra
  `RoomError('JOGADA_INVALIDA', mensagem)`, no mesmo padrão de `play()`.
- **11 testes existentes** que chamavam `comprarCartas()`/`store.buy()`
  sobre um estado onde o jogador podia ter uma carta jogável por
  coincidência (baralhos reais embaralhados, ou mãos não controladas para
  esse fim) passaram a falhar — não por regressão, mas porque agora
  exercitavam exatamente a regra nova. Cada um foi ajustado pra isolar o
  que realmente queria testar:
  - `create-game.test.ts` (4 testes) e `property-based.test.ts` (2 testes):
    mão do jogador esvaziada (ou cartas realocadas pro monte de compra, pra
    não quebrar a conservação de cartas) antes de comprar, quando o teste
    é sobre a mecânica de compra, não sobre jogabilidade.
  - `snapshot.test.ts` (4 testes): trocado `comprarCartas()` direto pelo
    helper `comprarParaJogador1()` (já existente, manipula a mão sem passar
    pela regra) — esses testes são sobre snapshot/undo-redo, não sobre
    compra.
  - `zero-plus-silence.test.ts` (1 teste): mão esvaziada antes de comprar —
    o teste prova que silêncio não bloqueia compra, não que a compra é
    sempre permitida.
  - `room-store.test.ts` (1 teste, o mesmo da correção #3): virou um teste
    condicional — se o baralho real deu carta válida pro jogador, afirma
    que `buy()` recusa; senão, roda as asserções originais. Validado com 8
    execuções consecutivas verdes (os dois ramos são exercitados
    naturalmente pela aleatoriedade real do baralho).
- **UI**: adicionado o mesmo cálculo de "tem carta válida" em
  `MesaDeJogo.tsx` (Local) e `MesaOnline.tsx` (Online) — o monte de compra
  fica visualmente desabilitado (`jogavel={false}`, com `motivoBloqueio`)
  quando o jogador já pode jogar, em vez de deixar o clique estourar erro.
  Para `MesaOnline.tsx`, que só tem `EstadoPartidaPublico` (sem
  `monteDescarte`, só `topo`), montei um objeto mínimo compatível com o que
  `validarJogada()` realmente usa (`vezDe`, `finalizada`, `monteDescarte`,
  `ataqueAcumulado`, `corAtiva` — nenhum depende de mão alheia).

### Verificação do adendo

- `npm run validate` — **312/312 testes**, typecheck/lint/Prettier/build ok.
- `npx playwright test` — **26/26 E2E** (inclui fluxos de compra em mesa
  local e online, então a mudança de UI foi exercitada de ponta a ponta).
- `git diff --check` — limpo.
- `room-store.test.ts` rodado 8x seguidas pra confirmar que o teste
  condicional (baralho real) cobre os dois ramos sem flake.

### Pendências

Nenhuma. As 6 propostas da rodada anterior estão implementadas, testadas e
com o gate integral verde.
