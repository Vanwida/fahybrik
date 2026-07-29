'use client';

// La ventana muere a cero. Y lo que queda en la pantalla es el resultado, sin
// redondear y sin inventar.
//
// El AMRAP es el único formato donde la app NO puede saber sola su puntuación:
// las rondas las tocaste tú y la parcial de la última se quedó a medias. Así
// que el sellado hace exactamente dos cosas:
//
//   1. sella solo lo que está MEDIDO o MARCADO — las rondas cerradas, sus
//      tiempos, y las reps de los movimientos que marcaste;
//   2. pregunta UNA vez por lo que falta, y acepta que la respuesta sea nada.
//
// Es la 0088 en pantalla: `reps_confirmed` solo es verdad si el atleta tocó el
// valor, y en las reps de un AMRAP un 0 REAL es legal. Por eso el contador
// arranca en 0 y por eso guardar sin tocarlo es una respuesta válida: se sella
// «6 rondas y 10 reps», que es verdad, en vez de un 14 fabricado que no lo es.

import { useState } from 'react';
import { CTA, Card, Display, Hairline, Label, Mono, Pantalla, SP } from '../../kit';
import { UMBRAL, reloj } from '../../datos-reales';
import { hrZone } from '../../sim';
import {
  VENTANA_S,
  comparaConLaPrimera,
  marcador,
  palabraReps,
  palabraRondas,
  ventana,
  type MovimientoAmrap,
} from './data';

export interface RondaCerrada {
  /** 1-based, como se cuenta en el box. */
  indice: number;
  duracionS: number;
}

export interface SelladoProps {
  rondas: RondaCerrada[];
  /** Reps de los movimientos que marcaste en la ronda que quedó a medias. */
  repsMarcadas: number;
  /** En qué movimiento te pilló la bocina. Nulo = no quedó nada a medias. */
  movimientoEnCurso: MovimientoAmrap | null;
  /** Del reloj. Nulo si no había reloj emparejado: entonces no se pinta. */
  pulsoMaxPpm: number | null;
  onLog: (linea: string) => void;
}

export function Sellado({ rondas, repsMarcadas, movimientoEnCurso, pulsoMaxPpm, onLog }: SelladoProps) {
  const [declaradas, setDeclaradas] = useState(0);
  const [guardado, setGuardado] = useState(false);

  const totalReps = repsMarcadas + declaradas;
  const splits = rondas.map((r) => r.duracionS);
  const preguntaAbierta = movimientoEnCurso !== null && !guardado;

  return (
    <Pantalla
      accion={
        <CTA
          title={guardado ? 'IR AL RESUMEN' : 'GUARDAR EL RESULTADO'}
          height={64}
          onClick={() => {
            if (guardado) {
              onLog('Al resumen del entreno · el marcador viaja al coach con el resto de la sesión');
              return;
            }
            setGuardado(true);
            onLog(
              `Sellado: ${marcador(rondas.length, totalReps)}` +
                (declaradas > 0 ? ` · ${declaradas} las pusiste tú` : ' · nada declarado a mano'),
            );
          }}
        />
      }
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: '0 0 auto', padding: '0 2px' }}>
        <Label size={10} color="var(--twin-accent-text)">
          Se acabó la ventana
        </Label>
        <span style={{ flex: 1 }} />
        <Mono size={11} color="var(--twin-muted)">
          AMRAP {ventana(VENTANA_S)}
        </Mono>
      </div>

      <Marcador rondas={rondas.length} reps={totalReps} />

      {preguntaAbierta && movimientoEnCurso && (
        <Pregunta
          movimiento={movimientoEnCurso}
          valor={declaradas}
          onCambiar={(v) => {
            setDeclaradas(v);
            onLog(`Declaras ${v} ${movimientoEnCurso.unidad === 'cal' ? 'cal' : palabraReps(v)} de ${movimientoEnCurso.nombre}`);
          }}
        />
      )}

      {guardado && movimientoEnCurso && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px', flex: '0 0 auto' }}>
          <Label size={10}>De dónde sale</Label>
          <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {repsMarcadas} marcadas mientras entrenabas
            {declaradas > 0 ? ` y ${declaradas} de ${movimientoEnCurso.nombre} que pusiste tú` : ''}
          </span>
        </div>
      )}

      <Desglose rondas={rondas} splits={splits} repsSueltas={totalReps} />

      {pulsoMaxPpm !== null && <PulsoMaximo ppm={pulsoMaxPpm} />}
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// El sujeto: el marcador exacto
// ---------------------------------------------------------------------------

