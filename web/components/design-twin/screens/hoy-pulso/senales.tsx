'use client';

// LAS CUATRO SEÑALES que alimentan el número, como cuatro celdas de instrumento
// bajo el dial: valor real a 24 pt y etiqueta a 15 pt, separadas por reglas
// finas (nada de tarjeta dentro de tarjeta).
//
// Una señal apagada se DICE («sin dato»); no se cifra ni se pinta como barra
// vacía (§7). Y si el atleta puede encenderla con un toque (el check-in, cuando
// está por hacer) la celda es un botón: es la invitación visible que no tapa el
// dial. Las otras tres dependen del reloj y no tienen acto que ofrecer.

import type { CSSProperties } from 'react';
import type { LecturaHoy, Senal } from '../../kit-hoy/contrato';
import { R } from '../../kit-composicion/tokens';
import { Esq } from './atomos';
import { IconCheck } from './iconos';
import { partirValor } from './texto';
import { T } from './tokens';

const CELDA: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  minHeight: 76,
  padding: '12px 2px',
  minWidth: 0,
};

const ETIQUETA_CELDA: CSSProperties = { font: `500 ${T.apoyo}px/20px var(--twin-font-sans)`, color: 'var(--twin-muted)', whiteSpace: 'nowrap' };

function Valor({ s }: { s: Senal }) {
  if (s.clave === 'checkin') {
    return <IconCheck tam={26} style={{ color: 'var(--twin-fg)', margin: '2px 0' }} />;
  }
  const { num, unidad } = partirValor(s.valor ?? '');
  return (
    <span style={{ font: `600 ${T.titulo}px/30px var(--twin-font-sans)`, fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)', whiteSpace: 'nowrap' }}>
      {num}
      {unidad ? <span style={{ font: `500 ${T.apoyo}px/1 var(--twin-font-sans)`, color: 'var(--twin-muted)', marginLeft: 3 }}>{unidad}</span> : null}
    </span>
  );
}

function aria(s: Senal, pendienteDeHacer: boolean): string {
  if (s.activa) return s.clave === 'checkin' ? 'Check-in, hecho' : `${s.etiqueta}, ${s.valor ?? 'con dato'}`;
  return pendienteDeHacer ? 'Check-in, por hacer. Hacer el check-in ahora' : `${s.etiqueta}, sin dato`;
}

export function Senales({ l, checkinHecho, onCheckin }: { l: LecturaHoy; checkinHecho: boolean; onCheckin: () => void }) {
  if (l.cargando) {
    return (
      <div role="status" aria-label="Cargando las señales" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ ...CELDA, borderLeft: i ? '1px solid var(--twin-hairline)' : undefined }}>
            <Esq w={52} h={26} r={8} />
            <Esq w={58} h={15} r={6} />
          </div>
        ))}
      </div>
    );
  }
  if (l.disposicion.tipo !== 'medida') return null;
  const senales = l.disposicion.senales;

  return (
    <ul aria-label="Qué lo explica" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(${senales.length}, minmax(0, 1fr))` }}>
      {senales.map((s, i) => {
        const activa = s.activa || (s.clave === 'checkin' && checkinHecho);
        const invitacion = s.clave === 'checkin' && !activa && l.checkinPendiente;
        const viva: Senal = { ...s, activa };
        const contenido = (
          <>
            {activa ? (
              <Valor s={viva} />
            ) : invitacion ? (
              <span style={{ font: `700 ${T.cuerpo}px/30px var(--twin-font-sans)`, color: 'var(--twin-accent-text)' }}>Hacer</span>
            ) : (
              <span style={{ font: `400 ${T.cuerpo}px/30px var(--twin-font-sans)`, color: 'var(--twin-muted)', whiteSpace: 'nowrap' }}>sin dato</span>
            )}
            <span style={ETIQUETA_CELDA}>{s.etiqueta}</span>
          </>
        );
        const marco: CSSProperties = { ...CELDA, borderLeft: i ? '1px solid var(--twin-hairline)' : undefined };
        return (
          <li key={s.clave} style={{ display: 'flex' }}>
            {invitacion ? (
              <button
                type="button"
                className="pl-btn"
                onClick={onCheckin}
                aria-label={aria(viva, true)}
                style={{
                  ...marco,
                  flex: 1,
                  borderRadius: R.m,
                  background: 'color-mix(in srgb, var(--twin-accent) 12%, transparent)',
                  boxShadow: 'inset 0 0 0 1.5px var(--twin-accent-text)',
                  borderLeft: undefined,
                }}
              >
                {contenido}
              </button>
            ) : (
              <div role="group" aria-label={aria(viva, false)} style={{ ...marco, flex: 1 }}>
                {contenido}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
