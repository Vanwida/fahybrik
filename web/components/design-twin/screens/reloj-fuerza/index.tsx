'use client';

// MUÑECA · FUERZA, REHECHA — propuesta del rediseño de la muñeca (25-09).
// Modelo: docs/reloj-muneca/modelo.md (P11, P8, P4, P5). Kit: `kit-reloj/`.
//
// La serie de fuerza con el EJERCICIO primero (A1/A2 en superserie), la
// serie k/K y la dosis con sus dos ejes (carga y esfuerzo, y el tempo si lo
// hay). Se cierra con doble toque, botón Acción o el botón acotado «Serie
// hecha», con 5 s para deshacer. El descanso es el común (P8) y es donde se
// ANOTA la serie: reps, carga en cascada y RIR/RPE con la corona, y lo
// propuesto no cuenta como declarado hasta confirmarlo. La última serie de un
// ejercicio lleva al siguiente, nunca a un atasco. La corona recorre Serie →
// Ejercicios → Datos.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoDe } from './casos';
import { VivoFuerza } from './vivo';

export const meta: TwinMeta = {
  id: 'reloj-fuerza',
  titulo: 'Muñeca · fuerza, rehecha',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'El ejercicio primero y la dosis con sus dos ejes; se anota en el propio descanso con la corona (lo propuesto no cuenta hasta confirmarlo), y la última serie lleva al siguiente ejercicio.',
  fuentes: [],
  enApp:
    'Hoy la muñeca enseña «Serie 2/5» sin el nombre del ejercicio ni el %RM, no deja anotar nada salvo la carga con la corona, y tras la última serie el atleta se queda atascado; esto lo sustituye entero.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'superserie',
    titulo: 'Superserie A1 → A2 sin descanso (529)',
    descripcion:
      'Sesión 529, bloque A. A1 Back Squat, serie 1/4: el nombre primero, 8 reps y la carga con sus dos ejes (121–131 kg · 65–70 % RM), el cue del coach y «Luego · A2 Box Jump». A los 4 s, doble toque: A2 entra SIN descanso (GO, .start×2 y la voz con el nombre) y abajo queda «A1 · serie 1 hecha» con Deshacer 5 s.',
  },
  {
    id: 'ronda',
    titulo: 'El descanso tras A2 · se anota la ronda (529)',
    descripcion:
      'Descanso de 2′ tras A2, quedan 25 s. Manda anotar: la cuenta atrás sube a la línea de arriba, «Ronda 1 · sin confirmar», A1 8 × 125 kg y A2 6 reps en gris (propuesto). A los 3 s, doble toque = Confirmar: pasan a blanco, vuelve la cuenta atrás de héroe y el botón es «Empezar ya». Al final, preaviso, 3-2-1 con el nombre y GO a A1 serie 2 con los 125 kg declarados.',
  },
  {
    id: 'ultima',
    titulo: 'Última serie → Viene: Deadlift (529)',
    descripcion:
      'A2 serie 4/4, la última del bloque A: «Luego · B1 · Deadlift». Doble toque a los 2 s: bloque hecho (.success) y el descanso con la ronda 4 por anotar y «Viene: B1 · Deadlift · 4 × 8 · RIR 3». Confirmar a los 9 s, Empezar ya a los 12,5 s: GO a B1 Deadlift serie 1/4, carga tuya (la última vez, 140 kg) y RIR 3. Nunca un atasco.',
  },
  {
    id: 'aproximacion',
    titulo: 'Aproximación y el % resuelto en kg (488)',
    descripcion:
      'Sesión 488, Back Squat 4 × 6 @RPE 6,5 con la nota «@72 % 1RM» hecha dato. «Aproximación 2/2 · 3 × 100 kg» (las dos de aproximación son ilustrativas: 488 no las escribe) no se anota. Su descanso anuncia «Serie 1/4 · 6 × 134 kg · RPE 6,5»; Empezar ya y la serie 1 enseña «134 kg · 72 % RM» y «RPE 6,5».',
  },
  {
    id: 'anotar',
    titulo: 'Anotar de cerca · propuesto frente a declarado (488)',
    descripcion:
      'Descanso tras la serie 2 de Back Squat: reps 6 · 135 kg (arrastrados de la serie 1) · RPE 6,5, en gris y «sin confirmar». Se toca reps (se enciende en naranja) y la corona baja a 5: blanco, declarado; se toca RPE y sube a 7. La carga sigue gris: nadie la ha dicho. Doble toque = Confirmar: todo declarado y «✓ 5 × 135 kg · RPE 7».',
  },
  {
    id: 'cascada',
    titulo: 'La carga en cascada · Deadlift 4 × 4 @RPE 7,5 (492)',
    descripcion:
      'Sesión 492, «@78 % 1RM» (RM de 200 kg ilustrativa): se propone 155 kg. Se enciende la carga y la corona sube a 160: «también en las series 2–4». Confirmar: «Viene: Serie 2/4 · 4 × 160 kg». Luego la corona baja a Ejercicios: la serie 1 declarada y la 2, 3 y 4 ya con 160 kg.',
  },
  {
    id: 'isometria',
    titulo: 'Isometría de 20″ en la superserie de core (538)',
    descripcion:
      'Sesión 538, superserie de core, ronda 2. Tras A1 Plank, «Colócate» 5 s con A2 Isometría en puente de glúteo, 3-2-1 del kit y GO; la isometría es un paso por TIEMPO que cuenta hacia atrás (quedan 0:20) y se cierra sola. Sigue A3 Push-up · 10 sin descanso (.start×2 + voz).',
  },
  {
    id: 'deshacer',
    titulo: 'Deshacer un doble toque sin querer (529)',
    descripcion:
      'A1 Back Squat serie 3/4, a los 4 s de empezar. A los 1,5 s, un doble toque sin querer cierra la serie y entra A2. Abajo, «A1 · serie 3 hecha» con Deshacer durante 5 s: púlsalo y vuelves a A1 serie 3 con el tiempo corriendo (el tiempo no se deshace).',
  },
  {
    id: 'sensor',
    titulo: 'Las reps las cuenta el reloj · el ejemplo del modelo (P11)',
    descripcion:
      'El ejemplo literal de P11, «5 × 100 kg · RIR 2 · 3-1-1», con el sensor contando: «cuenta el reloj» y el héroe 0 → 5 a una rep por ciclo del tempo. Al cerrar (29,5 s), las reps salen en blanco con «reloj» (medidas, no propuestas) y la velocidad media con su confianza —nunca una RM—; carga y RIR, propuestos.',
  },
  {
    id: 'ejercicios',
    titulo: 'La corona · Ejercicios y Datos (529)',
    descripcion:
      'B1 Deadlift serie 2/4. Página 2, Ejercicios: A1 y A2 hechos (4/4), el bloque B abierto serie a serie (✓ declarada, anillo = sin confirmar, «ahora», lo que viene con su carga) y lo que falta con su dosis. A los 3,5 s la corona baja a Datos: tiempo, series, volumen y pulso.',
  },
  {
    id: 'sin-gesto',
    titulo: 'Sin doble toque · el botón «Serie hecha»',
    descripcion:
      'La serie de A1 en un reloj sin doble toque ni botón Acción: la acción es un botón visible de 44 pt, «Serie hecha», con el mismo deshacer de 5 s. «Luego ·» cede su sitio al botón (está en el descanso y en Ejercicios). Un toque fuera del botón no cierra nada; dos seguidos en la pantalla sí, como en Apple Entreno.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta): el plan
  // y el cuerpo tienen que ser los mismos objetos segundo a segundo.
  const [caso] = useState(() => casoDe(escenario));
  return <VivoFuerza caso={caso} onLog={onLog} />;
}
