'use client';

// IPHONE · FUERZA — propuesta del rediseño del vivo del iPhone (28-09), la
// familia de fuerza sobre `kit-iphone-vivo` y el dominio de `kit-reloj`.
// Modelo: docs/vivo-iphone/modelo.md (I4 fuerza, I5, I7, §4 fuerza).
//
// La pregunta de la familia es «¿qué levanto ahora y cuánto?» y el héroe la
// responde: «8 × 125 kg» con el %RM o el RIR encima. El ejercicio va delante
// en la cabecera (A1/A2 en superserie) con la serie de ESE ejercicio. Se
// anota en el propio descanso (Hevy/Strong): reps · kg · RIR prerrellenados,
// que no cuentan hasta confirmarlos; la carga declarada pasa en cascada a las
// series con la misma prescripción. La última serie lleva al siguiente
// ejercicio, nunca a un atasco. Un libre y uno del coach se ven igual.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoDe } from './casos';
import { VivoFuerzaIphone } from './vivo';

export const meta: TwinMeta = {
  id: 'iphone-vivo-fuerza',
  titulo: 'iPhone · fuerza',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-28',
  descripcion:
    'El ejercicio delante y la dosis con sus dos ejes («8 × 125 kg» con el %RM o el RIR encima); se anota en el propio descanso con ± grandes y lo propuesto no cuenta hasta confirmarlo; la carga pasa en cascada; la última serie lleva al siguiente ejercicio. Un libre se ve igual.',
  fuentes: [],
  enApp:
    'Hoy el vivo de fuerza del iPhone (LiveStrengthView, tanda del 29-jul) enseña «5 × 100 kg» con el nombre debajo, una fila de chips S1–S4 que se trunca a ocho series («8 ×…»), «Saltar descanso» como acción del descanso y sin ninguna forma de anotar lo hecho; la superserie sale como «Press banca · Remo con barra · Serie 1 de 8». Esto lo sustituye entero: la anatomía del kit del iPhone sobre el mismo estado que la muñeca (`kit-reloj`), con la anotación en el descanso.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'rectas',
    titulo: 'Series rectas con RIR · 5 × 5 · 100 kg · RIR 2 (P11)',
    descripcion:
      'El ejemplo literal del modelo, contado por ti. Cabecera «Back Squat · Serie 3/5»; el héroe «5 × 100 kg» con «RIR 2» encima; la rejilla: serie, tempo 3-1-1, pulso y la última serie anotada («5 × 100 kg · RIR 2»); «Luego · Descanso · 2′ · después Back Squat · 5 × 100 kg». A los 3 s «Serie hecha»: el descanso anota 5 reps · 100 kg · RIR 2 (gris, sin confirmar); a los 5,5 s se toca el RIR y baja a 1 (declarado, en tinta); a los 8 s Confirmar → «✓ 5 × 100 kg · RIR 1» y la primaria vuelve a «Empezar ya».',
  },
  {
    id: 'superserie',
    titulo: 'Superserie A1 → A2 · Back Squat + Box Jump (529)',
    descripcion:
      'Sesión 529, bloque A. Cabecera «A1 · Back Squat · Serie 1/4»: el hueco de la superserie y la serie de ESE ejercicio, no una «Serie 1 de 8» de los dos juntos. El héroe «8 × 125 kg» con «65–70 % RM» encima; la rejilla: serie, carga del plan 121–131 kg (la banda que el % resuelve), pulso; «Luego · A2 · Box Jump · 6 reps». A los 4,2 s «Serie hecha»: A2 entra SIN descanso (GO) y abajo «A1 · serie 1 hecha · Deshacer» 5 s.',
  },
  {
    id: 'piramide',
    titulo: 'Pirámide 6-6-4-4-3 @75–85 % RM · la carga en cascada (392)',
    descripcion:
      'Bloque 392 «Fuerza inferior pesada»: cada serie tiene SU medida y la carga es una banda. Serie 2/5 con la 1 declarada a 140 kg: el héroe «6 × 140 kg» (la barra, no el centro de la banda) con «75–85 % RM» encima; la rejilla: serie, carga del plan 140–159 kg, pulso, última serie «6 × 140 kg»; «Luego · … · después Back Squat · 4 × 140 kg». A los 2,5 s «Serie hecha»; en el descanso la carga sube dos clics a 145: «Viene: Back Squat · 4 × 145 kg» (la cascada, visible antes de confirmar). Confirmar a los 9 s.',
  },
  {
    id: 'anotar',
    titulo: 'Anotar en el descanso · propuesto → declarado → confirmado (529)',
    descripcion:
      'Descanso de 2′ tras la ronda A1 → A2. Una tarjeta por serie con los datos como píldoras: A1 8 reps · 125 kg y A2 6 reps, en gris y «sin confirmar» (propuesto: sale del plan). Se toca la carga (borde naranja: es el dato que mueven los ±) y sube dos clics a 130 kg (declarado, en tinta). A los 6 s Confirmar: todo pasa a «✓», la primaria vuelve a «Empezar ya». Lo prerrellenado nunca cuenta hasta confirmarlo.',
  },
  {
    id: 'ultima',
    titulo: 'Última serie → siguiente ejercicio, sin atasco (529)',
    descripcion:
      'A2 Box Jump serie 4/4, la última del bloque A: «Luego · Descanso · 2′ · después B1 · Deadlift · 8 × 140 kg». Serie hecha a los 2 s: el descanso anota la ronda 4 y «Viene: B1 · Deadlift · 8 × 140 kg» (carga tuya, la última vez). Confirmar a los 9 s, Empezar ya a los 12,5 s: 3-2-1, GO y B1 Deadlift serie 1/4 con «8 × 140 kg» y «RIR 3». Nunca «Sesión terminada» a mitad ni una pantalla vacía.',
  },
  {
    id: 'plancha',
    titulo: 'Ejercicio corporal por tiempo · Side Plank 3 × 20″ (538)',
    descripcion:
      'Sesión 538, Side Plank serie 2/3. No hay carga ni reps: el héroe es lo que queda («quedan 0:14») y la cabecera lleva la dosis («Side Plank · Serie 2/3 · 20″»); la rejilla, serie y pulso; sin banda (no hay objetivo que juzgar). Se cierra sola a los 20″; «Luego · Colócate 5″ · después Serie 3/3 · Side Plank · 20″»: el colócate con su 3-2-1 del kit y la serie 3. No hay nada que anotar: lo midió el reloj.',
  },
  {
    id: 'libre',
    titulo: 'Libre · Back Squat 4 × 10, carga tuya',
    descripcion:
      'Un entreno que escribe el atleta: Back Squat 4 × 10 (la última vez, 80 kg) r 90″ y Press militar 3 × 8. Serie 2/4 con la 1 declarada a 80 kg: cabecera «Back Squat · Serie 2/4», héroe «10 × 80 kg» con «carga tuya» encima, rejilla con serie, pulso y última serie, «Luego · Descanso · 90″ · después Back Squat · 10 × 80 kg». La misma pantalla, la misma anotación, el mismo Confirmar: nada en el vivo sabe que no lo escribió el coach.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta): el plan
  // y el cuerpo tienen que ser los mismos objetos segundo a segundo.
  const [caso] = useState(() => casoDe(escenario));
  return <VivoFuerzaIphone caso={caso} onLog={onLog} />;
}
