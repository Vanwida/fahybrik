// LA CARGA, VISIBLE Y DE VERDAD.
//
// POR QUÉ ESTE FICHERO
// --------------------
// El fondo, lo reciente y la frescura se calculaban desde hace meses, bien, y
// vivían escondidos detrás de un índice de 0 a 100 («race readiness») que no
// dice de dónde sale. Un entrenador no necesita el índice: necesita saber si el
// atleta está apretando, y luego los tres números y su curva.
//
// Aquí salen los cinco números con su serie, más la lectura que ninguna
// herramienta enseña y es la que decide si las otras cinco valen algo: CUÁNTO
// del entrenamiento vieron, y cuánto de eso se midió en vez de puntuarse.
//
// EL RITMO DE SUBIDA, QUE NO EXISTÍA
// ----------------------------------
// Un fondo de 60 alcanzado en cuatro meses es un atleta en forma; el mismo 60 en
// tres semanas es una lesión esperando. Hasta hoy el motor sabía decir el primer
// número y no tenía palabra para el segundo.
//
// EL ARRANQUE EN FRÍO SE RECORTA, NO SE EXPLICA
// ---------------------------------------------
// Una media móvil de 42 días sembrada en cero sube durante semanas por pura
// aritmética. Si esa subida se dibuja, el atleta ve una rampa que él no hizo. Por
// eso se calcula sobre TODA la historia disponible y se dibuja solo la ventana
// pedida: los puntos de calentamiento existen, sostienen el número de hoy, y no
// se enseñan.
//
// Puro y sin base de datos.

import {
  computeRampSeries,
  currentRamp,
  computeLoadSeries,
  summarizeLoad,
  RAMP_WINDOW_DAYS,
  type DailyTss,
} from '../training-load/banister';
import { readLoadCoverage } from '../training-load/coverage';
import { checkColdStart } from '../training-load/load-verdict';
import type { Falta } from '../running/progress';
import type { CoachAnalyticsMethod } from './metodo';
import {
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  type Cobertura,
  type Lectura,
  type Procedencia,
  type PuntoSerie,
  type Serie,
} from './lectura';

export interface EntradaCarga {
  /** Serie diaria COMPLETA, calentamiento incluido. Ascendente. */
  diario: readonly DailyTss[];
  metodo: CoachAnalyticsMethod;
  /** Días que se DIBUJAN (28, 56, 84, 182…). El resto sostiene sin verse. */
  ventana_dias: number;
  /** Días de historia real del atleta, para el arranque en frío. */
  dias_de_historia: number | null;
}

/** Las ventanas que la pantalla ofrece. Semanas, porque así se habla de carga. */
export const VENTANAS_CARGA_SEMANAS = [4, 8, 12, 26] as const;
export type VentanaCargaSemanas = (typeof VENTANAS_CARGA_SEMANAS)[number];

/**
 * La IDENTIDAD de las seis lecturas, en un solo sitio.
 *
 * Existe porque cada una se emite por dos caminos — con dato y sin él — y un
 * título escrito dos veces es un título que acaba diciendo cosas distintas según
 * el atleta tenga historia o no.
 */
function catalogoCarga(metodo: CoachAnalyticsMethod) {
  return [
    {
      id: 'carga.fondo',
      titulo_es: 'Fondo',
      de: 'banister_ctl',
      explica_es: `Media móvil de ${metodo.ctl_days} días de la carga diaria: el trabajo que ya tiene encima.`,
    },
    {
      id: 'carga.reciente',
      titulo_es: 'Reciente',
      de: 'banister_atl',
      explica_es: `Media móvil de ${metodo.atl_days} días: el cansancio que aún arrastra.`,
    },
    {
      id: 'carga.frescura',
      titulo_es: 'Frescura',
      de: 'banister_tsb',
      explica_es: 'El fondo menos lo reciente. En positivo llega descansado; en negativo, cargado.',
    },
    {
      id: 'carga.subida',
      titulo_es: 'Ritmo de subida',
      de: 'banister_ramp',
      explica_es: 'Cuánto ha crecido el fondo en la última semana. Sube el listón, no lo que ya hizo.',
    },
    {
      id: 'carga.cociente',
      titulo_es: 'Reciente contra fondo',
      de: 'acr_7_28',
      explica_es: 'La carga de los últimos 7 días dividida por la semana media de los últimos 28.',
    },
    {
      id: 'carga.cobertura',
      titulo_es: 'Cuánto de esto se ha medido',
      de: 'cobertura_carga',
      explica_es:
        'Segundos entrenados en 28 días que entran en los números de arriba, y cuántos de ellos los midió un aparato.',
    },
  ] as const;
}

