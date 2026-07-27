# Briefing — Sprint 5: Release

> **Spec da Sprint 5, escrita por Mavis (gerente).**
> Pós-v0.3.1, próxima sprint. Foco: polish final + infra pra release público.

**Período estimado:** 2026-07-28 → 2026-07-30
**Tema:** Release-ready — consolidar dual app, instrumentar telemetria real, testes E2E, CI/CD.
**Pré-requisito:** Sprint 3+4 fechadas (✅ v0.3.1 released 2026-07-27).

---

## Issues candidatas (priorizar com user)

### 🟢 Mavis (motor + infra)

| ID  | Issue                                                                                 | Esforço | Valor  | ADR necessário? |
| --- | ------------------------------------------------------------------------------------- | ------- | ------ | --------------- |
| M16 | Consolidar dual app: mover single-player de `src/` → `apps/web/`, deletar `src/` raiz | 4-6h    | 🟢🟢🟢 | ADR-009         |
| M17 | Persistência no servidor: Redis (sala) + Postgres (jogadores)                         | 6-8h    | 🟢🟢   | ADR-010         |
| M18 | Auth real: magic link por e-mail (sessão JWT)                                         | 4-6h    | 🟢🟢   | ADR-011         |
| M19 | CI no GitHub Actions: rodar validate em todo PR + check de cobertura                  | 1-2h    | 🟢🟢🟢 | —               |

### 🔵 Codex (eng. pleno)

| ID  | Issue                                                                            | Esforço | Valor  |
| --- | -------------------------------------------------------------------------------- | ------- | ------ |
| B17 | Substituir `consoleSink` por `posthogSink` real (PostHog Cloud, free tier)       | 2-3h    | 🟢🟢🟢 |
| B18 | Testes E2E com Playwright: 2 clientes reais jogando online                       | 3-4h    | 🟢🟢🟢 |
| B19 | Acessibilidade do Lobby: Tab navigation, Enter submete, ARIA labels completos    | 2h      | 🟢🟢   |
| B20 | Substituir `crypto.randomUUID()` fallback por validação real de UUID no servidor | 1h      | 🟢     |

### 🟣 Antigravity (eng. júnior)

| ID  | Issue                                                                 | Esforço | Valor |
| --- | --------------------------------------------------------------------- | ------- | ----- |
| A9  | Loading states: spinners, skeletons, "salvando..." indicators         | 2h      | 🟢🟢  |
| A10 | Onboarding: tutorial interativo na primeira vez que o user abre o app | 4-6h    | 🟢🟢  |
| A11 | Página de erro 404/not-found estilizada                               | 1h      | 🟢    |
| A12 | Animações de vitória (confetti, "VOCÊ GANHOU!" banner)                | 2h      | 🟢🟢  |

---

## Sugestão do Mavis (3 caminhos)

### 🅰️ **A — Release mínimo viável (MVP)**

- M16 (consolidação dual app) + M19 (CI) + B17 (PostHog) + A11 (404)
- **Esforço total:** ~10h
- **Valor:** release pode ir pra produção
- **Recomendado se:** quer lançar logo

### 🅱️ **B — Release robusto**

- A + B18 (E2E) + B19 (acessibilidade) + A12 (vitória animada) + M16 + M19
- **Esforço total:** ~18h
- **Valor:** release com confiança (testado, acessível, polish)
- **Recomendado se:** quer lançar com qualidade

### 🅲 **C — Release enterprise**

- B + M17 (Redis/Postgres) + M18 (auth) + B20 + A9 (loading) + A10 (onboarding)
- **Esforço total:** ~30h
- **Valor:** release production-grade (escala, segurança, UX)
- **Recomendado se:** vai ter muitos usuários / compliance LGPD sério

---

## Próximo passo

Você (user) escolhe A, B ou C. Mavis escreve a spec detalhada da sprint escolhida e distribui pros agentes.

**Minha recomendação:** B (Release robusto) — equilíbrio entre velocidade e qualidade. A pode lançar antes mas com dívida; C é overkill pra MVP.

Se quiser, posso também adicionar/remover issues específicas. As listas acima são sugestões, não prescrição.
