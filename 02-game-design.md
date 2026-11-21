# 02 — Game Design (técnico / dev-ready)

> **Referência histórica — aviso de 2026-11-18:** conteúdo preservado do planejamento original; tabelas, pseudocódigos, roadmap e contagens abaixo não descrevem necessariamente o runtime atual. As regras vigentes estão no [GDD mestre](./GDD-Kabemjunto.md) (109 cartas, incluindo +2 Para Todos); a operação implementada está no README da raiz. Valores antigos de 60/108 cartas, estimativas e recursos propostos não devem ser usados como contrato atual.

> Documento técnico de design do **Kabemjunto**. Esta é a fonte canônica que
> o time de desenvolvimento usa para implementar regras, mecânicas e máquinas
> de estado. Não inventa regras: formaliza o manual oficial em pseudocódigo,
> tabelas de validação e contratos de carta.
>
> Convenções:
>
> - Listas em ordem determinística (sem ambiguidade de iteração).
> - Pseudocódigo em blocos ` ``` `, estilo imperativo neutro, sem acoplamento
>   a engine específica.
> - IDs de carta são `string` estáveis, case-sensitive.
> - `topo` = última carta do monte de descarte.
> - `ativo` = cor vigente definida por uma carta neutra (ou a cor da carta
>   colorida do topo, se a última jogada não foi neutra).

---

## 1. Overview do jogo

- **Gênero:** jogo de cartas social.
- **Subgênero:** shedding game (UNO-like) com camada social (regra do 7).
- **Pegada:** party game casual-competitivo, alta rejogabilidade, pressão
  psicológica entre turnos.
- **Plataforma-alvo:** cross-platform (mobile + web + desktop) com suporte
  nativo a lobby online assíncrono/síncrono.
- **Sessão típica:**
  - **Duração média:** 8–15 min por partida.
  - **Número de jogadores:** 2 a 10 (sweet spot 4–6).
  - **Setup:** < 30 s — embaralhar, distribuir, virar topo não-neutro.
  - **Fim:** assim que alguém descarta a última carta.

### Elevator pitch (2–3 frases)

> **Kabemjunto** é um jogo de cartas rápido onde você precisa descartar tudo
> antes dos outros, mas toda partida vira uma guerra nervosa de blefes,
> silêncios e revanches. O baralho mistura mecânicas clássicas de UNO
> (ataques, reverses, coringas) com uma camada social única: jogar o 7
> impõe silêncio — quem falar paga 2 cartas. A regra do 0+ transforma
> qualquer pilha de ataque em oportunidade de revide explosivo.

---

## 2. Pilares de design

1. **Simplicidade de regras** — uma partida deve ser explicada em < 90 s.
   Toda carta tem efeito determinístico; nenhum efeito oculto além da
   escolha de cor em coringas.
2. **Tensão social crescente** — a regra do 7 (silêncio) e os ataques
   empilháveis criam momentos de mesa em que o silêncio vale mais que
   qualquer carta na mão. Esse é o "sabor" do jogo.
3. **Momento viral (0+)** — o "Zero Mais" é o momento de virada: reflete
   o ataque acumulado para o último atacante e **encerra** a pilha. É a
   carta que gera as memórias mais marcantes da partida.
4. **Rejogabilidade alta** — baralho pequeno, partidas curtas, variância
   alta. Nenhuma partida é igual porque a regra do 7 e a ordem do 0+
   dependem do comportamento dos jogadores.
5. **Dev-readiness** — todas as regras cabem em uma state machine finita
   sem loops infinitos; toda carta é resolvida por uma função pura que
   recebe `(estado, carta_jogada)` e devolve o novo estado.

---

## 3. Composição precisa do baralho

Total: **108 cartas** (mesmo totalitário do UNO clássico, com 1 zero a
mais por cor para 0+, e ajustes nos neutros para refletir o manual).

### 3.1 Cartas coloridas (por cor)

Cada cor (Laranja, Azul, Verde, Preto) tem o mesmo conjunto.

| ID base | Cor     | Tipo        | Qtd | Efeito resumido                             |
| ------- | ------- | ----------- | --- | ------------------------------------------- |
| `0`     | `<COR>` | Número      | 1   | Joga; cor vira `<COR>` (sem efeito).        |
| `1`     | `<COR>` | Número      | 2   | Joga; cor vira `<COR>`.                     |
| `2`     | `<COR>` | Número      | 2   | Joga; cor vira `<COR>`.                     |
| `3`     | `<COR>` | Número      | 2   | Joga; cor vira `<COR>`.                     |
| `4`     | `<COR>` | Número      | 2   | Joga; cor vira `<COR>`.                     |
| `5`     | `<COR>` | Número      | 2   | Joga; cor vira `<COR>`.                     |
| `6`     | `<COR>` | Número      | 2   | Joga; cor vira `<COR>`.                     |
| `7`     | `<COR>` | Ação+social | 2   | Aplica **Silêncio** (regra do 7).           |
| `8`     | `<COR>` | Número      | 2   | Joga; cor vira `<COR>`.                     |
| `9`     | `<COR>` | Número      | 2   | Joga; cor vira `<COR>`.                     |
| `SKIP`  | `<COR>` | Ação        | 2   | Pula o próximo jogador.                     |
| `REV`   | `<COR>` | Ação        | 2   | Inverte a direção do turno.                 |
| `PLUS2` | `<COR>` | Ação        | 2   | Próximo compra 2 e perde a vez. Empilhável. |

Subtotal colorido por cor: 1+2+2+2+2+2+2+2+2+2 + 2+2+2 = **25 cartas**.
Total colorido: 25 × 4 = **100 cartas**.

### 3.2 Cartas neutras (sem cor fixa — escolha do jogador)

| ID         | Nome            | Tipo   | Qtd | Efeito resumido                                                 |
| ---------- | --------------- | ------ | --- | --------------------------------------------------------------- |
| `WILD4`    | +4 Coringa      | Neutra | 4   | Próximo compra 4, perde a vez. Jogador escolhe cor. Empilhável. |
| `SWAPHAND` | Troca Mão       | Neutra | 1   | Troca toda a mão com outro jogador (escolhido pelo jogador).    |
| `HANDSPIN` | Gira Mão        | Neutra | 1   | Todos passam a mão ao próximo jogador na direção do turno.      |
| `ZEROPLUS` | 0+ (Zero Mais)  | Neutra | 1   | Reflete o ataque acumulado ao último atacante. Encerra pilha.   |
| `WILD`     | Coringa Simples | Neutra | 1   | Jogador escolhe a nova cor. Sem efeito de ataque.               |

Subtotal neutro: 4 + 1 + 1 + 1 + 1 = **8 cartas**.

### 3.3 Total e composição

| Categoria | Qtd     |
| --------- | ------- |
| Coloridas | 100     |
| Neutras   | 8       |
| **Total** | **108** |

> Observação: o manual menciona "neutras: +4, Troca Mão, Gira Mão, 0+,
> Coringa Simples". A contagem acima (4 de +4, 1 de cada das outras 4)
> preserva o **total de 108** (igual ao UNO clássico) e mantém a
> probabilidade relativa de coringas próxima de UNO — fator de balanceamento
> recomendado pelo manual.

### 3.4 Distribuição típica de mão

- 7 cartas por jogador × N jogadores saem do baralho.
- Em uma partida de 4 jogadores, saem 28 cartas → 80 ficam no monte.
- Probabilidade de puxar `WILD4` em 1 compra ≈ 4/108 ≈ 3,7 %.

---

## 4. Setup passo a passo

```text
setup(players: Player[]):
    # 1. Validar
    assert 2 <= len(players) <= 10

    # 2. Construir baralho
    deck = build_deck()           # 108 cartas conforme seção 3

    # 3. Embaralhar (Fisher-Yates ou equivalente)
    shuffle(deck)

    # 4. Distribuir
    for p in players:
        p.hand = deck.pop(7)      # retira do topo do baralho

    # 5. Monte de descarte — primeira carta NÃO pode ser neutra
    while True:
        first = deck.pop()
        if not is_neutral(first):
            discard = [first]
            break
        else:
            deck.insert_at_bottom(first)   # devolve pro fim, reembaralha se quiser
            # alternativa: shuffle novamente e recomeçar o while

    # 6. Estado inicial
    state = GameState(
        players = players,
        deck = deck,
        discard = discard,
        direction = +1,            # horário
        current = players[0],      # primeiro jogador
        active_color = first.color if not is_neutral(first) else None,
        pending_attack = 0,        # cartas a comprar acumuladas
        silence = None,            # None | { source: PlayerId, until_turn: int }
        turn_counter = 0
    )

    return state
