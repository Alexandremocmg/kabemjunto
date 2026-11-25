import { caminhoDoAvatar } from '../../services/avatar';

/** Desenhos já pedidos nesta página (no máximo 12). */
const imagens = new Map<string, HTMLImageElement>();

/** Desenho do avatar, se já carregou; senão começa a carregar e chama `aoCarregar`. */
export function imagemDoAvatar(
  avatar: string,
  aoCarregar?: () => void,
): HTMLImageElement | undefined {
  const caminho = caminhoDoAvatar(avatar);
  if (!caminho) return undefined;
  let imagem = imagens.get(caminho);
  if (!imagem) {
    imagem = new Image();
    imagem.src = caminho;
    imagens.set(caminho, imagem);
  }
  if (imagem.complete && imagem.naturalWidth > 0) return imagem;
  // O mesmo ouvinte não entra duas vezes no mesmo elemento.
  if (aoCarregar) imagem.addEventListener('load', aoCarregar, { once: true });
  return undefined;
}