function serieDe(
  puntos: ReadonlyArray<{ date: string; v: number | null }>,
  ventana_dias: number,
): Serie {
  const recortada = ventana_dias > 0 ? puntos.slice(-ventana_dias) : puntos.slice();
  const salida: PuntoSerie[] = recortada.map((p) => ({ t: p.date, v: p.v }));
  return { unidad: 'tss', paso: 'dia', puntos: salida };
}

/**
 * La cobertura que comparten las cinco lecturas numéricas: todas salen de la
 * MISMA serie, así que todas la ven igual de bien o igual de mal. Calcularla una
 * vez es lo que impide que el fondo diga «completo» y la frescura «a medias»
 * sobre exactamente los mismos días.
 */
function coberturaDeLaCarga(
  diario: readonly DailyTss[],
  ventana_dias: number,
  dias_de_historia: number | null,
  metodo: CoachAnalyticsMethod,
): { cobertura: Omit<Cobertura, 'falta'>; falta: Falta | null; medida: boolean } {
  const resumen = summarizeLoad(diario);
  const lectura = readLoadCoverage(resumen);
  const frio = checkColdStart(dias_de_historia, metodo.ctl_days);

  // Una ventana no positiva significa «todo lo que haya», y entonces la ventana
  // que se DECLARA tiene que ser la que de verdad se miró. Sin esto, un
  // `ventana_dias` negativo convertía `slice(-(-n))` en `slice(n)` y además se
  // declaraba tal cual, así que `dias_con_dato` podía salir por encima de
  // `dias_ventana` — la invariante que el resto del contrato de `Cobertura` da
  // por sentada, rota en silencio.
  const ventana = ventana_dias > 0 ? diario.slice(-ventana_dias) : diario.slice();
  const dias_declarados = ventana_dias > 0 ? ventana_dias : ventana.length;
  const dias_con_dato = ventana.filter(
    (d) => (d.known_seconds ?? 0) > 0 || (d.unknown_seconds ?? 0) > 0,
  ).length;

  // Sesiones, no días: «pídele el RPE de 2 sesiones» es una petición, «de 47
  // minutos» no lo es.
  const muestras = ventana.reduce(
    (n, d) => n + ((d.known_seconds ?? 0) > 0 || (d.unknown_seconds ?? 0) > 0 ? 1 : 0),
    0,
  );

  // El arranque en frío manda sobre el hueco de cobertura: de nada sirve pedirle
  // que puntúe sesiones si el problema es que lleva tres semanas en la app.
  // `days_of_history` es null cuando NADA se ha ejecutado: no hay desde cuándo
  // contar. Se dibuja como cero días llevados, que es exactamente lo que pasa.
  const falta: Falta | null = !frio.is_warmed_up
    ? { por: 'historia', llevas: frio.days_of_history ?? 0, hacen: frio.ctl_window_days }
    : lectura.allows_verdict
      ? null
      : { por: 'intencion' };

  const medidos = ventana.reduce((s, d) => s + (d.measured_seconds ?? 0), 0);
  const declarados = ventana.reduce((s, d) => s + (d.declared_seconds ?? 0), 0);

  return {
    cobertura: {
      muestras,
      dias_ventana: dias_declarados,
      dias_con_dato,
      pct: pctCobertura(dias_con_dato, dias_declarados),
    },
    falta,
    // El número se presenta como MEDIDO solo si la mayor parte de lo que lo
    // sostiene lo midió un instrumento. Un fondo construido con puntuaciones es
    // una afirmación distinta de uno construido con ritmos.
    medida: medidos > declarados,
  };
}

function procedencia(de: string, explica_es: string, medida: boolean): Procedencia {
  return { de, explica_es, medida, proveedor: null };
}

/**
 * Las seis lecturas de carga.
 *
 * Ninguna se calla nunca por falta de cobertura: los números existen y se
 * enseñan, con el hueco declarado al lado. Es la distinción que el motor ya
 * hacía y que aquí se conserva — un hueco retira el VEREDICTO, no el dato.
 */
