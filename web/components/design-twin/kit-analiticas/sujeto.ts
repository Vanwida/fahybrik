// EL SUJETO DE LA PORTADA — qué dice el bloque grande de arriba (el Estado) en
// cada uno de sus cuatro estados. La pantalla PINTA esto y no decide nada:
// iOS pinta, no calcula (A1). Puro y sin React, para que se pruebe.
//
// El Estado responde «¿cómo estoy hoy?» y lleva dentro su veredicto («¿voy a
// más o me paso?»): la palabra de hoy en grande, una línea que la explica, las
// tres cifras de carga y la disposición. Lo que no se sabe no se pinta (§7): la
// cifra que falta no existe, y lo que falta se dice con su plazo o su salida
// (`huecos.ts`, el único sitio donde vive esa prosa).
//
// HARD RULE Nº0: las palabras y los cortes de las bandas son del coach (dato con
// defecto, `metodo.ts`). Lo que aquí es mecanismo es la CLAVE de la banda (cinco
// estados cerrados) y qué tinte lleva cada una.

import type { TonoClave } from '../kit-dia/hero';
import type { EstadoBloque, EstadoFrescuraClave, PanelAnaliticas, VeredictoForma } from './contrato';
import { lectura, valorDe } from './derivados';
import { conSigno, entero } from './fmt';
import { textoHueco } from './huecos';
import { nivelDisposicion, type MetodoAnaliticas, type NivelDisposicion } from './metodo';
import type { SalidaHueco } from './piezas';

/** El color de la marca del estado. Va en la marca y en el arco, nunca en la cifra. */
export type MarcaEstado = 'ok' | 'aviso' | 'peligro' | 'info' | 'neutra';

/**
 * Qué tinte lleva el sujeto por cada estado de frescura. Aquí nada es «haz esto ahora», así que ninguno es el
 * naranja sólido: el tinte suave dice cómo estás y la palabra lo dice sin color. `mantener` y `recargando` son
 * neutros (ni aplauso ni alarma); pasarse de carga es el único con tinte de riesgo.
 */
export const TINTE_DE_ESTADO: Record<EstadoFrescuraClave, { tono: TonoClave; marca: MarcaEstado }> = {
  sobrecarga: { tono: 'peligro', marca: 'peligro' },
  optimo: { tono: 'ok', marca: 'ok' },
  mantener: { tono: 'neutro', marca: 'neutra' },
  fresco: { tono: 'info', marca: 'info' },
  recargando: { tono: 'neutro', marca: 'aviso' },
};

interface CeldaEstado {
  clave: 'forma' | 'fatiga' | 'frescura';
  etiqueta: string;
  /** Ya formateada: «51», «−4», «+22». */
  texto: string;
}

export interface SujetoEstado {
  /** El estado del bloque: de él cuelga qué hueco se dice. */
  bloque: EstadoBloque;
  tono: TonoClave;
  marca: MarcaEstado;
  titulo: string;
  /** Una línea bajo el título: el veredicto, el hueco o la glosa de la banda. */
  apoyo: string | null;
  /** Solo las que existen: lo que no se sabe no se pinta ni con guiones. */
  celdas: CeldaEstado[];
  disposicion: { valor: number; palabra: string; nivel: NivelDisposicion } | null;
  /** Cuánto falta para que forma y frescura sean fiables. */
  plazo: { llevas: number; hacen: number } | null;
  salida: SalidaHueco | null;
}

/** La frase del veredicto con su razón cuando se ha retirado, en una sola línea. */
export function frase(v: VeredictoForma): string {
  const base = v.frase_es.trim();
  if (!v.retirado_es) return base;
  const cierre = /[.!?]$/.test(base) ? base : `${base}.`;
  return `${cierre} ${v.retirado_es}`;
}

export function sujetoEstado(p: PanelAnaliticas, metodo: MetodoAnaliticas, bloque: EstadoBloque): SujetoEstado {
  const hueco = bloque === 'lleno' ? null : textoHueco('estado', bloque, p.estado.lecturas, p.atleta.hoy, metodo);
  const palabra = p.estado.palabra_es;
  const tinte = p.estado.clave ? TINTE_DE_ESTADO[p.estado.clave] : { tono: 'neutro' as TonoClave, marca: 'neutra' as MarcaEstado };

  const celdas: CeldaEstado[] = [];
  const forma = valorDe(p.estado.lecturas, 'estado.forma');
  const fatiga = valorDe(p.estado.lecturas, 'estado.fatiga');
  const frescura = valorDe(p.estado.lecturas, 'estado.frescura');
  if (forma != null) celdas.push({ clave: 'forma', etiqueta: 'Forma', texto: entero(forma) });
  if (fatiga != null) celdas.push({ clave: 'fatiga', etiqueta: 'Fatiga', texto: entero(fatiga) });
  if (frescura != null) celdas.push({ clave: 'frescura', etiqueta: 'Frescura', texto: conSigno(frescura) });

  const disp = lectura(p.estado.lecturas, 'estado.disposicion');
  const disposicion = disp?.dato ? { valor: disp.dato.valor, palabra: disp.procedencia.explica_es, nivel: nivelDisposicion(disp.dato.valor, metodo.bandas_disposicion) } : null;

  // El veredicto, cuando existe, es lo que explica la palabra: manda sobre el hueco. Sin veredicto, con palabra
  // (dato viejo) el hueco la acompaña; sin palabra (poca historia o nada), el hueco ES el título.
  const glosa = p.estado.clave ? (metodo.bandas_frescura.find((b) => b.clave === p.estado.clave)?.glosa_es ?? null) : null;
  const veredicto = p.forma.veredicto;
  const titulo = palabra ?? hueco?.titulo ?? 'Sin carga todavía';
  const apoyo = veredicto ? frase(veredicto) : palabra ? (hueco ? `${hueco.titulo}. ${hueco.cuerpo}` : glosa) : (hueco?.cuerpo ?? null);

  return {
    bloque,
    tono: palabra ? tinte.tono : 'neutro',
    marca: palabra ? tinte.marca : 'neutra',
    titulo,
    apoyo,
    celdas,
    disposicion,
    plazo: hueco?.plazo ?? null,
    salida: hueco?.salida ?? null,
  };
}
