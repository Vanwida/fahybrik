'use client';

// Las piezas propias de la ficha. Todo lo que ya existe se reutiliza tal cual:
// `Sujeto`, `Curva`, `Seccion`, `Mapa`, `TablaRepeticiones`, `TablaKilometros`
// y `derivadasDe` son de `lectura-carrera` — esta pantalla hereda su lenguaje y
// no lo reescribe. `Apoyo`/`FilaApoyos`/`Delta` son de `kit-vivo`; `Card`,
// `Etiqueta`, `Chevron`, `Pastilla` son de `kit-composicion/chrome`.
//
// Lo que sí es nuevo: la cabecera de vista empujada (con subtítulo del entreno,
// que `NavBar` no tiene), la fila de totales y los dos bloques que el mapa v2
// pedía — comparativa e historial del mismo entreno.

import type { ReactNode } from 'react';
import { Card, Chevron, Etiqueta, Pastilla } from '../../kit-composicion/chrome';
import { FilaDato, GrupoFilas } from '../../kit-composicion/estados';
import { distancia, reloj, ritmoKm } from '../../kit-composicion/formato';
import { CROMO, S } from '../../kit-composicion/tokens';
import { Apoyo, Delta as DeltaBadge, FilaApoyos } from '../../kit-vivo';
import type { Carrera } from '../lectura-carrera/modelo';
import type { Comparativa, FilaHistorialEntreno } from './datos';

// ---------------------------------------------------------------------------
// LA CABECERA — vista empujada: volver, tipo · fecha, y el nombre si lo hay
// ---------------------------------------------------------------------------

/** El mismo trazo que `NavBar` (kit-composicion/chrome): esta cabecera lleva
 *  subtítulo, que `NavBar` no admite, así que no se reutiliza el componente
 *  entero — se repite el único icono que hacía falta de él. */
