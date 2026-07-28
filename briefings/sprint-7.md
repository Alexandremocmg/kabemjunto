# Sprint 7 — Beta Fechado e Preparação de Onboarding (`v0.5.1+`)

**Status:** INICIADA  
**Tema:** transformar a release estável em um beta fechado operável, com governança atualizada, protocolo de playtest e uma proposta visual de primeira partida antes de qualquer nova UI.  
**Pré-requisitos:** `v0.5.1` anotada e publicada no commit `06fbd0a`; deployment Railway `edacde11-beb9-45f7-83c3-272474410e10` em `SUCCESS`; URL HTTPS, volume `/data` e Socket.IO validados.  
**Lead/revisor:** Mavis.  
**Regra operacional:** ADR-003 — lock estrito por issue. Nenhum agente modifica arquivos fora da lista explícita de sua issue.

---

## Objetivo

Preparar um playtest fechado de Kabemjunto sem alterar regras canônicas, motor, backend, economia, loja, inventário ou plano de cobrança. A sprint gera evidência de uso real e uma decisão visual de onboarding, mantendo a release operacional verificável.

## Não-objetivos

- Não adicionar moedas, raridade, desbloqueios, loja, ranking, missões, login social ou cobrança.
- Não alterar `packages/shared/src/rules/**`, tipos canônicos, contratos Socket.IO, persistência ou a configuração Railway.
- Não implementar uma nova tela de onboarding antes de aprovação visual explícita do proprietário.
- Não ativar plano pago no Railway.

---

## Issues e locks

### M23 — Reconciliação de governança e release `v0.5.1`

**Dono:** Mavis  
**Issue:** [#15](https://github.com/Alexandremocmg/kabemjunto/issues/15)  
**Status:** EM EXECUÇÃO

**Pode tocar:**

- `README.md`
- `STATUS.md`
- `CHANGELOG.md`
- `docs/UI-ELEVACAO-VISUAL-FASE-2.md`
- `briefings/sprint-7.md`

**Critério de pronto:**

- documentação declara `v0.5.1`, tag e URL Railway reais;
- contagens e gates refletem a execução mais recente (263 testes e 19 E2E na release visual);
- caminhos, stack e roadmap histórico obsoletos são marcados como histórico ou atualizados sem inventar capacidades;
- o deploy já realizado é distinguido de qualquer ativação futura de plano pago;
- `npx prettier --check` nos Markdown tocados e `git diff --check` passam.

### A17 — Protocolo de playtest fechado sem PII

**Dono:** Antigravity  
**Issue:** [#16](https://github.com/Alexandremocmg/kabemjunto/issues/16)  
**Status:** PRONTA PARA EXECUÇÃO

**Pode tocar:**

- `docs/PLAYTEST-FECHADO-v0.5.1.md` (novo)
- `docs/templates/playtest-resultados.csv` (novo)

**Critério de pronto:**

- protocolo reproduzível para partidas de 2, 4, 6, 8 e 10 jogadores;
- registra somente dados agregados e voluntários, sem nome, e-mail, token, `salaId` ou conteúdo de chat;
- inclui roteiro de entrada, criação de sala, reconexão, regras de observação e critérios de parada;
- template CSV usa IDs de sessão efêmeros e colunas de métrica documentadas;
- nenhum formulário externo ou SaaS é criado sem autorização do proprietário.

### C29 — Proposta visual de onboarding da primeira partida

**Dono:** Codex  
**Issue:** [#17](https://github.com/Alexandremocmg/kabemjunto/issues/17)  
**Status:** PRONTA PARA EXECUÇÃO

**Pode tocar:**

- `docs/ONBOARDING-PRIMEIRA-PARTIDA.md` (novo)

**Critério de pronto:**

- propõe um fluxo mobile-first de primeira partida em no máximo cinco passos;
- explica criação/entrada em sala, objetivo, compra, seleção em dois toques, cartas especiais e a Regra do 7;
- fornece wireframe textual e estados acessíveis (foco, Escape, leitura por screen reader e reduced motion);
- não prescreve alterações em `.tsx`, CSS, regras ou assets;
- é apresentado ao proprietário para aprovação visual antes de abrir issue de implementação.

---

## Ordem de execução

1. M23 atualiza a verdade documental sem tocar runtime.
2. A17 e C29 podem ser redigidas em paralelo, pois seus locks não se cruzam.
3. O proprietário revisa a proposta visual C29.
4. Somente após aprovação visual, abrir uma issue de implementação de onboarding com lock próprio.
5. Realizar playtest fechado seguindo A17; quaisquer bugs de regra, segurança ou persistência abrem issues separadas e não são corrigidos dentro de A17/C29.

## Quality gates

- Markdown tocado conforme Prettier e `git diff --check` limpo.
- Para qualquer implementação futura: `npm run validate`, `npm run test:cov` e `npm run e2e` continuam obrigatórios.
- Nenhuma mudança de runtime entra nesta sprint sem teste focal, revisão e lock explícito.

## Definição de pronto da Sprint 7

- [ ] M23 documenta o estado operacional real de `v0.5.1`.
- [ ] A17 entrega protocolo e template sem PII.
- [ ] C29 entrega proposta visual de onboarding aprovada pelo proprietário.
- [ ] Pelo menos um playtest fechado é executado conforme protocolo, ou um bloqueio externo é documentado.
- [ ] Todas as descobertas viram issues pequenas, com lock e evidência reproduzível.
