// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Carta, EstadoPartidaPublico, JogadorPublico, TurnoPublico } from '@kabemjunto/shared';
import { Mesa3D } from './Mesa3D';
import type { ControladorMesa } from './tipos';

const numerada = (id: string, valor: number): Carta => ({
  id,
  tipo: 'NUMERADA',
  cor: 'AZUL',
  valor,
  raridade: 'COMUM',
  colecao: 'base-v1',
  efeito_texto_curto: `${valor}`,
  efeito_texto_longo: `Carta ${valor}`,
});
const jogador = (id: string, extra: Partial<JogadorPublico> = {}): JogadorPublico => ({
  id,
  nome: id,
  quantidadeCartas: 5,
  isBot: false,
  conectado: true,
  disseUno: false,
  avatar: '03',
  pontos: 0,
  ...extra,
});
const estado = (extra: Partial<EstadoPartidaPublico> = {}): EstadoPartidaPublico => ({
  partidaId: 'p1',
  salaId: 's',
  jogadores: [jogador('eu'), jogador('ana')],
  topo: numerada('topo', 4),
  quantidadeMonteCompra: 40,
  vezDe: 'ana',
  sentido: 1,
  corAtiva: 'AZUL',
  ataqueAcumulado: 0,
  ataqueStack: [],
  silencio: { ativo: false, jogadoresQuebraram: [] },
  finalizada: false,
  ...extra,
});

const retomarControle = vi.fn();
let root: Root;
let caixa: HTMLElement;
function mostrar(publico: EstadoPartidaPublico, conexao = 1): void {
  const controlador: ControladorMesa = {
    modo: 'online',
    estado: publico,
    mao: [numerada('minha', 6)],
    jogadorId: 'eu',
    jogar: () => {},
    jogarMultiplas: () => {},
    comprar: () => {},
    interceptar: () => {},
    conexao,
    conectado: true,
    retomarControle,
  };
  act(() =>
    root.render(
      <Mesa3D
        controlador={controlador}
        renderizacao="2d"
        onSair={() => {}}
        onJogarNovamente={() => {}}
      />,
    ),
  );
}
const falado = () =>
  [...caixa.querySelectorAll('.sr-only[role="status"]')].map((no) => no.textContent).join('|');

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
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
  caixa = document.createElement('div');
  document.body.appendChild(caixa);
  root = createRoot(caixa);
});
afterEach(() => {
  act(() => root.unmount());
  caixa.remove();
  vi.useRealTimers();
});

const comAtaque = () =>
  estado({
    ataqueAcumulado: 2,
    ataqueStack: ['MAIS_DOIS'],
    topo: { ...numerada('mais2', 0), tipo: 'ACAO', acao: 'MAIS_DOIS' },
    vezDe: 'eu',
  });

it('sem queda, a mudança vira selo e anúncio', () => {
  mostrar(estado());
  mostrar(comAtaque());
  expect(caixa.querySelector('[data-impacto]')).not.toBeNull();
  expect(falado()).toContain('Sua vez');
});

it('após reconectar, não compara com o estado de antes da queda; depois volta a comparar', () => {
  mostrar(estado());
  mostrar(estado(), 1);
  // A conexão volta antes do primeiro estado novo chegar.
  const antes = estado();
  mostrar(antes, 1);
  mostrar(antes, 2);
  mostrar(comAtaque(), 2);
  expect(caixa.querySelector('[data-impacto]')).toBeNull();
  expect(falado()).not.toContain('Sua vez');
  mostrar(estado({ vezDe: 'ana' }), 2);
  mostrar(comAtaque(), 2);
  expect(caixa.querySelector('[data-impacto]')).not.toBeNull();
});

it('aviso de vez: conta por restanteMs, anuncia uma vez e reinicia em prazo novo', () => {
  const turno: TurnoPublico = {
    jogadorId: 'eu',
    // Relógio do servidor bem diferente do aparelho: não pode importar.
    expiraEm: 5,
    duracaoMs: 30_000,
    revisao: 1,
    restanteMs: 20_000,
  };
  const segundos = () => caixa.querySelector('.mesa3d-prazo-segundos')?.textContent;
  mostrar(estado({ vezDe: 'eu', turno }));
  expect(segundos()).toBe('20 s');
  act(() => vi.advanceTimersByTime(5000));
  expect(segundos()).toBe('15 s');
  // Mesmo prazo reenviado: não reinicia.
  mostrar(estado({ vezDe: 'eu', turno: { ...turno, restanteMs: 20_000 } }));
  expect(segundos()).toBe('15 s');
  expect(falado()).not.toContain('acabando');

  const regiao = caixa.querySelector('.mesa3d-prazo [role="status"]')!;
  const mudancas = vi.fn();
  const observador = new MutationObserver(mudancas);
  observador.observe(regiao, { childList: true, characterData: true, subtree: true });
  act(() => vi.advanceTimersByTime(8000));
  expect(regiao.textContent).toBe('Sua vez está acabando.');
  act(() => vi.advanceTimersByTime(5000));
  expect(observador.takeRecords().length).toBeLessThanOrEqual(1);
  observador.disconnect();

  mostrar(estado({ vezDe: 'eu', turno: { ...turno, revisao: 2, restanteMs: 30_000 } }));
  expect(segundos()).toBe('30 s');
  expect(regiao.textContent).toBe('');
  mostrar(estado({ vezDe: 'eu' }));
  expect(segundos()).toBeUndefined();
});

it('na vez dos outros a urgência não é anunciada', () => {
  mostrar(
    estado({
      turno: { jogadorId: 'ana', expiraEm: 1, duracaoMs: 30_000, revisao: 1, restanteMs: 3000 },
    }),
  );
  expect(caixa.querySelector('[data-urgente="true"]')).not.toBeNull();
  expect(caixa.querySelector('.mesa3d-prazo [role="status"]')?.textContent).toBe('');
});

it('bot no assento: mostra o motivo, e só o INATIVO ganha "Voltei"', () => {
  const bot = (motivoBot: JogadorPublico['motivoBot']) => ({
    controladoPorBot: true,
    ...(motivoBot ? { motivoBot } : {}),
  });
  mostrar(estado({ jogadores: [jogador('eu'), jogador('ana', { ...bot('SAIU'), isBot: true })] }));
  expect(caixa.querySelector('.mesa2d-adversario')?.textContent).toContain('saiu · bot joga');
  expect(caixa.querySelector('.mesa2d-avatar img')?.getAttribute('src')).toContain('avatar-03.svg');
  expect(caixa.querySelector('.mesa3d-ausente')).toBeNull();

  mostrar(estado({ jogadores: [jogador('eu', bot('INATIVO')), jogador('ana', bot('CAIU'))] }));
  expect(caixa.querySelector('.mesa2d-adversario')?.textContent).toContain('caiu · bot joga');
  act(() => caixa.querySelector<HTMLButtonElement>('.mesa3d-ausente button')!.click());
  expect(retomarControle).toHaveBeenCalledTimes(1);
});
