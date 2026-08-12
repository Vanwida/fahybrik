'use client';

// EL TROCEADO — una fila por tramo, o una por kilómetro. NUNCA los dos.
//
// Los kilómetros de un 6×800 no dicen nada (parten las series por la mitad) y
// los tramos de un rodaje no existen. La lectura decide cuál toca y aquí solo se
// pinta el que tocó.

import { Pill } from '@/components/v2/Pill';
import type { KmSplit } from '@fahybrid/shared/domain/running/km-splits';
import type {
  RecoveryComplianceVerdict,
  RecoveryDurationVerdict,
  RunComplianceVerdict,
  WorkDurationVerdict,
} from '@fahybrid/shared/domain/adherence';
import type { Lectura, TramoLeido } from './lectura';
import {
  distancia,
  reloj,
  tonoDuracionRecuperacion,
  tonoDuracionTrabajo,
  tonoRecuperacion,
  tonoTrabajo,
  VOZ_DURACION_RECUPERACION,
  VOZ_DURACION_TRABAJO,
  VOZ_MODO,
  VOZ_RECUPERACION,
  VOZ_TRABAJO,
} from './voz';

// ---------------------------------------------------------------------------
// Tramo a tramo
// ---------------------------------------------------------------------------

export function TablaTramos({ tramos, eje }: { tramos: TramoLeido[]; eje: Lectura['eje'] }) {
  if (tramos.length === 0) return null;
  return (
    <div className="flex flex-col gap-[3px]">
      {tramos.map((t) =>
        t.papel === 'recuperacion' ? (
          <FilaRecuperacion key={t.position} t={t} />
        ) : (
          <FilaTrabajo key={t.position} t={t} eje={eje} />
        ),
      )}
    </div>
  );
}

