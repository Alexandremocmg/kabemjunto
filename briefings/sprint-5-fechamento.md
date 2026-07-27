# Briefing — Fechamento da Sprint 5 e Release v0.4.0

> Spec escrita por Mavis. Esta fase não adiciona escopo de produto: coleta evidências, fecha lacunas do DoD e prepara a release.

**Data:** 2026-07-27  
**Decisão Mavis:** implementação funcional aprovada com condições; release bloqueada até todos os gates abaixo estarem comprovados.  
**Regra:** lock estrito por issue conforme ADR-003.

## Estado de entrada

- `main` e `origin/main` sincronizados no SHA `02d3dac` no início da revisão.
- 171 testes unitários/integração verdes.
- 6 testes Playwright verdes.
- Cobertura do motor: 90,16%.
- Build, lint, typecheck e Prettier verdes.
- Tag mais recente: `v0.3.1`.

## Issues

### M20 — Atualizar governança e fechar documentação

**Dono:** Mavis  
**Status:** em execução

**Problema:** `AGENTS.md`, handover e Sprint 5 ainda descrevem caminhos, números e pendências anteriores à consolidação.

**Arquivos bloqueados:**

- `AGENTS.md`
- `briefings/handover-mavis.md`
- `briefings/sprint-5.md`
- `briefings/sprint-5-fechamento.md`
- `STATUS.md`
- `CHANGELOG.md`

**Critério de pronto:**

- ownership aponta para `apps/web/` e `apps/server/`;
- contagem de testes e estado do working tree refletem a execução real;
- DoD da Sprint 5 distingue entregue de pendente;
- nenhuma ADR duplicada;
- documentação passa no Prettier.

### B20 — E2E determinístico de partida Online até a vitória

**Dono:** Codex  
**Dependência:** nenhuma mudança de regra canônica  
**Lock:** Codex só pode editar os arquivos listados abaixo.

**Problema:** o E2E atual comprova criação, entrada, início e reload, mas termina antes de qualquer vitória. O DoD exige dois clientes reais jogando do início ao fim.

**Arquivos permitidos:**

- `e2e/jogo-completo.spec.ts`
- `playwright.config.ts`, somente se estritamente necessário para estabilidade
- `apps/server/src/**`, somente para um mecanismo de fixture E2E explicitamente isolado
- `apps/web/src/**`, somente se houver um problema de testabilidade comprovado e documentado

**Arquivos proibidos:**

- `packages/shared/src/rules/**`
- `packages/shared/src/types/**`
- `packages/shared/src/telemetry/**`
- documentação e ADRs

**Requisitos:**

1. Dois contexts independentes entram na mesma sala.
2. A partida chega deterministicamente ao estado de vitória.
3. O vencedor recebe o estado visual correspondente.
4. O outro cliente recebe o mesmo vencedor no estado público.
5. Nenhuma mão privada de outro jogador é exposta.
6. O teste roda com um worker e sem depender de sorte.
7. Fixture/test hook, se necessário, fica indisponível fora de `NODE_ENV=test`/ambiente E2E.
8. Não reduzir o número canônico de cartas nem alterar regra de produção para facilitar o teste.

**Critério de pronto:**

```bash
npm run e2e
npm run validate
```

Ambos verdes, sem flake em duas execuções consecutivas do cenário novo.

### B21 — Evidência PostHog de `RECONECTADO`

**Dono:** Codex  
**Revisor:** Mavis

**Problema:** sink e emissão existem no código, mas o dashboard real ainda não foi comprovado.

**Arquivos permitidos:**

- `apps/web/src/services/posthogSink.ts`, somente se a prova revelar defeito
- `apps/web/src/services/socketClient.ts`, somente se a prova revelar defeito
- testes correspondentes em `apps/web/src/services/`

**Critério de pronto:**

- build de produção com token configurado fora do Git;
- desconexão/reconexão reproduzida;
- evento `RECONECTADO` visível no dashboard;
- propriedades revisadas para não enviar PII desnecessária;
- evidência registrada em `feedback/` por Mavis.

### A13 — Lighthouse e acessibilidade de release

**Dono:** Antigravity para CSS/copy; Codex para lógica React, se necessária  
**Revisor:** Mavis

**Problema:** acessibilidade funcional tem E2E, mas a meta Lighthouse ≥95 não foi medida.

**Lock inicial Antigravity:**

- `apps/web/src/styles.css`
- `apps/web/src/styles/**`
- assets acessíveis estritamente necessários

Qualquer mudança em `.tsx` exige issue separada para Codex.

**Critério de pronto:**

- build de produção auditado em viewport mobile;
- Lighthouse Accessibility ≥95;
- foco visível, contraste, nomes acessíveis e landmarks sem falhas críticas;
- relatório preservado como artefato ou resumo em `feedback/`.

### M21 — Verificar CI e preparar tag v0.4.0

**Dono:** Mavis  
**Dependências:** B20, B21 e A13 concluídas

**Critério de pronto:**

- GitHub Actions `quality-gate` e `e2e` verdes no SHA final;
- `npm run validate`, `npm run test:cov` e `npm run e2e` verdes localmente;
- working tree limpo;
- CHANGELOG e STATUS fechados;
- tag anotada `v0.4.0` criada e enviada;
- SHA da tag e `origin/main` documentados.

## Gate de release

A tag `v0.4.0` só pode ser publicada quando todos os itens estiverem verdes:

- [ ] B20 — partida Online E2E até a vitória
- [ ] B21 — PostHog real comprovado
- [ ] A13 — Lighthouse Accessibility ≥95
- [ ] CI externo no SHA final
- [ ] `npm run validate`
- [ ] `npm run test:cov` com motor ≥80%
- [ ] `npm run e2e`
- [ ] revisão Mavis sem violação de lock
