// LAS SIETE CARRERAS — la prueba de que el modelo cubre el dominio, no el caso
// bonito. Salen del cruce de ejes del apartado 05 de `docs/correr-analitica.html`
// (medida × objetivo × estructura × recuperación × superficie × pendiente), no
// de un ejemplo: un ejemplo es la pregunta, nunca la especificación.
//
// La señal de cada una la fabrica `senal.ts` a partir de su guion, y de ahí
// salen la curva, los tramos, los kilómetros, las zonas y los totales. Aquí solo
// se escribe QUÉ carrera es cada una y qué le pidió el coach.
//
// PROCEDENCIA, sin adornos: la señal es ILUSTRATIVA. Ninguna ejecución de la
// base tiene aún traza de correr; el escenario `sin-archivo` es el único que
// reproduce lo que la base puede servir HOY, y por eso es obligatorio.

import type { Carrera, Objetivo } from './modelo';
import { bandaDeZona, generar, suelto, type Paso } from './senal';

// ---------------------------------------------------------------------------
// Los guiones
// ---------------------------------------------------------------------------

/**
 * 6 × 800 a 3:30 con 2′ de TROTE entre series. La quinta se va: sale a 3:44.
 *
 * El trote y no el parado, porque en carrera **el parado rara vez se hace**:
 * existe y es legítimo en repeticiones cortas y máximas, pero lo habitual es
 * recuperar cambiando de ritmo. Montar el caso raro como ejemplo canónico era
 * enseñar mal cómo se construye esto en Swift (Alex, 12-ago).
 *
 * Y el trote SE VA: 5:48 en el tercero y el cuarto contra los 6:10 que pidió el
 * coach. Ahí está la explicación de que la quinta se caiga, y es justo lo que
 * ninguna app puede contar porque ninguna sabe qué trote se pidió.
 */
const OCHOCIENTOS_SKM = [208, 210, 209, 212, 224, 213];
const TROTE_SKM = [372, 368, 348, 344, 366];
function guionSeries(): Paso[] {
  const g: Paso[] = [suelto(720, 336, 128, 324)];
  OCHOCIENTOS_SKM.forEach((skm, i) => {
    g.push({ papel: 'trabajo', distanciaM: 800, skm, ppm: 172 + i });
    // Tras la última no hay recuperación: hay vuelta a la calma. Meter un
    // «2:00 de trote» detrás de la sexta sería inventar un tramo que nadie corrió.
    if (i < OCHOCIENTOS_SKM.length - 1) {
      g.push({ papel: 'recuperacion', modo: 'trote', dur: 120, skm: TROTE_SKM[i]!, ppm: 148 + i * 2 });
    }
  });
  g.push(suelto(480, 340, 124, 352));
  return g;
}

/**
 * El MISMO 6×800 con recuperación PARADA — el caso raro, que existe y hay que
 * poder leer: sin ritmo que enseñar ni que juzgar, y con el hueco de la curva
 * cayendo a cero porque de pie no se avanza.
 */
function guionSeriesParado(): Paso[] {
  const g: Paso[] = [suelto(720, 336, 128, 324)];
  OCHOCIENTOS_SKM.forEach((skm, i) => {
    g.push({ papel: 'trabajo', distanciaM: 800, skm, ppm: 172 + i });
    if (i < OCHOCIENTOS_SKM.length - 1) {
      g.push({ papel: 'recuperacion', modo: 'parado', dur: 120, skm: null, ppm: 138 });
    }
  });
  g.push(suelto(480, 340, 124, 352));
  return g;
}

/** Fartlek 8 × (1′ fuerte / 2′ suave) por sensaciones. Sin objetivo de ritmo. */
const FARTLEK_SKM = [232, 234, 236, 238, 239, 241, 243, 246];
function guionFartlek(): Paso[] {
  const g: Paso[] = [suelto(600, 322, 130)];
  FARTLEK_SKM.forEach((skm, i) => {
    g.push({ papel: 'trabajo', dur: 60, skm, ppm: 174 });
    g.push({ papel: 'recuperacion', modo: 'trote', dur: 120, skm: 318, ppm: 146 + i });
  });
  g.push(suelto(420, 330, 128));
  return g;
}

