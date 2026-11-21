import { useEffect, useState } from 'react';

/**
 * Diz se o navegador está sem rede. Serve para o menu avisar que só a partida
 * contra bots funciona agora (o PWA abre offline, mas salas precisam do servidor).
 */
export function useSemInternet(): boolean {
  const [semInternet, setSemInternet] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );

  useEffect(() => {
    const voltou = () => setSemInternet(false);
    const caiu = () => setSemInternet(true);
    window.addEventListener('online', voltou);
    window.addEventListener('offline', caiu);
    return () => {
      window.removeEventListener('online', voltou);
      window.removeEventListener('offline', caiu);
    };
  }, []);

  return semInternet;
}
