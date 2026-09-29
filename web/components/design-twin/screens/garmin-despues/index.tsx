'use client';

// GARMIN · AL TERMINAR — propuesta del final de la sesión en el reloj Garmin (29-09).
// Modelo: docs/garmin-reloj/modelo.md (§5 fila «RPE / Resumen», §7 G27–G31, §8 el
// resultado). Kit: `kit-garmin/`. Hermana de «Muñeca · antes y después» (la parte
// de después).
//
// El motor cierra el último paso (o el atleta termina, o la app se recupera) y el
// reloj dice cómo quedó: completa, parcial o libre (lo decide lo HECHO, nunca la
// pantalla), con su motivo; el RPE de 0 a 10 con su palabra (omitible: un RPE
// omitido viaja como nulo); un resumen primero de corredor, de fuerza o de
// circuito (con el coste de la carrera comprometida en s/km sobre el fresco); y el
// estado de envío honesto de la sesión a nuestro servidor.
//
// Ficheros: flujo (la máquina de fases y el vivo) · fases (sesión completada, RPE,
// resumen) · fin, rpe, envio, lista, pulso, resumenCorrer/Fuerza/Circuito (las caras,
// PURAS) · paginas (qué páginas tiene cada familia) · mandosFin (los cinco botones
// de cada pantalla) · vistas (el pintor) · comun · casos · escena.

import { useState } from 'react';
import { ComparaTamanos } from '../../kit-garmin';
import { completitud } from '../../kit-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { resultado6x1000 } from '../reloj-antes-despues/resultados';
import { CaraDeFin } from './vistas';
import { casoDespues, resultadoTerminado, type CaraComparada } from './casos';
import { disponerEnvio } from './envio';
import { disponerFin } from './fin';
import { Flujo } from './flujo';
import { disponerRpe } from './rpe';
import { disponerResumenCorrer } from './resumenCorrer';

