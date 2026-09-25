'use client';

// «historial» — el entreno rechazado, dentro del historial de siempre.
//
// La pantalla es HistoryView.swift tal cual (la ✕, el mes, el calendario, la
// leyenda y la lista de más nuevo a más viejo): transcrita, no reinterpretada,
// porque lo que se propone es UNA marca en UNA fila, y eso solo se juzga sobre la
// lista real. Lo nuevo es exactamente esto:
//
//   · La fila del entreno rechazado EXISTE. Hoy no existiría: el historial es lo
//     que devuelve el servidor, y el servidor no lo tiene. La app la cose en
//     local desde `RequestQueue.rejected` — mismo título y misma duración, porque
//     salen del mismo envío.
//   · Lleva «Sin subir» como un chip más de los que la fila ya sabe pintar.
//   · Su día del calendario lleva el punto de «hecho»: el trabajo se hizo.
//   · Al tocarla NO abre ExecutedWorkoutView (pide la ejecución al servidor, que
//     no existe: sería un 404). Abre el registro que guarda el móvil con el mismo
//     aviso del resumen. Es la única vía por la que se entera quien NUNCA vio el
//     resumen rechazado: un entreno guardado sin cobertura puede recibir su 4xx
//     días después, al vaciarse la cola, con el atleta ya lejos de esa pantalla.

import { useState, type ReactNode } from 'react';
import { IconChevron, IconClose, Pantalla, RAD, SP } from '../../kit';
import { reloj } from '../../datos-reales';
import { TarjetaRegistro } from '../post-entreno/propuesta';
import {
  HOY_HISTORIAL,
  JULIO,
  RECHAZADO,
  diaAbrev,
  diasConTrabajo,
  etiquetaMes,
  numeroDia,
  partesISO,
  rejillaDelMes,
  type FilaHistorial,
} from './datos';
import { AvisoGuardado, ChipSinSubir } from './piezas';

const CABECERAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function Historial({ onLog }: { onLog: (linea: string) => void }) {
  const [abierta, setAbierta] = useState(false);
  const hoy = partesISO(HOY_HISTORIAL);

  if (abierta) {
    return (
      <RegistroEnElMovil
        onCerrar={() => {
          setAbierta(false);
          onLog('✕ — vuelves al historial');
        }}
        onLog={onLog}
      />
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <BarraSuperior titulo="Historial" onCerrar={() => onLog('✕ — cierra el historial')} />
      <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.l, padding: `${SP.s}px ${SP.xl}px ${SP.l}px` }}>
          <NavMes etiqueta={etiquetaMes(hoy.y, hoy.m)} onLog={onLog} />
          <Calendario y={hoy.y} m={hoy.m} hoyDia={hoy.d} conTrabajo={diasConTrabajo(JULIO, hoy.y, hoy.m)} />
          <Leyenda />
          <div aria-hidden style={{ height: 1, background: 'var(--twin-hairline)' }} />
        </div>
        <div style={{ padding: `0 ${SP.xl}px ${SP.xxl}px` }}>
          {JULIO.map((fila, i) => (
            <div key={`${fila.fecha}-${fila.titulo}`}>
              {i > 0 && <div aria-hidden style={{ height: 1, background: 'var(--twin-hairline)' }} />}
              <Fila
                fila={fila}
                onTap={() => {
                  if (fila.sinSubir) {
                    setAbierta(true);
                    onLog('→ abre el registro que guarda el móvil, con el mismo aviso (no la ficha del servidor: no la tiene)');
                  } else {
                    onLog(`→ ficha del entreno (ExecutedWorkoutView): ${fila.titulo} · ${fila.procedencia}`);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cromo — `topBar` y `monthNav` de HistoryView.swift
// ---------------------------------------------------------------------------

function BarraSuperior({ titulo, onCerrar }: { titulo: string; onCerrar: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: `${SP.s}px ${SP.m}px 0`, flex: '0 0 auto' }}>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar"
        style={{
          all: 'unset',
          width: 40,
          height: 40,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          color: 'var(--twin-fg)',
        }}
      >
        <IconClose size={15} />
      </button>
      <span style={{ flex: 1, textAlign: 'center', font: 'italic 800 15px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {titulo}
      </span>
      <span aria-hidden style={{ width: 40, height: 40 }} />
    </div>
  );
}

function NavMes({ etiqueta, onLog }: { etiqueta: string; onLog: (linea: string) => void }) {
  const boton = (dir: 'left' | 'right', activo: boolean) => (
    <button
      type="button"
      disabled={!activo}
      onClick={activo ? () => onLog('‹ junio — fuera de este escenario') : undefined}
      aria-label={dir === 'left' ? 'Mes anterior' : 'Mes siguiente'}
      style={{
        all: 'unset',
        width: 40,
        height: 36,
        display: 'grid',
        placeItems: 'center',
        cursor: activo ? 'pointer' : 'default',
        color: activo ? 'var(--twin-fg)' : 'color-mix(in srgb, var(--twin-faint) 40%, transparent)',
      }}
    >
      <IconChevron dir={dir} size={15} />
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {boton('left', true)}
      <span style={{ flex: 1, textAlign: 'center', font: 'italic 800 18px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {etiqueta}
      </span>
      {/* El mes en curso: no se avanza al futuro (`canGoForward`). */}
      {boton('right', false)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El calendario — `calendar` / `dayCell` / `indicator`
// ---------------------------------------------------------------------------

function Calendario({ y, m, hoyDia, conTrabajo }: { y: number; m: number; hoyDia: number; conTrabajo: Set<number> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {CABECERAS.map((d) => (
          <span key={d} style={{ textAlign: 'center', font: '800 11px/1 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            {d}
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {rejillaDelMes(y, m).map((c, i) => {
          if (c.tipo === 'hueco') return <span key={`h${i}`} style={{ height: 40 }} />;
          const esHoy = c.n === hoyDia;
          const hecho = conTrabajo.has(c.n);
          return (
            <span
              key={c.n}
              style={{
                height: 40,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                borderRadius: 8,
                boxShadow: esHoy ? 'inset 0 0 0 1px color-mix(in srgb, var(--twin-accent-text) 70%, transparent)' : undefined,
              }}
            >
              <span
                style={{
                  font: `${esHoy ? 800 : 500} 13px/1 var(--twin-font-sans)`,
                  fontVariantNumeric: 'tabular-nums',
                  color: esHoy ? 'var(--twin-accent-text)' : 'var(--twin-fg)',
                }}
              >
                {c.n}
              </span>
              <span style={{ height: 12, display: 'grid', placeItems: 'center' }}>
                {hecho && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--twin-accent)' }} />}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Leyenda() {
  const item = (marca: ReactNode, texto: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 12, display: 'grid', placeItems: 'center' }}>{marca}</span>
      {texto}
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 14, font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
      {item(<span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--twin-accent)' }} />, 'hecho')}
      {item(
        <span
          style={{
            width: 12,
            height: 12,
            boxSizing: 'border-box',
            borderRadius: '50%',
            border: '1.5px solid var(--twin-info)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--twin-accent)' }} />
        </span>,
        'en pareja',
      )}
      {item(<span style={{ width: 10, height: 2, borderRadius: 1, background: 'var(--twin-faint)' }} />, 'descanso')}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La fila — `listRow` de HistorialDelMes
// ---------------------------------------------------------------------------

function Fila({ fila, onTap }: { fila: FilaHistorial; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${diaAbrev(fila.fecha)} ${numeroDia(fila.fecha)}, ${fila.titulo}, ${reloj(fila.duracionS)} de duración${
        fila.sinSubir ? ', sin subir' : ''
      }`}
      style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}
    >
      <span style={{ width: 34, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span style={{ font: '800 8px/1 var(--twin-font-sans)', letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--twin-faint)' }}>
          {diaAbrev(fila.fecha)}
        </span>
        <span style={{ font: '800 16px/1.1 var(--twin-font-sans)', fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)' }}>
          {numeroDia(fila.fecha)}
        </span>
      </span>

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span
          style={{
            font: '600 13px/1.25 var(--twin-font-sans)',
            color: 'var(--twin-fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fila.titulo}
        </span>
        {/* `subChips`: ninguna de estas filas trae RPE, pareja ni ruta — la
            base no los tiene para estas ejecuciones —, así que el único chip
            que sale es el nuevo. */}
        {fila.sinSubir && (
          <span style={{ display: 'flex', gap: 6 }}>
            <ChipSinSubir />
          </span>
        )}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flex: '0 0 auto' }}>
        <span style={{ font: 'italic 800 17px/1.1 var(--twin-font-sans)', fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)' }}>
          {reloj(fila.duracionS)}
        </span>
        <span style={{ font: '800 8px/1 var(--twin-font-sans)', letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--twin-faint)' }}>
          duración
        </span>
      </span>
      <span style={{ color: 'var(--twin-faint)', display: 'inline-flex', flex: '0 0 auto' }}>
        <IconChevron size={11} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Al tocar la fila — el registro que guarda el móvil
// ---------------------------------------------------------------------------

/**
 * Se presenta como la ficha de siempre (a pantalla completa, con su ✕), pero lo
 * que enseña es el registro tal y como quedó en el teléfono, con el aviso
 * arriba del todo: aquí el atleta llega preguntándose qué significa «Sin subir».
 */
function RegistroEnElMovil({ onCerrar, onLog }: { onCerrar: () => void; onLog: (linea: string) => void }) {
  const fila = JULIO.find((f) => f.sinSubir) ?? JULIO[0]!;
  const dia = diaAbrev(fila.fecha);
  // «Mié 15 jul» — el día, como la cabecera de un día enfocado del historial.
  const tituloFicha = `${dia[0]!.toUpperCase()}${dia.slice(1)} ${numeroDia(fila.fecha)} jul`;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <BarraSuperior titulo={tituloFicha} onCerrar={onCerrar} />
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>
        <Pantalla>
          <AvisoGuardado style={{ flex: '0 0 auto', borderRadius: RAD.l }} />
          <TarjetaRegistro sesion={RECHAZADO.sesion} medido={RECHAZADO.medido} onLog={onLog} encabezado={null} />
        </Pantalla>
      </div>
    </div>
  );
}
