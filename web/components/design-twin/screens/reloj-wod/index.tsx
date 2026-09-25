'use client';

// MUÑECA · EMOM, AMRAP, FOR TIME Y ERGO — propuesta del rediseño de la muñeca
// (25-09). Modelo: docs/reloj-muneca/modelo.md (P12 y el ergo bajo P3). Kit:
// `kit-reloj/`; lo que el kit no tiene, en esta carpeta y en «Para el kit».
//
// Cada formato con SU pregunta, y el número grande respondiéndola:
//   EMOM       ¿cuánto queda de este minuto?        → la ventana (y el respiro)
//   AMRAP      ¿cuántas rondas llevo?               → las rondas; lo que queda, arriba
//   For Time   ¿cuánto tiempo llevo?                → el crono total (la puntuación)
//   Ergo       ¿voy al /500 (o a la zona) que toca? → el /500 o el pulso contra su banda
//   Pared      ¿trabajo o descanso, y cuánto queda? → la ventana, con su palabra

import { useState, type ReactNode } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { CaraAmrap, CaraPuntuacion, paginasAmrap, paginasChipper } from './caras-amrap';
import { CaraEmom, paginasEmom } from './caras-emom';
import { CaraErgo, paginasErgo } from './caras-ergo';
import { CaraCarreraForTime, CaraForTime, FinalForTime, paginasCarrera, paginasForTime } from './caras-fortime';
import { CaraPared, paginasPared } from './caras-pared';
import { casoDe } from './casos';
import { wodDe, type PlanWod } from './planes';
import { VivoWod, type Vivo } from './vivo';

