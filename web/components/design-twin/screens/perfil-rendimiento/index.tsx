'use client';

// Perfil · Rendimiento — PROPUESTA de composición (§6 del docs/CONTRATO-UI.md).
//
// El hallazgo: la sección «Rendimiento» son cinco filas que son puertas con la
// etiqueta de lo que hay dentro («Tus 1RM por levantamiento · sentadilla, peso
// muerto, press…» en gris). Los datos existen y están cargados. Es la pantalla
// que existe para enseñar las cifras del atleta y no enseña ninguna.
//
// Arquetipo: **Lista** · estrategia **llena** (aquí el alto no sobra: el
// contenido real pasa de 1800 pt). Lo que falla no es la altura, es el §4.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { PerfilHoy } from './antes';
import { PerfilPropuesta } from './propuesta';
import { ESTADOS, NUEVO } from './data';

export const meta: TwinMeta = {
  id: 'perfil-rendimiento',
  titulo: 'Perfil — las filas llevan su dato',
  zona: 'Perfil y ajustes',
  estado: 'propuesta',
  descripcion:
    'La sección «Rendimiento» deja de ser cinco puertas grises y pasa a ser una lista donde cada fila lleva su cifra. Compara «HOY» con la propuesta en el mismo atleta.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'hoy-nuevo',
    titulo: 'HOY · recién dado de alta',
    descripcion:
      'Lo que ve el primer día: cinco puertas con subtítulo gris, ninguna cifra, y arriba cuatro filas con etiqueta y valor al mismo tamaño (13/13).',
  },
  {
    id: 'nuevo',
    titulo: 'Propuesta · recién dado de alta',
    descripcion:
      'Los dos contadores se pintan en cero (0 de 4 · 0 de 12) y las tres filas medidas llevan invitación en vez de descripción.',
  },
  {
    id: 'hoy-alex',
    titulo: 'HOY · con los datos cargados',
    descripcion:
      'El caso sangrante: el atleta 64 tiene 1RM y VO₂ en la base, y la pantalla sigue enseñando los mismos cinco subtítulos grises.',
  },
  {
    id: 'alex',
    titulo: 'Propuesta · con los datos cargados',
    descripcion:
      'Datos reales del atleta 64: 245 kg, 42,4 de VO₂, 2 de 12 marcas — y zonas SIN ancla, que se declara en vez de inventarse.',
  },
  {
    id: 'veterano',
    titulo: 'Propuesta · un año dentro',
    descripcion: 'Las cinco filas con cifra: 4 de 4 tests, umbral 163 ppm, 250 kg, 9 de 12 marcas, VO₂ 52,8.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const hoy = escenario.startsWith('hoy-');
  const atleta = ESTADOS[hoy ? escenario.slice(4) : escenario] ?? NUEVO;

  return (
    <div className="twin-screen-safe">
      {hoy ? <PerfilHoy atleta={atleta} /> : <PerfilPropuesta atleta={atleta} onLog={onLog} />}
    </div>
  );
}
