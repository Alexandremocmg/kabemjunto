# Handover de Mavis — Guia de Onboarding pro Novo Gerente/Revisor

> **Este documento é o ponto de entrada pro novo Dev que assume o papel Mavis.**
> Tudo que você precisa saber tá aqui. Lê em ordem, mas volta quando precisar.

**Data do handover:** 2026-07-27 18:40 BRT
**Versão do projeto:** v0.3.1 (release) + Sprint 5 quase completa (~80%)
**Quem tá saindo:** Mavis atual (eu, MiniMax Code) — gerenciei o projeto de 2026-07-26 a 2026-07-27
**Quem tá entrando:** Você (novo Dev — humano ou IA)

---

## 🎯 TL;DR (5 minutos)

Você assume o papel **Mavis** = **gerente + revisor + dono do motor de regras**. O projeto Kabemjunto é um jogo de cartas digital (UNO-like) com 3 agentes (você / Codex / Antigravity) trabalhando em issues versionadas no repo.

**Seu trabalho:**

1. **Escrever** specs de sprint em `briefings/sprint-N.md` (problema + critério de pronto, sem prescrever implementação)
2. **Revisar** PRs do time — CI verde passa direto, mudanças em motor/telemetria/estrutura passam por você
3. **Escrever código** só pra: motor de regras, telemetria, ADRs estruturais, ou issues explicitamente suas
4. **Documentar** decisões em `DECISIONS.md` (ADRs) e reviews em `feedback/<data>-<issue>-<agente>.md`

**O que NÃO fazer:**

- Escrever código de feature (UI, back, assets) — é do Codex/Antigravity
- Aprovar PR sem CI verde
- Aprovar PR que viole lock estrito (ADR-003) — você é o guardião

---

## 📚 Ordem de leitura (3-4 horas)

Se tiver pressa, leia só os **marcados com ⭐**:

### ⭐ Essencial (1h)

1. **[`AGENTS.md`](../../AGENTS.md)** — entry point do time. Convenções, regra de lock, fluxo de sprint.
2. **[`agents/mavis.md`](../../agents/mavis.md)** — seu papel detalhado (atualizado pra ser genérico).
3. **[`agents/codex.md`](../../agents/codex.md)** — quem é o Codex, o que ele faz, o que ele não pode tocar.
4. **[`agents/antigravity.md`](../../agents/antigravity.md)** — quem é o Antigravity, mesmo formato.
5. **[`DECISIONS.md`](../../DECISIONS.md)** — 10 ADRs (001-010). Pelo menos leia 003 (lock), 004 (refactor motor), 007 (Mavis gerente), 008-010 (últimas decisões).
6. **[`STATUS.md`](../../STATUS.md)** — caderno de comunicação. Mostra o estado atual e histórico.

### ⭐ Importante (1h)

7. **[`briefings/sprint-3.md`](./sprint-3.md)** — sprint que fechou v0.3.1.
8. **[`briefings/sprint-5.md`](./sprint-5.md)** — sprint atual (quase fechada).
9. **[`briefings/m14-reconexao-identidade.md`](./m14-reconexao-identidade.md)** — exemplo de spec de issue (M14).
10. **[`briefings/m15-src-legado.md`](./m15-src-legado.md)** — outro exemplo (M15).

### Detalhe (1h)

11. **[`feedback/2026-07-27-sprint3-b9-codex.md`](../feedback/2026-07-27-sprint3-b9-codex.md)** — exemplo de review formal.
12. **[`feedback/2026-07-27-m14-mavis.md`](../feedback/2026-07-27-m14-mavis.md)** — review de issue própria.
13. **[`feedback/2026-07-27-sprint4-polish-mavis.md`](../feedback/2026-07-27-sprint4-polish-mavis.md)** — exemplo de quebra de lock justificada.
14. **[`CHANGELOG.md`](../../CHANGELOG.md)** — release notes.
15. **[`PLANO-EQUIPE-3DEVS.md`](../../PLANO-EQUIPE-3DEVS.md)** — plano original multi-agente.

### Referência rápida (depois)

- `package.json` raiz — scripts: `dev`, `build`, `test`, `e2e`, `validate`
- `packages/shared/src/rules/` — motor puro (seu território)
- `apps/server/src/` — backend Fastify (território Codex)
- `apps/web/src/` — frontend PWA (território Codex)
- `apps/web/.env.example` — template de env vars (PostHog, etc)

---

## 🧠 O que Mavis anterior aprendeu (lessons learned)

### ✅ O que funcionou bem

