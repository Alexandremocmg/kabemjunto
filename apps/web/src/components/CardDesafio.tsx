import { useEffect, useId, useRef, useState } from 'react';
import { compartilhar, copiarTexto } from '../services/compartilhar';
import { FRASE_DESAFIO, linkDoJogo } from '../services/convite';
import './cardDesafio.css';

function lerImagem(imagem: Blob): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      if (typeof leitor.result === 'string') resolver(leitor.result);
      else rejeitar(new Error('Prévia indisponível'));
    };
    leitor.onerror = () => rejeitar(leitor.error);
    leitor.readAsDataURL(imagem);
  });
}

function DialogoDesafio({ salaId, fechar }: { salaId: string; fechar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const link = linkDoJogo(salaId);
  const desafio = FRASE_DESAFIO.join(' ');
  const [card, setCard] = useState<{ imagem: Blob; previa: string }>();
  const [falhou, setFalhou] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [copiarManual, setCopiarManual] = useState(false);

  useEffect(() => {
    if (!dialogo.current?.open) dialogo.current?.showModal();
  }, []);

  useEffect(() => {
    let ativo = true;
    void import('../services/imagemDoDesafio')
      .then(({ gerarImagemDoDesafio }) => gerarImagemDoDesafio(salaId, link))
      .then(async (imagem) => {
        if (!ativo) return;
        const previa = await lerImagem(imagem);
        if (ativo) setCard({ imagem, previa });
      })
      .catch(() => {
        if (ativo) setFalhou(true);
      });
    return () => {
      ativo = false;
    };
  }, [link, salaId]);

  async function compartilharStatus(): Promise<void> {
    if (!card) return;
    setMensagem('');
    const resultado = await compartilhar({
      titulo: 'Desafio Kabemjunto',
      texto: `${desafio} A mesa tá aberta. Encara?`,
      link,
      imagem: card.imagem,
      somenteImagem: true,
    });
    if (resultado === 'erro') {
      setMensagem(
        'Baixe a imagem para publicar no Status e use Copiar link para incluir o convite.',
      );
    }
  }

  async function copiar(): Promise<void> {
    try {
      await copiarTexto(link);
      setCopiarManual(false);
      setMensagem('Link do convite copiado.');
    } catch {
      setCopiarManual(true);
      setMensagem('Selecione e copie o link no campo abaixo.');
    }
  }

  return (
    <dialog ref={dialogo} className="card-desafio" aria-labelledby={titulo} onClose={fechar}>
      <div className="card-desafio-conteudo">
        <header>
          <h2 id={titulo}>Card de desafio</h2>
          <form method="dialog">
            <button type="submit" className="button button-secondary">
              Fechar
            </button>
          </form>
        </header>
        {card ? (
          <img src={card.previa} alt={`${desafio} QR do convite para a sala ${salaId}.`} />
        ) : (
          <p role="status">
            {falhou
              ? 'Não foi possível gerar o card. Você ainda pode copiar o link.'
              : 'Gerando o card…'}
          </p>
        )}
        <div className="card-desafio-acoes">
          <button
            type="button"
            className="button button-primary"
            disabled={!card}
            onClick={() => void compartilharStatus()}
          >
            Compartilhar no Status
          </button>
          {card && (
            <a
              className="button button-secondary"
              href={card.previa}
              download={`kabemjunto-desafio-${salaId}.png`}
            >
              Baixar imagem
            </a>
          )}
          <button type="button" className="button button-secondary" onClick={() => void copiar()}>
            Copiar link
          </button>
        </div>
        {mensagem && <p role="status">{mensagem}</p>}
        {copiarManual && (
          <input
            aria-label="Link do convite"
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
      </div>
    </dialog>
  );
}

export function CardDesafio({ salaId }: { salaId: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button button-secondary"
        aria-haspopup="dialog"
        onClick={() => setAberto(true)}
      >
        Card de desafio
      </button>
      {aberto && <DialogoDesafio salaId={salaId} fechar={() => setAberto(false)} />}
    </>
  );
}