function FilaTrabajo({ t, eje }: { t: TramoLeido; eje: Lectura['eje'] }) {
  // En cuesta el ritmo bruto no se compara: lo que se lee es el TIEMPO. No es
  // una excepción de esta fila, es el eje que decidió la lectura entera.
  const cifra =
    eje === 'tiempo'
      ? t.duracionS != null
        ? reloj(t.duracionS)
        : null
      : t.ritmoSkm != null
        ? `${reloj(t.ritmoSkm)}/km`
        : null;
  // La medida del tramo: lo que se pidió medir. Si llevaba distancia, la
  // distancia; si no, el tiempo. Nunca las dos, que es ruido en una tabla.
  const medida = t.distanciaM != null ? distancia(t.distanciaM) : t.duracionS != null ? reloj(t.duracionS) : null;
  const veredicto = t.veredicto as RunComplianceVerdict | null;
  const duracion = t.veredictoDuracion as WorkDurationVerdict | null;

  return (
    <div className="flex items-center gap-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5">
      <span className="v2-num w-4 shrink-0 text-[13px] font-bold text-[color:var(--v2-faint)]">{t.n}</span>
      {medida ? (
        <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--v2-muted)]">{medida}</span>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {cifra ? <span className="v2-num shrink-0 text-[17px] font-semibold text-[color:var(--v2-fg)]">{cifra}</span> : null}
      {/* El pulso del tramo solo si se midió. Nunca un hueco con unidad. */}
      {t.fcMediaPpm != null ? (
        <span className="v2-num w-11 shrink-0 text-right text-xs text-[color:var(--v2-faint)]">
          {t.fcMediaPpm}
          <span className="ml-0.5 text-[9px]">ppm</span>
        </span>
      ) : null}
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {veredicto && veredicto !== 'sin_dato' ? (
          <Pill tone={tonoTrabajo(veredicto)} variant="soft">
            {VOZ_TRABAJO[veredicto]}
          </Pill>
        ) : null}
        {/* La duración solo cuando FALLA: que un tramo dure lo pedido es lo
            esperado y el agregado va arriba, así que no se esconde nada. */}
        {duracion === 'duracion_incompleta' ? (
          <Pill tone={tonoDuracionTrabajo(duracion)} variant="outline">
            {VOZ_DURACION_TRABAJO[duracion]}
          </Pill>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Las recuperaciones no son filas juzgadas con la misma vara que una serie: van
 * entre medias, en gris y en una línea. Pero desde que se juzgan (intensidad por
 * un lado, duración por otro) SÍ llevan su veredicto cuando lo tienen: que sean
 * secundarias no significa que se callen lo que se midió de ellas.
 */
function FilaRecuperacion({ t }: { t: TramoLeido }) {
  const detalle = [
    t.duracionS != null ? reloj(t.duracionS) : null,
    t.modo ? VOZ_MODO[t.modo] : null,
    // Parado no tiene ritmo y no se le inventa uno. Trotando sí, y es dato: es
    // la diferencia entre respetar la recuperación y correrla.
    t.modo !== 'parado' && t.ritmoSkm != null ? `a ${reloj(t.ritmoSkm)}/km` : null,
  ].filter((p): p is string => p != null);
  const veredicto = t.veredicto as RecoveryComplianceVerdict | null;
  const duracion = t.veredictoDuracion as RecoveryDurationVerdict | null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 pl-8 pr-3">
      <span className="text-[11px] leading-snug text-[color:var(--v2-faint)]">{detalle.join(' · ')}</span>
      {veredicto && veredicto !== 'sin_dato' ? (
        <Pill tone={tonoRecuperacion(veredicto)} variant="outline">
          {VOZ_RECUPERACION[veredicto]}
        </Pill>
      ) : null}
      {duracion === 'duracion_excedida' ? (
        <Pill tone={tonoDuracionRecuperacion(duracion)} variant="outline">
          {VOZ_DURACION_RECUPERACION[duracion]}
        </Pill>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kilómetro a kilómetro
// ---------------------------------------------------------------------------

/**
 * La barra de cada fila es proporcional a la VELOCIDAD, no al ritmo: con el
 * ritmo, el kilómetro más lento sería la barra más larga y se leería como el
 * mejor. Es la misma regla que la tabla del atleta.
 */
export function TablaKilometros({ kilometros }: { kilometros: KmSplit[] }) {
  const conRitmo = kilometros.filter((k) => k.avg_pace_s_per_km != null);
  if (kilometros.length === 0) return null;

  const velocidades = conRitmo.map((k) => 1000 / k.avg_pace_s_per_km!);
  const min = velocidades.length > 0 ? Math.min(...velocidades) : 0;
  const max = velocidades.length > 0 ? Math.max(...velocidades) : 0;
  const ancho = (skm: number) => {
    const v = 1000 / skm;
    return max === min ? 100 : 30 + 70 * ((v - min) / (max - min));
  };

  return (
    <div className="flex flex-col gap-[3px]">
      {kilometros.map((k) => (
        <div
          key={k.index}
          className="flex items-center gap-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2"
        >
          <span className="w-14 shrink-0 truncate text-xs text-[color:var(--v2-muted)]">
            {k.partial ? distancia(k.distance_m) : `km ${k.index}`}
          </span>
          {k.avg_pace_s_per_km != null ? (
            <>
              <span className="hidden min-w-0 flex-1 sm:flex">
                <span
                  className="h-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--v2-fg)_34%,transparent)]"
                  style={{ width: `${ancho(k.avg_pace_s_per_km)}%` }}
                />
              </span>
              <span className="min-w-0 flex-1 sm:hidden" />
              <span className="v2-num shrink-0 text-base font-semibold text-[color:var(--v2-fg)]">
                {reloj(k.avg_pace_s_per_km)}
                <span className="text-[11px] font-medium text-[color:var(--v2-muted)]">/km</span>
              </span>
              {k.avg_hr != null ? (
                <span className="v2-num w-11 shrink-0 text-right text-xs text-[color:var(--v2-faint)]">
                  {k.avg_hr}
                  <span className="ml-0.5 text-[9px]">ppm</span>
                </span>
              ) : null}
            </>
          ) : (
            // Ni una casilla vacía ni un guion: el kilómetro existió, y lo que
            // falta se dice con palabras.
            <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-[color:var(--v2-faint)]">
              No hay ritmo medido en este kilómetro
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
