/* global process, console, fetch, AbortSignal, setTimeout, clearTimeout */
/**
 * Teste do Kabemjunto no seu PC, aberto para a internet por um túnel rápido da
 * Cloudflare (sem conta, sem domínio, sem custo).
 *
 *   npm run tunel            sobe tudo (faz o build se ainda não existir)
 *   npm run tunel -- --build força um build novo antes de subir
 *
 * O que acontece, nesta ordem:
 *   1. build de produção (shared + server + web), se preciso;
 *   2. `cloudflared tunnel` apontado para o servidor local; a Cloudflare sorteia
 *      o endereço público (https://alguma-coisa.trycloudflare.com);
 *   3. o servidor sobe em MODO PRODUÇÃO (as mesmas regras do deploy real), com
 *      CORS liberado só para esse endereço e um METRICS_TOKEN aleatório;
 *   4. confere `/live`, `/ready` e `/health` pelo endereço público e imprime o
 *      link para você mandar aos amigos.
 *
 * Ctrl+C encerra o túnel e o servidor. As salas ficam só na memória: ao parar,
 * as partidas em andamento acabam (é um teste).
 *
 * O servidor escuta apenas em 127.0.0.1: nada fica aberto na sua rede local,
 * só o que passa pelo túnel.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = process.cwd();
const PORTA = Number(process.env['PORT'] ?? 3001);
const REFORCAR_BUILD = process.argv.includes('--build');
const TEMPO_MAXIMO_DO_TUNEL_MS = 60_000;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const filhos = [];
let encerrando = false;

function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  console.log('\n[tunel] encerrando túnel e servidor…');
  for (const filho of filhos) if (filho.exitCode === null) filho.kill();
  setTimeout(() => process.exit(codigo), 800).unref();
}
process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));

function acharCloudflared() {
  const local = resolve(RAIZ, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (existsSync(local)) return local;
  const procura = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], {
    encoding: 'utf8',
  });
  if (procura.status === 0) return procura.stdout.split(/\r?\n/)[0].trim();
  return undefined;
}

function construir() {
  const pronto =
    existsSync(resolve(RAIZ, 'apps/web/dist/index.html')) &&
    existsSync(resolve(RAIZ, 'apps/server/dist/server.js')) &&
    existsSync(resolve(RAIZ, 'packages/shared/dist/index.js'));
  if (pronto && !REFORCAR_BUILD) {
    console.log('[tunel] build existente encontrado (use --build para refazer).');
    return;
  }
  console.log('[tunel] construindo (npm run build)… isso leva cerca de um minuto.');
  const resultado = spawnSync(npm, ['run', 'build'], {
    cwd: RAIZ,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (resultado.status !== 0) {
    console.error('[tunel] o build falhou; veja as mensagens acima.');
    process.exit(1);
  }
}

function subirTunel(binario) {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(
      binario,
      [
        'tunnel',
        '--no-autoupdate',
        // HTTP/2 (TCP) em vez do QUIC (UDP) padrão: redes domésticas e Wi-Fi
        // perdem pacotes UDP com facilidade e o túnel ficava caindo.
        '--protocol',
        'http2',
        '--url',
        `http://127.0.0.1:${PORTA}`,
      ],
      {
        cwd: RAIZ,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    filhos.push(filho);
    let achou = false;
    const limite = setTimeout(() => {
      if (!achou)
        rejeitar(new Error('a Cloudflare não devolveu um endereço em 60 s (sem internet?)'));
    }, TEMPO_MAXIMO_DO_TUNEL_MS);
    const ler = (pedaco) => {
      const texto = pedaco.toString();
      const url = texto.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
      if (url && !achou) {
        achou = true;
        clearTimeout(limite);
        resolver(url);
      }
      // Só mostra o que importa para quem testa: erros do túnel.
      if (
        /\b(ERR|error)\b/i.test(texto) &&
        !/failed to sufficiently increase receive buffer/i.test(texto)
      ) {
        process.stderr.write(`[cloudflared] ${texto}`);
      }
    };
    filho.stdout.on('data', ler);
    filho.stderr.on('data', ler);
    filho.on('exit', (codigo) => {
      if (!achou) {
        clearTimeout(limite);
        rejeitar(new Error(`o cloudflared terminou antes de abrir o túnel (código ${codigo})`));
      } else if (!encerrando) {
        console.error('[tunel] o túnel caiu; encerrando.');
        encerrar(1);
      }
    });
  });
}

function subirServidor(urlPublica) {
  const filho = spawn(process.execPath, ['apps/server/dist/server.js'], {
    cwd: RAIZ,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORTA),
      HOST: '127.0.0.1',
      CORS_ORIGINS: urlPublica,
      METRICS_TOKEN: randomBytes(24).toString('hex'),
      // Fixtures de teste automatizado nunca ligam em produção; reforço explícito.
      KABEMJUNTO_E2E_FIXTURE: '0',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  filhos.push(filho);
  filho.on('exit', (codigo) => {
    if (!encerrando) {
      console.error(`[tunel] o servidor terminou (código ${codigo}); encerrando.`);
      encerrar(1);
    }
  });
}

/** O endereço sorteado leva de alguns segundos a ~1 minuto para ser resolvido pela internet. */
async function esperarEndereco(urlPublica) {
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    try {
      const resposta = await fetch(`${urlPublica}/live`, { signal: AbortSignal.timeout(5000) });
      if (resposta.status === 200) return true;
    } catch {
      // ainda não resolve (DNS) ou o servidor está subindo: tenta de novo.
    }
    await new Promise((aguardar) => setTimeout(aguardar, 2000));
  }
  return false;
}

async function conferir(urlPublica) {
  const resultados = {};
  const alcancavel = await esperarEndereco(urlPublica);
  resultados['/live'] = alcancavel ? 200 : 'sem resposta em 2 min';
  const pedir = async (caminho) => {
    const resposta = await fetch(`${urlPublica}${caminho}`, {
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    return resposta?.status ?? 'sem resposta';
  };
  resultados['/ready'] = await pedir('/ready');
  resultados['/health'] = await pedir('/health');
  resultados['/ (página)'] = await pedir('/');
  resultados['/socket.io (polling)'] = await pedir('/socket.io/?EIO=4&transport=polling');
  return resultados;
}

const binario = acharCloudflared();
if (!binario) {
  console.error(
    '[tunel] cloudflared não encontrado. Coloque cloudflared.exe na raiz do projeto ou instale-o no PATH.',
  );
  process.exit(1);
}
console.log(`[tunel] usando ${binario}`);

construir();

console.log('[tunel] abrindo o túnel da Cloudflare…');
const urlPublica = await subirTunel(binario).catch((erro) => {
  console.error(`[tunel] ${erro.message}`);
  encerrar(1);
});
if (urlPublica) {
  console.log(`[tunel] endereço sorteado: ${urlPublica}`);
  subirServidor(urlPublica);
  const resultados = await conferir(urlPublica);
  const tudoOk = Object.values(resultados).every((status) => status === 200);
  console.log('\n[tunel] conferência pelo endereço público:');
  for (const [caminho, status] of Object.entries(resultados))
    console.log(`  ${caminho.padEnd(22)} ${status}`);
  if (!tudoOk) {
    console.error('\n[tunel] algo não respondeu 200. Veja as mensagens acima.');
  }
  console.log(`\n  Mande este link para quem vai testar:\n\n    ${urlPublica}\n`);
  console.log('  Para parar: Ctrl+C neste terminal.');
}
