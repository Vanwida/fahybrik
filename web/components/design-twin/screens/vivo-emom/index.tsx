'use client';

// El minuto manda — el EMOM y el interval en vivo.
//
// La tesis, en una frase: **en un EMOM manda el reloj**. Acaba el minuto, acaba
// la ronda; no hay nada que detectar, ni botón para adelantarla. Y lo que te
// sobra del minuto ES tu descanso, así que el sujeto de la pantalla no es la
// tarea: es EL MINUTO, y su color dice en qué punto de él estás.
//
// El listón es el mejor cronómetro de box que exista, y encima registra y lee
// las máquinas. Por eso el número se lee a tres metros con el móvil en el suelo
// y el color se lee sin mirar; y por eso el contador solo sube solo cuando hay
// una máquina que lo esté contando de verdad (CONTRATO-UI §7).
//
// Los tres escenarios recorren el modelo entero, no tres casos sueltos: la
// tarea la cuenta LA MÁQUINA (a), no la cuenta NADIE (b) o la cuenta EL RELOJ
// porque la tarea es tiempo (c). Y el ciclo, o es llano (a, b) o lleva
// transición explícita (c). Cualquier EMOM real cae en alguna casilla de ese
// cruce, incluido uno mixto que aún no existe en la base.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { GUIONES, ALTERNO_MAQUINAS } from './data';
import { EmomVivo } from './escenas';

export const meta: TwinMeta = {
  id: 'vivo-emom',
  titulo: 'El minuto manda — EMOM e intervalos en vivo',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'El reloj gobierna: acaba el minuto, acaba la ronda. El minuto es el ambiente de la pantalla (faena, tuyo, se acaba) y la tarea se cuenta sola solo si hay una máquina contándola. Gira el marco: el tramo decide la cara, y el formato nunca suelta su franja.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'alterno-maquinas',
    titulo: 'EMOM 12 · esquí y bici',
    descripcion:
      'Ronda 4 de 12 con los monitores puestos: las calorías suben solas, cumples a los 0:41 y el resto del minuto se vuelve verde y tuyo; a los 0:50 se anuncia el esquí. Gíralo y sale la cara de la máquina, con el minuto y los avisos por encima.',
  },
  {
    id: 'a-pulso',
    titulo: 'EMOM 10 · 10 burpees',
    descripcion:
      'Nadie puede contar burpees. El minuto drena igual y el toque de «hecho» solo sella tu tiempo; si el minuto acaba sin toque, la ronda pasa y no se inventa nada. Girado no aparece ninguna máquina: aquí no hay nada que medir.',
  },
  {
    id: 'interval-45-15',
    titulo: 'Interval 45/15 · ronda 6 de 10',
    descripcion:
      'El mismo motor con transición explícita: trabajo y cambio son estados opuestos, y el aviso de PARAR pesa tanto como el de empezar. Tabata es esto con otros números. Girado, el reloj se queda con todo el ancho.',
  },
];

export function Screen({ escenario, orientation, onLog }: TwinScreenProps) {
  const guion = GUIONES[escenario] ?? ALTERNO_MAQUINAS;
  // `EmomVivo` recibe la orientación como dato y NO se remonta al girar: el
  // reloj, las rondas y lo que hayas sellado siguen donde estaban.
  return (
    <div className="twin-screen-safe">
      <EmomVivo guion={guion} landscape={orientation === 'landscape'} onLog={onLog} />
    </div>
  );
}
