import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Constants, validarJogada, type JogadorId } from '@kabemjunto/shared';
import {
  JsonRoomPersistence,
  type PersistedRoomSession,
  type RoomPersistence,
} from './persistence.js';
import { buildServer } from './server.js';
import { RoomError, RoomStore, toPublicState } from './room-store.js';

const persistenceDirectories: string[] = [];

function persistenceFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kabemjunto-room-store-'));
  persistenceDirectories.push(directory);
  return join(directory, 'rooms.json');
}

afterEach(() => {
  for (const directory of persistenceDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function uuid(n: number): JogadorId {
  return `jogador-${n.toString().padStart(4, '0')}-aaaa-bbbb-cccc-ddddeeeeffff`;
}

function createStartedStore(persistence?: RoomPersistence): RoomStore {
  const store = new RoomStore(persistence);
  store.join({ jogadorId: uuid(1), salaId: 'KJTEST', nome: 'Ana', socketId: 'socket-a' });
  store.join({ jogadorId: uuid(2), salaId: 'KJTEST', nome: 'Bia', socketId: 'socket-b' });
  store.start('KJTEST', 'socket-a');
  return store;
}

function prepareOpenNumberedInterception(store: RoomStore) {
  const session = store.get('KJTEST')!;
  const estado = session.estado!;
  const jogadorOrigem = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
  const jogadorInterceptador = estado.jogadores.find((jogador) => jogador.id !== jogadorOrigem.id)!;
  const cartaJogavel = Constants.BARALHO_COMPLETO_108.find(
    (carta) => carta.tipo === 'NUMERADA' && carta.cor === 'AZUL' && carta.valor === 1,
  )!;
  const cartaIdentica = Constants.BARALHO_COMPLETO_108.find(
    (carta) =>
      carta.tipo === 'NUMERADA' &&
      carta.valor === cartaJogavel.valor &&
      carta.cor === cartaJogavel.cor &&
      carta.id !== cartaJogavel.id,
  )!;

  session.estado = {
    ...estado,
    jogadores: estado.jogadores.map((jogador) => {
      if (jogador.id === jogadorOrigem.id) {
        return { ...jogador, mao: [cartaJogavel, ...jogador.mao.slice(0, 1)] };
      }
      if (jogador.id === jogadorInterceptador.id) {
        return { ...jogador, mao: [cartaIdentica, ...jogador.mao] };
      }
      return jogador;
    }),
    monteDescarte: [{ ...cartaJogavel, id: 'topo-atual' }],
    corAtiva: 'AZUL',
    ataqueAcumulado: 0,
    ataqueStack: [],
  };
  store.play('KJTEST', jogadorOrigem.id, cartaJogavel.id);
  const opened = store.openInterceptionWindow('KJTEST', jogadorOrigem.id)!;
  return {
    jogadorOrigem,
    jogadorInterceptador,
    cartaJogavel,
    cartaIdentica,
    janela: opened.estado!.interceptacao!,
  };
}

describe('RoomStore — básico', () => {
  it('cria uma sala e só inicia com pelo menos dois jogadores', () => {
    const store = new RoomStore();
    const joined = store.join({
      jogadorId: uuid(1),
      salaId: 'kj01',
      nome: '<Ana>',
      socketId: 'socket-a',
    });

    expect(joined.session.sala.id).toBe('KJ01');
    expect(joined.session.sala.jogadores[0]?.nome).toBe('Ana');
    expect(joined.reconectado).toBe(false);
    expect(() => store.start('KJ01', 'socket-a')).toThrow('pelo menos 2 jogadores');
  });

  it('rejeita entrada em sala inexistente quando não é criação', () => {
    const store = new RoomStore();
    expect(() =>
      store.join({
        jogadorId: uuid(1),
        salaId: 'NAOEXI',
        nome: 'Ana',
        socketId: 'socket-a',
        criar: false,
      }),
    ).toThrow('Sala não encontrada');
  });

  it('inicia uma partida e nunca expõe mãos na projeção pública', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST');

    expect(session?.estado).toBeDefined();
    const publicState = toPublicState(session!.estado!);
    expect(publicState.jogadores.every((jogador) => !('mao' in jogador))).toBe(true);
    expect(publicState.jogadores.every((jogador) => jogador.quantidadeCartas === 7)).toBe(true);
  });

  it('valida a carta no servidor antes de avançar o turno', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const carta = Constants.BARALHO_COMPLETO_108.find(
      (item) => item.tipo === 'NUMERADA' && item.cor === 'LARANJA' && item.valor === 7,
    )!;
    const topo = Constants.BARALHO_COMPLETO_108.find(
      (item) => item.tipo === 'NUMERADA' && item.cor === 'LARANJA' && item.valor === 8,
    )!;
    const before = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === estado.vezDe ? { ...jogador, mao: [carta] } : jogador,
      ),
      monteDescarte: [topo],
      corAtiva: 'LARANJA' as const,
      ataqueAcumulado: 0,
      ataqueStack: [],
    };
    session.estado = before;
    const jogador = before.jogadores.find((item) => item.id === before.vezDe)!;

    const after = store.play('KJTEST', jogador.id, carta.id).estado!;
    expect(after.monteDescarte.at(-1)?.id).toBe(carta.id);
    expect(after.jogadores.find((item) => item.id === jogador.id)?.mao).toHaveLength(
      jogador.mao.length - 1,
    );
  });

  it('encaminha o alvo de TROCA_MAO para o motor autoritativo', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const jogadorAtual = estado.jogadores.find((item) => item.id === estado.vezDe)!;
    const alvo = estado.jogadores.find((item) => item.id !== estado.vezDe)!;
    const cartaTroca = Constants.BARALHO_COMPLETO_108.find((carta) => carta.acao === 'TROCA_MAO')!;

    session.estado = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === jogadorAtual.id
          ? { ...jogador, mao: [cartaTroca, jogador.mao[0]!] }
          : jogador.id === alvo.id
            ? { ...jogador, mao: [jogador.mao[0]!, jogador.mao[1]!, jogador.mao[2]!] }
            : jogador,
      ),
      monteDescarte: [estado.monteDescarte.at(-1)!],
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };

    const after = store.play('KJTEST', jogadorAtual.id, cartaTroca.id, 'AZUL', alvo.id).estado!;
    expect(after.jogadores.find((jogador) => jogador.id === jogadorAtual.id)?.mao).toHaveLength(3);
    expect(after.jogadores.find((jogador) => jogador.id === alvo.id)?.mao).toHaveLength(1);
    expect(after.historico.some((evento) => evento.tipo === 'MAO_TROCADA')).toBe(true);
  });
  it('calcula a compra no servidor e aplica a posse de turno canônica (GDD §7)', () => {
    const store = createStartedStore();
    const before = store.get('KJTEST')!.estado!;
    const currentPlayer = before.vezDe;
    const maoAntes = before.jogadores.find((item) => item.id === currentPlayer)!.mao;
    const ataque = before.ataqueAcumulado;

    // O baralho de `createStartedStore` é embaralhado de verdade: a mão
    // inicial pode ou não ter uma carta jogável contra o topo. GDD §7 só
    // permite comprar voluntariamente sem carta válida — com carta válida
    // na mão, o servidor deve recusar a compra (e não há ataque nessa fase
    // do jogo recém-iniciado, então a única saída é a recusa).
    const temCartaValida = maoAntes.some(
      (carta) => validarJogada(before, carta, currentPlayer).valida,
    );
    if (ataque === 0 && temCartaValida) {
      expect(() => store.buy('KJTEST', currentPlayer)).toThrow('Você tem uma carta válida na mão');
      return;
    }

    const esperadasCompradas = ataque > 0 ? ataque : 1;
    const after = store.buy('KJTEST', currentPlayer).estado!;
    const maoDepois = after.jogadores.find((item) => item.id === currentPlayer)!.mao;
    expect(maoDepois).toHaveLength(maoAntes.length + esperadasCompradas);

    // Afirmamos a regra, não um resultado fixo: o turno só permanece com
    // quem comprou se a compra foi voluntária (sem ataque) e a carta é
    // jogável.
    const comprada = maoDepois.at(-1)!;
    const jogavel = validarJogada(
      { ...after, vezDe: currentPlayer },
      comprada,
      currentPlayer,
    ).valida;
    const deveManterTurno = ataque === 0 && jogavel;
    expect(after.vezDe === currentPlayer).toBe(deveManterTurno);
  });
});

