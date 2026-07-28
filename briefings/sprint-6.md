# Sprint 6 — Persistência, Produção e Operação (`v0.5.0`)

**Status:** EM ANDAMENTO  
**Tema:** transformar o multiplayer funcional em um serviço recuperável, endurecido, observável e implantável em URL estável.  
**Pré-requisito:** `v0.4.0` publicada e CI verde.  
**Lead/revisor:** Mavis.  
**Executor backend/infra:** Codex.  
**Regra operacional:** ADR-003 — lock estrito por issue. Issues B23–B26 são sequenciais porque compartilham arquivos do backend.

---

## Objetivo

Uma partida Online deve sobreviver a restart do processo, operar com configuração segura de produção, expor sinais objetivos de saúde e métricas sem PII e poder ser executada como container único com URL HTTPS estável.

## Arquitetura aprovada para a sprint

- Instância única autoritativa.
- Persistência versionada em snapshot JSON atômico sobre volume persistente.
- `socketId` nunca é persistido; jogadores restaurados começam desconectados e recuperam a sessão pelo `jogadorId` estável.
- Frontend estático, Fastify e Socket.IO no mesmo container/origin.
- Docker portável; Railway + volume é o alvo primário sugerido, sem impedir Render/Fly/VPS.
- Logs Pino estruturados e métricas Prometheus de baixa cardinalidade, sem nome, sala ou jogador.
- Postgres/Redis e múltiplas réplicas ficam fora desta sprint. Tornam-se obrigatórios quando houver escala horizontal ou SLA que não aceite instância única.

---

## Issues e locks

### M21 — ADR de persistência e operação

**Dono:** Mavis  
**Status:** CONCLUÍDA

**Pode tocar:**

- `DECISIONS.md`
- `AGENTS.md`
- `STATUS.md`
- `briefings/sprint-6.md`

**Critério de pronto:**

- decisão de storage, recuperação, deploy e escala documentada;
- fronteiras de segurança e observabilidade explícitas;
- riscos e gatilhos de migração registrados.

### B23 — Persistência durável de salas

**Dono:** Codex  
**Dependência:** M21  
**Status:** APROVADA

**Pode tocar:**

- `apps/server/src/persistence.ts` (novo)
- `apps/server/src/persistence.test.ts` (novo)
- `apps/server/src/room-store.ts`
- `apps/server/src/room-store.test.ts`
- `apps/server/src/server.ts` somente para bootstrap/hidratação
- `apps/server/.env.example` (novo)

**Critério de pronto:**

- formato versionado e validado antes de restaurar;
- gravação atômica (`temp` + rename), diretório criado com segurança;
- sala aguardando e partida ativa sobrevivem a restart real;
- `socketByPlayer` não é serializado;
- jogadores restaurados ficam `conectado: false` até reconectar;
- arquivo ausente inicia vazio; arquivo inválido falha de forma explícita, sem apagar dados;
- teste cobre round-trip, restart, corrupção e isolamento de identidade;
- nenhuma alteração em `packages/shared/**`.

### B27 — Incluir backend no gate de produção

**Dono:** Mavis  
**Status:** APROVADA
**Motivo:** auditoria da Sprint 6 comprovou que o build raiz/CI não compilava `apps/server` e ocultava um erro de `exactOptionalPropertyTypes`.

**Pode tocar:**

- `package.json` raiz
- `apps/server/src/socket.ts` somente para o erro de tipagem reproduzido
- `.github/workflows/ci.yml` somente se os scripts raiz não forem suficientes

**Critério de pronto:**

- `npm run typecheck` inclui shared, server e web;
- `npm run build` produz shared, `apps/server/dist/server.js` e web;
- CI canônico usa esses scripts e não pode ficar verde com backend quebrado;
- processo compilado responde ao health check.

### B24 — Hardening do runtime e contratos externos

**Dono:** Codex  
**Dependência:** B28 aprovada  
**Status:** BLOQUEADA

**Pode tocar:**

