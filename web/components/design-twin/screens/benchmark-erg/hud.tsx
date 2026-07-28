'use client';

// El HUD del erg en vivo — espejo de ios/FAHYBRIK/Devices/PM5/ErgHUDContent.swift
// más el chrome que lo envuelve en ActiveWorkoutView (topStrip, ConnectionStrip,
// PM5ProgramBanner, botón TERMINAR). UNA vista, DOS disposiciones: retrato apila
// metros/héroe/raíles; horizontal pone los raíles a los lados del número grande
// (la cara ErgData). Todos los valores derivan de la curva fija de data.ts, así
// el monitor del doble no puede contradecirse.

import { useState, type ReactNode } from 'react';
import { hrZone, useTicker, useTimeline } from '../../sim';
import { PM5Chip } from './connect';
import {
  BottomButton,
  Card,
  Hairline,
  IconChevron,
  IconClose,
  Label,
  Mono,
  ProgramLine,
  RAD,
  SP,
} from './ui';
import {
  FC_MAX,
  MARCA,
  SEGUNDO_FINAL,
  TIEMPOS,
  TIEMPO_FINAL_S,
  caloriasEn,
  calPorHoraDesdeVatios,
  fmtDeltaMarca,
  fmtElapsed,
  fmtMarca,
  metrosEn,
  ritmoEn,
  ritmoMedioEn,
  spmEn,
  vatiosDesdeRitmo,
} from './data';

export interface ErgHUDProps {
  landscape: boolean;
  /** Monitor sucio: la programación tarda más (terminate + program). */
  programarMs: number;
  /** El enlace se cae a mitad de pieza y vuelve a los 3 s. */
  conCaida: boolean;
  onTerminar: () => void;
  onLog: (linea: string) => void;
}

type Banner = 'enviando' | 'listo' | null;

