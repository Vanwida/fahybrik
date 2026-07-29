'use client';

// Analíticas — PROPUESTA de composición (§6 del docs/CONTRATO-UI.md).
//
// Hoy la pantalla se llena de N tarjetas que dicen cada una que no hay datos:
// llena de forma, vacía de fondo, y ninguna con salida. El selector de periodo
// hace de sujeto de una sección que no tiene nada que decir.
//
// Arquetipo: **Detalle** cuando hay veredicto (`llena`, con el contexto que da
// sentido a la cifra) y **Vacío** cuando la sección no tiene nada (`centra`,
// con salida). Las secciones se cambian en la cabecera; el periodo baja al
// tamaño que le toca.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { AnaliticasHoy } from './antes';
import { AnaliticasPropuesta } from './propuesta';
import { ESTADOS, NUEVO } from './data';

export const meta: TwinMeta = {
  id: 'analiticas-veredicto',
  titulo: 'Analíticas — un veredicto, no diez tarjetas',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  descripcion:
    'El sujeto pasa a ser el veredicto de la sección — una cifra a tres metros —, las tarjetas llenan por debajo, y una sección sin nada es UN estado centrado con salida.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'hoy-nuevo',
    titulo: 'HOY · recién dado de alta',
    descripcion:
      'La sección de Fuerza vacía: cuatro tarjetas grises repitiendo «Aún no hay datos», sin una sola salida. La franja mide lo que sobra.',
  },
  {
    id: 'nuevo',
    titulo: 'Propuesta · recién dado de alta',
    descripcion:
      'Las cuatro tarjetas se convierten en UN estado centrado que dice por qué está vacío y qué lo llena. Una sección, un mensaje.',
  },
  {
    id: 'alex',
    titulo: 'Propuesta · lo que hoy se puede decir',
    descripcion:
      'Datos reales del atleta 64. Recuperación con veredicto (88, «listo para apretar»); HYROX con el límite declarado (en dobles las estaciones no son suyas); Carrera y Ergo vacías, con el porqué escrito. Cambia de sección en la cabecera.',
  },
  {
    id: 'veterano',
    titulo: 'Propuesta · un año dentro',
    descripcion: 'Las cinco secciones con veredicto, y una en aviso: 74 de recuperación con 6:48 de sueño.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  if (escenario === 'hoy-nuevo') {
    return (
      <div className="twin-screen-safe">
        <AnaliticasHoy />
      </div>
    );
  }
  const e = ESTADOS[escenario] ?? NUEVO;
  return (
    <div className="twin-screen-safe">
      <AnaliticasPropuesta key={e.id} e={e} onLog={onLog} />
    </div>
  );
}