/**
 * Rodaje 60′ en Z2 (132–143 ppm con el umbral de este atleta): una sola cosa,
 * con el arranque por debajo y el pulso subiendo despacio al final — que es lo
 * que hace que el «tiempo dentro de la zona» sea 3/4 y no 100%.
 */
function guionRodajeZona(): Paso[] {
  return [
    suelto(600, 322, 127, 306),
    suelto(1800, 304, 138, 299),
    suelto(1200, 299, 143, 308),
  ];
}

/**
 * Rodaje 12 km a 4:40–4:50, con el km 7 bajo un puente y sin señal. Los tiempos
 * se cuadran para que la distancia SALGA 12 km: un guion que dijera «12 km» y
 * generara 15 sería el mismo fallo que esta pantalla viene a arreglar, cometido
 * en los datos de prueba.
 */
function guionRodajeBanda(): Paso[] {
  return [
    suelto(900, 292, 141, 286),
    suelto(540, 283, 150, 287),
    { papel: 'suelto', dur: 180, skm: 286, ppm: 151, sinSenal: true },
    suelto(1080, 284, 153, 288),
    suelto(720, 285, 156, 279),
  ];
}

/**
 * 8 × 200 en cuesta al 8%: el ritmo bruto no dice nada y el tiempo sí. 4:30/km
 * en llano es un rodaje; en una rampa del 8% es máximo. Ese desajuste ES el
 * escenario, y por eso el troceado cambia de eje en vez de disculparse.
 */
const CUESTA_S = [54, 55, 56, 57, 58, 60, 61, 63];
function guionCuesta(): Paso[] {
  const g: Paso[] = [suelto(600, 330, 124)];
  CUESTA_S.forEach((dur, i) => {
    g.push({ papel: 'trabajo', distanciaM: 200, dur, skm: (dur / 200) * 1000, ppm: 166 + i, pendientePct: 8 });
    g.push({ papel: 'recuperacion', modo: 'andando', dur: 165, skm: 700, ppm: 138 });
  });
  g.push(suelto(420, 340, 120));
  return g;
}

/** Carrera libre: sin prescripción, con dos apretones que se marcó él solo. */
function guionLibre(): Paso[] {
  return [
    suelto(900, 320, 134, 312),
    { papel: 'trabajo', dur: 420, skm: 250, skmFin: 254, ppm: 168 },
    { papel: 'recuperacion', modo: 'trote', dur: 300, skm: 322, ppm: 148 },
    { papel: 'trabajo', dur: 360, skm: 246, skmFin: 251, ppm: 172 },
    { papel: 'recuperacion', modo: 'trote', dur: 240, skm: 326, ppm: 146 },
    suelto(600, 316, 138, 324),
  ];
}

// ---------------------------------------------------------------------------
// Las siete carreras
// ---------------------------------------------------------------------------

const series = generar(guionSeries(), 'calle');
const fartlek = generar(guionFartlek(), 'calle');
const rodajeZona = generar(guionRodajeZona(), 'calle');
const rodajeBanda = generar(guionRodajeBanda(), 'calle');
const cuesta = generar(guionCuesta(), 'calle');
const libre = generar(guionLibre(), 'calle');
// EL MISMO 6×800, en cinta. Mismo guion a propósito: si algo cambia en pantalla
// solo puede ser por la superficie, y así se ve que el veredicto no depende de
// dónde corras. Lo que sí cambia es la SEÑAL — una cinta sostiene el ritmo.
const seriesCinta = generar(guionSeries(), 'cinta');
const seriesParado = generar(guionSeriesParado(), 'calle');

/** «2′ de trote a 6:00-6:20» — la banda de la recuperación, prescrita igual que
 *  la del trabajo. El coach la escribe, así que se puede comprobar. */
const TROTE_PEDIDO: Objetivo = { clase: 'ritmo', rapidoSkm: 360, lentoSkm: 380 };