export function ErgHUD({ landscape, programarMs, conCaida, onTerminar, onLog }: ErgHUDProps) {
  // Cuenta atrás de WorkoutSession (count-in) → luego corre la pieza.
  const [countIn, setCountIn] = useState<number>(TIEMPOS.countInS);
  const [t, setT] = useState(0); // segundo de pieza
  const [banner, setBanner] = useState<Banner>('enviando');
  const [conectado, setConectado] = useState(true);

  useTimeline([
    {
      at: programarMs,
      run: () => {
        setBanner('listo');
        onLog('Listo — rema para empezar');
      },
    },
  ]);

  // El 3-2-1 del motor. Al llegar a 0 arranca la pieza; el banner se retira en
  // cuanto fluyen los primeros metros (el anuncio ya cumplió).
  useTicker(countIn > 0, (s) => setCountIn(Math.max(0, TIEMPOS.countInS - s)));
  const enPieza = countIn <= 0;
  const done = t >= SEGUNDO_FINAL;
  useTicker(enPieza && !done, (s) => {
    setT(s);
    if (s === 1) setBanner(null);
  });

  // Caída del enlace: los valores en vivo se guardan tras `pm5.isConnected` en la
  // app, así que aquí simplemente se apagan a «—» hasta que vuelve.
  useTimeline(
    [
      { at: TIEMPOS.caidaEnS * 1000, run: () => { setConectado(false); onLog('Conexión con el PM5 perdida'); } },
      { at: TIEMPOS.caidaEnS * 1000 + 3000, run: () => { setConectado(true); onLog('PM5 reconectado — el monitor no perdió la pieza'); } },
    ],
    conCaida && enPieza,
  );

  useTimeline(
    [
      {
        at: (SEGUNDO_FINAL + 1) * 1000,
        run: () => {
          const delta = fmtDeltaMarca(MARCA.prSegundos, TIEMPO_FINAL_S);
          onLog(`Pieza completada: ${fmtMarca(TIEMPO_FINAL_S)}${delta ? ` (${delta.label} vs tu marca)` : ''}`);
        },
      },
    ],
    enPieza,
  );

  // Derivados del segundo actual — congelados al cruzar los 500 m.
  const ts = done ? SEGUNDO_FINAL : t;
  const metros = Math.min(MARCA.distanciaM, metrosEn(ts));
  const ritmo = ritmoEn(ts);
  const media = ritmoMedioEn(ts);
  const vivo = conectado && enPieza && ts > 0;
  const split = vivo ? fmtMarca(ritmo) : '—:—';
  const mediaStr = vivo && media ? fmtMarca(media) : '—:—';
  const tiempo = fmtElapsed(done ? TIEMPO_FINAL_S : ts);
  const spm = vivo ? `${spmEn(ts)}` : '—';
  const vatios = vivo ? `${vatiosDesdeRitmo(ritmo)}` : '—';
  const vatiosMedios = vivo && media ? `${vatiosDesdeRitmo(media)}` : '—';
  const cal = vivo ? `${caloriasEn(ts)}` : '—';
  const calH = vivo ? `${calPorHoraDesdeVatios(vatiosDesdeRitmo(ritmo))}` : '—';
  const pulso = enPieza ? 118 + Math.round(60 * Math.min(1, ts / 95) ** 0.75) : null;
  const zona = pulso ? hrZone(pulso, FC_MAX) : null;
  const proyeccion =
    vivo && metros > 0 && metros < MARCA.distanciaM
      ? fmtElapsed(ts + (MARCA.distanciaM - metros) * (ritmo / 500))
      : null;

  const hud = landscape ? (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, alignItems: 'stretch' }}>
      <div style={{ width: 172, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <MetersBox metros={metros} conectado={conectado} />
        <RailTile value={spm} label="s/min" />
        <RailTile value={vatios} label="vatios" color="var(--twin-accent-text)" />
        <RailTile value={vatiosMedios} label="vatios medios" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <HeroCard split={split} splitSize={112} media={mediaStr} tiempo={tiempo} />
      </div>
      <div style={{ width: 150, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <RailTile value={cal} label="cal" />
        <RailTile value={calH} label="cal/h" />
        {proyeccion && <RailTile value={proyeccion} label="proyección" />}
        <RailTile value={pulso ? `${pulso}` : '—'} label="pulso" color={zona ? `var(--twin-z${zona})` : 'var(--twin-fg)'} />
        <RailTile value={conectado ? `${118}` : '—'} label="drag" />
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <MetersBox metros={metros} conectado={conectado} />
      <HeroCard split={split} splitSize={92} media={mediaStr} tiempo={tiempo} />
      <div style={{ display: 'flex', gap: 8 }}>
        <RailTile value={spm} label="s/min" />
        <RailTile value={vatios} label="vatios" color="var(--twin-accent-text)" />
        <RailTile value={vatiosMedios} label="vatios medios" />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <RailTile value={cal} label="cal" />
        <RailTile value={calH} label="cal/h" />
        {proyeccion && <RailTile value={proyeccion} label="proyección" />}
        <RailTile value={pulso ? `${pulso}` : '—'} label="pulso" color={zona ? `var(--twin-z${zona})` : 'var(--twin-fg)'} />
        <RailTile value={conectado ? '118' : '—'} label="drag" />
      </div>
    </div>
  );

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: landscape ? 6 : 8,
        padding: landscape ? `4px ${SP.m}px 6px` : `${SP.s}px ${SP.m}px 10px`,
      }}
    >
      <TopStrip landscape={landscape} />
      {landscape && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              font: 'italic 800 12px/1.2 var(--twin-font-sans)',
              letterSpacing: '0.03em',
              color: 'var(--twin-accent-text)',
            }}
          >
            {MARCA.label}
          </span>
          <Mono size={12} color="var(--twin-muted)">{MARCA.distanciaM} m</Mono>
        </div>
      )}
      {!landscape && (
        <div style={{ display: 'flex', gap: 6 }}>
          <PM5Chip conectado={conectado} onClick={() => undefined} />
          <ConnChip texto="HR · Watch" on />
        </div>
      )}

      {countIn > 0 && <CountInStrip restante={countIn} />}
      {banner && (
        <ProgramLine
          text={banner === 'enviando' ? 'Enviando el entreno al PM5…' : 'Listo — rema para empezar'}
          tone={banner === 'enviando' ? 'accent' : 'ok'}
        />
      )}

      {hud}

      {!landscape && (
        <>
          <div style={{ flex: 1 }} />
          <BottomButton title="TERMINAR" onClick={onTerminar} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chrome — topStrip de ActiveWorkoutView (salir / pausa / atrás + fase y tramo)
// ---------------------------------------------------------------------------

function TopStrip({ landscape }: { landscape: boolean }) {
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

function ConnChip({ texto, on }: { texto: string; on: boolean }) {
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

/** seriesStrip en modo count-in: «PREPÁRATE 3». */
function CountInStrip({ restante }: { restante: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
      }}
    >
      <Label size={10} color="var(--twin-accent-text)">Prepárate</Label>
      <Mono size={15} weight={800} color="var(--twin-accent-text)">{restante}</Mono>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas del HUD (metersBox / heroCard / railTile de ErgHUDContent)
// ---------------------------------------------------------------------------

function MetersBox({ metros, conectado }: { metros: number; conectado: boolean }) {
  const covered = conectado ? Math.floor(metros) : null;
  const target = MARCA.distanciaM;
  const done = (covered ?? 0) >= target;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 12px',
        borderRadius: 14,
        background: 'var(--twin-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
        <Mono size={26} weight={800} color={done ? 'var(--twin-ok)' : 'var(--twin-fg)'}>
          {covered ?? '—'}
        </Mono>
        <Mono size={13} weight={600} color="var(--twin-muted)">/ {target} m</Mono>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--twin-surface-sunken)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, ((covered ?? 0) / target) * 100)}%`,
            background: done ? 'var(--twin-ok)' : 'var(--twin-accent)',
            transition: 'width 900ms linear',
          }}
        />
      </div>
      <span
        style={{
          font: '800 9px/1 var(--twin-font-sans)',
          letterSpacing: '0.08em',
          color: 'var(--twin-muted)',
          textAlign: 'center',
        }}
      >
        METROS
      </span>
    </div>
  );
}

function HeroCard({ split, splitSize, media, tiempo }: { split: string; splitSize: number; media: string; tiempo: string }) {
  return (
    <Card padding={SP.m} topAccent elevated>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Label size={10}>Split · real</Label>
        <Mono size={splitSize} weight={800} style={{ lineHeight: 1 }}>
          {split}
        </Mono>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>/500m</span>
        <Hairline style={{ alignSelf: 'stretch', margin: '6px 0' }} />
        <div style={{ display: 'flex', gap: 8, alignSelf: 'stretch' }}>
          <SubReadout value={media} label="media /500m" />
          <SubReadout value={tiempo} label="tiempo" />
        </div>
      </div>
    </Card>
  );
}

function SubReadout({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Mono size={30} weight={800}>{value}</Mono>
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

function RailTile({ value, label, color = 'var(--twin-fg)' }: { value: string; label: string; color?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '9px 4px',
        borderRadius: 12,
        background: 'var(--twin-surface)',
        minWidth: 0,
      }}
    >
      <Mono size={21} weight={800} color={color}>{value}</Mono>
      <span
        style={{
          font: '800 8px/1 var(--twin-font-sans)',
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