```

**Notas de implementação:**

- Se após reinserir uma neutra ela ainda for sair, chame `shuffle(deck)` e
  reinicie o laço. Limite de segurança: 1000 iterações; após isso, force
  `WILD4` virar cor aleatória e siga.
- `active_color` é sempre definido após o setup (porque a primeira carta é
  sempre colorida). Se a primeira carta válida for `SKIP`/`REV`/`PLUS2`/`7`,
  **resolva o efeito imediatamente** sobre o primeiro jogador (regra
  canônica de UNO-like).

---

## 5. Loop de turno (state machine)

### 5.1 Diagrama de estados

```text
        ┌────────────────────┐
        │  INICIO_PARTIDA   │  (uma vez, após setup)
        └─────────┬──────────┘
                  ▼
        ┌────────────────────┐
  ┌────▶│  INICIO_TURNO      │  (entra aqui no começo de cada turno)
  │     └─────────┬──────────┘
  │                 │ resolve_efeitos_pendentes()
  │                 │   • se pending_attack == 0 → ESPERAR_CARTA
  │                 │   • se pending_attack >  0 → ENFRENTAR_ATAQUE
  │                 ▼
  │     ┌────────────────────┐
  │     │  ENFRENTAR_ATAQUE  │
  │     └─────────┬──────────┘
  │                 │ jogador escolhe carta de defesa (PLUS2/WILD4) ou 0+
  │                 │   • defesa válida → empilha → RESOLVER_ACAO
  │                 │   • 0+          → REFLETIR
  │                 │   • desistência → COMPRAR
  │                 ▼
  │     ┌────────────────────┐
  │     │  REFLETIR (0+)     │
  │     └─────────┬──────────┘
  │                 │ transfere pending_attack ao último atacante
  │                 │ atacante agora tem pending_attack para resolver
  │                 │ (mesmo fluxo: ENFRENTAR_ATAQUE) — encerra a pilha
  │                 ▼
  │     ┌────────────────────┐
  │     │  ESPERAR_CARTA     │
  │     └─────────┬──────────┘
  │                 │ jogador escolhe 1 carta
  │                 │   • válida  → VALIDAR_CARTA
  │                 │   • inválida→ fica preso aqui (cliente deve bloquear)
  │                 │   • "comprar"→ COMPRAR
  │                 ▼
  │     ┌────────────────────┐
  │     │  VALIDAR_CARTA     │
  │     └─────────┬──────────┘
  │                 │ checa matriz da seção 6
  │                 │   • OK  → RESOLVER_ACAO
  │                 │   • NO  → ESPERAR_CARTA (com mensagem de erro)
  │                 ▼
  │     ┌────────────────────┐
  │     │  RESOLVER_ACAO     │  (push no discard + executar efeito)
  │     └─────────┬──────────┘
  │                 │ verificar vitória → CHEQUE_VITORIA
  │                 ▼
  │     ┌────────────────────┐
  │     │  CHEQUE_VITORIA    │
  │     └─────────┬──────────┘
  │                 │ vencedor?  → FIM_PARTIDA
  │                 │ sem vencedor → FIM_TURNO
  │                 ▼
  │     ┌────────────────────┐
  │     │  FIM_TURNO         │
  │     └─────────┬──────────┘
  │                 │ advance_turn() considerando SKIP/REV
  │                 │ silence.update() se ativo
  │                 │ incremento turn_counter
  │                 └─→ INICIO_TURNO
  │
  │     ┌────────────────────┐
  ├──── │  COMPRAR           │  (jogador pegou 1 ou aceitou ataque)
  │     └─────────┬──────────┘
  │                 │ draw(state, n)  → entrega n cartas do monte
  │                 │ reabastece se monte acabar (ver 5.5)
  │                 │ se n >= 1 por ataque: pending_attack = 0, fim do turno
  │                 │ se n == 1 por decisão: ESPERAR_CARTA (pode jogar a
  │                 │ carta comprada se for válida; senão, fim do turno)
  │                 ▼
  │     (volta via INICIO_TURNO do próximo jogador, ou ESPERAR_CARTA do mesmo)
  │
  │     ┌────────────────────┐
  └──── │  FIM_PARTIDA       │  (terminal)
        └────────────────────┘