/** El 6×800, que se sirve con DOS sujetos para que Alex elija viendo. */
const SEIS_POR_OCHOCIENTOS: Carrera = {
  titulo: '6 × 800',
  cuando: 'Hoy',
  momento: 'al-terminar',
  prescrito: '6 × 800 m a 3:30 · 2′ de trote a 6:00-6:20',
  // «a 3:30» es un punto: la banda sale de ensancharlo ±5 s/km, la tolerancia
  // que `paceBandFromTarget` aplica en producción. 3:25 a 3:35.
  objetivo: { clase: 'ritmo', rapidoSkm: 205, lentoSkm: 215 },
  objetivoRecuperacion: TROTE_PEDIDO,
  superficie: 'calle',
  fcMediaPpm: series.fcMediaPpm,
  fcMaxPpm: series.fcMaxPpm,
  desnivelM: 24,
  traza: series.traza,
  repeticiones: series.repeticiones,
  certezaTramos: 'marcados',
  kilometros: series.kilometros,
  zonasS: series.zonasS,
  // Sin deriva a propósito: el método (Friel) exige esfuerzo SOSTENIDO y una
  // sesión con recuperaciones no lo es. `decoupling.ts` se niega a calcularla, y
  // esta pantalla no va a enseñar un número que el motor no da.
  derivado: { bajadaPulsoPpm: 34 },
  ruta: series.ruta,
  distanciaM: series.distanciaM,
  duracionS: series.duracionS,
  procedencia:
    'Señal ilustrativa (una muestra cada 5 s). El veredicto sale de evaluateRunSegment, el mismo motor que juzga la sesión en el panel del coach.',
};

