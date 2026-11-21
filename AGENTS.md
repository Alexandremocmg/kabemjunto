# AGENTS — Kabemjunto

> **Convenções para o time multi-agente (Mavis / Codex / Antigravity).**
> Primeira coisa que cada agente (ou instância nova) lê antes de trabalhar.

## Quem é quem

| Agente          | Papel                                          | Perfil                                           |
| --------------- | ---------------------------------------------- | ------------------------------------------------ |
| **Mavis**       | Lead técnico + gerente/revisor + dono do motor | [agents/mavis.md](./agents/mavis.md)             |
| **Codex**       | Engenheiro pleno (UI, back, integrações)       | [agents/codex.md](./agents/codex.md)             |
| **Antigravity** | Engenheiro júnior (assets, CSS, copy)          | [agents/antigravity.md](./agents/antigravity.md) |

## Regra de ouro: Lock estrito por issue (ADR-003)

Cada agente só toca em arquivos do escopo da issue que pegou.

- **Sem extrapolação.** Se precisar tocar em arquivo fora do escopo, abre issue separada e espera.
- **Mudanças estruturais** (`package.json`, `tsconfig*`, `eslint*`, ADRs, estrutura de pastas) exigem aprovação do **Mavis** antes do PR.
- **Mudança no motor** (`packages/shared/src/rules/**` ou `packages/shared/src/telemetry/**`) → Mavis é dono, ninguém mexe.

## Como uma sprint funciona

1. **Mavis escreve a spec** da sprint em `briefings/sprint-N.md` (tema, issues por agente, DoD).
2. **Mavis distribui issues** pra cada agente via briefing + issue no GitHub.
3. **Agentes executam** — fazem commits no working tree local (não pusham).
4. **Mavis revisa** (gerente): aprova ou pede mudanças.
5. **Mavis commita + pusha** (ou o agente commita se for mudança trivial sem审查 estrutural).

## Onde achar o quê

| Pasta                              | Dono                        | O quê                                           |
| ---------------------------------- | --------------------------- | ----------------------------------------------- |
| `packages/shared/src/rules/**`     | **Mavis**                   | Motor puro (state machine, validar, executar)   |
| `packages/shared/src/types/**`     | **Mavis**                   | Tipos canônicos (Carta, Jogador, Estado, etc.)  |
| `packages/shared/src/telemetry/**` | **Mavis**                   | Telemetria LGPD-friendly                        |
| `packages/shared/src/constants/**` | **Mavis**                   | Baralho 108, avatares, etc.                     |
| `apps/server/src/**`               | **Codex**                   | Backend Fastify + Socket.IO                     |
| `apps/web/src/**`                  | **Codex**                   | Frontend PWA consolidado (lógica e integrações) |
| `apps/web/src/**/*.css`            | **Antigravity**             | CSS e design system, sem regra de negócio       |
| `assets/**`                        | **Antigravity**             | SVGs, áudio, ícones                             |
| `*.md` (docs)                      | **Mavis** + **Antigravity** | Docs do projeto                                 |
| `DECISIONS.md`                     | **Mavis**                   | ADRs (mudanças estruturais)                     |

## Quality gates (não negociável)

- `npm run validate` deve passar sempre. **Nenhum PR é mergeado com CI vermelho.**
- TS strict mode (zero `as any` em produção)
- ESLint 0 erros
- Prettier 100% conforme
- Testes verdes (`npm run validate` + `npm run e2e`)

## Onde achar o briefing atual

→ [`briefings/sprint-6.md`](./briefings/sprint-6.md) (Sprint 6 — persistência, produção e operação)

## Onde achar feedback histórico

→ [`feedback/`](./feedback/) (um arquivo por issue revisada)
