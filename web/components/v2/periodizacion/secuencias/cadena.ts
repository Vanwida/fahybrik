// La cadena de microciclos de una secuencia, dicha como CAMINO.
//
// Una secuencia es lo que va a recorrer el atleta, así que se lee igual aquí que
// en su móvil: el mismo camino vertical (`web/components/plan-espina`), los
// mismos rótulos de semana («S1-S4») y el mismo color por posición. Antes se
// pintaba como una fila horizontal de tarjetas con flechas y una barra gris sin
// nombres: el coach veía cuántos trozos hay, no por dónde pasa su atleta.
//
// Esto es puro y sin React a propósito: aquí se decide QUÉ dice cada parada y
// eso se fija con pruebas. El dibujo y los controles de edición van aparte.
//
// DE DÓNDE SALE CADA COSA (y qué NO se inventa)
// ---------------------------------------------
// · El rótulo de semanas se ACUMULA a lo largo de la cadena con `weeksLabel`, la
//   misma función que usa el servidor al resolver el camino real de un atleta
//   (`lib/plan/camino.ts`). Un microciclo sin semanas definidas NO avanza la
//   cuenta y se rotula «—»: fingir que ocupa una semana desplazaría todos los
//   rótulos siguientes.
// · El tono es la POSICIÓN (`planPathTone`), nunca lo que dice el nombre del
//   microciclo. Es agnóstico (HARD RULE Nº0) y es estable: añadir uno al final no
//   recolorea los de antes.
// · No hay hitos. Una secuencia es una plantilla: todavía no existen las
//   asignaciones de las que sale un simulacro o un test, así que marcar uno sería
//   inventárselo. Los hitos aparecen cuando la secuencia se materializa sobre un
//   atleta, y ahí ya los resuelve `resolvePlanPath`.

import { planPathTone, weeksLabel } from '@fahybrid/shared/domain/plan-path';

/** Cuando un microciclo no declara ni una semana, su rótulo no puede mentir. */
const SIN_SEMANAS = '—';

/** Un eslabón de la cadena, tal y como lo tiene delante quien la dibuja. */
export interface EslabonCadena {
  /** Clave estable de React (la del borrador en el editor, la posición en la previa). */
  clave: string;
  /** El microciclo referenciado (`program_month_templates.id`). */
  month_template_id: string;
  /** Su nombre, o `null` cuando ya no está en la biblioteca del coach. */
  nombre: string | null;
  /** Semanas que define (`program_month_weeks`). 0 = creado y todavía vacío. */
  semanas: number;
  /** En cuántas celdas de la matriz aparece este microciclo. 1 = solo en esta. */
  usos?: number;
}

/** Una parada de la cadena, ya decidida y todavía sin dibujar. */
export interface NodoCadena {
  clave: string;
  month_template_id: string;
  /** Su sitio en la cadena, 1-based. Es lo que decide el tono. */
  orden: number;
  /** «S1» · «S5-S8» · «—» cuando no declara semanas. */
  semanas: string;
  titulo: string;
  /** Lo que hay que saber de este eslabón y el nombre no dice. */
  detalle: string | null;
  /** Tono por posición. `null` = el microciclo falta y se pinta como error. */
  tono: number | null;
  /** El microciclo ya no está en la biblioteca. */
  falta: boolean;
  semanasCuenta: number;
  /** El rótulo que se lee en voz alta. */
  etiqueta: string;
}

/**
 * Las paradas de una cadena, en orden. La cuenta de semanas arranca en 1 y solo
 * la avanzan los microciclos que declaran alguna.
 */
export function nodosDeCadena(eslabones: EslabonCadena[]): NodoCadena[] {
  let primeraSemana = 1;
  return eslabones.map((e, i) => {
    const falta = e.nombre === null;
    const tieneSemanas = e.semanas > 0;
    const semanas = tieneSemanas ? weeksLabel(primeraSemana, e.semanas) : SIN_SEMANAS;
    if (tieneSemanas) primeraSemana += e.semanas;

    const titulo = e.nombre ?? 'Microciclo eliminado';
    const detalle = notas(falta, tieneSemanas, e.usos ?? 1).join(' · ') || null;
    return {
      clave: e.clave,
      month_template_id: e.month_template_id,
      orden: i + 1,
      semanas,
      titulo,
      detalle,
      tono: falta ? null : planPathTone(i),
      falta,
      semanasCuenta: e.semanas,
      etiqueta: etiqueta(i + 1, titulo, tieneSemanas ? `${plural(e.semanas, 'semana', 'semanas')} (${semanas})` : null, detalle),
    };
  });
}

/** El rótulo en voz alta: el sitio, el nombre, lo que dura y lo que le pasa. */
function etiqueta(orden: number, titulo: string, duracion: string | null, detalle: string | null): string {
  return [`${orden}. ${titulo}`, duracion, detalle].filter(Boolean).join(', ');
}

function notas(falta: boolean, tieneSemanas: boolean, usos: number): string[] {
  const salida: string[] = [];
  if (falta) salida.push('Ya no está en tu biblioteca · quítalo de la cadena');
  else if (!tieneSemanas) salida.push('Todavía no tiene ninguna semana montada');
  if (!falta && usos > 1) {
    salida.push(usos === 2 ? 'También en otra secuencia' : `También en otras ${usos - 1} secuencias`);
  }
  return salida;
}

function plural(n: number, singular: string, formaPlural: string): string {
  return `${n} ${n === 1 ? singular : formaPlural}`;
}
