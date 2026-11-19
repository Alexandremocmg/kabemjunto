import { useEffect, useRef, useState } from 'react';
import type { ServerChatEvent } from '@kabemjunto/shared';

/** Tempo que o balão de uma fala fica sobre o assento de quem falou. */
export const DURACAO_BALAO_MS = 5000;

/**
 * Última fala de cada jogador, enquanto o balão estiver visível.
 * Cada mensagem nova reinicia o tempo do balão daquele jogador.
 */
export function useBaloesDeFala(
  mensagens: ReadonlyArray<ServerChatEvent>,
): ReadonlyMap<string, string> {
  const [baloes, setBaloes] = useState<ReadonlyMap<string, string>>(new Map());
  const vistas = useRef(new WeakSet<ServerChatEvent>());
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const ultimas = new Map<string, ServerChatEvent>();
    for (const mensagem of mensagens) ultimas.set(mensagem.jogadorId, mensagem);
    for (const [jogadorId, mensagem] of ultimas) {
      if (vistas.current.has(mensagem)) continue;
      vistas.current.add(mensagem);
      const anterior = timers.current.get(jogadorId);
      if (anterior !== undefined) window.clearTimeout(anterior);
      setBaloes((atuais) => new Map(atuais).set(jogadorId, mensagem.texto));
      timers.current.set(
        jogadorId,
        window.setTimeout(() => {
          timers.current.delete(jogadorId);
          setBaloes((atuais) => {
            const proximos = new Map(atuais);
            proximos.delete(jogadorId);
            return proximos;
          });
        }, DURACAO_BALAO_MS),
      );
    }
  }, [mensagens]);

  useEffect(() => {
    const ativos = timers.current;
    return () => ativos.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return baloes;
}