function Marcador({ rondas, reps }: { rondas: number; reps: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <Mono size={96} weight={800} style={{ lineHeight: 1 }}>
          {rondas}
        </Mono>
        <Display size={28}>{palabraRondas(rondas)}</Display>
      </div>
      {reps > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <Display size={22} color="var(--twin-muted)">
            y
          </Display>
          <Mono size={48} weight={800} color="var(--twin-accent-text)" style={{ lineHeight: 1 }}>
            {reps}
          </Mono>
          <Display size={22} color="var(--twin-muted)">
            {palabraReps(reps)}
          </Display>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La única pregunta — y se puede contestar que nada
// ---------------------------------------------------------------------------

function Pregunta({
  movimiento,
  valor,
  onCambiar,
}: {
  movimiento: MovimientoAmrap;
  valor: number;
  onCambiar: (v: number) => void;
}) {
  const unidad = movimiento.unidad === 'cal' ? 'cal' : palabraReps(valor);
  return (
    <Card padding={SP.m} topAccent>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* «de {nombre}» y no «en {nombre}»: encaja con los tres movimientos
            («de remo», «de wall balls», «de burpees») sin necesitar un artículo
            por ejercicio que la biblioteca no guarda. */}
        <span style={{ font: '600 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          Te pilló a medias. ¿Cuántas llevabas de {movimiento.nombre}?
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.m }}>
          <Paso signo="menos" onClick={() => onCambiar(Math.max(0, valor - 1))} disabled={valor <= 0} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
            <Mono size={34} weight={800}>
              {valor}
            </Mono>
            <Label size={10}>{unidad}</Label>
          </div>
          <Paso
            signo="mas"
            onClick={() => onCambiar(Math.min(movimiento.dosis, valor + 1))}
            disabled={valor >= movimiento.dosis}
          />
        </div>
        <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          Si no lo sabes, déjalo en cero: se guarda lo que marcaste y ya está.
        </span>
      </div>
    </Card>
  );
}

function Paso({ signo, onClick, disabled }: { signo: 'mas' | 'menos'; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={signo === 'mas' ? 'Una más' : 'Una menos'}
      style={{
        width: 56,
        height: 48,
        borderRadius: 14,
        border: '1px solid var(--twin-outline)',
        background: 'var(--twin-surface-elevated)',
        color: 'var(--twin-fg)',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'default' : 'pointer',
        font: '700 22px/1 var(--twin-font-sans)',
      }}
    >
      {signo === 'mas' ? '+' : '−'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// El contexto que gana el alto: qué pasó ronda a ronda
// ---------------------------------------------------------------------------

function Desglose({
  rondas,
  splits,
  repsSueltas,
}: {
  rondas: RondaCerrada[];
  splits: number[];
  repsSueltas: number;
}) {
  return (
    <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
      <Card padding={0} fill>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 12px 8px' }}>
          <Label size={10}>Ronda a ronda</Label>
          <span style={{ flex: 1 }} />
          <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            contra tu ronda 1
          </span>
        </div>
        {rondas.map((r, i) => {
          const compara = comparaConLaPrimera(splits, i);
          return (
            // `1 0 auto`: las filas se REPARTEN el alto que sobra y ninguna se
            // encoge por debajo de su contenido (§6.1). Con la pregunta ya
            // contestada sobran ~90 pt, y sin esto se quedaban de cola muerta
            // al pie de la tarjeta — el mismo fallo que el contrato persigue.
            <div key={r.indice} style={{ display: 'flex', flexDirection: 'column', flex: '1 0 auto' }}>
              <Hairline />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
                <Mono size={13} color="var(--twin-faint)" style={{ width: 16 }}>
                  {r.indice}
                </Mono>
                <Mono size={17} weight={700}>
                  {reloj(r.duracionS)}
                </Mono>
                <span style={{ flex: 1 }} />
                {compara && (
                  <span
                    style={{
                      font: '600 12px/1.2 var(--twin-font-sans)',
                      color: compara.deltaS > 0 ? 'var(--twin-warning)' : 'var(--twin-ok)',
                    }}
                  >
                    {compara.deltaS > 0 ? '+' : ''}
                    {compara.deltaS} s
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {repsSueltas > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 0 auto' }}>
            <Hairline />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
              <Mono size={13} color="var(--twin-faint)" style={{ width: 16 }}>
                {rondas.length + 1}
              </Mono>
              {/* Sin tiempo, a propósito: esta ronda no se cerró, así que no
                  tiene duración que enseñar. Lo que tiene son las reps. */}
              <span style={{ font: '500 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                sin cerrar
              </span>
              <span style={{ flex: 1 }} />
              <Mono size={13} weight={700} color="var(--twin-accent-text)">
                {repsSueltas} {palabraReps(repsSueltas)}
              </Mono>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function PulsoMaximo({ ppm }: { ppm: number }) {
  const zona = hrZone(ppm, UMBRAL.ppm);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        flex: '0 0 auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Label size={9}>Pulso máximo</Label>
        {/* El umbral de toda la base es estimado (DECISIONS 28-jul): la zona se
            enseña marcada como tal, que es distinto de no enseñarla. */}
        <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          del reloj · zona sobre umbral estimado
        </span>
      </div>
      <span style={{ flex: 1 }} />
      <Mono size={22} weight={800}>
        {ppm}
      </Mono>
      <Label size={10}>ppm</Label>
      <span className="tw-zone" data-zone={zona}>
        Z{zona}
      </span>
    </div>
  );
}
