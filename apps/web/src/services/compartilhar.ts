/** Compartilha o resultado: imagem, senão texto com link, senão copia o texto. */
export type ResultadoDeCompartilhar = 'compartilhado' | 'copiado' | 'cancelado' | 'erro';

export interface Compartilhavel {
  titulo: string;
  texto: string;
  link: string;
  /** Desenhada no aparelho; `undefined` se não deu. */
  gerarImagem?: () => Promise<Blob | undefined>;
}

const cancelou = (erro: unknown): boolean =>
  typeof erro === 'object' && erro !== null && 'name' in erro && erro.name === 'AbortError';

async function copiar(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
    return;
  } catch {
    // Sem permissão ou sem API (página sem HTTPS): copia pelo jeito antigo.
  }
  const focoAnterior = document.activeElement;
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.readOnly = true;
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  campo.select();
  const copiou = document.execCommand?.('copy');
  campo.remove();
  if (focoAnterior instanceof HTMLElement) focoAnterior.focus();
  if (!copiou) throw new Error('não foi possível copiar');
}

export async function compartilhar(item: Compartilhavel): Promise<ResultadoDeCompartilhar> {
  const { titulo, texto, link, gerarImagem } = item;
  const textoComLink = `${texto}\n${link}`;
  if (typeof navigator.share === 'function') {
    try {
      const imagem = await gerarImagem?.().catch(() => undefined);
      const files = imagem ? [new File([imagem], 'kabemjunto.png', { type: 'image/png' })] : [];
      if (files.length > 0 && navigator.canShare?.({ files })) {
        // O link vai no texto: vários aplicativos ignoram `url` junto de arquivos.
        await navigator.share({ files, title: titulo, text: textoComLink });
        return 'compartilhado';
      }
    } catch (erro) {
      if (cancelou(erro)) return 'cancelado';
    }
    try {
      await navigator.share({ title: titulo, text: texto, url: link });
      return 'compartilhado';
    } catch (erro) {
      if (cancelou(erro)) return 'cancelado';
    }
  }
  try {
    await copiar(textoComLink);
    return 'copiado';
  } catch {
    return 'erro';
  }
}
