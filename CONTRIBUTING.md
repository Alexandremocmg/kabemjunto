# 🤝 Contributing to Kabemjunto

> Como contribuir com o projeto — para humanos **e** para os 3 agentes de IA (Mavis / Codex / Antigravity).

---

## TL;DR

1. Leia o [`GDD-Kabemjunto.md`](./GDD-Kabemjunto.md) (pelo menos o §0 e §7)
2. Leia o [`PLANO-EQUIPE-3DEVS.md`](./PLANO-EQUIPE-3DEVS.md) (regras do time)
3. Pegue uma issue (ou crie uma)
4. Respeite a **regra de lock estrito** (ver abaixo)
5. Abra um PR linkando a issue
6. Aguarde review (Mavis revisa em < 24h)
7. Merge após aprovação

---

## 🧠 Filosofia

Kabemjunto é um jogo de cartas. A qualidade do motor de regras é **crítica** — um bug pode dar vitória injusta a alguém ou destruir uma amizade. Por isso:

- **Regras > código.** Mudança de regra exige ADR + update no GDD primeiro.
- **Testes > features.** Cobertura do motor nunca cai abaixo de 80%.
- **Pureza > velocidade.** O motor é puro para ser testável e compartilhável com o servidor.
- **TypeScript strict sempre.** Zero `as any` em produção (regra do ADR-004).

---

## 🤖 Para os agentes de IA

Este projeto é mantido por 3 agentes de IA. Se você é um deles, leia com atenção.

### Quem é quem

| Agente          | Papel             | Arquivos permitidos (resumo)                                                                                                               |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mavis**       | Lead técnico      | `packages/shared/**` (especialmente `rules/**` e `types/**`), motor de regras, ADRs, code review final, **qualquer arquivo em emergência** |
| **Codex**       | Engenheiro pleno  | `apps/web/src/**` (lógica, não assets), `apps/server/src/routes/**`, `apps/server/src/sockets/**`, CI, deploy                              |
| **Antigravity** | Engenheiro júnior | `assets/**`, `src/styles/**`, `src/components/**` (só CSS), `*.md`, fixtures JSON, SFX, copy                                               |

