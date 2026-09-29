// LO QUE PASA CUANDO EL ATLETA TOCA — el reductor del doble, puro y probado.
//
// La pestaña es un prototipo vivo: quitar un objetivo, hacer principal a otro,
// fijar una carrera nueva, importar el historial o deshacerlo CAMBIAN la
// lectura, y con ella el sujeto. Cada regla es la del servidor, no una
// comodidad del doble:
//   · un solo principal a la vez (`POST /races/target/{id}` degrada al anterior);
//   · fijar una carrera nueva la hace principal y pasa la anterior a secundaria;
//   · «No soy yo» borra TODO lo importado y deja los objetivos vencidos sin
//     resultado (esos no vienen de ninguna importación);
//   · el predicho depende del atleta, no de la carrera: al cambiar de principal
//     se recalcula y mientras tanto está «cargando».

import type {
  AnalisisCarrera,
  CarreraPasada,
  Categoria,
  Division,
  EventoCalendario,
  Formato,
  LecturaCarreras,
  Prediccion,
  ProximaCarrera,
} from './contrato';
import { principalDe } from './decide';
import { diasEntre } from './formato';

export type Cambio =
  | { tipo: 'quitar'; raceId: number }
  | { tipo: 'hacer-principal'; raceId: number }
  | {
      tipo: 'fijar';
      evento: EventoCalendario;
      formato: Formato;
      division: Division;
      categoria: Categoria;
      metaS: number | null;
      fecha: string | null;
    }
  | { tipo: 'cambiar-meta'; raceId: number; metaS: number | null }
  | { tipo: 'importar'; pasadas: CarreraPasada[]; analisis: AnalisisCarrera | null }
  | { tipo: 'deshacer-importacion' }
  /** El predicho recalculado llega (lo dispara la pantalla tras un `cargando`). */
  | { tipo: 'prediccion'; valor: Prediccion }
  /** Solo del doble: una pieza que se recarga tras un fallo (los «Reintentar»). */
  | { tipo: 'parche'; parche: Partial<LecturaCarreras> };

/**
 * Qué predicho le toca al atleta tras cambiar de principal (o de meta), con lo
 * que se sabe. El total es del ATLETA (sus estaciones, su ritmo): no cambia con
 * la carrera; el hueco sí, porque depende de la meta. Lo que no se puede saber
 * desde aquí (un atleta que nunca vio cifra) queda «sin datos», no inventado.
 */
export function prediccionTras(antes: Prediccion, nuevo: ProximaCarrera | null): Prediccion {
  if (!nuevo) return { tipo: 'no-aplica' };
  if (nuevo.tipoEvento !== 'hyrox') return nuevo.metaS == null ? { tipo: 'sin-meta' } : { tipo: 'no-aplica' };
  if (nuevo.metaS == null) return { tipo: 'sin-meta' };
  if (antes.tipo === 'cifra') return { tipo: 'cifra', totalS: antes.totalS, huecoS: antes.totalS - nuevo.metaS, pareja: antes.pareja };
  if (antes.tipo === 'parcial') return antes;
  return { tipo: 'sin-datos' };
}

/** Las de `nuevas` pisan a las que ya estaban con el mismo `raceId`; el resto se conserva. */
export function unirPorId(actuales: CarreraPasada[], nuevas: CarreraPasada[]): CarreraPasada[] {
  const ids = new Set(nuevas.map((n) => n.raceId));
  return [...actuales.filter((a) => !ids.has(a.raceId)), ...nuevas];
}

const conPrincipalUnico = (lista: ProximaCarrera[], raceId: number | null): ProximaCarrera[] =>
  lista.map((c) => {
    if (c.raceId === raceId) return { ...c, prioridad: 'target' };
    return (c.prioridad ?? 'target') === 'target' ? { ...c, prioridad: 'secondary' } : c;
  });

/** ¿Cambió el principal (o su meta)? Entonces el predicho hay que recalcularlo. */
function recalcula(antes: LecturaCarreras, despues: LecturaCarreras): LecturaCarreras {
  const a = principalDe(antes.proximas);
  const d = principalDe(despues.proximas);
  if (a?.raceId === d?.raceId && a?.metaS === d?.metaS) return despues;
  // Sin principal no hay nada que esperar: se resuelve de inmediato.
  if (!d) return { ...despues, prediccion: { tipo: 'no-aplica' } };
  return { ...despues, prediccion: { tipo: 'cargando' } };
}

export function aplicar(l: LecturaCarreras, c: Cambio): LecturaCarreras {
  switch (c.tipo) {
    case 'quitar': {
      const proximas = l.proximas.filter((x) => x.raceId !== c.raceId);
      return recalcula(l, { ...l, proximas });
    }
    case 'hacer-principal':
      return recalcula(l, { ...l, proximas: conPrincipalUnico(l.proximas, c.raceId) });
    case 'fijar': {
      const fecha = c.fecha ?? c.evento.fecha;
      const raceId = Math.max(0, ...l.proximas.map((x) => x.raceId), ...l.pasadas.map((x) => x.raceId)) + 1;
      const nueva: ProximaCarrera = {
        raceId,
        nombre: c.evento.nombre,
        tipoEvento: c.evento.tipoEvento,
        formato: c.formato,
        division: c.division,
        categoria: c.categoria,
        fecha,
        lugar: c.evento.ciudad,
        metaS: c.metaS,
        diasHasta: fecha ? Math.max(0, diasEntre(l.hoy, fecha)) : null,
        prioridad: 'target',
      };
      const proximas = [...conPrincipalUnico(l.proximas, null), nueva];
      return recalcula(l, { ...l, proximas });
    }
    case 'cambiar-meta': {
      const proximas = l.proximas.map((x) => (x.raceId === c.raceId ? { ...x, metaS: c.metaS } : x));
      return recalcula(l, { ...l, proximas });
    }
    case 'importar':
      // Importar es idempotente por carrera (re-importar refresca, no duplica): un upsert por raceId.
      return { ...l, pasadas: unirPorId(l.pasadas, c.pasadas), analisis: c.analisis ?? l.analisis };
    case 'deshacer-importacion':
      // Lo importado se va; el objetivo vencido sin resultado no venía de ninguna importación.
      return { ...l, pasadas: l.pasadas.filter((p) => p.resultadoS == null), analisis: null };
    case 'prediccion':
      return { ...l, prediccion: c.valor };
    case 'parche':
      return { ...l, ...c.parche };
  }
}
