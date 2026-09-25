'use client';

// CARAS DE MUESTRA para enseñar la gramática fuera de correr: una serie de
// fuerza y una estación. Son las MÍNIMAS, compuestas con las piezas del kit;
// las de verdad las diseñan `reloj-fuerza` y `reloj-circuito`. Aquí solo
// tienen que dejar ver la carcasa: los controles con su etiqueta de contexto,
// el doble toque y el deshacer.

import {
  ANCHO_PIE,
  C,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  PistaAccion,
  altoHeroe,
  contextoDe,
  fmtObjetivo,
  fmtPrescrito,
  fmtReloj,
  lineaPulso,
  objetivoDe,
  principal,
  useFilaAccion,
  type Secuencia,
} from '../../kit-reloj';
import { ZONAS } from './planes';

/** Serie de fuerza (P11): el ejercicio primero, la dosis con sus dos ejes. */
export function CaraFuerza({ seq }: { seq: Secuencia }) {
  const fila = useFilaAccion();
  const p = seq.paso;
  const carga = objetivoDe(p, 'secundario');
  const esfuerzo = principal(p);
  const serie = p.posicion?.serie;
  const ejes = [carga ? fmtObjetivo(carga) : null, esfuerzo ? fmtObjetivo(esfuerzo) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Columna>
      <ContextoLinea partes={[serie ? `Serie ${serie.n}/${serie.de}` : 'Serie']} />
      <Instruccion texto={`${p.posicion?.slot ? `${p.posicion.slot} · ` : ''}${p.nombre ?? ''}`} />
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center' }}>
        <Heroe
          heroe={{ clase: 'crono', texto: String(p.medida.prescrito ?? ''), unidad: 'reps' }}
          altoMax={altoHeroe(fila === 'pista' ? ['contexto', 'instruccion', 'instruccion', 'pista', 'tercero'] : ['contexto', 'instruccion', 'instruccion', 'boton'])}
        />
      </div>
      {ejes ? <Instruccion texto={ejes} tono={C.tinta2} /> : null}
      <PistaAccion accion="serie hecha" />
      {fila === 'pista' ? <Linea linea={lineaPulso(p, seq.lecturas, ZONAS)} cuerpo={22} ancho={ANCHO_PIE} /> : null}
    </Columna>
  );
}

/**
 * Estación (P10): nombre, dosis y carga; si nada la mide, el número grande es
 * el crono de la estación con «lo dices tú».
 */
export function CaraEstacion({ seq }: { seq: Secuencia }) {
  const fila = useFilaAccion();
  const p = seq.paso;
  const dosis = [fmtPrescrito(p.medida), p.carga ? `${p.carga.kg} kg` : null].filter(Boolean).join(' · ');
  return (
    <Columna>
      <ContextoLinea partes={contextoDe(p)} />
      <Instruccion texto={p.nombre ?? ''} />
      <Instruccion texto={dosis} tono={C.tinta2} />
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center' }}>
        <Heroe
          heroe={{ clase: 'crono', texto: fmtReloj(seq.lecturas.t), etiqueta: 'lo dices tú' }}
          altoMax={altoHeroe(fila === 'pista' ? ['contexto', 'instruccion', 'instruccion', 'pista', 'tercero'] : ['contexto', 'instruccion', 'instruccion', 'boton'])}
        />
      </div>
      <PistaAccion accion="estación hecha" />
      {/* Con botón (reloj sin doble toque) el botón ocupa la fila de abajo. */}
      {fila === 'pista' ? <Linea linea={lineaPulso(p, seq.lecturas, ZONAS)} cuerpo={22} ancho={ANCHO_PIE} /> : null}
    </Columna>
  );
}