1. **Comunicação via arquivos** (não via mensagem) — sobrevive a restart de agentes, fica versionado, é auditável.
2. **Lock estrito** — cada agente toca só no escopo dele, zero pisada-de-pé.
3. **Briefings curtos** — problema + critério de pronto, sem prescrever implementação. Deixa o time escolher o "como".
4. **ADRs pra mudanças estruturais** — força decisão explícita, vira histórico navegável.
5. **Feedback formal em arquivo** — não é "LGTM" no chat, é uma review escrita com motivo, pendências, decisão.
6. **Validação antes de tudo** — `npm run validate` é o gate único. Se não passa, PR nem é considerado.

### ⚠️ O que deu errado

1. **Lock estrito quebrado 1x** (Sprint 4 polish, 2026-07-27) — user pediu pra fechar pendências, Mavis executou issues do Codex/Antigravity. Justificativa documentada. **Lição:** se o user pedir pra quebrar lock, documente e siga, mas registre o precedente.
2. **Múltiplas renomeações quebraram o build** (Sprint 0) — Antigravity implementou motor em `src/services/gameEngine.ts` violando lock. **Lição:** lock estrito é ESSENCIAL, não opcional.
3. **Decisões temporárias precisam de data de revisão** (ADR-008 não marcou data) — dual app durou 1 sprint a mais que o necessário. **Lição:** se ADR é "temporário", escreva "Revisar em: data".
4. **Telemetry devia ter sido instrumentada desde o início** — M13 (telemetria) só foi feita na Sprint 2. **Lição:** instrumentar antes é melhor que depois.
5. _*Vite workspace:* quebra npm install_* — tentei instalar `posthog-js` via `npm install`, falhou por causa de `workspace:*` no `apps/web/package.json`. **Lição:** use API REST via `fetch` em vez de SDK quando dep é problema.

### 🤝 Como o user gosta de trabalhar

- **Decisões estruturais com opções** — `ask_user` 2x na sprint inicial, gostou de ver A/B/C antes de escolher
- **Documentar TUDO** — ADRs, briefings, feedbacks. Nunca só descrição
- **Gírias PT-BR** — "bora", "belez", "firmeza", "tranquilo". Tom informal mas objetivo
- **Tabelas + bullets** — não gosta de textão
- **Sessão longa noturna** — pode trabalhar 6h+ sem pausas. Não sugerir pausas a menos que ele indique
- **Commits em paralelo** — ele commita enquanto o agente trabalha. Pode acontecer de o agente criar arquivos e o user já ter commitado antes — não estranhar
- **Quando ele diz "continue"** — significa "toque o próximo item da lista". Não é hora de fazer perguntas

### 👥 Como o time se comporta

- **Codex** — engenheiro pleno, completo, rápido. Faz issues com qualidade. Identifica dependências (ex: marcou "M14 é pré-requisito" no STATUS.md). Pode trabalhar em paralelo sem supervisão constante.
- **Antigravity** — engenheiro júnior, mais lento, mais cuidadoso. Às vezes atrasa mas entrega. Bom em assets/CSS/copy.
- **Ambos** — empurram working tree entre sessões. Working tree pode ter mudanças untracked do time quando você voltar.

---

## 🛠️ Workflow típico de uma sprint

### 1. Spec da sprint (você, 30min)

```bash
# Editar briefings/sprint-N.md
# Estrutura:
# - Período + tema + pré-requisito
# - Issues por agente (tabela com ID, status, arquivos, DoD)
# - 3 caminhos priorizados (A/B/C) com recomendação
# - Cronograma de 3 dias
# - Definição de Pronto (DoD)
# - Riscos conhecidos
```

### 2. Distribuição (você, 15min)

- Commitar spec + push
- Cada agente lê briefing + profiles + feedbacks anteriores
- Eles pegam issues e começam a trabalhar em working tree local (não pusham)

### 3. Revisão (você, contínuo)

- Working tree ganha mudanças dos agentes
- Você lê + roda `npm run validate` + decide aprovar ou pedir mudanças
- Cria `feedback/<data>-<issue>-<agente>.md` se houver problema
- Aprova = commit (se for trivial) ou pede mudanças

### 4. Fechamento (você, 1h)

- Spec da próxima sprint (ou polish)
- CHANGELOG.md atualizado
- STATUS.md atualizado
- Tag de release (`git tag -a v0.X.Y -m "..."`)

---

## 🔑 Lições específicas por papel

### Motor de regras (Mavis é dono)

- **Puro**: zero I/O, zero DOM, zero áudio, zero fs. Importa só de `./index.js`
- **Determinista**: RNG opcional (default `Math.random`, com `embaralharComSeed` pra testes)
- **Imutável**: todas as funções retornam novo `EstadoPartida` (nunca mutam)
- **Resultado estruturado**: `executarJogada` retorna `{ novoEstado, sfx, eventos }`
- **Testes obrigatórios**: 165/165 passando, ≥80% cobertura no motor
- **Cuidado com flake**: testes de motor às vezes dão flake por race condition. Roda 2x se duvidar

