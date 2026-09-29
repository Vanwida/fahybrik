// LOS HUECOS DEL PANEL DEL COACH — qué dice un bloque cuando está vacío, cuando
// le falta tiempo o cuando todavía no se sirve, y cuál es su salida. Un solo
// sitio para toda esa prosa (A10): el bloque no la escribe, la deriva de la
// FALTA que manda el servidor.
//
// EN LA VOZ DEL COACH. La propuesta firmada reutilizaba los textos del iPhone
// («Empezar un entreno», «Conectar tu reloj»): el coach no puede empezar un
// entreno por su atleta. Aquí cada hueco habla del atleta en tercera persona y
// su salida es algo que el coach SÍ puede hacer desde la ficha: ver su plan,
// escribirle, declarar su umbral o ir a sus tests. Si no hay nada que hacer
// (solo falta tiempo), se dibuja el plazo y no hay botón.
//
// Puro.

import type { BloquePanel } from '@fahybrid/shared/domain/analytics/panel';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { conPrefijo, falta, lectura, seCalla, type FaltaPintable } from './lecturas';

/** Lo que el coach puede hacer desde la ficha para llenar un hueco. */
export type AccionHueco = 'plan' | 'escribir' | 'umbral' | 'tests';

export const ACCION_ETIQUETA: Record<AccionHueco, string> = {
  plan: 'Ver su plan',
  escribir: 'Escribirle',
  umbral: 'Declarar su umbral',
  tests: 'Ver sus tests',
};

export interface Hueco {
  /** `vacio`: nada que enseñar · `poco`: se enseña, pero con su plazo · `pendiente`: el bloque aún no se sirve. */
  tipo: 'vacio' | 'poco' | 'pendiente';
  titulo: string;
  cuerpo: string;
  accion?: AccionHueco;
  /** Un enlace dentro de la misma pestaña (el cálculo anterior, mientras el bloque nuevo no se sirve). */
  enlace?: { etiqueta: string; href: string };
  /** Lo que falta de tiempo, cuando falta tiempo. */
  plazo?: { llevas: number; hacen: number; unidad: 'dias' | 'semanas' | 'noches' };
}

/** Los bloques que el panel pinta como tarjeta (el estado va en la cabecera). */
export type BloqueTarjeta = Exclude<BloquePanel, 'estado'>;

const PENDIENTE: Record<BloqueTarjeta, string> = {
  forma: 'La forma, la fatiga y la frescura con su proyección llegan en la siguiente entrega del panel.',
  semanas: 'Lo planificado frente a lo hecho por semana llega en la siguiente entrega del panel.',
  intensidad: 'El tiempo en zonas por semana y el reparto fácil · medio · duro llegan en la siguiente entrega del panel.',
  progreso: 'El «¿mejora?» de cada familia llega en la siguiente entrega del panel.',
  records: 'La lista única de marcas de todas las familias llega en la siguiente entrega del panel.',
  carrera: 'El tiempo previsto y el hueco tramo a tramo llegan en la siguiente entrega del panel.',
  recuperacion: 'Variabilidad, pulso en reposo y sueño contra su normal llegan en la siguiente entrega del panel.',
};

/** Dónde sigue el cálculo anterior de un bloque mientras el nuevo no se sirve. */
export interface Legado {
  /** Cómo se llama la sección vieja («Fisiología»). */
  seccion: string;
  href: string;
}

/**
 * El hueco de un bloque que el servidor aún no sirve (va en `pendientes`). Si
 * la pestaña aún enseña su cálculo anterior, se dice dónde: nada se pierde
 * mientras se sustituye.
 */
export function huecoPendiente(bloque: BloqueTarjeta, legado?: Legado | null): Hueco {
  return {
    tipo: 'pendiente',
    titulo: 'Todavía no se calcula aquí',
    cuerpo: legado ? `${PENDIENTE[bloque]} Mientras, lo tienes con el cálculo anterior en «${legado.seccion}», más abajo.` : PENDIENTE[bloque],
    enlace: legado ? { etiqueta: `Ir a ${legado.seccion}`, href: legado.href } : undefined,
  };
}

function plazoDe(f: FaltaPintable | null, unidad: 'dias' | 'semanas' | 'noches'): Hueco['plazo'] {
  return f?.por === 'historia' ? { llevas: Math.max(0, Math.min(f.llevas, f.hacen)), hacen: f.hacen, unidad } : undefined;
}

// ---------------------------------------------------------------------------
// Bloque a bloque
// ---------------------------------------------------------------------------

/** Forma y fatiga: vacío sin una sola sesión; «poco» mientras la media de la forma arranca. */
export function huecoForma(forma: readonly Lectura[]): Hueco | null {
  const fondo = lectura(forma, 'carga.fondo');
  if (!fondo) return null;
  const f = falta(fondo);
  if (fondo.estado !== 'medida') {
    return {
      tipo: 'vacio',
      titulo: 'Sin entrenos todavía',
      cuerpo: 'Su forma aparece con los primeros entrenos: cada uno con esfuerzo, ritmo o pulso suma carga. Con seis semanas la curva ya es fiable.',
      accion: 'plan',
    };
  }
  if (f?.por === 'historia') {
    return {
      tipo: 'poco',
      titulo: 'Arrancando',
      cuerpo: `La forma es la media de ${f.hacen} días: hasta entonces sube por pura aritmética, no porque mejore.`,
      plazo: plazoDe(f, 'dias'),
    };
  }
  return null;
}