- `apps/server/src/config.ts` (novo)
- `apps/server/src/config.test.ts` (novo)
- `apps/server/src/server.ts`
- `apps/server/src/socket.ts`
- `apps/server/src/socket-security.ts` (novo)
- `apps/server/src/socket-security.test.ts` (novo)
- `apps/server/package.json`
- `package-lock.json` mediante aprovação estrutural de Mavis

**Critério de pronto:**

- configuração Zod falha cedo para env inválida;
- produção aceita apenas `CORS_ORIGINS` explícitas; requests sem `Origin` continuam possíveis para health/probes;
- headers Helmet ativos;
- rate limit HTTP de 120 requisições/minuto/IP;
- token bucket por socket: entrada/criação de sala 10/minuto, chat 10/10 segundos e ações de jogo 30/10 segundos;
- `maxHttpBufferSize` do Socket.IO em 16 KiB e body HTTP máximo de 32 KiB;
- payloads Socket.IO validados antes de chamar `RoomStore`;
- usar `@fastify/helmet@11.1.1` e `@fastify/rate-limit@9.1.0`, compatíveis com Fastify 4;
- fixture E2E impossível em produção;
- shutdown gracioso em `SIGTERM`/`SIGINT`;
- erros externos não incluem stack ou estado privado;
- testes de origem negada, ausência de allowlist em produção, payload inválido, limites de tamanho e flood.

### B28 — Token seguro de retomada de sessão

**Dono:** Codex, com aprovação de tipos por Mavis  
**Dependência:** B23 aprovada  
**Status:** APROVADA

**Pode tocar:**

- `packages/shared/src/types/socket-events.ts`
- `packages/shared/src/types/index.ts` somente se necessário para export
- `apps/server/src/room-store.ts`
- `apps/server/src/room-store.test.ts`
- `apps/server/src/persistence.ts`
- `apps/server/src/persistence.test.ts`
- `apps/server/src/socket.ts`
- `apps/web/src/services/socketClient.ts`
- testes correspondentes nos mesmos módulos

**Critério de pronto:**

- servidor emite token opaco criptograficamente aleatório na primeira entrada;
- somente hash do token entra no snapshot durável;
- reconexão de jogador existente exige token válido;
- token é rotacionado na reconexão e o socket anterior é revogado;
- cliente guarda token apenas em `sessionStorage` e nunca o envia à telemetria/logs;
- erro externo não revela se jogador/token existe;
- testes cobrem retomada válida, token ausente, token inválido, rotação e restart.

### B25 — Observabilidade operacional

**Dono:** Codex  
**Dependência:** B24 aprovada  
**Status:** BLOQUEADA

**Pode tocar:**

- `apps/server/src/observability.ts` (novo)
- `apps/server/src/observability.test.ts` (novo)
- `apps/server/src/persistence.ts` somente para probe de gravabilidade/estado operacional
- `apps/server/src/persistence.test.ts` para o probe
- `apps/server/src/server.ts`
- `apps/server/src/socket.ts`
- `apps/server/package.json`
- `package-lock.json` mediante aprovação estrutural de Mavis

**Critério de pronto:**

- Pino JSON em produção e pretty apenas em desenvolvimento;
- `/live` comprova processo vivo;
- `/ready` retorna 200 apenas após storage carregado e um probe atômico não destrutivo comprovar que o volume continua gravável;
- `/metrics` em formato Prometheus, protegido por bearer token em produção;
- métricas incluem conexões, salas por estado, eventos aceitos/rejeitados, latência e falhas de persistência;
- labels são de baixa cardinalidade e não contêm nome, `salaId`, `jogadorId`, `socketId` ou conteúdo de chat;
- logs usam campos estruturados e não registram mãos privadas ou tokens;
- health e métricas cobertos por testes.

### B26 — Container e deploy permanente

**Dono:** Codex  
**Dependência:** B25 aprovada  
**Status:** BLOQUEADA

**Alvo escolhido pelo proprietário:** Railway com volume persistente.

**Infraestrutura já provisionada (sem deploy):**