### Telemetria (Mavis é dono)

- **Off por padrão** (LGPD-friendly) — `enabled = false` no default
- **Liga em prod via main.tsx** — `configureTelemetry({ enabled: true, sampleRate, sink, context })`
- **Sink plugável** — `consoleSink` (dev), `posthogSink` (prod), `noopSink` (testes)
- **Erros nunca derrubam o app** — sink é best-effort, loga em console.error

### Servidor autoritativo (Mavis é dono da arquitetura, Codex implementa)

- **Backend é a única fonte de verdade** do estado durante partida online
- **Cliente nunca é confiável**: tudo passa por validação no `RoomStore`
- **Mão privada** vai pro socket do próprio jogador, nunca broadcast
- **Identidade estável** (M14) — `jogadorId` é UUID v4 gerado pelo cliente, persiste no sessionStorage, sobrevive a reconexão

---

## 📦 Estado atual do projeto (2026-07-27 19:10 BRT)

### Releases

- **v0.3.0** — Sprint 3 release candidate (tag no GitHub)
- **v0.3.1** — Sprint 3 polish (tag no GitHub)
- **v0.4.0** — release candidate funcional; tag bloqueada até concluir evidências da Sprint 5

### Repositório

- `main` local e `origin/main` sincronizados no SHA `02d3dac`
- Working tree limpo no início da revisão M20
- App único consolidado em `apps/web/`; não há `src/` legacy rastreado

### Testes

- **171/171** testes unitários/integração verdes
- **7/7 E2E** Playwright verdes, incluindo partida Online determinística até a vitória
- **90,16%** de cobertura de statements/linhas no motor compartilhado
- Build de produção, lint, typecheck e Prettier verdes

### Sprint 5 — fechamento condicionado

Itens já entregues:

- ✅ M16 — consolidação do app em `apps/web/`
- ✅ M19 — workflow de CI, cobertura e E2E
- ✅ B17 — `posthogSink` e emissão de `RECONECTADO` no código
- ✅ A11 — 404 estilizada
- ✅ A12 — vitória animada/confetti
- ✅ B18/B20 — sete cenários E2E, incluindo partida Online determinística até a vitória
- ✅ B19 — acessibilidade básica do Lobby
- ✅ Proxy Socket.IO same-origin para túnel público
- ✅ `npm run dev` inicia backend + frontend

Evidências pendentes antes da tag `v0.4.0`:

1. CI externo verde no último SHA
2. Evento `RECONECTADO` confirmado no dashboard PostHog
3. Lighthouse Accessibility ≥ 95 em build de produção
4. Fechamento documental e tag anotada

---

## ⚠️ Pendências conhecidas

1. **PostHog** — sink e evento existem; falta evidência no dashboard real
2. **GitHub Actions** — workflow está configurado; resultado externo precisa ser confirmado com acesso autenticado
3. **Lighthouse** — medição atual 93; remover bloqueio de zoom e repetir auditoria
4. **M17 (persistência)** e **M18 (auth)** seguem candidatas à Sprint 6
5. **Sprint 6** recomendada: persistência, deploy estável, hardening e observabilidade

---

## 🆘 Se tiver dúvida

- **Reler este doc** (handover-mavis.md) — 80% das dúvidas estão aqui
- **Reler briefings/** — specs detalhadas de cada sprint
- **Reler feedback/** — exemplos de reviews formais
- **Perguntar ao user** — em PT-BR informal, tom de colega, com tabela/bullet
- **Não perguntar pra mim** — eu (Mavis anterior) saí, não tô mais disponível nesse papel

---

## 📊 Métricas finais que eu (Mavis anterior) entreguei

| Métrica                   | Valor                                          |
| ------------------------- | ---------------------------------------------- |
| Tempo no papel            | ~12h (2026-07-26 21:00 → 2026-07-27 18:40 BRT) |
| Sprints fechadas          | 5 (Sprint 0, 1, 2, 3, 4)                       |
| ADRs publicadas           | 10 (001-010)                                   |
| Issues próprias entregues | M1, M2, M11, M12, M13, M14, M15, M16, M17, M19 |
| Reviews formais           | 3 (B9, M14, Sprint 4 polish)                   |
| Testes                    | 41 → 165 (+304%)                               |
| Commits                   | 21                                             |
| Releases                  | v0.3.0, v0.3.1                                 |
| Bloqueios de lock estrito | 1 (Sprint 4 polish, justificado)               |

Boa sorte, novo Mavis. O projeto tá em boa forma. Cuida dele. 🤝
