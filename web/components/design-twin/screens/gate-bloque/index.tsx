'use client';

// La puerta del bloque — «empieza cuando estés listo». La ven las DOS
// poblaciones: es el único briefing del entreno libre (atleta 64, 9 de sus 11
// asignaciones son 1 bloque / 1 ítem) y la antesala de cada bloque de un plan
// del coach. Hoy reserva el mismo hueco de scroll para 1 ítem que para 16
// (`hoy.tsx`, espejo de BlockPreviewGate.swift); la propuesta hace que el
// sujeto escale con lo que sobra (`propuesta.tsx`).

import type { BloqueReal, ItemReal } from '../../datos-reales';
import { BACK_SQUAT, FARTLEK_16X500, HYROX, REMO_500 } from '../../datos-reales';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Hoy } from './hoy';
import { Propuesta } from './propuesta';

export const meta: TwinMeta = {
  id: 'gate-bloque',
  titulo: 'La puerta del bloque — «empieza cuando estés listo»',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-10',
  descripcion:
    'La pantalla que ven las dos poblaciones: es el único briefing del entreno libre y la antesala de cada bloque del plan. Hoy reserva el mismo hueco para 1 ítem que para 16.',
  fuentes: ['ios/FAHYBRIK/Workout/BlockPreviewGate.swift'],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'configurar',
    estrategia: 'previsualiza',
    sujeto: 'El entreno que vas a hacer ahora — nunca los campos.',
    // Los pt no se asertan: los mide el propio doble sobre el lienzo 1:1 del
    // iPhone 17 Pro (402×874). Cambia de escenario en «cómo está hoy» y el
    // número cambia con él — 475 con un ítem, 341 con cuatro, y ninguno con
    // los dieciséis de HYROX, que es el único caso para el que está diseñado.
    diagnostico:
      'El ScrollView de «Lo que viene» se lleva todo el alto sobrante tenga 1 fila o 16. Con 1 bloque / 1 ítem — 9 de las 11 asignaciones del atleta 64 — quedan 475 pt de nada y rebote encima, cada día; con los 4 del calentamiento, 341.',
    resuelve:
      'El sobrante se convierte en «Lo que viene»: el sujeto ESCALA con el hueco que hay. Con 1 ítem la dosis es el número grande de la pantalla, con 4 las filas respiran, y con 16 se cierran y aparece el scroll. Medido en el doble: cero pt muertos en los tres casos cortos, y scroll solo en HYROX.',
  },
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'minimo',
    titulo: 'Remo 500 m · atleta nuevo',
    descripcion: '1 bloque, 1 ítem, sin monitor y sin marcas previas. El caso de 9 de cada 11 asignaciones.',
  },
  {
    id: 'fuerza',
    titulo: 'Back Squat 4×5 @ 100 kg',
    descripcion: 'Sigue siendo un ítem, pero la prescripción trae series y descanso: el sobrante se paga con profundidad.',
  },
  {
    id: 'plan-corto',
    titulo: 'Calentamiento · bloque 1 de 3',
    descripcion: 'Cuatro ítems del plan del coach: ni sobra ni falta, y no debería scrollear.',
  },
  {
    id: 'hyrox',
    titulo: 'Simulación HYROX · bloque 2 de 3',
    descripcion: 'Dieciséis ítems: el único caso que desborda y el único que se gana el scroll.',
  },
  {
    id: 'fartlek',
    titulo: 'Fartlek 16 × 500 m en Z4',
    descripcion:
      'La carrera con estructura del 10-ago: un ítem que se cuenta por sus tramos («16 × 500 m») y dice cómo se hace el minuto de en medio, que se trota.',
  },
];

interface DatosBloque {
  titulo: string;
  formato?: string;
  blockNumber: number;
  blockCount: number;
  items: ItemReal[];
  /** Ítems de los bloques que van DESPUÉS de este — lo que anuncia el carril de la propuesta. */
  itemsRestantes: number;
}

function deBloque(sesion: { bloques: BloqueReal[] }, indice: number): DatosBloque {
  const bloque = sesion.bloques[indice];
  const itemsRestantes = sesion.bloques.slice(indice + 1).reduce((n, b) => n + b.items.length, 0);
  return {
    titulo: bloque.titulo,
    formato: bloque.formato,
    blockNumber: indice + 1,
    blockCount: sesion.bloques.length,
    items: bloque.items,
    itemsRestantes,
  };
}

function datosDeEscenario(id: string): DatosBloque {
  switch (id) {
    case 'fuerza':
      return deBloque(BACK_SQUAT, 0);
    case 'plan-corto':
      return deBloque(HYROX, 0); // Calentamiento
    case 'hyrox':
      return deBloque(HYROX, 1); // Simulación HYROX — el bloque de 16
    case 'fartlek':
      return deBloque(FARTLEK_16X500, 0);
    case 'minimo':
    default:
      return deBloque(REMO_500, 0);
  }
}

export function Screen({ escenario, vista, onLog }: TwinScreenProps) {
  const datos = datosDeEscenario(escenario);
  return <div className="twin-screen-safe">{vista === 'hoy' ? <Hoy {...datos} onLog={onLog} /> : <Propuesta {...datos} onLog={onLog} />}</div>;
}
