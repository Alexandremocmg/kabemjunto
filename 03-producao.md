# 3. Produção, Arte, UX e Implementação — Kabemjunto

> **Referência histórica — aviso de 2026-11-18:** conteúdo preservado do planejamento original; tabelas, pseudocódigos, roadmap e contagens abaixo não descrevem necessariamente o runtime atual. As regras vigentes estão no [GDD mestre](./GDD-Kabemjunto.md) (109 cartas, incluindo +2 Para Todos); a operação implementada está no README da raiz. Valores antigos de 60/108 cartas, estimativas e recursos propostos não devem ser usados como contrato atual.

> Documento de produção. Esta seção traduz o **Game Design** (seção 02) e a
> **Pesquisa de Mercado** (seção 01) em decisões concretas de **balanceamento**,
> **arte**, **experiência do usuário**, **arquitetura**, **monetização**,
> **roadmap** e **métricas de sucesso**. Destinatário primário: time de
> engenharia e produto. Destinatário secundário: game designers, artistas, QA.

**Versão:** 1.0 · **Data:** 2026-07-26 · **Status:** Draft para Dev

---

## Índice

1. [Balanceamento matemático](#1-balanceamento-matemático)
2. [Direção de arte](#2-direção-de-arte)
3. [Experiência do usuário (UX)](#3-experiência-do-usuário-ux)
4. [Arquitetura técnica sugerida](#4-arquitetura-técnica-sugerida)
5. [Plano de monetização](#5-plano-de-monetização)
6. [Roadmap de desenvolvimento](#6-roadmap-de-desenvolvimento)
7. [Métricas de sucesso (KPIs)](#7-métricas-de-sucesso-kpis)

---

## 1. Balanceamento matemático

O balanceamento do Kabemjunto é o coração da rejogabilidade. Esta subseção
apresenta os números, a lógica por trás deles e os pontos de ajuste fino
previstos.

### 1.1 Composição quantitativa do baralho (referência)

| Categoria                                     |       Qtde | % do baralho |
| --------------------------------------------- | ---------: | -----------: |
| Cartas numeradas 0–9 × 4 cores                |         40 |        ~47 % |
| Skip, Reverse, +2 (×4 cores, 3 tipos)         |         12 |        ~14 % |
| +4 (neutras)                                  |          4 |       ~4,7 % |
| Troca Mão                                     |          1 |       ~1,2 % |
| Gira Mão                                      |          1 |       ~1,2 % |
| 0+ (Zero Mais)                                |          1 |       ~1,2 % |
| Coringa Simples                               |          1 |       ~1,2 % |
| 7 (Silêncio) — está incluso nas numeradas (4) | já contado |            — |
| **Total**                                     |     **60** |    **100 %** |

> Observação: o baralho real poderá ser expandido para 108 cartas (no estilo
> UNO) caso a telemetria de jogo mostre partidas curtas demais. Para o MVP,
> **60 cartas** são suficientes para 2–6 jogadores. Para 7–10 jogadores
> (suportado pela regra), recomenda-se **baralho dobrado (108 cartas)**.

### 1.2 Probabilidade de ter carta jogável na mão inicial

Hipóteses:

- Baralho de 60 cartas; 7 distribuídas por jogador; nenhuma carta conhecida
  pelo jogador.
- O topo do descarte é a primeira carta válida virada (regra: não pode ser
  neutra). Consideramos conservadoramente que **qualquer cor ou número** é
  aceitável para "jogável".
- Cartas numeradas = 40; cartas de ação coloridas (Skip/Reverse/+2) = 12;
  neutras = 7 (+4×4, Troca Mão, Gira Mão, 0+, Coringa Simples). Total
  jogável = **59/60** (todas, exceto a regra do silêncio que é uma
  restrição temporal, não de cor/número).

**Probabilidade de NENHUMA carta jogável (mão inteiramente inerte) na primeira
mão:**

Considerando o pior caso cínico: o jogador viu a carta do topo. Se ela for
"X cor Y", cartas que casam são: 9 cartas da mesma cor (0-9) + cartas
"qualquer" (neutras). Em 60 cartas, ~9 + 7 = 16 cartas jogáveis
"diretamente"; as neutras podem ser jogadas sempre. Logo, cartas que
**não casam diretamente** ≈ 60 − 16 = 44.

Hipergeométrica (N=60, K=16 jogáveis, n=7):

```
P(0 jogáveis) = C(60−16, 7) / C(60, 7)
             = C(44, 7) / C(60, 7)
             = 8.446.680 / 386.206.920
             ≈ 2,19 %
```

**P(≥ 1 jogável) ≈ 97,8 %** — valor excelente para a primeira mão. Em UNO o
número equivalente gira em torno de 92-95 % (baralho com mais cartas não
úteis). **Tabela por número de cartas na mão:**

|         Mão | P(0 jogáveis) |      P(≥ 1) |
| ----------: | ------------: | ----------: |
|           5 |       ~0,95 % |     ~99,0 % |
| 7 (inicial) |       ~2,19 % | **~97,8 %** |
|          10 |       ~4,77 % |     ~95,2 % |
|          14 |        ~9,4 % |     ~90,6 % |

> Conclusão: a partir de 10 cartas na mão a chance de "mão presa" ultrapassa
> 5 %. O **efeito de alívio do +2 (comprar cartas)** é importante para
> resiliência: ele **reduz** essa probabilidade dinamicamente. O dev deve
> implementar o buy-back automático: ao ficar sem carta jogável, comprar 1
> carta e revalidar (regras do UNO clássico).

### 1.3 Distribuição por raridade (para fins de UX e monetização)

Embora Kabemjunto **não tenha sistema de coleção obrigatório**, a comunidade
costuma referir-se a cartas em termos de raridade. Adotamos a convenção:

| Raridade    | Categoria                                | Qtde |      % | Uso no jogo                      |
| ----------- | ---------------------------------------- | ---: | -----: | -------------------------------- |
| **Comum**   | Cartas numeradas 0-9 (40 cartas)         |   40 | 66,7 % | Jogo base, alto volume           |
| **Incomum** | Skip / Reverse / +2 coloridas            |   12 | 20,0 % | Tático, esperado em todo baralho |
| **Rara**    | +4 (Coringa de compra)                   |    4 |  6,7 % | Mudança de rumo, virada          |
| **Única**   | Troca Mão, Gira Mão, 0+, Coringa Simples |    4 |  6,7 % | Efeito signature, momento viral  |

**Implicação para coleção digital (F2P):** podemos vender **baralhos
temáticos** substituindo cartas Comuns/Incomum mantendo a contagem. Raras
e Únicas são fixas no jogo base para preservar balanceamento.

### 1.4 Tempo médio de partida estimado por nº de jogadores

Estimativa calibrada com referência de UNO e Mão de Onze, considerando o
fator de "ataque acumulado" + "silêncio" do Kabemjunto (que **aumenta** a
duração vs UNO puro).

| Jogadores | Duração média (min) | Desvio | Notas                                         |
| --------: | ------------------: | -----: | --------------------------------------------- |
|         2 |               10–14 |     ±4 | Reverse vira Skip; jogo rápido, tensão direta |
|         3 |               14–20 |     ±5 | Sweet spot casual                             |
|         4 |               18–25 |     ±6 | Sweet spot "festa de família"                 |
|         5 |               22–30 |     ±7 | Empilha mais, ataques rolam                   |
|         6 |               25–35 |     ±8 | Limite confortável para 60 cartas             |
|       7–8 |               30–45 |    ±10 | Requer baralho dobrado (108 cartas)           |
|      9–10 |               35–55 |    ±12 | Requer baralho dobrado; **modo especialista** |

**Fórmula aproximada (dev-friendly):**

```
duracao_estimada_min = base(2p=11, 4p=21) + 2.5 * (n − 2) + random(0, 8)
```

Para o balanceamento, o **target é 20 ± 10 min para 4 jogadores** — janela
ideal para "uma partida na mesa antes do jantar" ou "uma partida no
metrô".

### 1.5 Risco de dominância do 0+ (carta única com efeito viral)

**Premissa:** a carta 0+ reflete todo ataque acumulado para o último
atacante e termina o acúmulo. Há **apenas 1 unidade** no baralho.

**Análise:**

- Probabilidade de o 0+ estar na mão inicial de um jogador específico =
  7/60 ≈ **11,7 %** (sem considerar descarte).
- Probabilidade de **algum** jogador ter 0+ na mão inicial ≈ 1 − (53/60)^7 ≈
  **~ 60 %**. Isso é **alto**: em quase 6 em cada 10 partidas, alguém
  começa com a carta viral.
- Pior caso: o dono do 0+ é também o atacante original de uma cadeia +2 →
  +4. Ele pode **cancelar o próprio ataque** gastando o 0+? **Regra
  recomendada:** sim, com confirmação ("Tem certeza? Vai custar sua carta
  viral."). Isso reduz o "feels bad" do dono do 0+ que recebe seu
  próprio ataque.

**Riscos identificados:**

1. **Stacking toxicity:** jogadores combinam 0+ com 7 (silêncio) para
   travar a mesa em vez de jogar. Mitigação: limite de 1 carta especial
   por turno (regra já implícita no UNO).
2. **Snowball reverso:** alguém recebe um +12 e o 0+ devolve; quem
   devolveu pode ser alvo da mesa no turno seguinte. Aceitável como
   mecânica.
3. **King-making:** 0+ pode decidir a partida. Aceitável — é o "momento
   viral" do design.

**Recomendação de ajuste fino (se necessário, pós-lançamento):**

- Aumentar 0+ para **2 unidades** se a telemetria mostrar "win rate por 0+"
  > 25 % em 4-p (alto desvio).
- Caso contrário, manter 1 unidade (sugestão atual). O efeito de "carta
  lendária" faz parte da identidade.

### 1.6 Sugestões de ajuste fino (calibração contínua)

| Parâmetro            |                Valor MVP | Range aceitável | Trigger de ajuste         |
| -------------------- | -----------------------: | --------------- | ------------------------- |
| Tamanho do baralho   |                       60 | 60 – 108        | Partidas < 8 min com 4p   |
| Distribuição inicial |                 7 cartas | 5 – 8           | P(0 jogáveis) > 5 %       |
| Limite de acúmulo +2 | 8 (recomendado soft-cap) | 4 – 12          | Empilhamento > 10 é comum |
| 7 Silêncio duração   |                  1 turno | 1 – 2           | Jogadores ignoram regra   |
| Win-rate do 0+       |                    ~15 % | 10 – 25 %       | Fora da faixa             |

A **telemetria de produção** deve expor esses números e alimentar um
dashboard interno de balanceamento.

---

## 2. Direção de arte

### 2.1 Paleta de cores (4 cores + neutras)

Pensada para **acessibilidade para daltonismo** (deuteranopia/protanopia) e
alto contraste em tela:

| Cor                   | Hex sugerido                       | RGB           | Uso                          | Contraste em branco (WCAG) |
| --------------------- | ---------------------------------- | ------------- | ---------------------------- | -------------------------: |
| **Laranja**           | `#F26B1F`                          | 242, 107, 31  | Cartas 0-9 + Skip/Reverse/+2 |                    3,4 : 1 |
| **Azul**              | `#1E88E5`                          | 30, 136, 229  | Cartas 0-9 + Skip/Reverse/+2 |                    3,0 : 1 |
| **Verde**             | `#43A047`                          | 67, 160, 71   | Cartas 0-9 + Skip/Reverse/+2 |                    2,7 : 1 |
| **Preto**             | `#212121`                          | 33, 33, 33    | Cartas 0-9 + Skip/Reverse/+2 |                   15,5 : 1 |
| **Neutro** (coringas) | `#FFFFFF` c/ borda preta `#000000` | 255, 255, 255 | +4, Troca, Gira, 0+, Coringa |                     21 : 1 |

> Cores de fundo do app: **off-white `#FAF7F2`** (papel) ou **deep purple
> `#1A1A2E`** (modo noturno). Evitar fundos que se confundam com qualquer
> cor de carta.

### 2.2 Estilo visual recomendado

**Recomendação: FLAT DESIGN com toques de ilustração** (híbrido).

Justificativa:

- **Flat** garante clareza dos símbolos, leitura rápida dos números,
  legibilidade em telas pequenas (mobile).
- **Ilustração** (pequenos mascotes nas cartas) gera identidade afetiva,
  share-appeal em redes sociais (memes, prints).
- **Não usar retrô pixelado** — o jogo precisa parecer "moderno casual"
  para concorrer com UNO Mobile, Taki e Phase 10.
- Referências: cartas de **Uno Minimal Edition**, mas com ilustração
  estilo **Sticker Pack** (corpo arredondado, sombra suave, traço
  consistente).

### 2.3 Iconografia das cartas especiais

Cada ação tem um símbolo único (além da cor), garantindo legibilidade
para daltônicos e para crianças que ainda não leem:

| Carta               | Símbolo                           | Ícone sugerido (texto) |
| ------------------- | --------------------------------- | ---------------------- |
| **Skip**            | Círculo com barra (Ø)             | 🚫 ou "→" cortado      |
| **Reverse**         | Duas setas em U                   | ↺↻ ou ⟲                |
| **+2**              | "+2" estilizado em círculo        | +2                     |
| **+4**              | "+4" estilizado em losango (wild) | +4                     |
| **Troca Mão**       | Duas mãos trocando                | 🤝 ou ⇄                |
| **Gira Mão**        | Mão com rotação                   | 🔄                     |
| **0+**              | "0+" estilizado em escudo         | 0+                     |
| **Coringa Simples** | Estrela de 4 pontas               | ★                      |
| **7 (Silêncio)**    | Boca com dedo indicador (shh)     | 🤫 ou "7" com traço    |

**Princípio de design:** o número/símbolo ocupa **40 % do canvas** da carta
e fica centralizado. Bordas de cor pintam a moldura inteira (estilo
"frame"), o que ajuda na leitura periférica.

### 2.4 Mockup textual de uma carta (campos, layout)

```
┌──────────────────────────────────┐
│ ╔══════════════════════════════╗ │
│ ║  [cor: LARANJA - moldura]    ║ │
│ ║  ┌─┐                        ║ │
│ ║  │7│ ← canto superior       ║ │
│ ║  └─┘                        ║ │
│ ║                              ║ │
│ ║         ┌────────┐           ║ │
│ ║         │   7    │           ║ │
│ ║         │  (shh) │           ║ │
│ ║         └────────┘           ║ │
│ ║                              ║ │
│ ║  ┌─┐   "Silêncio até a       ║ │
│ ║  │7│    próxima carta"       ║ │
│ ║  └─┘   [legenda só na verso] ║ │
│ ║                              ║ │
│ ║  [verso: padrão Kabemjunto]  ║ │
│ ╚══════════════════════════════╝ │
│  ~63 × 88 mm (padrão UNO)        │
└──────────────────────────────────┘
```

**Campos de uma carta (modelo de dados da UI):**

| Campo                | Tipo            | Exemplo                        | Obrigatório       |
| -------------------- | --------------- | ------------------------------ | ----------------- |
| `id`                 | string          | "7-LARANJA"                    | sim               |
| `cor`                | enum            | LARANJA                        | sim               |
| `tipo`               | enum            | NUMERADA / ACAO / NEUTRA       | sim               |
| `valor`              | int 0-9 ou null | 7                              | só se NUMERADA    |
| `acao`               | enum Acao       | SILENCIO / SKIP / ...          | só se ACAO/NEUTRA |
| `efeito_texto_curto` | string          | "Silêncio"                     | sim               |
| `efeito_texto_longo` | string          | "Próximo a falar compra 2"     | sim               |
| `simbolo`            | asset (SVG)     | icone-shh-7.svg                | sim               |
| `raridade`           | enum            | COMUM / INCOMUM / RARA / UNICA | sim               |
| `colecao`            | string          | "base-v1"                      | sim               |

### 2.5 Aplicação da marca "Kabemjunto"

**Logo conceitual (descrição textual):**

```
   ╔════════════════════════════════╗
   ║   K̲abemjunto                  ║
   ║   ┌─┬─┬─┐  ┌─┬─┬─┬─┐          ║
   ║   │K│A│B│  │J│U│N│T│          ║
   ║   └─┴─┴─┘  └─┴─┴─┴─┘          ║
   ║        "jogue, grite, vença"   ║
   ╚════════════════════════════════╝
```

- **Forma:** cartas levemente inclinadas formando o "K" inicial.
- **Cores:** usa a paleta de jogo (laranja, azul, verde, preto) com o
  neutro como fundo.
- **Tipografia sugerida:** **Nunito** (Google Fonts) para corpo — é
  arredondada, amigável e tem bom suporte a PT-BR. Para o logo/display:
  **Bungee** ou **Rubik Mono One** (impacto visual).
- **Tagline:** _"Jogue. Grite. Vença."_ (curta, memorável, em PT-BR).
- **Variações:** logo horizontal (uso em web/header), logo quadrado
  (ícone de app), logo monograma "K" (favicon).

---

## 3. Experiência do usuário (UX)

### 3.1 Jornada do jogador (onboarding → partida → fim)

```
[Abertura]
   ↓
[Tela de Boas-vindas]  (logo + "Toque para começar")
   ↓
[Login opcional / Convidar amigos]  (1 toque para "Jogar como convidado")
   ↓
[Lobby] (criar sala / entrar com código / single-player vs bot)
   ↓
[Tutorial rápido] (só na 1ª vez — 5-7 telas, ver 3.2)
   ↓
[PARTIDA]
   ├── Distribuição
   ├── Loop de turno (ver seção 02)
   ├── Eventos: comprar, jogar, sofrer ataque, desfazer ataque (0+)
   └── [Fim] → tela de resultados
   ↓
[Pós-partida]
   ├── Placar (quem ganhou, nº de cartas, maior ataque sofrido)
   ├── Botão "Jogar de novo (mesma sala)"
   ├── Botão "Voltar ao lobby"
   └── Compartilhamento (print / link de sala)
   ↓
[Retenção]
   ├── Notificação push (1×/dia) "Sua sala está esperando"
   └── Missão diária (ex: "Vença uma partida sem usar +2")
```

### 3.2 Tutorial sugerido (5-7 telas)

| Tela | Título               | Conteúdo                                                    | Interação                        |
| ---- | -------------------- | ----------------------------------------------------------- | -------------------------------- |
| 1    | Bem-vindo            | Logo + "Vamos jogar Kabemjunto em 60s"                      | Toque para avançar               |
| 2    | Sua mão              | Mostra 7 cartas, explica o objetivo: "Descarte tudo"        | Arrastar uma carta para o centro |
| 3    | Carta por cor/número | Topo do descarte destacado; legenda "Combine cor ou número" | Tocar na carta válida → descarta |
| 4    | Cartas especiais     | "Skip, Reverse, +2, +4... conheça as armas"                 | Carrossel horizontal             |
| 5    | A regra do 7         | "Jogue 7 = silêncio. Quem falar compra +2"                  | Toast com ícone shh              |
| 6    | O 0+                 | "A carta lendária. Reflete o ataque para o último atacante" | Glow visual especial             |
| 7    | Pronto!              | "Boa sorte. Divirta-se. Compartilhe."                       | Botão "Jogar agora"              |

**Princípios do tutorial:**

- **Aprender fazendo**, não ler paredes de texto.
- **Re-jogável** sob demanda ("?" no menu principal).
- **Pulado** por quem clica em "Já sei jogar".

### 3.3 Acessibilidade

| Aspecto                  | Implementação                                                                                                         | Padrão de referência |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Daltonismo**           | Símbolo + texto + cor (nunca só cor). Modo "alto contraste" + filtro deuteranopia/protanopia                          | WCAG 1.4.1           |
| **Modo 1 jogador (bot)** | IA simples: prioriza jogar cartas de ação se possível; senão, maior nº; senão, compra. 3 níveis (Fácil/Médio/Difícil) | A11y básica          |
| **Texto grande**         | Toggle em Configurações: 100 % / 125 % / 150 %. Limite mínimo: 14 sp (mobile)                                         | WCAG 1.4.4           |
| **Leitor de tela**       | Labels semânticos em todas as cartas: "Laranja, número 5"                                                             | WCAG 4.1.2           |
| **Controle por voz**     | "Pular turno" via comando de voz (P2)                                                                                 | Inovação             |
| **Modo silencioso**      | Toggle global de áudio em Configurações (independente do SO)                                                          | UX básico            |
| **Tempo estendido**      | Em torneios: tempo de turno configurável (15s padrão → 60s)                                                           | A11y cognitiva       |

### 3.4 Recursos de áudio

| Evento               | Som sugerido                       | Volume | Notas                             |
| -------------------- | ---------------------------------- | ------ | --------------------------------- |
| Carta descartada     | "fwoosh" suave                     | 60 %   | Toque curto, satisfatório         |
| Carta inválida       | "bzzt" / "thud"                    | 70 %   | Acompanha shake (ver 3.5)         |
| +2 jogado            | Alerta grave (buzzer curto)        | 80 %   | 2 beeps                           |
| +4 jogado            | Alerta grave estendido             | 90 %   | 4 beeps, pode assustar — calibrar |
| Silêncio ativado (7) | Sino + "shhh" feminino/masculino   | 50 %   | Culturalmente neutro              |
| Silêncio quebrado    | "ah!" cômico + som de carta puxada | 75 %   | Reforça regra                     |
| 0+ jogado            | "WHOOSH" reverso + coro épico      | 100 %  | Momento viral, áudio grandioso    |
| Vitória              | Fanfarra curta (3s)                | 90 %   | Não exagerar — UX pós-partida     |
| Fundo de menu        | Lo-fi chill, 30s loop              | 30 %   | Opcional, toggle                  |

**Princípios:** nenhum som é **crítico** para a jogabilidade. Toggle
central. Áudio mono (acessibilidade auditiva).

### 3.5 Microinterações

| Evento                 | Animação                                                   | Duração               | Easing            |
| ---------------------- | ---------------------------------------------------------- | --------------------- | ----------------- |
| Carta válida           | Slide para o centro + flip 3D                              | 350 ms                | ease-out          |
| Carta inválida         | **Shake** (3 oscilações ±10 px no eixo X) + flash vermelho | 400 ms                | ease-in-out       |
| 0+ jogado              | **Glow dourado** na carta + onda expansiva (radial)        | 600 ms                | ease-out + spring |
| 7 silêncio             | Tela escurece 20 %, ícone "shh" central pulsando           | ∞ (até próxima carta) | pulse 1,2s        |
| Ataque sofrido         | Contador grande aparece com bounce (+2, +4, +6...)         | 500 ms                | bounce-out        |
| Compra de carta        | Carta vinda do monte, flip e desliza para mão              | 500 ms                | ease-out          |
| Vez do próximo         | Seta apontando + nome do jogador com fade                  | 300 ms                | ease-in-out       |
| Carta 1 carta restante | Ícone "1!" pulsa + som curto                               | 1 s loop              | ease-in-out       |

**Princípio:** feedback é **imediato (< 100 ms percepção)**. Nada
bloqueante. Animações em **CSS transforms / GPU-accelerated** para 60 fps
em mid-tier mobile.

---

## 4. Arquitetura técnica sugerida

### 4.1 Plataforma alvo

**Recomendação: PWA (Progressive Web App) como primária, com wrapper nativo
opcional.**

| Plataforma                  | Justificativa                                                                                   | Trade-off                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **PWA (web)** ✅            | Zero fricção de instalação; funciona em iOS, Android, Desktop; SEO/share fácil; itera sem loja. | Push notifications iOS limitadas                |
| Mobile nativo (iOS+Android) | Melhor performance e push                                                                       | Custo 2× de desenvolvimento                     |
| Desktop (Electron)          | Não justifica para card game casual                                                             | Distribuição mais simples, mas install friction |
| Impresso (físico)           | Cria marca/community, mas é **complementar**, não foco do MVP                                   | Margem alta, escala baixa                       |

> **Decisão:** começar com **PWA**. Em Release (v1.0), avaliar wrapper
> **Capacitor** para iOS/Android para ganhar push notifications e
> presença em lojas. Investimento incremental ~ 4-6 semanas.

### 4.2 Stack recomendada

| Camada           | Stack                                               | Justificativa                            |
| ---------------- | --------------------------------------------------- | ---------------------------------------- |
| Frontend         | **TypeScript + React 18 + Vite**                    | Maturidade, ecossistema, dev rápido      |
| UI Kit           | **Tailwind CSS + shadcn/ui**                        | Customizável, acessível, sem lock-in     |
| Estado (cliente) | **Zustand** (leve) + **React Query** (server state) | Combina simplicidade + cache de rede     |
| Animações        | **Framer Motion**                                   | Microinterações de alta qualidade        |
| Backend          | **Node.js 20 + Fastify + TypeScript**               | Mesma linguagem do front, baixa latência |
| Realtime         | **Socket.IO** ou **WebSocket nativo**               | Maturidade, fallback para polling        |
| DB               | **PostgreSQL** + **Redis** (sessões/leaderboard)    | Sólido, grátis em tier inicial           |
| Auth             | **Auth.js (NextAuth)** ou **Supabase Auth**         | Email + OAuth (Google, Apple)            |
| Hospedagem       | **Vercel** (front) + **Fly.io / Railway** (back)    | Edge deploy, escalável                   |
| Observabilidade  | **Sentry** + **PostHog** (analytics)                | Crash + funis de produto                 |
| CI/CD            | **GitHub Actions**                                  | Padrão, gratuito para OSS                |

**Por que não Unity/Godot?** Para um jogo de cartas 2D, a stack web é
**3-5× mais barata** de produzir e manter. Unity/Godot fariam sentido
apenas se quiséssemos 3D, AR ou física complexa — não é o caso. **Stack
web é a escolha certa para MVP iterativo.**

### 4.3 Modelo de dados do baralho

```typescript
// src/shared/types/card.ts

export enum Cor {
  LARANJA = 'LARANJA',
  AZUL = 'AZUL',
  VERDE = 'VERDE',
  PRETO = 'PRETO',
  NEUTRO = 'NEUTRO', // coringa
}

export enum TipoCarta {
  NUMERADA = 'NUMERADA',
  ACAO = 'ACAO', // Skip, Reverse, +2
  NEUTRA = 'NEUTRA', // +4, Troca Mão, Gira Mão, 0+, Coringa Simples
}

export enum Acao {
  SKIP = 'SKIP',
  REVERSE = 'REVERSE',
  MAIS_DOIS = '+2',
  MAIS_QUATRO = '+4',
  TROCA_MAO = 'TROCA_MAO',
  GIRA_MAO = 'GIRA_MAO',
  ZERO_MAIS = '0+',
  CORINGA_SIMPLES = 'CORINGA_SIMPLES',
  SILENCIO = 'SILENCIO', // sub-efeito da carta 7
}

export enum Raridade {
  COMUM = 'COMUM',
  INCOMUM = 'INCOMUM',
  RARA = 'RARA',
  UNICA = 'UNICA',
}

export interface Carta {
  id: string; // ex: "7-LARANJA", "+4-3", "0+-UNICA"
  cor: Cor;
  tipo: TipoCarta;
  valor?: number; // 0-9, obrigatório se NUMERADA
  acao?: Acao; // obrigatório se ACAO ou NEUTRA
  raridade: Raridade;
  colecao: string; // ex: "base-v1", "tropical-v1"
  efeito_texto_curto: string; // ex: "Silêncio"
  efeito_texto_longo: string; // ex: "Quem falar compra +2"
}

export interface EstadoPartida {
  salaId: string;
  jogadores: Jogador[];
  monteCompra: Carta[]; // topo no final (pop)
  monteDescarte: Carta[]; // topo no final (pop)
  vezDe: string; // jogadorId
  sentido: 1 | -1; // 1 = horário, -1 = anti-horário
  ataqueAcumulado: number; // total de cartas a comprar
  ataqueStack: Acao[]; // histórico do stack (validação)
  silencio: {
    ativo: boolean;
    jogadorQuebrou?: string; // jogador que falou e levou +2
  };
  historico: Evento[]; // log de eventos para replay/audit
  finalizada: boolean;
  vencedor?: string;
}

export interface Jogador {
  id: string;
  nome: string;
  mao: Carta[];
  isBot: boolean;
  conectado: boolean;
  disseUno: boolean; // gritou "UNO" ao ficar com 1 carta
}
```

**Validação de jogada (referência rápida):**

```typescript
function validarJogada(carta: Carta, topo: Carta, estado: EstadoPartida): boolean {
  // 1. Neutras (coringas) sempre podem ser jogadas
  if (carta.tipo === TipoCarta.NEUTRA) return true;

  // 2. Match de cor
  if (carta.cor === topo.cor) return true;

  // 3. Match de número (só cartas numeradas)
  if (
    carta.tipo === TipoCarta.NUMERADA &&
    topo.tipo === TipoCarta.NUMERADA &&
    carta.valor === topo.valor
  )
    return true;

  // 4. Match de ação (ex: jogar +2 sobre +2, ou Skip sobre Skip)
  if (carta.tipo === TipoCarta.ACAO && carta.acao === topo.acao) return true;

  return false;
}
```

### 4.4 Estrutura de pastas sugerida

```
kabemjunto/
├── apps/
│   ├── web/                       # Frontend PWA (Vite + React)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── store/             # Zustand stores
│   │   │   ├── assets/            # imagens, sons
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   └── vite.config.ts
│   └── server/                    # Backend Node + Fastify
│       ├── src/
│       │   ├── routes/
│       │   ├── sockets/           # handlers WebSocket
│       │   ├── game/              # motor de jogo (regras puras)
│       │   ├── db/                # models PostgreSQL
│       │   └── server.ts
│       └── prisma/
│           └── schema.prisma
├── packages/
│   └── shared/                    # código compartilhado (tipos, regras)
│       └── src/
│           ├── types/             # Carta, EstadoPartida, etc.
│           └── rules/             # validarJogada, resolverAcao
├── tests/
│   ├── unit/                      # vitest, regras puras
│   ├── integration/               # supertest, API endpoints
│   └── e2e/                       # Playwright, fluxo completo
├── package.json                   # monorepo (pnpm workspaces)
├── pnpm-workspace.yaml
└── README.md
```

**Monorepo pnpm** para compartilhar `packages/shared` entre front e back,
garantindo que **as regras são uma única fonte de verdade**.

### 4.5 API endpoints (multiplayer online)

**REST (criação e gestão de sala):**

| Método | Path                     | Descrição                | Body                           | Response                |
| ------ | ------------------------ | ------------------------ | ------------------------------ | ----------------------- |
| `POST` | `/api/salas`             | Criar nova sala          | `{ nome, maxJogadores, modo }` | `{ salaId, codigo }`    |
| `POST` | `/api/salas/:id/entrar`  | Entrar em sala existente | `{ jogadorId, nome }`          | `{ jogadores, estado }` |
| `GET`  | `/api/salas/:id`         | Estado público da sala   | —                              | `{ jogadores, status }` |
| `POST` | `/api/salas/:id/iniciar` | Iniciar partida (host)   | —                              | `{ partidaId }`         |
| `POST` | `/api/salas/:id/sair`    | Sair da sala             | —                              | `{ ok }`                |

**WebSocket (eventos em tempo real):**

| Evento (cliente → server) | Payload                      | Evento (server → cliente) | Payload                |
| ------------------------- | ---------------------------- | ------------------------- | ---------------------- |
| `jogar`                   | `{ cartaId, corEscolhida? }` | `estado:atualizado`       | `EstadoPartida`        |
| `comprar`                 | `{ quantidade: 1 }`          | `carta:comprada`          | `{ jogadorId, carta }` |
| `gritar:uno`              | —                            | `uno:declarado`           | `{ jogadorId }`        |
| `trocar:cor`              | `{ novaCor }`                | `cor:trocada`             | `{ novaCor }`          |
| `chat:msg`                | `{ texto }`                  | `chat:msg`                | `{ jogadorId, texto }` |
| `silencio:quebrar`        | —                            | `silencio:quebrado`       | `{ jogadorId, +2 }`    |

**Reconnect:** o servidor guarda o estado da sala por 5 min após
desconexão. Cliente tenta reconectar com `socket.io` reconnection nativa.

### 4.6 Persistência: local vs servidor

| Dado                                 | Onde                        | Justificativa                              |
| ------------------------------------ | --------------------------- | ------------------------------------------ |
| Histórico de partidas                | **Servidor (Postgres)**     | Stats, leaderboard, anti-cheat             |
| Configurações do usuário (tema, som) | **Local (localStorage)**    | LGPD-friendly, rápido                      |
| Baralhos colecionáveis               | **Servidor**                | Sync entre dispositivos                    |
| Estado da partida em andamento       | **Servidor (autoritativo)** | Single source of truth, evita dessincronia |
| Telemetria                           | **Servidor → PostHog**      | Analytics                                  |
| Conta de usuário                     | **Servidor (Auth)**         | Login social                               |

**Princípio:** servidor é **autoritativo** para a partida. Cliente
"engana" não é problema em jogo casual, mas evita bugs. Cliente faz
**otimistic update** com rollback em caso de erro do servidor.

### 4.7 Latência alvo para multiplayer

| Operação                         |                 Target | Máximo aceitável |
| -------------------------------- | ---------------------: | ---------------: |
| PING WebSocket                   | < 80 ms (Brasil-Latam) |         < 150 ms |
| Carta jogada → estado atualizado |               < 150 ms |         < 300 ms |
| Compra de carta → visível        |               < 200 ms |         < 400 ms |
| Reconexão após drop              |                  < 3 s |           < 10 s |

**Infra sugerida:** servidor em **São Paulo (AWS sa-east-1)** para
Latam. CDN global (CloudFront/Vercel Edge) para assets estáticos.

---

## 5. Plano de monetização

### 5.1 Modelo: Free-to-play com cosméticos + passe de temporada

**Princípio:** **nada pay-to-win**. Todo o balanceamento de jogo é
gratuito. Monetização vem de:

1. **Baralhos temáticos (cosméticos)** — visuais, frames, sons.
2. **Passe de temporada** — novos modos + cosméticos exclusivos.
3. **Banner de regras alternativas** — variantes sazonais com regras
   opcionais (ex: Modo Silêncio Permanente, Modo Guerra).

### 5.2 Preço sugerido (faixa em BRL)

| Item                                    |             Preço | Notas                        |
| --------------------------------------- | ----------------: | ---------------------------- |
| Jogo base                               |          **R$ 0** | Free, sempre                 |
| Baralho temático individual             | R$ 4,90 – R$ 9,90 | 1-2 por mês no lançamento    |
| Pacote de 3 baralhos                    |          R$ 19,90 | -20% vs unitário             |
| Passe de temporada (30 dias)            |          R$ 14,90 | Traz 4-6 cosméticos + 1 modo |
| Banner de regra alternativa             |           R$ 2,90 | Item sazonal de 1-2 semanas  |
| Remover anúncios (sem ads por enquanto) |               n/a | Se ads vierem, R$ 7,90/mês   |

> **Referência internacional:** UNO Mobile cobra US$ 0,99–4,99 por
> baralho. A faixa proposta está alinhada com o mercado casual brasileiro.

### 5.3 Fontes de receita (estimativa)

| Fonte                  | % esperado da receita (mês 12) |
| ---------------------- | -----------------------------: |
| Baralhos temáticos     |                           45 % |
| Passe de temporada     |                           35 % |
| Banners sazonais       |                           10 % |
| Anúncios rewarded (P2) |                           10 % |

### 5.4 Restrições de produto

- **Sem lootbox** (modelo predatório).
- **Sem gacha** para cartas funcionais (mantém balanceamento).
- **Anúncios opcionais** (não intrusivos) — só rewarded video em troca de
  cosmético, nunca interrompendo partida.
- **Conformidade LGPD:** consentimento explícito para coleta de dados de
  analytics.

---

## 6. Roadmap de desenvolvimento

### 6.1 Visão macro

| Fase             | Duração   | Time     | Marco principal                         |
| ---------------- | --------- | -------- | --------------------------------------- |
| **MVP**          | 2–3 meses | 3-4 devs | Jogo jogável local, 2-4p                |
| **Beta fechado** | 2 meses   | 4-5 devs | Multiplayer online, todas as cartas     |
| **Release v1.0** | 2 meses   | 5-6 devs | PWA pública + tutorial + mobile wrapper |
| **Pós-launch**   | contínuo  | 3-4 devs | Conteúdo sazonal, balanceamento         |

### 6.2 MVP (Meses 1-3)

**Escopo:**

- Regras básicas (0-9, Skip, Reverse, +2, +4, Troca Mão, Gira Mão,
  Coringa Simples).
- Single-device (todos os jogadores no mesmo aparelho, hot-seat).
- 2-4 jogadores.
- Sem 0+ e sem regra do silêncio (entram no Beta).
- UI básica (sem arte final).
- Baralho de 60 cartas.

**Entregas:**

- ✅ Motor de jogo puro (em `packages/shared`).
- ✅ UI com cartas placeholder (número/cor).
- ✅ Tela de setup (escolher nº de jogadores).
- ✅ Loop de turno jogável do início ao fim.
- ✅ Tela de fim de jogo.
- ✅ Testes unitários das regras (cobertura > 80 %).

**Fora do MVP:** multiplayer, 0+, silêncio, monetização, arte final.

### 6.3 Beta (Meses 4-5)

**Escopo (incremental ao MVP):**

- 0+ e regra do 7 (silêncio) — **inclui microinteração "shh"**.
- Multiplayer online (WebSocket, 2-6 jogadores).
- Sistema de salas (código, lobby).
- Reconnect em caso de drop.
- Bot para single-player (3 níveis de dificuldade).
- Telemetria básica (eventos de jogo).
- Auth social (Google).

**Entregas:**

- ✅ PWA instalável.
- ✅ 50 usuários beta ativos.
- ✅ Coleta de feedback via Discord/Form.
- ✅ Ajustes de balanceamento (turno médio, taxa de dominância do 0+).

### 6.4 Release v1.0 (Meses 6-7)

**Escopo:**

- Arte final (cards ilustrados, logo, frames).
- Tutorial interativo (5-7 telas).
- Áudio completo (efeitos sonoros + música).
- Acessibilidade (daltonismo, texto grande, leitor de tela).
- Mobile wrapper (Capacitor → iOS + Android).
- Primeiros 2 baralhos temáticos para venda.
- Sentry + PostHog em produção.
- Página de marketing (landing + ASO básico).

**Entregas:**

- ✅ Lançamento em app stores (iOS + Android) e web.
- ✅ Suporte PT-BR + EN.
- ✅ Press kit + influencer outreach.

### 6.5 Pós-launch (Mês 8+)

**Escopo (cadência mensal):**

- **Mês 8:** Baralho temático #1 ("Praia") + 1 banner de regra.
- **Mês 9:** Modo cooperativo contra o baralho (variante opcional).
- **Mês 10:** Leaderboard global (ELO simples).
- **Mês 11:** Passe de temporada v1 (4-6 cosméticos).
- **Mês 12:** Modo torneio (1×/semana, premios cosmético).
- **Mês 13+:** Novos baralhos, parcerias com marcas (ex: baralho
  "Funk"), torneios mensais.

**Operação contínua:**

- Patch de balanceamento a cada 6 semanas (calibrar 0+, ataque
  acumulado, etc.).
- Monitoramento de KPIs (DAU, D7, K-factor).
- Suporte ao usuário (Discord + email).

---

## 7. Métricas de sucesso (KPIs)

### 7.1 KPIs primários (North Star)

| KPI                        | Definição                                      | Target Mês 6 (Release) | Target Mês 12 |
| -------------------------- | ---------------------------------------------- | ---------------------: | ------------: |
| **DAU**                    | Daily Active Users                             |                  5.000 |        50.000 |
| **MAU**                    | Monthly Active Users                           |                 25.000 |       200.000 |
| **DAU/MAU**                | "Stickiness ratio"                             |                   20 % |          25 % |
| **Tempo médio de sessão**  | Minutos jogados / sessão                       |                 12 min |        15 min |
| **D7 Retention**           | % que volta após 7 dias                        |                   18 % |          25 % |
| **K-factor**               | Viral coefficient (convidados / usuário ativo) |                    0,3 |           0,7 |
| **NPS**                    | Net Promoter Score (survey)                    |                     30 |            50 |
| **Win rate do 0+**         | % de partidas decididas pelo 0+                |                12-18 % |       12-18 % |
| **Crash-free rate**        | % de sessões sem crash                         |                 99,5 % |        99,9 % |
| **Tempo médio de partida** | Duração real de partida (4p)                   |              18-25 min |     18-25 min |

### 7.2 KPIs secundários (diagnóstico)

| KPI                          | Uso                                                   |
| ---------------------------- | ----------------------------------------------------- |
| **Tutorial completion rate** | % que termina o tutorial na 1ª sessão                 |
| **Tutorial skip rate**       | % que pula o tutorial                                 |
| **Match abandonment**        | % que sai no meio de uma partida                      |
| **Cartas por turno (média)** | Proxy de decisão tática                               |
| **Uso de cartas especiais**  | % de uso de cada carta (popularidade)                 |
| **Reconnect rate**           | % de jogadores que reconectam após drop               |
| **Avg ping**                 | Latência média (server sa-east-1)                     |
| **Conversion rate**          | % de DAU que compra algo (target: 2-4 %)              |
| **ARPU**                     | Average Revenue Per User (target: R$ 0,80/mês em M12) |
| **ARPPU**                    | Avg Revenue Per Paying User (target: R$ 25/mês)       |

### 7.3 Instrumentação (eventos)

Exemplos de eventos críticos a implementar:

```typescript
// Eventos do client (PostHog / Segment)
analytics.track('partida:iniciada', {
  salaId,
  nJogadores,
  modo,
  baralho,
});
analytics.track('turno:jogou', {
  cartaId,
  acao,
  corEscolhida,
  ataqueAcumulado,
});
analytics.track('ataque:sofrido', {
  tipo: '+2' | '+4',
  totalAcumulado,
  jogadorOrigem,
});
analytics.track('carta:0plusada', {
  ataqueRefletido,
  jogadorOrigem,
  jogadorAlvo,
});
analytics.track('silencio:quebrado', {
  jogadorId,
  turno,
});
analytics.track('partida:finalizada', {
  vencedorId,
  duracaoSeg,
  totalTurnos,
  usouSilencio,
});
analytics.track('compra:baralho', {
  baralhoId,
  valorBRL,
});
```

### 7.4 Dashboard e revisão

- **Dashboard em PostHog** (ou Metabase interno) com KPIs primários
  atualizados diariamente.
- **Revisão quinzenal** de balanceamento (ler patch notes de 0+,
  ataque acumulado, win rates).
- **Revisão mensal** de monetização (ARPU, conversão, ticket médio).
- **Revisão trimestral** de roadmap e OKRs.

---

## Apêndice A — Resumo de decisões

| Tema                | Decisão                                    | Justificativa                 |
| ------------------- | ------------------------------------------ | ----------------------------- |
| Plataforma primária | PWA                                        | Iteração rápida, baixo custo  |
| Mobile              | Capacitor wrapper (v1.0)                   | Push, app stores              |
| Stack               | TS + React + Vite + Node + Fastify         | Maturidade, dev velocity      |
| Modo de jogo        | Online multiplayer (assíncrono leve)       | Rejogabilidade + viralização  |
| Arte                | Flat + ilustração                          | Mobile-friendly, share-appeal |
| Acessibilidade      | Daltonismo + texto grande + leitor de tela | WCAG 2.1 AA                   |
| Monetização         | F2P com cosméticos                         | Ético, escalável              |
| Baralho base        | 60 cartas                                  | Suficiente para 2-6p          |
| Regra do silêncio   | 1 turno                                    | Simples de implementar        |
| Carta 0+            | 1 unidade                                  | Mantém raridade, viral        |

---

## Apêndice B — Riscos de implementação

| Risco                         | Probabilidade | Impacto | Mitigação                                   |
| ----------------------------- | ------------- | ------- | ------------------------------------------- |
| Regra do 7 confusa em digital | Média         | Médio   | Tutorial reforçado; toggle on/off           |
| 0+ domina partidas            | Baixa         | Alto    | Telemetria; ajustar nº de cópias            |
| Multiplayer com lag           | Média         | Alto    | Servidor autoritativo + região sa-east-1    |
| Monetização fraca             | Média         | Alto    | Passe de temporada + cosméticos recorrentes |
| Custo de arte elevado         | Alta          | Médio   | Ilustração mínima viável (MVP) + flat       |
| Carga de servidor             | Baixa         | Médio   | Redis + autoscaling                         |
| LGPD / dados de crianças      | Média         | Alto    | Opt-in explícito, dados mínimos             |

---

**Fim da Seção 03 — Produção, Arte, UX e Implementação.**

Próxima seção: [04 — Pitch, Anexos e Diagramas](04-pitch-anexos.md).
