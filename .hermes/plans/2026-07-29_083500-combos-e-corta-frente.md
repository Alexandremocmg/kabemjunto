# Descarte Múltiplo e Corta-Frente — Plano de Implementação

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Adicionar Descarte Múltiplo atômico e Corta-Frente autoritativo para Local e Online sem vazar mãos, introduzir condições de corrida ou divergir o motor puro do servidor.

**Architecture:** O descarte múltiplo será uma única transição pura do motor que remove todas as cartas, aplica efeitos agregados e avança turno uma única vez. Corta-Frente será uma fase explícita e persistível do estado da partida, com prazo absoluto decidido pelo servidor; clientes apenas recebem a janela e solicitam a interceptação.

**Tech Stack:** TypeScript strict, regras puras em `packages/shared`, Fastify + Socket.IO em `apps/server`, React/Vite e Playwright.

---

## Decisões de regra que precisam de aprovação

1. **Chave de combo:** usar a mesma face, não apenas número: número normal idêntico ou mesma ação (`MAIS_DOIS`, `SKIP`, `REVERSE`). Não permitir misturar faces.
2. **Elegibilidade v1:** permitir números, `MAIS_DOIS`, `SKIP` e `REVERSE`; bloquear inicialmente ações com escolha/alvo/efeito global (`MAIS_QUATRO`, `ZERO_MAIS`, `SILENCIO`, `TROCA_MÃO`, `GIRA_MÃO`) para não criar semântica ambígua.
3. **Vitória:** combo que esvazia a mão vence depois de aplicar o descarte/efeitos ao estado, sem abrir janela de interceptação.
4. **Corta-Frente:** uma carta deve ter a mesma cor impressa e mesma face; v1 exclui neutras até ser definida a regra de cor escolhida para coringas.
5. **Concorrência:** primeiro pedido válido recebido pelo servidor antes de `fechaEm` vence. Não há compensação por latência de rede.
6. **Escopo de interceptação:** o jogador que acabou de descartar não pode interceptar a própria carta; uma interceptação válida cria nova janela para a nova carta de topo.

## Task 1: Tipos canônicos de lote e fase de interceptação

**Files:**

- Modify: `packages/shared/src/types/game.ts`
- Modify: `packages/shared/src/types/socket-events.ts`
- Test: `packages/shared/src/types/card.test.ts`

**Step 1: RED**
Adicionar teste de serialização/tipo para ação de lote e estado de interceptação público sem mãos privadas.

**Step 2: Implementar tipos mínimos**

- `ClientJogarLoteEvent { cartaIds: ReadonlyArray<string>; corEscolhida?: ... }`
- `ClientInterceptarEvent { cartaId: string; janelaId: string; corEscolhida?: ... }`
- estado `interceptacao?: { janelaId; cartaAlvoId; jogadorOrigemId; fechaEm; proximaVezId; revisao }`.
- eventos de abertura/resolução/rejeição para UI.

**Step 3: GREEN**
Rodar testes de tipos compartilhados.

## Task 2: RED do motor para descarte múltiplo

**Files:**

- Create: `packages/shared/src/rules/execute-multiple-play.test.ts`
- Modify: `packages/shared/src/rules/execute-play.ts` ou novo `execute-multiple-play.ts`
- Modify: `packages/shared/src/rules/index.ts`

**Step 1: Casos RED**

- primeira carta inválida rejeita lote inteiro;
- cartas seguintes com face diferente rejeitam lote inteiro;
- lote `7 amarelo + 7 azul` preserva ordem e termina com cor azul;
- dois `+2` acumulam quatro e mantêm stack detalhado;
- dois `SKIP` avançam dois jogadores; em 2 jogadores, comportamento documentado;
- dois `REVERSE` preservam sentido;
- nenhuma mão/descarte é parcialmente modificada em rejeição;
- lote que esvazia mão vence.

**Step 2: Implementar transição pura atômica**
Aceitar cartas por IDs/índices resolvidos contra a mão original. Validar a primeira com `validarJogada`; validar as demais contra chave de face. Remover todas imutavelmente, empilhar em ordem, calcular cor ativa pela última e reduzir efeitos (`+2`, skips, paridade de reversões) antes de uma única decisão de próximo turno.

**Step 3: GREEN/refactor**
Compartilhar helpers entre jogada simples e lote; nunca chamar repetidamente a jogada simples porque ela avança turno por carta.

## Task 3: Modelo puro da janela Corta-Frente

**Files:**

- Create: `packages/shared/src/rules/interception.test.ts`
- Create/Modify: `packages/shared/src/rules/interception.ts`
- Modify: `packages/shared/src/types/game.ts`

