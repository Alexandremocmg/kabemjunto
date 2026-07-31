import React, { useEffect, useState } from 'react';
import { Carta } from '@kabemjunto/shared/types';
import { CartaView } from './CartaView';

interface InterceptacaoBannerProps {
  cartaAlvo: Carta;
  fechaEm: number;
  /** Cartas da mão do jogador humano que são idênticas à carta alvo (interceptáveis). */
  cartasElegiveis: ReadonlyArray<Carta>;
  onInterceptar: (cartaId: string) => void;
}

/**
 * Banner de "Corta-Frente": mostra a carta alvo, contagem regressiva até
 * `fechaEm` (timestamp absoluto — nunca autoridade real, só feedback visual)
 * e as cartas idênticas na mão do jogador que podem interceptar.
 */
export const InterceptacaoBanner: React.FC<InterceptacaoBannerProps> = ({
  cartaAlvo,
  fechaEm,
  cartasElegiveis,
  onInterceptar,
}) => {
  const [restanteMs, setRestanteMs] = useState(() => Math.max(0, fechaEm - Date.now()));

  useEffect(() => {
    const id = window.setInterval(() => {
      setRestanteMs(Math.max(0, fechaEm - Date.now()));
    }, 100);
    return () => window.clearInterval(id);
  }, [fechaEm]);

  const segundos = Math.ceil(restanteMs / 1000);
  const rotulo =
    cartaAlvo.tipo === 'NUMERADA' ? `${cartaAlvo.valor}` : (cartaAlvo.acao ?? cartaAlvo.tipo);

  return (
    <div className="interceptacao-banner" role="alert" aria-live="assertive">
      <strong>
        Corta-Frente! {rotulo} {cartaAlvo.cor} descartada — {segundos}s para interceptar
      </strong>
      {cartasElegiveis.length > 0 ? (
        <div className="interceptacao-cartas" role="list" aria-label="Cartas que podem interceptar">
          {cartasElegiveis.map((carta) => (
            <button
              key={carta.id}
              type="button"
              className="interceptacao-carta-botao"
              aria-label={`Interceptar com ${rotulo} ${carta.cor}`}
              onClick={() => onInterceptar(carta.id)}
            >
              <CartaView carta={carta} jogavel={true} />
            </button>
          ))}
        </div>
      ) : (
        <span>Você não tem carta idêntica para interceptar.</span>
      )}
    </div>
  );
};
