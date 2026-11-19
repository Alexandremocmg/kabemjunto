# 🎴 GDD — KABEMJUNTO

**Documento de Game Design para o time de desenvolvimento**
**Versão:** 1.1 · **Revisão documental:** 2026-11-18 · **Status:** regras aprovadas, reconciliadas com `54c4601`
**Autor:** Mavis Team · **Idioma:** PT-BR
**Público-alvo:** Engenharia, Game Design, Produto, QA

> **Como ler:** este é o GDD mestre. A seção 7 concentra as regras vigentes. As quatro seções detalhadas na raiz preservam o design original; seus pseudocódigos, estimativas e propostas devem ser confrontados com este resumo e com o motor atual. Consulte o [README](./README.md) para operação e o [relatório de revisão](./docs/REVISAO-2026-11-18.md) para evidências e pendências.

---

## Índice

### Documento principal (consolidado)

- [0. Resumo Executivo](#0-resumo-executivo)
- [1. Pesquisa de Mercado e Referências](./01-pesquisa-mercado.md)
  - [1.1 Mercado global de jogos de cartas (2024-2026)](./01-pesquisa-mercado.md#1-visão-geral-do-mercado-de-jogos-de-cartas-20242026)
  - [1.2 Análise de 5 jogos similares](./01-pesquisa-mercado.md#2-análise-de-5-jogos-similares)
  - [1.3 Público-alvo e personas](./01-pesquisa-mercado.md#3-público-alvo-do-kabemjunto)
  - [1.4 SWOT](./01-pesquisa-mercado.md#4-análise-swot-do-kabemjunto)
  - [1.5 Posicionamento](./01-pesquisa-mercado.md#5-posicionamento-sugerido)
  - [1.6 Referências bibliográficas](./01-pesquisa-mercado.md#6-referências)
- [2. Game Design Detalhado](./02-game-design.md)
  - [2.1 Overview e pilares](./02-game-design.md#1-overview-do-jogo)
  - [2.2 Composição histórica do baralho](./02-game-design.md#3-composição-precisa-do-baralho)
  - [2.3 Setup](./02-game-design.md#4-setup-passo-a-passo)
  - [2.4 State machine de turno](./02-game-design.md#5-loop-de-turno-state-machine)
  - [2.5 Validação de jogada](./02-game-design.md#6-tabela-de-validação-de-jogada)
  - [2.6 Resolução de cartas especiais](./02-game-design.md#7-resolução-de-ações-especiais)
  - [2.7 Regra do 7 / Silêncio](./02-game-design.md#8-regra-do-7--silêncio-detalhamento)
  - [2.8 Vitória e edge cases](./02-game-design.md#9-condições-de-vitória-e-fim-de-jogo)
  - [2.9 Variantes opcionais](./02-game-design.md#11-variantes-opcionais)
- [3. Produção, Arte, UX e Implementação](./03-producao.md)
  - [3.1 Balanceamento matemático](./03-producao.md#1-balanceamento-matemático)
  - [3.2 Direção de arte](./03-producao.md#2-direção-de-arte)
  - [3.3 Experiência do usuário (UX)](./03-producao.md#3-experiência-do-usuário-ux)
  - [3.4 Arquitetura técnica](./03-producao.md#4-arquitetura-técnica-sugerida)
  - [3.5 Plano de monetização](./03-producao.md#5-plano-de-monetização)
  - [3.6 Roadmap de desenvolvimento](./03-producao.md#6-roadmap-de-desenvolvimento)
  - [3.7 KPIs e métricas de sucesso](./03-producao.md#7-métricas-de-sucesso-kpis)
- [4. Pitch, Anexos e Diagramas](./04-pitch-anexos.md)
  - [4.1 Pitch executivo (1 página)](./04-pitch-anexos.md#1-pitch-executivo-1-página)
  - [4.2 Manual rápido (cola de 1 página)](./04-pitch-anexos.md#2-manual-rápido--cola-de-uma-página)
  - [4.3 Glossário](./04-pitch-anexos.md#3-glossário--15-termos)
  - [4.4 Diagrama de fluxo de turno](./04-pitch-anexos.md#4-diagrama-de-fluxo-de-turno-state-machine)
  - [4.5 Árvore de decisão "posso jogar?"](./04-pitch-anexos.md#5-árvore-de-decisão-posso-jogar-esta-carta)
  - [4.6 Tabela de cartas especiais](./04-pitch-anexos.md#6-tabela-de-cartas-especiais--referência-rápida)
  - [4.7 Lista de assets a produzir](./04-pitch-anexos.md#7-lista-de-assets-a-produzir-art--design)
  - [4.8 Matriz de riscos](./04-pitch-anexos.md#8-riscos-do-projeto-matriz)

### Seções de referência

- [5. Glossário consolidado (todas as seções)](#5-glossário-consolidado)
- [6. Changelog do GDD](#6-changelog-do-gdd)
- [7. Regras oficiais canônicas (resumo)](#7-regras-oficiais-canônicas-resumo)

---

## 0. Resumo Executivo

**Kabemjunto** é um jogo de cartas digital para 2-10 jogadores, baseado em um baralho de 109 cartas, com partidas de 8-15 minutos. Combina a familiaridade do "tipo UNO" com três camadas estratégicas próprias: **regra do 7 (silêncio social)**, **acúmulo assimétrico de ataques** (+2 sobre +2 / +4 sobre +2 / +4 sobre +4, mas +2 sobre +4 proibido) e a carta **0+ (Zero Mais)** que reflete ataques para o último atacante. Suporta hot-seat local e multiplayer online, é projetado para mobile/web/desktop, e combina motor de regras determinístico (servidor autoritativo) com UX social focada em viralização.

### Dados-chave do projeto

| Métrica                | Valor                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Gênero                 | Shedding game + party game social                                                                                     |
| Jogadores              | 2 a 10 (sweet spot 4-6)                                                                                               |
| Duração de partida     | 8-15 min                                                                                                              |
| Cartas no baralho      | 109 (100 coloridas: 25 por cor × 4 cores + 9 neutras: 4x +4, Troca Mão, Gira Mão, 0+, Coringa Simples, +2 Para Todos) |
| Setup                  | < 30s                                                                                                                 |
| Complexidade de regras | Explicável em < 90s                                                                                                   |
| Plataforma-alvo        | Web (PWA) + Mobile (iOS/Android) + Desktop                                                                            |
| Modelo de negócio      | F2P com baralhos temáticos pagos + passe de temporada                                                                 |
| Time de partida        | < 2-3 meses para MVP                                                                                                  |

> Os valores de duração, setup, explicação e tamanho de equipe são metas de design, não medições desta revisão. PWA offline, bridge nativa, monetização e passe são propostas: não estão entregues no runtime atual.

### Pilares de design (resumo)

1. **Simplicidade de regras** — uma partida deve ser explicada em < 90s
2. **Tensão social crescente** — regra do 7 + acúmulo de ataques
3. **Momento viral (0+)** — reviravolta cinematográfica
4. **Rejogabilidade alta** — baralho pequeno, variância alta
5. **Dev-readiness** — fluxo de turno finito, sem loops infinitos. A state machine do GDD é o modelo conceitual; o runtime executa funções puras do motor, sem uma segunda API de estados paralela.

### Decisões macro

- **Servidor autoritativo** para validação anti-trapaça em modo online
- **TypeScript + React** para web; bridge para React Native no mobile
- **Arte flat/low-poly** para reduzir custo (109 cartas)
- **Playtest fechado de ≥100 partidas** antes de balancear o 0+
- **Tematização brasileira** como diferencial cultural vs UNO

### Salas online — contrato aprovado

- A criação é **privada** por padrão; o host pode escolher **pública**. Somente salas públicas em `AGUARDANDO`, com host conectado e vaga aparecem na descoberta, que expõe apenas `id`, nome sanitizado, nome do host e ocupação — nunca código, token, chat, mãos ou estado da partida.
- O nome da sala é opcional, sanitizado e limitado no servidor; se ausente ou vazio, o servidor usa `Sala <id>`. A UI mantém `privada`/`publica` internamente, mas emite o enum canônico `PRIVADA`/`PUBLICA`.
- Desconexão acidental **não é abandono**: mantém identidade, vaga e retomada autenticada durante a janela de reconexão. Saída voluntária antes do início remove o jogador (e transfere host ou remove sala vazia). Abandono durante a partida requer confirmação e evento explícito: finaliza a partida, registra `ABANDONO`, revoga a retomada do abandonador e notifica os restantes.

---

## 5. Glossário consolidado

Termos canônicos usados em todo o GDD. Cada termo mantém o mesmo significado em todas as seções.

| Termo                       | Definição                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monte de Compra**         | Pilha virada para baixo, de onde jogadores compram cartas.                                                                                                                   |
| **Monte de Descarte**       | Pilha virada para cima no centro, com a `topo` sendo a última carta jogada.                                                                                                  |
| **Topo**                    | Última carta do Monte de Descarte. Define a cor/símbolo que a próxima jogada deve respeitar.                                                                                 |
| **Ativo**                   | Cor vigente definida por uma carta neutra (ou a cor da carta colorida do topo, se a última jogada não foi neutra).                                                           |
| **Cor**                     | Laranja, Azul, Verde ou Preto.                                                                                                                                               |
| **Coringa**                 | Carta neutra que pode ser jogada sobre qualquer cor.                                                                                                                         |
| **Coringa Simples (Wild)**  | Coringa que apenas muda a cor ativa.                                                                                                                                         |
| **+4**                      | Coringa que obriga o próximo a comprar 4 cartas.                                                                                                                             |
| **+2**                      | Carta colorida que obriga o próximo a comprar 2 cartas.                                                                                                                      |
| **+2 Para Todos**           | Coringa (ADR-013) que obriga **todos** os adversários a comprar 2 cartas cada, imediatamente e sem acúmulo/defesa; quem jogou não compra nada.                               |
| **Ataque Acumulado**        | Soma de +2/+4 encadeados que o próximo jogador deve cobrir ou comprar.                                                                                                       |
| **Reflexo**                 | Efeito do 0+ (Zero Mais): o ataque acumulado é devolvido ao último atacante.                                                                                                 |
| **Regra do 7 / Silêncio**   | Ao jogar uma carta 7, todos os jogadores ficam em silêncio até a próxima carta; quem falar paga +2.                                                                          |
| **Direção de Jogo**         | Horário ou anti-horário. Invertida pela carta Reverse.                                                                                                                       |
| **Mão**                     | Conjunto de cartas que cada jogador segura e não pode mostrar aos outros.                                                                                                    |
| **Descartar**               | Ação de jogar uma carta da mão no Monte de Descarte.                                                                                                                         |
| **Comprar**                 | Ação de pegar a carta do topo do Monte de Compra.                                                                                                                            |
| **Vazio (estado)**          | Quando o Monte de Compra se esgota; descarte vira novo monte (mantendo topo).                                                                                                |
| **Starter (carta inicial)** | Primeira carta virada para o Monte de Descarte; nunca pode ser neutra.                                                                                                       |
| **Último Atacante**         | Jogador que jogou a carta de ataque mais recente; alvo do 0+ em caso de reflexo.                                                                                             |
| **Compra Obrigatória**      | Compra forçada por ataque (+2 / +4 / silêncio quebrado).                                                                                                                     |
| **Validação de Jogada**     | Função `validarJogada(cartaJogada, topo, ativo)` que retorna `válida? + efeito`.                                                                                             |
| **State Machine de Turno**  | Modelo conceitual do GDD: INICIO_TURNO → ESPERAR_CARTA → VALIDAR → RESOLVER_ACAO → FIM_TURNO (ou COMPRAR → FIM_TURNO). Não corresponde a uma API pública separada no pacote. |
| **Servidor Autoritativo**   | Toda validação de regras roda no servidor; cliente só envia intenção de jogada.                                                                                              |

---

## 6. Changelog do GDD

| Versão                   | Data       | Status         | Notas                                                                                                                                     |
| ------------------------ | ---------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0                      | 2026-07-26 | Draft para Dev | Versão inicial consolidada a partir das 4 seções de pesquisa, design, produção e pitch. Aprovado para repasse ao time de desenvolvimento. |
| 1.1                      | 2026-08-01 | Aprovado       | ADR-013: baralho expandido de 108 para 109 cartas com a nova carta neutra "+2 Para Todos" (ataque global/AoE, `MAIS_DOIS_TODOS`).         |
| 1.1 (revisão documental) | 2026-11-18 | Reconciliado   | Links, escopo histórico, composição, compra, abertura e Corta-Frente alinhados à revisão `54c4601`; sem nova regra.                       |

---

## 7. Regras oficiais canônicas (resumo)

> Esta é a fonte canônica das regras, copiada do manual oficial. As seções 02 (game design) e 04 (anexos) expandem cada regra com pseudocódigo, casos extremos e referências para implementação.

### Composição do baralho

Cada cor contém 1 zero, 2 cópias de cada número de 1 a 9 (incluindo o 7 com Silêncio), 2 Skip, 2 Reverse e 2 +2: 25 por cor, total de 100 coloridas. As 9 neutras completam 109. `gerarBaralho108`/`BARALHO_COMPLETO_108` mantêm nomes históricos; a fixture `deck108.json` preserva o catálogo antigo de 108.

- **Cartas numeradas 0-9** em 4 cores (Laranja, Azul, Verde, Preto)
- **Ações coloridas:** Skip, Reverse, +2 (em 4 cores)
- **Neutras / Coringas:** 4x +4, 1x Troca Mão, 1x Gira Mão, 1x 0+, 1x Coringa Simples, 1x +2 Para Todos
- **Total:** 109 cartas (ADR-013)

### Setup

1. Embaralhar todo o baralho
2. Distribuir 7 cartas por jogador
3. Monte de Compra virado pra baixo no centro
4. Vira a primeira carta do Monte de Compra para o Monte de Descarte
   - Se for neutra, volta pro meio do baralho e vira outra
5. O motor usa a ordem de jogadores recebida, iniciando no primeiro, salvo o efeito da carta inicial: Skip pula esse jogador; Reverse com 3 ou mais inverte e começa no último; com 2, mantém o primeiro. Um +2 inicial exige defesa ou pagamento pelo primeiro jogador

### Fluxo de turno

- Em seu turno, jogar 1 carta no Monte de Descarte ou um **Descarte Múltiplo**
  - o lote tem 2 ou mais cartas da mesma face: mesmo número, ou todas `+2`, todas Skip ou todas Reverse;
  - a primeira deve ser válida contra a mesa; as seguintes só precisam ter a mesma face;
  - a última carta define a nova cor ativa;
  - os efeitos são agregados: `+2` soma, Skip pula N jogadores e Reverse inverte apenas se a quantidade for ímpar;
  - +4, Silêncio, 0+, Troca Mão, Gira Mão e demais neutras/ações complexas não podem entrar em lote nesta versão.
- Carta válida: mesma cor ativa, mesmo número, mesma ação colorida, ou neutra; sob ataque, prevalecem as restrições de defesa
- Sem carta válida que bloqueie compra: comprar 1 do Monte de Compra. `TROCA_MAO` não bloqueia a compra voluntária; as demais cartas válidas bloqueiam
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
  - a compra de um ataque é integral: recicla o descarte preservando o topo; se o baralho inteiro ainda não bastar, não há compra parcial e a partida termina pelo critério determinístico da menor mão
- **0+ (Zero Mais):** sem ataque acumulado, é somente um coringa neutro: escolhe a cor ativa e o turno segue normalmente, sem giro/troca de mãos. Com ataque acumulado, identifica o último atacante pelo histórico canônico, obriga-o a comprar integralmente a pilha (reciclando o descarte quando necessário), encerra a pilha e passa o turno a partir desse alvo; quem recebe o reflexo não pode rebater.
- **Troca Mão:** escolha um jogador e troque toda a sua mão com a dele; se for a última carta de quem a jogou, esse jogador vence imediatamente e o efeito não acontece
- **Gira Mão:** todos passam suas mãos para o vizinho no sentido vigente; se for a última carta de quem a jogou, esse jogador vence imediatamente e o efeito não acontece
- **+2 Para Todos (ADR-013):** coringa de ataque global — assim que descartada, todos os adversários (nunca quem jogou) compram 2 cartas cada, imediatamente, em ordem de turno; você escolhe a nova cor ativa. É atômica e não acumula: não entra no sistema de ataque acumulado, não pode ser jogada como resposta a um `+2`/`+4` em andamento, e não abre janela de defesa/repasse. Se o baralho não tiver 2 cartas completas (mesmo reciclando o descarte) para algum adversário, a partida termina pelo critério determinístico da menor mão. Se for a última carta de quem a jogou, esse jogador vence imediatamente e a distribuição não acontece.
- **Coringa Simples:** altera a cor ativa do jogo
- **Regra do 7 (Silêncio):** jogar 7 abre uma janela até a próxima carta. Chat escrito e Falas rápidas seguem disponíveis; a primeira mensagem de cada jogador na janela é entregue e gera +2 cartas imediatas, sem passar o turno. Novas mensagens daquele mesmo jogador não acumulam punição até outro 7 abrir uma nova janela.

### Corta-Frente (interceptação fora da vez)

- Quando um jogador descarta uma carta **elegível** (número sem ação, ou `+2`/Skip/Reverse coloridos), o orquestrador abre uma janela (4 segundos no Local; 5 segundos no servidor Online) antes de confirmar o próximo turno normal. `+4`, +2 Para Todos, Coringa Simples, 0+, Troca Mão, Gira Mão e Silêncio ficam fora desta V1.
- Qualquer outro jogador com uma carta **idêntica** (mesma cor **e** mesmo número/ação — não basta a mesma face) pode jogá-la fora da vez para "cortar a frente": o turno passa a seguir a partir de quem interceptou, no sentido vigente, e a carta interceptadora aplica seu próprio efeito normalmente (`+2` acumula, Skip pula, Reverse inverte).
- Quem descartou a carta alvo não pode interceptar a própria jogada.
- O servidor é a única autoridade: primeiro pedido válido recebido antes do prazo vence, sem compensação por latência de rede; o cliente nunca decide o resultado, só envia o pedido e exibe a contagem regressiva.
- Se ninguém interceptar dentro do prazo, o turno segue normalmente para quem seria o próximo jogador.
- Uma interceptação bem-sucedida pode encadear: se a carta usada para interceptar também for elegível, abre-se uma nova janela imediatamente, agora a partir de quem acabou de interceptar.

### Fim de jogo

- Vence quem descartar a última carta da mão
- Jogo termina instantaneamente nesse momento

---

## 8. Referências históricas e próximos passos

As seções abaixo preservam a pesquisa e o planejamento originais. Não são uma segunda especificação vigente; números de mercado, probabilidades, estimativas de duração, pseudocódigos e roadmap não foram revalidados para o baralho de 109 cartas.

- [Seção 01 — Pesquisa de Mercado](./01-pesquisa-mercado.md).
- [Seção 02 — Design original](./02-game-design.md): composição antiga de 108 cartas e modelos conceituais; prevalecem as regras da seção 7 deste GDD.
- [Seção 03 — Produção original](./03-producao.md): contém uma hipótese antiga de 60 cartas, arquitetura sugerida e monetização planejada; consulte o README para o runtime atual.
- [Seção 04 — Pitch e Anexos](./04-pitch-anexos.md): manual e diagramas anteriores às mecânicas mais recentes.

Próximos passos: validar os gates da revisão atual e realizar playtest de entrada, compra, descarte múltiplo, Corta-Frente, carta global e retomada com dois clientes. Pendências de PWA, restauração Local e ajuda na interface estão no [relatório](./docs/REVISAO-2026-11-18.md). Esses próximos passos não alteram as regras aprovadas.

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
