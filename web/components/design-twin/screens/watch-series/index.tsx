'use client';

// Las series de calle, en la muñeca. Ver `guion.ts` para el porqué de los dos
// modos y de los dos escenarios.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroContinuo, AroSegmentado, Reloj, W, tinteDe, type EstadoDestello } from '../../kit-watch';
import { SERIES_CALLE, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { DESDE_S, bpmDe, cierreM, metrosDe, paginas, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-series',
  titulo: 'Muñeca · series de calle',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'Dentro de la serie se mira y no se toca; en la recuperación se decide. Y si el coach no escribió los metros, el tramo lo cierras tú y el reloj deja de prometer cuánto falta.',
  fuentes: [],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-objetivo',
    titulo: 'El mínimo · sin objetivo',
    descripcion:
      'Ejecución 104: las cinco repeticiones salieron 1600, 1176, 1200, 1220 y 950 m. Esa dispersión dice que los tramos los cerró el atleta y no un hito, así que el sujeto son los metros que llevas y el aro no adivina cuánto falta.',
  },
  {
    id: 'con-objetivo',
    titulo: 'Con objetivo prescrito',
    descripcion:
      'El coach escribe 1200 m por serie. Entonces sí manda lo que falta, el hito cierra el tramo solo, el aro puede llenarse y la pantalla deja de ser un botón mientras corres.',
  },
];

function inicial(escenario: string): Estado {
  // Las dos arrancan en el mismo punto de la serie (1.000 m dentro) para que la
  // única diferencia visible entre los escenarios sea la que se está juzgando.
  const base = { ancla: SIN_ANCLA, fase: 'trabajo', serie: SERIES_CALLE.actual, t: DESDE_S } as const;
  return escenario === 'con-objetivo'
    ? { ...base, objetivoM: SERIES_CALLE.objetivoM }
    : { ...base, objetivoM: null };
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual.
  const cerrarSerie = () => {
    const ultima = e.serie >= SERIES_CALLE.total;
    const metros = Math.round(metrosDe(e.t));
    setE({ ...e, fase: 'recupera', t: 0, serie: ultima ? 1 : e.serie + 1 });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(
      e.objetivoM == null
        ? `Serie ${e.serie} de ${SERIES_CALLE.total} · la cerraste tú a los ${metros} m`
        : `Serie ${e.serie} de ${SERIES_CALLE.total} · hito de ${e.objetivoM} m`,
    );
  };

  const empezarYa = () => {
    setE({ ...e, fase: 'trabajo', t: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
    onLog(
      e.objetivoM == null
        ? `Serie ${e.serie} de ${SERIES_CALLE.total}`
        : `Serie ${e.serie} de ${SERIES_CALLE.total} · ${e.objetivoM} m`,
    );
  };

  // La recuperación se agota sola. La serie se cierra en el hito cuando lo hay;
  // cuando no, la reproducción cierra donde cerró el atleta de verdad.
  useTicker(true, () => {
    if (e.fase === 'recupera') {
      if (e.t + 1 >= SERIES_CALLE.recuperacionS) empezarYa();
      else setE({ ...e, t: e.t + 1 });
      return;
    }
    if (metrosDe(e.t + 1) >= cierreM(e)) cerrarSerie();
    else setE({ ...e, t: e.t + 1 });
  });

  const enRecuperacion = e.fase === 'recupera';
  const queda = Math.max(0, SERIES_CALLE.recuperacionS - e.t);
  const objetivo = e.objetivoM;

  return (
    <Reloj
      paginas={paginas(e, { cerrarSerie, empezarYa })}
      // En la recuperación el lienzo es el VERDE de recuperar, que es un estado
      // y no una zona; corriendo es tu zona, si es que la hay — y hoy no la hay.
      tinte={enRecuperacion ? W.zoneGreen : tinteDe(bpmDe(e), e.ancla)}
      bisel={
        enRecuperacion ? (
          <AroContinuo fraccion={queda / SERIES_CALLE.recuperacionS} />
        ) : (
          <AroSegmentado
            total={SERIES_CALLE.total}
            hechas={e.serie - 1}
            // EL RELLENO DEL TRAMO EN CURSO ES UNA PREDICCIÓN, y sólo se puede
            // predecir contra un total prescrito. Sin objetivo se queda a cero:
            // el aro dice «vas por la tercera de cinco», que es verdad, y no
            // «llevas media serie», que nadie sabe.
            fraccion={objetivo == null ? 0 : Math.min(1, metrosDe(e.t) / objetivo)}
          />
        )
      }
      destello={destello}
      onLog={onLog}
    />
  );
}
