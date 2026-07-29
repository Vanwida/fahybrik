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
// Y hay una segunda regla, la de girar el móvil: EL TRAMO DECIDE LA CARA; EL
// FORMATO NUNCA SUELTA LA FRANJA. En apaisado, si el tramo lo mide una máquina
// conectada la pantalla se vuelve un instrumento; si se cuenta a pulso, manda
// el formato. En las dos, la franja de la derecha sigue con la ventana, el
// marcador y el toque de cerrar ronda. Vive en `cara-horizontal.tsx`.
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
    'Tiempo fijo, rondas libres. El reloj gobierna como ambiente y la ronda manda como sujeto: se toca en medio lienzo y la pantalla late al sumar. Al girar, el tramo decide la cara (el remo lo mide el monitor; los burpees los cuentas tú) y la franja del formato no se suelta nunca.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'en-faena',
    // 3:40 y no 4:20: la ronda 4 cerró en 7:40 y el guion entra 40 s después.
    // El título de un escenario es copy que afirma un número, y tiene que
    // cuadrar con lo que pinta la pantalla.
    titulo: 'En faena · 4 rondas, quedan 3:40',
    descripcion:
      'De pie: el sujeto es la ronda y el tiempo drena en el aro. Gíralo y el cursor está en el remo, así que sale la cara de monitor con las calorías. Cuando el monitor llega a 10, cierra el tramo solo y la cara cambia delante de ti.',
  },
  {
    id: 'ultimo-minuto',
    titulo: 'Último minuto · el ambiente sube',
    descripcion:
      'La misma pantalla con 60 s por delante: el aro se calienta a naranja y el copy aprieta. Aquí el cursor está en los burpees, que no los mide nadie, así que en apaisado manda el formato. Si la dejas correr, la bocina te lleva al sellado.',
  },
  {
    id: 'sellado',
    titulo: 'La bocina · 6 rondas y lo que llevabas',
    descripcion:
      'Sella lo medido y pregunta UNA vez por lo que quedó a medias. Con el contador a cero se guarda «6 rondas y 10 reps», que es verdad; las 4 del remo solo entran si las pones tú. Al girar, el desglose se va al lado en vez de plegarse.',
  },
];

export function Screen({ escenario, orientation, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      {escenario === 'sellado' ? (
        <Sellado
          rondas={SPLITS_GUION_S.map((duracionS, i) => ({ indice: i + 1, duracionS }))}
          repsMarcadas={MOVIMIENTOS.slice(0, SELLADO.marcados).reduce((n, m) => n + m.dosis, 0)}
          movimientoEnCurso={MOVIMIENTOS[SELLADO.marcados] ?? null}
          pulsoMaxPpm={PULSO_MAX_PPM}
          orientation={orientation}
          onLog={onLog}
        />
      ) : (
        <EscenaViva
          arranque={escenario === 'ultimo-minuto' ? 'ultimo-minuto' : 'en-faena'}
          orientation={orientation}
          onLog={onLog}
        />
      )}
    </div>
  );
}
