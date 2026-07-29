# 🎴 GDD — KABEMJUNTO

**Documento de Game Design para o time de desenvolvimento**
**Versão:** 1.0 · **Data:** 2026-07-26 · **Status:** Draft para Dev
**Autor:** Mavis Team · **Idioma:** PT-BR
**Público-alvo:** Engenharia, Game Design, Produto, QA

> **Como ler este documento:** Este é o **arquivo-mestre** do GDD, com índice clicável, resumo executivo, glossário consolidado e regras canônicas. As seções detalhadas vivem em `./secoes/01-...md` a `./secoes/04-...md` e somam **~18.500 palavras**. Cada link deste índice leva ao documento de referência. **Total do GDD:** ~20.000 palavras.

---

## Índice

### Documento principal (consolidado)

- [0. Resumo Executivo](#0-resumo-executivo)
- [1. Pesquisa de Mercado e Referências](./secoes/01-pesquisa-mercado.md)
  - [1.1 Mercado global de jogos de cartas (2024-2026)](./secoes/01-pesquisa-mercado.md#1-visão-geral-do-mercado-de-jogos-de-cartas-20242026)
  - [1.2 Análise de 5 jogos similares](./secoes/01-pesquisa-mercado.md#2-análise-de-jogos-similares)
  - [1.3 Público-alvo e personas](./secoes/01-pesquisa-mercado.md#3-público-alvo-do-kabemjunto)
  - [1.4 SWOT](./secoes/01-pesquisa-mercado.md#4-análise-swot-do-kabemjunto)
  - [1.5 Posicionamento](./secoes/01-pesquisa-mercado.md#5-posicionamento-sugerido)
  - [1.6 Referências bibliográficas](./secoes/01-pesquisa-mercado.md#6-referências)
- [2. Game Design Detalhado](./secoes/02-game-design.md)
  - [2.1 Overview e pilares](./secoes/02-game-design.md#1-overview-do-jogo)
  - [2.2 Composição do baralho (108 cartas)](./secoes/02-game-design.md#3-composição-precisa-do-baralho)
  - [2.3 Setup](./secoes/02-game-design.md#4-setup-passo-a-passo)
  - [2.4 State machine de turno](./secoes/02-game-design.md#5-loop-de-turno-state-machine)
  - [2.5 Validação de jogada](./secoes/02-game-design.md#6-tabela-de-validação-de-jogada)
  - [2.6 Resolução de cartas especiais](./secoes/02-game-design.md#7-resolução-de-ações-especiais)
  - [2.7 Regra do 7 / Silêncio](./secoes/02-game-design.md#8-regra-do-7--silêncio-detalhamento)
  - [2.8 Vitória e edge cases](./secoes/02-game-design.md#9-condições-de-vitória-e-fim-de-jogo)
  - [2.9 Variantes opcionais](./secoes/02-game-design.md#11-variantes-opcionais)
- [3. Produção, Arte, UX e Implementação](./secoes/03-producao.md)
  - [3.1 Balanceamento matemático](./secoes/03-producao.md#1-balanceamento-matemático)
  - [3.2 Direção de arte](./secoes/03-producao.md#2-direção-de-arte)
  - [3.3 Experiência do usuário (UX)](./secoes/03-producao.md#3-experiência-do-usuário-ux)
  - [3.4 Arquitetura técnica](./secoes/03-producao.md#4-arquitetura-técnica-sugerida)
  - [3.5 Plano de monetização](./secoes/03-producao.md#5-plano-de-monetização)
  - [3.6 Roadmap de desenvolvimento](./secoes/03-producao.md#6-roadmap-de-desenvolvimento)
  - [3.7 KPIs e métricas de sucesso](./secoes/03-producao.md#7-métricas-de-sucesso-kpis)
- [4. Pitch, Anexos e Diagramas](./secoes/04-pitch-anexos.md)
  - [4.1 Pitch executivo (1 página)](./secoes/04-pitch-anexos.md#1-pitch-executivo-1-página)
  - [4.2 Manual rápido (cola de 1 página)](./secoes/04-pitch-anexos.md#2-manual-rápido-de-uma-página)
  - [4.3 Glossário](./secoes/04-pitch-anexos.md#3-glossário)
  - [4.4 Diagrama de fluxo de turno](./secoes/04-pitch-anexos.md#4-diagrama-de-fluxo-de-turno)
  - [4.5 Árvore de decisão "posso jogar?"](./secoes/04-pitch-anexos.md#5-árvore-de-decisão-posso-jogar-esta-carta)
  - [4.6 Tabela de cartas especiais](./secoes/04-pitch-anexos.md#6-tabela-de-cartas-especiais--referência-rápida)
  - [4.7 Lista de assets a produzir](./secoes/04-pitch-anexos.md#7-lista-de-assets-a-produzir)
  - [4.8 Matriz de riscos](./secoes/04-pitch-anexos.md#8-riscos-do-projeto-matriz)

### Seções de referência

- [5. Glossário consolidado (todas as seções)](#5-glossário-consolidado)
- [6. Changelog do GDD](#6-changelog-do-gdd)
- [7. Regras oficiais canônicas (resumo)](#7-regras-oficiais-canônicas-resumo)

---

## 0. Resumo Executivo

**Kabemjunto** é um jogo de cartas digital para 2-10 jogadores, baseado em um baralho de 108 cartas, com partidas de 8-15 minutos. Combina a familiaridade do "tipo UNO" com três camadas estratégicas próprias: **regra do 7 (silêncio social)**, **acúmulo assimétrico de ataques** (+2 sobre +2 / +4 sobre +2 / +4 sobre +4, mas +2 sobre +4 proibido) e a carta **0+ (Zero Mais)** que reflete ataques para o último atacante. Suporta hot-seat local e multiplayer online, é projetado para mobile/web/desktop, e combina motor de regras determinístico (servidor autoritativo) com UX social focada em viralização.

### Dados-chave do projeto

| Métrica                | Valor                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| Gênero                 | Shedding game + party game social                                              |
| Jogadores              | 2 a 10 (sweet spot 4-6)                                                        |
| Duração de partida     | 8-15 min                                                                       |
| Cartas no baralho      | 108 (40 numeradas + 12 ação colorida + 8 neutras + 4x +4 + 4 especiais únicas) |
| Setup                  | < 30s                                                                          |
| Complexidade de regras | Explicável em < 90s                                                            |
| Plataforma-alvo        | Web (PWA) + Mobile (iOS/Android) + Desktop                                     |
| Modelo de negócio      | F2P com baralhos temáticos pagos + passe de temporada                          |
| Time de partida        | < 2-3 meses para MVP                                                           |

### Pilares de design (resumo)

1. **Simplicidade de regras** — uma partida deve ser explicada em < 90s
2. **Tensão social crescente** — regra do 7 + acúmulo de ataques
3. **Momento viral (0+)** — reviravolta cinematográfica
4. **Rejogabilidade alta** — baralho pequeno, variância alta
5. **Dev-readiness** — state machine finita, sem loops infinitos

### Decisões macro

- **Servidor autoritativo** para validação anti-trapaça em modo online
- **TypeScript + React** para web; bridge para React Native no mobile
- **Arte flat/low-poly** para reduzir custo (108 cartas)
- **Playtest fechado de ≥100 partidas** antes de balancear o 0+
- **Tematização brasileira** como diferencial cultural vs UNO

### Salas online — contrato aprovado

- A criação é **privada** por padrão; o host pode escolher **pública**. Somente salas públicas em `AGUARDANDO`, com host conectado e vaga aparecem na descoberta, que expõe apenas `id`, nome sanitizado, nome do host e ocupação — nunca código, token, chat, mãos ou estado da partida.
- O nome da sala é opcional, sanitizado e limitado no servidor; se ausente ou vazio, o servidor usa `Sala <id>`. A UI mantém `privada`/`publica` internamente, mas emite o enum canônico `PRIVADA`/`PUBLICA`.
- Desconexão acidental **não é abandono**: mantém identidade, vaga e retomada autenticada durante a janela de reconexão. Saída voluntária antes do início remove o jogador (e transfere host ou remove sala vazia). Abandono durante a partida requer confirmação e evento explícito: finaliza a partida, registra `ABANDONO`, revoga a retomada do abandonador e notifica os restantes.

---

## 5. Glossário consolidado

Termos canônicos usados em todo o GDD. Cada termo mantém o mesmo significado em todas as seções.

| Termo                       | Definição                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Monte de Compra**         | Pilha virada para baixo, de onde jogadores compram cartas.                                                         |
| **Monte de Descarte**       | Pilha virada para cima no centro, com a `topo` sendo a última carta jogada.                                        |
| **Topo**                    | Última carta do Monte de Descarte. Define a cor/símbolo que a próxima jogada deve respeitar.                       |
| **Ativo**                   | Cor vigente definida por uma carta neutra (ou a cor da carta colorida do topo, se a última jogada não foi neutra). |
| **Cor**                     | Laranja, Azul, Verde ou Preto.                                                                                     |
| **Coringa**                 | Carta neutra que pode ser jogada sobre qualquer cor.                                                               |
| **Coringa Simples (Wild)**  | Coringa que apenas muda a cor ativa.                                                                               |
| **+4**                      | Coringa que obriga o próximo a comprar 4 cartas.                                                                   |
| **+2**                      | Carta colorida que obriga o próximo a comprar 2 cartas.                                                            |
| **Ataque Acumulado**        | Soma de +2/+4 encadeados que o próximo jogador deve cobrir ou comprar.                                             |
| **Reflexo**                 | Efeito do 0+ (Zero Mais): o ataque acumulado é devolvido ao último atacante.                                       |
| **Regra do 7 / Silêncio**   | Ao jogar uma carta 7, todos os jogadores ficam em silêncio até a próxima carta; quem falar paga +2.                |
| **Direção de Jogo**         | Horário ou anti-horário. Invertida pela carta Reverse.                                                             |
| **Mão**                     | Conjunto de cartas que cada jogador segura e não pode mostrar aos outros.                                          |
| **Descartar**               | Ação de jogar uma carta da mão no Monte de Descarte.                                                               |
| **Comprar**                 | Ação de pegar a carta do topo do Monte de Compra.                                                                  |
| **Vazio (estado)**          | Quando o Monte de Compra se esgota; descarte vira novo monte (mantendo topo).                                      |
| **Starter (carta inicial)** | Primeira carta virada para o Monte de Descarte; nunca pode ser neutra.                                             |
| **Último Atacante**         | Jogador que jogou a carta de ataque mais recente; alvo do 0+ em caso de reflexo.                                   |
| **Compra Obrigatória**      | Compra forçada por ataque (+2 / +4 / silêncio quebrado).                                                           |
| **Validação de Jogada**     | Função `validarJogada(cartaJogada, topo, ativo)` que retorna `válida? + efeito`.                                   |
| **State Machine de Turno**  | INICIO_TURNO → ESPERAR_CARTA → VALIDAR → RESOLVER_ACAO → FIM_TURNO (ou COMPRAR → FIM_TURNO).                       |
| **Servidor Autoritativo**   | Toda validação de regras roda no servidor; cliente só envia intenção de jogada.                                    |

---

## 6. Changelog do GDD

| Versão | Data       | Status         | Notas                                                                                                                                     |
| ------ | ---------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0    | 2026-07-26 | Draft para Dev | Versão inicial consolidada a partir das 4 seções de pesquisa, design, produção e pitch. Aprovado para repasse ao time de desenvolvimento. |

---

## 7. Regras oficiais canônicas (resumo)

> Esta é a fonte canônica das regras, copiada do manual oficial. As seções 02 (game design) e 04 (anexos) expandem cada regra com pseudocódigo, casos extremos e referências para implementação.

### Composição do baralho

- **Cartas numeradas 0-9** em 4 cores (Laranja, Azul, Verde, Preto)
- **Ações coloridas:** Skip, Reverse, +2 (em 4 cores)
- **Neutras / Coringas:** 4x +4, 1x Troca Mão, 1x Gira Mão, 1x 0+, 1x Coringa Simples
- **Total:** 108 cartas

### Setup

1. Embaralhar todo o baralho
2. Distribuir 7 cartas por jogador
3. Monte de Compra virado pra baixo no centro
4. Vira a primeira carta do Monte de Compra para o Monte de Descarte
   - Se for neutra, volta pro meio do baralho e vira outra
5. Jogador à esquerda do distribuidor começa

### Fluxo de turno

- Em seu turno, jogar 1 carta no Monte de Descarte ou um **Descarte Múltiplo**
  - o lote tem 2 ou mais cartas da mesma face: mesmo número, ou todas `+2`, todas Skip ou todas Reverse;
  - a primeira deve ser válida contra a mesa; as seguintes só precisam ter a mesma face;
  - a última carta define a nova cor ativa;
  - os efeitos são agregados: `+2` soma, Skip pula N jogadores e Reverse inverte apenas se a quantidade for ímpar;
  - +4, Silêncio, 0+, Troca Mão, Gira Mão e demais neutras/ações complexas não podem entrar em lote nesta versão.
- Carta válida: mesma cor, mesmo número, ou neutra
- Sem carta válida: comprar 1 do Monte de Compra
  - Se a carta comprada puder ser jogada, pode descartar imediatamente
  - Senão, mantém na mão e passa o turno

### Regras de combate

- **Skip:** próximo jogador perde a vez
- **Reverse:** inverte o sentido do jogo
- **+2:** próximo compra 2 cartas (ou acumula)
- **+4:** próximo compra 4 cartas (ou acumula)
- **Acúmulo de ataques:**
  - +2 sobre +2: OK (soma +4)
  - +4 sobre +2: OK (soma +6)
  - +2 sobre +4: **PROIBIDO**
  - +4 sobre +4: OK (soma +8)
- **0+ (Zero Mais):** reflete o ataque acumulado para o último atacante; quem recebe o reflexo não pode rebater
- **Troca Mão:** escolha um jogador e troque toda a sua mão com a dele
- **Gira Mão:** escolha um sentido; todos passam suas mãos para o vizinho
- **Coringa Simples:** altera a cor ativa do jogo
- **Regra do 7 (Silêncio):** jogar 7 abre uma janela até a próxima carta. Chat escrito e Falas rápidas seguem disponíveis; a primeira mensagem de cada jogador na janela é entregue e gera +2 cartas imediatas, sem passar o turno. Novas mensagens daquele mesmo jogador não acumulam punição até outro 7 abrir uma nova janela.

### Fim de jogo

- Vence quem descartar a última carta da mão
- Jogo termina instantaneamente nesse momento

---

## 8. Sumário das seções detalhadas

Para navegação rápida, cada seção tem um verbete com os pontos-chave que ela cobre.

### 8.1 [Seção 01 — Pesquisa de Mercado e Referências](./secoes/01-pesquisa-mercado.md) (2.914 palavras)

- Mercado global de board/card games: **USD 19,90 bi** (Grand View, 2024), CAGR 8,3% até 2030
- TCG: **USD 15,11 bi** (Mordor, 2026), CAGR 10,03% até 2031
- Mobile/card games: **~10% do consumer spend** (data.ai, 2024)
- 5 jogos similares analisados em detalhe (UNO, Buraco/Truco+M11, Coup, Taki/Dobble, The Crew) com pontuação em 4 critérios
- Personas: Aline (22, universitária) e Rodrigo (38, pai)
- SWOT completo (5 itens por quadrante)
- Tagline: **"O jogo de cartas que te denuncia."**
- PVU: baralho party onde cada carta vira confissão ou blefe, 15 min, sem eliminação
- Comparação com UNO: "UNO é sobre ganhar; Kabemjunto é sobre rir"

### 8.2 [Seção 02 — Game Design Detalhado](./secoes/02-game-design.md) (5.751 palavras)

- 13 subseções: overview, pilares, **108 cartas tabeladas**, setup, **state machine ASCII com 8 estados**, matriz de validação, **9 ações especiais com pseudocódigo**, regra do 7, vitória, **15 edge cases**, variantes, contratos TypeScript, checklist de QA
- State machine formal: `INICIO_TURNO → ESPERAR_CARTA → VALIDAR → RESOLVER_ACAO → FIM_TURNO` (com `COMPRAR` intermediário)
- 4 regras de acúmulo implementadas: `+2/+2 OK`, `+4/+2 OK`, `+2/+4 PROIBIDO`, `+4/+4 OK`
- 0+ encerra pilha e não pode ser rebatido
- Regra do 7 detalhada e decidida para modo digital: chat escrito e Falas rápidas contam como falar; punição autoritativa é uma vez por jogador em cada janela de SILÊNCIO.

### 8.3 [Seção 03 — Produção, Arte, UX e Implementação](./secoes/03-producao.md) (5.480 palavras)

- **Cálculo hipergeométrico:** P(≥1 carta jogável) = 97,8% na mão inicial de 7 cartas
- Distribuição por raridade: comum (50%), incomum (30%), rara (15%), única (5%)
- Tempos médios: 8-12 min (2-4 jogadores), 12-18 min (6-10 jogadores)
- Análise de risco do 0+ (1 carta em 108, mas efeito viral)
- Paleta: Laranja `#F39C12`, Azul `#3498DB`, Verde `#27AE60`, Preto `#2C3E50`
- Estilo recomendado: **flat/low-poly** (custo reduzido)
- Stack: **TypeScript + React + Node + WebSocket**
- Modelo de dados `Carta` com union types para validação
- 4 fases de roadmap: MVP (8 sem) → Beta (12 sem) → Release (16 sem) → Pós-launch
- 20 KPIs com targets em M6 e M12

### 8.4 [Seção 04 — Pitch, Anexos e Diagramas](./secoes/04-pitch-anexos.md) (4.354 palavras)

- Pitch executivo completo (Problema/Solução/Mercado/Diferencial/Receita/Timing)
- **Manual rápido de 1 página** (cola para jogadores)
- **Glossário de 22 termos**
- **Diagrama ASCII de state machine de turno**
- **Árvore de decisão "posso jogar esta carta?"** (fluxograma)
- Tabela de 9 cartas especiais (referência rápida)
- Lista de assets com prioridade (P0/P1/P2) e estimativa
- **Matriz de 8 riscos** com probabilidade × impacto × mitigação
- Heatmap de risco líquido priorizado (top 3: R2 0+, R4+R5 online/anti-cheat, R1 regra do 7)

---

> **Próximos passos sugeridos:**
>
> 1. Revisar este GDD com o time (estimativa: 1 reunião de 1h)
> 2. Implementar state machine de turno (seção 02) em TypeScript — primeiro entregável
> 3. Prototipar cartas numeradas + Skip/Reverse/+2 (sem neutras) em modo hot-seat
> 4. Rodar playtest interno com 5 partidas por configuração (2, 4, 6, 8, 10 jogadores)
> 5. Validar UX da Regra do 7 com usuários reais antes de expandir para multiplayer online
> 6. Cronograma detalhado: ver seção 03.6 (Roadmap) e 04.7 (Lista de assets)

**Fim do GDD — Kabemjunto v1.0**

---

## Addendum UI/UX 2026-07-27 — Redesign da Mesa Fase 1

A partir das referências visuais fornecidas pelo produto — imagem da tela
atual, proposta visual da mesa e especificação técnica das cartas especiais — a
Fase 1 da interface passa a seguir estes princípios:

- mobile-first em portrait, com mesa de feltro verde e núcleo central;
- Monte de Compra à esquerda e Monte de Descarte à direita;
- Monte de Compra clicável, com contador incorporado na arte;
- mão do jogador em leque, com seleção em dois toques;
- cartas inválidas reduzidas visualmente, mas ainda legíveis;
- quatro assentos espaciais para a composição de 2–4 jogadores;
- cor ativa, sentido, vez e ataque acumulado em status explícito;
- eventos sociais em fila visual: Silêncio, ataque e reflexo do 0+;
- banner compacto persistente enquanto o silêncio estiver ativo.

### Decisão específica da Carta 7

A Carta 7 será **visualmente secreta**. Sua face será idêntica à de uma carta
numérica comum da cor correspondente: número 7 central e índices nos cantos,
sem `🤫`, boca, faixa ou ilustração especial. O efeito do silêncio será
comunicado após o descarte pelo banner, modal e feed de eventos.

Esta decisão substitui a recomendação visual anterior de ícone explícito para o
7; a regra mecânica não foi alterada.

### Escopo de partida do MVP visual

- Uma partida termina quando há vencedor.
- Número de rodadas e pontuação cumulativa ficam fora do MVP.
- A vitória exibirá ordem e estatísticas reais, sem pontuação inventada.
- Tempo por turno fica desligado por padrão e só será implementado com controle
  autoritativo do servidor.
- `+4 sobre +4` permanece regra canônica; não será toggle no MVP.

A especificação operacional está em [`docs/UI-REDESIGN-FASE-1.md`](docs/UI-REDESIGN-FASE-1.md)
e a decisão arquitetural em ADR-010 de `DECISIONS.md`.
