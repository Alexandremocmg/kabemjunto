import { useState } from 'react';
import { compartilhar } from '../services/compartilhar';
import { linkDoJogo } from '../services/convite';

/** Sala de espera criada à mão: manda o link que já preenche o código. */
export function ConvidarSala({ salaId, grupoRanking }: { salaId: string; grupoRanking?: string }) {
  const [mensagem, setMensagem] = useState('');
  const [linkManual, setLinkManual] = useState<string>();

  const convidar = async (): Promise<void> => {
    setMensagem('');
    setLinkManual(undefined);
    const link = linkDoJogo(salaId, undefined, grupoRanking);
    const resultado = await compartilhar({
      titulo: 'Kabemjunto',
      texto: `Vem jogar Kabemjunto comigo! Sala ${salaId}.`,
      link,
    });
    if (resultado === 'erro' && grupoRanking) setLinkManual(link);
    setMensagem(
      {
        compartilhado: 'Convite enviado.',
        copiado: 'Link do convite copiado.',
        cancelado: '',
        erro: grupoRanking
          ? 'Copie o link do convite no campo abaixo.'
          : 'Não foi possível convidar por aqui. Passe o código da sala.',
      }[resultado],
    );
  };

  return (
    <>
      <button type="button" className="button button-secondary" onClick={() => void convidar()}>
        Convidar
      </button>
      <p className="muted" role="status">
        {mensagem}
      </p>
      {linkManual && (
        <input
          aria-label="Link do convite"
          readOnly
          value={linkManual}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </>
  );
}