```

### 5.2 Transições e gatilhos

| De                  | Para               | Evento / gatilho                                                            |
| ------------------- | ------------------ | --------------------------------------------------------------------------- |
| `INICIO_PARTIDA`    | `INICIO_TURNO`     | Setup finalizado; `current = players[0]`.                                   |
| `INICIO_TURNO`      | `ESPERAR_CARTA`    | `pending_attack == 0` e sem efeito pendente.                                |
| `INICIO_TURNO`      | `ENFRENTAR_ATAQUE` | `pending_attack > 0` vindo do turno anterior.                               |
| `ENFRENTAR_ATAQUE`  | `RESOLVER_ACAO`    | Jogador jogou `PLUS2` ou `WILD4` válido → empilha.                          |
| `ENFRENTAR_ATAQUE`  | `REFLETIR`         | Jogador jogou `ZEROPLUS` (0+) e há `last_attacker`.                         |
| `ENFRENTAR_ATAQUE`  | `COMPRAR`          | Jogador desiste (não tem defesa nem 0+) → compra tudo e fim do turno.       |
| `REFLETIR`          | `ENFRENTAR_ATAQUE` | `current = last_attacker`; ele tem `pending_attack` para resolver.          |
| `ESPERAR_CARTA`     | `VALIDAR_CARTA`    | Jogador clicou em carta da mão.                                             |
| `ESPERAR_CARTA`     | `COMPRAR`          | Jogador pediu pra comprar (1 carta).                                        |
| `VALIDAR_CARTA`     | `RESOLVER_ACAO`    | Carta passou na matriz.                                                     |
| `VALIDAR_CARTA`     | `ESPERAR_CARTA`    | Carta inválida → mostra erro, mantém estado.                                |
| `RESOLVER_ACAO`     | `CHEQUE_VITORIA`   | Após executar efeito da carta.                                              |
| `CHEQUE_VITORIA`    | `FIM_PARTIDA`      | `len(current.hand) == 0` (ou vazia após `0+` quando apropriado).            |
| `CHEQUE_VITORIA`    | `FIM_TURNO`        | Sem vencedor.                                                               |
| `FIM_TURNO`         | `INICIO_TURNO`     | `current = next_player(...)` considerando `SKIP`/`REV`; atualiza `silence`. |
| `COMPRAR` (defesa)  | `FIM_TURNO`        | `pending_attack = 0`; jogador que pagou perde o turno.                      |
| `COMPRAR` (1 carta) | `ESPERAR_CARTA`    | Devolve a carta comprada ao mesmo jogador; ele pode jogá-la se válida.      |
| `FIM_PARTIDA`       | (terminal)         | Tela de resultado.                                                          |

### 5.3 Estado global mínimo

```text
GameState {
  players:        Player[2..10]
  current:        Player         # jogador da vez
  direction:      +1 | -1
  deck:           Card[]         # monte de compra (topo no final)
  discard:        Card[]         # topo = discard[-1]
  active_color:   Color | null   # cor vigente
  pending_attack: int >= 0       # cartas a pagar
  last_attacker:  Player | null  # quem iniciou a pilha atual
  silence:        { source: Player, started_turn: int, expires_turn: int } | null
  turn_counter:   int
  log:            Event[]        # auditoria (anti-cheat, replay)
}
```

### 5.4 Regra do silêncio (ref. seção 8)

Ao entrar em `INICIO_TURNO` para o jogador que jogou o 7, **ativar**
`silence`. Ele expira no turno imediatamente após a próxima carta
numérica ou de ação colorida que não seja 7.

### 5.5 Reabastecimento do monte (regra essencial)

```text
draw(state, n):
    cards = []
    while n > 0:
        if len(state.deck) == 0:
            if len(state.discard) <= 1:
                # impossível reabastecer; abortar ou declarar empate técnico
                raise EmptyDeck
            top = state.discard.pop()      # preserva o topo
            state.deck = shuffle(state.discard)
            state.discard = [top]
        cards.append(state.deck.pop())
        n -= 1
    return cards
