'use client';

// LA PUNTUACIÓN DEL AMRAP EN EL MÓVIL (familia WOD, 28-09) — la campana
// suena y se dicen las rondas (contadas) y las reps de la ronda a medias.
// Mismo patrón que anotar la serie (`AnotarSerie`): se toca el dato y UN par
// de ± grandes lo mueve; lo no dicho es «—», nunca 0. RX / Escalado NO está
// aquí a propósito: se declara al terminar, con la puntuación guardada
// (SmartWOD / Wodify), fuera del vivo.
//
// El dominio es del kit compartido (`tarea.ts`): `Dial`, `girarPuntuacion`
// (las reps llevan a la ronda), `desgloseReps` («12 Wall Ball + 6 KB Swing»).

import type { Dial } from '../kit-reloj/tarea';
import { desgloseReps } from '../kit-reloj/tarea';
import type { Tarea } from '../kit-reloj/paso';
import { BotonRedondo, Etiqueta, Icono, Numeral, Superficie } from './piezas';
import { CI, RADIO, TI } from './tokens';

export type CampoPuntuacion = 'rondas' | 'reps';

function Dato({ valor, unidad, activo, dicho, onPulsa }: { valor: string; unidad: string; activo: boolean; dicho: boolean; onPulsa: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={(e) => {
        e.stopPropagation();
        onPulsa();
      }}
      style={{
        height: TI.botonMenor.alto,
        padding: '0 12px',
        border: `2px solid ${activo ? CI.accion : 'transparent'}`,
        borderRadius: RADIO.boton,
        background: CI.superficie2,
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 5,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Numeral texto={valor} cuerpo={22} tono={dicho ? CI.tinta : CI.tinta2} />
      <Etiqueta tono={dicho ? CI.tinta : CI.tinta2}>{unidad}</Etiqueta>
    </button>
  );
}

/**
 * LA TARJETA DE LA PUNTUACIÓN: [5 rondas] [— reps] y los ±; debajo, dónde te
 * quedaste («12 Wall Ball + 6 KB Swing»). Con un solo movimiento no hay
 * rondas: solo las reps. Guardar es la acción primaria de la franja.
 */
export function AnotarPuntuacion({
  dial,
  tareas,
  foco,
  onFoco,
  onMueve,
}: {
  dial: Dial;
  tareas: Tarea[];
  foco: CampoPuntuacion;
  onFoco: (campo: CampoPuntuacion) => void;
  onMueve: (delta: 1 | -1) => void;
}) {
  const conRondas = tareas.length > 1;
  const desglose = conRondas && dial.reps != null && dial.reps > 0 ? desgloseReps(tareas, dial.reps) : null;
  return (
    <Superficie padding={12} estilo={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: TI.datoTexto.cuerpo, fontWeight: 700, color: CI.tinta, lineHeight: 1.1, whiteSpace: 'nowrap' }}>Puntuación</span>
        <Etiqueta tono={dial.reps == null ? CI.tinta2 : CI.tinta}>{dial.reps == null ? 'reps sin decir' : desglose ? `hasta ${desglose}` : 'ronda entera'}</Etiqueta>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {conRondas ? <Dato valor={String(dial.rondas)} unidad={dial.rondas === 1 ? 'ronda' : 'rondas'} activo={foco === 'rondas'} dicho onPulsa={() => onFoco('rondas')} /> : null}
        <Dato valor={dial.reps == null ? '—' : String(dial.reps)} unidad="reps" activo={foco === 'reps'} dicho={dial.reps != null} onPulsa={() => onFoco('reps')} />
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
          <BotonRedondo nombre="menos" icono={<Icono nombre="menos" talla={20} />} talla={TI.botonMenor.alto} onPulsa={() => onMueve(-1)} />
          <BotonRedondo nombre="más" icono={<Icono nombre="mas" talla={20} />} talla={TI.botonMenor.alto} onPulsa={() => onMueve(1)} />
        </span>
      </div>
    </Superficie>
  );
}
