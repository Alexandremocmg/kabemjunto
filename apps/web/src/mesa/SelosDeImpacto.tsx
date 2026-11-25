/**
 * Selos curtos sobre o jogador afetado. Só reforço visual: `aria-hidden`, pois
 * o `aria-live` da mesa já narra, e sem capturar toques.
 */
import type { CSSProperties } from 'react';
import { rotuloDoImpacto } from './impactos';
import type { Selo } from './useSelosDeImpacto';
import './selosDeImpacto.css';

interface SeloDeImpactoProps {
  selo: Selo | undefined;
  onde: 'assento' | 'mao' | 'ficha';
  style?: CSSProperties | undefined;
}

export function SeloDeImpacto({ selo, onde, style }: SeloDeImpactoProps) {
  if (!selo) return null;
  const { tipo, jogadorId } = selo.impacto;
  const { simbolo, texto } = rotuloDoImpacto(selo.impacto);
  return (
    <span
      key={selo.chave}
      className={`selo-impacto selo-impacto-${onde} selo-impacto-${tipo}`}
      style={style}
      data-impacto={tipo}
      data-jogador={jogadorId}
      aria-hidden="true"
    >
      <span className="selo-impacto-corpo">
        <span>{simbolo}</span>
        {texto}
      </span>
    </span>
  );
}

interface SelosDeImpactoProps {
  selos: ReadonlyMap<string, Selo>;
  jogadorId: string;
  /** Posição projetada dos assentos (3D); na 2D o selo do adversário fica na ficha. */
  assentos: Readonly<Record<string, { x: number; y: number }>> | undefined;
}

export function SelosDeImpacto({ selos, jogadorId, assentos }: SelosDeImpactoProps) {
  return (
    <>
      {[...selos].map(([id, selo]) => {
        if (id === jogadorId) return <SeloDeImpacto key={id} selo={selo} onde="mao" />;
        const posicao = assentos?.[id];
        if (!posicao) return null;
        // Presos à tela: assentos na borda não cortam o texto.
        const folga = selo.impacto.tipo === 'REFLETIDO' ? 92 : 52;
        return (
          <SeloDeImpacto
            key={id}
            selo={selo}
            onde="assento"
            style={{
              left: `clamp(${folga}px, ${posicao.x}px, calc(100% - ${folga}px))`,
              top: posicao.y,
            }}
          />
        );
      })}
    </>
  );
}
