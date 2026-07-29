'use client';

// AMRAP · la ventana y las rondas.
//
// El reparto de poder de este formato, que es lo que la pantalla tiene que
// dejar claro sin que nadie lo explique: LA VENTANA GOBIERNA (drena sola y te
// saca cuando quiere) pero EL TRABAJO LO CUENTAS TÚ (la ronda no avanza si no
// la tocas). Por eso el tiempo es ambiente (el aro que rodea el lienzo) y la
// ronda es el sujeto (el número de 144 pt en el medio, con media pantalla de
// zona de toque debajo del dedo).
//
// Las tres escenas son el MISMO AMRAP en tres instantes: la faena, el último
// minuto y la bocina. Los tiempos de las rondas ya cerradas son guion; los que
// cierres tú mientras miras se miden contra el reloj de verdad de la pantalla.
// Ver `data.ts` para el modelo y su procedencia.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { MOVIMIENTOS, PULSO_MAX_PPM, SELLADO, SPLITS_GUION_S } from './data';
import { EscenaViva } from './escena-viva';
import { Sellado } from './escena-sellado';

export const meta: TwinMeta = {
  id: 'vivo-amrap',
  titulo: 'AMRAP · la ventana y las rondas',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'Tiempo fijo, rondas libres. El reloj gobierna como ambiente y la ronda manda como sujeto: se toca en medio lienzo, la pantalla late al sumar y al final se sella el marcador exacto, sin redondear.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'en-faena',
    titulo: 'En faena · 4 rondas, quedan 4:20',
    descripcion:
      'El sujeto es la ronda; el tiempo drena en el aro. Toca el centro para cerrar una y mira cómo late; marca los movimientos por línea para llevar la parcial.',
  },
  {
    id: 'ultimo-minuto',
    titulo: 'Último minuto · el ambiente sube',
    descripcion:
      'La misma pantalla con 60 s por delante: el aro se calienta a naranja, la ventana crece y el copy aprieta. Si la dejas correr, la bocina te lleva al sellado con lo que hayas hecho.',
  },
  {
    id: 'sellado',
    titulo: 'La bocina · 6 rondas y lo que llevabas',
    descripcion:
      'Sella lo medido y pregunta UNA vez por lo que quedó a medias. Con el contador a cero se guarda «6 rondas y 10 reps», que es verdad; las 4 del remo solo entran si las pones tú.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      {escenario === 'sellado' ? (
        <Sellado
          rondas={SPLITS_GUION_S.map((duracionS, i) => ({ indice: i + 1, duracionS }))}
          repsMarcadas={MOVIMIENTOS.slice(0, SELLADO.marcados).reduce((n, m) => n + m.dosis, 0)}
          movimientoEnCurso={MOVIMIENTOS[SELLADO.marcados] ?? null}
          pulsoMaxPpm={PULSO_MAX_PPM}
          onLog={onLog}
        />
      ) : (
        <EscenaViva arranque={escenario === 'ultimo-minuto' ? 'ultimo-minuto' : 'en-faena'} onLog={onLog} />
      )}
    </div>
  );
}
