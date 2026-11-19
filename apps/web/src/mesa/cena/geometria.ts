import { BufferGeometry, Float32BufferAttribute, ShaderMaterial, Color } from 'three';
import { PROPORCAO_CARTA } from '../interacao';

export const LARGURA_CARTA = 1;
export const ALTURA_CARTA = PROPORCAO_CARTA;
export const ESPESSURA_CARTA = 0.03;

/** Índices dos grupos de material da geometria da carta. */
export const GRUPO_FRENTE = 0;
export const GRUPO_VERSO = 1;

/**
 * Ponto da textura usado pela borda: a margem branca que toda face (e o verso)
 * tem no topo. Assim a borda sai no mesmo desenho da frente, sem material próprio.
 */
const UV_MARGEM_BRANCA: [number, number] = [0.5, 0.995];

function contornoArredondado(
  largura: number,
  altura: number,
  raio: number,
  segmentos: number,
): Array<[number, number]> {
  const pontos: Array<[number, number]> = [];
  const cantos: Array<[number, number, number]> = [
    [largura / 2 - raio, altura / 2 - raio, 0],
    [-largura / 2 + raio, altura / 2 - raio, Math.PI / 2],
    [-largura / 2 + raio, -altura / 2 + raio, Math.PI],
    [largura / 2 - raio, -altura / 2 + raio, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, inicio] of cantos) {
    for (let i = 0; i <= segmentos; i += 1) {
      const angulo = inicio + (i / segmentos) * (Math.PI / 2);
      pontos.push([cx + Math.cos(angulo) * raio, cy + Math.sin(angulo) * raio]);
    }
  }
  return pontos;
}

/**
 * Carta com cantos arredondados e espessura, em UMA geometria com dois grupos
 * de material: frente (com a borda) e verso. Dois desenhos por carta. É
 * compartilhada por todas as cartas da cena, inclusive as dos adversários.
 *
 * Fica no plano XY, com a frente apontando para +Z.
 */
export function criarGeometriaCarta(
  largura: number = LARGURA_CARTA,
  altura: number = ALTURA_CARTA,
  espessura: number = ESPESSURA_CARTA,
): BufferGeometry {
  const contorno = contornoArredondado(largura, altura, largura * 0.1, 5);
  const total = contorno.length;
  const posicoes: number[] = [];
  const normais: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const meia = espessura / 2;

  const tampa = (z: number, normalZ: number, espelhar: boolean): number => {
    const base = posicoes.length / 3;
    posicoes.push(0, 0, z);
    normais.push(0, 0, normalZ);
    uvs.push(0.5, 0.5);
    for (const [x, y] of contorno) {
      const u = x / largura + 0.5;
      posicoes.push(x, y, z);
      normais.push(0, 0, normalZ);
      uvs.push(espelhar ? 1 - u : u, y / altura + 0.5);
    }
    return base;
  };

  // Frente (+Z): leque anti-horário.
  const inicioFrente = indices.length;
  const baseFrente = tampa(meia, 1, false);
  for (let i = 0; i < total; i += 1) {
    indices.push(baseFrente, baseFrente + 1 + i, baseFrente + 1 + ((i + 1) % total));
  }

  // Borda: um quad por segmento do contorno, no mesmo grupo da frente.
  for (let i = 0; i < total; i += 1) {
    const [x0, y0] = contorno[i]!;
    const [x1, y1] = contorno[(i + 1) % total]!;
    const nx = y1 - y0;
    const ny = -(x1 - x0);
    const comprimento = Math.hypot(nx, ny) || 1;
    const base = posicoes.length / 3;
    posicoes.push(x0, y0, meia, x1, y1, meia, x1, y1, -meia, x0, y0, -meia);
    for (let j = 0; j < 4; j += 1) {
      normais.push(nx / comprimento, ny / comprimento, 0);
      uvs.push(...UV_MARGEM_BRANCA);
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const fimFrente = indices.length;

  // Verso (-Z): mesmo leque com a ordem invertida e o U espelhado.
  const baseVerso = tampa(-meia, -1, true);
  for (let i = 0; i < total; i += 1) {
    indices.push(baseVerso, baseVerso + 1 + ((i + 1) % total), baseVerso + 1 + i);
  }

  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new Float32BufferAttribute(posicoes, 3));
  geometria.setAttribute('normal', new Float32BufferAttribute(normais, 3));
  geometria.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometria.setIndex(indices);
  geometria.addGroup(inicioFrente, fimFrente - inicioFrente, GRUPO_FRENTE);
  geometria.addGroup(fimFrente, indices.length - fimFrente, GRUPO_VERSO);
  geometria.computeBoundingSphere();
  return geometria;
}

/** Placa plana arredondada, um pouco maior que a carta: é o brilho atrás dela. */
export function criarGeometriaBrilho(): BufferGeometry {
  const largura = LARGURA_CARTA * 1.13;
  const altura = ALTURA_CARTA * 1.09;
  const contorno = contornoArredondado(largura, altura, largura * 0.13, 5);
  const posicoes: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (const [x, y] of contorno) posicoes.push(x, y, 0);
  for (let i = 0; i < contorno.length; i += 1) {
    indices.push(0, 1 + i, 1 + ((i + 1) % contorno.length));
  }
  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new Float32BufferAttribute(posicoes, 3));
  geometria.setIndex(indices);
  geometria.computeBoundingSphere();
  return geometria;
}

/**
 * Anel de contagem regressiva do Corta-Frente. O arco é desenhado no shader a
 * partir de um uniforme, então a contagem não recria geometria a cada quadro.
 */
export function criarMaterialDeContagem(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgresso: { value: 1 },
      uCor: { value: new Color('#ff4d6d') },
      uOpacidade: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgresso;
      uniform vec3 uCor;
      uniform float uOpacidade;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float raio = length(p) * 2.0;
        float anel = smoothstep(0.80, 0.84, raio) * (1.0 - smoothstep(0.96, 1.0, raio));
        float volta = (atan(p.x, p.y) + 3.14159265) / 6.2831853;
        float restante = step(volta, uProgresso);
        float alfa = anel * mix(0.18, 1.0, restante) * uOpacidade;
        if (alfa < 0.01) discard;
        gl_FragColor = vec4(uCor, alfa);
        #include <colorspace_fragment>
      }
    `,
  });
}