describe('RoomStore — descarte múltiplo', () => {
  it('encaminha dois +2 na ordem selecionada para o motor em uma única transição', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const jogadorAtual = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
    const maisDoisAzul = Constants.BARALHO_COMPLETO_108.find(
      (carta) => carta.acao === 'MAIS_DOIS' && carta.cor === 'AZUL',
    )!;
    const maisDoisVerde = Constants.BARALHO_COMPLETO_108.find(
      (carta) => carta.acao === 'MAIS_DOIS' && carta.cor === 'VERDE',
    )!;
    const topo = Constants.BARALHO_COMPLETO_108.find(
      (carta) => carta.acao === 'MAIS_DOIS' && carta.cor === 'LARANJA',
    )!;
    session.estado = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === jogadorAtual.id
          ? { ...jogador, mao: [maisDoisAzul, maisDoisVerde] }
          : jogador,
      ),
      monteDescarte: [topo],
      corAtiva: 'LARANJA',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };

    const after = store.playMultiple('KJTEST', jogadorAtual.id, [
      maisDoisVerde.id,
      maisDoisAzul.id,
    ]).estado!;

    expect(after.monteDescarte.slice(-2).map((carta) => carta.id)).toEqual([
      maisDoisVerde.id,
      maisDoisAzul.id,
    ]);
    // O lote esvazia a mão: vitória. GDD §10.8 — o ataque da(s) carta(s)
    // vencedora(s) nunca é cobrado, a partida já acabou.
    expect(after.finalizada).toBe(true);
    expect(after.vencedor).toBe(jogadorAtual.id);
    expect(after.ataqueAcumulado).toBe(0);
    expect(after.ataqueStack).toEqual([]);
    expect(after.jogadores.find((jogador) => jogador.id === jogadorAtual.id)?.mao).toEqual([]);
  });
});

