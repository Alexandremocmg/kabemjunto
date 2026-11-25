# Teste guiado com a turma (playtest fechado)

Roteiro da issue 16, atualizado para a versão de 2026-11-25 (limite por vez, bot assume, revanche). O nome do arquivo vem do briefing da Sprint 7. Ficha: [`templates/playtest-resultados.csv`](./templates/playtest-resultados.csv).

## O que queremos responder

1. 30 s por vez é confortável?
2. Quem cai volta para o lugar sem ajuda?
3. A revanche mantém a turma junta?
4. Roda bem nos celulares da turma?
5. Quem nunca jogou entende o Silêncio e o Corta-Frente?

## Privacidade

- Participar é voluntário, e dá para parar quando quiser.
- Anote só números e notas. **Não** anote nome, apelido, e-mail, telefone, código da sala, token nem conversa do chat.
- Cada partida recebe um código que não vem do jogo: `S1`, `S2`, `S3`…
- Não grave tela nem voz sem todos concordarem; apague depois.
- Use apelidos inventados no jogo. Comentários entram como resumo, sem citar ninguém.

## Antes (10 min)

- [ ] Escolher um organizador, que anota e joga pouco.
- [ ] Conferir que <https://kabemjunto.kabemmanager.online/health> responde.
- [ ] Todos **fecham e reabrem** o jogo. Quem instalou o app fecha todas as janelas dele.
- [ ] Ao menos 1 Android e 1 iPhone, e alguém que nunca jogou.
- [ ] Explicar o objetivo em uma frase, **sem ensinar as regras**.

## Roteiro

Faça as partidas 1 a 4 (cerca de 60 min). As 5 e 6 dependem de haver gente: sem 8 ou 10 pessoas, complete com bots pelo **Jogar agora** e marque `humanos` e `bots` na ficha. A escolha do tamanho fica no menu.

| Partida | Mesa | Como entrar                                    | O que fazer                                                            |
| ------- | ---- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| S1      | 2    | Criar sala e enviar **Convidar** pelo WhatsApp | Jogar sem interromper. No fim, os dois pedem revanche                  |
| S2      | 4    | Código digitado                                | Alguém desliga a internet por 30 s **na própria vez** e religa         |
| S3      | 4    | Revanche da S2                                 | Alguém fica parado por duas vezes seguidas e depois toca em **Voltei** |
| S4      | 6    | Criar sala                                     | Alguém sai no meio. No fim, um **não** aceita a revanche               |
| S5      | 8    | **Jogar agora**, todos ao mesmo tempo          | Ver se caem na mesma mesa; se não, quantas mesas viraram               |
| S6      | 10   | Convidar                                       | Jogar normal. Olhar legibilidade e travadas no celular                 |

Em qualquer partida, aproveite para ver: alguém **recarrega a página**; alguém fala durante o Silêncio; alguém toca em **Compartilhar** (Android e iPhone).

### O esperado

| Situação                      | Deve acontecer                                                  |
| ----------------------------- | --------------------------------------------------------------- |
| Parado por 30 s               | O bot joga só aquela vez                                        |
| Parado em duas vezes seguidas | O bot assume, e aparece **Voltei**                              |
| Queda curta (menos de 20 s)   | A pessoa volta e nada muda                                      |
| Queda longa                   | O bot joga até a pessoa voltar ao lugar dela                    |
| Sair de propósito             | O bot fica no lugar; a pessoa não retoma                        |
| Revanche, todos aceitam       | Começa na hora                                                  |
| Revanche, alguém não aceita   | Começa em até 15 s com bot na vaga; quem ficou fora vê o motivo |

## Observar sem ajudar

Só ajude se a pessoa travar por mais de 1 minuto, e conte isso em `ajudas`. Conte também quantas vezes perguntaram uma regra (`duvidas_regra`).

## Perguntas no fim (2 min, respostas de 1 a 5)

1. O tempo por vez: 1 = apertado, 3 = bom, 5 = longo demais.
2. Deu para entender o que aconteceu em cada jogada?
3. Rodou liso no seu aparelho?
4. Jogaria de novo amanhã?

Uma pergunta aberta: **o que mais irritou?** Anote o resumo.

## Quando parar

- Pare a partida se a mesa ficar 60 s sem andar, se alguém vir cartas de outra pessoa, ou se o site cair.
- **Cartas de outra pessoa à vista:** encerre o teste inteiro. Anote hora e passos, sem código de sala.
- Pare se alguém quiser sair do teste.

## A ficha

Uma linha por partida. Deixe vazio o que não foi medido; não chute.

| Coluna                                                       | Significado                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `sessao`                                                     | `S1`, `S2`… (inventado, não é o código da sala)             |
| `humanos`, `bots`                                            | Quantos na mesa ao começar                                  |
| `entrada`                                                    | `convite`, `codigo`, `jogar_agora` ou `revanche`            |
| `duracao_min`                                                | Minutos, arredondado                                        |
| `terminou`                                                   | `sim`, `nao`                                                |
| `estouros`                                                   | Quantas vezes o tempo acabou                                |
| `quedas` / `retomadas`                                       | Caíram / voltaram ao lugar sem ajuda                        |
| `saidas`                                                     | Saíram de propósito                                         |
| `revanche_possiveis` / `revanche_aceitas`                    | Pessoas que podiam aceitar / que aceitaram                  |
| `duvidas_regra`, `ajudas`                                    | Contagens                                                   |
| `android`, `iphone`, `computador`                            | Quantos de cada                                             |
| `travadas`                                                   | Aparelhos com travada visível                               |
| `nota_tempo`, `nota_entender`, `nota_fluidez`, `nota_voltar` | Média de 1 a 5                                              |
| `problemas`                                                  | Contagem de problemas; descreva à parte, sem dados pessoais |

## Como decidir

Pontos de partida, não dados de mercado. Com menos de 10 pessoas isto mostra problemas, não prova retenção.

| Resultado                                   | Ação                                      |
| ------------------------------------------- | ----------------------------------------- |
| `nota_tempo` abaixo de 2,5 ou acima de 3,5  | Mudar `TURN_LIMIT_MS` (ex.: 45 s ou 20 s) |
| Alguma queda sem retomada                   | Corrigir antes de divulgar                |
| Menos da metade aceita a revanche           | Rever a tela de fim                       |
| Aparelho com travada                        | Medir fps nele antes de novos efeitos     |
| Duas ou mais ajudas por partida com novatos | Priorizar a primeira partida (issue 17)   |
| Qualquer mesa travada                       | Vira issue com os passos para repetir     |