Tabela completa no [`PLANO-EQUIPE-3DEVS.md §5.0`](./PLANO-EQUIPE-3DEVS.md#50-lock-estrito-por-issue-regra-de-convivência).

### Regra de lock estrito (ADR-003) — **NÃO NEGOCIÁVEL**

Cada agente só pode abrir/modificar arquivos **explicitamente listados na issue que ele pegou**.

**Antes de tocar em qualquer arquivo, pergunte:**

1. Esse arquivo está no escopo da minha issue?
2. Se não, existe issue aberta pra isso? (crie uma e espere)
3. Se for urgente, marquei `@Mavis` para aprovar?

**Mavis revisa PRs.** Se um agente tocar em arquivo fora do escopo, o PR é rejeitado.

**Exceções documentadas:**

- Bug crítico de produção → pode corrigir imediatamente e abrir issue retroativa
- Mudança em `tsconfig.json` / `package.json` raiz → exige aprovação de Mavis
- Mudança em `packages/shared/types/**` → Mavis only
- Mudança em `packages/shared/rules/**` → Mavis only (é o motor)

### Workflow do agente

1. **Ler `STATUS.md`** antes de qualquer coisa (é o standup assíncrono)
2. Comentar `👋 Pegando: ISS-XX` na issue
3. Criar branch: `git checkout -b agent/<nome>/<id>-<slug>`
4. Trabalhar respeitando lock estrito
5. Rodar `npm run validate` antes de abrir PR
6. Abrir PR usando `.github/pull_request_template.md`
7. Marcar revisor apropriado (ver `PLANO §7.1`)
8. Atualizar `STATUS.md` no fim do turno

### Quando você (agente) discorda de outro

1. Tente resolver na conversa do PR
2. Se travar por 2 rounds, Mavis posta ADR com recomendação
3. Sem objeção em 24h: ADR vira lei
4. Se persistir, escala para o usuário humano

---

## 👤 Para humanos

### Setup local

```bash
git clone <url>
cd kabemjunto
npm install
npm test          # valida 41/41 testes
npm run dev       # http://localhost:5173
```

### Tipos de contribuição

- **🐛 Bug** — achou um bug? Abra uma [issue de bug](../../issues/new?template=bug_report.md).
- **✨ Feature** — tem uma ideia? Abra uma [issue de feature](../../issues/new?template=feature_request.md) antes de codar.
- **🎴 Asset** — desenhou uma carta? Coloque em `assets/` e abra PR.
- **📖 Docs** — encontrou typo, link quebrado, ou quer expandir o GDD? Bem-vindo.
- **🌍 Tradução** — Kabemjunto é PT-BR. Traduções (EN, ES) serão bem-vindas no futuro.

### Antes de abrir PR

Rode localmente:

```bash
npm run validate
```

Isso roda: typecheck + lint + format:check + test. **Tudo deve passar.**

### Estrutura de PR

Use o template `.github/pull_request_template.md`. Mínimo:

- **O que mudou** (1-2 frases)
- **Issue que fecha** (`Closes #123`)
- **Como testar** (passo a passo)
- **Screenshots** (se UI)
- **Checklist** preenchido

### Regra dos 400 linhas

PRs com mais de 400 linhas de diff (excluindo lock files e assets) **devem ser quebrados** em PRs menores. CI avisa com warning. Ver [`PLANO §6`](./PLANO-EQUIPE-3DEVS.md#6-fluxo-de-trabalho-do-issue-ao-merge).

### Quem revisa

| Caminho tocado                        | Revisor primário                |
| ------------------------------------- | ------------------------------- |
| `packages/shared/**`                  | Mavis (ou humano)               |
| `apps/web/src/components/**` (lógica) | Codex                           |
| `apps/web/src/components/**` (só CSS) | Antigravity                     |
| `apps/server/src/**`                  | Codex + Mavis se for game logic |
| `assets/**`                           | Antigravity                     |
| `*.md`                                | Qualquer um                     |
| CI / `package.json` raiz              | Mavis                           |

---

## 🧪 Como rodar os testes

```bash
npm test                 # roda uma vez
npm run test:watch       # modo TDD
npm run test:cov         # com cobertura (gera coverage/)
```

Os testes ficam em `packages/shared/src/rules/*.test.ts`. Cobrem os 15 edge cases do GDD §04.5 e as invariantes do motor.

Para escrever um teste novo:

```typescript
import { describe, it, expect } from 'vitest';
import { executarJogada } from '@shared';

describe('minha feature', () => {
  it('faz o que deveria', () => {
    // ...
  });
});
```

---

## 📏 Estilo de código

### TypeScript

- **Strict mode sempre.** Nunca `as any` em produção (regra do ADR-004).
- Prefira `unknown` + narrowing a `any`.
- Imutabilidade: `readonly` em arrays, `as const` em literais.
- Tipos compartilhados em `packages/shared/types/`.

### React

- Componentes funcionais com `React.FC<Props>`.
- Estado local com `useState`, global com Zustand.
- Sem `useEffect` que muta estado sem dependências declaradas.
- Imports com alias: `import { X } from '@shared'` (não `../../../packages/shared/src/...`).

### Commits

Mensagens em português (time é brasileiro). Convenção:

```
tipo(escopo): descrição curta

feat(motor): adiciona regra do 7 (silêncio)
fix(types): adiciona avatar/pontos em Jogador
docs(readme): adiciona seção de arquitetura
test(rules): cobre edge case do +4 sem cor
refactor(shared): move motor para packages/shared/rules
chore(ci): atualiza workflow de PR
```

---

## 🚫 O que NÃO fazer

- ❌ **Não mexa no motor de regras sem atualizar o GDD.** Regra canônica > código.
- ❌ **Não use `as any`** em código de produção (ADR-004).
- ❌ **Não toque em arquivos fora do escopo da sua issue** (ADR-003).
- ❌ **Não commite `console.log`**, `TODO` sem issue, ou código comentado.
- ❌ **Não faça PR > 400 linhas** sem justificativa (regra §6 do plano).
- ❌ **Não ignore o CI.** Se está vermelho, conserta antes de pedir review.

---

## 📞 Comunicação

- **Issues**: GitHub Issues (com template)
- **PR**: GitHub Pull Requests (com template)
- **Daily standup**: [`STATUS.md`](./STATUS.md) — escreva nele, não peça reunião
- **Decisões técnicas**: [`DECISIONS.md`](./DECISIONS.md) — ADRs curtos
- **Dúvidas sobre regra do jogo**: [`GDD-Kabemjunto.md`](./GDD-Kabemjunto.md)

---

## 📜 Licença

A definir. Por enquanto, todos os direitos reservados. Ao submeter uma contribuição, você concorda em licenciar seu código sob os termos que o projeto vier a adotar (provavelmente MIT).

---

**Boa contribuição! 🎴**

_Lembre-se: o jogo é uma desculpa. O que importa é fazer os amigos rirem._