- projeto `kabemjunto`, ambiente `production`;
- serviço vazio `web`;
- volume `web-volume` de 500 MB montado em `/data`;
- `ROOM_STORAGE_FILE=/data/rooms.json` e variáveis operacionais configuradas;
- `METRICS_TOKEN` aleatório configurado diretamente no provedor, sem registro no Git/log;
- domínio reservado `https://web-production-52c52.up.railway.app`;
- domínio configurado em `CORS_ORIGINS` e `PUBLIC_BASE_URL`;
- nenhum deployment criado antes dos gates locais;
- deploy inicial usa o trial; após o trial, serviço sempre ativo pode exigir Hobby (US$5/mês, com US$5 de uso incluído). Nenhum plano pago será ativado sem autorização separada.

**Pode tocar:**

- `Dockerfile` (novo)
- `.dockerignore` (novo)
- `railway.json` (novo, se compatível com o alvo escolhido)
- `render.yaml` (novo, somente se adotado como alternativa)
- `apps/server/src/server.ts` somente para servir `apps/web/dist`
- `apps/server/package.json`
- `package-lock.json` mediante aprovação estrutural de Mavis
- `README.md`
- `.github/workflows/**` apenas se houver credencial de deploy configurada

**Critério de pronto:**

- imagem multi-stage executa como usuário não-root;
- container serve frontend, Socket.IO e health checks no mesmo origin;
- volume `/data` documentado e usado por `ROOM_STORAGE_FILE`;
- `docker build` e smoke test reais passam;
- restart do container preserva sala/partida no volume;
- URL HTTPS estável comprovada com `/live`, `/ready`, Socket.IO e fluxo criar/reconectar;
- segredo de métricas e tokens ficam somente no provedor/GitHub Secrets.

### M22 — Revisão e fechamento

**Dono:** Mavis  
**Dependência:** B23–B26  
**Status:** BLOQUEADA

**Pode tocar:** documentação, workflow estrutural, tags e arquivos de feedback.

**Critério de pronto:** revisão de lock, segurança, recuperação, Docker, clean install, CI remoto e evidência da URL real.

---

## Quality gates

- `npm ci` em ambiente limpo.
- `npm run validate`.
- `npm run test:cov` com motor ≥ 80% e módulos novos adequadamente cobertos.
- `npm run e2e`.
- `npm audit --omit=dev` sem vulnerabilidade alta/crítica.
- `docker build`.
- smoke local do container.
- restart real com volume e recuperação da sala.
- CI externo verde no SHA candidato.
- smoke da URL permanente.

## Definição de Pronto da Sprint 6

- [x] M21 — ADR publicada.
- [x] B27 — backend incluído no typecheck/build raiz.
- [x] B23 — persistência aprovada.
- [x] B28 — retomada autenticada aprovada.
- [ ] B24 — hardening aprovado.
- [ ] B25 — observabilidade aprovada.
- [ ] B26 — container aprovado.
- [ ] Sala aguardando sobrevive a restart.
- [ ] Partida ativa sobrevive a restart e reconexão.
- [ ] `/live`, `/ready` e `/metrics` verificados.
- [ ] CORS/rate limit/validação runtime verificados.
- [ ] Container não-root e volume persistente verificados.
- [ ] URL HTTPS permanente comprovada.
- [ ] CI externo verde.
- [ ] Changelog/STATUS/feedback atualizados.
- [ ] `v0.5.0` tagged + pushed.

## Riscos e decisões de contingência

1. **Sem conta de deploy:** todo artefato local pode ficar pronto, mas B26 e a release permanecem bloqueadas até o proprietário vincular um provedor.
2. **Filesystem efêmero:** o serviço deve recusar configuração de produção que prometa persistência sem `ROOM_STORAGE_FILE` em volume documentado.
3. **Corrupção de snapshot:** fail-fast/readiness vermelha; nunca sobrescrever silenciosamente o arquivo inválido.
4. **Instância única:** duas réplicas não podem compartilhar o JSON. Migração para Postgres/Redis será uma ADR separada antes de escalar horizontalmente.
5. **Dormência de plano gratuito:** URL estável não equivale a always-on. O relatório final deve declarar cold start/SLA do plano escolhido.
