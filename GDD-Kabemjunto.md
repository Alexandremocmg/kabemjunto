# 🎴 GDD — KABEMJUNTO

**Documento de Game Design para o time de desenvolvimento**
**Versão:** 1.3 · **Data:** 2026-11-25 · **Status:** regras aprovadas; versão publicada para testes (`main` em `c46a269`)
**Autor:** Mavis Team · **Idioma:** PT-BR
**Público-alvo:** Engenharia, Game Design, Produto, QA

> **Como ler:** este é o GDD mestre e descreve o jogo **como ele é hoje no código** da `main` (`c46a269`), mais o que ainda é meta ou proposta. Cada afirmação sobre o produto vem marcada: ✅ entregue no código, 🔜 em andamento ou pendente, 📋 proposta/meta ainda não validada. A seção 7 concentra as regras vigentes. As quatro seções detalhadas na raiz (`01` a `04`) preservam o design original e são históricas. Para operação, veja o [README](./README.md); para decisões, o [DECISIONS.md](./DECISIONS.md).

---

## 0. Resumo executivo

**Kabemjunto** é um jogo de cartas digital para 2 a 10 jogadores, com baralho de **109 cartas** e partidas de 8 a 15 minutos. Parte da familiaridade do "tipo UNO" e acrescenta três camadas próprias: a **regra do 7** (silêncio social), o **acúmulo assimétrico de ataques** (+2 sobre +2, +4 sobre +2 e +4 sobre +4 acumulam; +2 sobre +4 é proibido) e a carta **0+ (Zero Mais)**, que devolve o ataque inteiro ao último atacante. Tem tematização brasileira e arte própria.

Hoje o jogo roda no navegador. O botão principal, **Jogar agora**, entra numa mesa pública e completa com bots; há também **só contra bots** (no aparelho, sem internet) e **jogar com amigos** (salas por código). O servidor é autoritativo no online. Todos usam a mesma **mesa 3D**, em que a jogada principal é um gesto só: arrastar a carta que brilha até o centro. O jogo pode ser instalado como **PWA** e a partida contra bots funciona offline.

### Dados-chave

| Item                     | Valor                                                                                                                         | Situação |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Gênero                   | Shedding game + party game social                                                                                             | ✅       |
| Jogadores                | 2 a 10 (sweet spot 4 a 6)                                                                                                     | ✅       |
| Duração de partida       | 8 a 15 min                                                                                                                    | 📋 meta  |
| Baralho                  | 109 cartas: 100 coloridas (25 por cor × 4 cores) + 9 neutras (4× +4, Troca Mão, Gira Mão, 0+, Coringa Simples, +2 Para Todos) | ✅       |
| Setup                    | Menos de 30 s (nome, número de jogadores, "Jogar agora")                                                                      | 📋 meta  |
| Explicação das regras    | Menos de 90 s, ajudada por dicas contextuais                                                                                  | 📋 meta  |
| Plataforma               | Web (PWA instalável); mobile e desktop pelo navegador                                                                         | ✅       |
| Apps nativos iOS/Android | Via bridge                                                                                                                    | 📋       |
| Modelo de negócio        | F2P com baralhos temáticos pagos e passe de temporada                                                                         | 📋       |

> Duração, setup e tempo de explicação são metas de design, não medições. Monetização, passe, loja e apps nativos **não existem** no runtime atual.

---

## 1. Visão, público e pilares

**Fantasia do jogador:** a mesa de cartas entre amigos, com provocação e reviravolta, sem a burocracia de uma partida física: "jogue em 30 segundos, entenda jogando".

**Público:** grupos de amigos e família (casual), jogadores de "tipo UNO" que querem mais tensão social, e quem joga no celular em intervalos curtos. Idioma e humor brasileiros.

### Pilares de design

1. **Simplicidade de regras** — uma partida se explica em menos de 90 s; a interface mostra o que pode ser jogado e por quê não.
2. **Tensão social crescente** — regra do 7 (quem fala paga) e acúmulo de ataques.
3. **Momento viral (0+)** — a reviravolta que vira história para contar.
4. **Um gesto, uma jogada** — arrastar a carta até o centro; escolhas (cor, alvo) aparecem no lugar, sobre a mesa, sem janelas.
5. **Rejogabilidade alta** — baralho pequeno, variância alta, partidas curtas.
6. **Dev-readiness** — fluxo de turno finito, motor de regras puro e determinístico, servidor como única autoridade online.

