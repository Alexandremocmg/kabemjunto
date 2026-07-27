# Review Mavis — B22 CI monorepo reproduzível

**Issue:** B22  
**Executor inicial:** OpenCode  
**Correção/revisão:** Mavis  
**Data:** 2026-07-27  
**Decisão local:** APPROVED; aguardando GitHub Actions

## Causa raiz

O root não declarava `workspaces`, embora `apps/web` usasse `workspace:*`. O `npm ci` do GitHub Actions instalava somente dependências da raiz e não disponibilizava `socket.io-client` nem `@kabemjunto/shared`.

Depois de declarar os workspaces, uma instalação limpa revelou um segundo problema: `packages/shared/tsconfig.tsbuildinfo` estava versionado. O TypeScript considerava o shared já compilado mesmo sem `dist/`, deixando de gerar os `.d.ts` e produzindo erros TS7016 em cascata.

## Correção

- root declara `apps/*` e `packages/*` como workspaces;
- dependência interna `@kabemjunto/shared` usa a versão npm-compatible `0.1.0` nos apps;
- `package-lock.json` foi regenerado com todos os workspaces;
- `packages/shared/tsconfig.tsbuildinfo` foi removido do Git; `*.tsbuildinfo` já era ignorado;
- Fastify foi atualizado de 4.x para 5.10.0;
- plugins atualizados para `@fastify/cors` 11.3.0 e `@fastify/sensible` 6.0.4.

## Evidências

```text
Instalação limpa, npm 11:
  npm ci                    ✅ 487 pacotes
  npm run typecheck         ✅

Instalação limpa, npm 10 (equivalente ao Actions/Node 20):
  npm ci                    ✅ 418 pacotes
  npm run typecheck         ✅

Working tree:
  npm run validate          ✅ 171 testes + build
  npm run e2e               ✅ 7/7
  npm audit --omit=dev      ✅ 0 vulnerabilidades
```

As vulnerabilidades restantes reportadas pelo audit completo estão em dependências de desenvolvimento; a árvore de produção ficou sem vulnerabilidades conhecidas pelo npm audit.

## Gate remoto

O último run anterior à correção falhou no step Typecheck por módulos ausentes. Após o push de B22, o workflow do novo SHA deve concluir `quality-gate` e `e2e` com sucesso antes da tag `v0.4.0`.