export const meta: TwinMeta = {
  id: 'reloj-wod',
  titulo: 'Muñeca · EMOM, AMRAP, For Time y ergo',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'Cada formato con su pregunta: la ventana del minuto con su tarea y su carga, las rondas con la tarea en la muñeca y la puntuación con la corona, el crono que puntúa con el cap a la vista, y en el ergo el /500 o la zona contra su banda.',
  fuentes: [],
  enApp:
    'Hoy la tarea del AMRAP vive en el móvil y su puntuación puede salir como 0 (`score_reps` inventado), el EMOM no lleva carga ni duración total, las piezas de ergo por tiempo cuentan hacia arriba y el objetivo /500 se omite a propósito; esto lo sustituye.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'emom-alterno',
    titulo: 'EMOM 12′ · Bench / Row alternos (498)',
    descripcion:
      '498 escribe «EMOM 6′ · 6×6» Bench Press y «EMOM 6′ · 6×1′» Row: son 6 rondas × 2 minutos alternos = 12′ (M5: el total es un dato; hoy sale 6′ o 12′ según quién lo lea). Minuto 3: manda lo que queda de la ventana (el aro del bisel la vacía), la tarea con su carga «6 Bench Press · 60 kg» (60 kg de ejemplo: 498 no trae carga) y «Luego · Row · 1′». A los 3,5 s, doble toque = hecho: la ventana NO se cierra; lo que queda pasa a ser el respiro, monocromo, y el aviso deshacer dura 5 s. Al minuto 4, GO y la cara del remo con metros y /500 del PM5. Corona: Rotación (con el total y lo que queda), Minutos, Datos.',
  },
  {
    id: 'emom-75',
    titulo: 'EMOM cada 75″ · Row, Ski y Run en cinta (572)',
    descripcion:
      '572: Row, SkiErg y Run cada 75″, 5 rondas = 15 ventanas. La 9 es de correr y usa la cara de CORRER del kit (P10: la misma pantalla en toda carrera; los metros y el ritmo los da la cinta, «Cinta» al pie, y lo que queda de la ventana manda porque el tramo no tiene objetivo). A los 13 s entra la 10, Row: la cara del EMOM, sin acción (la tarea es la ventana entera), con metros y /500 del PM5.',
  },
  {
    id: 'amrap-15',
    titulo: 'AMRAP 15′ · rondas en la muñeca',
    descripcion:
      'AMRAP 15′ de tres movimientos (ilustrativo: no hay ninguno asignado). Manda lo que el atleta cuenta: 4 rondas; arriba «AMRAP · quedan 6:18»; debajo la ronda 5 en curso contra la anterior. Doble toque = ronda hecha (con deshacer). La corona recorre Ronda → Tarea (12 Wall Ball 9 kg · 10 KB Swing 24 kg · 8 Burpee, EN LA MUÑECA, no en el móvil) → Rondas (cada una con su tiempo) → Datos.',
  },
  {
    id: 'amrap-campana',
    titulo: 'AMRAP 15′ · campana y puntuación con la corona',
    descripcion:
      'Quedan 11 s con 7 rondas: preaviso a 10 s y, a las 15:00, la campana (.stop + «Tiempo»). La corona pasa a las reps de la ronda 8: gira la rueda del ratón o arrastra en vertical sobre la esfera y el número sube como «7 + 18», con el desglose de dónde te quedaste («12 Wall Ball + 6 KB Swing»); de 29 a 30 lleva una ronda. Mientras no se gire, «7 + —»: sin declarar, nunca 0. Doble toque = guardar.',
  },
  {
    id: 'amrap-506',
    titulo: 'AMRAP 4′ de un movimiento, en un chipper (506)',
    descripcion:
      '506: 4 × [Run 800 m @RPE 8 → AMRAP 4′ a peso corporal]. En un AMRAP de UN movimiento no hay rondas que contar: manda lo que queda y se avisa de que las reps se dicen al final. En la campana la corona pide «¿Cuántas Pull-up?»; como el chipper no para, la puntuación tiene 20 s (lo que no se diga queda sin declarar) y un 3-2-1 al Run 800 m, que usa la cara de correr con «RPE 8 · fuerte».',
  },
  {
    id: 'fortime',
    titulo: 'For Time · cap 20:00',
    descripcion:
      'For Time de 3 rondas (ilustrativo): 500 m Row · 20 Wall Ball 9 kg · 10 Burpee. El crono total ES la puntuación y no se va nunca; el cap, en el contexto. Ronda 3: el remo lo mide el PM5 («Row · quedan 60 m») y se cierra solo; los Wall Ball y los Burpee los cierras tú (doble toque = hecho, con deshacer). Al último, el crono se congela: tu tiempo.',
  },
  {
    id: 'carrera-5k',
    titulo: 'Run For Time 5000 m · contrarreloj (552)',
    descripcion:
      '552, la Cursa de Sabadell: For Time 5000 m. Es la excepción a «el objetivo manda» porque el objetivo de un For Time ES el tiempo: el crono (la puntuación) es el héroe; debajo lo que queda, el ritmo ACTUAL y a qué hora llegas al ritmo medio que llevas; el pulso abajo. A los 15 s, km 4 con su vuelta, su tarjeta y su voz. El cue «ritmo de competición» está en Estructura.',
  },
  {
    id: 'ergo-505',
    titulo: 'SkiErg 8 × 250 m @2:05/500 · con PM5 (505)',
    descripcion:
      '505, serie 3 de 8: manda el /500 ACTUAL contra su banda (2:05 con la holgura del coach) y va a 1:59 — lo que hizo en la real (1:59, 1:59… y la cortó en la 5 a RPE 10). La marca pasa a ▲ y sale «▲ rápido»; a los 4 s, «afloja» (.directionDown×2) una vez. Afloja a 2:04 y vuelve dentro. Debajo, los metros que quedan; a 250 m se cierra sola con su frase («Serie 3: 2:01 el quinientos, rápida.»: la serie, entera, fue rápida) y entra la recuperación de 45″, monocroma, con su 3-2-1. Corona: Series contra el /500.',
  },
  {
    id: 'ergo-sin-pm5',
    titulo: 'La misma serie, sin PM5',
    descripcion:
      'Sin monitor emparejado nadie mide los 250 m: «sin PM5 · lo dices tú», el héroe cae a lo que llevas, el /500 va como instrucción (lo lees en el monitor) y la serie se cierra con doble toque (con deshacer). Lo que va por tiempo, la recuperación de 45″, CUENTA ATRÁS (hoy sube). En Series, el /500 de cada una es «—»: no se inventa.',
  },
  {
    id: 'ergo-530',
    titulo: 'Ergos por tiempo a zona · 3 × 2′ @Z2 (530)',
    descripcion:
      '530, calentamiento: rotación SkiErg · Row · Assault Bike, 2′ cada una a Z2. Va a zona, así que manda el PULSO contra el espectro del coach, con el fondo teñido; debajo, lo que queda de los 2′ contando atrás (hoy cuenta hacia arriba) y el /500 del PM5 de apoyo. A los 72 s entra la Assault Bike: sin monitor, sin /500. En calentamiento no se avisa.',
  },
  {
    id: 'ergo-escalera',
    titulo: 'Escalera de remo · 90″ Z2 → 1′ Z3 → 30″ Z4 (536)',
    descripcion:
      '536, «90″/1′/30″ @Z2/3/4 · r4′»: tres pasos, tres objetivos (M4), sin texto. Tramo 2 a Z3; a los 13 s, tramo 3 a Z4 sin 3-2-1 (es seguido): GO, «Row, tramo 3 de 3. 30 segundos en zona 4.» y la banda salta a Z4. El pulso llega tarde («▼ bajo» unos segundos) pero la gracia del coach (45 s) cubre el tramo entero: ningún «aprieta» por el retraso del corazón. Luego r 4′, monocroma.',
  },
  {
    id: 'ergo-514',
    titulo: 'Assault Bike 45′ @Z1 · máx 142 ppm (514)',
    descripcion:
      '514: Z1 manda (pulso contra el espectro) y «máx 142 ppm» es un techo que solo avisa por arriba (M1). Quedan 31:12, contando atrás. A los 6 s el pulso sube a 146: marca ▲, «▲ alto» y un «afloja»; a los 26 s vuelve. Pedalear más suave de la cuenta no avisa nunca.',
  },
  {
    id: 'tabata',
    titulo: 'Reloj de pared · Tabata 8 × 20″/10″',
    descripcion:
      'Ilustrativo: 8 × 20″ de Burpee a RPE 10 con 10″ de descanso. Manda el reloj (no hay nada que cerrar): la ventana cuenta atrás con su palabra encima («trabajo» / «descanso»), una marca por ronda, y el 3-2-1 y el GO del kit. Voz corta: «Descanso.» / «Ronda 5 de 8.».',
  },
  {
    id: 'amrap-boton',
    titulo: 'AMRAP sin doble toque · botón acotado',
    descripcion:
      'El AMRAP 15′ en un reloj sin doble toque ni botón Acción: «Ronda hecha» es un botón visible de 44 pt con el mismo deshacer de 5 s. Tocar fuera del botón no anota nada.',
  },
];