/** Semana a semana: vacío cuando en la ventana no hay nada hecho. */
export function huecoSemanas(semanas: readonly Lectura[]): Hueco | null {
  const carga = lectura(semanas, 'semanas.carga');
  if (!carga || carga.estado === 'medida') return null;
  return {
    tipo: 'vacio',
    titulo: 'Nada hecho en esta ventana',
    cuerpo: 'Aquí verás cada semana lo que tenía planificado frente a lo que hizo, por familia.',
    accion: 'plan',
  };
}

/** Intensidad: sin pulso falta el aparato; con pulso y sin umbral, el umbral (que el coach puede declarar). */
export function huecoIntensidad(intensidad: readonly Lectura[]): Hueco | null {
  const zonas = lectura(intensidad, 'intensidad.zonas');
  if (!zonas || zonas.estado === 'medida') return null;
  const f = falta(zonas);
  if (f?.por === 'ancla') {
    return {
      tipo: 'vacio',
      titulo: 'Tiene pulso, pero no umbral',
      cuerpo: 'Con su umbral de pulso (de un test o declarado aquí) cada entreno se reparte solo por zonas.',
      accion: 'umbral',
    };
  }
  if (f?.por === 'sensor' || f?.por === 'dispositivo') {
    return {
      tipo: 'vacio',
      titulo: 'Sin pulso en sus entrenos',
      cuerpo: 'Las zonas salen del pulso: con una banda o el reloj, cada entreno se reparte solo.',
      accion: 'escribir',
    };
  }
  return {
    tipo: 'vacio',
    titulo: 'Nada con pulso en esta ventana',
    cuerpo: 'El reparto por zonas aparece con los primeros entrenos con pulso.',
    accion: 'plan',
  };
}

/** Progreso: vacío si ninguna familia tiene número (y lo que no existe en su vida se calla). */
export function huecoProgreso(progreso: readonly Lectura[]): Hueco | null {
  const filas = progreso.filter((l) => !seCalla(falta(l)));
  if (filas.some((l) => l.estado === 'medida')) return null;
  return {
    tipo: 'vacio',
    titulo: 'Sin marcas que seguir',
    cuerpo: 'Cada familia tiene su número clave: el ritmo umbral, el 2000 m de remo, la sentadilla. Salen con los primeros entrenos.',
    accion: 'plan',
  };
}

/** Récords: vacío sin ninguna marca. */
export function huecoRecords(records: readonly Lectura[]): Hueco | null {
  if (records.some((l) => l.estado === 'medida')) return null;
  return {
    tipo: 'vacio',
    titulo: 'Todavía sin récords',
    cuerpo: 'La primera marca de cada prueba será su récord. Aquí se quedan todos, de todas las familias.',
    accion: 'tests',
  };
}

/** Carrera: sin carrera objetivo (la elige el atleta en su app); con previsión parcial, qué tramos faltan. */
export function huecoCarrera(carrera: readonly Lectura[]): Hueco | null {
  const objetivo = lectura(carrera, 'carrera.objetivo');
  if (objetivo && objetivo.estado !== 'medida') {
    return {
      tipo: 'vacio',
      titulo: 'Sin carrera objetivo',
      cuerpo: 'Con una carrera objetivo verás su tiempo previsto, el hueco tramo a tramo y cómo llega de fresco. La elige el atleta en su app.',
      accion: 'escribir',
    };
  }
  const prevision = lectura(carrera, 'carrera.prevision');
  if (prevision && prevision.estado !== 'medida') {
    const f = falta(prevision);
    const sinMarca = conPrefijo(carrera, 'carrera.tramo.').filter((l) => l.estado !== 'medida').map((l) => l.titulo_es);
    if (f?.por === 'pareja') {
      return { tipo: 'poco', titulo: 'Falta su pareja', cuerpo: 'En dobles, la previsión necesita a la pareja de la carrera.', accion: 'escribir' };
    }
    return {
      tipo: 'poco',
      titulo: `Previsión parcial${sinMarca.length > 0 ? `: faltan ${sinMarca.length} ${sinMarca.length === 1 ? 'tramo' : 'tramos'}` : ''}`,
      cuerpo: sinMarca.length > 0 ? `Sin marca de ${sinMarca.join(', ')}. Una previsión parcial no es un tiempo.` : 'Faltan marcas para dar un tiempo.',
      accion: 'tests',
    };
  }
  return null;
}

/** Recuperación: sin noches recientes falta el reloj; con ellas pero sin basal, tiempo. */
export function huecoRecuperacion(recuperacion: readonly Lectura[]): Hueco | null {
  const senales = ['recuperacion.variabilidad', 'recuperacion.pulso_reposo', 'recuperacion.sueno'].map((id) => lectura(recuperacion, id)).filter((l): l is Lectura => l != null);
  if (senales.length === 0 || senales.some((l) => l.estado === 'medida')) return null;
  const historia = senales.map(falta).find((f) => f?.por === 'historia') ?? null;
  if (historia) {
    return {
      tipo: 'poco',
      titulo: 'Formando su normal',
      cuerpo: 'Hasta tener su basal, lo de estas noches se compararía contra nada: el cambio se dice cuando la hay.',
      plazo: plazoDe(historia, 'noches'),
    };
  }
  return {
    tipo: 'vacio',
    titulo: 'Sin reloj que mida sus noches',
    cuerpo: 'La variabilidad, el pulso en reposo y el sueño los mide su reloj cada noche.',
    accion: 'escribir',
  };
}
