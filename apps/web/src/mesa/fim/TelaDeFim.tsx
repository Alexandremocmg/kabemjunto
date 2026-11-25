/** Fim da partida: vencedor, prêmios, placar da sessão, revanche e compartilhar. */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import confetti from 'canvas-confetti';
import { linkDoJogo } from '../../services/convite';
import { prefereMovimentoReduzido } from '../preferencias';
import type { ControladorMesa } from '../tipos';
import { useRestante } from '../useRestante';
import { compartilhar } from '../../services/compartilhar';
import { gerarImagemDoResultado } from './imagemDoResultado';
import './telaDeFim.css';

/** Sem resposta do servidor depois disso, dá para pedir a revanche de novo. */
export const ESPERA_DO_PEDIDO_MS = 5000;
const DURACAO_CONFETE_MS = 3000;
const CORES_CONFETE = ['#F39C12', '#3498DB', '#27AE60', '#9B59B6'];

function useConfete(ligado: boolean): void {
  useEffect(() => {
    if (!ligado || prefereMovimentoReduzido()) return undefined;
    // Canvas próprio e sem worker: a CSP do site (script-src 'self') bloqueia o worker de
    // blob que o confete padrão cria, e a biblioteca não percebe (nada é desenhado).
    const canvas = document.createElement('canvas');
    canvas.className = 'fim-confete';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const soltarConfete = confetti.create(canvas, { resize: true, useWorker: false });
    const fim = Date.now() + DURACAO_CONFETE_MS;
    let quadro = 0;
    const soltar = (): void => {
      for (const [angle, x] of [
        [60, 0],
        [120, 1],
      ] as const)
        void soltarConfete({
          particleCount: 4,
          angle,
          spread: 55,
          origin: { x },
          colors: CORES_CONFETE,
          disableForReducedMotion: true,
        });
      quadro = Date.now() < fim ? requestAnimationFrame(soltar) : 0;
    };
    soltar();
    return () => {
      cancelAnimationFrame(quadro);
      soltarConfete.reset();
      canvas.remove();
    };
  }, [ligado]);
}

export interface TelaDeFimProps {
  controlador: ControladorMesa;
  onJogarDeNovo: () => void;
  onVoltarAoMenu: () => void;
}

