'use client';

// LA NOTA DEL COACH — el porqué del plan, en algo que se pueda releer.
//
// El caso real: el atleta se pasa de Doubles a Singles Pro y con eso se caen
// cinco de las seis premisas con las que estaba escrito su plan. Explicarlo en
// el chat significa que a las dos semanas no lo encuentra, y en octubre, cuando
// llegue el simulacro y quiera saber por qué su objetivo son 1:15 a 1:18 y no
// 1:05, va a tener que preguntarlo otra vez.
//
// Un briefing no pide un acto: pide que lo entiendas. Por eso su ciclo de vida
// se acaba en «visto» y no en «hecho» — y por eso deja el enlace a la pregunta
// que sí lo pide.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { PantallaNota, type ModoNota } from './pantalla';

export const meta: TwinMeta = {
  id: 'coach-nota',
  titulo: 'Del coach — el porqué del plan',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-08-09',
  descripcion:
    'El briefing del plan rehecho para Singles Pro por secciones: qué ha cambiado, la banda de objetivo en grande, el reparto de las seis sesiones y las doce semanas como espina, con descargas y simulacro marcados.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'nueva',
    titulo: 'Recién publicada',
    descripcion:
      'Insignia NUEVO y entrada escalonada, sección a sección. El pie llama a la pregunta del wave, que sigue abierta y es lo único que le falta al plan para cerrarse.',
  },
  {
    id: 'al-dia',
    titulo: 'Ya vista · con la wave decidida',
    descripcion:
      'La misma nota tres días después: insignia VISTO y el pie convertido en recibo de lo que elegiste. Es la cara que se lee en octubre, no la del día que se publicó.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <PantallaNota key={escenario} modo={escenario as ModoNota} onLog={onLog} />
    </div>
  );
}
