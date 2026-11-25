# Métricas de uso

Instrumentação mínima e anônima do cliente web. **Está desligada**: sem `VITE_POSTHOG_API_KEY` no build, nada é enviado e nada é gravado no aparelho. O valor de exemplo do `.env.example` conta como "sem chave". Em desenvolvimento também fica desligada.

Código: `apps/web/src/services/metricas.ts` (eventos e regras) e `apps/web/src/services/posthogSink.ts` (envio).

## Quando um evento sai

Só se **todas** valerem, conferidas a cada evento:

1. build de produção com chave;
2. navegador sem Do Not Track e sem Global Privacy Control;
3. sem opt-out (`localStorage['kabemjunto.metricas.optout'] = '1'`, via `definirOptOut(true)`);
4. `localStorage` legível (se não dá para conferir o opt-out, não envia).

## Eventos

A lista é fechada: o sink descarta qualquer outro evento, propriedade ou valor.

| Evento                     | Propriedades                          | Quando                                                                         |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `PARTIDA_INICIADA`         | `modo`, `totalJogadores`, `bots`      | A mesa vê uma partida nova, ainda em andamento                                 |
| `PARTIDA_TERMINADA`        | `modo`, `resultado`, `duracao`        | A partida acaba com a pessoa nela                                              |
| `PARTIDA_ABANDONADA`       | `modo`, `duracao`                     | A própria pessoa confirma "Sair" antes do fim                                  |
| `BUSCA_RAPIDA_CANCELADA`   | nenhuma                               | "Cancelar" na espera do "Jogar agora" (procurando ou já na sala)               |
| `BUSCA_RAPIDA_VIROU_LOCAL` | `motivo`: `falha` ou `tempo`          | A busca desistiu e abriu partida contra bots                                   |
| `REVANCHE_PEDIDA`          | `modo`                                | Função `revanchePedida(partidaId)` pronta, **ainda não ligada a nenhum botão** |
| `RETORNO`                  | `diasDesdeUltima`: `0 1 2-6 7+`       | Primeira abertura do dia no aparelho (`0` = sem visita anterior conhecida)     |
| `RECONECTADO`              | `duracao`: `<5s 5-30s 30s-2min 2min+` | A conexão voltou depois de uma queda                                           |

- `modo`: `local`, `online` ou `rapida`.
- `resultado`: `vitoria`, `derrota` ou `abandono`. Aqui, `abandono` significa que **outra pessoa** saiu e a partida foi encerrada sem vencedor. A saída da própria pessoa é só `PARTIDA_ABANDONADA`; os dois nunca saem para a mesma partida no mesmo aparelho.
- `duracao` da partida: `<2min`, `2-5min`, `5-10min`, `10-20min`, `20min+` (relógio do aparelho, desde a primeira vez que viu a partida; inclui o tempo com a página fechada).

Cada partida conta uma vez por aba, também ao recarregar e em StrictMode. O `partidaId` serve só para isso, na `sessionStorage`, e não é enviado.

## O que não é coletado

Nome, avatar, texto de chat, código da sala, token, `jogadorId`, `partidaId`, cartas, endereço da página, cookies. Os eventos do motor (que trazem cartas e ids) não saem do aparelho.

Vai junto com cada evento: a chave do projeto, o horário e um `distinct_id` aleatório que existe só na memória da página (recarregar gera outro). O payload pede ao PostHog para não guardar o IP (`$ip: '0.0.0.0'`), não deduzir localização (`$geoip_disable`) e não criar perfil (`$process_person_profile: false`).

**O IP ainda chega ao servidor do PostHog**, como em qualquer requisição HTTP, junto com o user agent e o `Origin` do site. O cliente só consegue pedir que não seja guardado. Isso não foi testado contra o serviço real.

Guardado no aparelho, só com as métricas ativas: a data da última visita (`localStorage`) e as partidas já contadas (`sessionStorage`). O opt-out apaga ambos.

## Fórmulas

- **Conclusão** = `PARTIDA_TERMINADA` com `resultado` `vitoria` ou `derrota` ÷ `PARTIDA_INICIADA`.
- **Abandono próprio** = `PARTIDA_ABANDONADA` ÷ `PARTIDA_INICIADA`.
- **Sem desfecho** = `PARTIDA_INICIADA` − `PARTIDA_TERMINADA` − `PARTIDA_ABANDONADA` (aba fechada, queda sem volta).
- **Revanche** = `REVANCHE_PEDIDA` ÷ `PARTIDA_TERMINADA` (quando o botão estiver ligado).
- **Retorno D1** = `RETORNO` com `diasDesdeUltima = 1` no dia D+1 ÷ todos os `RETORNO` do dia D. É a fração dos aparelhos ativos no dia D que voltaram no dia seguinte.

Separe sempre por `modo`: partida local não mede interesse em jogar com gente. Não há amostragem (antes sorteava 10% dos eventos, um a um, o que estragaria essas taxas).

## Limitações

- **Por aparelho e navegador, não por pessoa.** Limpar dados, janela anônima ou outro navegador viram visita nova. O Safari pode apagar o armazenamento de sites pouco usados.
- **Online conta por participante**: uma partida com três pessoas gera até três `PARTIDA_INICIADA`. Não some como número de partidas.
- O D1 cobre todos os aparelhos ativos, não só os novos. Sem identificador persistente não há coorte, funil por pessoa nem usuários únicos (o "unique users" do PostHog conta carregamentos de página).
- O dia é o do aparelho; o painel usa o fuso do projeto. Ajuste o fuso do projeto. Página aberta por vários dias só conta ao reabrir.
- Bloqueadores, DNT/GPC, opt-out e falta de rede derrubam eventos, sem reenvio. Partida local offline costuma não aparecer. Os números são um piso, com viés.
- Duplicar a aba, ou bloquear a `sessionStorage` e recarregar, pode contar de novo. Fechar a aba não gera abandono.
- Se a pessoa sair enquanto a mesa ainda está carregando, a partida não conta. Se a partida terminar enquanto ela está fora, conta ao voltar na mesma aba, se o servidor ainda a tiver.
- A chave do PostHog fica visível no site: alguém pode enviar eventos falsos.
- Com poucas partidas, as taxas oscilam muito. Olhe os números absolutos antes de concluir.

## O que o dono decide antes de ligar

1. **Serviço e chave**: se vai usar o PostHog, quem tem acesso e por quanto tempo guarda os dados.
2. **Região**: o padrão é EUA (`https://us.i.posthog.com`). Para a UE, `VITE_POSTHOG_HOST=https://eu.i.posthog.com`. Um proxy próprio evitaria expor o IP ao PostHog.
3. **Projeto**: ligar "Discard client IP data", desligar GeoIP e conferir num evento real que IP e localização não aparecem.
4. **Privacidade/LGPD**: base legal, necessidade de consentimento (inclusive pela data guardada no aparelho), transferência internacional, atendimento a menores e texto de privacidade. Isto precisa de quem responde pelo jurídico; este documento não é parecer.
5. **Controle visível**: hoje não existe botão de opt-out na tela, só a função `definirOptOut`. Criar antes de ligar.
6. **Botão de revanche**: ligar `revanchePedida` para medir a taxa.

Para ligar: definir `VITE_POSTHOG_API_KEY` (e o host) **no build** do site e publicar. Para desligar: refazer o build sem a chave; quem tiver a versão antiga em cache (PWA) envia até atualizar.