export function TelaDeFim({ controlador, onJogarDeNovo, onVoltarAoMenu }: TelaDeFimProps) {
  const { estado, jogadorId, modo } = controlador;
  const online = modo === 'online';
  const fim = controlador.fim?.resumo.partidaId === estado.partidaId ? controlador.fim : undefined;
  const revanche =
    controlador.revanche?.partidaId === estado.partidaId ? controlador.revanche : undefined;

  const fundoRef = useRef<HTMLDivElement>(null);
  const dialogoRef = useRef<HTMLElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [mensagem, setMensagem] = useState('');
  const [compartilhando, setCompartilhando] = useState(false);
  const [pedido, setPedido] = useState(false);
  const [avisoInicial] = useState(controlador.aviso?.id);

  const nomeDe = (id: string): string => (id === jogadorId ? 'Você' : nomePublico(id));
  /** Nome real também para mim: numa imagem compartilhada, "Você" seria quem lê. */
  function nomePublico(id: string): string {
    return estado.jogadores.find((jogador) => jogador.id === id)?.nome ?? 'Quem saiu';
  }

  const vencedorId = estado.vencedor;
  const venci = vencedorId !== undefined && vencedorId === jogadorId;
  const titulo =
    vencedorId === undefined
      ? 'Partida encerrada'
      : venci
        ? 'Você Venceu!'
        : `${nomePublico(vencedorId)} Venceu!`;
  const premios = fim?.resumo.premios.slice(0, 3) ?? [];
  const placar = [...(fim?.placar?.vitorias ?? [])].sort((a, b) => b.vitorias - a.vitorias);

  useConfete(vencedorId !== undefined);

  // Foco no título, não num botão: o Enter da última carta não pode virar clique.
  useEffect(() => tituloRef.current?.focus(), []);

  // O resto da mesa sai do alcance do Tab e do leitor de tela.
  useEffect(() => {
    const fundo = fundoRef.current;
    const irmaos = [...(fundo?.parentElement?.children ?? [])].filter((no) => no !== fundo);
    const inertes = irmaos.filter((no) => !no.hasAttribute('inert'));
    for (const no of inertes) no.setAttribute('inert', '');
    return () => {
      for (const no of inertes) no.removeAttribute('inert');
    };
  }, []);

  const pronto = revanche?.prontos.includes(jogadorId) ?? false;
  const desconectado = online && controlador.conectado === false;
  // Confirmado (agora manda o servidor) ou perdido na queda: não prende mais o botão.
  useEffect(() => {
    if (pronto || desconectado) setPedido(false);
  }, [desconectado, pronto]);
  useEffect(() => {
    if (!pedido || pronto) return undefined;
    const timer = window.setTimeout(() => {
      setPedido(false);
      setMensagem('Sem resposta do servidor. Tente de novo.');
    }, ESPERA_DO_PEDIDO_MS);
    return () => window.clearTimeout(timer);
  }, [pedido, pronto]);
  const recusa =
    controlador.aviso?.tipo === 'erro' && controlador.aviso.id !== avisoInicial
      ? controlador.aviso
      : undefined;
  useEffect(() => {
    if (!recusa) return;
    setPedido(false);
    setMensagem(recusa.texto);
  }, [recusa]);

  const foraDaRevanche =
    revanche !== undefined &&
    revanche.possiveis.length > 0 &&
    !revanche.possiveis.includes(jogadorId);
  const restante = useRestante(
    revanche?.restanteMs === undefined ? undefined : revanche.recebidaEm + revanche.restanteMs,
  );
  const desligado = online && (pronto || pedido || foraDaRevanche || desconectado);
  const prontos = revanche?.prontos ?? [];
  const totalPossiveis = Math.max(revanche?.possiveis.length ?? 0, prontos.length);

  const jogarDeNovo = (): void => {
    if (desligado) return;
    if (online) {
      setPedido(true);
      setMensagem('');
    }
    onJogarDeNovo();
  };

  const aoCompartilhar = async (): Promise<void> => {
    if (compartilhando) return;
    setCompartilhando(true);
    setMensagem('');
    const link = linkDoJogo(undefined);
    const meu = estado.jogadores.find((jogador) => jogador.id === jogadorId)?.nome;
    const tituloPublico =
      vencedorId === undefined
        ? 'Partida encerrada'
        : venci && meu === 'Você'
          ? 'Venci a partida!'
          : `${nomePublico(vencedorId)} venceu!`;
    const premiosPublicos = premios.map((premio) => {
      const nome = nomePublico(premio.jogadorId);
      return {
        titulo: premio.titulo,
        nome: premio.jogadorId === jogadorId && nome === 'Você' ? 'eu' : nome,
        detalhe: premio.detalhe,
      };
    });
    const resultado = await compartilhar({
      titulo: 'Kabemjunto',
      texto: [
        `Kabemjunto: ${tituloPublico}`,
        ...premiosPublicos.map((premio) => `${premio.titulo}: ${premio.nome}`),
      ].join('\n'),
      link,
      gerarImagem: () =>
        gerarImagemDoResultado({
          titulo: tituloPublico,
          premios: premiosPublicos,
          endereco: link.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        }),
    });
    setCompartilhando(false);
    setMensagem(
      {
        compartilhado: 'Resultado compartilhado.',
        copiado: 'Texto e link copiados.',
        cancelado: '',
        erro: 'Não foi possível compartilhar neste aparelho.',
      }[resultado],
    );
  };

  const aoTeclar = (evento: KeyboardEvent): void => {
    if (evento.key === 'Escape') {
      // Não há o que fechar: Esc leva à saída, sem tirar ninguém da sala sem querer.
      evento.preventDefault();
      menuRef.current?.focus();
      return;
    }
    if (evento.key !== 'Tab') return;
    const focaveis = [
      ...(dialogoRef.current?.querySelectorAll<HTMLElement>('button, [tabindex="0"]') ?? []),
    ];
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = document.activeElement;
    if (evento.shiftKey && (ativo === primeiro || ativo === tituloRef.current)) {
      evento.preventDefault();
      ultimo?.focus();
    } else if (!evento.shiftKey && ativo === ultimo) {
      evento.preventDefault();
      primeiro?.focus();
    }
  };

  return (
    <div ref={fundoRef} className="fim" role="presentation" onKeyDown={aoTeclar}>
      <section
        ref={dialogoRef}
        className="fim-painel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fim-titulo"
      >
        <header className="fim-topo">
          <span className="fim-icone" aria-hidden="true">
            {vencedorId === undefined ? '🏁' : venci ? '🏆' : '👑'}
          </span>
          <h2 id="fim-titulo" ref={tituloRef} tabIndex={-1}>
            {titulo}
          </h2>
          <p>
            {vencedorId === undefined
              ? 'A partida terminou sem vencedor.'
              : venci
                ? 'Parabéns! Você limpou a mão primeiro.'
                : `${nomePublico(vencedorId)} limpou a mão primeiro.`}
          </p>
        </header>

        {(premios.length > 0 || placar.length > 0) && (
          <div className="fim-corpo" tabIndex={0} role="group" aria-label="Resumo da partida">
            {premios.length > 0 && (
              <section aria-labelledby="fim-premios">
                <h3 id="fim-premios">Prêmios</h3>
                <ul className="fim-premios">
                  {premios.map((premio) => (
                    <li key={premio.id}>
                      <strong>{premio.titulo}</strong>
                      <span className="fim-premiado">{nomeDe(premio.jogadorId)}</span>
                      <small>{premio.detalhe}</small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {fim?.placar && placar.length > 0 && (
              <section aria-labelledby="fim-placar">
                <h3 id="fim-placar">
                  Placar da sessão ({fim.placar.partidas}{' '}
                  {fim.placar.partidas === 1 ? 'partida' : 'partidas'})
                </h3>
                <ol className="fim-placar">
                  {placar.map(({ jogadorId: id, vitorias }) => (
                    <li key={id} className={id === jogadorId ? 'fim-placar-eu' : undefined}>
                      <span>{nomeDe(id)}</span>
                      <strong>
                        {vitorias} {vitorias === 1 ? 'vitória' : 'vitórias'}
                      </strong>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}

        <footer className="fim-acoes">
          {online && (
            <p className="fim-revanche" role="status">
              {desconectado
                ? 'Sem conexão. Reconectando…'
                : foraDaRevanche
                  ? 'Não dá mais para entrar nesta revanche.'
                  : prontos.length > 0
                    ? `${prontos.length} de ${totalPossiveis} prontos: ${prontos.map(nomeDe).join(', ')}.`
                    : ''}
            </p>
          )}
          {revanche?.restanteMs !== undefined && prontos.length > 0 && (
            <p className="fim-contagem" aria-hidden="true">
              {restante > 0
                ? `Começa em ${Math.ceil(restante / 1000)} s. Bots ocupam as outras vagas.`
                : 'Começando…'}
            </p>
          )}
          <button
            type="button"
            className="mesa3d-botao-primario"
            // `disabled` derrubaria o foco para fora do diálogo.
            aria-disabled={desligado}
            onClick={jogarDeNovo}
          >
            {!online
              ? 'Jogar de novo'
              : pronto
                ? 'Esperando a mesa…'
                : pedido
                  ? 'Pedindo revanche…'
                  : 'Jogar de novo com a mesma mesa'}
          </button>
          <div className="fim-acoes-extras">
            <button
              type="button"
              className="mesa3d-botao-secundario"
              aria-disabled={compartilhando}
              onClick={() => void aoCompartilhar()}
            >
              Compartilhar
            </button>
            <button
              ref={menuRef}
              type="button"
              className="mesa3d-botao-secundario"
              onClick={onVoltarAoMenu}
            >
              Voltar ao menu
            </button>
          </div>
          <p className="fim-mensagem" role="status">
            {mensagem}
          </p>
        </footer>
      </section>
    </div>
  );
}
