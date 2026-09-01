// VELOCIDAD CRÍTICA (CS) Y DEPÓSITO (D') — el motor puro del modelo de dos
// parámetros (Monod & Scherrer) aplicado a esfuerzos de carrera.
//
// EL MODELO
// ---------
// distancia = CS × tiempo + D'          (equivalente: velocidad = CS + D'/tiempo)
//
// CS es la velocidad que el atleta sostiene indefinidamente sin que la reserva
// anaeróbica intervenga — el umbral leído por el lado de la resistencia. D' es
// esa reserva: cuántos metros de margen tiene por encima de CS antes de que el
// depósito se vacíe. Dos números, de una recta: la distancia de cada esfuerzo
// máximo, puesta en función de su duración.
//
// POR QUÉ R² NO BASTA COMO PUERTA — Y ES EL ERROR CLÁSICO
// ---------------------------------------------------------
// Tres puntos con uno lejano ajustan bien una recta SIEMPRE: es geometría, no
// fisiología. Caso real de producción (atleta 67): 1000 m en 230 s, 1600 m en
// 480 s y 10000 m en 2917 s. El de 10 km sale MÁS RÁPIDO que el de 1600 m
// (3,43 vs 3,33 m/s) — no son esfuerzos máximos del mismo día, son tandas de
// intensidad distinta. Y sin embargo, ajustados los tres a una recta
// distancia~tiempo, el R² sale 0,9994. Un umbral de "R² ≥ 0,95" los habría
// aceptado sin dudar, prediciendo una capacidad inventada.
//
// La ENVOLVENTE MONÓTONA es la puerta que de verdad separa "esfuerzos
// máximos" de "lo que corrió esta semana": si un esfuerzo largo es más rápido
// que uno corto, ninguno de los dos puede ser el máximo del atleta a esa
// duración — al menos uno es submáximo, y ajustar sobre datos submáximos no
// mide capacidad, mide esfuerzo. Por eso la envolvente corre ANTES del
// ajuste, no después: el R² de una recta que no debería haberse trazado no es
// evidencia de nada.
//
// LA PRUEBA DE QUE LA ENVOLVENTE HACE EL TRABAJO PESADO (no solo el R²)
// -----------------------------------------------------------------------
// Consecuencia poco intuitiva, y fijada aquí con un test: si la envolvente se
// sostiene (duración creciente, velocidad estrictamente decreciente), el D'
// del ajuste por mínimos cuadrados sale SIEMPRE positivo — se deduce de la
// desigualdad de Chebyshev ponderada aplicada a (tiempo, velocidad) como
// series opuestamente ordenadas. En la práctica, la puerta de "parámetro
// imposible" sólo puede dispararse por CS ≤ 0 (un frenazo tan violento entre
// dos esfuerzos que la distancia deja de crecer con el tiempo) — nunca por
// D' < 0: si la envolvente ya pasó, D' < 0 no es alcanzable. El check
// comprueba los dos parámetros de todos modos: documenta la invariante y
// protege contra el redondeo de punto flotante justo en el borde.
//
// MECANISMO vs MÉTODO (HARD RULE Nº0)
// ------------------------------------
// Esta aritmética (mínimos cuadrados, envolvente, R²) es la MISMA para
// cualquier entrenador — no hay dos maneras correctas de ajustar una recta.
// Los UMBRALES (cuántos esfuerzos, qué ventana de duración, cuánta
// separación, qué R² mínimo, cuánta deriva admite contra el umbral) sí los
// decide el coach: llegan en `CoachAnalyticsMethod` (`./metodo.ts`), nunca
// como constante local de este fichero.
//
// Puro y sin base de datos, como todo `shared/domain`. Recibe esfuerzos YA
// CONSTRUIDOS (p. ej. por `running/best-efforts.ts::buildEffortCurve`) — este
// módulo no sabe de dónde salen ni los proyecta con Riegel: eso ya pasó antes.

import type { CoachAnalyticsMethod } from './metodo';

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

/** Un esfuerzo máximo real: lo que corrió, en cuánto. Nada proyectado aquí. */
export interface EsfuerzoMaximal {
  distancia_m: number;
  duracion_s: number;
}

// ---------------------------------------------------------------------------
// POR QUÉ UN AJUSTE PUEDE NO DARSE
// ---------------------------------------------------------------------------

