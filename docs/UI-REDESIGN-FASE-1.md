# UI/UX — Redesign da Mesa — Fase 1

> Especificação aprovada a partir das referências visuais enviadas pelo produto.
> Escopo: mesa jogável mobile-first e estados visuais essenciais.

## Referências

- Esboço da tela atual: referência de problemas de composição e sobreposição.
- Proposta visual da mesa: feltro verde, núcleo central, jogadores nos cantos,
  mão em leque, eventos de impacto e navegação de suporte.
- Especificação visual de cartas especiais: `+4`, `Troca Mão`, `Gira Mão`,
  `0+`, `Coringa` e verso do baralho.
- Regras canônicas: `GDD-Kabemjunto.md` e `04-pitch-anexos.md`.

## Hierarquia da mesa

1. Carta selecionada/mão do jogador.
2. Núcleo central: Monte de Compra e Monte de Descarte.
3. Status: silêncio, vez, cor ativa, sentido e ataque acumulado.
4. Avatares, quantidade de cartas e eventos recentes.

## Fase 1 — incluído

- Monte de Compra clicável, com contador dentro da arte.
- Monte de Descarte com a carta do topo.
- Carta 7 visualmente secreta: mesma aparência de carta numérica comum,
  somente o número 7, sem ícone de silêncio na face.
- Quatro assentos espaciais para a composição de 2–4 jogadores.
- Indicador do jogador da vez no avatar e na pill `SUA VEZ`.
- Mão em leque com rolagem segura para mãos grandes.
- Seleção em dois toques: primeiro seleciona, segundo confirma.
- Cartas inválidas com opacidade/dessaturação reduzida.
- Cor ativa, sentido e ataque acumulado em status separado.
- Banner compacto persistente durante o silêncio.
- Fila de eventos temporários para silêncio, ataque e reflexo do `0+`.
- `prefers-reduced-motion` para reduzir animações.

## Carta 7 secreta

A carta 7 não exibe `🤫`, ilustração ou indicador especial na face. O efeito
continua sendo comunicado por:

- banner `🤫 SILÊNCIO ATIVO · Falou? +2 cartas`;
- modal temporário de ativação;
- histórico/evento da partida.

A decisão é deliberada: preserva a surpresa social sem esconder o estado
ativo depois que a carta é jogada.

## Estados de partida e eventos

Eventos visuais devem ser derivados da transição de estado, nunca substituir a
validação do motor:

- `SILENCIO_ATIVADO` — overlay curto e banner persistente.
- `ATAQUE_APLICADO` — ataque acumulado destacado junto ao descarte.
- `ZERO_MAIS_REFLEXO` — indicação da origem e do alvo do reflexo.

A fila é serializada; eventos não se sobrepõem. Cada modal pode ser dispensado
por toque e possui alternativa textual em `aria-live`.

## Rodadas, pontuação e tempo — proposta MVP

- Uma partida termina quando o motor declara um vencedor.
- Não há número de rodadas no MVP.
- Não há pontuação cumulativa de sessão no MVP.
- A tela de vitória pode exibir ordem de chegada e estatísticas reais dos
  eventos, sem inventar pontos.
- `tempo por turno` é uma configuração futura, desligada por padrão. Quando
  implementada, deverá ser controlada pelo servidor autoritativo e definir o
  comportamento de expiração (recomendação: compra obrigatória e passagem de
  turno).
- `Allow +4 sobre +4` permanece regra canônica do projeto, não um toggle no
  MVP. Uma variante configurável só deve existir após contrato de sala,
  servidor e testes específicos.

## Fora da Fase 1

- Loja, moedas e temas cosméticos.
- Ranking persistente e amigos.
- Sessões com múltiplas rodadas.
- Temporizador autoritativo.
- Suporte visual completo para 5–10 jogadores.
- Drag-and-drop como única forma de jogar.

## Acessibilidade

- Monte e cartas são controles focáveis e operáveis por teclado.
- Carta selecionada possui estado visual e textual.
- Eventos usam `role="status"`/`aria-live`.
- Animações respeitam `prefers-reduced-motion`.
- Cor nunca é a única informação: símbolos, texto e estado acompanham a cor.
