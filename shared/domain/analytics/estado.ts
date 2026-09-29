// ¿CÓMO ESTOY HOY? — la cabecera fija del panel (modelo §3, pregunta 1):
// la palabra, forma/fatiga/frescura de hoy y el readiness de hoy.
//
// Las tres cifras de carga son LAS MISMAS lecturas del bloque de forma, sin su
// serie: una cabecera no dibuja curvas, y mandar la misma serie dos veces es
// pagar dos veces el mismo payload. Llevan ids propios (`estado.*`) porque el
// cliente reconoce una lectura por su id, y dos ids iguales con distinta forma
// son una lectura que se pinta dos veces con datos distintos.
//
// El readiness es el compuesto que ya calcula `athlete-daily-readiness.ts` con
// el método del coach (0256); aquí solo se envuelve con su cobertura y su fecha.
//
// Puro y sin base de datos.

import { lecturaMedida, lecturaSinDato, type Lectura } from './lectura';

export interface EntradaEstado {
  /** El readiness de hoy (o el último guardado, fechado como lo que es). */
  readiness: { score: number; recorded_for: string; delta_7d: number | null } | null;
  /** Hoy, día local. */
  hoy: string;
  /** Las lecturas del bloque de forma (para copiar forma, fatiga y frescura). */
  forma: readonly Lectura[];
}

const GRUPO = 'estado' as const;

const COPIAS: ReadonlyArray<{ de: string; id: string }> = [
  { de: 'carga.fondo', id: 'estado.forma' },
  { de: 'carga.reciente', id: 'estado.fatiga' },
  { de: 'carga.frescura', id: 'estado.frescura' },
];

/** Las lecturas del estado de hoy. */
export function lecturasEstado(e: EntradaEstado): Lectura[] {
  const lecturas: Lectura[] = [];

  const r = e.readiness;
  if (r == null) {
    lecturas.push(
      lecturaSinDato({
        id: 'estado.readiness',
        grupo: GRUPO,
        titulo_es: 'Disposición',
        falta: { por: 'dispositivo' },
        procedencia: { de: 'readiness_compuesto', explica_es: 'Tu readiness de hoy: check-in, variabilidad, sueño y pulso en reposo con los pesos de tu coach.', medida: false, ancla: null, proveedor: null },
      }),
    );
  } else {
    const esDeHoy = r.recorded_for === e.hoy;
    lecturas.push(
      lecturaMedida({
        id: 'estado.readiness',
        grupo: GRUPO,
        titulo_es: 'Disposición',
        dato: {
          valor: r.score,
          unidad: 'puntos',
          referencia: r.delta_7d == null ? null : { valor: r.score - r.delta_7d, delta: r.delta_7d, de: 'hace_7d' },
        },
        cobertura: { muestras: 1, dias_ventana: 1, dias_con_dato: esDeHoy ? 1 : 0, pct: esDeHoy ? 100 : 0 },
        procedencia: {
          de: 'readiness_compuesto',
          explica_es: esDeHoy
            ? 'Tu readiness de hoy: check-in, variabilidad, sueño y pulso en reposo con los pesos de tu coach.'
            : `El último readiness disponible, del ${r.recorded_for}: hoy aún no hay señal.`,
          medida: esDeHoy,
          ancla: null,
          proveedor: null,
        },
      }),
    );
  }

  for (const c of COPIAS) {
    const origen = e.forma.find((l) => l.id === c.de);
    if (!origen) continue;
    lecturas.push({ ...origen, id: c.id, grupo: GRUPO, serie: null });
  }

  return lecturas;
}