### Decisões macro vigentes

- **Servidor autoritativo** no online (ADR-006): o cliente só envia intenções; o motor compartilhado valida.
- **Motor puro e compartilhado** (`packages/shared`), sem DOM nem rede; o mesmo código roda no servidor e, nas partidas contra bots, no navegador.
- **TypeScript + React + Vite**; mesa em **Three.js puro**, carregada sob demanda, com camada acessível em DOM e alternativa 2D (ADR-014).
- **Arte flat/low-poly** para conter o custo do baralho; carta e logo com identidade brasileira.
- **Playtest fechado de 100 partidas ou mais** antes de balancear o 0+ (📋 ainda não executado).

---

## 2. Estado atual do produto

| Área                                             | Situação | Observação                                                                                                                               |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Motor de regras (109 cartas)                     | ✅       | Silêncio, 0+, +2 Para Todos, Corta-Frente, descarte múltiplo, Troca/Gira Mão                                                             |
| Online: salas públicas/privadas, retomada        | ✅       | Salas por código; persistência de snapshot em instância única; chat e falas rápidas                                                      |
| Mesa 3D (bots e online)                          | ✅       | Um componente para os dois modos; 2D simples sem WebGL ou com `?mesa=2d`; peso das cartas opcional (`?peso=1`); selos no jogador afetado |
| Menu, logo e leque de cartas                     | ✅       | "Jogar agora" em destaque, "Só contra bots, neste aparelho" e "Jogar com amigos". As cartas do menu ainda têm nomes em inglês            |
| Dicas contextuais                                | ✅       | Seis dicas, cada uma aparece uma vez, quando importa                                                                                     |
| PWA instalável e partida offline                 | ✅       | Manifest, ícones, service worker; menu avisa "Sem internet"                                                                              |
| "Jogar agora" com bots                           | ✅       | Sala pública rápida (ADR-015)                                                                                                            |
| Partida resiliente, revanche, prêmios e placar   | ✅       | ADR-016; não medido com jogadores reais                                                                                                  |
| Métricas de retenção                             | 🔜       | Prontas e desligadas (`docs/METRICAS.md`)                                                                                                |
| Moderação de chat e apelidos                     | 📋       | Necessária antes de divulgar para desconhecidos                                                                                          |
| Hot-seat (vários humanos no mesmo aparelho)      | ❌       | Existia na mesa antiga; saiu com a mesa 3D                                                                                               |
| Escolha de dificuldade dos bots                  | 🔜       | O motor tem Fácil, Médio e Difícil, sem escolha na interface: Fácil no aparelho, Médio no servidor                                       |
| Meta de 60 fps de média em celular intermediário | 🔜       | Hoje: mediana 60 fps, média 49 a 56 no perfil de teste (CPU 4× mais lenta, 6 jogadores)                                                  |
| Produção publicada                               | 🔜       | Ambiente de teste na VPS da Hostinger, em `https://kabemjunto.kabemmanager.online` (`c46a269`, 2026-11-25); o Railway não foi revalidado |
| Playtest fechado, onboarding visual              | 🔜 / 📋  | Roteiro pronto (issue #16), teste por fazer; onboarding na issue #17                                                                     |
| Testes automatizados                             | ✅       | 722 testes unitários e de integração e 75 cenários E2E (Chromium) em `c46a269`                                                           |

A última release marcada é `v0.5.1` e não inclui a mesa 3D nem o PWA.

---

## 3. Jornada do jogador e loop de jogo

### Jornada

1. **Abrir** o jogo (link ou ícone do PWA). Aparece o menu: logo, leque de cartas, campo de apelido e duas escolhas.
2. **Escolher o caminho:**
   - **Jogar agora:** escolher o tamanho da mesa (2 a 10; "7+" abre 7 a 10). Entra numa mesa pública; em 10 s sem mais gente, os bots completam. Sem internet ou sem resposta do servidor, vira partida no aparelho.
   - **Só contra bots, neste aparelho:** partida local imediata. O apelido é opcional nos dois.
   - **Jogar com amigos:** informar o apelido e **Criar sala** (privada ou pública) ou **Entrar** com o código; também é possível entrar por uma sala pública da lista.
3. **Sala de espera (online):** o host vê quem entrou e inicia a partida. Mãos são distribuídas em privado.
4. **Partida:** loop de turnos na mesa 3D (abaixo).
5. **Fim:** vencedor, até três prêmios, compartilhar e jogar de novo; no online, placar da sessão e revanche com a mesma mesa.

### Loop de turno (visão do jogador)

1. A mesa mostra de quem é a vez, a cor ativa, o sentido e o ataque acumulado.
2. As cartas jogáveis **brilham**; as demais ficam reduzidas, mas legíveis.
3. O jogador **arrasta** uma carta até o centro (ou toca duas vezes). Se for um coringa, escolhe a cor num anel sobre a mesa; se for Troca Mão, toca no adversário e depois escolhe a cor.
4. Sem jogada que sirva, **toca no monte** e compra. Se a carta comprada servir, ainda pode jogá-la.
5. Depois de certos descartes, abre-se a **janela do Corta-Frente**: outro jogador com a carta idêntica pode cortar a frente antes do tempo acabar.
6. A vez passa; vence quem esvaziar a mão.

---

## 4. Modos de jogo

### 4.1 Contra bots (local) ✅

- O motor roda **no navegador**; não precisa de rede nem de servidor. A partida fica na `sessionStorage` da aba e é retomada ao recarregar na mesma janela.
- **Bots:** o motor tem três níveis (Fácil joga a primeira carta válida; Médio prioriza 0+ e +4 sob ataque, depois qualquer ataque, depois Skip/Reverse quando falta a cor; Difícil refina a ordem). A interface atual usa **Fácil**.
- **Ritmo:** pausa de 900 ms antes de cada jogada de bot, para dar tempo de ver a carta anterior pousar.
- **Corta-Frente:** só o humano corta a frente; os bots não interceptam. A janela dura **4 s**.
- **Silêncio:** como não há chat nesse modo, a penalidade do 7 não existe; a mesa só exibe o aviso. A regra completa vale no online.
- Aceita de 2 a 10 jogadores (humano + bots), com todos os assentos distribuídos em ordem de turno.

### 4.2 Online ✅

- **Criação privada por padrão;** o host pode escolher pública. Só salas públicas em `AGUARDANDO`, com host conectado e vaga, aparecem na descoberta, que expõe apenas `id`, nome sanitizado, nome do host e ocupação — nunca código, token, chat, mãos ou estado da partida.
- O nome da sala é opcional e sanitizado no servidor; se ausente, vale `Sala <id>`. Somente o host inicia a partida.
- **Servidor decide tudo:** o cliente envia intenções (jogar, comprar, cortar a frente, escolher cor/alvo) e recebe o estado público e a própria mão. As mãos dos outros nunca chegam ao cliente.
- **Jogar agora:** sala pública rápida de 2 a 10, com espera de 10 s, completada por bots de nível Médio que jogam no servidor (ADR-015).
- **Sala de espera:** saída voluntária remove o jogador e transfere o host ou remove a sala vazia.
- **Prazo da vez:** 30 s. Ao estourar, um bot joga só aquela vez; dois estouros seguidos fazem o bot assumir até a pessoa agir ou tocar em **Voltei**.
- **Queda:** não é abandono. Depois de 20 s um bot joga pelo assento, e a pessoa retoma com o token. Sem ninguém conectado, nada joga.
- **Saída durante a partida:** exige confirmação. Um bot assume de vez e a retomada é revogada; a partida só termina quando sai a última pessoa, ou depois de 30 min sem ninguém conectado.
- **Revanche:** começa quando todos aceitam, ou 15 s depois do primeiro pedido, com bots nas outras vagas. Quem fica de fora volta ao menu com o motivo. Quem cai com os demais prontos tem 5 s para voltar (ADR-016).
- **Corta-Frente:** janela de **5 s**, com o primeiro pedido válido recebido vencendo, sem compensação de latência. Com bots e um único humano, só abre se ele puder cortar; com dois ou mais humanos, abre sempre, para não revelar mãos.
- **Chat e falas rápidas:** chat de sala; seis falas rápidas prontas ("Boa jogada!", "Sua vez!", "Vou comprar.", "Calma aí!", "Vamos lá!", "GG!") que aparecem como **balão sobre o assento** de quem falou e ficam no histórico do menu da partida.

---

## 5. Glossário consolidado

Termos canônicos usados em todo o GDD. Cada termo mantém o mesmo significado em todas as seções.

| Termo                       | Definição                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monte de Compra**         | Pilha virada para baixo, de onde jogadores compram cartas.                                                                                     |
| **Monte de Descarte**       | Pilha virada para cima no centro, com a `topo` sendo a última carta jogada.                                                                    |
| **Topo**                    | Última carta do Monte de Descarte. Define a cor/símbolo que a próxima jogada deve respeitar.                                                   |
| **Ativo**                   | Cor vigente definida por uma carta neutra (ou a cor da carta colorida do topo, se a última jogada não foi neutra).                             |
| **Cor**                     | Laranja, Azul, Verde ou Preto.                                                                                                                 |
| **Coringa**                 | Carta neutra que pode ser jogada sobre qualquer cor.                                                                                           |
| **Coringa Simples (Wild)**  | Coringa que apenas muda a cor ativa.                                                                                                           |
| **+4**                      | Coringa que obriga o próximo a comprar 4 cartas.                                                                                               |
| **+2**                      | Carta colorida que obriga o próximo a comprar 2 cartas.                                                                                        |
| **+2 Para Todos**           | Coringa (ADR-013) que obriga **todos** os adversários a comprar 2 cartas cada, imediatamente e sem acúmulo/defesa; quem jogou não compra nada. |
| **Ataque Acumulado**        | Soma de +2/+4 encadeados que o próximo jogador deve cobrir ou comprar.                                                                         |
| **Reflexo**                 | Efeito do 0+ (Zero Mais): o ataque acumulado é devolvido ao último atacante.                                                                   |
| **Regra do 7 / Silêncio**   | Ao jogar uma carta 7, abre-se uma janela de silêncio até a próxima carta; no online, a primeira mensagem de cada jogador nela gera +2.         |
| **Direção de Jogo**         | Horário ou anti-horário. Invertida pela carta Reverse.                                                                                         |
| **Mão**                     | Conjunto de cartas que cada jogador segura e não pode mostrar aos outros.                                                                      |
| **Descartar**               | Ação de jogar uma carta da mão no Monte de Descarte.                                                                                           |
| **Descarte Múltiplo**       | Jogar duas ou mais cartas da mesma face de uma vez, como grupo.                                                                                |
| **Comprar**                 | Ação de pegar a carta do topo do Monte de Compra.                                                                                              |
| **Vazio (estado)**          | Quando o Monte de Compra se esgota; o descarte vira novo monte (mantendo o topo).                                                              |
| **Starter (carta inicial)** | Primeira carta virada para o Monte de Descarte; nunca pode ser neutra.                                                                         |
| **Último Atacante**         | Jogador que jogou a carta de ataque mais recente; alvo do 0+ em caso de reflexo.                                                               |
| **Compra Obrigatória**      | Compra forçada por ataque (+2 / +4 / silêncio quebrado).                                                                                       |
| **Corta-Frente**            | Interceptação: jogar fora da vez uma carta idêntica à recém-descartada, antes de a janela acabar.                                              |
| **Mesa 3D / Mesa 2D**       | Representação da partida: 3D em Three.js, ou 2D simples em DOM (sem WebGL ou com `?mesa=2d`). As regras de interação são as mesmas.            |
| **Servidor Autoritativo**   | Toda validação de regras roda no servidor; o cliente só envia intenção de jogada.                                                              |
| **PWA**                     | Versão instalável do jogo, com service worker que guarda os arquivos do build para abrir offline.                                              |

---

## 6. Estados da partida e da sala

**Sala (online):** `AGUARDANDO` → `EM_PARTIDA` → `FINALIZADA`, e de volta a `EM_PARTIDA` na revanche. Só `AGUARDANDO` aceita novos jogadores.

**Estado público da partida** (o que a mesa enxerga, nunca as mãos alheias): jogadores (nome, avatar, quantidade de cartas, bot ou humano), de quem é a vez, direção, cor ativa, topo do descarte, tamanho do monte, **ataque acumulado** e sua pilha, janela de **silêncio** (ativa ou não), janela de **Corta-Frente** (alvo, prazo, revisão), histórico de eventos e vencedor.

**Modelo conceitual de turno:** INICIO_TURNO → ESPERAR_CARTA → VALIDAR → RESOLVER_ACAO → FIM_TURNO (ou COMPRAR → FIM_TURNO). É um modelo de design: o runtime executa funções puras do motor, sem uma segunda API de estados (ADR-012).

**Eventos que pedem escolha do jogador:** cor (coringas), alvo e cor (Troca Mão), grupo (descarte múltiplo), corte (janela do Corta-Frente).

---

## 7. Regras oficiais canônicas (resumo)

> Esta é a fonte canônica das regras, copiada do manual oficial e conferida com o motor. As seções `02` (game design) e `04` (anexos) expandem cada regra com pseudocódigo, casos extremos e referências para implementação.

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
- **Regra do 7 (Silêncio):** jogar 7 abre uma janela até a próxima carta. Chat escrito e Falas rápidas seguem disponíveis; a primeira mensagem de cada jogador na janela é entregue e gera +2 cartas imediatas, sem passar o turno. Novas mensagens daquele mesmo jogador não acumulam punição até outro 7 abrir uma nova janela. (A penalidade depende do chat, portanto só existe no online; contra bots o 7 apenas exibe o aviso.)

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
- Fora do MVP: rodadas, pontuação cumulativa e tempo por turno (só entrará com controle autoritativo do servidor)

---

## 8. Catálogo de cartas

| Carta               | Qtd | Efeito resumido                                | Notas de design                                                  |
| ------------------- | --- | ---------------------------------------------- | ---------------------------------------------------------------- |
| Número 0            | 4   | Joga por cor ou número                         | Uma por cor                                                      |
| Números 1 a 9       | 72  | Joga por cor ou número                         | Duas por número e cor; o **7** abre o Silêncio                   |
| Skip                | 8   | Próximo perde a vez                            | Duas por cor; pode entrar em descarte múltiplo e no Corta-Frente |
| Reverse             | 8   | Inverte o sentido                              | Com 2 jogadores funciona como Skip na prática de turno           |
| +2                  | 8   | Próximo compra 2 ou acumula                    | Não pode ser jogado sobre +4                                     |
| +4 (coringa)        | 4   | Próximo compra 4 ou acumula; escolhe cor       | Fora do descarte múltiplo e do Corta-Frente                      |
| Coringa Simples     | 1   | Escolhe a cor                                  | Anel de cores sobre a mesa                                       |
| 0+ (Zero Mais)      | 1   | Reflexo do ataque inteiro; sem ataque, coringa | A carta do "momento viral"                                       |
| Troca Mão           | 1   | Troca a mão com um jogador à escolha           | Toque no assento do adversário e depois a cor                    |
| Gira Mão (Handspin) | 1   | Todas as mãos passam para o vizinho            | Sentido vigente                                                  |
| +2 Para Todos       | 1   | Todos os adversários compram 2, na hora        | Atômica; nunca como resposta a ataque; ADR-013                   |

**Identidade visual:** quatro cores (Laranja, Azul, Verde, Preto), cartas com bordas arredondadas e índices nos cantos, verso com a marca, arte própria para as neutras (Troca Mão, Wild, +4, Handspin, Zero Plus, +2 Para Todos). A **Carta 7 é visualmente secreta**: tem a face idêntica à de um número comum, sem ícone nem ilustração especial; o Silêncio é comunicado depois do descarte, pelo aviso e pelo feed de eventos (ADR-010).

**Raridade:** o catálogo marca cada carta como comum, incomum, rara ou única, para a Coleção e para futuros baralhos temáticos; não altera nenhuma regra de jogo.

---

## 9. Mesa de jogo

### 9.1 Princípios (ADR-014)

- **Mesa 3D em Three.js puro**, carregada sob demanda (o menu não baixa o Three.js). Renderiza só quando algo muda; a resolução se reduz sozinha se os quadros ficam lentos.
- **A mesa só enxerga o estado público e a própria mão** e só envia intenções. No modo contra bots o motor roda no navegador; no online, quem decide é o servidor. É o mesmo componente (`Mesa3D`) para os dois modos.
- **Mobile-first em portrait**, feltro verde, mão em leque embaixo, adversários nos assentos ao redor, monte e descarte no centro.

### 9.2 Interações

| Ação              | Gesto                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Jogar uma carta   | Arrastar a carta que brilha até o centro; ou tocar duas vezes nela                             |
| Descarte múltiplo | Tocar em cartas de mesma face para montar o grupo e jogar de uma vez                           |
| Comprar           | Tocar no monte (quando nenhuma carta serve ou sob ataque)                                      |
| Escolher cor      | Anel de cores sobre a mesa; Esc cancela e a carta volta à mão                                  |
| Troca Mão         | Tocar no assento do adversário e depois escolher a cor                                         |
| Corta-Frente      | Arrastar a carta idêntica enquanto o **anel de contagem regressiva** gira em volta do descarte |
| Carta inválida    | Volta para a mão com o motivo ("não serve porque…")                                            |

### 9.3 Feedback e HUD

- **Barra superior:** sair da partida, indicador de vez ("SUA VEZ"), cor ativa e sentido, e menu (sala, jogadores, chat).
- **Avisos empilhados** no topo: Silêncio, ataque acumulado, reflexo do 0+, janela de Corta-Frente; **balões de fala** sobre os assentos.
- **Animação das cartas:** distribuição, descarte e compra com deslocamento até o destino; cartas dos adversários desenhadas por instâncias; respeito a `prefers-reduced-motion`.
- **Áudio:** efeitos sintetizados em tempo real pela Web Audio API, sem arquivos de som: compra, descarte, Skip, Reverse, +2, +4, 0+, silêncio ativado e quebrado, vitória.
- **Tela de fim:** prêmios e placar calculados do histórico real, sem nenhuma carta; nenhuma pontuação inventada. O confete respeita movimento reduzido.
- **Selos no jogador afetado** (`+N`, `REFLETIDO!`, `PULOU`, Silêncio quebrado), tremor da plaqueta e anel quando o 7 pousa.

### 9.4 Mesa 2D e acessibilidade

- **Mesa 2D simples** em DOM, com as mesmas regras de interação, sem baixar o Three.js. Entra sozinha sem WebGL ou com `?mesa=2d` (a escolha fica salva).
- **Camada acessível:** botões reais alinhados às cartas projetadas; `Tab` chega à mão, setas trocam de carta, `Enter` joga, `Espaço` seleciona; mudanças de turno e eventos anunciados em `aria-live`; foco preso nos diálogos.
- **Personalização:** 12 avatares e 3 temas de mesa (Floresta, Neon, Areia) em "Personalizar perfil"; o tema vale também para a mesa 3D e o avatar aparece para os outros no online. O mesmo painel desliga as métricas.

---

## 10. Menu, onboarding e dicas

**Menu inicial (✅):** logo grande e leque com cinco cartas do jogo; **apelido** em campo único no topo (opcional contra bots); **Entrar numa mesa** primeiro, em destaque, com fichas de jogadores, **Jogar agora** e **Só contra bots, neste aparelho**; **ou**; **Jogar com amigos** com _Criar sala_ e _código + Entrar_; **Salas públicas** recolhidas, com a contagem.

Decisões de UX:

- as duas escolhas aparecem **sem rolar a tela** em um celular comum; o primeiro desenho escondia "bots" abaixo de "Criar sala" e quem abria o jogo achava que só existia online;
- no celular o campo de apelido **não recebe foco sozinho** (o teclado cobriria as escolhas);
- o aviso "Offline" não aparece no menu enquanto ninguém tentou conectar; sem rede, o menu avisa "Sem internet: só dá para jogar contra bots" e desabilita as salas.

**Dicas contextuais** (no lugar do tutorial; cada uma aparece **uma vez**, no momento em que importa, com "Entendi" e "Não mostrar dicas"):

1. _Sua vez_ — as cartas que brilham servem; arraste até o centro.
2. _Cartas iguais?_ — toque nas de mesma face para jogar o grupo.
3. _Nenhuma carta serve_ — toque no monte para comprar.
4. _Você está sob ataque_ — cubra com +2, +4 ou 0+, ou compre tudo; +2 sobre +4 não vale.
5. _Você tem o 0+_ — devolve o ataque inteiro a quem atacou por último.
6. _Carta 7: silêncio!_ — até a próxima carta, quem mandar mensagem compra +2.

📋 **Onboarding visual da primeira partida** segue como proposta (issue #17).

---

## 11. Social e retenção

- **Silêncio (regra do 7):** o momento de tensão em que falar custa caro; só faz sentido com humanos, então é uma das razões do online.
- **0+:** reviravolta para contar; o aviso e a animação do reflexo são parte do design ("momento viral").
- **Corta-Frente:** reação rápida fora da vez, que quebra a previsibilidade do turno e dá protagonismo a quem estava de fora.
- **Falas rápidas e balões:** comunicação leve, sem digitar, que também funciona durante o Silêncio.
- **Compartilhamento:** **Convidar** na sala de espera (link que preenche o código) e imagem do resultado no fim, só com o endereço do jogo.
- **Revanche, prêmios e placar da sessão:** mantêm a mesma turma na mesa.
- 📋 **Próximas etapas de retenção:** missões diárias, títulos e versos; depois desafios contra bots, presets e álbum. Só com números reais. Passe de temporada e ranking não estão desenhados nem entregues.

---

## 12. PWA e jogo offline

- **✅** manifest (nome, ícones de 192 e 512 px e _maskable_, `display: standalone`), service worker gerado no build e instalação pelo navegador. No iPhone: Compartilhar → Adicionar à Tela de Início.
- **O que funciona offline:** o menu, a logo, as cartas, a mesa 3D (inclusive o pedaço do Three.js) e a partida contra bots, que é retomada ao recarregar na mesma janela. Criar e entrar em sala exigem conexão e ficam desabilitados com aviso.
- **Cache:** arquivos do build (42, cerca de 1,6 MB, na medição de 2026-11-21), versionados por hash do conteúdo; **só arquivos públicos do build**, nunca rotas do servidor (`/health`, `/socket.io`). Uma nova versão aguarda o fechamento das janelas da anterior.
- 📋 Não verificados: instalação em aparelho físico e no Safari do iPhone; atualização entre duas versões reais.

---

## 13. Arquitetura e operação (resumo)

| Camada       | Tecnologia / decisão                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo     | `packages/shared` (tipos, motor puro, constantes, telemetria), `apps/server`, `apps/web`, `e2e/`                                                                                                                        |
| Frontend     | React 18, TypeScript estrito, Vite; JS inicial ≈ 78 kB gzip; Three.js ≈ 144 kB gzip, só na mesa 3D                                                                                                                      |
| Servidor     | Node + Fastify 5 + Socket.IO; valida cada ação e distribui estado público e mãos privadas                                                                                                                               |
| Persistência | Snapshot JSON atômico (schema v3, lê v2), **instância única** (ADR-011); sem banco externo                                                                                                                              |
| Segurança    | Retomada por token seguro; CORS e `METRICS_TOKEN` obrigatórios em produção; nomes sanitizados; mãos nunca no estado público                                                                                             |
| Telemetria   | Opcional e desligada por padrão, amostragem de 10% em produção quando configurada (ADR-005, LGPD)                                                                                                                       |
| Deploy       | Docker servindo web e Socket.IO na mesma origem; Railway com deploy manual (não revalidado). Hoje o jogo roda numa VPS da Hostinger (systemd) e se atualiza à mão: ver [`docs/OPERACAO-VPS.md`](./docs/OPERACAO-VPS.md) |
| Teste local  | `npm run tunel`: túnel rápido da Cloudflare (HTTP/2) com o servidor em modo produção, para testar com amigos                                                                                                            |

Limites conhecidos: o servidor não confere a origem das conexões WebSocket (baixo impacto, sem correção); réplicas do servidor exigem coordenação que ainda não existe.

---

## 14. Qualidade e desempenho

- **Testes:** 440 unitários (Vitest, com propriedades em fast-check para o motor) e 46 cenários E2E em Chromium (menu, salas, mesa 3D local e online, 2D, acessibilidade e PWA offline). O CI exige 80% de cobertura de statements no motor e na persistência, auditoria de dependências de produção, lint, formatação e build.
- **Desempenho (mesa 3D):** build de produção, 375×812 @2x, CPU 4× mais lenta, 6 jogadores, GPU integrada: mediana 16,7 ms por quadro (60 fps), **média 49 a 56 fps**, picos de 150 a 200 ms nas jogadas. **A meta de 60 fps de média ainda não foi atingida**; o próximo passo previsto é um atlas de faces de carta.
- **Não testado:** celular físico, Safari e Firefox (só Chromium).

---

## 15. Roadmap, pendências e riscos

### Próximos passos (ordem sugerida)

1. **Playtest fechado** (issue #16) e correções que ele mostrar.
2. **Ligar as métricas** (chave e aviso de privacidade) e tratar a **moderação** de chat e apelidos.
3. **Primeira partida guiada** (issue #17) e, então, divulgar em pequena escala.
4. **Desempenho:** atingir 60 fps de média no perfil de teste; testar em celulares físicos, Safari e Firefox.
5. **Bots:** oferecer a escolha de dificuldade (Fácil/Médio/Difícil) no menu e, depois, deixar os bots usarem o Corta-Frente.
6. **Ajustar o 0+** com base nos dados do playtest.

### Pendências técnicas

- Validação estrutural do estado local restaurado da `sessionStorage` (hoje confia no JSON salvo).
- Dependências do web sem uso a conferir (`zustand`, `@tanstack/react-query`, `framer-motion`) a remover com aprovação.
- Checagem da origem do WebSocket no servidor.

### Riscos

| Risco                                                              | Prob. | Impacto | Mitigação                                                                                                                  |
| ------------------------------------------------------------------ | ----- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0+ desequilibrado (reflexo decide partidas)                        | Média | Alto    | Playtest fechado antes de balancear; métricas de uso do 0+                                                                 |
| Desempenho da mesa 3D em celulares fracos                          | Média | Alto    | Fallback 2D, resolução adaptativa, atlas de faces                                                                          |
| Jogador não entende o que fazer na mesa                            | Média | Alto    | Dicas contextuais; primeira partida guiada (issue #17)                                                                     |
| Desconhecidos ofensivos no chat ou no apelido                      | Alta  | Alto    | Moderação antes de divulgar                                                                                                |
| Instância única do servidor limita escala e disponibilidade        | Média | Médio   | Documentado (ADR-011); coordenação antes de aumentar réplicas                                                              |
| Produção indisponível por custo ou plano da hospedagem             | Alta  | Alto    | Regularizar a hospedagem; alternativas gratuitas já levantadas                                                             |
| A atualização da VPS é manual e o túnel rápido legado ainda existe | Alta  | Médio   | URL estável já configurada (subdomínio + Traefik); resta automatizar a atualização; procedimento em `docs/OPERACAO-VPS.md` |
| Silêncio sem graça contra bots (sem chat)                          | Alta  | Baixo   | Posicionar o Silêncio como razão para jogar online                                                                         |

---

## 16. Referências históricas e ADRs

As seções abaixo preservam a pesquisa e o planejamento originais. Não são uma segunda especificação vigente; números de mercado, probabilidades, estimativas, pseudocódigos e roadmap não foram revalidados para o baralho de 109 cartas.

- [Seção 01 — Pesquisa de Mercado](./01-pesquisa-mercado.md).
- [Seção 02 — Design original](./02-game-design.md): composição antiga de 108 cartas; prevalecem as regras da seção 7.
- [Seção 03 — Produção original](./03-producao.md): hipótese antiga de 60 cartas, arquitetura sugerida e monetização planejada.
- [Seção 04 — Pitch e Anexos](./04-pitch-anexos.md): manual e diagramas anteriores às mecânicas mais recentes.
- [Redesign da mesa — Fase 1](./docs/UI-REDESIGN-FASE-1.md) (histórico; a mesa atual é a 3D).

**Decisões arquiteturais relevantes** ([DECISIONS.md](./DECISIONS.md)): ADR-005 telemetria opcional · ADR-006 servidor autoritativo · ADR-010 mesa mobile e Carta 7 secreta · ADR-011 persistência atômica em instância única · ADR-012 remoção da API de state machine sem consumidor · ADR-013 carta +2 Para Todos e baralho de 109 · ADR-014 mesa 3D com Three.js, camada acessível e fallback 2D.

---

## 17. Changelog do GDD

| Versão                   | Data       | Status         | Notas                                                                                                                                                                                                                              |
| ------------------------ | ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0                      | 2026-07-26 | Draft para Dev | Versão inicial consolidada a partir das 4 seções de pesquisa, design, produção e pitch. Aprovado para repasse ao time de desenvolvimento.                                                                                          |
| 1.1                      | 2026-08-01 | Aprovado       | ADR-013: baralho expandido de 108 para 109 cartas com a nova carta neutra "+2 Para Todos" (ataque global, `MAIS_DOIS_TODOS`).                                                                                                      |
| 1.1 (revisão documental) | 2026-11-18 | Reconciliado   | Links, escopo histórico, composição, compra, abertura e Corta-Frente alinhados à revisão `54c4601`; sem nova regra.                                                                                                                |
| **1.2**                  | 2026-11-21 | Em revisão     | Reescrito para o produto atual: mesa 3D e 2D, menu de dois caminhos, dicas contextuais, modos (bots e online), PWA e offline, estados, catálogo, arquitetura, qualidade, roadmap e riscos. **Nenhuma regra mudou**; hot-seat saiu. |
