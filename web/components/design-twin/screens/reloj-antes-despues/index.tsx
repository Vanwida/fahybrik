'use client';

// MUÑECA · ANTES Y DESPUÉS — propuesta del rediseño de la muñeca (25-09).
// Modelo: docs/reloj-muneca/modelo.md (P9, P13, §3, §4). Kit: `kit-reloj/`.
//
// ANTES: lo de hoy en la esfera y en el Smart Stack (un toque), el brief con
// la estructura REAL del coach, el GPS listo y el pulso fijado antes de salir
// (calle, cinta o pista salen de la prescripción; solo se pregunta si no lo
// dice), el 3-2-1 al empezar, y en un día libre «Correr libre» y «Entreno
// libre». DESPUÉS: el final natural con pantalla, completa o parcial según lo
// hecho, el RPE en la corona, el resumen de corredor (de fuerza, de circuito)
// y el estado de guardado con el lenguaje del móvil.
//
// Ficheros: flujo (la máquina de fases) · esfera · brief · listo (dónde, GPS,
// día libre) · vivo-fin (el vivo del kit con su final) · fin (completada,
// RPE) · resumen + resumen-{correr,fuerza,circuito,piezas} · pila (la carcasa
// de antes y después) · calculo (puro) · sesiones · resultados.
//
// PARA EL KIT (lo que aquí se construye porque el kit no lo tiene):
//   · `Pila`: la carcasa de antes/después — `Muneca` sin Controles ni Ahora
//     suena (antes de empezar o ya guardada, Pausa/Terminar no significan
//     nada), con `onPagina`, la corona como VALOR (el RPE) y una capa fija.
//   · El evento «GPS listo» (.success, §4) no está en `EventoVivo`: aquí se
//     escribe a mano con el háptico de `bloque`.
//   · `Terminado` dice «guardando…» nada más acabar: debería llevar la
//     completitud y, en el final natural, la decisión Guardar / Seguir.
//   · `filasDePasos` + `lineaBrief` + `hoyDe`: la estructura en líneas de dato
//     (brief, complicación, Smart Stack); `textoFila` no enseña la carga (M7)
//     ni la superserie, y escribe «a 3:45» donde el brief dice «@3:45».
//   · `RPE_PALABRA_DEFECTO` no tiene el 0 (el RPE va de 0 a 10).
//   · `PaginaVueltas` es del vivo (las 5 últimas, al revés): el resumen
//     necesita todas, en orden, con las que no se hicieron.

import { useState } from 'react';
import type { InicioSecuencia, Vuelta } from '../../kit-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { cuerpo } from '../reloj-correr/casos';
import { Flujo, type Escena } from './flujo';
import {
  SERIES_6X1000,
  recortada,
  resultado479,
  resultado482,
  resultado493,
  resultado494,
  resultado529,
  resultado6x1000,
} from './resultados';
import {
  sesion479Brief,
  sesion482,
  sesion491Brief,
  sesion493,
  sesion494Brief,
  sesion529,
  sesion535Brief,
  sesionSeisPorMil,
} from './sesiones';