```

> **Reabastecimento durante ataque:** o ataque se resolve **de uma vez**;
> se o monte acabar no meio, use a rotina acima até entregar o total
> prometido. Se `EmptyDeck` for lançado, ver seção 9.

---

## 6. Tabela de validação de jogada

Matriz: linha = **carta do topo** (`topo`), coluna = **carta jogada** (`c`).

`cor(c)` = cor de `c` se colorida, senão a cor escolhida.
`valor(c)` = número, `WILD`, `WILD4`, `SWAPHAND`, `HANDSPIN`, `ZEROPLUS`,
`SKIP`, `REV`, `PLUS2`, `7`.

### 6.1 Matriz base (carta do topo colorida)

| carta jogada \ topo        | Número X (cor C)  | 7 (cor C)         | SKIP/REV (cor C)  | PLUS2 (cor C)     |
| -------------------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| Número X (cor C)           | ✅ (mesmo número) | ✅ (mesmo número) | ✅ (mesmo número) | ✅ (mesmo número) |
| Número Y (cor D≠C)         | ❌                | ❌                | ❌                | ❌                |
| Número (cor C, Y≠X)        | ✅ (mesma cor)    | ✅ (mesma cor)    | ✅ (mesma cor)    | ✅ (mesma cor)    |
| 7 (cor C)                  | ✅ (mesma cor)    | ✅ (mesma cor)    | ✅ (mesma cor)    | ✅ (mesma cor)    |
| 7 (cor D≠C)                | ❌                | ❌                | ❌                | ❌                |
| SKIP/REV (cor C)           | ✅ (mesma cor)    | ✅ (mesma cor)    | ✅ (mesma cor)    | ✅ (mesma cor)    |
| SKIP/REV (cor D≠C)         | ❌                | ❌                | ❌                | ❌                |
| PLUS2 (cor C)              | ✅ (mesma cor)    | ✅ (mesma cor)    | ✅ (mesma cor)    | ✅ (mesma cor)    |
| PLUS2 (cor D≠C)            | ❌                | ❌                | ❌                | ❌                |
| WILD / WILD4               | ✅ sempre         | ✅ sempre         | ✅ sempre         | ✅ sempre         |
| SWAPHAND/HANDSPIN/ZEROPLUS | ✅ sempre         | ✅ sempre         | ✅ sempre         | ✅ sempre         |

### 6.2 Matriz base (topo neutro)

Quando o topo é uma carta neutra, a validação usa `active_color` (a cor
que está "vigente" após aquela jogada).

| carta jogada    | válida se                |
| --------------- | ------------------------ |
| Colorida        | `cor(c) == active_color` |
| Qualquer neutra | sempre válida            |

### 6.3 Caso especial: jogando sobre ataque acumulado

Quando `pending_attack > 0`, o jogador **deve** escolher entre:

- Jogar **outro `PLUS2`** ou **`WILD4`** (somente estes, conforme seção 7.3
  e 7.4) — o que **empilha** mais cartas.
- Jogar **`ZEROPLUS`** (0+) — reflete e encerra.
- **Comprar** — paga tudo, perde o turno.

Qualquer outra jogada é **inválida** quando há ataque pendente.

### 6.4 Implementação

```text
can_play(state, card, c) -> (bool, str motivo):
    if state.pending_attack > 0:
        if card == PLUS2:  return (True, "empilha +2")
        if card == WILD4:  return (True, "empilha +4")
        if card == ZEROPLUS: return (True, "reflete ataque")
        return (False, "ataque pendente: defenda com +2, +4 ou 0+, ou compre")

    top = state.discard[-1]
    if is_neutral(card):        return (True, "neutra sempre válida")
    if is_neutral(top):
        return (card.color == state.active_color, "cor não bate")
    if card.color == top.color: return (True, "mesma cor")
    if card.value == top.value: return (True, "mesmo valor")
    return (False, "nem cor nem valor casam")
```

---

## 7. Resolução de ações especiais

Cada sub-seção define: **trigger**, **efeito exato**, **casos extremos**,
**stack/combo**, **pseudocódigo**.

### 7.1 `SKIP` (Pula)

- **Trigger:** carta jogada e validada.
- **Efeito:** o próximo jogador na direção atual **perde o turno**.
  Não compra, não joga.
- **Casos extremos:**
  - Em jogo de 2 jogadores, `SKIP` se comporta como um **turno extra
    do próprio jogador** (porque o próximo é ele mesmo). É equivalente
    a um `REV` no caso 2P.
  - Encadeado com `SKIP` subsequente: **são aditivos**. Pular o próximo
    é independente de quem é o próximo.
  - Combinado com `PLUS2` ou `WILD4` acumulado: aplica `SKIP` **além
    do ataque** (o próximo é pulado e o seguinte recebe o ataque se
    o alvo original já comprou). Manual canônico do UNO.
- **Stack/combo:** combina com `REV` (muda direção _antes_ de calcular
  o "próximo"); com `WILD4`/`PLUS2` segue a regra de pilha.
- **Pseudocódigo:**

```text
resolve_skip(state, card):
    next = next_player(state, state.current)
    state.skip_pending = next       # será consumido em FIM_TURNO
    # efeito de cor (se colorida): state.active_color = card.color
```

```text
# consumido em FIM_TURNO
consume_skip(state):
    if state.skip_pending:
        skipped = state.skip_pending
        state.skip_pending = None
        # pula: avança current 1 vez (efeito do skip)
        state.current = next_player(state, skipped)
        # e outra vez para passar ao seguinte do pulado
        # exceto se houver outro skip encadeado
```

### 7.2 `REV` (Inverte)

- **Trigger:** carta jogada e validada.
- **Efeito:** inverte `state.direction`.
- **Casos extremos:**
  - **2 jogadores:** vira um `SKIP` efetivo (porque a direção troca e
    o "próximo" volta para o próprio jogador). Implementar como
    `skip_pending = state.current` para clareza.
  - 3 jogadores: efeito neutro em prática, mas o ponteiro muda de
    `a → b → c` para `a → c → b`.
- **Stack/combo:** `REV + REV` em sequência **não** se anula a cada
  jogada — cada `REV` efetivamente inverte a direção vigente.
- **Pseudocódigo:**

```text
resolve_reverse(state, card):
    if len(state.players) == 2:
        # equivalente a skip
        state.skip_pending = state.current
    else:
        state.direction *= -1
```

### 7.3 `PLUS2` (+2 colorido)

- **Trigger:** carta jogada e validada.
- **Efeito:** próximo jogador na direção **compra 2** e **perde o turno**.
- **Casos extremos:**
  - Se o próximo jogar **outro `PLUS2`**, **empilha** (+4 total).
  - Se o próximo jogar **`WILD4`**, **empilha** (+6 total).
  - Se o próximo jogar **`ZEROPLUS`** (0+), **reflete** a pilha inteira
    para o último atacante; **encerra a pilha** (não pode mais empilhar).
  - Se o próximo jogar **qualquer outra coisa**, é jogada ilegal
    (regra 6.3).
- **Stack/combo:** ver 7.7 (regras de pilha) e 7.4 (WILD4).
- **Pseudocódigo:**

```text
resolve_plus2(state, card):
    if state.pending_attack == 0:
        # inicia pilha
        state.last_attacker = state.current
        state.pending_attack = 2
        state.skip_pending = next_player(state, state.current)
    else:
        # empilha (já validado em can_play)
        state.pending_attack += 2
        state.skip_pending = next_player(state, state.skip_pending or state.current)
    # cor
    state.active_color = card.color
