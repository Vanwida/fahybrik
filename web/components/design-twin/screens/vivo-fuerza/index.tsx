'use client';

// EL HIERRO EN VIVO — la serie que tienes delante.
//
// La diferencia con correr o con un ergómetro no es estética: es de mando. Ahí
// el aparato mide y la app cuenta; aquí la app no puede medir NADA. Ni una
// repetición, ni un kilo, ni el RIR. Gobierna el atleta, y el reloj solo entra
// cuando sueltas la barra.
//
// De eso salen las cuatro reglas de esta familia:
//   1. El sujeto es LA SERIE (`reps × carga`), no el ejercicio ni el cronómetro.
//   2. Un solo botón, del tamaño del pulgar: «serie hecha». Lo dice el atleta.
//   3. Nada pasa de prescrito a hecho sin que él lo diga, y decirlo cuesta un
//      toque (§7). Lo que sintió se pregunta; no se copia del plan.
//   4. El descanso es dosis, así que tiene pantalla propia y se tiñe de calma.
//
// Los cuatro escenarios recorren la MISMA máquina por puntos de entrada
// distintos (ver `maquina.tsx`), incluido el caso real que rompe el modelo del
// coach: cuatro series con carga y sin repeticiones.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { MaquinaCircuito, MaquinaFuerza } from './maquina';

export const meta: TwinMeta = {
  id: 'vivo-fuerza',
  titulo: 'El hierro en vivo — la serie que tienes delante',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'En fuerza gobierna el atleta: la app no mide ni una repetición. Su trabajo es que sepas qué toca sin pensarlo, recoger lo que hiciste en un toque y contar el descanso, que también es dosis.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'serie',
    titulo: 'Back Squat · serie 2 de 4',
    descripcion:
      'El caso real (4×5 @ 100 kg): el sujeto es la serie, con los discos que hay que poner y lo que hiciste la semana pasada.',
  },
  {
    id: 'registro',
    titulo: 'Acabas la serie',
    descripcion:
      'Lo prescrito se confirma de un toque; ajustar reps o kilos es la excepción. El RIR que sentiste se pregunta y se puede no contestar.',
  },
  {
    id: 'descanso',
    titulo: 'Descanso de 1:30',
    descripcion:
      'La única parte que gobierna la app. Cuenta atrás, el pulso bajando con su zona, y el naranja aparece solo cuando te toca.',
  },
  {
    id: 'hueco-honesto',
    titulo: 'Circuito de pierna · sin repeticiones',
    descripcion:
      'El caso real del plan del coach: cuatro series a 30 kg y ninguna repetición escrita. La pantalla no se la inventa y el registro pregunta.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      {escenario === 'hueco-honesto' ? (
        <MaquinaCircuito onLog={onLog} />
      ) : (
        <MaquinaFuerza entrada={escenario === 'registro' ? 'registro' : escenario === 'descanso' ? 'descanso' : 'serie'} onLog={onLog} />
      )}
    </div>
  );
}
