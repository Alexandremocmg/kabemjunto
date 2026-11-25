// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoPartidaPublico } from '@kabemjunto/shared';
import type { ControladorMesa } from '../tipos';

const confete = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));
vi.mock('canvas-confetti', () => ({ default: { create: () => confete } }));

import { ALTURA, LARGURA, desenharResultado } from './imagemDoResultado';
import { compartilhar } from '../../services/compartilhar';
import { TelaDeFim, ESPERA_DO_PEDIDO_MS } from './TelaDeFim';

const EU = 'eu';
const jogador = (id: string, nome: string) => ({
  id,
  nome,
  quantidadeCartas: 2,
  isBot: false,
  conectado: true,
  disseUno: false,
  avatar: '01',
  pontos: 0,
});

function controlador(extra: Partial<ControladorMesa> = {}): ControladorMesa {
  return {
    modo: 'online',
    estado: {
      partidaId: 'p1',
      finalizada: true,
      vencedor: 'ana',
      jogadores: [jogador(EU, 'Beto'), jogador('ana', 'Ana')],
    } as unknown as EstadoPartidaPublico,
    mao: [],
    jogadorId: EU,
    jogar: () => {},
    jogarMultiplas: () => {},
    comprar: () => {},
    interceptar: () => {},
    conectado: true,
    ...extra,
  };
}
const fim = (partidaId = 'p1') =>
  ({
    resumo: {
      versao: 1,
      partidaId,
      motivo: 'VITORIA',
      vencedorId: 'ana',
      jogadores: [],
      premios: [
        {
          id: 'ESPELHO',
          titulo: 'Espelho',
          detalhe: 'Devolveu 4 cartas.',
          valor: 4,
          jogadorId: EU,
        },
      ],
    },
    placar: {
      partidas: 3,
      vitorias: [
        { jogadorId: EU, vitorias: 1 },
        { jogadorId: 'ana', vitorias: 2 },
      ],
    },
  }) as NonNullable<ControladorMesa['fim']>;

let root: Root;
let caixa: HTMLElement;
const onJogarDeNovo = vi.fn();
const onVoltarAoMenu = vi.fn();
const mostrar = (c: ControladorMesa, props: Partial<ComponentProps<typeof TelaDeFim>> = {}): void =>
  act(() =>
    root.render(
      <TelaDeFim
        controlador={c}
        onJogarDeNovo={onJogarDeNovo}
        onVoltarAoMenu={onVoltarAoMenu}
        {...props}
      />,
    ),
  );
const botao = (texto: string) => {
  const achado = [...caixa.querySelectorAll('button')].find((b) => b.textContent === texto);
  if (!achado) throw new Error(`sem botão ${texto}: ${caixa.textContent}`);
  return achado;
};
let reduzido = false;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  reduzido = false;
  window.matchMedia = ((consulta: string) => ({
    matches: consulta.includes('reduce') && reduzido,
  })) as unknown as typeof window.matchMedia;
  vi.clearAllMocks();
  caixa = document.createElement('div');
  document.body.appendChild(caixa);
  root = createRoot(caixa);
});
afterEach(() => {
  act(() => root.unmount());
  caixa.remove();
  vi.useRealTimers();
});