**Step 1: RED**

- jogar carta abre janela com `fechaEm` fornecido pelo orquestrador;
- carta idêntica de outro jogador aceita;
- mesma face/cor diferente rejeita;
- remetente original e pedido pós-prazo rejeitam;
- interceptação define sequência a partir do interceptador no sentido atual;
- timeout avança para `proximaVezId` previamente calculada;
- `janelaId` ou revisão antiga não pode resolver estado novo.

**Step 2: Implementar**
Criar funções puras `abrirJanelaInterceptacao`, `interceptar` e `resolverJanelaExpirada`. A ação normal calcula efeitos antes de abrir a janela, mas não confirma avanço de turno até resolver a fase.

**Step 3: GREEN**
Executar testes de regras e propriedades de imutabilidade/determinismo.

## Task 4: Integração Local

**Files:**

- Modify: `apps/web/src/AppSingleplayer.tsx`
- Modify: componentes de mão/mesa aplicáveis
- Test: testes React/Playwright local

**Steps:**

1. RED: seleção múltipla só admite cartas com a mesma face após a primeira válida.
2. Implementar seleção ordenada, botão/gesto de confirmar lote e feedback de motivo.
3. Exibir contagem regressiva de interceptação; permitir toque de carta idêntica durante a janela.
4. Timer local chama apenas a transição de timeout; não usar estado visual como autoridade.
5. GREEN: 2, 3 e 10 jogadores, acessibilidade teclado e mobile.

## Task 5: RoomStore e Socket.IO autoritativos

**Files:**

- Modify: `apps/server/src/room-store.ts`
- Modify: `apps/server/src/socket.ts`
- Modify: `apps/server/src/persistence.ts`
- Test: `apps/server/src/room-store.test.ts`, `apps/server/src/socket.test.ts`, `apps/server/src/persistence.test.ts`

**Steps:**

1. RED: lote fora da vez/repetido/inválido não altera estado; lote válido é broadcast uma vez e mãos privadas permanecem privadas.
2. Implementar `playMultiple` no RoomStore usando o motor puro.
3. RED: duas interceptações concorrentes aceitam exatamente uma; socket fora da janela/revisão é rejeitado.
4. Implementar timer por sala no servidor com `fechaEm`, `janelaId` e revisão; callback reabre sessão, valida revisão/prazo e resolve timeout. Nunca manter `await sleep(1200)` no handler Socket.IO.
5. Persistir a janela; no restart, rearmar ou resolver imediatamente se vencida. Limpar timers em abandono/remover sala.
6. Broadcast de estado público e emissão de mãos privadas após cada transição.

## Task 6: Contratos e UI Online

**Files:**

- Modify: `apps/web/src/services/socketClient.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/MesaOnline.tsx`
- Modify: `apps/web/src/styles/index.css`
- Test: `e2e/jogo-completo.spec.ts`

**Steps:**

1. RED: dois clientes recebem janela e apenas carta idêntica é ofertada/tocável.
2. Adicionar envio de lote e interceptação com `janelaId`; estado visual nunca decide vencedor.
3. Mostrar janela com contagem que deriva de `fechaEm` do servidor e reduzir movimento quando configurado.
4. GREEN: dois contextos Playwright simulam corrida; confirmar que primeiro servidor vence e ambos convergem para o mesmo estado.

## Task 7: Documentação, qualidade e publicação

**Files:**

- Modify: `GDD-Kabemjunto.md`, `STATUS.md`, espelhos GDD

**Validation:**

```bash
npm run validate
npx playwright test
npm run e2e -- --grep "lote|intercept"
git diff --check
```

**Production smoke:** dois clientes reais; lote +2; dois skips; dupla inversão; interceptação vencedora; pedido atrasado rejeitado; reconexão durante janela; nenhuma mão adversária no estado público.

## Risks

- Não usar `Date.now()` do cliente para prazo; apenas `fechaEm` emitido pelo servidor.
- Não aplicar uma série de jogadas simples para implementar lote.
- Não revelar a existência/conteúdo das cartas elegíveis de adversários.
- Há uma divergência preexistente no caminho `ZERO_MAIS` + ataque: não reutilizar esse fluxo no executor de lote sem testes próprios; mantê-lo fora da primeira versão elegível.
- O temporizador do Corta-Frente é seguro no atual serviço Railway único. Uma futura execução multi-instância exige lock/CAS transacional por sala e adapter Socket.IO/afinidade antes de ativar a mecânica.
- Priorizar Corta-Frente em fase separada depois do lote; é o risco maior por concorrência, persistência e UX.