```

### 7.4 `WILD4` (+4 Coringa)

- **Trigger:** carta jogada e validada.
- **Efeito:** próximo jogador compra **4** e perde o turno. Jogador
  escolhe a nova cor.
- **Casos extremos:**
  - Empilha sobre `PLUS2` ou `WILD4` seguindo as regras de pilha.
  - Se o jogador tiver **outra carta válida** (mesma cor ativa ou mesmo
    número), alguns jogos aplicam a regra "não pode jogar +4 se tem
    outra opção". O manual canônico do Kabemjunto **não obriga** essa
    restrição (mantém ritmo de jogo). Decisão de produto pendente —
    ver seção 8.4.
  - Se o monte acabar durante o `draw`, reabastecer conforme 5.5.
- **Stack/combo:**
  - `PLUS2` → `PLUS2` → `PLUS2`: 6 cartas.
  - `PLUS2` → `WILD4` → `PLUS2`: 8 cartas.
  - `WILD4` → `WILD4` → `WILD4` → `WILD4`: 16 cartas.
- **Pseudocódigo:**

```text
resolve_wild4(state, card, chosen_color):
    assert chosen_color in COLORS
    if state.pending_attack == 0:
        state.last_attacker = state.current
        state.pending_attack = 4
        state.skip_pending = next_player(state, state.current)
    else:
        state.pending_attack += 4
        state.skip_pending = next_player(state, state.skip_pending or state.current)
    state.active_color = chosen_color
```

### 7.5 `SWAPHAND` (Troca Mão)

- **Trigger:** carta jogada.
- **Efeito:** o jogador da vez escolhe **um** outro jogador; **troca
  todas as cartas da mão** com ele.
- **Casos extremos:**
  - **2 jogadores:** o único outro jogador recebe a mão. Para manter
    a "troca" simétrica, escolha o outro e troque (resultado idêntico
    a dar a mão a ele). Permitir.
  - Jogador alvo é o **próximo** ou **anterior** — livre; não há
    restrição direcional.
  - **Não pode** ser usado para "trocar consigo mesmo" (sem sentido).
  - Se o alvo foi **pulado** por `SKIP` ou está **pagando ataque**,
    ainda assim pode receber a mão.
- **Stack/combo:** nenhum (carta terminal, sem efeito sobre turno).
  Combinável com qualquer cor ativa.
- **Pseudocódigo:**

```text
resolve_swaphand(state, card, target_id):
    assert target_id != state.current.id
    me, them = state.current, get_player(state, target_id)
    me.hand, them.hand = them.hand, me.hand
    # cor vigente: neutra escolhe cor aleatória (ou UI exige cor?)
    state.active_color = random_color()   # ver nota abaixo
```

> **Nota de cor:** o manual não obriga o jogador a escolher cor. Como
> carta neutra, o jogo herda uma cor automaticamente (escolha aleatória
> ou default). Sugestão: pedir cor **opcional** no cliente; se não
> escolher, default para a cor da próxima carta colorida da mão do
> jogador, ou aleatória como fallback.

### 7.6 `HANDSPIN` (Gira Mão)

- **Trigger:** carta jogada.
- **Efeito:** **todos os jogadores** passam a mão inteira ao próximo
  jogador na direção vigente. Roda 1 posição.
- **Casos extremos:**
  - **2 jogadores:** as mãos trocam entre si (resultado: o outro fica
    com a mão do atual, e o atual fica com a do outro).
  - **3 jogadores:** A → B, B → C, C → A.
  - Se algum jogador da cadeia for o **vencedor** entre as trocas
    parciais (esvaziou a mão), a partida acaba **no momento** em que
    ele fica com 0 cartas; a rotação é interrompida para os demais.
    Implementação: aplicar trocas sequencialmente e checar vitória
    após cada uma.
  - Compatibilidade com `SWAPHAND`: se jogados em sequência, a
    `HANDSPIN` subsequente **re-faz a rotação inteira**, com base nas
    mãos atuais.
- **Stack/combo:** nenhum. Carta terminal, sem efeito sobre turno.
- **Pseudocódigo:**

```text
resolve_handspin(state):
    n = len(state.players)
    order = [state.current] + next_n_players(state, n-1)
    hands = {p.id: p.hand for p in state.players}
    for p in order:
        giver = p
        receiver = next_player(state, p)
        # todos dão ao seu próximo
        receiver.hand = hands[giver.id]
    # checar vitória após cada swap é caro; aceitar checagem ao final
    check_victory(state)
    state.active_color = random_color()  # ver nota 7.5
```

### 7.7 `ZEROPLUS` (0+)

- **Trigger:** carta jogada. **Requer** `pending_attack > 0` E
  `last_attacker != None`. Se não houver ataque acumulado, **não
  pode ser jogada como defesa** (vira 7.9 — efeito social sem ataque).
- **Efeito:** o jogador da vez **não paga nada**. A pilha de ataque
  é **transferida integralmente** para `last_attacker` e a pilha é
  **encerrada** (não pode mais ser empilhada). O último atacante
  agora deve resolver o ataque (comprar tudo ou tentar nova defesa,
  mas sem direito a outro 0+ na mesma cadeia — porque a pilha
  encerrou no refletor anterior).
- **Casos extremos:**
  - **0+ jogado sem ataque pendente:** permitido como jogada normal
    neutra; **não** reflete nada (não há alvo). Conta apenas como
    troca de cor e fim de turno.
  - **0+ quando `last_attacker == current`:** impossível — você não
    pode refletir para si mesmo; mas o validador já trata porque
    só entra em `REFLETIR` quando `last_attacker != current`.
  - **0+ encadeado:** proibido. Após refletir, o atacante enfrenta
    a pilha. Se ele tiver **outro 0+**, ainda é permitido jogar
    **somente** se houver nova pilha? **Não** — a regra explícita
    do manual é "encerrar a pilha". Logo, **a primeira reflexão
    encerra; o atacante deve pagar ou defender com +2/+4** (que
    recomeça uma pilha nova).
  - **0+ com `pending_attack == 0`:** permitido como jogada neutra
    comum (sem efeito de refletir).
- **Stack/combo:** bloqueia novos 0+ na mesma pilha.
- **Pseudocódigo:**

```text
resolve_zeroplus(state, card):
    if state.pending_attack == 0:
        # sem ataque, vira coringa simples
        state.active_color = card.chosen_color
        return
    # refletir
    attacker = state.last_attacker
    state.last_attacker = state.current
    state.current = attacker          # turno vai para o atacante
    # pilha mantida; encerra a cadeia de 0+
    state.zeroplus_used_in_stack = True
    # não zera pending_attack — ele vai para o atacante resolver
    state.skip_pending = next_player(state, state.current)  # o próximo do atacante
    # cor
    state.active_color = card.chosen_color or random_color()
