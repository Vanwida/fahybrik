'use client';

// GARMIN · WOD Y ERGO — propuesta del EMOM, el AMRAP, el For Time, el Tabata y el
// ergo en el reloj Garmin (29-09). Modelo: docs/garmin-reloj/modelo.md (G2 el
// objetivo manda, G4 la vuelta no falla, G5 avisos redundantes, G7 lo que nadie
// mide no se pinta, §5 el mapa de botones, §13 sin lectura del ergómetro). Kit:
// `kit-garmin/`; los planes y los casos, los de «Muñeca · EMOM, AMRAP, For Time y
// ergo» (`reloj-wod/`), adaptados a lo que un Garmin v1 mide de verdad.
//
// Cada formato con SU pregunta y el número grande respondiéndola:
//   EMOM       ¿cuánto queda de este minuto?   → la ventana; la tarea con su carga
//   AMRAP      ¿cuántas rondas llevo?           → las rondas; lo que queda, debajo
//   For Time   ¿cuánto tiempo llevo?            → el crono total (la puntuación)
//   Ergo       ¿qué toca y cuánto llevo?        → el crono del paso, o el pulso a zona
//   Tabata     ¿trabajo o descanso, y cuánto?   → la ventana, con su palabra

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoGarminWod } from './casos';
import { ComparacionWod, VivoWod } from './vivo';

