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

Validação em duas fases:

### Endpoint controlado

```text
frontend preview                 4174
backend isolado                  3101
mock PostHog                     3999
queda reconhecida                Reconectando... / xhr poll error
reconexão                        Online
capture_count                    1
event                            RECONECTADO
api_key                          presente (valor fake não persistido)
distinct_id                      presente
properties                       duracaoMs,jogadorId,modo,salaId,tentativa
tipos                            number,string,string,string,number
```

### PostHog US Cloud real

`apps/web/.env.local` foi configurado localmente e permanece ignorado pelo Git. O build de produção foi executado com o project token real, sem imprimir ou versionar a chave.

```text
queda reconhecida                conexão perdida / reconectando
reconexão                        Online
endpoint                         https://us.i.posthog.com/capture/
method                           POST
event                            RECONECTADO
status HTTP                      200
dashboard US Cloud               evento confirmado pelo proprietário
```

Como a configuração usa `sampleRate: 0.1`, a auditoria fixou `Math.random()` em zero somente na página de QA para tornar a amostragem determinística. Isso também tornou temporariamente vazio o código de sala gerado por `Math.random`, explicando a 404 observada durante o teste; não era regressão do fluxo normal.

Após a auditoria, processos isolados foram encerrados e o bundle normal foi reconstruído. Nenhuma credencial foi adicionada ao Git.

**Decisão B21:** APPROVED.

## CI externo

A consulta autenticada à API do repositório privado confirmou que os dez runs mais recentes estavam falhando. No SHA `6fb111c`, o job `quality-gate` falhou no step Typecheck e o E2E foi ignorado.

Causa raiz confirmada no log remoto:

- o root não declarava workspaces;
- `npm ci` não instalava dependências dos apps;
- `packages/shared/tsconfig.tsbuildinfo` versionado impedia geração dos `.d.ts` em checkout limpo.

B22 corrigiu a configuração do monorepo, regenerou o lockfile e removeu o cache incremental rastreado. Instalações limpas com npm 11 e npm 10 passaram em `npm run typecheck`.

Evidência remota final:

```text
SHA:         4a95189
Workflow:    .github/workflows/ci.yml
Run:         30313623191
quality-gate completed / success
E2E          completed / success
```

O gate de CI está aprovado.
