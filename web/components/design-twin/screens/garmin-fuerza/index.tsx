'use client';

// GARMIN · FUERZA — propuesta del reloj Garmin (29-09).
// Modelo: docs/garmin-reloj/modelo.md (§5, §6, §7 G15, G1–G12) y P11 de
// docs/reloj-muneca/modelo.md. Kit: `kit-garmin/`; el motor, las reglas y las
// sesiones son los de «Muñeca · fuerza».
//
// La serie de fuerza con el EJERCICIO primero (A1/A2 en superserie), la dosis
// con sus dos ejes («5 × 100 kg · RIR 2 · 3-1-1»), BACK/LAP = «Serie hecha» (como
// el LAP nativo) con 5 s para deshacer, y la serie que se ANOTA en el propio
// descanso con los botones: UP/DOWN cambian el valor, START confirma el campo y
// pasa al siguiente (reps → carga en cascada → RIR/RPE), BACK/LAP vuelve al
// anterior. Lo propuesto no cuenta como declarado hasta que se toca o se
// confirma. La última serie lleva al siguiente ejercicio: nunca un atasco.
//
// Aquí Garmin puede ser MEJOR que su reproductor nativo (que solo cuenta las
// reps de un movimiento por serie) y que TrainingPeaks (cuya fuerza no llega al
// reloj): por eso cada paso de la anotación está cuidado.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoGarminFuerza } from './casos';
import { VivoGarminFuerza } from './vivo';