function ChevronAtras() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
      <path d="m10 3.4-5 4.6 5 4.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Cabecera({
  tipo,
  fecha,
  nombre,
  onBack,
}: {
  tipo: string;
  fecha: string;
  /** El entreno prescrito, si lo hubo — un rodaje libre no tiene nombre que dar. */
  nombre?: string | null;
  onBack: () => void;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--twin-hairline)', flex: '0 0 auto' }}>
      <div style={{ height: CROMO.navBar, display: 'flex', alignItems: 'center', padding: `0 ${S.s}px`, gap: S.s }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver al historial"
          style={{ all: 'unset', cursor: 'pointer', width: 44, display: 'inline-flex', justifyContent: 'center', color: 'var(--twin-accent-text)' }}
        >
          <ChevronAtras />
        </button>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.16em' }}>
          {`${tipo} · ${fecha}`}
        </span>
      </div>
      {nombre && (
        <div style={{ padding: `0 ${S.l}px ${S.m}px ${CROMO.navBar}px` }}>
          <span className="t-headline-s" style={{ color: 'var(--twin-fg)' }}>
            {nombre}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOS TOTALES — km, tiempo, ritmo, FC media, desnivel. Siempre, sin condición:
// aquí no manda un sujeto que ya diga la distancia, esto es la ficha entera.
// ---------------------------------------------------------------------------

export function Totales({ carrera }: { carrera: Carrera }) {
  const ritmoMedioSkm = carrera.duracionS / (carrera.distanciaM / 1000);
  const filas: { etiqueta: string; valor: string; pie?: string }[] = [
    { etiqueta: 'Distancia', valor: distancia(carrera.distanciaM) },
    { etiqueta: 'Tiempo', valor: reloj(carrera.duracionS) },
    { etiqueta: 'Ritmo medio', valor: ritmoKm(ritmoMedioSkm) },
  ];
  if (carrera.fcMediaPpm != null) filas.push({ etiqueta: 'FC media', valor: `${carrera.fcMediaPpm}`, pie: 'ppm' });
  if (carrera.desnivelM != null && carrera.desnivelM > 0) {
    filas.push({ etiqueta: 'Desnivel', valor: `+${carrera.desnivelM}`, pie: 'm' });
  }

  const primera = filas.slice(0, 3);
  const segunda = filas.slice(3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <FilaApoyos>
        {primera.map((f) => (
          <Apoyo key={f.etiqueta} etiqueta={f.etiqueta} valor={f.valor} pie={f.pie} />
        ))}
      </FilaApoyos>
      {segunda.length > 0 && (
        <FilaApoyos>
          {segunda.map((f) => (
            <Apoyo key={f.etiqueta} etiqueta={f.etiqueta} valor={f.valor} pie={f.pie} />
          ))}
        </FilaApoyos>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La declaración de procedencia y el sello de superficie — una línea fina,
// nunca una tarjeta: no compiten con los totales, los matizan.
// ---------------------------------------------------------------------------

export function LineaProcedencia({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'block',
        textAlign: 'center',
        font: '500 11px/1.4 var(--twin-font-sans)',
        color: 'var(--twin-faint)',
      }}
    >
      {children}
    </span>
  );
}

/** El mismo trazo que `SelloCinta` en lectura-carrera (no exportado desde ahí,
 *  así que se repite localmente): en calle no hay sello, lo de siempre no se
 *  anuncia. */
export function SelloSuperficie({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        alignSelf: 'center',
        padding: '3px 8px',
        borderRadius: 999,
        border: '1px solid var(--twin-hairline-strong)',
        font: '600 10px/1 var(--twin-font-sans)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--twin-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LA INSIGNIA DE RÉCORD — el naranja de marca, y es el único sitio legítimo:
// el instante en que algo se logra (§9.1 del CONTRATO-UI), no un estado sostenido.
// ---------------------------------------------------------------------------

export function InsigniaRecord({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <Pastilla tono="acento">{`★ ${children}`}</Pastilla>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CONTRA TU ÚLTIMO — la comparativa que la ficha de al terminar no puede dar,
// porque para darla hace falta que exista una vez ANTERIOR que mirar atrás.
// ---------------------------------------------------------------------------

export function BloqueComparativa({ comparativa }: { comparativa: Comparativa }) {
  return (
    <Card padding={S.l}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
        <Etiqueta>{`Contra ${comparativa.etiqueta}`}</Etiqueta>
        <div style={{ display: 'flex', gap: S.s, flexWrap: 'wrap' }}>
          <DeltaBadge
            valor={comparativa.deltaRitmoSkm}
            unidad="s/km"
            mejorEs="menos"
            sufijo="de ritmo"
            textoNulo="mismo ritmo"
          />
          <DeltaBadge
            valor={comparativa.deltaFcPpm}
            unidad="ppm"
            mejorEs="menos"
            sufijo="a ese ritmo"
            textoNulo="mismo pulso"
          />
          {comparativa.deltaPctBanda != null && (
            <DeltaBadge
              valor={comparativa.deltaPctBanda}
              unidad="pts"
              mejorEs="mas"
              sufijo="en banda"
              textoNulo="igual en banda"
            />
          )}
        </div>
        <span style={{ font: '500 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          {comparativa.frase}
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TODOS TUS — la puerta-lista al historial filtrado a este mismo entreno.
// Cada fila abre SU ficha; «Ver todas» es la puerta al historial entero.
// ---------------------------------------------------------------------------

export function BloqueHistorial({
  titulo,
  filas,
  onLog,
}: {
  titulo: string;
  filas: FilaHistorialEntreno[];
  onLog: (linea: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: S.s }}>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.14em' }}>
          {titulo}
        </span>
        <button
          type="button"
          onClick={() => onLog(`Abrir historial filtrado a: ${titulo}`)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            font: '650 11px/1 var(--twin-font-sans)',
            color: 'var(--twin-accent-text)',
          }}
        >
          Ver todas
          <Chevron />
        </button>
      </div>
      <GrupoFilas>
        {filas.map((f) => (
          <FilaDato
            key={f.fecha}
            etiqueta={f.fecha}
            valor={ritmoKm(f.ritmoMedioSkm)}
            pie={f.pctBanda != null ? `${f.pctBanda}% en banda` : undefined}
            onTap={() => onLog(`Abrir la ficha del ${f.fecha}`)}
          />
        ))}
      </GrupoFilas>
    </div>
  );
}