/**
 * Seis puertas, seis motivos — cada uno una razón distinta por la que los
 * datos no sostienen una capacidad. Discriminada y sin texto libre: quien la
 * lee decide qué enseñar sin tener que interpretar una frase.
 *
 *   pocos_esfuerzos     no hay suficientes puntos para separar dos parámetros.
 *   poca_separacion     los puntos que hay están demasiado juntos en duración:
 *                       para el ajuste son casi el mismo punto repetido.
 *   no_es_envolvente    un esfuerzo largo sale más rápido que uno corto — no
 *                       son esfuerzos máximos, y ajustar sobre ellos inventa
 *                       una capacidad. La puerta más importante de las seis.
 *   ajuste_pobre        la recta no explica los datos lo bastante bien.
 *   parametro_imposible el ajuste dio una pendiente o una ordenada que no
 *                       puede ser una capacidad real (en la práctica: CS ≤ 0;
 *                       ver la cabecera del fichero).
 *   lejos_del_umbral    la CS ajustada no se parece al umbral ya medido por
 *                       otro camino — los esfuerzos no fueron máximos.
 */
export type NoAjusta =
  | { por: 'pocos_esfuerzos'; llevas: number; hacen: number }
  | { por: 'poca_separacion'; separacion: number; hacen: number }
  | { por: 'no_es_envolvente'; detalle: { corto_s: number; largo_s: number } }
  | { por: 'ajuste_pobre'; r2: number; hace: number }
  | { por: 'parametro_imposible'; cs_m_s: number; d_prima_m: number }
  | { por: 'lejos_del_umbral'; desvio_pct: number; hace: number };

/**
 * `ok: true` — capacidad ajustada, con qué esfuerzos se usó y cuántos se
 * descartaron por ventana (para que la respuesta nunca oculte lo que no
 * contó). `ok: false` — por qué no, y sobre cuántos esfuerzos admisibles se
 * decidió (los que sobrevivieron la ventana, aunque luego no alcanzaran).
 */
export type AjusteCapacidad =
  | {
      ok: true;
      cs_m_s: number;
      d_prima_m: number;
      r2: number;
      esfuerzos_usados: EsfuerzoMaximal[];
      descartados: number;
    }
  | { ok: false; razon: NoAjusta; esfuerzos_admisibles: number };

// ---------------------------------------------------------------------------
// EL AJUSTE
// ---------------------------------------------------------------------------

/** Finito y positivo. Un esfuerzo con un número roto no es un esfuerzo: cae
 *  en la misma puerta que la ventana de duración, nunca lanza. */
function esValido(e: EsfuerzoMaximal): boolean {
  return (
    Number.isFinite(e.distancia_m) &&
    e.distancia_m > 0 &&
    Number.isFinite(e.duracion_s) &&
    e.duracion_s > 0
  );
}

function rechazo(razon: NoAjusta, esfuerzos_admisibles: number): AjusteCapacidad {
  return { ok: false, razon, esfuerzos_admisibles };
}

