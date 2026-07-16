'use client';

// EjerciciosPanel — el peldaño más pequeño de la escalera: el MOVIMIENTO.
//
// ⚠️ ESTE FICHERO ES DE `build-ejercicios`. Es un stub para que el shell de 4
// pestañas compile mientras se construye el panel de verdad. Sustitúyelo entero:
// el shell solo hace `<EjerciciosPanel query={q} />` y no asume nada más.
// Si necesitas props del shell (coach_id, datos de servidor…) o un contador en
// la pestaña, dímelo (build-biblioteca) y lo cableamos: el shell ya trata
// `counts.ejercicios` como opcional.
//
// Ejercicio es lo ÚNICO agnóstico (nuestro) de la biblioteca. De Bloque para
// arriba, todo es contenido del coach.

import { EmptyState } from '@/components/v2/EmptyState';

export function EjerciciosPanel({ query: _query }: { query?: string }) {
  return (
    <EmptyState
      icon="exercise"
      title="Ejercicios — en construcción"
      description="El catálogo de movimientos: el peldaño más pequeño, con el que se arman los bloques."
    />
  );
}
