'use client';

// EL PROTOCOLO — pasos ordenados que se marcan, con el reloj corriendo al revés.
//
// La decisión de diseño está en la columna izquierda: la marca temporal va en
// MONO y cuenta HACIA ATRÁS desde tu salida («−40'», «−35'»…). Un calentamiento
// de carrera no se lee en minutos transcurridos, se lee en cuánto queda, y esa
// es la única forma en que sirve de pie en el pasillo de boxes.
//
// Arquetipo Detalle con acción anclada (§6 regla 3): la CTA vive abajo y
// SIEMPRE visible, pero no se activa hasta que los siete pasos están marcados.
// Un «hecho» que se puede pulsar con cero pasos marcados no es un estado, es un
// botón, y el coach acabaría con el mismo dato que tiene hoy: ninguno.

import { useState } from 'react';
import { Card, Display, Hairline, IconCheckCircle, IconCircle, Label, Mono } from '../../kit';
import { Pantalla } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import { COACH, PROTOCOLO_CALENTAMIENTO } from '../../coach-com/data';
import { insignia, type PasoProtocolo, type Protocolo } from '../../coach-com/modelo';
import { CabeceraDetalle, EstadoBadge } from '../../coach-com/piezas';

export type ModoProtocolo = 'sin-empezar' | 'a-medias' | 'hecho';

/** Ancho de la columna de marcas. El separador arranca donde arranca el texto. */
const COL_MARCA = 38;
const SANGRADO_FILA = S.l + COL_MARCA + S.m;

/** Cuántos pasos llegan marcados en cada escenario. Determinista desde el modo. */
const MARCADOS: Record<ModoProtocolo, number> = {
  'sin-empezar': 0,
  'a-medias': 3,
  hecho: PROTOCOLO_CALENTAMIENTO.pasos.length,
};

export function PantallaProtocolo({ modo, onLog }: { modo: ModoProtocolo; onLog: (linea: string) => void }) {
  const pasos = PROTOCOLO_CALENTAMIENTO.pasos;
  const [hechos, setHechos] = useState<string[]>(() => pasos.slice(0, MARCADOS[modo]).map((p) => p.id));
  const [cerrado, setCerrado] = useState(modo === 'hecho');

  const completo = hechos.length === pasos.length;
  const protocolo: Protocolo = {
    ...PROTOCOLO_CALENTAMIENTO,
    hechos: hechos.length,
    estado: cerrado ? 'hecho' : hechos.length > 0 ? 'visto' : PROTOCOLO_CALENTAMIENTO.estado,
  };

  const alternar = (paso: PasoProtocolo) => {
    const estaba = hechos.includes(paso.id);
    setHechos((prev) => (estaba ? prev.filter((id) => id !== paso.id) : [...prev, paso.id]));
    if (estaba) setCerrado(false);
    onLog(`${estaba ? 'Desmarcado' : 'Hecho'} ${paso.marca ?? ''} ${paso.texto}`.trim());
  };

  return (
    <Pantalla
      estrategia="llena"
      cabecera={
        <CabeceraDetalle
          c={protocolo}
          onVolver={() => onLog('Volver a Del coach')}
          accesorio={
            cerrado ? (
              <EstadoBadge estado={insignia(protocolo)} />
            ) : (
              <Mono size={13} weight={700} color={completo ? 'var(--twin-ok)' : 'var(--twin-muted)'}>
                {hechos.length} de {pasos.length}
              </Mono>
            )
          }
        />
      }
      accion={
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
          <button
            type="button"
            className="tw-btn-primary"
            disabled={!completo || cerrado}
            onClick={() => {
              setCerrado(true);
              onLog('Protocolo hecho → Pablo lo ve cerrado');
            }}
            style={{
              width: '100%',
              opacity: completo && !cerrado ? 1 : 0.4,
              cursor: completo && !cerrado ? 'pointer' : 'default',
            }}
          >
            Protocolo hecho
          </button>
          <span style={{ textAlign: 'center', font: '500 11.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            {cerrado
              ? `${COACH.nombreCorto} ya lo ve cerrado.`
              : completo
                ? `${COACH.nombreCorto} verá que lo has hecho.`
                : `Te quedan ${pasos.length - hechos.length} pasos por marcar.`}
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.l, padding: `${S.l}px ${S.l}px ${S.xl}px` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
          <Display size={24}>{protocolo.titulo}</Display>
          <span style={{ font: '400 13.5px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Los tiempos cuentan hacia atrás desde tu salida.
          </span>
          <BarraProgreso hechos={hechos.length} total={pasos.length} />
        </div>

        <Card padding={0}>
          {pasos.map((paso, i) => (
            <div key={paso.id}>
              {i > 0 ? <Hairline style={{ marginLeft: SANGRADO_FILA }} /> : null}
              <FilaPaso paso={paso} hecho={hechos.includes(paso.id)} onTap={() => alternar(paso)} />
            </div>
          ))}
        </Card>

        <Card padding={S.l} leftAccent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label size={9.5}>Nota de {COACH.nombreCorto}</Label>
            <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {protocolo.notaCoach}
            </span>
          </div>
        </Card>
      </div>
    </Pantalla>
  );
}

/** El avance, medido. Dos pasos de siete es un dato; una barra a medias, una sensación. */
function BarraProgreso({ hechos, total }: { hechos: number; total: number }) {
  return (
    <div
      aria-hidden
      style={{ display: 'flex', gap: 3, height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 2 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            borderRadius: 2,
            background: i < hechos ? 'var(--twin-ok)' : 'var(--twin-surface-sunken)',
            transition: 'background-color 180ms ease-out',
          }}
        />
      ))}
    </div>
  );
}

/**
 * La fila entera es el control: de pie, sudando y con una mano, acertar un
 * círculo de 20 pt no es realista, así que el área de toque es la línea.
 */
function FilaPaso({ paso, hecho, onTap }: { paso: PasoProtocolo; hecho: boolean; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={hecho}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: 'pointer',
        width: '100%',
        minHeight: 56,
        display: 'flex',
        alignItems: 'center',
        gap: S.m,
        padding: `${S.m}px ${S.l}px`,
      }}
    >
      {/* A la derecha: una columna de instrumento se lee por la unidad, y con
          «−40'» y «−8'» alineados a la izquierda los minutos quedan en dos
          sitios distintos. */}
      <span style={{ flex: `0 0 ${COL_MARCA}px`, textAlign: 'right' }}>
        <Mono size={14} weight={700} color={hecho ? 'var(--twin-faint)' : 'var(--twin-fg)'}>
          {paso.marca}
        </Mono>
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: '500 14px/1.35 var(--twin-font-sans)',
          color: hecho ? 'var(--twin-muted)' : 'var(--twin-fg)',
        }}
      >
        {paso.texto}
      </span>
      <span
        aria-hidden
        style={{ flex: '0 0 auto', display: 'inline-flex', color: hecho ? 'var(--twin-ok)' : 'var(--twin-faint)' }}
      >
        {hecho ? <IconCheckCircle size={21} /> : <IconCircle size={21} />}
      </span>
    </button>
  );
}