export function lecturasCarga(e: EntradaCarga): Lectura[] {
  const { metodo, ventana_dias } = e;
  const [FONDO, RECIENTE, FRESCURA, SUBIDA, COCIENTE, COBERTURA] = catalogoCarga(metodo);

  const serie = computeLoadSeries(e.diario, {
    ctl_tau: metodo.ctl_days,
    atl_tau: metodo.atl_days,
  });
  const rampas = computeRampSeries(serie);
  const ultimo = serie[serie.length - 1];
  const resumen = summarizeLoad(e.diario);
  const base = coberturaDeLaCarga(e.diario, ventana_dias, e.dias_de_historia, metodo);
  const cob = { ...base.cobertura, falta: base.falta };
  const proc = (l: { de: string; explica_es: string }, medida = base.medida): Procedencia =>
    procedencia(l.de, l.explica_es, medida);

  // Sin un solo dia de historia no hay un fondo que valga cero: no hay fondo.
  // Las seis salen sin dato y con el plazo, en vez de seis ceros que se leerian
  // como «un atleta que no entrena».
  if (ultimo == null) {
    const falta: Falta = { por: 'historia', llevas: 0, hacen: metodo.ctl_days };
    return catalogoCarga(metodo).map((l) =>
      lecturaSinDato({
        id: l.id,
        grupo: 'carga',
        titulo_es: l.titulo_es,
        falta,
        cobertura: base.cobertura,
        procedencia: proc(l, false),
      }),
    );
  }

  const lecturas: Lectura[] = [
    lecturaMedida({
      id: FONDO.id,
      grupo: 'carga',
      titulo_es: FONDO.titulo_es,
      dato: { valor: ultimo.ctl, unidad: 'tss', referencia: null },
      serie: serieDe(serie.map((p) => ({ date: p.date, v: p.ctl })), ventana_dias),
      cobertura: cob,
      procedencia: proc(FONDO),
    }),
    lecturaMedida({
      id: RECIENTE.id,
      grupo: 'carga',
      titulo_es: RECIENTE.titulo_es,
      dato: { valor: ultimo.atl, unidad: 'tss', referencia: null },
      serie: serieDe(serie.map((p) => ({ date: p.date, v: p.atl })), ventana_dias),
      cobertura: cob,
      procedencia: proc(RECIENTE),
    }),
    lecturaMedida({
      id: FRESCURA.id,
      grupo: 'carga',
      titulo_es: FRESCURA.titulo_es,
      // La frescura se lee contra CERO: por encima llega descansado, por debajo
      // cargado. Servir la referencia evita que cada cliente invente su corte.
      dato: { valor: ultimo.tsb, unidad: 'tss', referencia: { valor: 0, delta: ultimo.tsb, de: 'equilibrio' } },
      serie: serieDe(serie.map((p) => ({ date: p.date, v: p.tsb })), ventana_dias),
      cobertura: cob,
      procedencia: proc(FRESCURA),
    }),
  ];

  // EL RITMO DE SUBIDA NO SE INVENTA A CERO. Un cero es «no ha subido», y a
  // quien lleva cinco dias no le ha dado tiempo ni a subir ni a no subir: no se
  // sabe. Son frases distintas y la segunda no se dice con un cero.
  const rampa = currentRamp(serie);
  lecturas.push(
    rampa == null
      ? lecturaSinDato({
          id: SUBIDA.id,
          grupo: 'carga',
          titulo_es: SUBIDA.titulo_es,
          falta: { por: 'historia', llevas: serie.length, hacen: RAMP_WINDOW_DAYS + 1 },
          cobertura: base.cobertura,
          procedencia: proc(SUBIDA),
        })
      : lecturaMedida({
          id: SUBIDA.id,
          grupo: 'carga',
          titulo_es: SUBIDA.titulo_es,
          dato: {
            valor: rampa,
            unidad: 'tss_semana',
            referencia: {
              valor: metodo.ramp_alert_tss_per_week,
              delta: rampa - metodo.ramp_alert_tss_per_week,
              de: 'aviso_del_coach',
            },
          },
          serie: {
            unidad: 'tss_semana',
            paso: 'dia',
            puntos: (ventana_dias > 0 ? rampas.slice(-ventana_dias) : rampas).map((p) => ({
              t: p.date,
              v: p.ramp,
            })),
          },
          cobertura: cob,
          procedencia: proc(SUBIDA),
        }),
  );

  // EL COCIENTE TAMPOCO. Cero partido por cero no es cero: es que no hay fondo
  // contra el que comparar. Un cociente servido a cero se etiqueta «bajo», y eso
  // es un veredicto de entrenamiento sobre alguien a quien nadie ha medido.
  lecturas.push(
    resumen.acr == null
      ? lecturaSinDato({
          id: COCIENTE.id,
          grupo: 'carga',
          titulo_es: COCIENTE.titulo_es,
          falta: base.falta ?? { por: 'historia', llevas: 0, hacen: 28 },
          cobertura: base.cobertura,
          procedencia: proc(COCIENTE),
        })
      : lecturaMedida({
          id: COCIENTE.id,
          grupo: 'carga',
          titulo_es: COCIENTE.titulo_es,
          dato: { valor: resumen.acr, unidad: 'ratio', referencia: null },
          cobertura: cob,
          procedencia: proc(COCIENTE),
        }),
  );

  // LA LECTURA QUE SOSTIENE A LAS OTRAS CINCO. Sin ella, las cinco de arriba son
  // afirmaciones sobre un TROZO del entrenamiento presentadas como si fueran
  // sobre todo el.
  const ventana28 = e.diario.slice(-28);
  const diasCon28 = ventana28.filter(
    (d) => (d.known_seconds ?? 0) > 0 || (d.unknown_seconds ?? 0) > 0,
  ).length;
  const total28 = resumen.known_seconds_28d + resumen.unknown_seconds_28d;
  const medidos28 = ventana28.reduce((s, d) => s + (d.measured_seconds ?? 0), 0);
  const declarados28 = Math.max(0, resumen.known_seconds_28d - medidos28);
  const parte = (valor: number) => (total28 > 0 ? (valor / total28) * 100 : null);
  // `LoadCoverage.pct` viaja en fracción 0-1; aquí todo es 0-100. Se convierte
  // en este único sitio.
  const pctEnLosNumeros = (readLoadCoverage(resumen).pct ?? 0) * 100;
  const pctMedido = total28 > 0 ? (medidos28 / total28) * 100 : 0;

  lecturas.push(
    total28 <= 0
      ? lecturaSinDato({
          id: COBERTURA.id,
          grupo: 'carga',
          titulo_es: COBERTURA.titulo_es,
          // Los días que lleva son los SUYOS, no un cero. Un atleta que entrenó
          // cuatro meses y paró tiene historia de sobra: lo que le falta es
          // trabajo reciente, y decirle «llevas 0 días» sería mentirle sobre lo
          // único que sí hizo.
          falta: { por: 'historia', llevas: e.dias_de_historia ?? 0, hacen: 28 },
          cobertura: { muestras: 0, dias_ventana: 28, dias_con_dato: 0, pct: pctCobertura(0, 28) },
          procedencia: proc(COBERTURA, true),
        })
      : lecturaMedida({
          id: COBERTURA.id,
          grupo: 'carga',
          titulo_es: COBERTURA.titulo_es,
          // El dato es cuánto del entrenamiento entra en los números; la
          // referencia, cuánto de eso lo midió un aparato. El delta entre los dos
          // es exactamente la parte que se sostiene solo en la palabra del atleta.
          dato: {
            valor: pctEnLosNumeros,
            unidad: 'pct',
            referencia: {
              valor: pctMedido,
              delta: pctEnLosNumeros - pctMedido,
              de: 'medido_por_instrumento',
            },
          },
          reparto: {
            unidad: 'segundos',
            total: total28,
            partes: [
              { code: 'medido', etiqueta_es: 'Medido con ritmo o pulso', valor: medidos28, pct: parte(medidos28) },
              { code: 'declarado', etiqueta_es: 'Puntuado por ti', valor: declarados28, pct: parte(declarados28) },
              {
                code: 'sin_precio',
                etiqueta_es: 'Sin puntuar ni medir',
                valor: resumen.unknown_seconds_28d,
                pct: parte(resumen.unknown_seconds_28d),
              },
            ],
          },
          cobertura: {
            // Sesiones, no dias: «pidele el RPE de 2 sesiones» es una peticion,
            // «de 47 minutos» no lo es.
            muestras: resumen.unknown_sessions_28d,
            dias_ventana: 28,
            dias_con_dato: diasCon28,
            pct: pctCobertura(diasCon28, 28),
            falta: base.falta,
          },
          procedencia: proc(COBERTURA, true),
        }),
  );

  return lecturas;
}