export const meta: TwinMeta = {
  id: 'garmin-fuerza',
  titulo: 'Garmin · fuerza',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'La serie de fuerza en un Garmin de cinco botones: el ejercicio primero, la dosis con sus dos ejes, BACK/LAP = «Serie hecha» con 5 s para deshacer, y la serie que se anota en el descanso con UP, DOWN y START (reps, carga en cascada, esfuerzo; lo propuesto no cuenta hasta confirmarlo).',
  fuentes: [],
  enApp:
    'Hoy `garmin-ciq/` es la app «mensajera» (baja el entreno como FIT y lanza el reproductor nativo de Garmin, que cuenta las reps de un solo movimiento y no anota nada). Esto es el motor propio del modelo del 29-09; todavía no hay Monkey C. Un cambio respecto a la muñeca: en una serie que dice el atleta el héroe es el CRONO de la serie («llevas 0:23», el de `laminaDelPaso`), no «8 reps»: las reps son una instrucción y van en la dosis (G2, G7). No se portan dos escenarios de la muñeca: «Las reps las cuenta el reloj» (el conteo por movimiento es fase 2, prueba T10: hoy nadie cuenta) y «Sin doble toque» (Garmin no tiene doble toque ni botón Acción: cerrar una serie es siempre BACK/LAP, que ya es el caso base).',
  dispositivo: 'garmin',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'superserie',
    titulo: 'Superserie A1 → A2 sin descanso (529)',
    descripcion:
      'Sesión 529, bloque A. A1 Back Squat, serie 1/4: el nombre primero, «Serie 1/4 · llevas» y el crono de la serie de héroe (nadie cuenta las reps: no se pintan como medidas), el cue del coach, la dosis «8 × 121–131 kg» con «65–70 % RM» debajo y el pulso al pie. A los 4 s, BACK/LAP: A2 entra SIN descanso (1 muy corta de acuse, 2 largas y START) y abajo queda «A1 · serie 1 hecha · ↶ UP · deshacer» 5 s. Prueba las teclas: ⌫ cierra, ↑ ↓ pasan de página, ⇧↑ abre Controles, Enter pausa.',
  },
  {
    id: 'ronda',
    titulo: 'El descanso tras A2 · se anota la ronda (529)',
    descripcion:
      'Descanso de 2′ tras A2, quedan 25 s. Manda anotar: A1 con reps 8 y carga 125 kg en gris con anillo (propuestos) y la celda enfocada en su marco naranja; con la carga enfocada, «también en las series 2–4». START ×3 confirma A1 reps, A1 carga y A2 reps (pasan a blanco con punto), la anotación se cierra y el descanso vuelve a ser el común: «✓ ronda 1 anotada» sobre la cuenta atrás y «Viene: A1 · Back Squat · 8 × 125 kg». BACK/LAP = Empezar ya: A1 serie 2 con los 125 kg declarados.',
  },
  {
    id: 'ultima',
    titulo: 'Última serie → Viene: Deadlift (529)',
    descripcion:
      'A2 serie 4/4, la última del bloque A: «Luego · B1 Deadlift». BACK/LAP: suena «bloque hecho» (1 larga + 1 corta) y el descanso trae «Viene: B1 · Deadlift · 4 × 8 · RIR 3». Los primeros 5 s son del deshacer (UP deshace); pasados, se anota la ronda 4 (A1 con los 127,5 kg de la cascada) con START ×3, y BACK/LAP la empieza ya: GO a B1 serie 1/4. Nunca un atasco: la última serie del bloque lleva al siguiente ejercicio.',
  },
  {
    id: 'aproximacion',
    titulo: 'Aproximación y el % resuelto en kg (488)',
    descripcion:
      'Sesión 488, Back Squat 4 × 6 @RPE 6,5 con «72 % 1RM» hecho dato. «Aproximación 2/2 · 3 × 100 kg» (las de aproximación son ilustrativas: 488 no las escribe) se marca aparte y no se anota. Su descanso anuncia «Viene: Serie 1/4 · 6 × 135 kg» y, con BACK/LAP = Empezar ya (pasados los 5 s del deshacer), la serie 1 lleva «6 × 135 kg» y debajo «RPE 6,5 · 72 % RM».',
  },
  {
    id: 'anotar',
    titulo: 'Anotar de cerca · propuesto frente a declarado (488)',
    descripcion:
      'Descanso tras la serie 2 de Back Squat: reps 6, 135 kg (arrastrados de la serie 1) y RPE 6,5, todo en gris con anillo y «sin confirmar». DOWN baja las reps a 5 (blanco con punto: declarado) y START las confirma y pasa a la carga; START confirma los 135 tal cual; UP sube el RPE a 7 y START cierra: «✓ 5 × 135 kg · RPE 7». BACK/LAP vuelve al campo anterior (y, en el primero, cierra la anotación). La cronología dice qué hizo cada tecla.',
  },
  {
    id: 'cascada',
    titulo: 'La carga en cascada · Deadlift 4 × 4 @RPE 7,5 (492)',
    descripcion:
      'Sesión 492, «@78 % 1RM» (RM de 200 kg ilustrativa): se propone 155 kg. START confirma las reps; UP ×2 sube la carga a 160 y la celda dice «también en las series 2–4» sin cerrar la serie actual; START la confirma. «Viene: Serie 2/4 · 4 × 160 kg». Luego UP pasa (en círculo) a la página Estructura: Deadlift, «Serie 2/4 · 4 × 160 kg».',
  },
  {
    id: 'isometria',
    titulo: 'Isometría de 20″ en la superserie de core (538)',
    descripcion:
      'Sesión 538, superserie de core, ronda 2. Tras A1 Plank, «Colócate» 5 s con el nombre largo («A2 · Isometría en puente de glúteo») en dos líneas, el 3-2-1 y GO; la isometría es un paso por TIEMPO: el héroe cuenta hacia atrás (quedan 0:20) y se cierra sola. El preaviso es del coach (10 s, solo en pasos de 30 s o más): a 20″ no suena, y se dice. Sigue A3 Push-up · 10 sin descanso.',
  },
  {
    id: 'deshacer',
    titulo: 'Deshacer un BACK/LAP sin querer (529)',
    descripcion:
      'A1 Back Squat serie 3/4, a los 4 s de empezar. A los 1,5 s, BACK/LAP cierra la serie y entra A2. Abajo, «A1 · serie 3 hecha · ↶ UP · deshacer» durante 5 s, sin tapar el héroe: a los 4,5 s, UP y vuelves a A1 serie 3 con el tiempo corriendo (el tiempo no se deshace) y los 127,5 kg de la cascada. Repite tú con ⌫ y ↑.',
  },
  {
    id: 'ejercicios',
    titulo: 'La lista de ejercicios · página Estructura (529)',
    descripcion:
      'B1 Deadlift serie 2/4, en la página Estructura: la sesión por ejercicios, lo hecho apagado, «ahora» con su serie y su carga, lo que falta con su dosis. DOWN y UP mueven la lista de uno en uno; el pie dice hacia dónde queda «ahora» («▲ 4/7»); en el borde de la lista, la tecla pasa de página (§5). Al salir y volver, la lista vuelve a «ahora».',
  },
  {
    id: 'declaras-tu',
    titulo: 'Las reps las declaras tú (P11)',
    descripcion:
      'El ejemplo literal de P11, «5 × 100 kg · RIR 2 · 3-1-1», con la serie 3/5 en marcha. Nadie mide las reps (el conteo por movimiento es fase 2): el héroe es el crono y la dosis, una instrucción. BACK/LAP cierra; pasados los 5 s de deshacer, DOWN declara 4 reps y START las confirma: la carga (100 kg, «también en las series 4–5») y el RIR siguen en gris, sin confirmar. Lo que nadie dijo no se pinta como dicho.',
  },
  {
    id: 'entera-488',
    titulo: 'La sesión más larga · 488 entera (54 pasos)',
    descripcion:
      'Fuerza A + SkiErg: 54 pasos, 7 ejercicios, dos aproximaciones, un lastre, una pierna sola y un ergo. Empieza en el paso 1: BACK/LAP avanza paso a paso (con la anotación abierta, el primero la cierra); ↑ y ↓ pasan de página y, en Estructura, recorren la lista de ejercicios sin perder «ahora» (el pie dice «▲ 2/7»). El aro cuenta los 54 pasos. El examen recorre los 54 en los cuatro tamaños.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta): el plan y
  // el cuerpo tienen que ser los mismos objetos segundo a segundo.
  const [caso] = useState(() => casoGarminFuerza(escenario));
  return <VivoGarminFuerza caso={caso} onLog={onLog} />;
}
