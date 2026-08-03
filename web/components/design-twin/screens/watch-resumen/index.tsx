'use client';

// AL TERMINAR DE CORRER, EN LA MUÑECA.
//
// En el reloj no hay sitio, y eso JUEGA A FAVOR: obliga a elegir el único
// número que cuenta. El resumen de Apple no elige — pone TOTAL TIME, TOTAL
// DISTANCE, AVERAGE PACE y AVERAGE CADENCE una debajo de otra, todas del mismo
// tamaño, y el atleta se lleva de ahí el ritmo medio porque es el único que
// suena a veredicto. En un fartlek ese es precisamente el número falso.
//
// Aquí manda la regla de la muñeca: **un sujeto por página.** Y como la primera
// página es lo que se ve sin pasar ninguna, elegirla ES el diseño:
//
//   · Fartlek con sus dos ritmos  → la primera página es **3:58 · 8 fuertes**.
//     Ni el total, ni la media: el ritmo al que de verdad corriste.
//   · Sin tramos                  → la primera es **14,32 km**, que es lo único
//     medido de verdad, y la media pasa a la SEGUNDA con su etiqueta
//     verdadera. Mismo número que Apple, con la verdad pegada al lado.
//   · Rodaje continuo             → la primera es la media, de pleno derecho.
//
// Y el bisel lleva la forma de la carrera en todas las páginas (`AroTramos`):
// los fuertes encendidos, los suaves apagados. En un reloj el borde es el único
// sitio que no cuesta altura de contenido.
//
// Los datos son los MISMOS que los del móvil (`resumen-carrera/datos`): muñeca
// y teléfono no pueden contar dos versiones de la misma carrera.

import { useEffect } from 'react';
import { W } from '../watch-live/theme';
import { zonaDe } from '../watch-vivo/guion';
import { esDecimal, reloj, ritmoKm } from '../../kit-composicion/formato';
import { lecturaDeCarrera, type Lectura } from '../../tramos';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ESCENAS, type Escena } from '../resumen-carrera/datos';
import { MarcoResumen, type Pagina } from './marco';