export const meta: TwinMeta = {
  id: 'reloj-antes-despues',
  titulo: 'Muñeca · antes y después',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'Lo de hoy desde la esfera y el Smart Stack, el brief con la estructura real, GPS listo y 3-2-1; al terminar, la sesión completada (completa o parcial según lo hecho), el RPE en la corona, un resumen de corredor, de fuerza o de circuito, y el guardado honesto.',
  fuentes: [],
  enApp:
    'Hoy no hay complicación ni Smart Stack, el brief dice «N bloques», no se puede empezar un rodaje libre, el final natural no tiene pantalla, todo se guarda «parcial», y el resumen es tiempo + bloques, sin distancia, ritmo ni RPE, que siempre dice «Guardado en el iPhone».',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  // ── ANTES ─────────────────────────────────────────────────────────────────
  {
    id: 'esfera',
    titulo: 'Esfera · lo de hoy a un toque',
    descripcion:
      'La complicación grande de la esfera Modular: «Hoy · 55′», «6 × 1000 m», «@3:45–3:55 · r 90″» y la forma de la sesión (el aro desenrollado: naranja el trabajo). A los 2,6 s el dedo la toca (toque 1) y se abre el brief; «Empezar» es el toque 2.',
  },
  {
    id: 'smart-stack',
    titulo: 'Smart Stack · el widget de hoy arriba',
    descripcion: 'Desde la esfera, la corona sube el Smart Stack (a 1,3 s): lo de hoy va el primero, con la misma lectura y la misma tira. A los 3,6 s se toca el widget y abre el brief.',
  },
  {
    id: 'brief-479',
    titulo: 'Brief · 479 con su estructura real',
    descripcion:
      'Calentamiento 5′ · Z2 / 6 × 800 m @Z5 · r 2′30″ trote / Wall Ball · 5 × 12 · 9 kg · r 1′ / y, con la corona, Vuelta a la calma 3′ · Z1. Abajo, fijo: «Buscando GPS» → «GPS listo» (.success, a los 3 s) y el pulso fijado; Empezar o doble toque. El plan no dice dónde: se preguntará al empezar.',
  },
  {
    id: 'brief-491',
    titulo: 'Brief · 491 rodaje + movilidad',
    descripcion: 'Rodaje 50′ · Z2 y Movilidad 15′ (en gris: no es la parte principal). Sin entorno en la prescripción.',
  },
  {
    id: 'brief-494',
    titulo: 'Brief · 494 con el cue del coach',
    descripcion: 'Tirada 80′ · Z2, en la calle, con el cue del coach donde lo puso: «Coach · mirar el pulso» (M8).',
  },
  {
    id: 'brief-529',
    titulo: 'Brief · 529 fuerza',
    descripcion:
      'A1 Back Squat 4 × 8 · 121–131 kg, A2 Box Jump 4 × 6 · r 2′, B1 Deadlift 4 × 8 · RIR 3, B2 Bulgarian Split Squat 4 × 6 · r 2′ y Sled Push 6 × 15 m · r 90″ con «Coach · carga media» (corona ↓). Sin GPS que esperar: solo el pulso.',
  },
  {
    id: 'brief-cinta',
    titulo: 'Brief · 535 en cinta',
    descripcion: 'La prescripción dice cinta al 1 %: «Hoy · cinta» y «Cinta · sin GPS». No hay nada que esperar ni que preguntar.',
  },
  {
    id: 'empezar',
    titulo: 'Empezar · GPS listo y 3-2-1',
    descripcion:
      'Brief del 6 × 1000 m (calle). A los 1,5 s, doble toque = Empezar, con el GPS aún buscando: «Buscando GPS», el pulso fijado y «Empezar sin GPS». A los 5,2 s fija (.success), «GPS listo» y la sesión arranca sola: 3-2-1 (.click por segundo), GO (.start×2 + «Calentamiento. 15 minutos.») y el vivo.',
  },
  {
    id: 'donde',
    titulo: 'Sin entorno en el plan · ¿Dónde corres?',
    descripcion:
      '491 no dice dónde. Empezar (doble toque a 1,2 s) pregunta Calle, Cinta o Pista — una vez, antes de salir, nunca a mitad. Cinta: sin GPS, al 3-2-1. Calle o pista: espera al GPS.',
  },
  {
    id: 'dia-libre',
    titulo: 'Día de descanso · Correr libre y Entreno libre',
    descripcion:
      'La complicación dice «Descanso» y «Mañana · 6 × 1000 m». Al tocarla (2,2 s): «Correr libre» (doble toque) y «Entreno libre». Correr libre pregunta dónde, espera al GPS, 3-2-1 y vivo sin objetivo; al terminar se guarda «libre», nunca «parcial». Hoy no se puede empezar nada.',
  },
  // ── DESPUÉS ───────────────────────────────────────────────────────────────
  {
    id: 'final-natural',
    titulo: 'Final natural · Sesión completada',
    descripcion:
      'Últimos 10 s de la vuelta a la calma del 6 × 1000 m. El motor cierra el último paso: .success×2 + «Sesión completada.» y la pantalla: «Completa · 6 de 6 series» (lo decide lo hecho). Guardar (o doble toque) → RPE → resumen, que pasa de «En tu reloj» a «Guardado» cuando acusa el móvil. Seguir → sigue grabando un enfriamiento libre.',
  },
  {
    id: 'final-parcial',
    titulo: 'Terminar antes · parcial, con su motivo',
    descripcion:
      'Serie 5 de 6, en Controles. Pulsa Terminar → «¿Terminar y guardar?» → Terminar: «Sesión terminada · Parcial · 4 de 6 series» y el motivo, «Terminaste en la serie 5 de 6». Ya confirmado, no pregunta más: pasa al RPE, y el resumen enseña las series 5 y 6 «sin hacer».',
  },
  {
    id: 'rpe',
    titulo: 'RPE en la corona · 0–10',
    descripcion:
      'Empieza en «—»: el número es tuyo. La corona sube hasta 7 · fuerte (palabras del coach, dato con defecto) con su escala. «También a Salud · esfuerzo»; con 0, avisa de que Salud va de 1 a 10. Saltar siempre está. Hecho (o doble toque) → resumen.',
  },
  {
    id: 'resumen-479',
    titulo: 'Resumen de corredor · 479',
    descripcion:
      'Primero lo de corredor: «6 de 6 dentro», 8,24 km · 44:36 y 3:29 /km en las series (no la media). Corona: cada 800 m contra Z5, las Wall Ball 5 × 12 · 9 kg (reps por defecto, sin anotar), el pulso con las zonas del coach y dónde está guardada, con Listo.',
  },
  {
    id: 'resumen-494',
    titulo: 'Tirada 494 · km a km con desnivel',
    descripcion: 'Sin series: manda la distancia (16,49 km), 80:00 · 4:51 /km y «98 % hasta Z2». Corona: los 16 km y el último parcial, con su ritmo, su desnivel y su pulso (+104 m).',
  },
  {
    id: 'resumen-529',
    titulo: 'Resumen de fuerza · 529',
    descripcion:
      '«22 de 22 series», el volumen y «19 anotadas · 3 por defecto». Corona: la superserie A junta (A1 con la carga serie a serie, la más pesada y el RIR; A2 con sus reps), la B, y el trineo con su tiempo. Lo que quedó por defecto se ve atenuado.',
  },
  {
    id: 'resumen-493',
    titulo: 'Circuito 493 · parciales y coste tras estación',
    descripcion:
      'El tiempo del circuito es la puntuación, con la carrera, las estaciones y la Roxzone (el coach la activó). Corona: cada 1000 m (el 1, fresco) con lo que pierde tras estación, cada estación con su dosis, y «Tus km tras estación: +14 s/km sobre tu fresco» — hay 4 pares, lo que pide el coach.',
  },
  {
    id: 'resumen-482',
    titulo: 'Circuito 482 · sin pares suficientes',
    descripcion: 'Cuatro rondas: tres km tras estación. El coste no se da («Faltan pares · Hoy 3; tu coach pide 4»), y los segundos de más por tramo tampoco. Sin Roxzone: el coach no la activó.',
  },
  {
    id: 'guardado',
    titulo: 'Guardado honesto · reloj → cola → guardado',
    descripcion:
      'Se guardó sin el móvil cerca: «En tu reloj». A los 2,5 s el móvil lo recibe sin cobertura (held): «En cola · sin conexión». A los 6 s sube (saved): «Guardado». Nunca «Guardado en el iPhone» mientras solo está en cola. La corona baja hasta la página del guardado.',
  },
  {
    id: 'guardado-movil',
    titulo: 'Rechazado · Guardado en tu móvil',
    descripcion:
      'El servidor lo rechaza (rejected, 4xx): la muñeca dice lo mismo que el móvil, «Guardado en tu móvil · No se ha podido subir. Lo estamos revisando; no tienes que hacer nada.», y Listo. Nada que reintentar.',
  },
];

