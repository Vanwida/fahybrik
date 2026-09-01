// LAS ANALÍTICAS DE CARRERA DEL ATLETA — ¿estoy mejorando?
//
// LA REGLA QUE GOBIERNA ESTA PANTALLA: **el dato es el dibujo.** El texto es
// pie, de una línea, y casi siempre sobra. La primera versión (12-ago) razonaba
// bien y se leía como un informe: Alex la rechazó por eso mismo, y con razón.
// Una pantalla de analíticas que hay que LEER ha fallado antes de empezar.
//
// Consecuencia para el modelo, que es lo que importa aquí: **el modelo no
// produce frases, produce magnitudes dibujables.** Donde antes había una cadena
// («hace 4 semanas perdías 15,5») ahora hay un número y una referencia, y quien
// decide cómo se enseña es el gráfico: un fantasma, una sombra, una banda.
//
// EL MOTOR YA NO VIVE AQUÍ (12-ago) — Y POR QUÉ
// -----------------------------------------------
// Nació en este fichero porque razonar la escalera de evidencia hacía falta
// para diseñarla. Pero el veredicto lo tiene que calcular el SERVIDOR: la app
// del atleta es Swift y no puede ejecutar TypeScript, así que si el motor se
// quedaba aquí habría dos — uno para el mockup y otro reescrito para la app —
// y el día que discreparan nadie sabría cuál es el bueno.
//
// El motor entero (la escalera de evidencia, la cobertura, el veredicto, el
// tercer peldaño) vive ahora en `shared/domain/running/progress.ts`, puro y sin
// base de datos, y lo sirve el servidor en `/api/athlete/analytics/running/progress`
// (`web/lib/athlete/analytics/running-progress.ts`). Este fichero se limita a
// REEXPORTARLO: los otros cuatro ficheros de esta pantalla siguen importando de
// `./modelo`, y de aquí sale exactamente la misma función que ejecuta la API —
// no una copia con el mismo nombre. Es lo único que impide que el doble
// prometa un comportamiento que la app luego no tenga.
//
// LO QUE SIGUE SIENDO DE ESTA PANTALLA: el color. `TONO` / `tonoDe` traducen un
// veredicto a un tinte de fondo, y eso es presentación pura — no pertenece a un
// fichero puro y sin CSS como `progress.ts`.
//
// EL MODELO ENTERO, para quien llega sin haber leído `progress.ts`. Una lectura
// longitudinal son cuatro cosas a la vez:
//
//   MAGNITUD    qué se mide
//   BASE        contra qué (sin base, un número no dice nada)
//   COBERTURA   si hay con qué afirmarlo
//   SENTIDO     hacia dónde es mejor — y NO es obvio: que el ritmo baje es
//               mejorar, que el volumen suba no lo es necesariamente.
//
// El SENTIDO es lo que permite dibujar sin explicar: si el modelo sabe hacia
// dónde es mejor, el gráfico puede poner lo bueno arriba y la flecha verde, y
// entonces la frase que lo contaba sobra.
//
// EL VEREDICTO SE DERIVA Y CABE EN TRES PALABRAS. No es un índice del 0 al 100
// sacado de una fórmula que nadie puede auditar: sale de una ESCALERA DE
// EVIDENCIA, y el número que lo sostiene se dibuja debajo en vez de contarse. Y
// tiene que poder decir «aún no».
//
// REGLA Nº0. El mecanismo (la escalera, la detección de exceso de carga, qué
// silencia una lectura) es del producto y vive en `progress.ts`. Los umbrales
// son MÉTODO del coach y entran por parámetro — nunca una constante de esta
// pantalla. `METODO`, aquí abajo, es justo eso: los defectos de
// `shared/domain/coach/running-thresholds.ts` más el reparto de
// `shared/domain/coach/hr-method.ts`, los mismos con los que arranca un coach
// que aún no ha tocado nada.

import {
  seCalla,
  salidaDe,
  faltaComun,
  veredictoDe,
  peldanoDisponible,
  subidaDeVolumen,
  coberturaDe,
  deltasDe,
  sePuedeJuzgarElPedido,
  colapso,
  mismoTipoDe,
  ORDEN_COBERTURA,
  type Falta,
  type Peldano,
  type ClaseVeredicto,
  type Veredicto,
  type Cobertura,
  type Deltas,
  type RunningHistory,
  type Esfuerzo,
  type PuntoSemana,
  type Pedido,
  type PuntoCansado,
  type CarreraObjetivo,
  type Vo2Lectura,
  type TipoObservacion,
} from '@fahybrid/shared/domain/running/progress';
import { DEFAULT_COACH_RUNNING_THRESHOLDS, type CoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';
import { DEFAULT_COACH_HR_METHOD } from '@fahybrid/shared/domain/coach/hr-method';

// El resto de esta pantalla sigue importando de `./modelo`: no tiene que saber
// que el motor vive en `shared`, ni cambiar sus imports el día que se mueva.
export {
  seCalla,
  salidaDe,
  faltaComun,
  veredictoDe,
  peldanoDisponible,
  subidaDeVolumen,
  coberturaDe,
  deltasDe,
  sePuedeJuzgarElPedido,
  colapso,
  mismoTipoDe,
  ORDEN_COBERTURA,
};
export type {
  Deltas,
  Falta,
  Peldano,
  ClaseVeredicto,
  Veredicto,
  Cobertura,
  RunningHistory,
  Esfuerzo,
  PuntoSemana,
  Pedido,
  PuntoCansado,
  CarreraObjetivo,
  Vo2Lectura,
  TipoObservacion,
};

// ---------------------------------------------------------------------------
// EL MÉTODO DEL COACH, PARA EL DOBLE
// ---------------------------------------------------------------------------
//
// El servidor resuelve esto mezclando la fila real del coach sobre los
// defectos (`resolveEffectiveRunningThresholds`, `web/lib/coach/`); el doble no
// tiene coach ni base de datos, así que enseña directamente los defectos — son
// los mismos con los que arrancaría cualquier coach nuevo, y son los números
// que esta maqueta siempre pintó (6 semanas, 3 s/km, 80/20…).
//
// `reparto` YA ERA dato del coach antes de esta obra: vivía repetido a mano
// aquí como `{ suave: 80, fuerte: 20 }`. Ahora sale de donde vive de verdad —
// `polarization_low_pct` / `polarization_high_pct` en `hr-method.ts` — y no se
// declara una segunda vez.
export const METODO: CoachRunningThresholds & { reparto: { suave: number; fuerte: number } } = {
  ...DEFAULT_COACH_RUNNING_THRESHOLDS,
  reparto: {
    suave: DEFAULT_COACH_HR_METHOD.polarization_low_pct,
    fuerte: DEFAULT_COACH_HR_METHOD.polarization_high_pct,
  },
};

// ---------------------------------------------------------------------------
// EL COLOR — lo único que de verdad es de esta pantalla
// ---------------------------------------------------------------------------

const TONO: Record<ClaseVeredicto, string> = {
  mejor: 'var(--twin-ok)',
  igual: 'var(--twin-fg)',
  // Aviso, no alarma: el rojo se reserva para lo que hay que atender hoy.
  cargando: 'var(--twin-warning)',
  peor: 'var(--twin-warning)',
  'aun-no': 'var(--twin-muted)',
};

export function tonoDe(c: ClaseVeredicto): string {
  return TONO[c];
}