export const meta: TwinMeta = {
  id: 'watch-resumen',
  titulo: 'Al terminar, en la muñeca',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-03',
  descripcion:
    'El resumen de una carrera con un sujeto por página: la primera es el ritmo de lo fuerte, no la media. Y cuando no hay tramos, la media aparece con su etiqueta verdadera.',
  fuentes: [],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-tramos',
    titulo: 'El peor caso: sin tramos',
    descripcion:
      'Lo que la app guarda hoy. La primera página es lo que sí se midió; la media va en la segunda, dicha por su nombre.',
  },
  {
    id: 'detectado',
    titulo: 'Fartlek con serie de ritmo',
    descripcion: 'La primera página es 3:58 y «8 fuertes». El bisel lleva la forma entera de la carrera.',
  },
  {
    id: 'marcado',
    titulo: 'Ocho vueltas reales',
    descripcion: 'Datos reales de la carrera 44: la media describe las vueltas, y la segunda página es el aguante.',
  },
  {
    id: 'rodaje',
    titulo: 'Rodaje continuo',
    descripcion: 'Fue una sola cosa: aquí la media se gana la primera página.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const escena: Escena = ESCENAS[escenario] ?? ESCENAS['sin-tramos']!;
  const lectura = lecturaDeCarrera(escena.carrera);
  const paginas = paginasDe(escena, lectura);

  useEffect(() => {
    onLog(`Primera página: ${paginas[0]!.contexto} · ${paginas[0]!.sujeto}`);
  }, [escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MarcoResumen
      paginas={paginas}
      zona={escena.fcMediaPpm != null ? zonaDe(escena.fcMediaPpm) : null}
      // Mismo criterio que el móvil, y sale del dominio: los trozos en que la
      // detección parte un rodaje continuo no son repeticiones, así que el
      // bisel se queda liso en vez de dibujar una estructura inventada.
      tramos={lectura.tramosSonLectura ? lectura.tramos : []}
      onLog={onLog}
    />
  );
}

/**
 * QUÉ PÁGINA VA PRIMERO — todo el diseño de esta pantalla cabe en esta función.
 *
 * El orden no es un gusto: es la jerarquía del §6 aplicada a un sitio donde
 * sólo se ve una cosa a la vez. Primero el sujeto de esa carrera, luego lo que
 * lo hace significar algo (el aguante), luego el contexto (los totales) y al
 * final el cuerpo, que es lo único que el reloj mide siempre por sí mismo.
 */
function paginasDe(escena: Escena, l: Lectura): Pagina[] {
  const paginas: Pagina[] = [];

  if (l.forma === 'con-contraste' && l.fuerte) {
    paginas.push({
      contexto: `${l.fuerte.n} ${l.fuerte.n === 1 ? 'fuerte' : 'fuertes'}`,
      sujeto: reloj(l.fuerte.ritmoSkm),
      unidad: '/km',
      etiquetaSegundo: l.suave ? 'Suave' : undefined,
      segundo: l.suave ? ritmoKm(l.suave.ritmoSkm) : 'Sin lo suave',
      nota: l.suave ? `Contraste ${reloj(l.contrasteSkm!)}` : 'No se guardó la recuperación',
    });
  } else if (l.forma === 'uniforme' && l.mediaSkm != null) {
    const vueltas = l.tramosSonLectura ? l.tramos.filter((t) => t.ritmoSkm != null).length : 0;
    paginas.push({
      contexto: 'Ritmo medio',
      sujeto: reloj(l.mediaSkm),
      unidad: '/km',
      etiquetaSegundo: vueltas > 1 ? 'Vueltas' : undefined,
      segundo: vueltas > 1 ? String(vueltas) : 'Una sola intensidad',
      nota: 'La media sí describe',
    });
  } else {
    // El peor caso. El sujeto degrada a lo que SÍ se midió.
    paginas.push({
      contexto: 'Recorriste',
      sujeto: esDecimal(escena.carrera.distanciaM / 1000, 2),
      unidad: 'km',
      etiquetaSegundo: 'Tiempo',
      segundo: reloj(escena.carrera.duracionS),
    });
    if (l.mediaSkm != null) {
      // LA PÁGINA QUE NOS SEPARA DE APPLE: el mismo número de su resumen, con
      // lo que es escrito al lado. No se esconde —esconderlo sería tan
      // deshonesto como disfrazarlo—, se etiqueta.
      paginas.push({
        contexto: 'Ritmo medio',
        sujeto: reloj(l.mediaSkm),
        unidad: '/km',
        etiquetaSegundo: l.mediaEsMezcla ? 'Media' : undefined,
        segundo: l.mediaEsMezcla ? 'de fuertes y suaves' : 'De toda la sesión',
        nota: l.mediaEsMezcla ? 'Ningún tramo fue así' : undefined,
        tono: l.mediaEsMezcla ? W.dim : W.ink,
      });
    }
  }

  if (l.aguante) {
    paginas.push({
      contexto: VEREDICTO[l.aguante.veredicto],
      sujeto: reloj(l.aguante.ultimaSkm),
      unidad: '/km',
      etiquetaSegundo: 'Primera',
      segundo: ritmoKm(l.aguante.primeraSkm),
      nota: 'La última contra la primera',
    });
  }

  // Los totales sólo cuando no son ya el sujeto de la primera página.
  if (l.forma !== 'no-se-sabe') {
    paginas.push({
      contexto: 'Total',
      sujeto: esDecimal(escena.carrera.distanciaM / 1000, 2),
      unidad: 'km',
      etiquetaSegundo: 'Tiempo',
      segundo: reloj(escena.carrera.duracionS),
      nota: escena.titulo,
    });
  }

  // El cuerpo, siempre la última: el pulso es lo único que el reloj mide solo.
  if (escena.fcMediaPpm != null) {
    paginas.push({
      contexto: 'Pulso',
      sujeto: String(escena.fcMediaPpm),
      etiquetaSegundo: 'Zona',
      segundo: `Z${zonaDe(escena.fcMediaPpm)}`,
      nota: 'ppm · media · umbral estimado',
    });
  }

  return paginas;
}

const VEREDICTO: Record<NonNullable<Lectura['aguante']>['veredicto'], string> = {
  aguantaste: 'Aguantaste',
  'de-menos-a-mas': 'De menos a más',
  'se-te-fue': 'Se te fue al final',
};
