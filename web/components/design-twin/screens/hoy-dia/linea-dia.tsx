'use client';

// La línea del día: fecha, saludo por la hora y en qué instante estás.
//
// El instante sale del ESTADO de las sesiones (Antes · Entreno · Después), no
// de una hora del plan: el plan no la tiene y el reloj no sabe si ya entrenaste
// (`instanteDelDia`). Un día sin sesiones que recorrer dice qué día es en vez
// de dibujar un recorrido vacío. Es sobria a propósito: tres trazos y una
// palabra, para que el sujeto de debajo sea lo único que grita.

import type { LecturaHoy } from '../../kit-hoy/contrato';
import { ETIQUETA_PASO, PASOS, saludo, type Instante, type Paso } from './momento';
import { Esqueleto, Etiqueta, Pastilla } from './piezas';
import { fuente, TAM } from './tokens';

function Recorrido({ ahora, cerradas, total }: { ahora: Paso; cerradas: number; total: number }) {
  const actual = PASOS.indexOf(ahora);
  return (
    <ol
      aria-label={`Tu día. Ahora: ${ETIQUETA_PASO[ahora]}${total > 1 ? `, ${cerradas} de ${total} sesiones cerradas` : ''}`}
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}
    >
      {PASOS.map((p, i) => {
        const pasado = i < actual;
        const vivo = i === actual;
        return (
          <li key={p} aria-current={vivo ? 'step' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span
              aria-hidden
              style={{
                height: 6,
                borderRadius: 3,
                background: vivo ? 'var(--twin-accent)' : pasado ? 'var(--twin-muted)' : 'var(--twin-hairline-strong)',
              }}
            />
            <span
              style={{
                ...fuente(vivo ? 800 : 600, TAM.suelo, 1.2),
                color: vivo ? 'var(--twin-fg)' : 'var(--twin-muted)',
              }}
            >
              {ETIQUETA_PASO[p]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function LineaDia({ l, instante }: { l: LecturaHoy; instante: Instante | null }) {
  const enFrio = l.cargando;
  const varias = instante?.tipo === 'recorrido' && instante.total > 1;
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Etiqueta color="var(--twin-accent-text)">{l.fecha}</Etiqueta>
        {varias ? (
          <span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>
            {instante.cerradas} de {instante.total} sesiones
          </span>
        ) : null}
      </div>
      <h1
        style={{
          margin: 0,
          ...fuente(800, TAM.saludo, 1.1, true),
          letterSpacing: '-0.015em',
          color: 'var(--twin-fg)',
          textWrap: 'balance',
        }}
      >
        {/* En frío el nombre es relleno: solo el saludo de la hora, que es del dispositivo. */}
        {saludo(l.hora, enFrio ? null : l.nombre)}
      </h1>
      {enFrio || instante ? (
        <div style={{ marginTop: 8, minHeight: 36 }}>
          {enFrio ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {PASOS.map((p) => (
                <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Esqueleto alto={6} radio={3} />
                  <Esqueleto ancho={56} alto={15} radio={5} />
                </div>
              ))}
            </div>
          ) : instante?.tipo === 'recorrido' ? (
            <Recorrido ahora={instante.ahora} cerradas={instante.cerradas} total={instante.total} />
          ) : instante?.tipo === 'rotulo' ? (
            <Pastilla fondo="var(--twin-surface)" tinta="var(--twin-fg)" borde="var(--twin-hairline-strong)">
              {instante.texto}
            </Pastilla>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