// ---------------------------------------------------------------------------
// Cada escenario, como una escena del flujo
// ---------------------------------------------------------------------------

/** Las series del 6 × 1000 m como vueltas del motor. */
const vueltas6x1000 = (hasta: number): Vuelta[] =>
  SERIES_6X1000.slice(0, hasta).map(([segundos, ppm, veredicto], k) => ({ n: k + 1, clase: 'serie', segundos, metros: 1000, ritmo: segundos, ppm, veredicto, eje: 'ritmo' }));

const corona = (desde: number, veces: number, paso = 330) =>
  Array.from({ length: veces }, (_, k) => ({ en: desde + k * paso, gesto: 'corona-arriba' as const }));

function escenaDe(id: string): Escena {
  switch (id) {
    case 'smart-stack':
      return { sesion: sesionSeisPorMil(), arranque: { en: 'esfera' }, guiones: { esfera: [{ en: 1300, gesto: 'corona-abajo' }] }, tocar: { en: 3600, donde: 'widget' } };
    case 'brief-479':
      return { sesion: sesion479Brief(), arranque: { en: 'brief' }, gpsEn: 3000 };
    case 'brief-491':
      return { sesion: sesion491Brief(), arranque: { en: 'brief' }, gpsEn: 3000 };
    case 'brief-494':
      return { sesion: sesion494Brief(), arranque: { en: 'brief' }, gpsEn: 3000 };
    case 'brief-529':
      return { sesion: sesion529(), arranque: { en: 'brief' } };
    case 'brief-cinta':
      return { sesion: sesion535Brief(), arranque: { en: 'brief' } };
    case 'empezar':
      return { sesion: sesionSeisPorMil(), arranque: { en: 'brief' }, gpsEn: 5200, guiones: { brief: [{ en: 1500, gesto: 'doble-toque' }] } };
    case 'donde':
      return { sesion: sesion491Brief(), arranque: { en: 'brief' }, gpsEn: 4500, guiones: { brief: [{ en: 1200, gesto: 'doble-toque' }] } };
    case 'dia-libre':
      return { sesion: null, manana: sesionSeisPorMil().plan.pasos, arranque: { en: 'esfera' }, tocar: { en: 2200, donde: 'complicacion' }, gpsEn: 4000 };
    case 'final-natural': {
      const s = sesionSeisPorMil();
      const base = resultado6x1000();
      const inicio: InicioSecuencia = { i: s.plan.pasos.length - 1, t: 590, sesionT: 3308, sesionM: 11598, vueltas: vueltas6x1000(6), ppmMedio: 152 };
      return {
        sesion: s,
        base,
        arranque: { en: 'vivo', inicio, sim: cuerpo({ partida: { i: inicio.i, t: 590 } }) },
        acuses: [{ en: 1800, estado: 'guardado' }],
      };
    }
    case 'final-parcial': {
      const s = sesionSeisPorMil();
      const inicio: InicioSecuencia = { i: 9, t: 70, metros: 300, sesionT: 2236, sesionM: 7660, vueltas: vueltas6x1000(4), ppmMedio: 150 };
      return {
        sesion: s,
        base: recortada(resultado6x1000(), 2236),
        arranque: { en: 'vivo', inicio, sim: cuerpo({ partida: { i: 9, t: 70 }, ppmDesde: 150 }), inicial: { area: 'controles' } },
        acuses: [{ en: 1800, estado: 'guardado' }],
      };
    }
    case 'rpe':
      return { sesion: sesionSeisPorMil(), arranque: { en: 'rpe', r: resultado6x1000() }, guiones: { rpe: corona(1200, 7) }, acuses: [{ en: 1800, estado: 'guardado' }] };
    case 'resumen-479':
      return { sesion: sesion479Brief(), arranque: { en: 'resumen', r: { ...resultado479(), rpe: 8 } } };
    case 'resumen-494':
      return { sesion: sesion494Brief(), arranque: { en: 'resumen', r: { ...resultado494(), rpe: 5 } } };
    case 'resumen-529':
      return { sesion: sesion529(), arranque: { en: 'resumen', r: { ...resultado529(), rpe: 7 } } };
    case 'resumen-493':
      return { sesion: sesion493(), arranque: { en: 'resumen', r: { ...resultado493(), rpe: 9 } } };
    case 'resumen-482':
      return { sesion: sesion482(), arranque: { en: 'resumen', r: { ...resultado482(), rpe: 8 } } };
    case 'guardado':
      return {
        sesion: sesionSeisPorMil(),
        arranque: { en: 'resumen', r: { ...resultado6x1000(), rpe: 7, guardado: 'en-reloj' } },
        acuses: [
          { en: 2500, estado: 'en-cola' },
          { en: 6000, estado: 'guardado' },
        ],
        guiones: { resumen: [7200, 7550, 7900].map((en) => ({ en, gesto: 'corona-abajo' as const })) },
      };
    case 'guardado-movil':
      return {
        sesion: sesion479Brief(),
        arranque: { en: 'resumen', r: { ...resultado479(), rpe: 8, guardado: 'en-reloj' } },
        acuses: [{ en: 1500, estado: 'en-movil' }],
        inicialResumen: { pagina: 99 },
      };
    case 'esfera':
    default:
      return { sesion: sesionSeisPorMil(), arranque: { en: 'esfera' }, tocar: { en: 2600, donde: 'complicacion' }, gpsEn: 5200 };
  }
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // La escena se construye UNA vez por montaje (cada escenario remonta).
  const [escena] = useState(() => escenaDe(escenario));
  return <Flujo escena={escena} onLog={onLog} />;
}
