import { useState } from 'react';
import { compartilhar } from '../services/compartilhar';
import { linkDoJogo } from '../services/convite';

/** Sala de espera criada à mão: manda o link que já preenche o código. */
export function ConvidarSala({ salaId }: { salaId: string }) {
  const [mensagem, setMensagem] = useState('');

  const convidar = async (): Promise<void> => {
    setMensagem('');
    const resultado = await compartilhar({
      titulo: 'Kabemjunto',
      texto: `Vem jogar Kabemjunto comigo! Sala ${salaId}.`,
      link: linkDoJogo(salaId),
    });
    setMensagem(
      {
        compartilhado: 'Convite enviado.',
        copiado: 'Link do convite copiado.',
        cancelado: '',
        erro: 'Não foi possível convidar por aqui. Passe o código da sala.',
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
    </>
  );
}
