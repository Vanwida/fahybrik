'use client';

// EL DESCANSO — la única parte del entreno de hierro que gobierna la app.
//
// Mientras trabajas manda el atleta; en cuanto sueltas la barra manda el reloj,
// y eso merece pantalla propia y no una esquina. El descanso ES la dosis: 90 s
// mal contados cambian la serie siguiente.
//
// El lienzo se tiñe de la zona del pulso que baja, con el MISMO `Ambiente` que
// el rodaje y el ergo (§10.1) — antes llevaba un tinte propio al 6-10 %, un
// tercio del compartido, y por eso esta pantalla no se reconocía como la misma
// app. Y lo que de verdad haces mientras descansas es RECUPERAR, así que el
// pulso cayendo es el segundo peldaño del numeral y no una fila de servicio
// (§10.6).
//
// El naranja no aparece hasta que se acaba, y entonces no lo pinta el fondo: lo
// pinta la acción, que en ese instante pasa a ser lo único que puede cerrar el
// tramo (`unicaSalida`, §10.5).

import { useState } from 'react';
import { Card, Hairline, IconCheckCircle, Label, Mono, SP } from '../../kit';
import { Ambiente, EtiquetaSujeto, FranjaAccion, MarcoVivo, Numeral, colorZona, zonaDe } from '../../kit-vivo';
import type { TwinAppearance } from '../../types';
import { reloj } from '../../datos-reales';
import { useTicker } from '../../sim';
import { BarraDescanso, Sujeto, dosisEnPeldanos, pastillaRir } from './atoms';
import { pulsoTras, serieTexto, type Prescripcion, type SerieHecha } from './data';

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
  appearance,
  onEmpezar,
  onLog,
}: {
  p: Prescripcion;
  totalS: number;
  serieHecha: SerieHecha;
  serieHechaIndice: number;
  siguienteIndice: number;
  conReloj: boolean;
  appearance: TwinAppearance;
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
  // Sin reloj en la muñeca no hay pulso, y sin pulso no hay zona ni tinte (§7).
  const ppm = conReloj ? pulsoTras(transcurrido) : null;
  const zona = zonaDe(ppm);
  const proxima = dosisEnPeldanos(p.reps, p.cargaKg);

  const sellada = serieTexto(serieHecha.reps, serieHecha.cargaKg) ?? 'sin medida';
  const siguiente = [`serie ${siguienteIndice + 1} de ${p.series}`, serieTexto(p.reps, p.cargaKg)]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Ambiente zona={zona} appearance={appearance} />
      <MarcoVivo
        cromo={
          <div style={{ display: 'flex', alignItems: 'baseline', width: '100%' }}>
            <Label size={10}>{fin ? 'listo' : 'descanso'}</Label>
            <span style={{ flex: 1 }} />
            <Mono size={12} color="var(--twin-muted)">
              {reloj(totalS)} de plan
            </Mono>
          </div>
        }
        contexto={
          <BarraDescanso
            fraccion={restante / totalS}
            tono={fin ? 'var(--twin-accent)' : conReloj ? colorZona(zona) : 'var(--twin-muted)'}
          />
        }
        sujeto={
          fin && proxima ? (
            <Sujeto encima="Te toca" dosis={proxima} nombre={p.ejercicio} pastilla={pastillaRir(p.rir)} />
          ) : (
            <>
              <EtiquetaSujeto>Afloja</EtiquetaSujeto>
              <Numeral>{reloj(restante)}</Numeral>
              {/* Lo que de verdad haces aquí es recuperar, y eso se mide: el
                  pulso es el segundo peldaño, no una fila de servicio (§10.6). */}
              {ppm !== null && (
                <>
                  <Numeral escala="segundo" tono={colorZona(zona)} unidad="ppm">
                    {ppm}
                  </Numeral>
                  <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
                    de tu reloj · zona sobre umbral estimado
                  </span>
                </>
              )}
            </>
          )
        }
        apoyos={
          <Cierre
            sellada={`serie ${serieHechaIndice + 1} · ${sellada}`}
            cola={serieHecha.rirSentido != null ? `te quedaban ${serieHecha.rirSentido}` : undefined}
            siguiente={siguiente}
          />
        }
        accion={
          fin ? (
            <FranjaAccion
              titulo={`EMPEZAR LA SERIE ${siguienteIndice + 1}`}
              unicaSalida
              onClick={() => {
                onLog(`Empieza la serie ${siguienteIndice + 1}`);
                onEmpezar();
              }}
            />
          ) : (
            // Saltar NO es la única salida: el reloj cierra el descanso solo. Por
            // eso va en contorno y el naranja se guarda para cuando toca (§10.5).
            <FranjaAccion
              titulo="Saltar el descanso"
              nota={`quedan ${reloj(restante)}`}
              onClick={() => {
                onLog(`Descanso saltado con ${reloj(restante)} por delante`);
                setRestante(0);
              }}
            />
          )
        }
      />
    </>
  );
}
