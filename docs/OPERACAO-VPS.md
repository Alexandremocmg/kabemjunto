# Operação na VPS (ambiente de teste atual)

**Verificado em 2026-11-21**, pelo terminal web da Hostinger, com leitura do estado, uma atualização real para a `main` (`ee4efe1`) e, depois, a configuração da URL estável e do firewall da porta 3001 (seção 5). Este documento descreve o que existe hoje e como atualizar. Não é uma decisão de arquitetura: a hospedagem "oficial" documentada antes (Railway, ver o [README](../README.md#railway)) **não foi revalidada** e não é a que está no ar para testes.

> Não registre neste repositório o link do terminal web da Hostinger, o IP da VPS, tokens ou variáveis de ambiente do serviço. O link do terminal dá acesso de shell enquanto a sessão estiver aberta.

## 1. Onde o jogo roda

O jogo roda numa **VPS da Hostinger**, acessada pelo terminal web do hPanel. Ela é **compartilhada**: também hospeda n8n, WordPress, containers Docker, um agente Hermes e outros serviços que não pertencem ao Kabemjunto. Qualquer operação deve tocar só no que é do jogo (a unit do servidor, a do túnel legado, o arquivo `kabemjunto.yaml` do Traefik e as regras do firewall da 3001).

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
- O que ainda não foi verificado: variáveis de ambiente da unit (`NODE_ENV`, `CORS_ORIGINS`, `METRICS_TOKEN`, `ROOM_STORAGE_FILE`) e a persistência das salas entre reinícios.

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

Observações da atualização de 2026-11-21:

- O `restart` do servidor demorou além de um minuto para voltar (o processo antigo não encerra na hora). Durante esse intervalo o link público responde **502** (do Traefik ou do túnel); isso é esperado e passa sozinho.
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

| Ponto                                                                     | Situação                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Porta `3001`                                                              | **Resolvido em 2026-11-21.** Bloqueada para acesso externo (seção 5). De fora da VPS, `http://<IP-DA-VPS>:3001/health` agora dá timeout. Há uma janela de poucos segundos a cada boot, antes da unit do firewall rodar     |
| Serviços como `root`                                                      | Os processos do jogo rodam como root numa VPS compartilhada. O Dockerfile do projeto usa usuário sem privilégio; a VPS não.                                                                                                |
| Origem do WebSocket                                                       | O servidor aceita conexões Socket.IO de qualquer origem (confirmado de novo pelo domínio estável em 2026-11-21). Item aberto no GDD.                                                                                       |
| Túnel rápido legado                                                       | Ainda ativo; a URL antiga continua válida até desligá-lo (seção 1). A URL oficial é a estável.                                                                                                                             |
| Limite de reinício das units                                              | `StartLimitIntervalSec=0` está na seção `[Service]`, onde o systemd ignora a chave. Vale o limite padrão: após 5 falhas em 10 s o serviço deixa de reiniciar sozinho. **Não corrigido.**                                   |
| Alertas do `npm ci` (9 vulnerabilidades: 3 críticas, 1 alta, 5 moderadas) | **Todas em ferramentas de desenvolvimento** (`vitest`, `vite`, `esbuild`, `tinypool`, `glob`, entre outras). `npm audit --omit=dev`, o que o CI exige, retorna **0**. Nada disso roda em produção.                         |
| Outros serviços da VPS                                                    | Fora do escopo do jogo e **não tocados**: Postgres (5432) e Redis (6379 e 3010) publicados em `0.0.0.0` sem firewall; `panel.kabemmanager.online` com certificado autoassinado e uma regra `Host()` malformada no Traefik. |
| Railway                                                                   | A publicação anterior (`web-production-52c52.up.railway.app`) estava fora do ar em 2026-11-18, causa não confirmada, e não foi revalidada.                                                                                 |

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

Ver também: [README, Docker e operação](../README.md#docker-e-operação), a regra de publicação no Railway no [STATUS](../STATUS.md) e a seção 13 do [GDD](../GDD-Kabemjunto.md).
