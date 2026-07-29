'use client';

// EL DESCANSO — la única parte del entreno de hierro que gobierna la app.
//
// Mientras trabajas manda el atleta; en cuanto sueltas la barra manda el reloj,
// y eso merece pantalla propia y no una esquina. El descanso ES la dosis: 90 s
// mal contados cambian la serie siguiente.
//
// La pantalla se tiñe de la zona del pulso que baja — calma medida, no un rojo
// de alarma: aquí no pasa nada malo, estás recuperando. El naranja no aparece
// hasta que se acaba, y entonces es lo único naranja que hay.

import { useState } from 'react';
import { Card, Hairline, IconCheckCircle, IconHeart, Label, Mono, Pantalla, SP, SecondaryCTA, CTA } from '../../kit';
import { UMBRAL, reloj } from '../../datos-reales';
import { hrZone, useTicker } from '../../sim';
import { Sujeto, pastillaRir } from './atoms';
import { pulsoTras, serie, serieTexto, type Prescripcion, type SerieHecha } from './data';

const R_ANILLO = 92;
const GROSOR = 13;
const PERIMETRO = 2 * Math.PI * R_ANILLO;

function Anillo({ fraccion, color, children }: { fraccion: number; color: string; children: React.ReactNode }) {
  const lado = (R_ANILLO + GROSOR) * 2;
  return (
    <div style={{ position: 'relative', width: lado, height: lado }}>
      <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} aria-hidden>
        <g transform={`rotate(-90 ${lado / 2} ${lado / 2})`} fill="none" strokeLinecap="round">
          <circle
            cx={lado / 2}
            cy={lado / 2}
            r={R_ANILLO}
            stroke="var(--twin-hairline-strong)"
            strokeWidth={GROSOR}
          />
          <circle
            cx={lado / 2}
            cy={lado / 2}
            r={R_ANILLO}
            stroke={color}
            strokeWidth={GROSOR}
            strokeDasharray={PERIMETRO}
            strokeDashoffset={PERIMETRO * (1 - Math.max(0, Math.min(1, fraccion)))}
            style={{ transition: 'stroke-dashoffset 900ms linear, stroke 900ms ease-out' }}
          />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
    </div>
  );
}

/** El pulso, solo si hay reloj. Sin reloj esta fila no existe (§7). */
function Pulso({ ppm }: { ppm: number }) {
  const zona = hrZone(ppm, UMBRAL.ppm);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
        <span style={{ color: `var(--twin-z${zona})`, display: 'inline-flex' }}>
          <IconHeart size={13} />
        </span>
        <Mono size={26} weight={800}>
          {ppm}
        </Mono>
        <Label size={10}>ppm</Label>
        <span className="tw-zone" data-zone={zona} style={{ marginLeft: 2 }}>
          Z{zona}
        </span>
      </div>
      <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
        de tu reloj · zona sobre umbral estimado
      </span>
    </div>
  );
}

function Cierre({
  sellada,
  cola,
  siguiente,
}: {
  sellada: string;
  /** Lo que el atleta declaró además de la serie. Ausente = no lo dijo. */
  cola?: string;
  siguiente: string;
}) {
  return (
    <Card padding={0}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.m, padding: '11px 13px' }}>
        <span style={{ color: 'var(--twin-ok)', display: 'inline-flex' }}>
          <IconCheckCircle size={15} />
        </span>
        <span style={{ flex: 1, font: '600 13px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Hecha
        </span>
        {cola && (
          <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{cola}</span>
        )}
        <Mono size={14} weight={700}>
          {sellada}
        </Mono>
      </div>
      <Hairline />
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.m, padding: '11px 13px' }}>
        <span style={{ flex: 1, font: '600 13px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Luego
        </span>
        <Mono size={14} weight={700} color="var(--twin-fg)">
          {siguiente}
        </Mono>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function VistaDescanso({
  p,
  totalS,
  serieHecha,
  serieHechaIndice,
  siguienteIndice,
  conReloj,
  onEmpezar,
  onLog,
}: {
  p: Prescripcion;
  totalS: number;
  serieHecha: SerieHecha;
  serieHechaIndice: number;
  siguienteIndice: number;
  conReloj: boolean;
  onEmpezar: () => void;
  onLog: (linea: string) => void;
}) {
  const [restante, setRestante] = useState(totalS);
  const fin = restante <= 0;

  useTicker(!fin, (s) => {
    const queda = Math.max(0, totalS - s);
    setRestante(queda);
    if (queda === 60 || queda === 30 || queda === 10) onLog(`Quedan ${reloj(queda)}`);
    if (queda === 0) onLog(`Descanso terminado · te toca la serie ${siguienteIndice + 1}`);
  });

  const transcurrido = totalS - restante;
  const ppm = pulsoTras(transcurrido);
  const zona = hrZone(ppm, UMBRAL.ppm);
  const proxima = serie(p.reps, p.cargaKg);

  const sellada = serieTexto(serieHecha.reps, serieHecha.cargaKg) ?? 'sin medida';
  const siguiente = [`serie ${siguienteIndice + 1} de ${p.series}`, serieTexto(p.reps, p.cargaKg)]
    .filter(Boolean)
    .join(' · ');

  const tinte = fin
    ? 'color-mix(in srgb, var(--twin-accent) 7%, transparent)'
    : `color-mix(in srgb, var(--twin-z${zona}) ${conReloj ? 10 : 6}%, transparent)`;

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: tinte, transition: 'background 900ms ease-out' }}
      />
      <div style={{ position: 'relative', height: '100%' }}>
        <Pantalla
          accion={
            fin ? (
              <CTA
                title={`EMPEZAR LA SERIE ${siguienteIndice + 1}`}
                height={88}
                onClick={() => {
                  onLog(`Empieza la serie ${siguienteIndice + 1}`);
                  onEmpezar();
                }}
              />
            ) : (
              <SecondaryCTA
                title="Saltar el descanso"
                height={54}
                onClick={() => {
                  onLog(`Descanso saltado con ${reloj(restante)} por delante`);
                  setRestante(0);
                }}
              />
            )
          }
        >
          <div style={{ display: 'flex', alignItems: 'baseline', flex: '0 0 auto' }}>
            <Label size={10}>{fin ? 'listo' : 'descanso'}</Label>
            <span style={{ flex: 1 }} />
            <Mono size={12} color="var(--twin-muted)">
              {reloj(totalS)} de plan
            </Mono>
          </div>

          {fin && proxima ? (
            <Sujeto
              encima="Te toca"
              cifra={proxima.cifra}
              unidad={proxima.unidad}
              nombre={p.ejercicio}
              pastilla={pastillaRir(p.rir)}
            />
          ) : (
            <div
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: SP.l,
              }}
            >
              <Anillo fraccion={restante / totalS} color={conReloj ? `var(--twin-z${zona})` : 'var(--twin-muted)'}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span
                    style={{
                      fontFamily: 'var(--twin-font-mono)',
                      fontWeight: 800,
                      fontSize: 'clamp(46px, 11vh, 66px)',
                      lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--twin-fg)',
                    }}
                  >
                    {reloj(restante)}
                  </span>
                  <Label size={9}>afloja</Label>
                </div>
              </Anillo>
              {conReloj && <Pulso ppm={ppm} />}
            </div>
          )}

          <Cierre
            sellada={`serie ${serieHechaIndice + 1} · ${sellada}`}
            cola={serieHecha.rirSentido != null ? `te quedaban ${serieHecha.rirSentido}` : undefined}
            siguiente={siguiente}
          />
        </Pantalla>
      </div>
    </div>
  );
}
