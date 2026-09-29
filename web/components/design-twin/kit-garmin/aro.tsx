'use client';

// EL ARO = LA SESIÓN, en el borde del círculo (radio 0,485 D, grosor 0,035 D).
//
// El dato es el de la muñeca (`arcosDePlan` y `fraccionDelPaso` de kit-reloj:
// un arco por paso, el trabajo de la parte principal en naranja, lo demás en
// gris, repartidos por su duración estimada); aquí solo cambia la forma: un
// círculo en vez del rectángulo redondeado del Apple Watch. El brillo dice
// dónde estás (hecho, en curso, por venir) con los niveles de `BRILLO_ARO`,
// que en MIP suben para que lo pendiente no se vuelva negro.
//
// Un aviso fuera de objetivo (afloja / aprieta) hace DESTELLAR el aro — dos
// golpes de tinta, sin fundido (en MIP no hay media luz) y sin tinte nuevo.
//
// Qué NO hacer: dibujar en el aro nada que no sea la sesión; usar el naranja
// para lo que no es trabajo.

import { arcosDePlan, fraccionDelPaso, type Estimador } from '../kit-reloj/aro';
import type { Lecturas, PasoBase } from '../kit-reloj/paso';
import { ARO } from './geometria';
import { DESTELLO_MS, useGarmin } from './pintar';
import { BRILLO_ARO, CG, TIEMPO, sobreNegro } from './tokens';

/** El hueco entre dos arcos, en fracción del perímetro (se estrecha si hay muchos). */
const HUECO_ARCO = 0.006;

export function AroGarmin({
  pasos,
  i,
  paso,
  lecturas,
  duracion,
  destello,
}: {
  pasos: PasoBase[];
  i: number;
  paso: PasoBase;
  lecturas: Lecturas;
  duracion?: Estimador;
  /** Cambia (un número nuevo) cada vez que hay que destellar; `null` = quieto. */
  destello?: number | null;
}) {
  const { D, tamano, pinta } = useGarmin();
  const arcos = arcosDePlan(pasos, duracion);
  if (arcos.length === 0) return null;
  const r = ARO.radio * D;
  const grueso = ARO.grosor * D;
  const perimetro = 2 * Math.PI * r;
  // Sin pesos utilizables el aro no se calla: reparte a partes iguales (como el de la muñeca).
  const brutos = arcos.map((a) => Math.max(0, a.peso));
  const pesos = brutos.some((p) => p > 0) ? brutos : brutos.map(() => 1);
  const suma = pesos.reduce((a, p) => a + p, 0);
  const hueco = Math.min(HUECO_ARCO * perimetro, perimetro / (arcos.length * 4));
  const arranques = pesos.reduce<number[]>((acc, p) => [...acc, acc[acc.length - 1]! + (p / suma) * perimetro], [0]);
  const brillo = BRILLO_ARO[tamano.tec];
  const avance = fraccionDelPaso(paso, lecturas);
  const color = (trabajo: boolean, b: number) => pinta(sobreNegro(trabajo ? CG.accion : CG.recupera, b));
  const trazo = (largo: number, inicio: number, c: string, k: string) => (
    <circle
      key={k}
      cx={D / 2}
      cy={D / 2}
      r={r}
      fill="none"
      stroke={c}
      strokeWidth={grueso}
      strokeDasharray={`${Math.max(0, largo)} ${perimetro}`}
      strokeDashoffset={-inicio}
      style={{ transition: tamano.tec === 'amoled' ? `stroke-dasharray ${TIEMPO.avanceAroMs}ms linear` : undefined }}
    />
  );
  return (
    <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transform: 'rotate(-90deg)' }}>
      {arcos.map((a, k) => {
        const inicio = arranques[k]! + hueco / 2;
        const largo = arranques[k + 1]! - arranques[k]! - hueco;
        const b = k < i ? brillo.hecho : k === i ? brillo.enCurso : brillo.pendiente;
        return (
          <g key={k}>
            {trazo(largo, inicio, color(a.trabajo, b), 'base')}
            {k === i && avance > 0 ? trazo(largo * avance, inicio, color(a.trabajo, brillo.hecho), 'hecho') : null}
          </g>
        );
      })}
      {destello != null ? (
        <circle
          key={`destello-${destello}`}
          cx={D / 2}
          cy={D / 2}
          r={r}
          fill="none"
          stroke={pinta(CG.tinta)}
          strokeWidth={grueso}
          style={{ opacity: 0, animation: `garmin-destello ${DESTELLO_MS}ms steps(1, end)` }}
        />
      ) : null}
    </svg>
  );
}