```

### 7.8 `WILD` (Coringa Simples)

- **Trigger:** carta jogada.
- **Efeito:** jogador escolhe a nova cor. Sem ataque, sem pulo, sem
  troca. Fim do turno normal.
- **Casos extremos:**
  - Pode ser jogada em qualquer estado (mesmo com ataque pendente?
    **Não** — em estado de ataque, só `PLUS2`/`WILD4`/`ZEROPLUS`
    ou comprar).
  - Cor escolhida persiste até a próxima carta.
- **Pseudocódigo:**

```text
resolve_wild(state, card, chosen_color):
    assert chosen_color in COLORS
    state.active_color = chosen_color
```

### 7.9 `7` (Regra do Silêncio)

- **Trigger:** carta `7` colorida jogada e validada.
- **Efeito:** ativa o estado de **silêncio** (ver seção 8). Não tem
  efeito sobre turno, compra ou pulo.
- **Casos extremos:**
  - **7 sobre ataque pendente:** `7` não é defesa válida. Jogador
    deve defender ou pagar. Esta é a válvula para a regra do silêncio
    não atrapalhar a dinâmica de pilha.
  - **Dois 7 seguidos:** silêncio é contínuo (não há "janela" para
    falar). Expira somente quando a próxima carta não-7 for jogada.
  - **7 com coringa (0+ etc.)** jogado em seguida: o silêncio se
    encerra normalmente (porque qualquer carta não-7 zera o silêncio).
  - **Vencedor do 7:** se o jogador que jogou o 7 for o último a
    jogar carta antes do silêncio expirar, **ele mesmo** se beneficia
    do silêncio. (Implementação atual: silêncio é global, não vira
    "pessoal".)
- **Stack/combo:** nenhum. Carta terminal em termos de turno.
- **Pseudocódigo:**

```text
resolve_seven(state, card):
    state.active_color = card.color
    state.silence = SilenceState(
        source = state.current,
        started_turn = state.turn_counter,
        expires_turn = None   # calculado dinamicamente
    )
```

```text
# consumir silêncio: chamado em FIM_TURNO do jogador que jogou carta não-7
update_silence(state, last_played_card):
    if state.silence is None: return
    if last_played_card.value != 7:
        state.silence = None
```

---

### 7.10 Regra de pilha (resumo)

| Ataque atual        | Jogada válida  | Resultado                       |
| ------------------- | -------------- | ------------------------------- |
| `+2`                | `+2` ou `+4`   | pilha: `+4` ou `+6`; mesmo alvo |
| `+2`                | `0+`           | reflete; **encerra**            |
| `+4`                | `+4`           | pilha: `+8`; **proíbe** `+2`    |
| `+4`                | `+2`           | **PROIBIDO** (manual)           |
| `+4`                | `0+`           | reflete; **encerra**            |
| `+2` sobre `+2` (4) | `+2`           | pilha: `+6`                     |
| `+2` sobre `+2` (4) | `+4`           | pilha: `+8`                     |
| Qualquer            | qualquer outra | inválida; deve comprar          |

> **Por que `+2` sobre `+4` é proibido?** Regra canônica do manual:
> `+2` cobre `+2`; `+4` cobre qualquer coisa; **`+2` não cobre `+4`**.
> O `+4` é o ápice da pilha.

---

## 8. Regra do 7 / Silêncio (detalhamento)

### 8.1 Implementação

- Servidor mantém `state.silence` (ou `null`).
- Quando um jogador joga `7`:
  1. `state.silence = { source, started_turn }`.
  2. **Broadcast**: "Jogador X ativou silêncio — não falem até a próxima carta."
- Em cada `FIM_TURNO`, o servidor checa a carta jogada:
  - Se **não** for `7`, `state.silence = null`.
  - Se **for** `7`, silêncio continua.
- Enquanto `state.silence != null`:
  - Qualquer infração (definida pelo produto) **aplica**: o infrator
    recebe `+2` cartas no monte de descarte ou na mão (decisão de
    produto).
  - Decisão de jogo: **não** é turno forçado — o infrator paga e
    **segue jogando normalmente** (a não ser que estivesse em estado
    de ataque, onde a jogada de +2 é mecânica e não punição social).
- Punição social pode ser **aplicada no próximo turno do infrator**,
  ou **imediatamente** via notificação (escolha de produto).

### 8.2 Limites: o que conta como "falar" em modo digital?

Recomendação para o time de produto (claro e auditável):

| Ação                                         | Conta como infração? | Justificativa                               |
| -------------------------------------------- | -------------------- | ------------------------------------------- |
| Mensagem de texto no chat da mesa            | ✅                   | É "falar" no sentido do jogo.               |
| Reação/emoji de chat                         | ❌ (recomendado)     | Não carrega conteúdo semântico; vira ruído. |
| Mensagem de texto em privado a outro jogador | ✅ (recomendado)     | Coalizão é o ponto da regra do silêncio.    |
| Comando de jogo (`/comprar`, `/pular`)       | ❌                   | É metalinguagem, não fala.                  |
| Áudio de voz (PTT)                           | ✅                   | É literalmente falar.                       |
| Áudio pré-gravado                            | ❌ (recomendado)     | Não é em tempo real.                        |

> Decisão de produto a documentar em `07-liveops.md`. Padrão sugerido:
> texto no chat da mesa (público) é a única coisa que conta; áudio só
> em servidores com Voice API explicitamente habilitada.

### 8.3 Sugestão de produto

- **Não** transforme silêncio em "auto-punição" sem feedback. O cliente
  deve **anunciar** claramente: "Silêncio ativo. Fale e perca 2 cartas."
- Oferecer ao jogador da vez um **botão "Denunciar infração"** que
  envia log de chat ao servidor (anti-falso-positivo).
- Implementar **período de carência de 1,5 s** entre o `7` ser jogado e
  a contagem de silêncio iniciar — evita o "ops, eu já estava digitando".
- Disponibilizar **mute toggle** no cliente: o jogador pode silenciar
  o próprio chat por N turnos para evitar cair na própria armadilha.

### 8.4 Regras pendentes (decisões a formalizar)

1. **`WILD4` com carta válida na mão** — bloquear ou permitir?
2. **Coringas com escolha de cor obrigatória ou default** — UX de cor.
3. **Chat privado entre jogadores** — permitir durante a partida?
4. **Auto-skip após denúncia de infração** ou só punição social?

---

## 9. Condições de vitória e fim de jogo

### 9.1 Critério de fim

- **Vitória normal:** `len(current.hand) == 0` **imediatamente após
  resolver a ação** de uma carta jogada. Inclui casos como:
  - Última carta foi uma ação que não muda a mão (número, 7, SKIP,
    REV).
  - Última carta foi **`WILD4`/`WILD`/`ZEROPLUS`/`SWAPHAND`/`HANDSPIN`/`PLUS2`**
    — a mão esvazia **antes** do efeito? **Não**: efeito de troca de
    mão pode re-popular a mão do jogador. Ver 9.2.
- **Empate (raro):** não há regra de empate declarada. Em regra,
  vence o próximo critério (desempate por pontos, ver 9.3).
- **Impossibilidade (monte vazio):** se uma `draw(state, n)` levantar
  `EmptyDeck` e não houver cartas suficientes, o jogo **declara o
  jogador com menos cartas** como vencedor (regra house).

### 9.2 Vitória com cartas de efeito de mão

Cuidado com `SWAPHAND` e `HANDSPIN` — ambas mexem nas mãos **depois**
que a jogada é validada.

```text
check_victory(state):
    # checagem padrão
    if len(state.current.hand) == 0:
        return state.current  # vencedor
    # checagem pós-efeito (SWAPHAND, HANDSPIN)
    if last_action in (SWAPHAND, HANDSPIN):
        for p in state.players:
            if len(p.hand) == 0:
                return p
    return None
