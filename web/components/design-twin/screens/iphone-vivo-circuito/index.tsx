'use client';

// IPHONE · CIRCUITO Y HYROX — propuesta del rediseño del vivo del iPhone (28-09).
// Modelo: docs/vivo-iphone/modelo.md (I4 «¿qué estación y cuánto llevo?», §4,
// §5) y P10 de la muñeca. Kit: `kit-iphone-vivo/` sobre el dominio de `kit-reloj/`.
//
// Un solo pintor para todo el circuito: la estación con su nombre delante,
// su dosis y su carga; lo que la máquina mide, con la métrica de la máquina;
// lo que nadie mide, con su crono y «lo dices tú»; la carrera dentro del
// circuito con el héroe de correr (el objetivo del coach manda) y el crono
// total —la puntuación— en la cabecera, SIN cambiar de estructura; la Roxzone
// como paso propio; el descanso común; y la Estructura con el parcial de cada
// tramo y estación. Un bloque continuo remo → ski → bici son tres pasos, cada
// uno con su máquina. Y un circuito libre se ve exactamente igual.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoDe } from './casos';
import { VivoCircuitoIphone, VivoContinuo } from './vistas';

export const meta: TwinMeta = {
  id: 'iphone-vivo-circuito',
  titulo: 'iPhone · circuito y HYROX',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-09-29',
  descripcion:
    'Rondas de circuito con estaciones medidas y sin medir, la HYROX completa (8 × 1 km + 8 estaciones con nombre, dosis y carga, Roxzone como paso), la carrera dentro del circuito con el héroe de correr y el total en la cabecera, el bloque continuo remo → ski → bici (cada tramo con su máquina y su métrica), la Estructura con parciales por estación y un circuito libre que se ve igual.',
  fuentes: [
    'ios/FAHYBRIKCore/Vivo/Vivo+Circuito.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+PlanDeSesion.swift',
    'ios/FAHYBRIK/Workout/VivoIphone/VivoIphoneCuadro.swift',
    'ios/FAHYBRIK/Workout/VivoIphone/VivoRutaCircuito.swift',
  ],
  enApp:
    'Hoy el circuito por rondas y la HYROX Sim (ActiveWorkoutView + RoundsLiveHUD + WorkoutFormatHUDs) son la lista del coach con «ARRANCAR BLOQUE» por estación (BlockPreviewGate), RX/Escalado en mitad del vivo, un mapa «Buscando GPS» bajo un trineo (RunRouteMapView), el crono del tramo como sujeto sin dosis ni carga, la máquina sin su métrica, y el continuo remo + ski + bici es UN tramo con la métrica del remo. El libre «Por rondas» tiene su propio vivo con «tu media desde la 2ª». Esto lo sustituye entero con el kit del iPhone sobre el mismo estado que la muñeca (`reloj-circuito`); el chipper 506 (el AMRAP dentro del circuito y su campana) queda para `iphone-vivo-wod`.',
  dispositivo: 'iphone',
  // Solo el bloque continuo (ergo) lo admite (§3 del modelo); el resto se ve en vertical.
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'rondas-medida',
    titulo: '493 · SkiErg 500 m con el ski · Ronda 1/5',
    descripcion:
      'Estación MEDIDA de la sesión 493: «SkiErg · 500 m» arriba, «Circuito · Ronda 1/5» debajo con los chips del ski y la banda. Manda lo que falta («quedan 120 m», lo cuenta el ski); la fila del objetivo dice «RPE 8,5 · muy fuerte» (no es un número vivo); la rejilla es LA DEL SKI: /500 actual, paladas, pulso y calorías. A los 500 m se cierra sola y entra el descanso común: «Viene: Ronda 2/5 · Run · 1000 m a RPE 8».',
  },
  {
    id: 'rondas-sin-medir',
    titulo: '493 · Burpee Broad Jump, lo dices tú → descanso',
    descripcion:
      'Estación que NADA mide: el héroe es el crono de la estación con «lo dices tú», el trabajo «40 m», la rejilla el pulso y el tiempo de la ronda. A los 3,5 s «Estación hecha»: 5 s de «Estación hecha · Deshacer» sobre la franja y el descanso de 90″ con su cuenta atrás, «Viene:», «+30 s» y «Empezar ya».',
  },
  {
    id: 'rondas-carrera',
    titulo: '493 · Run 1000 m a RPE 8 dentro del circuito',
    descripcion:
      'La carrera dentro del circuito usa el héroe de correr sin cambiar de estructura: «Run · 1000 m» y «Circuito · Ronda 2/5», el total en la cabecera, lo que falta como héroe (el RPE no es un número vivo: «objetivo · RPE 8 · ritmo de carrera»), el ritmo actual, el pulso con su zona, la distancia del tramo y el tiempo de la ronda. A los 1000 m se cierra sola («Run 2: 4:28») y entra la estación en la MISMA pantalla.',
  },
  {
    id: 'rondas-estructura',
    titulo: '492 · la Estructura con parciales · la ronda 5 sin Farmers',
    descripcion:
      'Sesión 492 (Sled Push 5 ×, Sled Pull 5 ×, Farmers 4 ×, r 90″), en el descanso tras los Farmers de la ronda 4, con la Estructura abierta: cada estación hecha con su tiempo y su pulso medio, agrupadas por ronda; el descanso de ahora; y la ronda 5 con dos estaciones, no tres (cuentas distintas por ítem, M4). Hoy el pliegue hacía Farmers × 5.',
  },
  {
    id: 'hyrox-run',
    titulo: 'HYROX · Run 5/8 tal como lo trae la 441',
    descripcion:
      'Simulación completa (orden y dosis de stations.ts, cargas de la plantilla 441). El Run no lleva objetivo en la 441: manda lo que falta; el ritmo actual, el pulso, la distancia y el tiempo de la ronda en la rejilla; «Run 5/8 · 1000 m» arriba y el total —la puntuación— a su lado. «Luego · Roxzone · después Row · 1000 m».',
  },
  {
    id: 'hyrox-run-ritmo',
    titulo: 'HYROX · Run 5/8 al ritmo que fija el coach (ilustrativo)',
    descripcion:
      'El mismo run con un ritmo del coach (4:35–4:45 /km; la 441 no lo trae): ahora el héroe es el ritmo ACTUAL contra su banda, el atleta va a 4:30 y la marca sale por la derecha con «▲ rápido»; lo que falta baja al trabajo. Misma cabecera, misma rejilla, misma tira, misma franja: el objetivo manda, la estructura no cambia.',
  },
  {
    id: 'hyrox-ski',
    titulo: 'HYROX · SkiErg 1000 m con el ski · Estación 1/8',
    descripcion:
      '«SkiErg · 1000 m» y «HYROX · Estación 1/8». Lo que falta lo cuenta el ski (quedan 385 m) y la rejilla es la del ski: /500 actual, paladas, pulso, calorías. Se cierra sola a los 1000 m y entra la Roxzone de salida. La ronda 1 en la rejilla es el tiempo de Run 1 + Roxzone + esta estación.',
  },
  {
    id: 'hyrox-sin-maquina',
    titulo: 'HYROX sin el ski · SkiErg lo dices tú',
    descripcion:
      'La misma estación sin el ski emparejado: el chip dice «Conectar el ski» (apagado) y la nota «sin el ski · lo dices tú»; nada cuenta los metros, así que no hay cuenta atrás que se congele: manda el crono de la estación, el trabajo dice «1000 m» y se cierra con «Estación hecha». Nada se conecta solo.',
  },
  {
    id: 'hyrox-sled',
    titulo: 'HYROX · Sled Push → Roxzone → Run 3, sin cambiar de pantalla',
    descripcion:
      '«Sled Push» · «HYROX · Estación 2/8»; el crono de la estación con «lo dices tú», el trabajo «50 m · 152 kg». A los 3,5 s «Estación hecha»: entra la Roxzone de salida («sigue sola al correr», «Salgo a correr» por si el sensor no la ve) con 5 s de deshacer; el atleta anda 6 s y echa a correr: a los 3 s corriendo se cierra sola y entra el Run 3/8 con su GO y el héroe de correr. Tres pasos, una estructura. La detección es simulada: A VALIDAR EN APARATO.',
  },
  {
    id: 'hyrox-entrada',
    titulo: 'HYROX · Run 8 → Roxzone de entrada → «Empiezo»',
    descripcion:
      'Faltan 60 m del último Run. Al cerrarse solo entra la Roxzone de entrada: «Roxzone · entras a Wall Balls», su crono, el trabajo «100 reps · 6 kg» (la carga del coach: hay que ir a por la bola) y la primaria «Empiezo». A los 24 s se pulsa: empieza la estación y la Roxzone queda como su parcial.',
  },
  {
    id: 'hyrox-estructura',
    titulo: 'HYROX · la Estructura con el parcial de cada pieza',
    descripcion:
      'Desde el Run 5, la Estructura del circuito: Run 1–4 con su tiempo y su pulso medio, SkiErg con su /500 medio, Sled Push, Sled Pull y Burpee Broad Jump con su tiempo, cada Roxzone pasada como fila menor, el Run 5 de ahora con su crono en tinta y lo que viene con su dosis y su carga. Arriba, la Roxzone sumada. Scrollea y se abre con lo de ahora a la vista.',
  },
  {
    id: 'continuo',
    titulo: 'Continuo · remo 15′ → ski 15′ a Z2 (ilustrativo)',
    descripcion:
      'Un bloque continuo multi-máquina son TRES pasos, no uno: «Remo · tramo 1/3» y «Continuo». Manda el pulso contra su zona (Z2 sobre el espectro del coach, el fondo teñido), el trabajo «quedan 0:12», y la rejilla es la del remo: /500, paladas, calorías, vatios. A los 12 s pasa al ski sin puerta ni cuenta atrás: cambian el chip, el nombre y la métrica (paladas del ski), y «Luego · Bici · 15′ a Z2». Hoy es un solo tramo con la métrica del remo.',
  },
  {
    id: 'continuo-bici',
    titulo: 'Continuo · bici 15′ a Z2, tramo 3/3 (ilustrativo)',
    descripcion:
      'El tercer tramo, en la bici: su ritmo se lee por 1000 m («2:04 /1000», como su monitor y como lo prescribe el coach) y su cadencia en rpm. Gira el marco (Vista → Horizontal): el ergo admite el soporte apaisado, el sujeto a la izquierda y la rejilla a la derecha.',
  },
  {
    id: 'libre',
    titulo: 'Libre · 4 rondas de Run 400 m · 15 Wall Balls · Row 500 m',
    descripcion:
      'Un circuito que se monta el atleta, sin coach y sin objetivos: es el MISMO objeto. «Wall Balls» · «Circuito · Ronda 2/4 · Estación 1/2», el crono con «lo dices tú», «15 reps · 9 kg», el total como puntuación. A los 3,5 s «Estación hecha» → Row 500 m con el remo (quedan, /500, paladas); a los 9 s la Estructura con la ronda 1 y sus parciales. Hoy el libre «Por rondas» tenía su propio vivo con RX/Escalado y «tu media desde la 2ª».',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta).
  const [caso] = useState(() => casoDe(escenario));
  return caso.plan ? <VivoContinuo caso={caso} onLog={onLog} /> : <VivoCircuitoIphone caso={caso} onLog={onLog} />;
}
