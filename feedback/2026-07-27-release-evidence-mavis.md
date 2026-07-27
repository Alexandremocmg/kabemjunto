# Review Mavis — Evidências de release v0.4.0

**Data:** 2026-07-27  
**Decisão:** mudanças solicitadas antes da tag `v0.4.0`.

## A13 — Lighthouse Accessibility

Auditoria executada contra o build de produção servido por `vite preview` em `http://127.0.0.1:4173`.

```text
Accessibility: 93/100
Gate exigido:   95/100
Resultado:      REPROVADO
```

Único audit reprovado:

```text
meta-viewport = 0
```

Causa confirmada em `apps/web/index.html`:

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
/>
```

`user-scalable=no` impede zoom em dispositivos móveis e viola WCAG 1.4.4 para usuários com baixa visão.

**Correção solicitada:** remover `maximum-scale=1.0` e `user-scalable=no`, preservando `width=device-width`, `initial-scale=1.0` e `viewport-fit=cover`.

**Critério de aprovação:** repetir Lighthouse no build de produção e obter Accessibility ≥95.

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

O workflow local contém `quality-gate`, cobertura ≥80%, build e E2E. A execução externa não pôde ser consultada porque o repositório é privado e a sessão atual não possui `gh`, `GH_TOKEN` ou `GITHUB_TOKEN`.
