'use client';

// Informe de UNA ocurrencia de salto. Propuesta que el Swift ya pinta
// (JumpReportView) y el panel del coach (CmjInforme). El motor es el real:
// buildCmjReport. Aquí solo se viste.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { buildCmjReport } from '@fahybrid/shared/domain/test-report/cmj';
import { InformePantalla } from './pantalla';

export const meta: TwinMeta = {
  id: 'test-informe',
  titulo: 'Informe del test — la ocurrencia, no el último número',
  zona: 'Marcas y tests',
  estado: 'construida',
  actualizado: '2026-08-13',
  descripcion:
    'El resultado deja de ser tres cifras en un diálogo: es una ficha con explosivo, respuesta a la carga, LRI, lectura e intentos. La misma para atleta y coach.',
  fuentes: [
    'ios/FAHYBRIK/Jump/JumpReportView.swift',
    'web/components/v2/atleta-detalle/tests/CmjInforme.tsx',
    'shared/domain/test-report/cmj.ts',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'detalle',
    estrategia: 'llena',
    sujeto: 'Los 47 cm y el LRI 0,85, con su lectura debajo.',
    diagnostico:
      'Al tocar un CMJ hecho salía un diálogo de tres cajas. El coach no podía enseñarle al atleta «qué pasó».',
    resuelve:
      'Una pantalla de ocurrencia: bandas, caída, LRI, lectura compuesta, peso e intentos. Cero texto libre.',
  },
};

const COMPLETO = buildCmjReport({
  title: 'Perfil de salto',
  date_label: '2026-08-13',
  unloaded_cm: 47.33,
  loaded_cm: 39.38,
  load_kg: 15,
  body_mass_kg: 76,
  attempts: [
    { kind: 'cmj', height_cm: 46.1, kept: false, quality: 'ok' },
    { kind: 'cmj', height_cm: 47.33, kept: true, quality: 'ok' },
    { kind: 'loaded_cmj', height_cm: 39.38, kept: true, quality: 'ok' },
  ],
});

const SOLO = buildCmjReport({
  title: 'Perfil de salto',
  date_label: '2026-07-02',
  unloaded_cm: 34.2,
});

export const escenarios: TwinEscenario[] = [
  {
    id: 'completo',
    titulo: 'CMJ + carga · el informe que originó la pieza',
    descripcion: '47 cm / 39 cm / +15 kg / 76 kg / LRI 0,85. Lectura: explosiva muy alta, respuesta correcta.',
  },
  {
    id: 'sin-carga',
    titulo: 'Solo CMJ · no se inventa el LRI',
    descripcion: 'Sin serie cargada: no hay bloque de carga ni LRI. La explosiva se enseña igual.',
  },
];

export function Screen({ escenario }: TwinScreenProps) {
  const report = escenario === 'sin-carga' ? SOLO : COMPLETO;
  return (
    <div className="twin-screen-safe">
      <InformePantalla report={report} />
    </div>
  );
}
