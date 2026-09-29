'use client';

// IPHONE · LA GRAMÁTICA — propuesta del rediseño del vivo del iPhone (28-09).
// Modelo: docs/vivo-iphone/modelo.md (I1–I12, §3, §4). Kit: `kit-iphone-vivo/`.
//
// La anatomía fija (I5), la misma en todas las familias: cabecera con la
// posición, el crono y los enlaces; el sujeto a la misma altura siempre; la
// banda del objetivo con ▲▼ y palabra; el trabajo; la rejilla de 2–4 métricas
// de la máquina o la familia; «Luego»; la tira de la sesión; y la franja de
// acción con UNA primaria, la pausa y Terminar con pulsación de 1 s. Un paso
// de cada familia para ver que el sujeto no baila; y los estados que todas
// comparten: pausa, descanso común, anotar la serie, deshacer, GPS, máquina
// perdida o sin conectar, reloj como segunda pantalla, terminar, la Live
// Activity y la Isla Dinámica, y el horizontal del ergo.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoDe } from './casos';
import { Fuera, VivoAmrap, VivoBasico, VivoEmom, VivoFuerza, VivoGps } from './vistas';

export const meta: TwinMeta = {
  id: 'iphone-vivo-gramatica',
  titulo: 'iPhone · la gramática del vivo',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'Una anatomía para todas las familias: posición y crono arriba, el sujeto siempre a la misma altura, la banda del objetivo con ▲▼, el trabajo, la rejilla de la máquina, «Luego», la tira de la sesión y UNA acción primaria. Un paso de cada familia y los estados comunes: pausa, descanso, anotar, deshacer, GPS, máquina, terminar, Live Activity.',
  fuentes: [],
  enApp:
    'Hoy el iPhone tiene tres lenguajes (la tanda del 29-jul, los añadidos de agosto y los parches de septiembre) y un vivo por formato: el sujeto baila de altura, la BikeErg sale como remo, el AMRAP y el HYROX se pisan con listas, «Terminar» cierra una ronda, hay siete cuentas atrás y el título va en inglés («Intervals», «For Time»). Esto lo sustituye entero: un pintor sobre el mismo estado que la muñeca (`kit-reloj`), con el kit `kit-iphone-vivo`. Las cinco familias (correr, ergo, fuerza, WOD, circuito) se diseñan encima en `iphone-vivo-*`.',
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'correr',
    titulo: 'Correr · serie 3/6 a 3:45–3:55',
    descripcion:
      'El caso ilustrativo del modelo. Cabecera «Serie 3/6 · 1000 m · Series» con el crono de sesión y los chips (GPS, banda). Manda el ritmo ACTUAL contra su banda (marca dentro, «dentro»); debajo «quedan 620 m»; la rejilla: pulso con su zona, distancia del paso, cadencia; «Luego · Recupera 90″ trote · después 1000 m a 3:45–3:55»; la tira con las 6 series en naranja. Al llegar a 1000 m se cierra sola: GO, «Serie 3: 3:50, dentro».',
  },
  {
    id: 'ergo',
    titulo: 'Ergo · SkiErg 8 × 250 m a 2:05/500 (505)',
    descripcion:
      'El mismo estado que la muñeca (sesión 505, serie 3/8), con el ski conectado: manda el /500 actual contra su banda; se va a 1:59 («▲ rápido», afloja) y vuelve. La rejilla es LA DE LA MÁQUINA: s/min, vatios, calorías (siempre, no solo con objetivo en cal) y el pulso. Gira el marco (Vista → Horizontal): el sujeto a la izquierda, rejilla y acción a la derecha.',
  },
  {
    id: 'bici',
    titulo: 'BikeErg · 3 × 4′ a 2:00/1000 (ilustrativo)',
    descripcion:
      'La bici se lee por 1000 m, como su monitor y como la prescribe el coach: héroe «2:02 /1000», banda «2:00 /1000», rpm en vez de s/min. Hoy salía como remo (/500, s/min, «sin remar»). El dato viaja igual (s/500); cambia cómo se ENSEÑA, en un solo sitio del kit.',
  },
  {
    id: 'fuerza',
    titulo: 'Fuerza · A1 Back Squat, serie 1/4 (529)',
    descripcion:
      'Cabecera «A1 · Back Squat · Serie 1/4»: la superserie dice A1/A2 y la serie de ESE ejercicio. El héroe responde «¿qué levanto y cuánto?»: «8 × 125» kg con «65–70 % RM» encima; la rejilla: serie, descanso prescrito, pulso; «Luego · A2 · Box Jump». A los 4,2 s, «Serie hecha»: A2 entra sin descanso (GO) y abajo «A1 · serie 1 hecha · Deshacer» 5 s.',
  },
  {
    id: 'emom',
    titulo: 'EMOM 12′ · minuto 3, Bench Press (498)',
    descripcion:
      'Cabecera «Minuto 3/12 · EMOM 12′» (el total es un dato, M5). Manda lo que queda del minuto; el trabajo es la tarea con su carga, «6 Bench Press · 60 kg», nunca en gris (§10.6). A los 3,5 s «Hecho»: no cierra la ventana, lo que queda pasa a ser «respiro» y la primaria desaparece (manda el reloj). Al minuto 4, GO y el remo con su /500 y sus calorías.',
  },
  {
    id: 'amrap',
    titulo: 'AMRAP 15′ · 4 rondas (ilustrativo)',
    descripcion:
      'Manda lo que cuentas tú: «4 rondas»; el trabajo, «quedan 6:18»; la rejilla: por dónde empieza la ronda, reps por ronda, pulso. La primaria es «+1 ronda» (con deshacer). Hoy el AMRAP metía RX/Escalado, la ronda entera y los contadores en el vivo, pisándose: RX/Escalado se declara al terminar, con la puntuación; la ronda vive en Estructura.',
  },
  {
    id: 'fortime',
    titulo: 'For Time · cap 20:00, ronda 3 (ilustrativo)',
    descripcion:
      'El crono total ES la puntuación y es el héroe («total»); la cabecera dice «Ronda 3/3 · Estación 1/3 · For Time · cap 20′» en castellano de box desde un solo formateador. El trabajo: la estación y su dosis («500 m Row»); la rejilla: cap, lo que llevas en esta estación, el /500 del remo, pulso. El remo se cierra solo; los Wall Ball y los Burpee los cierras tú.',
  },
  {
    id: 'tabata',
    titulo: 'Tabata 8 × 20″/10″ · manda el reloj',
    descripcion:
      'Reloj de pared: el héroe es la fase con su palabra («trabajo», «descanso») y lo que queda; la rejilla, ronda y pulso. NO hay acción primaria: la franja lo dice («manda el reloj») en vez de inventar un botón. El 3-2-1 y el GO son los mismos del kit.',
  },
  {
    id: 'circuito',
    titulo: 'HYROX · Sled Push, lo dices tú → Roxzone',
    descripcion:
      'Un solo pintor de circuito: la cabecera lleva el crono TOTAL (la puntuación) y «Estación 2/8 · Circuito»; el héroe es el crono de la estación con «lo dices tú»; el trabajo, «50 m · 152 kg»; la rejilla, total y pulso; la tira, las 16 piezas. A los 3,5 s «Estación hecha»: entra la Roxzone de salida en LA MISMA pantalla y el deshacer 5 s.',
  },
  {
    id: 'circuito-carrera',
    titulo: 'HYROX · Run 5/8 con el total en la cabecera',
    descripcion:
      'La carrera dentro del circuito usa el héroe de correr (lo que falta, porque la 441 no trae objetivo; el ritmo actual y el pulso en la rejilla) SIN cambiar de estructura de pantalla: misma cabecera con el total, misma rejilla, misma tira, misma franja. Hoy cambiaba de pantalla en cada estación.',
  },
  {
    id: 'descanso',
    titulo: 'Descanso común · r 90″ entre rondas (493)',
    descripcion:
      'La fase común a todas las familias (I7): la cuenta atrás como héroe, «Viene: Ronda 3/5 · Run 1000 m · RPE 8» en el trabajo con «+30 s» al lado, el pulso bajando en la rejilla y «Empezar ya» de primaria. Monocromo: aquí no se juzga nada. A 10 s el preaviso, luego 3-2-1 y GO a la ronda 3.',
  },
  {
    id: 'anotar',
    titulo: 'Anotar la serie · el descanso tras A2 (529)',
    descripcion:
      'Descanso de 2′ tras la ronda A1 → A2: se anota AQUÍ (Hevy/Strong). Una tarjeta por serie con reps · kg · RIR prerrellenados (gris, «sin confirmar»); se toca el dato y los ± grandes lo mueven. A los 2,5 s la carga sube dos clics a 130 kg (declarada, en blanco); a los 6 s «Confirmar»: todo pasa a «✓» y la primaria vuelve a «Empezar ya». Lo prerrellenado no cuenta hasta confirmarlo.',
  },
  {
    id: 'deshacer',
    titulo: 'Deshacer · una serie cerrada sin querer (529)',
    descripcion:
      'A1 Back Squat serie 3/4, a los 4 s de empezar. A los 1,5 s un toque sin querer en «Serie hecha» cierra la serie y entra A2. Sobre la franja, «A1 · serie 3 hecha · Deshacer» durante 5 s; a los 4 s se deshace: vuelve A1 serie 3 con el tiempo corriendo (el tiempo no se deshace).',
  },
  {
    id: 'gps',
    titulo: 'GPS · buscando ANTES de empezar (538)',
    descripcion:
      'Sesión 538, tramo 1. Antes de empezar el motor no corre: el chip «GPS» late, la nota dice «GPS · buscando señal», el ritmo no se inventa (banda sin marca) y «Empezar · sin GPS» está desactivado. A los 7 s fija (.success): el chip se rellena y «Empezar» se enciende; a los 8,5 s se pulsa y arranca con GPS listo. Nunca a mitad.',
  },
  {
    id: 'maquina-perdida',
    titulo: 'Máquina perdida · el ski deja de llegar (505)',
    descripcion:
      'La serie de SkiErg con el ski conectado; a los 3 s deja de llegar: el chip pasa a «Ski · sin señal», el héroe cae a lo que se sabe (el tiempo) y las celdas del monitor se pintan «—», nunca un número congelado. La nota bajo el sujeto: «sin señal del ski · toca para reconectar». Nada se reconecta solo.',
  },
  {
    id: 'sin-maquina',
    titulo: 'Sin máquina · el vivo sigue siendo el vivo (505)',
    descripcion:
      'La misma serie sin el ski emparejado: el chip dice «Conectar el ski» (apagado), el héroe es el crono con «lo dices tú», el objetivo queda como banda sin marca («2:05 /500 · sin lectura»), el pulso sigue, y la serie se cierra con «Estación hecha». Hoy era una guía de conexión a pantalla completa sin reloj ni pulso.',
  },
  {
    id: 'test',
    titulo: 'Test · remo 2000 m',
    descripcion:
      'Un test no se confunde con un WOD: la cabecera lleva la marca «Test» y el formato «Test». El héroe es lo que falta (700 m), nunca el nombre de la máquina; la rejilla es la del remo: /500 actual, s/min, vatios, calorías; el pulso en la cabecera de chips. Se cierra solo a los 2000 m.',
  },
  {
    id: 'reloj',
    titulo: 'El reloj lleva el entreno · el móvil es su segunda pantalla',
    descripcion:
      'La misma serie 3/6 con el chip «Reloj» y la nota «el reloj lleva el entreno · el móvil es su segunda pantalla» (I1: dos pintores del mismo estado). Se ve exactamente igual: no hay otro modelo para el espejo.',
  },
  {
    id: 'pausa',
    titulo: 'Pausa',
    descripcion:
      'El vivo se atenúa (se sigue viendo dónde estabas), «EN PAUSA», los relojes no corren y la pausa pasa a «Reanudar» en naranja; la primaria queda apagada. Debajo, «sigue sola en N s» (la pausa que pide el atleta se reanuda sola a los 10 s, como la vista vieja) y el botón de la voz, para silenciar o devolver los avisos.',
  },
  {
    id: 'terminar',
    titulo: 'Terminar · mantener 1 s y la hoja',
    descripcion:
      'Terminar es el redondo de la derecha y hay que MANTENERLO 1 s (el anillo se llena; soltar antes no cierra nada y lo dice). A los 2 s sube la hoja «¿Terminar aquí?» con lo hecho: «Serie 3/6 · 1000 m · 5,58 km corridos · 27:07 de sesión». Terminar y guardar (naranja) o Seguir. A los 6,5 s se confirma.',
  },
  {
    id: 'estructura',
    titulo: 'Estructura · la sesión entera, desde la tira',
    descripcion:
      'Tocar la tira (o deslizar) abre la Estructura: cada bloque del coach en dos líneas, lo hecho con sus vueltas contra su objetivo («1 · 3:51 · dentro»), lo de ahora en tinta y lo que viene. Es la única lista larga del vivo y por eso es una página: nada se pisa en Vivo. Cabecera y franja siguen ahí.',
  },
  {
    id: 'bloqueo',
    titulo: 'Live Activity · la pantalla de bloqueo',
    descripcion:
      'Fuera de la app (I11): la misma lámina en la tarjeta de la pantalla de bloqueo: posición, crono, el héroe con su veredicto y la acción primaria interactiva (iOS 17+). Como Apple Fitness y Strava.',
  },
  {
    id: 'isla',
    titulo: 'Isla Dinámica · compacta y expandida',
    descripcion:
      'Compacta: el héroe a un lado, el crono al otro. Expandida (cada 3 s): la tarjeta de la Live Activity con la primaria. Mismo dato, mismo vocabulario.',
  },
  {
    id: 'horizontal',
    titulo: 'Horizontal · el ergo en el soporte del remo (§3)',
    descripcion:
      'Pulsa «Horizontal» en Vista: el sujeto y la banda a la izquierda, la rejilla, «Luego», la tira y la acción a la derecha. Solo ergo y cinta lo admiten; el resto, vertical.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta).
  const [caso] = useState(() => casoDe(escenario));
  switch (escenario) {
    case 'amrap':
      return <VivoAmrap caso={caso} onLog={onLog} />;
    case 'emom':
      return <VivoEmom caso={caso} onLog={onLog} />;
    case 'fuerza':
    case 'deshacer':
      return <VivoFuerza caso={caso} onLog={onLog} />;
    case 'anotar':
      return <VivoFuerza caso={caso} onLog={onLog} guionAnotar />;
    case 'gps':
      return <VivoGps caso={caso} onLog={onLog} />;
    case 'bloqueo':
    case 'isla':
      return <Fuera caso={caso} onLog={onLog} modo={escenario} />;
    default:
      return <VivoBasico caso={caso} onLog={onLog} />;
  }
}