export const meta: TwinMeta = {
  id: 'garmin-despues',
  titulo: 'Garmin · al terminar',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'Al acabar en el reloj Garmin: la sesión completada (completa, parcial o libre, con su motivo), el RPE de 0 a 10 con su palabra (omitible: nunca inventado), el resumen de corredor, de fuerza o de circuito (con el coste de la carrera comprometida) y el estado de envío honesto, con la salida que propone Garmin cuando el servidor rechaza. Cinco botones; cada uno rotula solo lo que hace.',
  fuentes: [],
  enApp:
    'Hoy `garmin-ciq/` es la app «mensajera» (baja el entreno como FIT y lanza el reproductor nativo; nunca se ha probado en un reloj), así que nada de esto existe todavía en un Garmin. Frente a «Muñeca · antes y después» NO se porta: «También a Salud · esfuerzo» (Salud es de Apple: el RPE va a nuestro servidor y de Garmin Connect no se promete nada, H11); la esfera con lo de hoy ya hecho tras «Listo» (la esfera del reloj no es nuestra: la app se cierra); «Guardado en tu móvil» y «En cola» del móvil (aquí no hay móvil nuestro: la sesión sale del reloj a nuestro servidor, y el estado dice lo que el reloj sabe); el doble toque, la corona y el botón Acción; y el paso automático a los 2,4 s tras «Terminar» (aquí nada avanza sin una tecla, G3). Cambia: la superserie A1/A2 en una página pasa a un ejercicio por página (un círculo no da para dos); «5 de 6 dentro» es «5/6 dentro» (la bitmap del reloj no lleva letras en un número grande); y el rechazo del servidor, que en el iPhone y el Apple Watch acaba en «Guardado en tu móvil» sin salida, aquí propone «Reintentar» y «Guardar en el reloj».',
  dispositivo: 'garmin',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  // ── EL FINAL ──────────────────────────────────────────────────────────────
  {
    id: 'final-natural',
    titulo: 'Final natural · Sesión completada',
    descripcion:
      'Los últimos 10 s de la vuelta a la calma del 6 × 1000 m. El motor cierra el último paso: suena «sesión hecha» (3 largas + SUCCESS ×2) y sale la pantalla: sello, el tiempo total como héroe y «Completa · 6 de 6 series» (lo decide lo hecho, no la pantalla). START guarda y sigue al RPE; BACK = Seguir: sigue grabando un enfriamiento libre. Los rótulos junto a los botones son los de esta pantalla: sin «+» ni «−», que aquí no mueven nada (el kit los dejaba). Se guarda en el reloj y sale a la cola: el estado exacto lo dice la última página del resumen.',
  },
  {
    id: 'final-parcial',
    titulo: 'Terminar antes · parcial, con su motivo',
    descripcion:
      'Serie 5 de 6 con Controles abiertos. Un guion pulsa por ti (↓ ↓ ↓ START START; puedes pulsar tú): Terminar → «¿Terminar?» → «Guardar lo hecho». Sale «Sesión terminada · Parcial · 4 de 6 series» y su motivo, «Terminaste en la serie 5 de 6». Ya confirmado, no vuelve a preguntar y no hay «Seguir»: está guardado y Garmin no reabre una actividad guardada (G10). START pasa al RPE (en la muñeca de Apple pasa solo a los 2,4 s; aquí nada avanza sin una tecla, G3). En el resumen, la serie 5 sale «cortada» y la 6 «sin hacer».',
  },
  {
    id: 'final-libre',
    titulo: 'Correr libre · libre, nunca parcial',
    descripcion:
      'Sin nada prescrito que cumplir, el final no es completo ni parcial: «Libre · 5,21 km» (lo decide lo hecho). START guarda, BACK sigue grabando. Tras el RPE, el resumen es el de correr libre: la distancia manda, con cada km y su desnivel.',
  },
  {
    id: 'seguir-quieto',
    titulo: 'Seguir · se guarda sola tras 10′ quieto',
    descripcion:
      'Tras «Seguir», el enfriamiento libre sigue grabando. El atleta trota 6 s y se para. Sin moverse y sin pulsar nada durante 10′ (dato del coach: `guardarQuietoS`, 600 s por defecto) la sesión se guarda sola: «Guardada sola · 10′ sin moverte», con el enfriamiento hasta que se paró. Cualquier botón reinicia la cuenta. En el doble el reloj de la inactividad va comprimido ×50: los 10′ pasan en 12 s.',
  },
  {
    id: 'recuperada',
    titulo: 'Sesión recuperada · la app murió a mitad',
    descripcion:
      'Tras morir la app en la serie 4 de 6, el atleta elige «Guardar lo hecho» (G07) y el reloj cierra desde el último punto guardado: «Sesión recuperada · Parcial · 3 de 6 series», y el motivo dicho como pasó, «Se cortó en la serie 4 de 6» (nadie la terminó). No hay «Seguir»: Garmin no reabre una actividad cerrada [S] y el modelo no lo promete. Sigue el RPE y el resumen con lo que hay. De Garmin Connect no se dice nada: si la actividad aparece allí es la prueba T7, sin hacer.',
  },
  {
    id: 'hueco-tirada',
    titulo: 'HUECO DEL MODELO · tirada cerrada a los 24′ de 80′',
    descripcion:
      'PROPUESTA PENDIENTE DEL ARREGLO DE MODELO. La tirada 494 es un solo paso continuo. A los 24′ de 80′, BACK/LAP lo cierra (1 muy corta + KEY y suena «sesión hecha») y `completitud` (kit-reloj/despues.ts) juzga solo por series: sin series no ve un paso cortado, y la pantalla dice «Completa» con 24:00 de 80′. Lo correcto sería «Parcial · 24′ de 80′» con su motivo. No se ha parcheado aquí (la completitud no la decide la pantalla, P0-2): se enseña tal cual sale, para que se vea el hueco. Con Terminar (Controles) sí sale parcial, porque esa vía juzga por dónde llegó.',
  },
  // ── EL RPE ────────────────────────────────────────────────────────────────
  {
    id: 'rpe',
    titulo: 'RPE · 0–10 con su palabra',
    descripcion:
      'Empieza en «—»: el número es tuyo, no una sugerencia. Un guion pulsa UP siete veces hasta 7 · fuerte (las palabras son del coach, dato con defecto); DOWN baja. Sin valor no hay nada que confirmar (START no rotula) y solo se puede saltar (BACK). START confirma y va al resumen. No hay «Salud»: es de Apple.',
  },
  {
    id: 'rpe-omitido',
    titulo: 'RPE omitido · viaja como nulo',
    descripcion:
      'BACK salta el RPE: la sesión se guarda con `perceived_exertion` nulo, nunca un 0 ni un valor por defecto. En el resumen, UP salta a la última página, que dice «Sin RPE» junto al estado de envío.',
  },
  // ── EL RESUMEN ────────────────────────────────────────────────────────────
  {
    id: 'resumen-479',
    titulo: 'Resumen de corredor · 479',
    descripcion:
      'Primero lo de corredor: «6/6 dentro», 8,24 km · 44:36 y 3:28 /km en las series (no la media). UP y DOWN pasan página, en círculo: las seis series contra Z5, las Wall Ball una a una (el tiempo medido; las reps sin anotar, en gris), el pulso con las zonas del coach y, la última, el estado de envío.',
  },
  {
    id: 'resumen-494',
    titulo: 'Tirada 494 · km a km con desnivel',
    descripcion:
      'Sin series manda la distancia (16,49 km), 1:20:00 · 4:51 /km y «98 % hasta Z2». Los 17 km y su último parcial van en tres páginas de 6, 6 y 5, cada uno con su ritmo, su desnivel y su pulso.',
  },
  {
    id: 'resumen-529',
    titulo: 'Resumen de fuerza · 529',
    descripcion:
      '«22/22 series», el volumen y «3 sin anotar». Una página por ejercicio (A1, A2, B1, B2 y el trineo), con la carga serie a serie y el RIR; lo que quedó por defecto, en gris y contado. En la muñeca de Apple la superserie va junta; aquí cada ejercicio, en la suya.',
  },
  {
    id: 'resumen-493',
    titulo: 'Circuito 493 · parciales y coste tras estación',
    descripcion:
      'El tiempo del circuito es la puntuación, con la carrera, las estaciones y la Roxzone (el coach la activó). Los tramos de carrera con lo que pierden tras estación, las estaciones con su dosis y «+14 s/km sobre tu fresco»: hay 4 pares, lo que pide el coach.',
  },
  {
    id: 'resumen-482',
    titulo: 'Circuito 482 · sin pares suficientes',
    descripcion:
      'Cuatro rondas: tres km tras estación. El coste no se da («3/4 pares · Aún sin coste · Tu coach pide 4 pares»), y los segundos de más por tramo tampoco. Sin Roxzone: el coach no la activó.',
  },
  // ── EL ENVÍO ──────────────────────────────────────────────────────────────
  {
    id: 'envio',
    titulo: 'Envío · en el reloj → enviando → enviado',
    descripcion:
      'Se guardó sin móvil a mano: «Guardado en el reloj · sube al tener el móvil» (nada se ha intentado). A los 2,5 s hay móvil y va («Enviando»); a los 5 s el servidor acusa: «Enviado». Nunca «Enviado» mientras solo está en cola. Sin caducidad hasta el acuse (G8). El envío no vibra ni suena: §6 no tiene fila para él.',
  },
  {
    id: 'reintentando',
    titulo: 'Reintentando · aún no ha subido',
    descripcion:
      'Con móvil, el primer intento falla (sin cobertura, o el servidor no contesta): «Reintentando · Aún no ha subido. Lo sigue intentando». No hay nada que el atleta pueda hacer y la pantalla no le pide nada. A los 11 s vuelve a intentarlo y a los 12,5 s sube: «Enviado».',
  },
  {
    id: 'rechazado',
    titulo: 'Rechazado por el servidor · propuesta de Garmin',
    descripcion:
      'PROPUESTA (no existe en ninguna app). El servidor contesta que no (4xx): la pantalla salta sola a esta página y dice «No se ha podido subir · El servidor no la ha aceptado. Sigue en tu reloj». START = «Reintentar» (sirve si lo que falló ya se arregló; probado: contesta lo mismo y lo dice); BACK = «Guardar en el reloj»: deja de intentar y queda «Guardado en el reloj · No se ha subido. Lo estamos revisando». En el iPhone y el Apple Watch un 4xx acaba en «Guardado en tu móvil» y se descartó ofrecer Reintentar (repetirlo da el mismo 4xx, DECISIONS 25-09); en un Garmin no hay móvil nuestro donde guardarlo, y el atleta es el único que puede decidir. Pendiente de decidir por el arquitecto.',
  },
  // ── LOS CUATRO TAMAÑOS ────────────────────────────────────────────────────
  {
    id: 'tamanos-completada',
    titulo: 'Los cuatro tamaños · sesión completada',
    descripcion: 'La sesión completada a 454, 390, 260 y 218: el tiempo total como héroe dentro de 0,20–0,26 D, «Completa · 6 de 6 series» y nada por debajo del 6,2 % del diámetro.',
  },
  {
    id: 'tamanos-parcial',
    titulo: 'Los cuatro tamaños · terminada a mano',
    descripcion: '«Sesión terminada · Parcial · 4 de 6 series» con su motivo en dos líneas: el caso que más aprieta el texto bajo el héroe, en los cuatro relojes.',
  },
  {
    id: 'tamanos-rpe',
    titulo: 'Los cuatro tamaños · RPE',
    descripcion: 'El RPE en 7 · fuerte con su escala de once tramos, a 454, 390, 260 y 218. En los MIP los tramos llenos y los vacíos siguen distinguiéndose en sus 64 colores.',
  },
  {
    id: 'tamanos-resumen',
    titulo: 'Los cuatro tamaños · resumen de corredor',
    descripcion: 'La primera página del resumen del 6 × 1000 m: «5/6 dentro» como héroe, la distancia con el tiempo y el ritmo de las series, a los cuatro tamaños.',
  },
  {
    id: 'tamanos-rechazo',
    titulo: 'Los cuatro tamaños · el rechazo',
    descripcion: 'La página de envío con el rechazo: glifo, título en dos líneas, el detalle en tres y el RPE, sin cortarse en ninguna esquina de los cuatro relojes.',
  },
];

