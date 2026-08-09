'use client';

// Las series de calle, en la muñeca. Ver `guion.ts` para el porqué de los dos
// modos y de los dos escenarios.
//
// EL BISEL DIBUJA LA FASE ENTERA, no la serie en la que estás: los cinco tramos
// fuertes en naranja y sus cinco trotes en gris, y el brillo diciendo cuáles ya
// están hechos. Antes eran dos aros distintos —uno que contaba series y otro que
// drenaba en la recuperación—, así que la mitad del entreno no salía en el aro y
// la referencia de dónde estabas se perdía justo al parar. El reparto y los dos
// ejes (hue = qué es, brillo = dónde estás) viven en `kit-watch/bisel.tsx`, y su
// original en `FormaDelAro` + `WatchAroEstructura`.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroEstructura, Reloj, W, tinteDe, type ArcoDeTramo, type EstadoDestello } from '../../kit-watch';
import { SERIES_CALLE, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { DESDE_S, anterior, bpmDe, cierreM, metrosDe, paginas, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-series',
  titulo: 'Muñeca · series de calle',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-09',
  descripcion:
    'El bisel dibuja la fase entera —las cinco series en naranja y sus cinco trotes en gris— y el brillo dice por cuál vas. Dentro de la serie se mira y no se toca; en la recuperación se decide. Y si el coach no escribió los metros, el tramo lo cierras tú y el reloj deja de prometer cuánto falta.',
  fuentes: [],
  enApp:
    'StructuredRunLiveView shipea el aro de estructura (FormaDelAro), ritmo por tramo, banda de objetivo y recuperación; el afinado sigue aquí.',
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

/**
 * LA FASE ENTERA, DIBUJADA EN EL BISEL — cinco series y sus cinco trotes.
 *
 * Van los diez tramos y no cinco porque la fase es cinco veces (serie +
 * recuperación): el trote también es entreno, y hasta ahora no existía en el
 * aro justo en el rato en el que hay tiempo para mirarlo.
 *
 * Y PESAN TODOS IGUAL, que es el último peldaño del reparto por orden de
 * evidencia (`FormaDelAro.pesos`) y aquí se llega hasta él en los DOS
 * escenarios: de la serie no se saben los segundos —el ritmo lo mide el GPS,
 * nadie escribió uno— y de la recuperación no se saben los metros —son 90 s de
 * trote—. Sin una unidad común a los diez tramos no hay proporción que
 * prometer, así que el aro dice lo que sí sabe: el on/off y por dónde vas.
 */
const ARCOS: ArcoDeTramo[] = Array.from({ length: SERIES_CALLE.total * 2 }, (_, i) => ({
  trabajo: i % 2 === 0,
  peso: 1,
}));

/**
 * El tramo en curso dentro de esa lista: cada serie ocupa dos, el trabajo en el
 * índice par y su recuperación en el impar. Durante la recuperación `serie` ya
 * es la que VIENE, así que la que corre es la anterior.
 */
function tramoEnCurso(e: Estado): number {
  if (e.fase === 'recupera') return (anterior(e.serie) - 1) * 2 + 1;
  return (e.serie - 1) * 2;
}

/**
 * EL RELLENO DEL TRAMO EN CURSO ES UNA PREDICCIÓN, y sólo se puede predecir
 * contra un total que alguien sepa. La recuperación lo tiene siempre (90 s que
 * cuenta el reloj); la serie, sólo cuando el coach escribió los metros. Sin
 * ellos se queda a cero: el arco a medio brillo ya dice «estás en la tercera de
 * cinco», que es verdad, y no «llevas media serie», que nadie sabe.
 */
function fraccionDelTramo(e: Estado): number {
  if (e.fase === 'recupera') return e.t / SERIES_CALLE.recuperacionS;
  if (e.objetivoM == null) return 0;
  return Math.min(1, metrosDe(e.t) / e.objetivoM);
}

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

  return (
    <Reloj
      paginas={paginas(e, { cerrarSerie, empezarYa })}
      // En la recuperación el lienzo es el VERDE de recuperar, que es un estado
      // y no una zona; corriendo es tu zona, si es que la hay — y hoy no la hay.
      tinte={enRecuperacion ? W.zoneGreen : tinteDe(bpmDe(e), e.ancla)}
      // El aro NO cambia de tipo al entrar la recuperación: es la misma fase y
      // el mismo dibujo, y lo único que se mueve es dónde estás dentro de él.
      bisel={
        <AroEstructura arcos={ARCOS} enCurso={tramoEnCurso(e)} fraccion={fraccionDelTramo(e)} />
      }
      destello={destello}
      onLog={onLog}
    />
  );
}