export function ajustarVelocidadCritica(
  esfuerzos: readonly EsfuerzoMaximal[],
  metodo: CoachAnalyticsMethod,
  umbral?: { velocidad_m_s: number } | null,
): AjusteCapacidad {
  // ── Puerta 1 — ventana de duración ────────────────────────────────────────
  // Fuera de [cs_min_duration_s, cs_max_duration_s] el modelo de dos
  // parámetros deja de describir a un humano (ver metodo.ts). Un número roto
  // (NaN, Infinity, distancia o duración ≤ 0) no puede vivir en ninguna
  // ventana, así que cae en el mismo filtro — contado, nunca oculto.
  const admisibles = esfuerzos.filter(
    (e) =>
      esValido(e) &&
      e.duracion_s >= metodo.cs_min_duration_s &&
      e.duracion_s <= metodo.cs_max_duration_s,
  );
  const descartados = esfuerzos.length - admisibles.length;

  // ── Puerta 2 — número ──────────────────────────────────────────────────────
  // Con dos puntos la recta pasa exacta por los dos y "ajusta perfecto"
  // siempre: no es que ajuste bien, es que no hay nada que ajustar.
  if (admisibles.length < metodo.cs_min_efforts) {
    return rechazo(
      { por: 'pocos_esfuerzos', llevas: admisibles.length, hacen: metodo.cs_min_efforts },
      admisibles.length,
    );
  }

  // Orden ascendente de duración: el eje sobre el que se leen la separación,
  // la envolvente y el propio ajuste. Se calcula una vez, se reutiliza en las
  // tres puertas siguientes.
  const ordenados = [...admisibles].sort((a, b) => a.duracion_s - b.duracion_s);
  const duracionMin = ordenados[0]!.duracion_s;
  const duracionMax = ordenados[ordenados.length - 1]!.duracion_s;

  // ── Puerta 3 — separación ─────────────────────────────────────────────────
  // Tres esfuerzos de duración parecida son, para el ajuste, un solo punto
  // repetido tres veces: no hay tramo de curva que separar en dos parámetros.
  const separacion = duracionMax / duracionMin;
  if (separacion < metodo.cs_min_spread_ratio) {
    return rechazo(
      { por: 'poca_separacion', separacion, hacen: metodo.cs_min_spread_ratio },
      admisibles.length,
    );
  }

  // ── Puerta 4 — envolvente monótona (la que hace el trabajo pesado) ────────
  // Ordenados por duración creciente, la VELOCIDAD tiene que ir estrictamente
  // decreciendo. Si no, hay un par que no son esfuerzos máximos — ver la
  // cabecera del fichero para el caso real que esta puerta existe para
  // atrapar, y para la prueba de por qué basta con mirar pares consecutivos.
  for (let i = 0; i < ordenados.length - 1; i++) {
    const corto = ordenados[i]!;
    const largo = ordenados[i + 1]!;
    const velCorto = corto.distancia_m / corto.duracion_s;
    const velLargo = largo.distancia_m / largo.duracion_s;
    if (velLargo >= velCorto) {
      return rechazo(
        { por: 'no_es_envolvente', detalle: { corto_s: corto.duracion_s, largo_s: largo.duracion_s } },
        admisibles.length,
      );
    }
  }

  // ── Puerta 5 — el ajuste ───────────────────────────────────────────────────
  // Mínimos cuadrados de distancia sobre tiempo: pendiente = CS, ordenada = D'.
  const n = ordenados.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const e of ordenados) {
    sumX += e.duracion_s;
    sumY += e.distancia_m;
    sumXY += e.duracion_s * e.distancia_m;
    sumXX += e.duracion_s * e.duracion_s;
  }
  const denom = n * sumXX - sumX * sumX;
  // denom = n × Σ(t - t̄)² — cero exigiría todas las duraciones idénticas, y la
  // puerta 3 ya lo ha descartado (el spread_ratio mínimo del método es > 1).
  // Guardia defensiva, no un camino real.
  const cs_m_s = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const d_prima_m = denom !== 0 ? (sumY - cs_m_s * sumX) / n : 0;

  // ── Puerta 6 — parámetros posibles ────────────────────────────────────────
  // En la práctica sólo CS puede fallar aquí: con la envolvente ya sostenida,
  // D' negativo es matemáticamente inalcanzable (ver cabecera). Se comprueban
  // los dos porque el contrato lo pide y porque el punto flotante no siempre
  // respeta una desigualdad estricta hasta el último decimal.
  if (!(cs_m_s > 0) || !(d_prima_m > 0)) {
    return rechazo({ por: 'parametro_imposible', cs_m_s, d_prima_m }, admisibles.length);
  }

  // R² — cuánto explica la recta frente a la propia media de las distancias.
  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;
  for (const e of ordenados) {
    const yHat = cs_m_s * e.duracion_s + d_prima_m;
    ssRes += (e.distancia_m - yHat) ** 2;
    ssTot += (e.distancia_m - meanY) ** 2;
  }
  // ssTot = 0 exigiría distancias idénticas, lo que fuerza CS = 0 exacto — ya
  // atrapado en la puerta 6. Guardia defensiva, no un camino real.
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // ── Puerta 7 — bondad del ajuste ──────────────────────────────────────────
  const r2Minimo = metodo.cs_min_fit_r2_pct / 100;
  if (r2 < r2Minimo) {
    return rechazo({ por: 'ajuste_pobre', r2, hace: r2Minimo }, admisibles.length);
  }

  // ── Puerta 8 — cordura contra el umbral, solo si hay umbral que preguntar ─
  // CS y el umbral miden casi lo mismo por caminos distintos; si no se
  // parecen, los esfuerzos no fueron máximos y el ajuste describe una tarde
  // floja, no una capacidad. Un umbral con un número roto se trata como
  // ausente: esta puerta no es el sitio para fallar por un dato ajeno.
  if (umbral != null && Number.isFinite(umbral.velocidad_m_s) && umbral.velocidad_m_s > 0) {
    const desvio_pct = (Math.abs(cs_m_s - umbral.velocidad_m_s) / umbral.velocidad_m_s) * 100;
    if (desvio_pct > metodo.cs_max_drift_from_threshold_pct) {
      return rechazo(
        { por: 'lejos_del_umbral', desvio_pct, hace: metodo.cs_max_drift_from_threshold_pct },
        admisibles.length,
      );
    }
  }

  return { ok: true, cs_m_s, d_prima_m, r2, esfuerzos_usados: ordenados, descartados };
}

