'use client';

// GARMIN · CIRCUITO Y HYROX — propuesta del reloj Garmin (29-09).
// Modelo: docs/garmin-reloj/modelo.md (§5, §6, §7 G13–G19, G12) y P10 de
// `docs/reloj-muneca/modelo.md`. Kit: `kit-garmin/`; planes, cuerpo y casos:
// los de «Muñeca · circuito y HYROX».
//
// El corazón del corredor híbrido: la carrera comprometida (correr tras una
// estación, juzgada en vivo contra el objetivo del coach, con el crono TOTAL
// en el contexto) y la estación con su carga («Sled Push · 50 m · 152 kg»).
// En Garmin nadie lee el ergómetro ni detecta la estación por movimiento
// (fase 2): toda estación es «lo dices tú», con su crono por héroe y el
// objetivo como instrucción, y BACK/LAP la cierra con su deshacer de 5 s.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoDe } from './casos';
import { ComparacionCircuito, VivoCircuito } from './vivo';

export const meta: TwinMeta = {
  id: 'garmin-circuito',
  titulo: 'Garmin · circuito y HYROX',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-30',
  descripcion:
    'La carrera comprometida en la muñeca Garmin: cada tramo de carrera usa la cara de correr con el crono total en el contexto, cada estación dice su dosis y su carga con su crono como héroe («lo dices tú · LAP»), la Roxzone es un paso propio que cierras tú, el aro se divide en rondas (8 en el simulacro) y cada paso deja su vuelta.',
  fuentes: [],
  enApp:
    'Todavía no hay Monkey C. En Garmin no existen el doble toque, la corona, el botón Acción, la lectura del ergómetro ni la detección de estación por movimiento (fase 2), así que no se portan «HYROX · sin gesto» (aquí BACK/LAP es un botón físico y siempre está) ni «HYROX · SkiErg con PM5» (lectura del ergómetro desde Garmin sin verificar, §13): el SkiErg y el remo son «lo dices tú», como en «HYROX sin PM5», que aquí es el caso normal. La detección de la Roxzone de salida por movimiento tampoco existe: la cierras tú con BACK/LAP. El coste de la carrera comprometida (s/km sobre tu fresco) sigue en el resumen (P10), no en vivo.',
  dispositivo: 'garmin',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'c493-carrera',
    titulo: '493 · la carrera comprometida · Ronda 2/5',
    descripcion:
      'Sesión 493, Run 1000 m @RPE 8 tras el SkiErg, a 170 m del final. La cara de correr del kit: manda lo que falta con «RPE 8 · ritmo de carrera» (la palabra del coach), el ritmo actual debajo y el pulso abajo. Arriba, «Ronda 2/5» y el crono total, que no se va. A 100 m el preaviso (1 corta); a los 1000 m se cierra sola (2 largas + START) y salen 3 s de «entras a Burpee Broad Jump». ↑ ↓ pasan Datos, Vueltas y Estructura.',
  },
  {
    id: 'c493-ski',
    titulo: '493 · SkiErg 500 m · lo dices tú · Ronda 1/5',
    descripcion:
      'Sesión 493, la estación sin lectura del ergómetro: el héroe es el crono de la estación con «lo dices tú · LAP», el nombre y «500 m · RPE 8,5» debajo (el objetivo es una instrucción, no un veredicto). A los 4 s se pulsa BACK/LAP: 1 muy corta de acuse, la estación queda como su vuelta, entra el descanso de 90″ (1 larga + STOP) y 5 s de «↶ UP · deshacer».',
  },
  {
    id: 'c493-bbj',
    titulo: '493 · Burpee Broad Jump · lo dices tú',
    descripcion:
      'Sesión 493, estación que NADA mide: «Burpee Broad Jump» con «40 m» y su crono como héroe. A los 3,5 s, BACK/LAP: «Burpee Broad Jump hecho · ↶ UP · deshacer» 5 s y entra el descanso de 90″. Repite tú con ⌫ y ↑.',
  },
  {
    id: 'c493-descanso',
    titulo: '493 · el descanso de 90″ entre rondas',
    descripcion:
      'Sesión 493, quedan 14 s del r90″ tras los burpees. Monocromo, con el total en el contexto: cuenta atrás, «Viene: Ronda 3/5 · Run 1000 m · RPE 8» y el pulso. +30 s está en Controles (mantén ↑); BACK/LAP = empezar ya. A 10 s el preaviso, a 3 s el 3-2-1 y el GO a la ronda 3.',
  },
  {
    id: 'c492-ronda5',
    titulo: '492 · rondas con cuentas distintas · la 5 sin Farmers',
    descripcion:
      'Sesión 492, Trineos y carries: Sled Push 5 × 25 m @180 kg, Sled Pull 5 × 25 m @135 kg, Farmers 4 × 100 m @2 × 32 kg, r90″. Quedan 12 s del descanso tras los Farmers de la ronda 4: «Viene: Ronda 5/5 · Sled Push · 25 m · 180 kg», 3-2-1 y «Ronda 5/5 · Estación 1/2»: dos estaciones, no tres. Mira Estructura (↓↓↓): la ronda 5 no lleva Farmers.',
  },
  {
    id: 'c506-amrap',
    titulo: '506 · el AMRAP 4′ dentro del chipper',
    descripcion:
      'Sesión 506, ronda 2/4: tras el Run 800 m, AMRAP 4′ de Walking Lunge. La ventana es un paso más (BACK/LAP la cierra; ↑ ↓ pasan página) y «reps al final»: nada que contar en vivo. A los 11 s suena la campana (1 larga + STOP) y las reps se dicen con ↑ ↓ (16 pulsaciones) y START las guarda («Walking Lunge: 16 reps» en Vueltas). Lo que no se diga queda sin declarar, nunca 0.',
  },
  {
    id: 'hyrox-carrera',
    titulo: 'HYROX · Run 5/8 con el total',
    descripcion:
      'Simulación completa: orden y dosis de stations.ts, cargas de la plantilla 441 (dato del coach). El Run no lleva objetivo en la 441, así que manda lo que falta, con el ritmo actual en segundo y el pulso. Arriba «Run 5/8» y el total; el aro, dividido en las 8 rondas. Datos (↓): el cap de 90′ y lo que queda.',
  },
  {
    id: 'hyrox-roxzone',
    titulo: 'HYROX · Run 8 → Roxzone → Wall Balls',
    descripcion:
      'Faltan 60 m del último Run. Al cerrarse solo entra la Roxzone como paso propio: «entras a Wall Balls», «100 reps · 6 kg» y su crono con «lo dices tú · LAP». Sin detección por movimiento en Garmin: a los 26 s se pulsa BACK/LAP al empezar la estación y la Roxzone queda como su vuelta.',
  },
  {
    id: 'hyrox-sled',
    titulo: 'HYROX · Sled Push lo dices tú → Roxzone de salida',
    descripcion:
      '«Sled Push», «50 m · 152 kg» y el crono de la estación con «lo dices tú · LAP». A los 3,5 s, BACK/LAP: entra la Roxzone de salida («sales a Run 3/8», que también cierras tú); a los 14 s otro BACK/LAP y entra el Run 3 con su GO. Nada se cierra solo: nadie mide un trineo ni ve que echas a correr.',
  },
  {
    id: 'hyrox-sin-pm5',
    titulo: 'HYROX · SkiErg lo dices tú (el caso normal)',
    descripcion:
      'La estación 1 sin lectura del ergómetro, que en Garmin es siempre: nada cuenta los metros, así que no hay cuenta atrás que se congele. «SkiErg · 1000 m» y el crono de la estación con «lo dices tú · LAP».',
  },
  {
    id: 'hyrox-ruta',
    titulo: 'HYROX · las vueltas del circuito',
    descripcion:
      'Abierto en la página Vueltas (↓↓ desde el paso): lo de ahora con su crono arriba y lo último hecho debajo, cada estación y cada tramo con su parcial (la Roxzone, el Burpee Broad Jump…), y en el título cuántas van (la Roxzone sumada está en Datos, ↑). ↓ pasa a Estructura: el circuito por estaciones, lo hecho, lo de ahora y lo que viene.',
  },
  {
    id: 'hyrox-simulacro',
    titulo: 'HYROX · el simulacro entero, desde el Run 1',
    descripcion:
      '8 × (1 km + estación + Roxzone) y el aro dividido en sus 8 rondas, todo por hacer; el crono total, que es la puntuación, arriba. Recórrelo tú con ⌫: cada paso cierra su vuelta, el aro se va llenando por rondas y, al cerrar la última estación, sale «Sesión completada» con el total.',
  },
  {
    id: 'hyrox-final',
    titulo: 'HYROX · la última estación y el final',
    descripcion:
      'Wall Balls, la estación 8/8, con siete rondas hechas en el aro y el total corriendo contra el cap. A los 7 s se pulsa BACK/LAP: el simulacro termina (3 largas + SUCCESS ×2) y el sello dice el total como puntuación y «Completa · 8 de 8 rondas».',
  },
  {
    id: 'hyrox-dobles',
    titulo: 'HYROX dobles · le toca a tu pareja',
    descripcion:
      'Sled Pull en dobles: la estación es de tu pareja, así que es UNA espera. «Le toca a Marta», lo que llevas esperando con «recuperas» y tu pulso bajando (sin zona: no trabajas). «el relevo lo dices tú»: nadie mide a tu pareja, así que no hay «sales en ~40 s». A los 9 s, BACK/LAP: «Relevo · entras tú», y no se apunta nada tuyo.',
  },
  {
    id: 'hyrox-dobles-reparto',
    titulo: 'HYROX dobles · Wall Balls repartidas',
    descripcion:
      'Estación repartida 60/40: la dosis del paso es TU parte («60 reps · 6 kg») y en la nota, el pacto («Tú 60 · Marta 40 · alterna 20»). Un ejemplo de este doble: en la app el reparto lo decide el motor.',
  },
  {
    id: 'tamanos-carrera',
    titulo: 'Los cuatro tamaños · la carrera comprometida',
    descripcion: 'La carrera del 493 a 454, 390, 260 y 218, cada una a sus píxeles: el total no se va del contexto ni a 218 (donde pasa a su propia línea).',
  },
  {
    id: 'tamanos-estacion',
    titulo: 'Los cuatro tamaños · una estación',
    descripcion:
      'Burpee Broad Jump, «lo dices tú · LAP», a 454, 390, 260 y 218: el nombre de catálogo cabe entero en la franja del objetivo, la dosis debajo y el pulso al pie.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta).
  const [caso] = useState(() => casoDe(escenario));
  return caso.comparar ? <ComparacionCircuito caso={caso} onLog={onLog} /> : <VivoCircuito caso={caso} onLog={onLog} />;
}
