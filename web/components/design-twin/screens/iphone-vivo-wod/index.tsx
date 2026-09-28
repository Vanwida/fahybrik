'use client';

// IPHONE · WOD — propuesta del vivo del iPhone para EMOM, AMRAP, For Time,
// Tabata y Death by (28-09). Modelo: docs/vivo-iphone/modelo.md (I4, I5, §4,
// §5). Kit: `kit-iphone-vivo/` sobre el dominio de `kit-reloj/`.
//
// Una pregunta por formato y el héroe la responde: cuánto queda del minuto
// (EMOM), cuántas rondas llevo (AMRAP), cuánto llevo (For Time), trabajo o
// descanso (Tabata), cuántas reps este minuto (Death by). Lo demás es la
// anatomía de la gramática, sin cambiar de pantalla entre formatos.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoDe } from './casos';
import { VivoAmrap, VivoBasico, VivoChipper, VivoDeathBy, VivoEmom } from './vistas';

export const meta: TwinMeta = {
  id: 'iphone-vivo-wod',
  titulo: 'iPhone · WOD en vivo',
  zona: 'Entreno en vivo',
  estado: 'espejo',
  actualizado: '2026-09-28',
  descripcion:
    'EMOM alterno con el remo, AMRAP con remo y su puntuación (rondas + reps), For Time chipper con cap y lista ±1, Tabata, Death by y un AMRAP libre: la misma anatomía de la gramática, un héroe por formato, sin RX/Escalado en el vivo.',
  fuentes: [
    'ios/FAHYBRIK/Workout/VivoIphone/VivoWod.swift',
    'ios/FAHYBRIK/Workout/VivoIphone/VivoIphoneCuadro.swift',
    'ios/FAHYBRIK/Workout/VivoIphone/VivoIphoneView.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+Wod.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+PlanDeSesion.swift',
  ],
  enApp:
    'Hoy cada formato es un vivo distinto (EmomLiveView, AmrapLiveView, ForTimeLiveView, el chipper con la lista entera): RX/Escalado, contadores y la ronda se pisan en la pantalla; el chipper desborda; el title va en inglés; Tabata y Death by salen como «Ronda 1/N». Esto sustituye esos vivos por UN pintor sobre `kit-iphone-vivo`; el Death by entra en el kit compartido (`kit-reloj/deathby.ts`) y la muñeca lo hereda. RX/Escalado se declara al terminar, con la puntuación, fuera del vivo.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'emom-remo',
    titulo: 'EMOM 12′ · minuto 4, el remo todo el minuto (498)',
    descripcion:
      'Cabecera «Minuto 4/12 · EMOM 12′» con el chip del remo. Manda lo que queda del minuto; el trabajo es la tarea, «Row · todo el minuto»; la rejilla es LA DEL REMO: /500 actual, metros de ESTE minuto, pulso y calorías. La rejilla ya no repite «minuto 4/12» (un dato, un sitio). Sin acción primaria: manda el reloj.',
  },
  {
    id: 'emom-carga',
    titulo: 'EMOM 12′ · minuto 5, Bench Press con su carga (498)',
    descripcion:
      'El minuto de la tarea con carga: «6 Bench Press · 60 kg» en el trabajo, y en la rejilla cuánto tardó la vez anterior (0:21) y el pulso. A los 3,5 s «Hecho»: no cierra el minuto, lo que queda pasa a «respiro», la primaria desaparece y abajo «Bench Press hecho · Deshacer» 5 s.',
  },
  {
    id: 'amrap-remo',
    titulo: 'AMRAP 12′ con remo · 3 rondas, la cuarta a punto',
    descripcion:
      'Manda lo que cuentas tú («3 rondas»); lo que queda, arriba en el trabajo; la rejilla: por dónde empieza la ronda (250 m Row), el /500 actual del remo («—» si no estás remando) y el pulso. A los 3 s «+1 ronda»: la cabecera pasa a «Ronda 5» y abajo «Ronda 4 anotada · Deshacer» 5 s. RX/Escalado no está: se declara al terminar.',
  },
  {
    id: 'amrap-campana',
    titulo: 'AMRAP · la campana y la puntuación (rondas + reps)',
    descripcion:
      'A los 3 s suena la campana: el paso de puntuación. El héroe es «5 + —» (rondas + reps: lo no dicho es «—», nunca 0); la tarjeta enseña [5 rondas] [— reps] con los ±. A los 4,5 s y 5,4 s las reps suben a 16: «hasta Row + 15 Wall Ball» (el Row cuenta 1). A los 8,5 s «Guardar».',
  },
  {
    id: 'amrap-libre',
    titulo: 'AMRAP 20′ LIBRE · Cindy, sin coach',
    descripcion:
      'Un AMRAP que el atleta se monta solo (5 Pull-up · 10 Push-up · 15 Air Squat): el MISMO pintor, la misma anatomía, la misma primaria. Nada en el vivo sabe de dónde vino el entreno. Nueve rondas a los 10:12.',
  },
  {
    id: 'chipper',
    titulo: 'For Time · chipper de 10 estaciones, cap 25′',
    descripcion:
      'El crono total ES la puntuación y es el héroe; la cabecera dice «Wall Ball · Estación 2/10 · For Time · cap 25′». El trabajo: la estación con su dosis («40 Wall Ball · 9 kg»). La lista NO desborda: lo que acabas de hacer con su tiempo, lo que viene y «+7 más» (tocar abre la Estructura). La rejilla: cap en, esta estación, pulso. A los 3,5 s «Estación hecha» → el Row por calorías, con su /500, que se cierra solo.',
  },
  {
    id: 'chipper-cap',
    titulo: 'For Time · a 1:12 del cap',
    descripcion:
      'Estación 9/10 a 23:48 de un cap de 25′: la celda del cap dice lo que queda hasta él («cap en 1:12»), no el dato del plan («25′»). Farmers Carry con su carga (2 × 24 kg), «luego · Run · 800 m», «es la última después».',
  },
  {
    id: 'tabata',
    titulo: 'Tabata 8 × 20″/10″ · ronda 4, trabajo',
    descripcion:
      'Reloj de pared: la cabecera lleva el nombre delante («Burpee · Ronda 4/8 · RPE 10»); el héroe es la fase con su palabra («trabajo») y lo que queda. La rejilla no repite la ronda: enseña el pulso medio de la ronda anterior (lo midió el motor) y el pulso. No hay acción: manda el reloj. Las reps de la ronda no se pintan: nadie las cuenta.',
  },
  {
    id: 'tabata-descanso',
    titulo: 'Tabata · los 10″ de descanso',
    descripcion:
      'El descanso común (I7), monocromo: la cuenta atrás como héroe con la palabra «descanso», «Viene: Ronda 5/8 · Burpee · 20″ a RPE 10» en el trabajo, el pulso bajando. Sin «+30 s»: en un tabata el reloj no se estira.',
  },
  {
    id: 'deathby',
    titulo: 'Death by Burpee · minuto 7',
    descripcion:
      'NUEVO en el kit: ¿cuántas reps este minuto? El héroe es «7 Burpee» con «este minuto»; el trabajo, lo que queda del minuto; la rejilla, cuánto tardó la vez anterior (0:31: cada minuto te acercas al filo) y el pulso; «Luego · Minuto 8 · 8 Burpee». La cabecera «Minuto 7 · Death by · +1 cada 1′». A los 3,5 s «Hecho»: «hecho en 0:22 · respiro».',
  },
  {
    id: 'deathby-cazado',
    titulo: 'Death by · el reloj te caza',
    descripcion:
      'Minuto 10 (10 burpees) a 3 s del final, sin marcar. Al cerrarse el minuto no entra el 11: la sesión acaba con la puntuación («9 minutos completos · te cazó el 10») y la voz lo dice. El mecanismo es del kit (`cazadoEn`).',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta).
  const [caso] = useState(() => casoDe(escenario));
  switch (escenario) {
    case 'emom-remo':
    case 'emom-carga':
      return <VivoEmom caso={caso} onLog={onLog} />;
    case 'amrap-remo':
    case 'amrap-campana':
    case 'amrap-libre':
      return <VivoAmrap caso={caso} onLog={onLog} />;
    case 'chipper':
    case 'chipper-cap':
      return <VivoChipper caso={caso} onLog={onLog} />;
    case 'deathby':
    case 'deathby-cazado':
      return <VivoDeathBy caso={caso} onLog={onLog} />;
    default:
      return <VivoBasico caso={caso} onLog={onLog} />;
  }
}
