# Review Mavis — Evidências de release v0.4.0

**Data:** 2026-07-27  
**Decisão:** mudanças solicitadas antes da tag `v0.4.0`.

## A13 — Lighthouse Accessibility

Auditoria executada contra o build de produção servido por `vite preview` em `http://127.0.0.1:4173`.

Resultado inicial:

```text
Accessibility: 93/100
Gate exigido:   95/100
Resultado:      REPROVADO
Audit:          meta-viewport = 0
```

Causa confirmada: `maximum-scale=1.0` e `user-scalable=no` impediam zoom em dispositivos móveis, violando WCAG 1.4.4 para usuários com baixa visão.

Correção aplicada em `apps/web/index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Reauditoria Mavis após novo build:

```text
Accessibility: 100/100
Gate exigido:   95/100
Audits falhos:  nenhum
Resultado:      APROVADO
```

O Lighthouse produziu o relatório completo; depois disso, o Chrome Launcher registrou `EPERM` apenas na limpeza de sua pasta temporária no Windows. O score e os audits foram lidos do JSON gerado, e o arquivo temporário não foi versionado.

## B21 — PostHog `RECONECTADO`

Código revisado:

- `apps/web/src/services/posthogSink.ts` implementa envio REST best-effort;
- `apps/web/src/main.tsx` ativa o sink somente em build de produção;
- `apps/web/src/services/socketClient.ts` emite `RECONECTADO` após queda real.

Bloqueio de evidência:

```text
apps/web/.env           ausente
VITE_POSTHOG_API_KEY    não configurada
```

Nenhum segredo deve ser commitado. A aprovação exige configuração local/CI protegida e confirmação do evento no dashboard PostHog.

## CI externo

A consulta autenticada à API do repositório privado confirmou que os dez runs mais recentes estavam falhando. No SHA `6fb111c`, o job `quality-gate` falhou no step Typecheck e o E2E foi ignorado.

Causa raiz confirmada no log remoto:

- o root não declarava workspaces;
- `npm ci` não instalava dependências dos apps;
- `packages/shared/tsconfig.tsbuildinfo` versionado impedia geração dos `.d.ts` em checkout limpo.

B22 corrige a configuração do monorepo, regenera o lockfile e remove o cache incremental rastreado. Instalações limpas com npm 11 e npm 10 passaram em `npm run typecheck`. O gate só será marcado como concluído depois que o novo SHA ficar verde no GitHub Actions.
