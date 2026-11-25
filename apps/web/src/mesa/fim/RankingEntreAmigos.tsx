import type { CategoriaSemanal, RankingSemanal } from '@kabemjunto/shared';

function Categoria({ titulo, categoria }: { titulo: string; categoria: CategoriaSemanal }) {
  const posicao =
    categoria.minhaPosicao === undefined ? 'Sem posição' : `${categoria.minhaPosicao}º lugar`;
  return (
    <details className="fim-ranking-categoria">
      <summary>
        <strong>{titulo}</strong>
        <span>
          {posicao} · {categoria.meuTotal} na semana
          {categoria.nestaPartida > 0 ? ` · +${categoria.nestaPartida} nesta partida` : ''}
        </span>
      </summary>
      {categoria.top.length === 0 ? (
        <p>Ainda não há pontuação nesta categoria.</p>
      ) : (
        <ol className="fim-placar">
          {categoria.top.map(({ posicao, apelido, total, eu }, indice) => (
            <li key={indice} className={eu ? 'fim-placar-eu' : undefined}>
              <span>
                {posicao}º {eu ? `${apelido} (você)` : apelido}
              </span>
              <strong>{total}</strong>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

export function RankingEntreAmigos({ ranking }: { ranking: RankingSemanal }) {
  const [ano, mes, dia] = ranking.semana.split('-');
  return (
    <section aria-labelledby="fim-ranking">
      <h3 id="fim-ranking">Ranking semanal entre amigos</h3>
      <p>
        Semana de {dia}/{mes}/{ano} · horário de Brasília
      </p>
      {!ranking.contou && (
        <p>Sem pontos nesta partida. Só partidas concluídas entre pessoas entram no ranking.</p>
      )}
      <Categoria
        titulo={`Mais vitórias · Mesa de ${ranking.tamanhoMesa}`}
        categoria={ranking.vitorias}
      />
      <Categoria titulo="Mais joga" categoria={ranking.partidas} />
      <Categoria titulo="Mestre do 0+" categoria={ranking.reflexos} />
    </section>
  );
}
