# Operação na VPS (ambiente de teste atual)

**Verificado em 2026-11-21**, pelo terminal web da Hostinger, com leitura do estado e uma atualização real para a `main` (`ee4efe1`). Este documento descreve o que existe hoje e como atualizar. Não é uma decisão de arquitetura: a hospedagem "oficial" documentada antes (Railway, ver o [README](../README.md#railway)) **não foi revalidada** e não é a que está no ar para testes.

> Não registre neste repositório o link do terminal web da Hostinger, o IP da VPS, tokens ou variáveis de ambiente do serviço. O link do terminal dá acesso de shell enquanto a sessão estiver aberta.

## 1. Onde o jogo roda

O jogo roda numa **VPS da Hostinger**, acessada pelo terminal web do hPanel. Ela é **compartilhada**: também hospeda n8n, containers Docker, um agente Hermes e outros serviços Node que não pertencem ao Kabemjunto. Qualquer operação deve tocar só nas duas units abaixo.

| Item                | Valor observado                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código              | `/root/kabemjunto`, clone git do repositório (remoto `origin`)                                                                                                                                 |
| Servidor            | `kabemjunto.service` (systemd): `node apps/server/dist/server.js`, Fastify + Socket.IO, serve também o frontend (`apps/web/dist`) na mesma origem                                              |
| Porta               | `3001`, escutando em `0.0.0.0` (todas as interfaces)                                                                                                                                           |
| Túnel               | `kabemjunto-tunnel.service` (systemd): `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3001`, túnel rápido da Cloudflare, sem conta e sem nome                                      |
| Relação das units   | O túnel tem só `After=kabemjunto.service` (ordem de boot). **Não há** `BindsTo`, `Requires` nem `PartOf`: reiniciar o servidor não reinicia o túnel                                            |
| Reinício automático | As duas units têm `Restart=always`                                                                                                                                                             |
| Gerenciador         | systemd. O pm2 **não** é usado                                                                                                                                                                 |
| Usuário             | `root` (ambos os processos)                                                                                                                                                                    |
| URL pública         | `https://instruments-operates-develop-measurements.trycloudflare.com` (mesma desde 2026-11-18, quando o túnel subiu). Para ler a URL atual, veja o journal da unit do túnel (seção 3, passo 7) |

### Limites da URL

- É um **túnel rápido**: a URL é aleatória e **muda** se o `cloudflared` reiniciar (queda do processo, `restart` da unit do túnel ou reboot da VPS). Com `Restart=always`, qualquer queda gera um endereço novo. Quem tem o link antigo deixa de acessar.
- Para uma URL estável é preciso um **túnel nomeado** ou um domínio próprio. Isso muda a configuração da VPS e ainda não foi feito.
- O que ainda não foi verificado: variáveis de ambiente da unit (`NODE_ENV`, `CORS_ORIGINS`, `METRICS_TOKEN`, `ROOM_STORAGE_FILE`), regras de firewall da VPS e persistência das salas entre reinícios.

## 2. Como saber o que está no ar

Compare o build publicado com o esperado, sem depender do `git push`:

```bash
# na sua máquina, contra a URL pública
curl -s https://<URL-DO-TUNEL>/ | grep -oE 'assets/index-[^"]*'     # nome do bundle principal
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<URL-DO-TUNEL>/manifest.json
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://<URL-DO-TUNEL>/sw.js
```

Um build **sem** o PWA devolve o HTML da página inicial (`text/html`) para `/manifest.json` e `/sw.js`. Foi exatamente assim que a VPS ficou até 2026-11-21: o build era de 2026-11-18, anterior ao PWA, ao menu novo e à mesa 3D. Um `git push` ou o merge de um PR **não atualiza** a VPS.

## 3. Como atualizar o jogo

Cada atualização é manual, no terminal da VPS, **sempre na pasta do projeto**. Antes de começar, confirme que ninguém está no meio de uma partida: o reinício derruba as conexões.

```bash
cd /root/kabemjunto

# 1. estado inicial: só arquivos não rastreados (ex.: tmp/) são esperados
git status --short
git rev-parse --short HEAD            # anote: é o ponto de volta do código

# 2. backup do build atual, fora do repositório (um subdiretório por pacote)
B=/root/kabemjunto-backup-$(date +%Y%m%d-%H%M)
mkdir -p "$B/web" "$B/server" "$B/shared"
cp -a apps/web/dist "$B/web/"
cp -a apps/server/dist "$B/server/"
cp -a packages/shared/dist "$B/shared/"

# 3. traga a main sem sobrescrever nada
git fetch origin
git merge --ff-only origin/main      # se falhar, pare: há divergência local

# 4. dependências e build; se falhar, NÃO reinicie (o serviço segue com o build antigo)
npm ci
npm run build

# 5. confirme que túnel e servidor são independentes (só leitura)
systemctl cat kabemjunto-tunnel.service | grep -E "BindsTo|Requires|PartOf" || echo "independentes"

# 6. reinicie SÓ o servidor. Nunca o túnel (a URL mudaria) nem outros serviços
systemctl restart kabemjunto.service

# 7. valide
for p in /health /manifest.json /sw.js; do
  curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" http://127.0.0.1:3001$p
done
systemctl is-active kabemjunto.service kabemjunto-tunnel.service
journalctl -u kabemjunto-tunnel.service --no-pager | grep -oE "https://[a-z-]+\.trycloudflare\.com" | sort | uniq -c
```

Esperado: `/health` e `/manifest.json` em JSON, `/sw.js` em JavaScript, as duas units `active` e **uma única** URL no journal do túnel, igual à anterior.

Observações da atualização de 2026-11-21:

- O `restart` do servidor demorou além de um minuto para voltar (o processo antigo não encerra na hora). Durante esse intervalo o link público responde **502**; isso é esperado e passa sozinho.
- A branch local da VPS estava em `feat/mesa-3d` (commit `9a6dccd`). O `--ff-only` a avançou para a `main`. O ideal é deixar o clone na branch `main` (`git switch main`) para não depender de um nome de branch antigo.
- O build sai do `npm ci` com dependências de desenvolvimento instaladas (necessárias para compilar).

### Validação depois de atualizar

Pelo link público, em um navegador limpo: o menu abre; a instalação do PWA é oferecida; com a rede desligada o menu e a mesa 3D contra bots continuam abrindo; com a rede de volta, "Criar sala" e "Entrar" liberam e uma partida de dois jogadores funciona. Em 2026-11-21 isso foi conferido com Playwright em Chromium (manifest com 3 ícones, `sw.js` ativo, aviso "Sem internet", mesa 3D offline e uma jogada online por WebSocket). **Não** foram testados celular físico, Safari nem Firefox, nem a atualização do service worker entre duas versões reais.

### Voltar atrás

O service worker só troca de versão quando as janelas antigas fecham, então um rollback também precisa de um ciclo de recarga nos navegadores.

```bash
cd /root/kabemjunto
rm -rf apps/web/dist apps/server/dist packages/shared/dist
cp -a /root/kabemjunto-backup-<DATA>/web/dist apps/web/
cp -a /root/kabemjunto-backup-<DATA>/server/dist apps/server/
cp -a /root/kabemjunto-backup-<DATA>/shared/dist packages/shared/
systemctl restart kabemjunto.service
```

O backup de 2026-11-21 está em `/root/kabemjunto-backup-pre-pwa/` (a cópia do build de 2026-11-18, mais o `build.log` da atualização). O código anterior era o commit `9a6dccd`.

## 4. Pontos de atenção

| Ponto                                                                     | Situação                                                                                                                                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Porta `3001` em `0.0.0.0`                                                 | Se o firewall não bloqueia a porta, o jogo fica acessível pelo IP da VPS sem passar pelo túnel. **Não verificado.**                                                                                |
| Serviços como `root`                                                      | Os dois processos rodam como root numa VPS compartilhada. O Dockerfile do projeto usa usuário sem privilégio; a VPS não.                                                                           |
| Origem do WebSocket                                                       | O servidor aceita conexões Socket.IO de qualquer origem (confirmado de novo pelo link público em 2026-11-21). Item aberto no GDD.                                                                  |
| Túnel rápido                                                              | URL instável (seção 1).                                                                                                                                                                            |
| Alertas do `npm ci` (9 vulnerabilidades: 3 críticas, 1 alta, 5 moderadas) | **Todas em ferramentas de desenvolvimento** (`vitest`, `vite`, `esbuild`, `tinypool`, `glob`, entre outras). `npm audit --omit=dev`, o que o CI exige, retorna **0**. Nada disso roda em produção. |
| Railway                                                                   | A publicação anterior (`web-production-52c52.up.railway.app`) estava fora do ar em 2026-11-18, causa não confirmada, e não foi revalidada.                                                         |

Ver também: [README, Docker e operação](../README.md#docker-e-operação), a regra de publicação no Railway no [STATUS](../STATUS.md) e a seção 13 do [GDD](../GDD-Kabemjunto.md).
