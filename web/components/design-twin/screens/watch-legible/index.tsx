'use client';

// LA MUÑECA, LEGIBLE — segunda vuelta del diseño del reloj (18-ago).
//
// La primera vuelta (`watch-vivo`, `kit-watch`, 3-ago) resolvió el ANCHO: el
// sujeto ya no se elige por número de glifos sino por lo que cabe, y ya está
// en producción. Esta pantalla ataca lo que esa vuelta dejó igual — el CROMO
// que corona las nueve vistas del reloj sigue a 9–11 pt, por debajo de los
// 16 pt que Apple recomienda por defecto en watchOS («si la persona está en
// movimiento», dice la guía, textualmente, como motivo para no bajar) — y
// suma cuatro piezas que hoy no existen en ningún sitio del proyecto: la
// página fija «Ahora / Después», terminar al alcance en modo espejo con
// confirmación de intención, y el bloqueo de pantalla por sudor y agua.
//
// Basado en `diseno-reloj.md` (la auditoría de las 17 vistas + Apple
// Entrenamiento, Strava, Runna, Garmin). Ver `modelo.ts` para las cifras
// exactas de cada tamaño y `atomos.tsx` para las piezas que las pintan.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Agua } from './agua';
import { AhoraDespues } from './ahora-despues';
import { AntesDespues } from './antes-despues';
import { Crono } from './crono';
import { Terminar } from './terminar';

export const meta: TwinMeta = {
  id: 'watch-legible',
  titulo: 'La muñeca, legible',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-19',
  descripcion:
    'Segunda vuelta del reloj: nada de cromo por debajo de 16 pt, más la corona, el bloqueo por agua, la página Ahora/Después y terminar al alcance en modo espejo.',
  fuentes: [],
  enApp:
    'El ancho del numeral ya vive en el reloj (`watch-vivo`, estado construida): el sujeto ya no se elige por número de glifos. Lo que sigue en pie es el cromo a 9–11 pt y las cuatro piezas que hoy no existen — Ahora/Después, terminar en modo espejo, bloqueo por agua, corona.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'antes-despues',
    titulo: 'Antes / después',
    descripcion:
      'El mismo instante de un For Time, con la escala de hoy y con la nueva: la banda de contexto a 11 pt frente a 16, y el cronómetro cayendo al suelo de 44 pt frente al ancho disponible. Desliza o toca la etiqueta para pasar de página.',
  },
  {
    id: 'crono',
    titulo: 'El cronómetro en marcha',
    descripcion:
      'Cruza el minuto 10 en vivo — de cuatro a cinco cifras. Hoy es un salto de tamaño en mitad del esfuerzo; con el ancho por delante, no lo es.',
  },
  {
    id: 'ahora-despues',
    titulo: 'Ahora / Después',
    descripcion: 'La página fija que hoy no existe: un sujeto (lo que viene) y un segundo nivel (dónde estás), igual en las nueve familias.',
  },
  {
    id: 'terminar',
    titulo: 'Terminar, al alcance',
    descripcion:
      'Solo aparece si se pierde el teléfono. Guardar y descartar nunca van pegados, y descartar pide una segunda confirmación.',
  },
  {
    id: 'agua',
    titulo: 'Bloqueo por sudor y agua',
    descripcion: 'El lienzo ignora el toque a propósito. Se sale girando la corona — arrastra el disco de la derecha.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  switch (escenario) {
    case 'crono':
      return <Crono onLog={onLog} />;
    case 'ahora-despues':
      return <AhoraDespues onLog={onLog} />;
    case 'terminar':
      return <Terminar onLog={onLog} />;
    case 'agua':
      return <Agua onLog={onLog} />;
    default:
      return <AntesDespues onLog={onLog} />;
  }
}