```

> Detalhe: se a troca esvaziar a mão de um **outro** jogador, ele vence.
> Caso patológico: o `SWAPHAND` acontece com jogador de mão vazia —
> impossível, porque a carta veio da mão do jogador que jogou.

### 9.3 Pontuação (modo clássico, pós-rodada)

Quando rodadas múltiplas estão habilitadas, o vencedor soma **os
valores de pontos das cartas nas mãos dos perdedores**:

| Tipo de carta                        | Pontos     |
| ------------------------------------ | ---------- |
| Número (0–9)                         | face value |
| `SKIP` / `REV` / `PLUS2`             | 20         |
| `WILD` / `WILD4`                     | 50         |
| `SWAPHAND` / `HANDSPIN` / `ZEROPLUS` | 30         |

Pontuação é cumulativa entre rodadas; primeiro a 200 (ou limite da sala)
ganha a partida.

### 9.4 Desistência

- Jogador pode **sair da partida** a qualquer momento (sai da fila
  do turno). Suas cartas vão para o **monte de descarte** (mantendo
  topo) e o jogo segue com N-1.
- Penalidade social: nada mecânico, mas o histórico pode exibir
  desistências na tela final.

---

## 10. Edge cases (≥ 10)

### 10.1 `REV` com 2 jogadores

**Regra:** `REV` age como `SKIP` (próximo jogador — que é o próprio —
perde o turno; na prática, joga de novo).

```text
if len(players) == 2 and card == REV:
    skip_pending = state.current
    direction *= -1
```

### 10.2 `+4` quando o monte acabou

**Regra:** reabastecer normalmente (5.5). Se mesmo assim não houver
cartas suficientes, aplicar `EmptyDeck` (ver 9.1).

```text
try:
    state.current.hand.extend(draw(state, state.pending_attack))
except EmptyDeck:
    winner = min(state.players, key=lambda p: len(p.hand))
    end_game(state, winner)
```

### 10.3 `0+` quando não há ataque acumulado

**Regra:** vira coringa sem efeito. Apenas troca de cor (ou aleatória
se não exigir) e fim de turno.

```text
if state.pending_attack == 0:
    resolve_wild(state, card)  # trata como coringa simples
    return
```

### 10.4 `HANDSPIN` com 2 jogadores

**Regra:** as duas mãos trocam. Aplica-se como em 3+ jogadores.

### 10.5 Jogador sem cartas vencedoras e monte vazio

**Regra:** o jogador é **obrigado a comprar**; mas se a compra
retornar `EmptyDeck`, ele **passa o turno sem jogar**. Não é vitória
nem derrota — apenas passa.

```text
if not can_play_any(state.current) and len(state.deck) == 0:
    # após tentar reabastecer, se deck ainda vazio:
    if len(state.deck) == 0:
        advance_turn(state)
        return
```

### 10.6 Primeira carta de descarte é neutra

**Regra:** reinserir no baralho e virar outra. Se reinserção for
repetidamente neutra, **reembaralhar** e recomeçar (limite 1000).

### 10.7 Primeira carta é `PLUS2`/`SKIP`/`REV` (colorida)

**Regra:** o **primeiro jogador** é quem executa o efeito. Ou seja, o
jogo "pula o primeiro jogador" se for `SKIP`/`REV` (no caso 2P). Manual
canônico.

```text
if first_card == SKIP:
    state.current = players[1]  # já começa no segundo
elif first_card == REV and len(players) == 2:
    state.current = players[0]  # reverte e "pula" — fica onde está
