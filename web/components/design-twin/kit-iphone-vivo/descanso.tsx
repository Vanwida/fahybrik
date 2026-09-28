'use client';

// EL DESCANSO COMÚN (I7) — la misma fase en fuerza, circuito, ergo y entre
// tandas: la cuenta atrás como héroe, «Viene: …» con su objetivo, «+30 s»,
// «Empezar ya», el aviso a 10 s y el 3-2-1 (los pone el motor).
//
// En fuerza, el descanso es donde se ANOTA la serie (patrón Hevy / Strong):
// reps · kg · RIR prerrellenados con lo prescrito, pasos de ± grandes y un
// toque para confirmar. Lo prerrellenado (gris, «sin confirmar») no cuenta
// como declarado hasta confirmarlo (`anotar.ts` del kit compartido).
//
// A 390 pt no caben tres pares de ± en una fila: se toca el dato (reps, kg o
// RIR) y se enciende, y UN par de ± grandes lo mueve — lo mismo que la muñeca
// hace con la corona. Aquí viven las piezas propias del descanso; la anatomía
// (cabecera, sujeto, rejilla, franja) es la de siempre: no cambia de pantalla.

import { useState } from 'react';
import type { Anotacion, Campo } from '../kit-reloj/anotar';
import { fmtValor, textoAnotacion } from '../kit-reloj/anotar';
import type { PasoFuerza } from '../kit-reloj/fuerza';
import { Boton, BotonRedondo, Etiqueta, Icono, Numeral, Superficie } from './piezas';
import { CI, RADIO, TI } from './tokens';

/** «+30 s» en la fila del trabajo del descanso: superficie, 44 pt (la acción del momento sigue siendo Empezar ya). */
export function Mas30({ onMas30 }: { onMas30: () => void }) {
  return <Boton etiqueta="+30 s" variante="superficie" alto={TI.botonMenor.alto} ancho="auto" onPulsa={onMas30} />;
}

// ---------------------------------------------------------------------------
// Anotar la serie
// ---------------------------------------------------------------------------

export interface SerieAnotable {
  paso: PasoFuerza;
  anot: Anotacion;
}

export interface Foco {
  id: string;
  campo: Campo;
}

/** Un dato de la serie: valor + unidad en una píldora; encendido (borde naranja = control activo) si es el que mueve el ±. */
function Dato({ valor, unidad, estado, activo, onPulsa }: { valor: number | null; unidad: string; estado: Anotacion['reps']['estado']; activo: boolean; onPulsa: () => void }) {
  const declarado = estado !== 'propuesto';
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
      <Numeral texto={fmtValor(valor)} cuerpo={22} tono={declarado ? CI.tinta : CI.tinta2} />
      <Etiqueta tono={declarado ? CI.tinta : CI.tinta2}>{unidad}</Etiqueta>
    </button>
  );
}

/**
 * LA SERIE RECIÉN HECHA, para anotarla en el propio descanso. Una tarjeta
 * por serie de la ronda (dos en una superserie): el nombre, los datos como
 * píldoras que se tocan y UN par de ± grandes que mueve el encendido. Gris =
 * propuesto («sin confirmar»); tinta = declarado («✓ 8 × 125 kg · RIR 3»).
 * Confirmar es la acción primaria de la franja; aquí solo se cambian datos.
 */
export function AnotarSerie({ series, onCambia, onLog }: { series: SerieAnotable[]; onCambia: (paso: PasoFuerza, campo: Campo, dir: 1 | -1) => void; onLog?: (l: string) => void }) {
  const primera = series[0];
  const [foco, setFoco] = useState<Foco | null>(primera ? { id: primera.paso.id, campo: primera.anot.kg ? 'kg' : 'reps' } : null);
  const enfocar = (id: string, campo: Campo) => {
    setFoco({ id, campo });
    onLog?.(`Toque → ${campo === 'kg' ? 'la carga' : campo === 'reps' ? 'las reps' : 'el esfuerzo'}: los ± mueven ese dato`);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto' }}>
      {series.map(({ paso, anot }) => {
        const f = paso.fuerza;
        const pendiente = anot.reps.estado === 'propuesto' || anot.kg?.estado === 'propuesto' || anot.esfuerzo?.estado === 'propuesto';
        const nombre = [paso.posicion?.slot, paso.nombre].filter(Boolean).join(' · ');
        const activo = (campo: Campo) => foco?.id === paso.id && foco.campo === campo;
        const mover = (dir: 1 | -1) => {
          const campo = foco?.id === paso.id ? foco.campo : anot.kg ? 'kg' : 'reps';
          if (foco?.id !== paso.id) setFoco({ id: paso.id, campo });
          onCambia(paso, campo, dir);
        };
        return (
          <Superficie key={paso.id} padding={12}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 8, minWidth: 0 }}>
              <span style={{ fontSize: TI.datoTexto.cuerpo, fontWeight: 700, color: CI.tinta, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', minWidth: 0 }}>{nombre}</span>
              <span style={{ fontSize: TI.etiqueta.cuerpo, fontWeight: 600, color: pendiente ? CI.tinta2 : CI.tinta, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                {pendiente ? 'sin confirmar' : `✓ ${textoAnotacion(anot, f)}`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Dato valor={anot.reps.valor} unidad="reps" estado={anot.reps.estado} activo={activo('reps')} onPulsa={() => enfocar(paso.id, 'reps')} />
              {anot.kg ? <Dato valor={anot.kg.valor} unidad="kg" estado={anot.kg.estado} activo={activo('kg')} onPulsa={() => enfocar(paso.id, 'kg')} /> : null}
              {anot.esfuerzo && f.esfuerzo ? (
                <Dato valor={anot.esfuerzo.valor} unidad={f.esfuerzo.eje === 'rir' ? 'RIR' : 'RPE'} estado={anot.esfuerzo.estado} activo={activo('esfuerzo')} onPulsa={() => enfocar(paso.id, 'esfuerzo')} />
              ) : null}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                <BotonRedondo nombre="menos" icono={<Icono nombre="menos" talla={20} />} talla={TI.botonMenor.alto} onPulsa={() => mover(-1)} />
                <BotonRedondo nombre="más" icono={<Icono nombre="mas" talla={20} />} talla={TI.botonMenor.alto} onPulsa={() => mover(1)} />
              </span>
            </div>
          </Superficie>
        );
      })}
    </div>
  );
}
