// Los cuatro repartos del resumen de una carrera, y de dónde sale cada uno.
//
// PROCEDENCIA, sin adornos. En la base no hay NINGUNA serie de ritmo (el enum
// `biometric_metric` va de `hr` a `weight` y no contempla `pace` ni `speed`) ni
// un solo lap de correr ingerido, y 15 de las 16 ejecuciones en vivo tienen un
// único `segment_executions`. Así que:
//
//   · `sin-tramos` reproduce la forma EXACTA que la app guarda hoy — es el
//     único de los cuatro que la base puede alimentar de verdad.
//   · `marcado` va con datos REALES: las ocho vueltas de correr de la carrera
//     44 (`races.run_splits_json`), que es el único sitio de toda la base donde
//     existe un ritmo por tramo de un atleta.
//   · `detectado` y `rodaje` llevan serie de ritmo, y por tanto son
//     ILUSTRATIVOS: enseñan la pantalla que se podrá construir cuando el dato
//     se guarde. Están generados con una ondulación determinista, no con un
//     aleatorio, para que la pantalla se reproduzca igual en cada visita.

import type { Carrera, Muestra } from '../../tramos';

export interface Escena {
  /** Cómo se llamaba la sesión. */
  titulo: string;
  /** Lo que prescribió el coach, en una línea de gimnasio. */
  prescrito: string;
  /** FC media de la sesión — de ella sale el tinte de zona del lienzo (§10.1). */
  fcMediaPpm: number | null;
  /** FC máxima. Existe de verdad: 156 de los 157 segmentos de correr la tienen. */
  fcMaxPpm: number | null;
  /** De dónde salen los números. Se pinta: el doble no finge producción. */
  procedencia: string;
  carrera: Carrera;
}

// ---------------------------------------------------------------------------
// Generación de la serie (sólo para los escenarios ilustrativos)
// ---------------------------------------------------------------------------

interface Paso {
  dur: number;
  /** s/km. Nulo = parado. */
  skm: number | null;
}

const CADA_S = 5;
/** Ondulación de ±4 s/km: el ruido que tiene de verdad un ritmo por GPS. */
const RUIDO_SKM = 4;

function serie(plan: Paso[]): { muestras: Muestra[]; distanciaM: number; duracionS: number } {
  const muestras: Muestra[] = [];
  let t = 0;
  let metros = 0;
  for (const paso of plan) {
    for (let d = 0; d < paso.dur; d += CADA_S) {
      const skm = paso.skm == null ? null : paso.skm + Math.sin(t / 7) * RUIDO_SKM;
      muestras.push({ t, ritmoSkm: skm });
      if (skm != null) metros += (CADA_S / skm) * 1000;
      t += CADA_S;
    }
  }
  return { muestras, distanciaM: Math.round(metros), duracionS: t };
}

/**
 * El fartlek clásico: 8 × 3' fuertes con 3' de trote entre medias, y el ritmo
 * cayéndose repetición a repetición — que es lo que de verdad pasa y lo que la
 * media de la sesión tapa por completo.
 */
const FUERTES_SKM = [231, 233, 236, 237, 240, 241, 243, 244];
const SUAVE_SKM = 312;

function planFartlek(): Paso[] {
  const plan: Paso[] = [{ dur: 600, skm: SUAVE_SKM }];
  FUERTES_SKM.forEach((skm, i) => {
    plan.push({ dur: 180, skm });
    if (i < FUERTES_SKM.length - 1) plan.push({ dur: 180, skm: SUAVE_SKM });
  });
  plan.push({ dur: 300, skm: SUAVE_SKM });
  return plan;
}

// ---------------------------------------------------------------------------
// Las cuatro escenas
// ---------------------------------------------------------------------------

/** Las ocho vueltas de correr de la carrera 44 — `races.run_splits_json` (real). */
const VUELTAS_44 = [227, 234, 247, 245, 258, 249, 250, 248];

const fartlek = serie(planFartlek());
const rodaje = serie([{ dur: 3000, skm: 300 }]);

export const ESCENAS: Record<string, Escena> = {
  // EL PEOR CASO, Y VA PRIMERO (§6.3). Es el fartlek que Alex vio en Instagram:
  // 14,32 km, 1:20:12 y «5:36/km de media» — un número que no describe ningún
  // momento de esa carrera. Y es exactamente lo que la app guardaría hoy.
  'sin-tramos': {
    titulo: 'Fartlek largo',
    prescrito: 'Fartlek 14 km · cambios por sensaciones',
    fcMediaPpm: 157,
    fcMaxPpm: 181,
    procedencia:
      'La forma exacta que guarda la app hoy: un solo tramo, un solo ritmo medio. Ninguna ejecución de correr de la base tiene más.',
    carrera: { distanciaM: 14320, duracionS: 4812, formaPrescrita: 'con-contraste' },
  },

  // El mismo tipo de sesión CON la serie de ritmo guardada: los dos ritmos, el
  // contraste y el aguante. Es la pantalla que el dato de hoy no permite.
  detectado: {
    titulo: 'Fartlek 8 × 3′',
    prescrito: '8 × 3′ fuerte · 3′ trote entre medias',
    fcMediaPpm: 168,
    fcMaxPpm: 186,
    procedencia:
      'Serie de ritmo ILUSTRATIVA (una muestra cada 5 s). La base no guarda ninguna: los tramos salen del ritmo, no de una marca.',
    carrera: { ...fartlek, formaPrescrita: 'con-contraste' },
  },

  // Tramos MARCADOS y datos reales. Las ocho vueltas cubren la sesión entera,
  // así que su media sí describe las vueltas — y la lectura es el aguante.
  marcado: {
    titulo: 'Carrera 8 × 1 km',
    prescrito: '8 × 1 km a ritmo de carrera',
    // `races` no guarda pulso: sin ancla de FC no hay tinte y el lienzo se queda
    // neutro (§10.1). Es el único escenario 100 % real de los cuatro, y de paso
    // enseña la regla — el color es un dato, y lo que no se sabe no se pinta.
    fcMediaPpm: null,
    fcMaxPpm: null,
    procedencia:
      'Datos REALES: races.run_splits_json de la carrera 44. El único sitio de toda la base con un ritmo por tramo. Sin FC: la tabla no la guarda.',
    carrera: {
      distanciaM: VUELTAS_44.length * 1000,
      duracionS: VUELTAS_44.reduce((a, s) => a + s, 0),
      marcados: VUELTAS_44.map((s) => ({ tipo: 'fuerte' as const, duracionS: s, distanciaM: 1000 })),
    },
  },

  // La otra mitad de la ley: un rodaje continuo fue UNA cosa, y ahí la media
  // describe cada minuto. Existe para probar que la regla no dispara de más.
  rodaje: {
    titulo: 'Rodaje suave',
    prescrito: '50′ continuo en Z2',
    fcMediaPpm: 142,
    fcMaxPpm: 158,
    procedencia: 'Serie de ritmo ILUSTRATIVA. La base no guarda ninguna.',
    carrera: { ...rodaje, formaPrescrita: 'continua' },
  },
};
