'use client';

// El HUD del erg en vivo — espejo de ios/FAHYBRIK/Devices/PM5/ErgHUDContent.swift
// más el chrome que lo envuelve en ActiveWorkoutView (topStrip, ConnectionStrip,
// PM5ProgramBanner, botón TERMINAR). UNA vista, DOS disposiciones: retrato apila
// goal/héroe/raíles; horizontal pone goal y raíles a los lados del número grande.
// Todos los valores derivan de la curva fija de data.ts, así el monitor del
// doble no puede contradecirse.
//
// El body cambia de SUJETO, no de decorado (ErgHUDContent.body): contando el
// 3-2-1 el sujeto es la cuenta; sin monitor el sujeto es el trabajo prescrito;
// remando, el sujeto es el split. Cada uno se queda con TODA la pantalla
// mientras es cierto — nunca un HUD normal con sus cifras tachadas por rayas.
//
// Las piezas puramente presentacionales (chrome + los tres cuerpos + goalBox /
// heroCard / workRail) viven en `./ui` — este fichero es solo el reloj de la
// pieza y la disposición retrato/horizontal (§ Files under 500 lines).

import { useState } from 'react';
import { hrZone, useTicker, useTimeline } from '../../sim';
import { PM5Chip } from './connect';
import {
  BottomButton,
  ConnChip,
  CountInBody,
  GoalBox,
  HeroCard,
  Mono,
  PreparateStrip,
  ProgramLine,
  RailTile,
  SP,
  TopStrip,
  UnmeasuredBody,
} from './ui';
import {
  UMBRAL_BPM,
  MARCA,
  SEGUNDO_FINAL,
  SIN_LECTURA_MOTIVO,
  TIEMPOS,
  TIEMPO_FINAL_S,
  TRAMO_LABEL,
  TRAMO_WORK_LINE,
  fmtDeltaMarca,
  fmtElapsed,
  fmtMarca,
  metrosEn,
  pulsoEn,
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

  // Caída del enlace: `session.tramoErgDistanceMeters` no sigue el reloj de la
  // pieza mientras el monitor está mudo, así que lo que se enseña es lo ya
  // remado ANTES de perderlo (`metrosAlCaer`, fijo), no un contador que siga
  // avanzando a escondidas del propio HUD que dice "sin monitor".
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
  // sinSplitMotivo (ErgHUDContent): antes de la primera palada no ha llegado
  // nada del monitor; a partir de ahí, un split ausente es "no estás remando".
  // La curva de esta pieza no para a mitad, así que solo el primer caso ocurre.
  const sinSplitMotivo = ts > 0 ? 'sin remar' : SIN_LECTURA_MOTIVO;
  const split = vivo ? fmtMarca(ritmo) : null;
  const mediaStr = vivo && media ? fmtMarca(media) : null;
  const tiempo = fmtElapsed(done ? TIEMPO_FINAL_S : ts);
  // tramoTimeLabel: el reloj de la serie está "armado" hasta la primera palada.
  const tiempoLabel = ts > 0 ? 'esta serie' : 'empieza al remar';
  const spm = vivo ? spmEn(ts) : null;
  const vatios = vivo ? vatiosDesdeRitmo(ritmo) : null;
  const pulso = enPieza ? pulsoEn(ts) : null;
  const zona = pulso ? hrZone(pulso, UMBRAL_BPM) : null;
  const metrosAlCaer = metrosEn(TIEMPOS.caidaEnS);

  const hud = landscape ? (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, alignItems: 'stretch' }}>
      <div style={{ width: 190, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <GoalBox metros={metros} />
        <span style={{ flex: 1 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <HeroCard
          split={split}
          splitSize={132}
          media={mediaStr}
          tiempo={tiempo}
          tiempoLabel={tiempoLabel}
          sinSplitMotivo={sinSplitMotivo}
        />
      </div>
      <div style={{ width: 128, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <RailTile value={spm !== null ? `${spm}` : null} label="s/min" />
        <RailTile value={vatios !== null ? `${vatios}` : null} label="vatios" color="var(--twin-accent-text)" />
        <RailTile
          value={pulso !== null ? `${pulso}` : null}
          label="pulso"
          color={zona ? `var(--twin-z${zona})` : 'var(--twin-fg)'}
          ausente="sin banda ni reloj"
        />
        <span style={{ flex: 1 }} />
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <GoalBox metros={metros} />
      <HeroCard
        split={split}
        splitSize={92}
        media={mediaStr}
        tiempo={tiempo}
        tiempoLabel={tiempoLabel}
        sinSplitMotivo={sinSplitMotivo}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <RailTile value={spm !== null ? `${spm}` : null} label="s/min" />
        <RailTile value={vatios !== null ? `${vatios}` : null} label="vatios" color="var(--twin-accent-text)" />
        <RailTile
          value={pulso !== null ? `${pulso}` : null}
          label="pulso"
          color={zona ? `var(--twin-z${zona})` : 'var(--twin-fg)'}
          ausente="sin banda ni reloj"
        />
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
            {TRAMO_LABEL}
          </span>
          <Mono size={12} color="var(--twin-muted)">{TRAMO_WORK_LINE}</Mono>
        </div>
      )}
      {!landscape && (
        <div style={{ display: 'flex', gap: 6 }}>
          <PM5Chip conectado={conectado} onClick={() => undefined} />
          <ConnChip texto="HR · Watch" on />
        </div>
      )}

      {/* contextStrip durante el count-in: solo "Prepárate" — sin serie que
          contar en una pieza continua. */}
      {countIn > 0 && <PreparateStrip />}
      {banner && (
        <ProgramLine
          text={banner === 'enviando' ? 'Enviando el entreno al PM5…' : 'Listo — rema para empezar'}
          tone={banner === 'enviando' ? 'accent' : 'ok'}
        />
      )}

      {/* Tres sujetos, tres cuerpos — nunca el HUD normal con sus cifras en
          "—" (ErgHUDContent.body: countInBody / unmeasuredBody / el HUD real). */}
      {countIn > 0 ? (
        <CountInBody landscape={landscape} restante={countIn} workLine={TRAMO_WORK_LINE} />
      ) : !conectado ? (
        <UnmeasuredBody landscape={landscape} metrosAlCaer={metrosAlCaer} />
      ) : (
        hud
      )}

      {!landscape && (
        <>
          <div style={{ flex: 1 }} />
          <BottomButton title="TERMINAR" onClick={onTerminar} />
        </>
      )}
    </div>
  );
}