// ---------------------------------------------------------------------------
// LAS LECTURAS — el ajuste, contado como lo cuenta el resto de la pantalla
// ---------------------------------------------------------------------------
//
// POR QUÉ D' VALE AQUÍ MÁS QUE EL VO₂MÁX
// --------------------------------------
// A un corredor de fondo el VO₂máx le resume la carrera entera. A un híbrido no:
// entre estación y estación lo que decide no es su techo aeróbico sino cuánto
// depósito le queda para el siguiente empujón. D' ES ese depósito, medido en
// metros — lo que puede correr por encima de su velocidad crítica antes de que
// se acabe. Por eso entra en el grupo `capacidad` con nombre propio y no como
// nota al pie de un ajuste.
//
// Y POR QUÉ, HOY, CASI SIEMPRE SALDRÁ SIN DATO
// --------------------------------------------
// El ajuste necesita esfuerzos MÁXIMOS a duraciones distintas. Lo que hay en la
// base son los entrenos que el atleta hizo, que casi nunca lo son — un 10 km
// suave y un 1600 de serie no describen un techo, describen un martes. Las
// puertas de `ajustarVelocidadCritica` lo detectan y la lectura lo dice, con la
// acción concreta al lado. Es la respuesta honesta, y es distinta de no tener
// la lectura.

import {
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  type Lectura,
  type Procedencia,
} from './lectura';
import type { Falta } from '../running/progress';

/** Cómo se cuenta cada motivo de no-ajuste, para no repetir el texto por rama. */
function faltaDeAjuste(razon: NoAjusta): Falta {
  switch (razon.por) {
    case 'pocos_esfuerzos':
      return { por: 'historia', llevas: razon.llevas, hacen: razon.hacen };
    // Los cuatro restantes no son cuestión de tiempo: por muchos meses que pase,
    // esfuerzos que no son máximos no se convierten en máximos solos. Lo que
    // falta es la OCASIÓN — un test hecho a propósito — y `seCalla` sabe que a
    // esa no se le dibuja un plazo.
    default:
      return { por: 'ocasion' };
  }
}

const PROCEDENCIA_CS: Procedencia = {
  de: 'ajuste_cs_dprima',
  explica_es:
    'Recta ajustada sobre tus mejores esfuerzos: la pendiente es la velocidad que puedes sostener y la ordenada, el depósito que gastas por encima de ella.',
  medida: true,
  proveedor: null,
};

export interface EntradaCapacidad {
  ajuste: AjusteCapacidad;
  /** Esfuerzos ofrecidos al ajuste, antes de ninguna puerta. */
  esfuerzos_ofrecidos: number;
  dias_ventana: number;
}

/**
 * Las dos lecturas de capacidad. Salen SIEMPRE las dos, con dato o sin él: una
 * pantalla que esconde la velocidad crítica cuando no se puede calcular deja al
 * atleta sin saber que existe ni qué tendría que hacer para tenerla.
 */
export function lecturasCapacidad(e: EntradaCapacidad): Lectura[] {
  const cobertura = {
    muestras: e.ajuste.ok ? e.ajuste.esfuerzos_usados.length : e.ajuste.esfuerzos_admisibles,
    dias_ventana: e.dias_ventana,
    dias_con_dato: 0,
    pct: pctCobertura(0, e.dias_ventana),
  };

  if (!e.ajuste.ok) {
    const falta = faltaDeAjuste(e.ajuste.razon);
    return [
      lecturaSinDato({
        id: 'capacidad.velocidad_critica',
        grupo: 'capacidad',
        titulo_es: 'Velocidad que sostienes',
        falta,
        cobertura,
        procedencia: PROCEDENCIA_CS,
      }),
      lecturaSinDato({
        id: 'capacidad.deposito',
        grupo: 'capacidad',
        titulo_es: 'Depósito por encima de ella',
        falta,
        cobertura,
        procedencia: PROCEDENCIA_CS,
      }),
    ];
  }

  const cob = { ...cobertura, dias_con_dato: e.ajuste.esfuerzos_usados.length, falta: null };
  return [
    lecturaMedida({
      id: 'capacidad.velocidad_critica',
      grupo: 'capacidad',
      titulo_es: 'Velocidad que sostienes',
      dato: { valor: e.ajuste.cs_m_s, unidad: 'm_s', referencia: null },
      // La curva REAL sobre la que se ajustó: cada punto es un esfuerzo suyo, no
      // una interpolación del modelo. Es lo que hace que el número se pueda
      // discutir en vez de solo creer.
      reparto: {
        unidad: 'metros',
        total: e.ajuste.esfuerzos_usados.reduce((s, x) => s + x.distancia_m, 0),
        partes: e.ajuste.esfuerzos_usados.map((x) => ({
          code: `${Math.round(x.duracion_s)}s`,
          etiqueta_es: `${Math.round(x.distancia_m)} m`,
          valor: x.distancia_m,
          pct: null,
        })),
      },
      cobertura: cob,
      procedencia: PROCEDENCIA_CS,
    }),
    lecturaMedida({
      id: 'capacidad.deposito',
      grupo: 'capacidad',
      titulo_es: 'Depósito por encima de ella',
      dato: { valor: e.ajuste.d_prima_m, unidad: 'metros', referencia: null },
      cobertura: cob,
      procedencia: PROCEDENCIA_CS,
    }),
  ];
}
