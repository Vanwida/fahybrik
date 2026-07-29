'use client';

// Post-entreno — el registro que se va a guardar al acabar. PROPUESTA
// (docs/CONTRATO-UI.md §6.2, arquetipo «configurar»): el doble aún no tiene
// espejo de PostWorkoutSummaryView.swift, así que esta pantalla nace con
// `composicion` — el panel ofrece el conmutador «hoy / propuesta» (types.ts,
// TwinComposicion) para que el antes y el después se enseñen juntos.
//
// Los tres escenarios son los tres repartos reales de la base a 29-jul-2026
// (datos-reales.ts): el caso SIN pulsómetro y sin zonas (la norma: ~309 pt
// muertos en libre), el caso CON pulsómetro pero sin zonas (el reparto real
// del plan de coach, 181/206 con FC), y el único caso CON zonas de toda la
// base (9 de 206 segment_executions, y cubren el 84% de la sesión, no el
// 100% que hoy enseña la barra).

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { BACK_SQUAT, CIRCUITO_PIERNA, MEDIDO_CIRCUITO, MEDIDO_REMO, MEDIDO_SQUAT, REMO_500, type MedidoReal, type SesionReal } from '../../datos-reales';
import { Hoy } from './hoy';
import { Propuesta } from './propuesta';

export const meta: TwinMeta = {
  id: 'post-entreno',
  titulo: 'Al acabar — el registro que se va a guardar',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'El sujeto no son los campos: es el registro. Se guarda sin tocar nada, y lo que no se midió no se pinta — las zonas casi nunca están.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'configurar',
    estrategia: 'previsualiza',
    sujeto: 'El registro que se va a guardar — nunca los campos.',
    diagnostico:
      'La configuración CORTA es la normal: las zonas solo existen en 9 de 206 segmentos de toda la base, y 8 son del mismo atleta. Sin zonas y sin pulsómetro quedan ~160 pt muertos con plan de coach y ~309 en entreno libre.',
    resuelve:
      'El registro se pinta entero arriba y CRECE con el sobrante: la duración manda, debajo el trabajo por bloques y lo que se midió de verdad. Lo que sigue abierto — esfuerzo, cómo ha ido, notas — se pliega a una fila cada uno, y GUARDAR sigue funcionando sin tocar nada.',
  },
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'minimo',
    titulo: 'Remo 500 m · sin pulsómetro',
    descripcion: 'Treinta y siete segundos, sin FC, sin zonas y el esfuerzo sin decir. El caso de ~309 pt muertos.',
  },
  {
    id: 'coach',
    titulo: 'Circuito de pierna · 52:00',
    descripcion: 'FC medida pero sin zonas: el reparto real de la base (181 de 206 con FC, 9 con zonas).',
  },
  {
    id: 'con-zonas',
    titulo: 'Back Squat · el caso raro',
    descripcion: 'Una de las 9 filas con zonas de toda la base. Y cubren 482 s de 572: eso se dice.',
  },
];

const CASOS: Record<string, { sesion: SesionReal; medido: MedidoReal }> = {
  minimo: { sesion: REMO_500, medido: MEDIDO_REMO },
  coach: { sesion: CIRCUITO_PIERNA, medido: MEDIDO_CIRCUITO },
  'con-zonas': { sesion: BACK_SQUAT, medido: MEDIDO_SQUAT },
};

export function Screen({ escenario, vista, onLog }: TwinScreenProps) {
  const caso = CASOS[escenario] ?? CASOS.minimo;
  return (
    <div className="twin-screen-safe">
      {vista === 'hoy' ? (
        <Hoy sesion={caso.sesion} medido={caso.medido} onLog={onLog} />
      ) : (
        <Propuesta sesion={caso.sesion} medido={caso.medido} onLog={onLog} />
      )}
    </div>
  );
}
