'use client';

// Átomos de esta pantalla. Los genéricos (Card, Label, Mono, Display, CTA,
// Notice, iconos…) VIVEN EN `design-twin/kit.tsx` y se re-exportan aquí para
// que los ficheros hermanos de la carpeta sigan importando de './ui' — lo que
// era una copia privada pasó al sitio compartido (CONTRATO-UI §0) el día que
// una segunda pantalla los necesitó.
//
// Lo que queda abajo es lo que SOLO tiene sentido en el remo: el chrome fijo
// del HUD (TopStrip/ConnChip/PreparateStrip) y las piezas puramente
// presentacionales de ErgHUDContent (los tres cuerpos del `body` + goalBox /
// heroCard / workRail) — todo prop-driven, sin estado propio, para que
// `hud.tsx` se quede solo con el reloj de la pieza (§ Files under 500 lines).

import type { ReactNode } from 'react';
import { Card, CTA, Display, Hairline, IconCheckCircle, IconChevron, IconClose, Label, Mono, RAD, SP, Spinner } from '../../kit';
import { MARCA, SIN_LECTURA_MOTIVO, TRAMO_LABEL, TRAMO_WORK_LINE } from './data';

export * from '../../kit';

/** El botón contextual de abajo del HUD (TERMINAR / SALTAR). */
export function BottomButton({ title, onClick }: { title: string; onClick: () => void }) {
  return <CTA title={title} onClick={onClick} height={58} />;
}

/** PM5ProgramBanner — una línea honesta mientras se programa la pieza. */
export function ProgramLine({ text, tone }: { text: string; tone: 'accent' | 'ok' }) {
  const color = tone === 'accent' ? 'var(--twin-accent-text)' : 'var(--twin-ok)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        padding: 10,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      <span style={{ color, display: 'inline-flex' }}>
        {tone === 'accent' ? <Spinner size={14} /> : <IconCheckCircle />}
      </span>
      <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{text}</span>
    </div>
  );
}

export function IconRower({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.4" cy="3.9" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4 15.4h12" />
      <path d="M11.8 7.2 8.4 9.6l2.6 2.4-.9 3.4" />
      <path d="M11.8 7.2 15 8.8" />
      <path d="M8.4 9.6 5.2 8.2" />
    </svg>
  );
}

export function IconAntenna({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.4 11.6a5 5 0 0 1 0-7.2" />
      <path d="M11.6 4.4a5 5 0 0 1 0 7.2" />
      <path d="M2.1 13.9a8.3 8.3 0 0 1 0-11.8" />
      <path d="M13.9 2.1a8.3 8.3 0 0 1 0 11.8" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** antenna.radiowaves.left.and.right.slash — el monitor caído de `unmeasuredBody`. */
export function IconAntennaSlash({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.4 11.6a5 5 0 0 1 0-7.2" />
      <path d="M11.6 4.4a5 5 0 0 1 0 7.2" />
      <path d="M2.1 13.9a8.3 8.3 0 0 1 0-11.8" />
      <path d="M13.9 2.1a8.3 8.3 0 0 1 0 11.8" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <path d="M2.5 2.5 13.5 13.5" strokeWidth="1.7" />
    </svg>
  );
}

export function IconTrophy({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.6v1.2A3.4 3.4 0 0 0 8 10.1" />
      <path d="M17 5.5h2.4v1.2A3.4 3.4 0 0 1 16 10.1" />
      <path d="M12 13v4M9 20h6M10 17h4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Chrome — topStrip de ActiveWorkoutView (salir / pausa / atrás + fase y tramo)
// ---------------------------------------------------------------------------

export function TopStrip({ landscape }: { landscape: boolean }) {
  const iconBtn = (child: ReactNode, label: string, dim = false) => (
    <button
      type="button"
      aria-label={label}
      style={{
        width: 26,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 0,
        color: 'var(--twin-muted)',
        opacity: dim ? 0.3 : 1,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {child}
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
      {iconBtn(<IconClose size={13} />, 'Salir del entreno')}
      {iconBtn(<span style={{ fontSize: 16 }}>‖</span>, 'Pausar entreno')}
      {iconBtn(<IconChevron dir="left" size={13} />, 'Volver atrás', true)}
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: landscape ? 'flex-end' : 'center', gap: 1 }}>
        <span
          style={{
            font: 'italic 800 9px/1.1 var(--twin-font-sans)',
            letterSpacing: '0.08em',
            color: 'var(--twin-accent-text)',
          }}
        >
          BENCHMARK
        </span>
        <Mono size={11} color="var(--twin-muted)">{MARCA.label.toUpperCase()}</Mono>
      </div>
      {!landscape && <span style={{ width: 80 }} />}
    </div>
  );
}

export function ConnChip({ texto, on }: { texto: string; on: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 8px',
        borderRadius: RAD.s,
        color: on ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
        background: on ? 'color-mix(in srgb, var(--twin-accent) 14%, transparent)' : 'var(--twin-surface)',
        border: `1px solid ${on ? 'color-mix(in srgb, var(--twin-accent-text) 50%, transparent)' : 'var(--twin-outline)'}`,
        font: 'italic 800 9px/1 var(--twin-font-sans)',
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
      }}
    >
      ♥ {texto}
    </span>
  );
}

/** contextStrip en modo count-in (ErgHUDContent): solo la etiqueta "Prepárate"
 * — el número vive en `CountInBody`, no aquí. */
export function PreparateStrip() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '7px 10px',
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
      }}
    >
      <Label size={10} color="var(--twin-accent-text)">Prepárate</Label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Los tres cuerpos de ErgHUDContent.body
