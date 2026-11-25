# Operação na VPS (ambiente de teste atual)

**Verificado em 2026-11-25** (atualizações do Kabemjunto até `c46a269`) e em 2026-11-21 (o restante), pelo terminal web da Hostinger, com leitura do estado, uma atualização real para a `main` (`ee4efe1`) a configuração da URL estável e do firewall da porta 3001 (seção 5) a hospedagem de mais três jogos na mesma VPS e a vitrine que reúne todos eles (seção 6). Este documento descreve o que existe hoje e como atualizar. Não é uma decisão de arquitetura: a hospedagem "oficial" documentada antes (Railway, ver o [README](../README.md#railway)) **não foi revalidada** e não é a que está no ar para testes.

> Não registre neste repositório o link do terminal web da Hostinger, o IP da VPS, tokens ou variáveis de ambiente do serviço. O link do terminal dá acesso de shell enquanto a sessão estiver aberta.

## 1. Onde o jogo roda

O jogo roda numa **VPS da Hostinger**, acessada pelo terminal web do hPanel. Ela é **compartilhada**: também hospeda n8n, WordPress, containers Docker, um agente Hermes e outros serviços que não pertencem ao Kabemjunto. Qualquer operação deve tocar só no que é do jogo (a unit do servidor, a do túnel legado, o arquivo `kabemjunto.yaml` do Traefik e as regras do firewall da 3001). Mais três jogos rodam na mesma VPS, descritos na seção 6.

| Item                | Valor observado                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL pública         | `https://kabemjunto.kabemmanager.online`, **estável** (registro DNS próprio e certificado Let's Encrypt renovado sozinho). Configurada em 2026-11-21 (seção 5)                                           |
| Código              | `/root/kabemjunto`, clone git do repositório (remoto `origin`)                                                                                                                                           |
| Servidor            | `kabemjunto.service` (systemd): `node apps/server/dist/server.js`, Fastify + Socket.IO, serve também o frontend (`apps/web/dist`) na mesma origem                                                        |
| Porta               | `3001`, escutando em `0.0.0.0`, mas **bloqueada para acesso externo** pelo firewall (seção 5). Só o loopback e as redes Docker chegam nela                                                               |
| Proxy e HTTPS       | Traefik do Easypanel (container `easypanel-traefik`), compartilhado com os outros serviços. A rota do jogo está no arquivo novo `/etc/easypanel/traefik/config/kabemjunto.yaml`                          |
| Túnel (legado)      | `kabemjunto-tunnel.service` (systemd): `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3001`, túnel rápido da Cloudflare, sem conta e sem nome. **Continua ativo**, mas não é mais necessário |
| Relação das units   | O túnel tem só `After=kabemjunto.service` (ordem de boot). **Não há** `BindsTo`, `Requires` nem `PartOf`: reiniciar o servidor não reinicia o túnel                                                      |
| Reinício automático | As duas units têm `Restart=always`                                                                                                                                                                       |
| Gerenciador         | systemd. O pm2 **não** é usado                                                                                                                                                                           |
| Usuário             | `root` (ambos os processos)                                                                                                                                                                              |

### O túnel rápido legado

- A URL antiga (`*.trycloudflare.com`, a mesma desde 2026-11-18) **continua funcionando** enquanto a unit do túnel estiver ativa, porque o `cloudflared` chega à 3001 pelo loopback, que o firewall permite. Ela é aleatória e **muda** se o `cloudflared` reiniciar; não a divulgue.
- Para desligar o túnel quando ninguém mais usar o link antigo: `systemctl disable --now kabemjunto-tunnel.service`. Só faça isso com o dono do projeto ciente, porque quem tem o link antigo deixa de acessar.
- O PWA instalado pelo endereço do túnel é outro "app" para o navegador: quem o instalou precisa reinstalar pelo endereço estável.
- **Configuração da unit `kabemjunto.service` (lida em 2026-11-21):** sem `User=` (roda como root), `WorkingDirectory=/root/kabemjunto`, `ExecStart=/usr/bin/node apps/server/dist/server.js`. Variáveis: `NODE_ENV=production`, `PORT=3001`, `HOST=0.0.0.0` e `ROOM_STORAGE_FILE=/var/lib/kabemjunto/rooms.json` (pasta `root:root`, modo 700). `METRICS_TOKEN` existe; o valor não é registrado aqui. `CORS_ORIGINS` lista duas origens exatas: o IP da VPS na porta 3001 (hoje inalcançável de fora) e o host do túnel rápido atual. **O domínio estável não está na lista.** Hoje isso não faz diferença, porque a página e o WebSocket vêm da mesma origem, mas uma chamada de outra origem seria barrada. Se isso passar a importar, acrescente o domínio e reinicie só o `kabemjunto.service`.
- **Variáveis opcionais** (ajuste só se precisar; sem elas valem os padrões): `QUICKPLAY_WAIT_MS` (10000), `TURN_LIMIT_MS` (30000), `DISCONNECT_GRACE_MS` (20000) e `REVANCHE_WAIT_MS` (15000). Para mudar, use um _drop-in_ (`systemctl edit kabemjunto.service`) e reinicie só esse serviço.
- **Salas sem ninguém:** em partida, são encerradas em 30 min e apagadas depois. Uma contagem de revanche em curso se perde no reinício.
- Ainda não verificado na VPS: se as salas gravadas em `rooms.json` sobrevivem a um reinício do serviço.

## 2. Como saber o que está no ar

Compare o build publicado com o esperado, sem depender do `git push`:

```bash
# na sua máquina, contra a URL pública (https://kabemjunto.kabemmanager.online)
curl -s https://kabemjunto.kabemmanager.online/ | grep -oE 'assets/index-[^"]*'     # nome do bundle principal
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://kabemjunto.kabemmanager.online/manifest.json
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://kabemjunto.kabemmanager.online/sw.js
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
cp -a /var/lib/kabemjunto/rooms.json "$B/" && chmod 700 "$B"   # contém mãos e hashes de token: só root lê

# 3. traga a main sem sobrescrever nada
git fetch origin
git merge --ff-only origin/main      # se falhar, pare: há divergência local

# 4. dependências e build; se falhar, NÃO reinicie (o serviço segue com o build antigo)
npm ci
npm run build

# 5. confirme que o túnel legado e o servidor são independentes (só leitura)
systemctl cat kabemjunto-tunnel.service | grep -E "BindsTo|Requires|PartOf" || echo "independentes"

# 6. reinicie SÓ o servidor. Nunca outros serviços da VPS (o Traefik e o Docker são compartilhados)
systemctl restart kabemjunto.service

# 7. valide
for p in /health /manifest.json /sw.js; do
  curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" http://127.0.0.1:3001$p
done
systemctl is-active kabemjunto.service
for p in /health /manifest.json /sw.js; do
  curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" https://kabemjunto.kabemmanager.online$p
done
```

Esperado: `/health` e `/manifest.json` em JSON, `/sw.js` em JavaScript (nos dois endereços, o local e o público) e a unit do servidor `active`. A URL pública não depende do túnel nem muda com a atualização.

Observações das atualizações de 2026-11-25:

- O clone agora está na branch `main`. Backups: `/root/kabemjunto-backup-20261125-1535` (build de antes do "Jogar agora"), `-1924` (antes do PR #38) e `-1955` (antes do confete); os dois últimos incluem `rooms.json`.
- **Antes de reiniciar, veja se há partidas:** compare `stat -c %y /var/lib/kabemjunto/rooms.json` com `date`. O arquivo muda a cada jogada.
- O reinício de 2026-11-25 deixou o link em **502 por 2 a 3 minutos**.
- **Mudança só em `apps/web` entra no ar com o build, sem reiniciar** (confirmado). Durante o build os arquivos antigos são trocados; quem estiver abrindo o jogo nesses segundos pode precisar recarregar. Mudança em `apps/server` ou `packages/shared` exige reinício.
- Quem já tem o jogo aberto ou instalado só vê a versão nova depois de fechar todas as janelas. Servidor e interface do PR #38 precisam ir juntos.
- O terminal web abre em aba nova e expira; é preciso clicar nele antes de digitar.

Observações da atualização de 2026-11-21:

- Naquela data, o `restart` do servidor demorou além de um minuto para voltar (o processo antigo não encerra na hora). Durante esse intervalo o link público responde **502** (do Traefik ou do túnel); isso é esperado e passa sozinho.
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

| Ponto                                                                     | Situação                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Porta `3001`                                                              | **Resolvido em 2026-11-21.** Bloqueada para acesso externo (seção 5). De fora da VPS, `http://<IP-DA-VPS>:3001/health` agora dá timeout. Há uma janela de poucos segundos a cada boot, antes da unit do firewall rodar                          |
| Serviços como `root`                                                      | Os processos do Kabemjunto rodam como root numa VPS compartilhada. O Dockerfile do projeto usa usuário sem privilégio; a VPS não. Os jogos da seção 6 rodam como o usuário `jogos`, sem privilégios.                                            |
| Origem do WebSocket                                                       | O Kabemjunto aceita conexões Socket.IO de qualquer origem (confirmado de novo pelo domínio estável em 2026-11-21), e o servidor do Esconde ou Morre também aceita qualquer `Origin` (confirmado com um `Origin` inventado). Item aberto no GDD. |
| Túnel rápido legado                                                       | Ainda ativo; a URL antiga continua válida até desligá-lo (seção 1). A URL oficial é a estável.                                                                                                                                                  |
| Limite de reinício das units                                              | `StartLimitIntervalSec=0` está na seção `[Service]`, onde o systemd ignora a chave. Vale o limite padrão: após 5 falhas em 10 s o serviço deixa de reiniciar sozinho. **Não corrigido.**                                                        |
| Alertas do `npm ci` (9 vulnerabilidades: 3 críticas, 1 alta, 5 moderadas) | **Todas em ferramentas de desenvolvimento** (`vitest`, `vite`, `esbuild`, `tinypool`, `glob`, entre outras). `npm audit --omit=dev`, o que o CI exige, retorna **0**. Nada disso roda em produção.                                              |
| Outros serviços da VPS                                                    | Fora do escopo do jogo e **não tocados**: Postgres (5432) e Redis (6379 e 3010) publicados em `0.0.0.0` sem firewall; `panel.kabemmanager.online` com certificado autoassinado e uma regra `Host()` malformada no Traefik.                      |
| Railway                                                                   | A publicação anterior (`web-production-52c52.up.railway.app`) estava fora do ar em 2026-11-18, causa não confirmada, e não foi revalidada.                                                                                                      |
| `CORS_ORIGINS` do Kabemjunto                                              | Não inclui o domínio estável e ainda cita o IP e o túnel antigos (seção 1). Sem efeito enquanto tudo for da mesma origem.                                                                                                                       |
| Permissão do `/root`                                                      | Está em `755`. O usuário `jogos` consegue listar o conteúdo, mas não ler arquivos protegidos (como `.bash_history`). O normal é `700`. **Não alterado**: confirme antes que nenhum serviço de outro usuário depende disso.                      |
| Clone do Kabemjunto                                                       | **Resolvido em 2026-11-25.** Está na branch `main`.                                                                                                                                                                                             |

## 5. URL estável, Traefik e firewall

Configurados em 2026-11-21, com autorização do dono do projeto. O objetivo era trocar o túnel rápido (URL instável) por um endereço fixo com HTTPS, usando o que a VPS já tinha.

- **DNS:** registro `A` `kabemjunto` em `kabemmanager.online`, TTL 300, apontando para o IP da VPS. Foi criado no editor de zona DNS do hPanel (os nameservers do domínio são os da Hostinger, `dns-parking.com`). O domínio raiz aponta para outro serviço; só o subdomínio vale para o jogo.
- **Traefik:** arquivo **novo** `/etc/easypanel/traefik/config/kabemjunto.yaml`, no padrão do `fendas.yaml` existente: routers `kabemjunto-http` e `kabemjunto-https`, service `kabemjunto` apontando para `http://172.18.0.1:3001` (a ponte Docker do host) e reaproveitando o middleware `redirect-to-https`. O Traefik recarrega o arquivo sozinho. Ele é compartilhado: **nunca edite arquivos existentes ali**, e crie nomes com o prefixo `kabemjunto-`.
- **Certificado:** Let's Encrypt, emitido pelo Traefik na primeira requisição (levou cerca de 10 segundos; validade até 2027-02-19) e renovado sozinho.
- **Firewall da 3001:** três regras na cadeia `INPUT` do iptables (só IPv4), com o comentário `kabemjunto-3001`: aceitar origem `127.0.0.0/8` (o `cloudflared` legado), aceitar `172.16.0.0/12` (as redes Docker, por onde o Traefik entra) e descartar o resto de `tcp/3001`. O script `/usr/local/sbin/kabemjunto-fw.sh` as aplica de forma idempotente e a unit `kabemjunto-fw.service` (oneshot, depois do `docker.service`) as reaplica a cada boot. O ufw segue **inativo** e a política padrão da `INPUT` continua `ACCEPT`: nada além da 3001 foi bloqueado. O IPv6 ficou sem regra porque o servidor só escuta em IPv4.

Validação feita de fora em 2026-11-21: `https://kabemjunto.kabemmanager.online` com `/health`, `/manifest.json` e `/sw.js` corretos, handshake do Socket.IO com upgrade para WebSocket, PWA offline e uma partida de dois jogadores; a 3001 pelo IP público deu timeout; `kabemshop.com.br` e `jogo.kabemmanager.online` seguiram em 200.

### Desfazer

```bash
# só o firewall da 3001
/usr/local/sbin/kabemjunto-fw.sh remove            # tira as 3 regras agora
systemctl disable --now kabemjunto-fw.service      # tira as regras e impede que voltem no boot

# só a rota do Traefik (o jogo deixa de ter o endereço estável)
rm /etc/easypanel/traefik/config/kabemjunto.yaml
```

O backup das regras de antes do firewall está em `/root/kabemjunto-iptables-antes-20261121.rules` (e o equivalente do `ip6tables`). **Não** use `iptables-restore` com ele: restauraria também as cadeias do Docker e causaria problemas. Para remover o registro DNS, apague o `A` `kabemjunto` no editor de zona do hPanel.

## 6. Outros jogos hospedados nesta VPS

Desde 2026-11-21 a VPS serve mais três jogos, além do Kabemjunto, e a **vitrine** que reúne todos eles (item 6.6). Todos usam a mesma infraestrutura (usuário, nginx, rotas e firewall) descrita abaixo. Cada repositório tem um documento próprio, curto, com o que é específico do jogo.

### 6.1 Mapa

| Jogo                  | Endereço                                 | Repositório                       | Código na VPS                        | Como é servido                                    | Atualização                                                |
| --------------------- | ---------------------------------------- | --------------------------------- | ------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| Kabemjunto            | `https://kabemjunto.kabemmanager.online` | `Alexandremocmg/kabemjunto`       | `/root/kabemjunto`                   | Node (`kabemjunto.service`, porta 3001)           | manual, seção 3                                            |
| Raízes Cruzadas       | `https://raizes.kabemmanager.online`     | `Alexandremocmg/raizes-cruzadas`  | `/srv/jogos/raizes`                  | nginx dos jogos                                   | `git pull`                                                 |
| Corrida Sem Fim       | `https://corrida.kabemmanager.online`    | `Alexandremocmg/game`             | `/srv/jogos/corrida` (serve `dist/`) | nginx dos jogos                                   | `git pull` e build                                         |
| Esconde ou Morre      | `https://esconde.kabemmanager.online`    | `Alexandremocmg/esconde-ou-morre` | `/srv/jogos/esconde-ou-morre`        | nginx dos jogos e servidor WebSocket (porta 8787) | `git pull`; reinício só se `server/` ou `src/net/` mudarem |
| Vitrine (Kabem Jogos) | `https://jogos.kabemmanager.online`      | `Alexandremocmg/kabem-jogos`      | `/srv/jogos/vitrine`                 | nginx dos jogos                                   | `git pull`, sem build                                      |

Documentos de cada jogo: [Raízes Cruzadas](https://github.com/Alexandremocmg/raizes-cruzadas/blob/main/docs/hospedagem-vps.md), [Corrida Sem Fim](https://github.com/Alexandremocmg/game/blob/main/docs/hospedagem-vps.md) e [Esconde ou Morre](https://github.com/Alexandremocmg/esconde-ou-morre/blob/main/docs/HOSPEDAGEM_VPS.md) e [Vitrine](https://github.com/Alexandremocmg/kabem-jogos/blob/main/README.md).

O **Circuito das Fendas** (`jogo.kabemmanager.online`) já existia antes e fica fora deste documento: roda como o usuário `fendas`, na porta 3200, e tem rota própria em `/etc/easypanel/traefik/config/fendas.yaml`.

Portas em uso pelos jogos: `3001` (Kabemjunto), `8081` (nginx dos jogos), `8787` (WebSocket do Esconde ou Morre) e `3200` (Fendas). Nenhuma delas é pública: o nginx escuta só em `172.18.0.1`, e a 3001 e a 8787 são bloqueadas por firewall (item 6.2).

### 6.2 Infraestrutura compartilhada

- **Usuário `jogos`:** usuário de sistema, sem shell e sem privilégios (o `sudo` pede senha). Faz os clones e os builds em `/srv/jogos/<jogo>`. **Nunca rode `npm` como root** nesses diretórios.
- **nginx próprio dos jogos:** usa o binário do nginx já instalado (1.24), mas com configuração só nossa. O nginx do sistema segue **inativo e desabilitado**, e o vhost antigo do `ollama` não foi tocado.
  - Unit `jogos-static.service`: `User=jogos`, `ExecStart=/usr/sbin/nginx -g "daemon off;" -c /etc/jogos-static/nginx.conf -e /var/log/jogos-static/error.log`, `After=docker.service network-online.target`, `Restart=on-failure` (`RestartSec=5`). Endurecimento: `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`, `ReadOnlyPaths=/srv/jogos /etc/jogos-static`, `ProtectKernelTunables` e `ProtectControlGroups`.
  - Escuta só em **`172.18.0.1:8081`** (a ponte Docker por onde o Traefik entra), nunca em `0.0.0.0`. Um `default_server` devolve `444` (fecha a conexão) para qualquer host desconhecido ou acesso direto por IP.
  - Um `server` por jogo, escolhido pelo cabeçalho `Host` (o Traefik repassa o original): `raizes.` serve `/srv/jogos/raizes`, `corrida.` serve `/srv/jogos/corrida/dist` `esconde.` serve `/srv/jogos/esconde-ou-morre` e `jogos.` (a vitrine) serve `/srv/jogos/vitrine`.
  - **Cache:** em `raizes.` e `esconde.`, `no-cache` (revalida por ETag) para html, htm, js, mjs, css, json e webmanifest e para URLs terminadas em `/`; os demais tipos ficam sem `Cache-Control`. Em `corrida.`, `no-cache` em tudo, exceto `/assets/` (arquivos com hash do Vite), que recebe `public, max-age=31536000, immutable`.
  - **Negados (404):** qualquer caminho com `/.` nos três jogos (`.git` e afins) e, no Esconde ou Morre, também `/server`, `/node_modules`, `/scripts` e `/.claude`. Só `GET` e `HEAD` passam; os outros métodos recebem `403`. Há gzip, ETag e `X-Content-Type-Options: nosniff`, e os tipos MIME de `glb`, `gltf`, `wasm` e `mjs` estão corretos.
  - Consumo medido: cerca de 12 MB de memória somando os processos (o cgroup marca perto de 3 MB).
  - **Vitrine (`jogos.`):** `no-cache` para html, xml, txt e json, e `Cache-Control: public, max-age=86400` em `/img/`. Nega também `/tools`, `/build.mjs` e `/package.json`. O `README.md` é servido (como download, `application/octet-stream`); o repositório é público, então não há nada novo exposto.
  - **Log de acesso da vitrine:** `/var/log/jogos-static/access.log`, formato `combined`, com rotação semanal em `/etc/logrotate.d/jogos-static` (8 rotações, `compress`, `copytruncate`, `su jogos jogos`). O endereço de origem que aparece é o do **Traefik** (`172.18.0.x`), não o do visitante: use o `Referer`, o `User-Agent` e a contagem por caminho para medir visitas e de onde elas vêm. Para registrar o IP real seria preciso ligar o módulo `realip` neste host, o que não foi feito.
- **Traefik:** uma rota por jogo, em **arquivo novo** `/etc/easypanel/traefik/config/jogos-<jogo>.yaml`, no padrão do `fendas.yaml`. Nomes de router e service com o prefixo `jogos-`. O Traefik recarrega esses arquivos sozinho, sem reinício, e emite o certificado Let's Encrypt na primeira requisição (cerca de 10 segundos). Exemplo, o da Corrida Sem Fim:

  ```yaml
  http:
    routers:
      jogos-corrida-http:
        rule: Host(`corrida.kabemmanager.online`)
        entryPoints: [http]
        middlewares: [redirect-to-https]
        service: jogos-corrida
      jogos-corrida-https:
        rule: Host(`corrida.kabemmanager.online`)
        entryPoints: [https]
        tls:
          certResolver: letsencrypt
        service: jogos-corrida
    services:
      jogos-corrida:
        loadBalancer:
          passHostHeader: true
          servers:
            - url: http://172.18.0.1:8081
  ```

  O `jogos-esconde.yaml` tem **dois** routers para o mesmo host: um para o nginx (`http://172.18.0.1:8081`) e outro, com prioridade maior, para o caminho `/ws` (regra `PathPrefix`), que aponta para o servidor do jogo em `http://172.18.0.1:8787`. O Traefik repassa o upgrade de WebSocket sozinho, e o caminho `/ws` chega inteiro, com a query (`?room=`).

- **Servidor do Esconde ou Morre:** `esconde-ou-morre-server.service`, `User=jogos`, `WorkingDirectory=/srv/jogos/esconde-ou-morre/server`, `ExecStart=/usr/bin/node index.js`, `Environment=PORT=8787` (a única), `MemoryMax=300M`, `Restart=always`, `RestartSec=3`. Endurecimento: `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`, `ReadOnlyPaths=/srv/jogos/esconde-ou-morre`, `ProtectKernelTunables` e `ProtectControlGroups`. O servidor `ws` escuta em todas as interfaces e não tem opção de host, por isso depende do firewall.
- **Firewall:** `kabemjunto-fw.service` (`oneshot`, `RemainAfterExit`, no boot, depois do `docker.service`) executa `/usr/local/sbin/kabemjunto-fw.sh apply`, e `ExecStop` executa `remove`. O script aplica, de forma idempotente, regras na `INPUT` do iptables com um comentário por porta:
  - `tcp/3001` (IPv4, comentário `kabemjunto-3001`): aceita `127.0.0.0/8` e `172.16.0.0/12`, descarta o resto.
  - `tcp/8787` (IPv4, `jogos-8787`): aceita `127.0.0.0/8` e `172.16.0.0/12`, descarta o resto.
  - `tcp/8787` (IPv6, `jogos-8787`): aceita `::1/128`, descarta o resto. Não há regra IPv6 para a 3001.
  - Ao todo são 8 regras na `INPUT`. O ufw continua inativo, a política padrão segue `ACCEPT` e as cadeias do Docker não são tocadas. A descrição da unit ainda diz só "tcp/3001", embora o script cubra a 8787 também.
- **DNS:** um registro `A` por jogo no editor de zona do hPanel (`kabemmanager.online`), apontando para o IP da VPS, com TTL 300: `kabemjunto`, `raizes`, `corrida`, `esconde` e `jogos`.
- **Versões:** Node 22.22.0, npm 10.9.4, nginx 1.24.0, git 2.43.0 e Traefik 3.6.7 (no container do Easypanel).

### 6.3 Atualizar cada jogo

Nada atualiza sozinho: um `git push` ou o merge de um PR não muda o que está no ar. Como `root` no terminal da VPS:

```bash
J="runuser -u jogos -- env HOME=/srv/jogos"

# Raízes Cruzadas: só arquivos estáticos
$J git -C /srv/jogos/raizes pull --ff-only

# Corrida Sem Fim: Vite; o build recria a pasta dist (veja o aviso abaixo)
$J git -C /srv/jogos/corrida pull --ff-only
cd /srv/jogos/corrida
$J npm_config_cache=/srv/jogos/.npm npm ci
$J npm_config_cache=/srv/jogos/.npm npm run build

# Vitrine: só arquivos estáticos (o index.html já vem pronto no repositório)
$J git -C /srv/jogos/vitrine pull --ff-only

# Esconde ou Morre: cliente estático e servidor WebSocket
$J git -C /srv/jogos/esconde-ou-morre pull --ff-only
# só se server/package-lock.json mudou:
$J npm --prefix /srv/jogos/esconde-ou-morre/server ci --omit=dev
# reinicie o servidor somente se algo em server/ ou src/net/ mudou:
git -C /srv/jogos/esconde-ou-morre diff --name-only ORIG_HEAD HEAD | grep -E '^(server|src/net)/' \
  && systemctl restart esconde-ou-morre-server.service
```

- **Corrida Sem Fim:** o Vite esvazia `dist/` no início do build, então o site fica fora do ar durante o build (em torno de um minuto) e, se o build falhar, fica sem arquivos até um novo build. Antes de atualizar, confirme que ninguém está jogando.
- **Esconde ou Morre:** reiniciar o servidor derruba as salas em andamento, que ficam só em memória. Os clientes tentam reconectar, mas a partida em curso se perde.
- O cliente estático dos três jogos atualiza sozinho no navegador (`no-cache` com ETag), exceto os arquivos com hash do Corrida, que mudam de nome.
- Validação rápida, de qualquer máquina:

  ```bash
  for h in raizes corrida esconde jogos; do
    curl -s -o /dev/null -w "$h %{http_code} %{content_type}\n" https://$h.kabemmanager.online/
  done
  curl -s -o /dev/null -w "esconde .git %{http_code}\n" https://esconde.kabemmanager.online/.git/config   # esperado 404
  ```

  Para o WebSocket do Esconde ou Morre, abra `wss://esconde.kabemmanager.online/ws`: o servidor responde com uma mensagem `welcome`.

### 6.4 Adicionar mais um jogo estático

1. No hPanel, crie o registro `A` do subdomínio (TTL 300) para o IP da VPS.
2. Como `jogos`, clone o repositório em `/srv/jogos/<nome>` (só repositórios públicos, ou com uma chave de leitura própria; **nunca** coloque um token na VPS sem decidir antes como guardá-lo). Se houver build, rode-o como `jogos`.
3. Em `/etc/jogos-static/nginx.conf`, copie um `server` existente, troque `server_name` e `root`, valide e recarregue **só** essa unit: `runuser -u jogos -- /usr/sbin/nginx -t -c /etc/jogos-static/nginx.conf -e /var/log/jogos-static/error.log && systemctl reload jogos-static`. Faça uma cópia de segurança do arquivo antes.
4. Crie `/etc/easypanel/traefik/config/jogos-<nome>.yaml` (modelo no item 6.2), com nomes prefixados por `jogos-`. Valide o YAML e instale com `mv` a partir de um arquivo temporário no mesmo diretório. **Nunca edite arquivos existentes** do Traefik.
5. Depois de instalar, acompanhe o log do Traefik. Hoje ele registra um erro antigo e conhecido do roteador do painel (uma regra `Host` malformada, com `HTTPS://` dentro do domínio, que gera `rejectedIdentifier`), que não vem das rotas dos jogos; qualquer erro novo, ou qualquer outro site mudando de status, é motivo para remover o arquivo recém-criado.
6. Teste de fora: certificado, `/`, um arquivo `.js`, `/.git/config` (404) e `http://<IP>:8081` (deve falhar). Atualize este documento.

Se o jogo tiver **servidor próprio**, siga o modelo do Esconde ou Morre: unit com usuário sem privilégios e endurecimento, porta escolhida, regra de firewall (aceita `127.0.0.0/8` e `172.16.0.0/12`, descarta o resto, v4 e v6), e rota no Traefik para a porta, nunca publicando a porta diretamente.

### 6.5 Desfazer

```bash
# tirar um jogo do ar (o Traefik descarrega o arquivo sozinho, sem reinício)
rm /etc/easypanel/traefik/config/jogos-<jogo>.yaml

# voltar o código de um jogo a uma versão anterior
J="runuser -u jogos -- env HOME=/srv/jogos"
$J git -C /srv/jogos/<pasta> log --oneline -5
$J git -C /srv/jogos/<pasta> checkout --detach <sha>      # e, na Corrida, refaça o build; depois: git switch main

# tirar o Esconde ou Morre por completo (nesta ordem)
rm -f /etc/easypanel/traefik/config/jogos-esconde.yaml
systemctl disable --now esconde-ou-morre-server.service
rm -f /etc/systemd/system/esconde-ou-morre-server.service && systemctl daemon-reload
/usr/local/sbin/kabemjunto-fw.sh remove 8787              # só depois de parar o servidor

# tirar só a vitrine
rm -f /etc/easypanel/traefik/config/jogos-vitrine.yaml
cp /root/jogos-static-nginx.conf.antes-vitrine /etc/jogos-static/nginx.conf       # só se nada mais foi alterado no nginx depois
runuser -u jogos -- /usr/sbin/nginx -t -c /etc/jogos-static/nginx.conf -e /var/log/jogos-static/error.log && systemctl reload jogos-static
rm -f /etc/logrotate.d/jogos-static
rm -rf /srv/jogos/vitrine

# desfazer toda a infraestrutura dos jogos estáticos
systemctl disable --now jogos-static.service
rm -f /etc/systemd/system/jogos-static.service && systemctl daemon-reload
rm -rf /etc/jogos-static /srv/jogos /var/log/jogos-static
userdel jogos        # se reclamar do grupo: groupdel jogos
rm -f /etc/easypanel/traefik/config/jogos-*.yaml
rm -f /etc/logrotate.d/jogos-static
```

Para remover o registro DNS de um jogo, apague o `A` correspondente no editor de zona do hPanel.

Cópias de segurança feitas em 2026-11-21, fora de qualquer repositório: `/root/kabemjunto-iptables-antes-20261121.rules`, as de `/root/*antes-20261121-8787.rules`, `/root/jogos-static-nginx.conf.antes-esconde` `/root/kabemjunto-fw.sh.antes-8787` e `/root/jogos-static-nginx.conf.antes-vitrine` (antes de acrescentar a vitrine). **Não** use `iptables-restore` com elas: restauraria também as cadeias do Docker e causaria problemas; use os comandos acima. A ordem importa: as regras da 8787 só saem depois de o servidor ser parado.

### 6.6 A vitrine (Kabem Jogos)

**https://jogos.kabemmanager.online** é a porta de entrada dos jogos: uma página que mostra cada jogo com uma imagem de partida, uma descrição e um botão **Jogar** que leva direto ao jogo, pensada para ser encontrada em buscas e compartilhada no celular. O código está em [`Alexandremocmg/kabem-jogos`](https://github.com/Alexandremocmg/kabem-jogos) (público) e roda como um jogo estático qualquer da seção 6.2: clone em `/srv/jogos/vitrine`, um `server` no nginx dos jogos e a rota `jogos-vitrine.yaml` no Traefik (routers `jogos-vitrine-http` e `jogos-vitrine-https`).

- **Como é feita:** o `index.html` é **gerado** por `build.mjs` a partir do `games.json` e vai commitado, então a VPS só precisa do `git pull`. Para adicionar ou mudar um jogo, edite o `games.json`, gere as imagens e rode `node build.mjs`; o passo a passo está no README do repositório.
- **Para a busca e o compartilhamento:** título, descrição, `canonical`, Open Graph, Twitter Card, dados estruturados do schema.org (um `VideoGame` por jogo), `sitemap.xml` e `robots.txt`. **Ainda não foi feito:** cadastrar o endereço no Google Search Console e no Bing Webmaster Tools e enviar o `sitemap.xml`.
- **Sem cookies e sem rastreadores.** A medição é pelo log de acesso do nginx (item 6.2).
- **Verificado em 2026-11-21, de fora:** `/` (200, `text/html`), `/sitemap.xml`, `/robots.txt`, `/img/og.jpg` e `/img/*.webp` com os tipos e o cache certos; `/.git/config`, `/tools/` e `/build.mjs` devolvem 404; o HTTP redireciona para HTTPS; o HTML publicado é idêntico ao do repositório. Em Chromium, em formato de desktop e de celular, a página carrega sem erro de console e sem rolagem horizontal, e o botão **Jogar** de cada um dos seis jogos abre o jogo certo. **Não** foi testado: a prévia ao compartilhar no WhatsApp e nas redes, o Safari e o Firefox.
- **Catálogo em 2026-11-25 (`f0b0c2f`):** Metro Dash, Casa 64, Kabemjunto, Turbo Maré, Corrida Sem Fim, Circuito das Fendas (Beta), Esconde ou Morre (Protótipo) e Raízes Cruzadas. Metro Dash e Casa 64 ficam em `/jogos/` da própria vitrine, e o Turbo Maré também ganhou uma página lá. A verificação de 2026-11-21 é anterior a Metro Dash e Casa 64, que **não foram testados nem revisados** para este documento.
- **Jogos que a vitrine lista e esta VPS não serve pelo nginx dos jogos:** o **Turbo Maré** (`https://alexandremocmg.github.io/turbo_mare/`, repositório `Alexandremocmg/turbo_mare`) continua no **GitHub Pages**, e o **Circuito das Fendas** tem rota própria (`jogo.`). O Turbo Maré é um único HTML de 6,4 MB, então a CDN do Pages serve melhor que a VPS. A **sala online** dele usa um serviço público de terceiros (`wss://itty.ws`); se esse serviço cair, a sala para de funcionar, e isso não depende de onde o jogo esteja hospedado. Verificado em 2026-11-21: carrega em cerca de 8 segundos sem erro de console, a corrida começa e criar uma sala gera o link de convite e conecta no serviço. **Não** foi testada uma sala com dois jogadores.
- **Atenção ao nome:** existem `jogo.` (o Circuito das Fendas) e `jogos.` (a vitrine), que são fáceis de confundir.

Ver também: [README, Docker e operação](../README.md#docker-e-operação), a regra de publicação no Railway no [STATUS](../STATUS.md) e a seção 13 do [GDD](../GDD-Kabemjunto.md).
