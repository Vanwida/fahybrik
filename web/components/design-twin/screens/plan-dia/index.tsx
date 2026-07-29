'use client';

// EL DÍA DEL PLAN — «¿qué hay ese día, en qué orden y con qué dosis?»
//
// La tercera distancia del mismo objeto (`plan/modelo.ts`): el ciclo dice hacia
// dónde vas, la semana qué llevas, y esta pantalla ordena UN día.
//
// ---------------------------------------------------------------------------
// LA FRONTERA CON `sesion-previa`
// ---------------------------------------------------------------------------
//
//   · `sesion-previa` es la ficha inmediatamente ANTERIOR a entrenar, y su
//     sujeto es UNA sesión: el porqué del coach, el material, un vídeo por
//     ejercicio, tu última vez y «Empezar».
//   · El sujeto de aquí es EL DÍA, que no es lo mismo, y el dato lo demuestra:
//     el martes 28 del atleta 64 tiene CINCO trabajos y el miércoles 15 del 67
//     tiene dos.
//
// Por eso cada trabajo se enseña con sus bloques PLEGADOS A UNA LÍNEA —título,
// cuántos ejercicios y las cifras de dosis que ese bloque sí tenga— y nunca con
// la lista de ejercicios ni con vídeos. Tocar un trabajo abre su ficha, que es
// de quien es ese detalle. Esta pantalla ORDENA el día; la suya PREPARA la sesión.
//
// ---------------------------------------------------------------------------
// COMPOSICIÓN (§6.2, arquetipo Detalle): `llena` con contexto
// ---------------------------------------------------------------------------
//
// El sobrante entra EN LAS FILAS: los bloques de trabajo crecen y sus cifras se
// reparten dentro (en filas cuando son pocas, en una parrilla repartida cuando
// son muchas). Cuando el día no tiene ni una cifra que repartir —pasa de verdad:
// el circuito de pierna y el Metcon llegan sin dosis— degrada a `centra` en vez
// de dejar cola muerta. Y el día sin nada es un Vacío con su salida obligatoria.
//
// Toda cifra pasa por `<Numeral>` o `<Duracion>` (§10.2) y toda grafía de dosis
// por `dosisConSeries()` (§2.1): esta pantalla no escribe ni un `2×10` propio.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Pantalla } from './pantalla';

export const meta: TwinMeta = {
  id: 'plan-dia',
  titulo: 'El día del plan',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  descripcion:
    'Qué hay ese día, en qué orden y con qué dosis. Cada trabajo con sus bloques plegados a una línea; el detalle de una sesión vive en su ficha.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'alta-nueva',
    titulo: 'Recién dado de alta · sin plan',
    descripcion: 'El caso mínimo (§6.3): el atleta 68 no tiene ni una asignación. Vacío centrado y con salida.',
  },
  {
    id: 'descanso',
    titulo: 'Sábado 18 · nada en el plan',
    descripcion: 'El día vacío DENTRO de un plan publicado: no se fabrica sesión, se dice qué hay antes y después.',
  },
  {
    id: 'coach',
    titulo: 'Jueves 16 · Rodaje Z2',
    descripcion: 'El caso típico: hoy, un trabajo pendiente, 3 bloques y 11 ejercicios. Las cifras se reparten el alto.',
  },
  {
    id: 'sin-dosis',
    titulo: 'Miércoles 15 · dos trabajos con huecos',
    descripcion: 'Circuito de pierna y Metcon: sus bloques de trabajo llegan sin dosis. Se declara, no se inventa.',
  },
  {
    id: 'dia-lleno',
    titulo: 'Viernes 17 · Simulación HYROX',
    descripcion: '23 movimientos con 16 estaciones seguidas. Sin duración prevista: es For Time, la duración ES el resultado.',
  },
  {
    id: 'libre',
    titulo: 'Martes 28 · cinco trabajos',
    descripcion: 'Un test del coach pendiente y cuatro entrenos suyos ya hechos. La prueba de que esto no es una ficha de sesión.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <Pantalla escenario={escenario} onLog={onLog} />
    </div>
  );
}