// ---------------------------------------------------------------------------

/** countInBody: el 3-2-1 ES la pantalla — sustituye goal/héroe/raíl mientras
 * dura, nunca se posa encima de ellos. */
export function CountInBody({ landscape, restante, workLine }: { landscape: boolean; restante: number; workLine: string }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Mono size={landscape ? 150 : 190} weight={800} color="var(--twin-accent-text)" style={{ lineHeight: 1 }}>
        {restante}
      </Mono>
      <Display size={20} tracking="0.05em">{workLine.toUpperCase()}</Display>
    </div>
  );
}

/** unmeasuredBody: sin monitor, el sujeto es el trabajo prescrito, no un raíl
 * de rayas. Los metros ya remados ANTES de la caída se quedan quietos. */
export function UnmeasuredBody({ landscape, metrosAlCaer }: { landscape: boolean; metrosAlCaer: number }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Display size={landscape ? 64 : 76} tracking="-0.01em">{TRAMO_WORK_LINE}</Display>
        <span
          style={{
            font: '800 15px/1.2 var(--twin-font-sans)',
            letterSpacing: '0.093em',
            textTransform: 'uppercase',
            color: 'var(--twin-muted)',
          }}
        >
          {TRAMO_LABEL}
        </span>
      </div>
      {metrosAlCaer >= 1 && (
        <Mono size={12} weight={600} color="var(--twin-muted)" style={{ textAlign: 'center' }}>
          {Math.floor(metrosAlCaer)} m antes de perder el monitor
        </Mono>
      )}
      <span style={{ flex: 1 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 11,
          borderRadius: RAD.m,
          background: 'color-mix(in srgb, var(--twin-warning) 14%, transparent)',
        }}
      >
        <span style={{ color: 'var(--twin-fg)', display: 'inline-flex', flex: '0 0 auto' }}>
          <IconAntennaSlash size={14} />
        </span>
        <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          Sin monitor. Puedes hacerlo igual, pero no se medirá solo.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas del HUD conectado (goalBox / heroCard / workRail de ErgHUDContent)
// ---------------------------------------------------------------------------

/** goalBox: lo que FALTA (no lo cubierto) es la cifra grande — mid-piece nadie
 * pregunta "cuánto llevo", pregunta "cuánto me queda". El acumulado del bloque
 * se calla aquí a propósito: en una pieza continua sin series coincide siempre
 * con el cubierto de abajo, y Swift también lo calla cuando los dos son iguales. */
export function GoalBox({ metros }: { metros: number }) {
  const target = MARCA.distanciaM;
  const left = Math.max(0, target - metros);
  const remaining = Math.round(left);
  const coveredDisplay = Math.trunc(metros);
  const fraction = Math.min(1, metros / target);
  const done = left <= 0;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: '12px 14px',
        borderRadius: 14,
        background: 'var(--twin-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <Mono size={40} weight={800} color={done ? 'var(--twin-ok)' : 'var(--twin-fg)'} style={{ lineHeight: 1 }}>
          {remaining}
        </Mono>
        <Mono size={15} weight={800} color="var(--twin-muted)">m</Mono>
        <span style={{ flex: 1 }} />
        <Mono size={12} weight={600} color="var(--twin-muted)">
          {coveredDisplay} / {target} m
        </Mono>
      </div>
      <div style={{ height: 12, borderRadius: 6, background: 'var(--twin-surface-sunken)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${fraction * 100}%`,
            background: done ? 'var(--twin-ok)' : 'var(--twin-accent)',
            transition: 'width 900ms linear',
          }}
        />
      </div>
      <span
        style={{
          font: '800 10px/1.1 var(--twin-font-sans)',
          letterSpacing: '0.12em',
          color: done ? 'var(--twin-ok)' : 'var(--twin-muted)',
        }}
      >
        {done ? 'HECHO' : 'TE QUEDAN'}
      </span>
    </div>
  );
}

