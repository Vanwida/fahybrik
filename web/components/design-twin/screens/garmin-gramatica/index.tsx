'use client';

// GARMIN · LA GRAMÁTICA — propuesta del reloj Garmin (29-09).
// Modelo: docs/garmin-reloj/modelo.md (§3, §5, §6, §7, G1–G12). Kit: `kit-garmin/`.
//
// Los cimientos sobre los que se construyen las familias (correr, circuito,
// fuerza, WOD, antes y después): la pantalla redonda en fracciones del
// diámetro, los cuatro relojes (454 y 390 AMOLED, 260 y 218 MIP), los cinco
// botones con la tabla de §5, el deshacer de 5 s, Controles, la pausa y los
// avisos de vibración y tono. Los casos son los de «Muñeca · correr»: el
// mismo motor, otro pintor.

import { useState } from 'react';
import { CaraDelVivo, ComparaTamanos, VivoGarminDePlan, useVivoGarmin } from '../../kit-garmin';
import { tinteDelPaso } from '../../kit-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoGarmin, type CasoGarmin } from './casos';

export const meta: TwinMeta = {
  id: 'garmin-gramatica',
  titulo: 'Garmin · la gramática',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'El reloj Garmin sobre el mismo motor que la muñeca: la pantalla redonda en fracciones del diámetro (454, 390, 260 y 218), cinco botones con la gramática de Garmin, BACK/LAP con 5 s para deshacer, Controles con UP mantenido, y avisos de vibración y tono sin voz.',
  fuentes: [],
  enApp:
    'Hoy `garmin-ciq/` es la app «mensajera»: baja el entreno como FIT y lanza el reproductor nativo de Garmin (nunca se ha probado en un reloj). Esto es el motor propio del modelo del 29-09; todavía no hay Monkey C.',
  dispositivo: 'garmin',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'ritmo-dentro',
    titulo: 'Serie a ritmo · 6 × 1000 m @3:45–3:55',
    descripcion:
      'Serie 3 de 6 a 380 m. Manda el ritmo actual contra su banda (marca dentro); debajo lo que falta y el pulso en la fila de abajo; el aro es la sesión. ↑ y ↓ pasan páginas (Datos, Vueltas, Estructura, en círculo). Cambia el tamaño arriba: el mismo instante a 454, 390, 260 y 218.',
  },
  {
    id: 'ritmo-fuera',
    titulo: 'La misma serie, yendo rápido',
    descripcion:
      'A los 46 s se va a 3:38: la marca pasa a ▲ y sale «▲ rápido» sin cambiar de color. Tras 4 s fuera, UN aviso «afloja» (2 cortas + dos notas que bajan) y el aro destella; la cadencia del coach (20 s) no lo repite. Mira la cronología.',
  },
  {
    id: 'zona',
    titulo: 'Serie a zona · 800 m @Z5 (479)',
    descripcion:
      'El coach pide zona: manda el pulso y la banda se dibuja sobre sus cinco zonas con la Z5 encendida. En AMOLED el fondo lleva el tinte de la zona; en 260 y 218 (MIP) no se tiñe: la zona va en la banda.',
  },
  {
    id: 'rodaje',
    titulo: 'Rodaje 50′ @Z2 (491)',
    descripcion:
      'Manda el pulso con su techo («Z2 · a 6 de Z3»), quedan 37′ y el ritmo va abajo. Solo avisa por encima. BACK/LAP aquí es «siguiente paso» (la movilidad), con 5 s para deshacer.',
  },
  {
    id: 'tirada-km',
    titulo: 'Tirada 80′ @Z2 · vuelta por km (494)',
    descripcion:
      'Con el cue del coach «mirar el pulso» bajo el contexto. A los 10 s cruza el km 5: la vuelta automática (2 cortas + tono LAP) y la tarjeta del km unos segundos.',
  },
  {
    id: 'recupera-go',
    titulo: 'Recuperación 90″ trote → serie 4',
    descripcion:
      'Monocromo: la cuenta atrás, «Luego · 1000 m a 3:45–3:55» y el pulso bajando. A 10 s el preaviso (1 corta), a 3 s el 3-2-1 a pantalla entera (1 corta por segundo, KEY) y el GO (2 largas + START). BACK/LAP = empezar ya.',
  },
  {
    id: 'descanso',
    titulo: 'Descanso entre Wall Balls (479)',
    descripcion:
      'El descanso común: cuenta atrás, «Viene: Wall Ball · 12 reps · 9 kg» y el pulso. +30 s está en Controles (mantén UP); BACK/LAP = empezar ya. A 3 s, el 3-2-1 y el GO.',
  },
  {
    id: 'deshacer',
    titulo: 'BACK/LAP y deshacer',
    descripcion:
      'A los 2,5 s se pulsa BACK/LAP: la serie se cierra (1 muy corta de acuse, luego 1 larga de recuperación) y en la franja de abajo sale «Serie 3 cerrada · ↶ UP · deshacer» durante 5 s, sin tapar el héroe. A los 5,5 s, UP: vuelve la serie con su tiempo. Repite tú con ⌫ y ↑.',
  },
  {
    id: 'controles',
    titulo: 'Controles (UP mantenido)',
    descripcion:
      'Pausa, Saltar paso, Cambiar entorno, Terminar y Descartar. ↑↓ mueven, Enter elige, ⌫ cierra. Terminar pide confirmar y ofrece «Guardar lo hecho»; Descartar pide dos confirmaciones. Los rótulos junto a los botones solo salen fuera del vivo.',
  },
  {
    id: 'pausa',
    titulo: 'Pausa',
    descripcion:
      'Su propia cara (en un MIP no hay media luz): «En pausa», el crono de la sesión quieto y dónde estabas. START = Reanudar; BACK = Controles. Nada se cierra con BACK mientras graba.',
  },
  {
    id: 'completada',
    titulo: 'Sesión completada',
    descripcion:
      'Los últimos 8 s de la vuelta a la calma de la 6 × 1000 m: el motor cierra el último paso, suena «sesión hecha» (3 largas + SUCCESS ×2) y sale el sello, el tiempo total y «Completa · 6 de 6 series» (lo decide lo hecho).',
  },
  {
    id: 'tamanos',
    titulo: 'Los cuatro tamaños · serie a ritmo',
    descripcion:
      'La misma cara a 454, 390, 260 y 218, cada una a sus píxeles. En los MIP todo color pasa por los 64 colores que pueden pintar. Nada se corta por las esquinas y ningún texto baja del 6,2 % del diámetro.',
  },
  {
    id: 'tamanos-zona',
    titulo: 'Los cuatro tamaños · serie a zona',
    descripcion:
      'La serie a Z5 de la 479 en los cuatro: con tinte de zona en AMOLED y sin él en MIP, donde la zona se lee en la banda.',
  },
];

function Comparacion({ caso, onLog }: { caso: CasoGarmin; onLog: (linea: string) => void }) {
  const { plan } = caso.caso.datos;
  const { seq } = useVivoGarmin(plan, caso.caso.sim, caso.caso.inicio, { onLog, corriendo: false });
  return <ComparaTamanos tinte={tinteDelPaso(seq.paso, seq.lecturas, plan.zonas)}>{() => <CaraDelVivo seq={seq} />}</ComparaTamanos>;
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta).
  const [caso] = useState(() => casoGarmin(escenario));
  if (caso.comparar) return <Comparacion caso={caso} onLog={onLog} />;
  const { plan, estructura } = caso.caso.datos;
  return (
    <VivoGarminDePlan
      plan={plan}
      sim={caso.caso.sim}
      inicio={caso.caso.inicio}
      estructura={estructura}
      inicial={caso.inicial}
      guion={caso.guion}
      onLog={onLog}
    />
  );
}