export const meta: TwinMeta = {
  id: 'garmin-wod',
  titulo: 'Garmin · WOD y ergo',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'El EMOM con su tarea y su carga, el AMRAP contando rondas y reps con los botones y su campana, el For Time con el crono total a la vista, el Tabata y el ergo sin lectura de la máquina: cada formato con su pregunta, cinco botones, vibración y tono sin voz.',
  fuentes: [],
  enApp:
    'Hoy `garmin-ciq/` es la app «mensajera» y nada de esto existe todavía en un Garmin: es el motor propio del modelo del 29-09. Frente a «Muñeca · EMOM, AMRAP, For Time y ergo» NO se portan `amrap-boton` (el AMRAP contado con un botón es aquí el caso por defecto: BACK/LAP y UP/DOWN) ni el `ergo-505` con PM5 (el reloj Garmin no lee el monitor de la máquina, modelo §13): «SkiErg 8 × 250 m» pasa a ser `ergo-505` y `ergo-505-cierre`, los dos «lo dices tú», y lo que en la muñeca era «sin PM5» es aquí el caso normal. Tampoco existen el doble toque, la corona, el botón Acción, la voz ni el /500 en vivo: los sustituyen los cinco botones (§5), los avisos de vibración y tono (§6) y el crono del paso con el objetivo como instrucción. Cambia: en el EMOM BACK/LAP marca la tarea; el AMRAP cuenta las rondas con BACK/LAP y las reps con UP/DOWN durante la ventana (la muñeca solo dice las reps en la campana), y la campana suena con tres largas y un tono propio; el 5K For Time pone el héroe en lo que queda (la cara de correr del kit) y el crono total en el contexto, donde la muñeca lo ponía de héroe.',
  dispositivo: 'garmin',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'emom-alterno',
    titulo: 'EMOM 12′ · Bench / Row alternos (498)',
    descripcion:
      '498 escribe «EMOM 6′ · 6×6» de Bench Press y «EMOM 6′ · 6×1′» de Row: 6 rondas × 2 minutos alternos = 12′. Minuto 3: manda lo que queda de la ventana, la tarea con su carga en la banda («6 Bench Press · 60 kg»; los 60 kg son de ejemplo, 498 no trae carga) y «Luego · Row · 1′». A los 3,5 s BACK/LAP marca la tarea (1 muy corta + KEY): la ventana NO se cierra, lo que queda pasa a «respiro» y sale «Bench Press hecho · ↶ UP · deshacer» 5 s. A 10 s del final el preaviso y, en el minuto 4, el GO con la tarjeta «Row · todo el minuto»: en un minuto entero de remo BACK/LAP no hace nada (nadie lee el remo: solo el crono de la ventana). ↑ y ↓: Estructura, Minutos, Datos.',
  },
  {
    id: 'emom-75',
    titulo: 'EMOM cada 75″ · Row, Ski y Run en cinta (572)',
    descripcion:
      '572: Row, SkiErg y Run cada 75″, 5 rondas = 15 ventanas. La 9 es de correr y usa la cara de correr del kit (P10): «EMOM 9/15 · 75″», «Cinta», lo que queda de la ventana de héroe (el tramo no tiene objetivo), el ritmo de la cinta y el pulso. A los 13 s entra la 10, Row: la cara del EMOM («Ventana 10/15», «Row · todo el intervalo» y «Luego · SkiErg · 75″»), sin metros ni /500 (no hay lectura de la máquina) y sin nada que marcar: la ventana la cierra el reloj.',
  },
  {
    id: 'amrap-15',
    titulo: 'AMRAP 15′ · rondas con BACK/LAP',
    descripcion:
      'AMRAP 15′ de tres movimientos (ilustrativo: no hay ninguno asignado). Manda lo que cuentas: 4 rondas; en la banda, la ronda en curso contra la anterior («ronda 5 · 1:19 · ant. 1:58») y debajo lo que queda (6:17). BACK/LAP = ronda hecha (1 muy corta + KEY, «Ronda 5 anotada» y 5 s para deshacer con UP); UP y DOWN cuentan reps (en un AMRAP no pasan página). Mantén UP: Controles con Datos, Vueltas (las rondas con su tiempo) y Estructura (los tres movimientos con su carga: «Wall Ball · 12 reps / 9 kg»).',
  },
  {
    id: 'amrap-reps',
    titulo: 'AMRAP 15′ · reps con UP y DOWN',
    descripcion:
      '5 rondas cerradas y 14 reps de la sexta, contadas con UP (una ronda son 30: 12 + 10 + 8, sale de las tareas). Sin tocar UP las reps quedan sin decir: nunca 0. De 29 a 30 reps la cuenta lleva a la ronda siguiente y DOWN la devuelve. BACK/LAP cierra la ronda y las reps de la nueva vuelven a «sin decir». Es opcional: se puede no contar nada en vivo y decir las reps solo en la campana. Pulsa ↑ y ↓ y mira la cronología.',
  },
  {
    id: 'amrap-campana',
    titulo: 'AMRAP 15′ · la campana y la puntuación',
    descripcion:
      'Quedan 11 s con 7 rondas: a 10 s el preaviso (1 corta + INTERVAL_ALERT) y a las 15:00 la CAMPANA: 3 largas y un tono propio de tres notas, en vez del «recupera» del motor (mira el lector de abajo). La cara pasa a «Puntuación · rondas + reps»: «7+—», con «reps de la ronda 8» (sin decir: nunca 0). ↑ mueve las reps («7+18», con el desglose «12 Wall Ball + 6 KB Swing»); de 29 a 30 lleva a una ronda; ↓ baja. BACK/LAP guarda (acuse, «Sesión hecha», 5 s para deshacer) y sale «Tu puntuación · Guardado en el reloj».',
  },
  {
    id: 'amrap-506',
    titulo: 'AMRAP 4′ de un movimiento, en un chipper (506)',
    descripcion:
      '506: 4 × [Run 800 m @RPE 8 → AMRAP 4′ a peso corporal]. En un AMRAP de UN movimiento no hay rondas que contar: manda lo que queda y debajo «reps —» hasta que las cuentas con UP (o las dices en la campana). BACK/LAP no hace nada (la ventana la cierra el reloj). En la campana (a los 11 s) la puntuación son las reps, con «Luego · Run 800 m a RPE 8 en 0:19» contando atrás (BACK/LAP guarda antes); como el chipper no para, 20 s después de la campana vienen el 3-2-1 y el GO del Run, con la cara de correr del kit.',
  },
  {
    id: 'fortime',
    titulo: 'For Time · cap 20:00',
    descripcion:
      'For Time de 3 rondas (ilustrativo): 500 m Row · 20 Wall Ball 9 kg · 10 Burpee. El crono total ES la puntuación y no se va nunca: es el héroe (14:11, «total»); el cap se lee como lo que queda hasta él («cap en 5:49»). Ronda 3, remo: nadie lee la máquina, así que lo cierras tú con BACK/LAP al llegar a los 500 m (1 muy corta + KEY, «Row hecho · ↶ UP · deshacer» y la tarjeta «Ronda 3/3 · 20 Wall Ball · 9 kg · GO»). La tarea con su carga en la banda y «Luego · …» debajo. ↑ y ↓: Estructura y Datos.',
  },
  {
    id: 'fortime-final',
    titulo: 'For Time · el último movimiento y tu tiempo',
    descripcion:
      'Último movimiento del For Time: en vez de «Luego» sale «BACK · termina» en naranja. BACK/LAP cierra el WOD y el crono se congela: sale el sello y «Tu tiempo» con el crono (la puntuación), «3 rondas · dentro del cap 20:00» y «Guardado en el reloj». Terminar desde Controles NO enseña «Tu tiempo»: no se cerró el último movimiento y el kit dice «Sesión terminada».',
  },
  {
    id: 'carrera-5k',
    titulo: 'Run For Time 5000 m · contrarreloj (552)',
    descripcion:
      '552, la Cursa de Sabadell: For Time 5000 m. Es la cara de correr del kit tal cual (P10, sin reinventarla): manda lo que queda (1,06 km), debajo el ritmo actual y el pulso al pie; el cue «ritmo de competición» arriba, y el crono total, que es la puntuación, en el contexto («For Time 16:30»). A los 15 s cruza el km 4: vuelta automática (2 cortas + LAP) y su tarjeta. Ojo: la muñeca pone el crono de héroe; aquí el héroe lo decide la lámina, como pide el encargo.',
  },
  {
    id: 'ergo-505',
    titulo: 'SkiErg 8 × 250 m @2:05/500 · lo dices tú (505)',
    descripcion:
      '505, serie 3 de 8. El reloj Garmin no lee el monitor de la máquina: nadie mide los 250 m ni el ritmo. Así que el héroe es el CRONO de la serie con «lo dices tú», y el objetivo va como instrucción («a 2:05 /500»), sin banda ni marca ni «afloja»: un veredicto en vivo sería inventado. El pulso siempre al pie. BACK/LAP cierra la serie cuando llegas a los 250 m. A 260, el contexto («SkiErg / Serie 3/8 · 250 m») pasa a dos líneas antes que perder la serie.',
  },
  {
    id: 'ergo-505-cierre',
    titulo: 'La serie de SkiErg cerrada con BACK/LAP',
    descripcion:
      'A los 3 s BACK/LAP cierra la serie 3 (a los 0:57): 1 muy corta de acuse y 1 larga + STOP de la recuperación de 45″ (parada), con «Luego · SkiErg» y «Serie 3 cerrada · ↶ UP · deshacer» 5 s. El resultado de la serie es su crono, y el ritmo declarado se DEDUCE de él: 250 m en 0:57 = 1:54 /500, «▲ rápido» contra 2:05 (con la holgura del coach). Míralo en ↑ (Series: /500 deducido, crono al lado y veredicto).',
  },
  {
    id: 'ergo-530',
    titulo: 'Ergos por tiempo a zona · 3 × 2′ @Z2 (530)',
    descripcion:
      '530, calentamiento: rotación SkiErg · Row · Assault Bike, 2′ cada una a Z2. Va a zona, así que manda el PULSO contra el espectro del coach (Z2 · a 7 de Z3), con el fondo teñido solo en AMOLED (en 260 y 218 la zona se lee en la banda); debajo, lo que queda de los 2′ contando atrás. Sin /500: nadie lo lee. En el calentamiento no se avisa fuera de objetivo. A los 72 s entra la Assault Bike, con la misma cara.',
  },
  {
    id: 'ergo-escalera',
    titulo: 'Escalera de remo · 90″ Z2 → 1′ Z3 → 30″ Z4 (536)',
    descripcion:
      '536, «90″/1′/30″ @Z2/3/4 · r4′»: tres pasos, tres objetivos, sin texto. Tramo 2 a Z3; a los 13 s el tramo 3 a Z4 sin 3-2-1 (es seguido): GO (2 largas + START) y la banda salta a Z4. El pulso llega tarde («a 5 de Z4» unos segundos) pero la gracia del coach (45 s) cubre el tramo entero: ningún «aprieta» por el retraso del corazón. Luego la recuperación de 4′, parada y en monocromo.',
  },
  {
    id: 'ergo-514',
    titulo: 'Assault Bike 45′ @Z1 · máx 142 ppm (514)',
    descripcion:
      '514: Z1 manda (el pulso contra el espectro) y «máx 142 ppm» es un techo que se lee de nota y solo avisa por arriba. Quedan 31:11, contando atrás. A los 6 s el pulso sube a 146: pasa el techo, «▲ alto» y UN «afloja» (2 cortas + dos notas que bajan) tras 4 s fuera; a los 26 s vuelve. Pedalear más suave de la cuenta no avisa nunca.',
  },
  {
    id: 'tabata',
    titulo: 'Reloj de pared · Tabata 8 × 20″/10″',
    descripcion:
      'Ilustrativo: 8 × 20″ de Burpee a RPE 10 con 10″ de descanso; ronda 4. Manda el reloj: la ventana cuenta atrás con su palabra encima («trabajo» / «descanso», sin color) y una marca por ronda. BACK/LAP no hace nada, y en Controles no hay «+30 s» ni «Cambiar entorno»: el reloj no se estira. A los 8 s, el descanso (1 larga + STOP): «Quedan 4 rondas · Viene: Ronda 5/8 · Burpee». A 3 s del final, el 3-2-1 con la tarea y el GO.',
  },
  {
    id: 'tamanos-emom',
    titulo: 'Los cuatro tamaños · EMOM con carga',
    descripcion:
      'El minuto 3 del EMOM de 498 en 454, 390, 260 y 218: la tarea con su carga entera («6 Bench Press · 60 kg») y «Luego · Row · 1′» caben en los cuatro; en los MIP todo color pasa por los 64 colores que pueden pintar.',
  },
  {
    id: 'tamanos-amrap',
    titulo: 'Los cuatro tamaños · AMRAP con reps contadas',
    descripcion:
      '5 rondas y 14 reps de la sexta en los cuatro relojes: las rondas de héroe, «+14 reps» en la banda y lo que queda en cifras debajo. Ningún texto baja del 6,2 % del diámetro.',
  },
  {
    id: 'tamanos-campana',
    titulo: 'Los cuatro tamaños · la puntuación',
    descripcion:
      'La campana con 7 rondas y 18 reps dichas: «7+18» de héroe, el desglose «12 Wall Ball + 6 KB Swing» y «BACK · guardar» en naranja, a 454, 390, 260 y 218. El pulso, monocromo (deja de trabajar).',
  },
  {
    id: 'tamanos-fortime',
    titulo: 'Los cuatro tamaños · For Time',
    descripcion:
      'El crono total (14:11) de héroe, «Ronda 3/3 · cap en 5:49» en dos líneas (en ningún reloj cabe en una sin perder el cap) y la tarea en la banda, en los cuatro tamaños.',
  },
  {
    id: 'tamanos-ergo',
    titulo: 'Los cuatro tamaños · ergo sin lectura',
    descripcion:
      'La serie de SkiErg de 505 en los cuatro: el crono como héroe con «lo dices tú», «a 2:05 /500» como instrucción y el pulso al pie. Sin banda: no hay marca que poner.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta): el plan y
  // el cuerpo tienen que ser los mismos objetos segundo a segundo.
  const [caso] = useState(() => casoGarminWod(escenario));
  return caso.comparar ? <ComparacionWod caso={caso} onLog={onLog} /> : <VivoWod caso={caso} onLog={onLog} />;
}