describe('RoomStore — Corta-Frente (interceptação)', () => {
  it('abre janela para a carta elegível que está no topo, com pelo menos 2 jogadores', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const jogadorAtual = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
    const cartaJogavel = Constants.BARALHO_COMPLETO_108.find(
      (carta) => carta.tipo === 'NUMERADA' && carta.cor === 'AZUL' && carta.valor === 1,
    )!;
    session.estado = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === jogadorAtual.id
          ? { ...jogador, mao: [cartaJogavel, ...jogador.mao.slice(0, 1)] }
          : jogador,
      ),
      monteDescarte: [{ ...cartaJogavel, id: 'topo-preexistente' }],
      corAtiva: 'AZUL',
    };

    const opened = store.openInterceptionWindow('KJTEST', jogadorAtual.id);
    expect(opened?.estado?.interceptacao).toBeDefined();
    expect(opened?.estado?.interceptacao?.cartaAlvoId).toBe('topo-preexistente');
    expect(opened?.estado?.interceptacao?.jogadorOrigemId).toBe(jogadorAtual.id);
  });

  it('play() seguido de openInterceptionWindow() abre janela para carta elegível recém-descartada', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const jogadorAtual = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
    const cartaJogavel = Constants.BARALHO_COMPLETO_108.find(
      (carta) =>
        carta.tipo === 'NUMERADA' &&
        carta.acao === undefined &&
        carta.cor === 'AZUL' &&
        carta.valor === 1,
    )!;
    const topoAtual = { ...cartaJogavel, id: 'topo-atual', cor: 'AZUL' as const };
    session.estado = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === jogadorAtual.id
          ? { ...jogador, mao: [cartaJogavel, ...jogador.mao.slice(0, 1)] }
          : jogador,
      ),
      monteDescarte: [topoAtual],
      corAtiva: 'AZUL',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };

    const played = store.play('KJTEST', jogadorAtual.id, cartaJogavel.id);
    expect(played.estado?.monteDescarte.at(-1)?.id).toBe(cartaJogavel.id);

    const opened = store.openInterceptionWindow('KJTEST', jogadorAtual.id);
    expect(opened?.estado?.interceptacao).toBeDefined();
    expect(opened?.estado?.interceptacao?.cartaAlvoId).toBe(cartaJogavel.id);
    expect(opened?.estado?.interceptacao?.jogadorOrigemId).toBe(jogadorAtual.id);
  });

  it('não abre uma segunda janela se já existir uma ativa', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const jogadorAtual = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
    const cartaJogavel = Constants.BARALHO_COMPLETO_108.find(
      (carta) =>
        carta.tipo === 'NUMERADA' &&
        carta.acao === undefined &&
        carta.cor === 'AZUL' &&
        carta.valor === 1,
    )!;
    session.estado = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) =>
        jogador.id === jogadorAtual.id
          ? { ...jogador, mao: [cartaJogavel, ...jogador.mao.slice(0, 1)] }
          : jogador,
      ),
      monteDescarte: [{ ...cartaJogavel, id: 'topo-atual', cor: 'AZUL' as const }],
      corAtiva: 'AZUL',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };
    store.play('KJTEST', jogadorAtual.id, cartaJogavel.id);
    const first = store.openInterceptionWindow('KJTEST', jogadorAtual.id);
    expect(first?.estado?.interceptacao).toBeDefined();

    const second = store.openInterceptionWindow('KJTEST', jogadorAtual.id);
    expect(second).toBeUndefined();
  });

  it('intercept() valida a carta idêntica na mão do interceptador e resolve a janela', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const jogadorOrigem = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
    const jogadorInterceptador = estado.jogadores.find(
      (jogador) => jogador.id !== jogadorOrigem.id,
    )!;
    const cartaJogavel = Constants.BARALHO_COMPLETO_108.find(
      (carta) =>
        carta.tipo === 'NUMERADA' &&
        carta.acao === undefined &&
        carta.cor === 'AZUL' &&
        carta.valor === 1,
    )!;
    const cartaIdentica = Constants.BARALHO_COMPLETO_108.find(
      (carta) =>
        carta.tipo === 'NUMERADA' &&
        carta.valor === cartaJogavel.valor &&
        carta.cor === 'AZUL' &&
        carta.id !== cartaJogavel.id,
    )!;
    // A mão sorteada pode já conter essas duas cartas; sem isso haveria cópias duplicadas.
    const semAsDuas = (mao: typeof jogadorOrigem.mao) =>
      mao.filter((carta) => carta.id !== cartaJogavel.id && carta.id !== cartaIdentica.id);
    session.estado = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) => {
        if (jogador.id === jogadorOrigem.id)
          return { ...jogador, mao: [cartaJogavel, ...semAsDuas(jogador.mao).slice(0, 1)] };
        if (jogador.id === jogadorInterceptador.id)
          return { ...jogador, mao: [cartaIdentica, ...semAsDuas(jogador.mao)] };
        return jogador;
      }),
      monteDescarte: [{ ...cartaJogavel, id: 'topo-atual', cor: 'AZUL' as const }],
      corAtiva: 'AZUL',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };
    store.play('KJTEST', jogadorOrigem.id, cartaJogavel.id);
    const opened = store.openInterceptionWindow('KJTEST', jogadorOrigem.id);
    const janela = opened!.estado!.interceptacao!;

    const resolved = store.intercept(
      'KJTEST',
      jogadorInterceptador.id,
      janela.janelaId,
      janela.revisao,
      cartaIdentica.id,
    );

    expect(resolved.estado?.interceptacao).toBeUndefined();
    expect(resolved.estado?.monteDescarte.at(-1)?.id).toBe(cartaIdentica.id);
    expect(
      resolved.estado?.jogadores.find((jogador) => jogador.id === jogadorInterceptador.id)?.mao,
    ).not.toContainEqual(expect.objectContaining({ id: cartaIdentica.id }));
  });

  it('rejeita interceptação com carta não idêntica (mesma face, cor diferente)', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const estado = session.estado!;
    const jogadorOrigem = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
    const jogadorInterceptador = estado.jogadores.find(
      (jogador) => jogador.id !== jogadorOrigem.id,
    )!;
    const cartaJogavel = Constants.BARALHO_COMPLETO_108.find(
      (carta) =>
        carta.tipo === 'NUMERADA' &&
        carta.acao === undefined &&
        carta.cor === 'AZUL' &&
        carta.valor === 1,
    )!;
    const cartaMesmaFace = Constants.BARALHO_COMPLETO_108.find(
      (carta) =>
        carta.tipo === 'NUMERADA' && carta.valor === cartaJogavel.valor && carta.cor === 'VERDE',
    )!;
    session.estado = {
      ...estado,
      jogadores: estado.jogadores.map((jogador) => {
        if (jogador.id === jogadorOrigem.id)
          return { ...jogador, mao: [cartaJogavel, ...jogador.mao.slice(0, 1)] };
        if (jogador.id === jogadorInterceptador.id)
          return { ...jogador, mao: [cartaMesmaFace, ...jogador.mao] };
        return jogador;
      }),
      monteDescarte: [{ ...cartaJogavel, id: 'topo-atual', cor: 'AZUL' as const }],
      corAtiva: 'AZUL',
      ataqueAcumulado: 0,
      ataqueStack: [],
    };
    store.play('KJTEST', jogadorOrigem.id, cartaJogavel.id);
    const opened = store.openInterceptionWindow('KJTEST', jogadorOrigem.id);
    const janela = opened!.estado!.interceptacao!;

    expect(() =>
      store.intercept(
        'KJTEST',
        jogadorInterceptador.id,
        janela.janelaId,
        janela.revisao,
        cartaMesmaFace.id,
      ),
    ).toThrow(RoomError);
  });

  it('a janela expira sozinha via setTimeout e chama onExpire, sem polling', () => {
    vi.useFakeTimers();
    try {
      const store = createStartedStore();
      const session = store.get('KJTEST')!;
      const estado = session.estado!;
      const jogadorOrigem = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
      const cartaJogavel = Constants.BARALHO_COMPLETO_108.find(
        (carta) =>
          carta.tipo === 'NUMERADA' &&
          carta.acao === undefined &&
          carta.cor === 'AZUL' &&
          carta.valor === 1,
      )!;
      session.estado = {
        ...estado,
        jogadores: estado.jogadores.map((jogador) =>
          jogador.id === jogadorOrigem.id
            ? { ...jogador, mao: [cartaJogavel, ...jogador.mao.slice(0, 1)] }
            : jogador,
        ),
        monteDescarte: [{ ...cartaJogavel, id: 'topo-atual', cor: 'AZUL' as const }],
        corAtiva: 'AZUL',
        ataqueAcumulado: 0,
        ataqueStack: [],
      };
      store.play('KJTEST', jogadorOrigem.id, cartaJogavel.id);

      let expirou = false;
      let recebeuJanelaId: string | undefined;
      store.setInterceptionExpiredHandler((_salaId, _session, janelaId) => {
        expirou = true;
        recebeuJanelaId = janelaId;
      });
      store.openInterceptionWindow('KJTEST', jogadorOrigem.id);
      const janelaId = store.get('KJTEST')!.estado!.interceptacao!.janelaId;

      expect(expirou).toBe(false);
      vi.advanceTimersByTime(6000);

      expect(expirou).toBe(true);
      expect(recebeuJanelaId).toBe(janelaId);
      expect(store.get('KJTEST')!.estado!.interceptacao).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('interceptar antes do timeout cancela o timer — onExpire nunca é chamado', () => {
    vi.useFakeTimers();
    try {
      const store = createStartedStore();
      const session = store.get('KJTEST')!;
      const estado = session.estado!;
      const jogadorOrigem = estado.jogadores.find((jogador) => jogador.id === estado.vezDe)!;
      const jogadorInterceptador = estado.jogadores.find(
        (jogador) => jogador.id !== jogadorOrigem.id,
      )!;
      const cartaJogavel = Constants.BARALHO_COMPLETO_108.find(
        (carta) =>
          carta.tipo === 'NUMERADA' &&
          carta.acao === undefined &&
          carta.cor === 'AZUL' &&
          carta.valor === 1,
      )!;
      const cartaIdentica = Constants.BARALHO_COMPLETO_108.find(
        (carta) =>
          carta.tipo === 'NUMERADA' &&
          carta.valor === cartaJogavel.valor &&
          carta.cor === 'AZUL' &&
          carta.id !== cartaJogavel.id,
      )!;
      session.estado = {
        ...estado,
        jogadores: estado.jogadores.map((jogador) => {
          if (jogador.id === jogadorOrigem.id)
            return { ...jogador, mao: [cartaJogavel, ...jogador.mao.slice(0, 1)] };
          if (jogador.id === jogadorInterceptador.id)
            return { ...jogador, mao: [cartaIdentica, ...jogador.mao] };
          return jogador;
        }),
        monteDescarte: [{ ...cartaJogavel, id: 'topo-atual', cor: 'AZUL' as const }],
        corAtiva: 'AZUL',
        ataqueAcumulado: 0,
        ataqueStack: [],
      };
      store.play('KJTEST', jogadorOrigem.id, cartaJogavel.id);

      let expirou = false;
      store.setInterceptionExpiredHandler(() => {
        expirou = true;
      });
      store.openInterceptionWindow('KJTEST', jogadorOrigem.id);
      const janela = store.get('KJTEST')!.estado!.interceptacao!;
      store.intercept(
        'KJTEST',
        jogadorInterceptador.id,
        janela.janelaId,
        janela.revisao,
        cartaIdentica.id,
      );

      vi.advanceTimersByTime(6000);
      expect(expirou).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejeita revisão obsoleta sem alterar a janela ativa', () => {
    const store = createStartedStore();
    const { jogadorInterceptador, cartaIdentica, janela } = prepareOpenNumberedInterception(store);

    expect(() =>
      store.intercept(
        'KJTEST',
        jogadorInterceptador.id,
        janela.janelaId,
        janela.revisao + 1,
        cartaIdentica.id,
      ),
    ).toThrow('obsoleta');
    expect(store.get('KJTEST')?.estado?.interceptacao).toEqual(janela);
  });

  it('aceita exatamente o primeiro pedido válido para a mesma janela', () => {
    const store = createStartedStore();
    const { jogadorInterceptador, cartaIdentica, janela } = prepareOpenNumberedInterception(store);

    const accepted = store.intercept(
      'KJTEST',
      jogadorInterceptador.id,
      janela.janelaId,
      janela.revisao,
      cartaIdentica.id,
    );
    expect(accepted.estado?.interceptacao).toBeUndefined();

    expect(() =>
      store.intercept(
        'KJTEST',
        jogadorInterceptador.id,
        janela.janelaId,
        janela.revisao,
        cartaIdentica.id,
      ),
    ).toThrow('já resolvida');
  });

  it('persiste e rearma uma janela futura após restart', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));
    try {
      const file = persistenceFile();
      const store = createStartedStore(new JsonRoomPersistence(file));
      const { janela } = prepareOpenNumberedInterception(store);

      const restored = new RoomStore(new JsonRoomPersistence(file));
      expect(restored.get('KJTEST')?.estado?.interceptacao).toEqual(janela);

      let expirou = false;
      restored.setInterceptionExpiredHandler(() => {
        expirou = true;
      });
      vi.advanceTimersByTime(6000);

      expect(expirou).toBe(true);
      expect(restored.get('KJTEST')?.estado?.interceptacao).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolve imediatamente uma janela já vencida ao restaurar o snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));
    try {
      const file = persistenceFile();
      const store = createStartedStore(new JsonRoomPersistence(file));
      const { janela } = prepareOpenNumberedInterception(store);

      vi.setSystemTime(janela.fechaEm + 1);
      const restored = new RoomStore(new JsonRoomPersistence(file));

      expect(restored.get('KJTEST')?.estado?.interceptacao).toBeUndefined();
      expect(restored.get('KJTEST')?.estado?.vezDe).toBe(janela.proximaVezId);
      expect(restored.get('KJTEST')?.estado?.historico.at(-1)).toMatchObject({
        tipo: 'INTERCEPTACAO_EXPIRADA',
        janelaId: janela.janelaId,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RoomStore — salas públicas', () => {
  it('mantém salas privadas por padrão e só lista a pública aguardando com host conectado e vaga', () => {
    const store = new RoomStore();
    store.join({
      jogadorId: uuid(1),
      salaId: 'PRIVATE',
      nome: 'Privada',
      socketId: 'private-host',
    });
    store.join({
      jogadorId: uuid(2),
      salaId: 'PUBLIC',
      nome: 'Host público',
      socketId: 'public-host',
      visibilidade: 'PUBLICA',
      nomeSala: ' < Mesa   pública > ',
    });

    expect(store.listAvailablePublicRooms()).toEqual([
      {
        id: 'PUBLIC',
        nome: 'Mesa pública',
        hostNome: 'Host público',
        quantidadeJogadores: 1,
        maxJogadores: 10,
      },
    ]);
  });
});

describe('RoomStore — saída explícita', () => {
  it('remove jogador aguardando, transfere host conectado e remove a sala quando fica vazia', () => {
    const store = new RoomStore();
    store.join({ jogadorId: uuid(1), salaId: 'LEAVE1', nome: 'Ana', socketId: 'socket-a' });
    store.join({ jogadorId: uuid(2), salaId: 'LEAVE1', nome: 'Bia', socketId: 'socket-b' });

    const afterHostLeaves = store.leaveWaitingRoom('LEAVE1', uuid(1));
    expect(afterHostLeaves?.sala.hostId).toBe(uuid(2));
    expect(afterHostLeaves?.sala.jogadores.map((player) => player.id)).toEqual([uuid(2)]);

    expect(store.leaveWaitingRoom('LEAVE1', uuid(2))).toBeUndefined();
    expect(store.get('LEAVE1')).toBeUndefined();
  });
});

describe('RoomStore — abandono explícito', () => {
  it('a última pessoa finaliza a partida, registra ABANDONO e perde a retomada', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    expect(store.abandonGame('KJTEST', uuid(2)).estado?.finalizada).toBe(false);
    const abandoned = store.abandonGame('KJTEST', uuid(1));

    expect(abandoned.estado?.finalizada).toBe(true);
    expect(abandoned.sala.status).toBe('FINALIZADA');
    expect(abandoned.estado?.historico.at(-1)).toMatchObject({
      tipo: 'PARTIDA_FINALIZADA',
      motivo: 'ABANDONO',
    });
    expect(abandoned.resumeTokenHashByPlayer.has(uuid(1))).toBe(false);
    expect(() =>
      store.join({
        jogadorId: uuid(1),
        salaId: 'KJTEST',
        nome: 'Ana',
        socketId: 'returning',
        resumeToken: 'invalidated',
      }),
    ).toThrow('Credenciais de retomada inválidas');
    expect(session.estado?.finalizada).toBe(false);
  });
});

describe('RoomStore — Regra do 7 no chat', () => {
  it('penaliza cada jogador uma única vez sem alterar a transição do jogo', () => {
    const store = createStartedStore();
    const session = store.get('KJTEST')!;
    const before = {
      ...session.estado!,
      silencio: { ativo: true, jogadoresQuebraram: [] },
      sentido: -1 as const,
      ataqueAcumulado: 4,
      ataqueStack: ['MAIS_QUATRO' as const],
    };
    session.estado = before;
    const firstPlayer = before.jogadores[0]!;
    const secondPlayer = before.jogadores[1]!;
    const firstHandSize = firstPlayer.mao.length;
    const secondHandSize = secondPlayer.mao.length;

    const first = store.penalizeSilenceBreak('KJTEST', firstPlayer.id);
    const repeated = store.penalizeSilenceBreak('KJTEST', firstPlayer.id);
    const second = store.penalizeSilenceBreak('KJTEST', secondPlayer.id);

    expect(first.penalized).toBe(true);
    expect(repeated.penalized).toBe(false);
    expect(second.penalized).toBe(true);
    const after = second.session.estado!;
    expect(after.jogadores.find((player) => player.id === firstPlayer.id)?.mao).toHaveLength(
      firstHandSize + 2,
    );
    expect(after.jogadores.find((player) => player.id === secondPlayer.id)?.mao).toHaveLength(
      secondHandSize + 2,
    );
    expect(after.silencio).toEqual({
      ativo: true,
      jogadoresQuebraram: [firstPlayer.id, secondPlayer.id],
    });
    expect(after.vezDe).toBe(before.vezDe);
    expect(after.sentido).toBe(before.sentido);
    expect(after.ataqueAcumulado).toBe(before.ataqueAcumulado);
    expect(after.ataqueStack).toEqual(before.ataqueStack);
    expect(after.historico.filter((event) => event.tipo === 'SILENCIO_QUEBRADO')).toHaveLength(2);
    expect(
      after.historico.filter(
        (event) => event.tipo === 'CARTA_COMPRADA' && event.origem === 'REGRA_DO_7',
      ),
    ).toHaveLength(4);
  });
});

describe('RoomStore — M14 (identidade estável + reconexão)', () => {
  it('rejeita jogadorId ausente', () => {
    const store = new RoomStore();
    expect(() => store.join({ jogadorId: '', salaId: 'X1', nome: 'Test', socketId: 's' })).toThrow(
      RoomError,
    );
  });

  it('rejeita jogadorId que já está em OUTRA sala com erro genérico (anti-enumeração)', () => {
    const store = new RoomStore();
    store.join({ jogadorId: uuid(1), salaId: 'A1', nome: 'Ana', socketId: 's1' });
    store.join({ jogadorId: uuid(2), salaId: 'A1', nome: 'Bia', socketId: 's2' });
    try {
      store.join({ jogadorId: uuid(1), salaId: 'B1', nome: 'Ana', socketId: 's3' });
      expect.fail('Deveria ter lançado RoomError');
    } catch (error) {
      expect(error).toBeInstanceOf(RoomError);
      expect((error as RoomError).code).toBe('AUTH_REQUIRED');
      expect((error as RoomError).message).toBe('Credenciais de retomada inválidas.');
    }
  });

  it('restaura jogador existente com novo socket (reconexão)', () => {
    const store = new RoomStore();
    const id = uuid(1);
    const first = store.join({ jogadorId: id, salaId: 'R1', nome: 'Ana', socketId: 'socket-old' });
    expect(first.reconectado).toBe(false);

    // Simula reconexão: novo socket, mesmo jogadorId, com o token emitido na primeira entrada.
    const second = store.join({
      jogadorId: id,
      salaId: 'R1',
      nome: 'Ana',
      socketId: 'socket-new',
      resumeToken: first.resumeToken,
    });
    expect(second.reconectado).toBe(true);
    expect(second.session.sala.jogadores).toHaveLength(1);
    expect(second.session.socketByPlayer.get(id)).toBe('socket-new');
  });

  it('disconnect não remove o jogador, só marca como desconectado', () => {
    const store = new RoomStore();
    const id = uuid(1);
    store.join({ jogadorId: id, salaId: 'D1', nome: 'Ana', socketId: 'socket-a' });
    expect(store.get('D1')?.sala.jogadores[0]?.conectado).toBe(true);

    const after = store.disconnect('socket-a');
    expect(after?.sala.jogadores).toHaveLength(1);
    expect(after?.sala.jogadores[0]?.conectado).toBe(false);
    // socketByPlayer mantém o mapeamento (o jogador pode reconectar)
    expect(after?.socketByPlayer.get(id)).toBe('socket-a');
  });

  it('reconexão depois de disconnect restaura conectado=true', () => {
    const store = new RoomStore();
    const id = uuid(1);
    const first = store.join({ jogadorId: id, salaId: 'RC1', nome: 'Ana', socketId: 'socket-1' });
    store.disconnect('socket-1');
    expect(store.get('RC1')?.sala.jogadores[0]?.conectado).toBe(false);

    // Reconexão
    const result = store.join({
      jogadorId: id,
      salaId: 'RC1',
      nome: 'Ana',
      socketId: 'socket-2',
      resumeToken: first.resumeToken,
    });
    expect(result.reconectado).toBe(true);
    expect(result.session.sala.jogadores).toHaveLength(1);
    expect(result.session.sala.jogadores[0]?.conectado).toBe(true);
    expect(result.session.socketByPlayer.get(id)).toBe('socket-2');
  });

  it('reconecta o mesmo jogador depois que a partida começou', () => {
    const store = new RoomStore();
    store.join({ jogadorId: uuid(1), salaId: 'KJTEST', nome: 'Ana', socketId: 'socket-a' });
    const biaJoined = store.join({
      jogadorId: uuid(2),
      salaId: 'KJTEST',
      nome: 'Bia',
      socketId: 'socket-b',
    });
    store.start('KJTEST', 'socket-a');
    const id = uuid(2);

    store.disconnect('socket-b');
    const result = store.join({
      jogadorId: id,
      salaId: 'KJTEST',
      nome: 'Bia',
      socketId: 'socket-b-new',
      resumeToken: biaJoined.resumeToken,
    });

    expect(result.reconectado).toBe(true);
    expect(result.session.sala.status).toBe('EM_PARTIDA');
    expect(result.session.estado).toBeDefined();
    expect(result.session.sala.jogadores.find((jogador) => jogador.id === id)?.conectado).toBe(
      true,
    );
    expect(result.session.socketByPlayer.get(id)).toBe('socket-b-new');
  });

  it('reconexão preserva nome/avatar do servidor (anti-impersonation)', () => {
    const store = new RoomStore();
    const id = uuid(1);
    const first = store.join({ jogadorId: id, salaId: 'AI1', nome: 'Ana', socketId: 'socket-1' });
    // Atacante tenta entrar com nome diferente, mas apresenta o token válido do jogador legítimo
    const result = store.join({
      jogadorId: id,
      salaId: 'AI1',
      nome: 'Hacker',
      socketId: 'socket-2',
      resumeToken: first.resumeToken,
    });
    expect(result.reconectado).toBe(true);
    // Nome continua sendo o do servidor
    expect(result.session.sala.jogadores[0]?.nome).toBe('Ana');
  });

  it('findBySocketId acha a sala correta', () => {
    const store = new RoomStore();
    store.join({ jogadorId: uuid(1), salaId: 'F1', nome: 'A', socketId: 'sock-a' });
    store.join({ jogadorId: uuid(2), salaId: 'F1', nome: 'B', socketId: 'sock-b' });
    store.join({ jogadorId: uuid(3), salaId: 'F2', nome: 'C', socketId: 'sock-c' });

    const found = store.findBySocketId('sock-b');
    expect(found?.salaId).toBe('F1');
    expect(found?.session.sala.jogadores).toHaveLength(2);
  });
});

describe('RoomStore — B23 (persistência durável)', () => {
  it('restaura sala aguardando sem sockets e com jogadores desconectados', () => {
    const persistence = new JsonRoomPersistence(persistenceFile());
    const beforeRestart = new RoomStore(persistence);
    beforeRestart.join({
      jogadorId: uuid(1),
      salaId: 'SAVE01',
      nome: 'Ana',
      socketId: 'socket-before-restart',
    });

    const afterRestart = new RoomStore(persistence);
    const restored = afterRestart.get('SAVE01')!;

    expect(restored.sala.jogadores[0]?.conectado).toBe(false);
    expect(restored.socketByPlayer.size).toBe(0);
    expect(afterRestart.findBySocketId('socket-before-restart')).toBeUndefined();
    expect(afterRestart.exportState()).toEqual([
      {
        sala: restored.sala,
        resumeTokenHashes: Object.fromEntries(restored.resumeTokenHashByPlayer),
      },
    ]);
    expect(JSON.stringify(afterRestart.exportState())).not.toContain('socket-before-restart');
  });

  it('preserva partida ativa integralmente e permite retomar pela identidade estável', () => {
    const persistence = new JsonRoomPersistence(persistenceFile());
    const beforeRestart = new RoomStore(persistence);
    const anaJoined = beforeRestart.join({
      jogadorId: uuid(1),
      salaId: 'GAME01',
      nome: 'Ana',
      socketId: 'old-a',
    });
    beforeRestart.join({ jogadorId: uuid(2), salaId: 'GAME01', nome: 'Bia', socketId: 'old-b' });
    const started = beforeRestart.start('GAME01', 'old-a');

    const afterRestart = new RoomStore(persistence);
    const restored = afterRestart.get('GAME01')!;

    expect(restored.estado).toEqual({
      ...started.estado,
      jogadores: started.estado!.jogadores.map((player) => ({ ...player, conectado: false })),
    });
    expect(restored.sala.jogadores.every((player) => player.conectado === false)).toBe(true);
    expect(restored.socketByPlayer.size).toBe(0);

    const reconnected = afterRestart.join({
      jogadorId: uuid(1),
      salaId: 'GAME01',
      nome: 'Nome ignorado',
      socketId: 'new-a',
      criar: false,
      resumeToken: anaJoined.resumeToken,
    });
    expect(reconnected.reconectado).toBe(true);
    expect(reconnected.session.socketByPlayer.get(uuid(1))).toBe('new-a');
    expect(
      reconnected.session.estado?.jogadores.find((player) => player.id === uuid(1))?.conectado,
    ).toBe(true);
  });

  it('persiste antes de publicar a mutação na memória', () => {
    class FailingPersistence implements RoomPersistence {
      load(): PersistedRoomSession[] {
        return [];
      }

      save(): void {
        throw new Error('volume indisponível');
      }
    }

    const store = new RoomStore(new FailingPersistence());

    expect(() =>
      store.join({ jogadorId: uuid(1), salaId: 'FAIL01', nome: 'Ana', socketId: 'socket-a' }),
    ).toThrow('volume indisponível');
    expect(store.get('FAIL01')).toBeUndefined();
  });

  it('exporta e restaura apenas estado autoritativo, nunca identidade de socket', () => {
    const original = new RoomStore();
    original.join({ jogadorId: uuid(1), salaId: 'IDENT1', nome: 'Ana', socketId: 'secret-socket' });
    const exported = original.exportState();

    const restored = new RoomStore();
    restored.restoreState(exported);

    expect(restored.get('IDENT1')?.sala.hostId).toBe(uuid(1));
    expect(restored.get('IDENT1')?.socketByPlayer.size).toBe(0);
    expect(JSON.stringify(exported)).not.toContain('secret-socket');
  });

  it('hidrata o bootstrap por ROOM_STORAGE_FILE quando configurado', async () => {
    const file = persistenceFile();
    const persistence = new JsonRoomPersistence(file);
    const persistedStore = new RoomStore(persistence);
    persistedStore.join({
      jogadorId: uuid(1),
      salaId: 'BOOT01',
      nome: 'Ana',
      socketId: 'bootstrap-old-socket',
    });
    const previous = process.env['ROOM_STORAGE_FILE'];
    process.env['ROOM_STORAGE_FILE'] = file;

    try {
      const { app, store } = await buildServer();
      expect(store.get('BOOT01')?.sala.jogadores[0]?.conectado).toBe(false);
      expect(store.get('BOOT01')?.socketByPlayer.size).toBe(0);
      await app.close();
    } finally {
      if (previous === undefined) delete process.env['ROOM_STORAGE_FILE'];
      else process.env['ROOM_STORAGE_FILE'] = previous;
    }
  });
});

describe('RoomStore — B28 (retomada autenticada)', () => {
  it('emite token opaco inicial e persiste apenas seu hash SHA-256', () => {
    const store = new RoomStore();
    const joined = store.join({
      jogadorId: uuid(1),
      salaId: 'TOKEN1',
      nome: 'Ana',
      socketId: 'socket-a',
    });

    expect(joined.resumeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(store.exportState())).not.toContain(joined.resumeToken);
    expect([...joined.session.resumeTokenHashByPlayer.values()][0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('torna token ausente e inválido indistinguíveis', () => {
    const store = new RoomStore();
    const id = uuid(1);
    store.join({ jogadorId: id, salaId: 'AUTH01', nome: 'Ana', socketId: 'old' });

    for (const resumeToken of [undefined, 'token-invalido']) {
      try {
        store.join({
          jogadorId: id,
          salaId: 'AUTH01',
          nome: 'Ataque',
          socketId: 'new',
          ...(resumeToken === undefined ? {} : { resumeToken }),
        });
        expect.fail('Deveria exigir autenticação');
      } catch (error) {
        expect(error).toBeInstanceOf(RoomError);
        expect((error as RoomError).code).toBe('AUTH_REQUIRED');
        expect((error as RoomError).message).toBe('Credenciais de retomada inválidas.');
      }
    }
  });

  it('rotaciona token, invalida o anterior e informa o socket revogado', () => {
    const store = new RoomStore();
    const id = uuid(1);
    const first = store.join({ jogadorId: id, salaId: 'ROTATE', nome: 'Ana', socketId: 'old' });
    const resumed = store.join({
      jogadorId: id,
      salaId: 'ROTATE',
      nome: 'Ana',
      socketId: 'new',
      resumeToken: first.resumeToken,
    });

    expect(resumed.resumeToken).not.toBe(first.resumeToken);
    expect(resumed.previousSocketId).toBe('old');
    expect(() =>
      store.join({
        jogadorId: id,
        salaId: 'ROTATE',
        nome: 'Ana',
        socketId: 'attacker',
        resumeToken: first.resumeToken,
      }),
    ).toThrowError(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
  });

  it('retoma após restart com token válido e disconnect antigo não desfaz o novo binding', () => {
    const persistence = new JsonRoomPersistence(persistenceFile());
    const id = uuid(1);
    const before = new RoomStore(persistence);
    const first = before.join({ jogadorId: id, salaId: 'RESTART', nome: 'Ana', socketId: 'old' });

    const after = new RoomStore(persistence);
    const resumed = after.join({
      jogadorId: id,
      salaId: 'RESTART',
      nome: 'Ana',
      socketId: 'new',
      resumeToken: first.resumeToken,
    });

    expect(resumed.reconectado).toBe(true);
    expect(after.disconnect('old')).toBeUndefined();
    expect(after.get('RESTART')?.socketByPlayer.get(id)).toBe('new');
    expect(after.get('RESTART')?.sala.jogadores[0]?.conectado).toBe(true);
  });
});