describe('tela de fim', () => {
  it('funciona sem resumo e depois mostra prêmios e placar ordenado', () => {
    mostrar(controlador());
    expect(caixa.querySelector('h2')?.textContent).toBe('Ana Venceu!');
    expect(caixa.textContent).not.toContain('Prêmios');
    mostrar(controlador({ fim: fim() }));
    expect(caixa.textContent).toContain('Devolveu 4 cartas.');
    expect(caixa.querySelector('.fim-premiado')?.textContent).toBe('Você');
    expect([...caixa.querySelectorAll('.fim-placar li')].map((li) => li.textContent)).toEqual([
      'Ana2 vitórias',
      'Você1 vitória',
    ]);
  });

  it('ignora resumo e revanche de outra partida', () => {
    mostrar(
      controlador({
        fim: fim('velha'),
        revanche: { partidaId: 'velha', prontos: [EU], possiveis: [EU], recebidaEm: 0, conexao: 1 },
      }),
    );
    expect(caixa.textContent).not.toContain('Espelho');
    expect(botao('Jogar de novo com a mesma mesa').getAttribute('aria-disabled') === 'true').toBe(
      false,
    );
  });

  it('foco no título, Esc leva à saída sem sair e Tab circula', () => {
    mostrar(controlador({ fim: fim() }));
    expect(document.activeElement?.id).toBe('fim-titulo');
    const tecla = (key: string, shiftKey = false) =>
      act(() => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
        );
      });
    tecla('Tab', true);
    expect(document.activeElement).toBe(botao('Voltar ao menu'));
    tecla('Tab');
    expect(document.activeElement?.className).toBe('fim-corpo');
    tecla('Escape');
    expect(document.activeElement).toBe(botao('Voltar ao menu'));
    expect(onVoltarAoMenu).not.toHaveBeenCalled();
  });

  it('pede a revanche uma vez, mostra quem está pronto e conta por restanteMs', () => {
    mostrar(controlador());
    act(() => botao('Jogar de novo com a mesma mesa').click());
    expect(botao('Pedindo revanche…').getAttribute('aria-disabled') === 'true').toBe(true);
    act(() => botao('Pedindo revanche…').click());
    expect(onJogarDeNovo).toHaveBeenCalledTimes(1);
    mostrar(
      controlador({
        revanche: {
          partidaId: 'p1',
          prontos: [EU],
          possiveis: [EU, 'ana'],
          restanteMs: 9000,
          recebidaEm: performance.now(),
          conexao: 1,
        },
      }),
    );
    expect(caixa.querySelector('.fim-revanche')?.textContent).toBe('1 de 2 prontos: Você.');
    expect(caixa.querySelector('.fim-contagem')?.textContent).toContain('Começa em 9 s');
    act(() => vi.advanceTimersByTime(4000));
    expect(caixa.querySelector('.fim-contagem')?.textContent).toContain('Começa em 5 s');
    expect(botao('Esperando a mesa…').getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('sem resposta, dá para pedir de novo; recusa aparece na tela', () => {
    mostrar(controlador());
    act(() => botao('Jogar de novo com a mesma mesa').click());
    act(() => vi.advanceTimersByTime(ESPERA_DO_PEDIDO_MS));
    expect(caixa.querySelector('.fim-mensagem')?.textContent).toContain('Tente de novo');
    act(() => botao('Jogar de novo com a mesma mesa').click());
    mostrar(controlador({ aviso: { id: 7, tipo: 'erro', texto: 'Não dá agora.' } }));
    expect(caixa.querySelector('.fim-mensagem')?.textContent).toBe('Não dá agora.');
    expect(botao('Jogar de novo com a mesma mesa').getAttribute('aria-disabled') === 'true').toBe(
      false,
    );
  });

  it('confirmado e depois reconectado sem estar pronto: o botão volta na hora', () => {
    const rev = (prontos: string[]) => ({
      partidaId: 'p1',
      prontos,
      possiveis: [EU, 'ana'],
      recebidaEm: 0,
      conexao: 1,
    });
    mostrar(controlador());
    act(() => botao('Jogar de novo com a mesma mesa').click());
    mostrar(controlador({ revanche: rev([EU]) }));
    mostrar(controlador({ revanche: rev([EU]), conectado: false }));
    mostrar(controlador({ revanche: rev([]) }));
    const voltou = botao('Jogar de novo com a mesma mesa');
    expect(voltou.getAttribute('aria-disabled')).toBe('false');
    act(() => voltou.click());
    expect(onJogarDeNovo).toHaveBeenCalledTimes(2);
  });

  it('pedido perdido na queda também não prende o botão', () => {
    mostrar(controlador());
    act(() => botao('Jogar de novo com a mesma mesa').click());
    mostrar(controlador({ conectado: false }));
    mostrar(controlador());
    expect(botao('Jogar de novo com a mesma mesa').getAttribute('aria-disabled')).toBe('false');
  });

  it('o botão desligado mantém o foco e não age; o fundo fica inerte', () => {
    act(() =>
      root.render(
        <main>
          <div id="mesa" />
          <TelaDeFim
            controlador={controlador()}
            onJogarDeNovo={onJogarDeNovo}
            onVoltarAoMenu={onVoltarAoMenu}
          />
        </main>,
      ),
    );
    expect(caixa.querySelector('#mesa')?.hasAttribute('inert')).toBe(true);
    expect(caixa.querySelector('.fim')?.hasAttribute('inert')).toBe(false);
    const jogar = botao('Jogar de novo com a mesma mesa');
    act(() => jogar.focus());
    act(() => jogar.click());
    expect(jogar.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(jogar);
    act(() => jogar.click());
    expect(onJogarDeNovo).toHaveBeenCalledTimes(1);
    act(() =>
      root.render(
        <main>
          <div id="mesa" />
        </main>,
      ),
    );
    expect(caixa.querySelector('#mesa')?.hasAttribute('inert')).toBe(false);
  });

  it('no local o botão joga na hora', () => {
    mostrar(controlador({ modo: 'local' }));
    act(() => botao('Jogar de novo').click());
    expect(onJogarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('sem vencedor: "Partida encerrada", sem confete', () => {
    const c = controlador();
    mostrar({
      ...c,
      estado: { ...c.estado, vencedor: undefined } as unknown as EstadoPartidaPublico,
    });
    expect(caixa.querySelector('h2')?.textContent).toBe('Partida encerrada');
    expect(confete).not.toHaveBeenCalled();
  });

  it('confete: some ao desmontar e não existe com movimento reduzido', () => {
    mostrar(controlador());
    expect(confete).toHaveBeenCalled();
    act(() => root.unmount());
    expect(confete.reset).toHaveBeenCalledTimes(1);
    confete.mockClear();
    act(() => vi.advanceTimersByTime(1000));
    expect(confete).not.toHaveBeenCalled();

    reduzido = true;
    root = createRoot(caixa);
    mostrar(controlador());
    expect(confete).not.toHaveBeenCalled();
  });
});

describe('compartilhar', () => {
  const item = {
    titulo: 'K',
    texto: 'Ana venceu!',
    link: 'https://jogo.test/?sala=ABC234',
    gerarImagem: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
  };
  const abortar = () => Promise.reject(new DOMException('', 'AbortError'));
  const definir = (props: Record<string, unknown>) => {
    for (const [nome, value] of Object.entries(props))
      Object.defineProperty(navigator, nome, { value, configurable: true });
  };
  const copiar = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    copiar.mockReset().mockImplementation(() => Promise.resolve());
    definir({ share: undefined, canShare: undefined, clipboard: { writeText: copiar } });
  });

  it('com imagem quando o aparelho aceita arquivos', async () => {
    const share = vi.fn((_dados: ShareData) => Promise.resolve());
    definir({ share, canShare: () => true });
    expect(await compartilhar(item)).toBe('compartilhado');
    expect(share.mock.calls[0]![0].files).toHaveLength(1);
    expect(share.mock.calls[0]![0].text).toContain(item.link);
  });

  it('sem arquivos, vai texto e link; cancelar não é erro', async () => {
    const share = vi.fn((_dados: ShareData) => Promise.resolve());
    definir({ share, canShare: () => false });
    expect(await compartilhar(item)).toBe('compartilhado');
    expect(share).toHaveBeenCalledWith({ title: 'K', text: item.texto, url: item.link });
    definir({ share: abortar, canShare: () => true });
    expect(await compartilhar(item)).toBe('cancelado');
    expect(copiar).not.toHaveBeenCalled();
  });

  it('sem share (ou recusado), copia; sem como copiar, erro', async () => {
    expect(await compartilhar(item)).toBe('copiado');
    expect(copiar).toHaveBeenCalledWith(`${item.texto}\n${item.link}`);
    definir({ share: () => Promise.reject(new DOMException('', 'NotAllowedError')) });
    expect(await compartilhar(item)).toBe('copiado');
    copiar.mockImplementation(() => Promise.reject(new Error('negado')));
    expect(await compartilhar(item)).toBe('erro');
  });

  it('o link nunca leva código de sala, e a imagem usa nomes reais', async () => {
    const share = vi.fn((_dados: ShareData) => Promise.resolve());
    definir({ share, canShare: () => false });
    mostrar({ ...controlador({ fim: fim() }), codigoConvite: 'ABC234' } as ControladorMesa);
    await act(async () => botao('Compartilhar').click());
    expect(share.mock.calls[0]![0].url).not.toContain('sala');
    expect(share.mock.calls[0]![0].text).toContain('Espelho: Beto');
    expect(caixa.querySelector('.fim-mensagem')?.textContent).toBe('Resultado compartilhado.');
  });

  it('a imagem não usa rede e corta nomes enormes', () => {
    const textos: string[] = [];
    const drawImage = vi.fn();
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (alvo, nome) => {
        if (nome === 'measureText') return (t: string) => ({ width: t.length * 30 });
        if (nome === 'fillText') return (t: string) => textos.push(t);
        if (nome === 'drawImage') return drawImage;
        if (nome === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        return alvo[nome as string] ?? (() => {});
      },
    }) as unknown as CanvasRenderingContext2D;
    desenharResultado(ctx, {
      titulo: `${'W'.repeat(80)} venceu!`,
      premios: [{ titulo: 'Espelho', nome: 'Ana', detalhe: 'Devolveu 4.' }],
      endereco: 'jogo.test',
    });
    expect([LARGURA, ALTURA]).toEqual([1080, 1350]);
    expect(textos.find((t) => t.startsWith('WWW'))).toMatch(/…$/);
    expect(textos).toContain('Espelho: Ana');
    expect(drawImage).not.toHaveBeenCalled();
  });
});