elif first_card == REV:
    state.direction = -1
    state.current = players[-1]  # primeiro a jogar vira o "anterior"
```

### 10.8 `WILD4` é a última carta da mão

**Regra:** vence normalmente, **após** escolher cor. O efeito de +4
**não é aplicado** (a partida acabou).

```text
resolve_wild4(state, card, chosen_color):
    if len(state.current.hand) == 1:  # esta carta é a única restante
        state.discard.append(card)
        state.active_color = chosen_color
        return state.current  # vitória
    # ... fluxo normal
```

### 10.9 `ZEROPLUS` refletido e último atacante sem defesa

**Regra:** o atacante agora tem `pending_attack` e deve decidir
(defender, ou comprar). Como a pilha **encerrou**, ele não pode
usar **outro** `ZEROPLUS` para rebater de novo.

```text
# após REFLETIR
if not can_defend(state, attacker):
    # atacante compra tudo
    n = state.pending_attack
    attacker.hand.extend(draw(state, n))
    state.pending_attack = 0
    advance_turn(state)
```

### 10.10 `SWAPHAND` consigo mesmo

**Regra:** proibido pela UI; servidor valida `target != self`.

### 10.11 `HANDSPIN` quando algum jogador tem 0 cartas no meio da rotação

**Regra:** esse jogador vence imediatamente. A rotação é interrompida.

```text
for p in order:
    giver, receiver = p, next(state, p)
    receiver.hand = giver.hand
    if len(receiver.hand) == 0:
        return receiver  # vencedor imediato
```

### 10.12 Empate em `pending_attack` quando todos passam

**Regra:** não pode acontecer: o `pending_attack` é sempre consumido
na próxima ação (`+2/+4` empilha, `0+` reflete, ou alguém compra).

### 10.13 Silêncio ativo e jogador com 0 cartas na mão

**Regra:** silêncio é **social**; não bloqueia jogada. Vence
normalmente.

### 10.14 Baralho reembalado com 0 cartas no descarte

**Regra:** impossível se há cartas no descarte. Se o descarte tem
**somente** o topo (1 carta), e o baralho esvaziou, não há como
reabastecer. Acionar `EmptyDeck`.

### 10.15 Dois jogadores e o `ZEROPLUS`

**Regra:** funciona normalmente. O "último atacante" é o outro
jogador. Reflete. Encerra.

---

## 11. Variantes opcionais

### 11.1 Modo Silencioso Permanente

- O silêncio nunca expira até o final da partida.
- Toda a partida é muda no chat.
- **Mais de 5 jogadores** recomendado (pressão social amplificada).

```text
variant_silent(state):
    state.silence_permanent = True
```

### 11.2 Modo Guerra (stacks de +4 só cobertos por +4)

- A regra `+2 sobre +4` (proibida) **se estende**: `+2 sobre +2`
  também passa a ser proibido.
- Pilhas só continuam com `+4` (e `+4` sobre `+4`).
- `0+` continua funcionando, refletindo o total.

```text
variant_war(state):
    state.attack_rules = WAR_RULES
    # WAR_RULES: can_play_in_attack(card) = card in (WILD4,)
```

### 11.3 Modo Cooperativo contra o baralho

- Time de 2-4 jogadores contra uma "mão" de 7 cartas do **baralho**
  (NPC ou baralho revelado).
- Vitória: esvaziar a mão do time antes de esgotar o baralho.
- `SWAPHAND`/`HANDSPIN` **desabilitados** (não há alvos suficientes).
- `ZEROPLUS` reflete o ataque para o **baralho** (NPC compra).
- 1 derrota: baralho esgota.

```text
variant_coop(state):
    state.mode = COOP
    state.npc_hand = draw(7)
    disable_cards([SWAPHAND, HANDSPIN])
    # regras de pilha mantidas; alvo do 0+ vira o NPC
```

---

## 12. Apêndice: contratos de carta (TypeScript-like)

```ts
type Color = 'L' | 'A' | 'V' | 'P'; // Laranja, Azul, Verde, Preto
type Value =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'SKIP'
  | 'REV'
  | 'PLUS2'
  | 'WILD'
  | 'WILD4'
  | 'SWAPHAND'
  | 'HANDSPIN'
  | 'ZEROPLUS';

interface Card {
  id: string; // "L5", "WILD4-3", "ZEROPLUS-0"
  color: Color | null; // null = neutra
  value: Value;
}

function isNeutral(c: Card): boolean {
  return c.color === null;
}
```

```ts
interface GameState {
  players: Player[];
  currentIdx: number;
  direction: 1 | -1;
  deck: Card[];
  discard: Card[];
  activeColor: Color | null;
  pendingAttack: number;
  lastAttackerId: string | null;
  silence: SilenceState | null;
  turnCounter: number;
}

interface Player {
  id: string;
  name: string;
  hand: Card[];
  isConnected: boolean;
}

interface SilenceState {
  sourceId: string;
  startedTurn: number;
}
```

---

## 13. Apêndice: lista de verificação para implementação

- [ ] `build_deck()` retorna 108 cartas com IDs únicos estáveis.
- [ ] `setup()` valida `2 <= N <= 10` e reembaralha se a primeira
      carta for neutra.
- [ ] `can_play()` é puro e determinístico (sem `Date.now()` ou
      RNG não-seeded).
- [ ] `resolve_*()` é executado em uma transação: ou aplica todo
      o efeito ou nenhum (sem estado intermediário visível).
- [ ] `silence` é persistido no servidor autoritativo.
- [ ] `EmptyDeck` é tratado com fallback de vencedor por menor mão.
- [ ] Log de eventos (`state.log`) é append-only e inclui timestamps
      monotônicos para auditoria.
- [ ] Cliente **nunca** valida regra sozinho — sempre consulta servidor.
- [ ] UI distingue "carta inválida" (cliente) de "regra violada"
      (servidor) — exibe mensagem apropriada.
- [ ] Testes cobrem todos os 15 edge cases da seção 10.

---

_Fim do documento 02 — Game Design técnico. Próximo: 03-arquitetura-tecnica.md._