export function HeroCard({
  split,
  splitSize,
  media,
  tiempo,
  tiempoLabel,
  sinSplitMotivo,
}: {
  split: string | null;
  splitSize: number;
  media: string | null;
  tiempo: string;
  tiempoLabel: string;
  sinSplitMotivo: string;
}) {
  return (
    <Card padding={SP.m} topAccent elevated>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Label size={10}>Split · real</Label>
        {split ? (
          <>
            <Mono size={splitSize} weight={800} style={{ lineHeight: 1 }}>
              {split}
            </Mono>
            <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>/500m</span>
          </>
        ) : (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: splitSize * 0.6,
              textAlign: 'center',
              font: '600 15px/1.3 var(--twin-font-sans)',
              color: 'var(--twin-muted)',
            }}
          >
            {sinSplitMotivo}
          </span>
        )}
        <Hairline style={{ alignSelf: 'stretch', margin: '6px 0' }} />
        <div style={{ display: 'flex', gap: 8, alignSelf: 'stretch' }}>
          <SubReadout value={media} label="media /500m" ausente={sinSplitMotivo} />
          <SubReadout value={tiempo} label={tiempoLabel} />
        </div>
      </div>
    </Card>
  );
}

function SubReadout({ value, label, ausente }: { value: string | null; label: string; ausente?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {value !== null ? (
        <Mono size={30} weight={800}>{value}</Mono>
      ) : (
        <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
          {ausente}
        </span>
      )}
      <span
        style={{
          font: '600 10px/1 var(--twin-font-mono)',
          letterSpacing: '0.06em',
          color: 'var(--twin-muted)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** workRail: s/min · vatios · pulso, y NADA más — calorías, cal/h, drag, media
 * y proyección son datos de pre-inicio / descanso, no del gesto en marcha
 * (ErgHUDContent, doc de cabecera). `valor` nil pinta el porqué, nunca "—". */
export function RailTile({
  value,
  label,
  color = 'var(--twin-fg)',
  ausente = SIN_LECTURA_MOTIVO,
}: {
  value: string | null;
  label: string;
  color?: string;
  ausente?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '11px 4px',
        borderRadius: 12,
        background: 'var(--twin-surface)',
        minWidth: 0,
      }}
    >
      {value !== null ? (
        <Mono size={32} weight={800} color={color}>{value}</Mono>
      ) : (
        <span style={{ font: '500 11px/1.25 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
          {ausente}
        </span>
      )}
      <span
        style={{
          font: '800 9px/1 var(--twin-font-sans)',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
}