function caraDe(v: Vivo): ReactNode | null {
  const w = wodDe(v.seq.paso);
  switch (w?.formato) {
    case 'emom':
      // La ventana de correr usa la cara de correr (P10).
      return w.tarea.corre ? null : <CaraEmom v={v} />;
    case 'amrap':
      return <CaraAmrap v={v} />;
    case 'puntuacion':
      return <CaraPuntuacion v={v} />;
    case 'fortime':
      return w.tarea ? <CaraForTime v={v} /> : <CaraCarreraForTime v={v} />;
    case 'ergo':
      return <CaraErgo v={v} />;
    case 'pared':
      return <CaraPared v={v} />;
    default:
      return null;
  }
}

function paginasDe(datos: PlanWod) {
  switch (datos.formato) {
    case 'emom':
      return paginasEmom(datos);
    case 'amrap':
      return paginasAmrap();
    case 'chipper':
      return paginasChipper(datos);
    case 'fortime':
      return paginasForTime(datos);
    case 'carrera':
      return paginasCarrera(datos);
    case 'pared':
      return paginasPared(datos);
    case 'ergo':
    default:
      return paginasErgo(datos);
  }
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta).
  const [caso] = useState(() => casoDe(escenario));
  const { datos } = caso;
  const rondas = datos.plan.pasos.at(-1)?.posicion?.ronda?.de ?? 0;
  return (
    <VivoWod
      plan={datos.plan}
      sim={caso.sim}
      inicio={caso.inicio}
      wodInicial={caso.wod}
      cara={caraDe}
      paginas={paginasDe(datos)}
      final={datos.formato === 'fortime' ? (v) => <FinalForTime v={v} rondas={rondas} /> : undefined}
      guion={caso.guion}
      modelo={caso.modelo}
      onLog={onLog}
    />
  );
}