export const ESCENAS: Record<string, Carrera> = {
  // ① El caso que decide el tono. Mismos datos, mismo todo: solo cambia quién
  // gana el número grande. Se sirven seguidos para poder compararlos.
  'series-veredicto': SEIS_POR_OCHOCIENTOS,
  'series-hecho': SEIS_POR_OCHOCIENTOS,

  // ② Sin objetivo de ritmo: el contraste es la única lectura honesta.
  fartlek: {
    titulo: 'Fartlek 8 × 1′',
    cuando: 'Hoy',
    momento: 'al-terminar',
    prescrito: '8 × (1′ fuerte / 2′ suave) · por sensaciones',
    objetivo: { clase: 'sensacion' },
    superficie: 'calle',
    fcMediaPpm: fartlek.fcMediaPpm,
    fcMaxPpm: fartlek.fcMaxPpm,
    desnivelM: 31,
    traza: fartlek.traza,
    repeticiones: fartlek.repeticiones,
    certezaTramos: 'marcados',
    kilometros: fartlek.kilometros,
    zonasS: fartlek.zonasS,
    derivado: { bajadaPulsoPpm: 29 },
    ruta: fartlek.ruta,
    distanciaM: fartlek.distanciaM,
    duracionS: fartlek.duracionS,
    procedencia: 'Señal ilustrativa. Sin banda de ritmo no hay veredicto: el motor devuelve «sin dato» y no se fuerza uno.',
  },

  // ③ Objetivo de zona sobre trabajo continuo: el sujeto es el tiempo dentro.
  'rodaje-zona': {
    titulo: 'Rodaje 60′',
    cuando: 'Hoy',
    momento: 'al-terminar',
    prescrito: '60′ continuo en Z2',
    objetivo: { clase: 'zona', zona: 2, ...bandaDeZona(2) },
    superficie: 'calle',
    fcMediaPpm: rodajeZona.fcMediaPpm,
    fcMaxPpm: rodajeZona.fcMaxPpm,
    desnivelM: 62,
    traza: rodajeZona.traza,
    repeticiones: rodajeZona.repeticiones,
    certezaTramos: null,
    kilometros: rodajeZona.kilometros,
    zonasS: rodajeZona.zonasS,
    derivado: { derivaSkm: 7, bajadaPulsoPpm: 31 },
    ruta: rodajeZona.ruta,
    distanciaM: rodajeZona.distanciaM,
    duracionS: rodajeZona.duracionS,
    procedencia: 'Señal ilustrativa. El reparto de zonas sale de `zonas.ts`, el mismo que la app usa desde el 29-jul.',
  },

  // ④ Banda de ritmo sobre trabajo continuo: la media manda, el veredicto apoya.
  'rodaje-banda': {
    titulo: 'Rodaje 12 km',
    cuando: 'Hoy',
    momento: 'al-terminar',
    prescrito: '12 km entre 4:40 y 4:50',
    objetivo: { clase: 'ritmo', rapidoSkm: 280, lentoSkm: 290 },
    superficie: 'calle',
    fcMediaPpm: rodajeBanda.fcMediaPpm,
    fcMaxPpm: rodajeBanda.fcMaxPpm,
    desnivelM: 88,
    traza: rodajeBanda.traza,
    repeticiones: rodajeBanda.repeticiones,
    certezaTramos: null,
    kilometros: rodajeBanda.kilometros,
    zonasS: rodajeBanda.zonasS,
    derivado: { derivaSkm: 4, bajadaPulsoPpm: 27 },
    ruta: rodajeBanda.ruta,
    distanciaM: rodajeBanda.distanciaM,
    duracionS: rodajeBanda.duracionS,
    procedencia: 'Señal ilustrativa con un corte de 3′ sin señal a propósito: el kilómetro que lo atraviesa se declara, no se interpola.',
  },

  // ⑤ El corrector: en pendiente el ritmo no se compara, se mide el tiempo.
  cuesta: {
    titulo: '8 × 200 en cuesta',
    cuando: 'Hoy',
    momento: 'al-terminar',
    prescrito: '8 × 200 m en cuesta al 8% · bajando andando',
    objetivo: { clase: 'sensacion' },
    superficie: 'calle',
    fcMediaPpm: cuesta.fcMediaPpm,
    fcMaxPpm: cuesta.fcMaxPpm,
    // 8 repeticiones × 200 m al 8% = 128 m de subida. El número no se elige: sale
    // de la propia pendiente declarada del guion.
    desnivelM: 128,
    traza: cuesta.traza,
    repeticiones: cuesta.repeticiones,
    certezaTramos: 'marcados',
    kilometros: cuesta.kilometros,
    zonasS: cuesta.zonasS,
    derivado: { bajadaPulsoPpm: 38 },
    ruta: cuesta.ruta,
    distanciaM: cuesta.distanciaM,
    duracionS: cuesta.duracionS,
    procedencia: 'Señal ilustrativa con 8% de pendiente declarada. Por encima del umbral del coach, el troceado cambia de eje.',
  },

  // ⑥ Sin prescripción: no hay intención que contrastar, hay esfuerzos suyos.
  libre: {
    titulo: 'Salida a correr',
    cuando: 'Hoy',
    momento: 'al-terminar',
    prescrito: null,
    objetivo: { clase: 'ninguno' },
    superficie: 'calle',
    fcMediaPpm: libre.fcMediaPpm,
    fcMaxPpm: libre.fcMaxPpm,
    desnivelM: 44,
    traza: libre.traza,
    repeticiones: libre.repeticiones,
    // Nadie marcó nada: los apretones los separa el ritmo. Y va escrito.
    certezaTramos: 'detectados',
    kilometros: libre.kilometros,
    zonasS: libre.zonasS,
    derivado: { bajadaPulsoPpm: 26 },
    ruta: libre.ruta,
    distanciaM: libre.distanciaM,
    duracionS: libre.duracionS,
    procedencia: 'Señal ilustrativa. Los dos apretones no los prescribió nadie: se detectan del ritmo, y la pantalla lo dice.',
  },

  // ⑧ LA MISMA SERIE, EN CINTA. El mismo guion que ① a propósito: lo único que
  // cambia es dónde se corrió, así que todo lo que se vea distinto en pantalla
  // es atribuible a la superficie y a nada más. Enseña tres cosas que ninguno de
  // los otros siete puede enseñar:
  //   · la DISTANCIA la da la cinta, no el GPS, y eso se sella — un 5K en cinta
  //     no bate al de calle;
  //   · el mapa NO existe, y no se declara: en cinta no hay ningún acto que
  //     llene ese hueco, así que la regla del §6.2 bis manda callarse;
  //   · la señal es otra — una cinta sostiene el ritmo que le pones, y la curva
  //     sale con mesetas limpias en vez del temblor del GPS.
  'series-cinta': {
    titulo: '6 × 800 en cinta',
    cuando: 'Hoy',
    momento: 'al-terminar',
    prescrito: '6 × 800 m a 3:30 · 2′ de trote a 6:00-6:20',
    objetivo: { clase: 'ritmo', rapidoSkm: 205, lentoSkm: 215 },
    objetivoRecuperacion: TROTE_PEDIDO,
    superficie: 'cinta',
    fcMediaPpm: seriesCinta.fcMediaPpm,
    fcMaxPpm: seriesCinta.fcMaxPpm,
    // Cinta sin inclinación: no hay desnivel que acumular. No es un dato que
    // falte, es un dato que no existe — y por eso no se pinta ni se declara.
    desnivelM: null,
    traza: seriesCinta.traza,
    repeticiones: seriesCinta.repeticiones,
    certezaTramos: 'marcados',
    kilometros: seriesCinta.kilometros,
    zonasS: seriesCinta.zonasS,
    derivado: { bajadaPulsoPpm: 31 },
    ruta: [],
    distanciaM: seriesCinta.distanciaM,
    duracionS: seriesCinta.duracionS,
    procedencia:
      'Mismo guion que el ①, con la señal de una cinta: la distancia la mide la correa (source=treadmill), no el GPS, y no hay ruta que dibujar.',
  },

  // ⑨ EL CASO RARO, y por eso va de menor: la misma serie recuperando PARADA.
  // Existe y es legítimo en repeticiones cortas y máximas, así que hay que poder
  // leerlo — pero no es el ejemplo canónico. Sin ritmo en el trote no hay nada
  // que juzgar ahí, y la curva se parte en seis islas.
  'series-parado': {
    titulo: '6 × 800',
    cuando: 'Hoy',
    momento: 'al-terminar',
    prescrito: '6 × 800 m a 3:30 · 2′ parado entre series',
    objetivo: { clase: 'ritmo', rapidoSkm: 205, lentoSkm: 215 },
    superficie: 'calle',
    fcMediaPpm: seriesParado.fcMediaPpm,
    fcMaxPpm: seriesParado.fcMaxPpm,
    desnivelM: 24,
    traza: seriesParado.traza,
    repeticiones: seriesParado.repeticiones,
    certezaTramos: 'marcados',
    kilometros: seriesParado.kilometros,
    zonasS: seriesParado.zonasS,
    derivado: { bajadaPulsoPpm: 34 },
    ruta: seriesParado.ruta,
    distanciaM: seriesParado.distanciaM,
    duracionS: seriesParado.duracionS,
    procedencia:
      'El mismo 6×800 del ① recuperando de pie. Sin objetivo de recuperación: parado no hay ritmo que comparar, y no se inventa uno.',
  },

  // ⑦ OBLIGATORIO: el estado de TODAS las sesiones anteriores a esta semana.
  'sin-archivo': {
    titulo: 'Rodaje largo',
    cuando: 'Martes 22 de julio',
    momento: 'revision',
    prescrito: '75′ suave en Z2',
    objetivo: { clase: 'zona', zona: 2, ...bandaDeZona(2) },
    superficie: 'calle',
    distanciaM: 15380,
    duracionS: 4620,
    // Los totales SÍ están: los guardó la ejecución. Lo que no hay es el minuto
    // a minuto — y por eso ni zonas, ni kilómetros, ni deriva, ni mapa.
    fcMediaPpm: 143,
    fcMaxPpm: 161,
    desnivelM: null,
    traza: null,
    repeticiones: [],
    certezaTramos: null,
    kilometros: [],
    zonasS: {},
    derivado: {},
    ruta: [],
    // Se abrió del historial: lo que contestó aquel día ya está guardado, y por
    // eso no se le vuelve a preguntar ni se le enseña un GUARDAR que no guarda.
    dicho: { rpe: 6, dificultad: 'as_expected' },
    procedencia:
      'La forma EXACTA que la base puede servir hoy para cualquier sesión anterior a la tanda del archivo: totales y pulso medio, sin un solo punto de señal.',
  },
};