/** Lo que se enseña en cada comparación: la disposición de una cara, para el diámetro en el que se pinta. */
function hazDe(cara: CaraComparada): (D: number) => ReturnType<typeof disponerFin> {
  const natural = resultado6x1000();
  switch (cara) {
    case 'fin-natural':
      return (D) => disponerFin({ natural: true, t: natural.t, metros: natural.metros, c: completitud(natural), libreS: 0, solaTrasS: null, decide: true }, D);
    case 'fin-parcial': {
      const r = resultadoTerminado();
      return (D) => disponerFin({ natural: false, t: r.t, metros: r.metros, c: completitud(r), libreS: 0, solaTrasS: null, decide: false }, D);
    }
    case 'rpe':
      return (D) => disponerRpe(7, D);
    case 'resumen-correr':
      return (D) => disponerResumenCorrer(natural, completitud(natural), D);
    case 'envio-rechazado':
      return (D) => disponerEnvio('rechazado', 8, D);
  }
}

function Comparacion({ cara }: { cara: CaraComparada }) {
  const haz = hazDe(cara);
  return <ComparaTamanos>{() => <CaraDeFin haz={haz} />}</ComparaTamanos>;
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta): el plan y el cuerpo tienen que ser los mismos objetos segundo a segundo.
  const [caso] = useState(() => casoDespues(escenario));
  if (caso.comparar) return <Comparacion cara={caso.comparar} />;
  return <Flujo escena={caso.escena!} onLog={onLog} />;
}
