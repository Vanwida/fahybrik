'use client';

// EL MANDO «COMPARAR» — de qué dos periodos hablamos, y qué salió.
//
// Se abre con una comparación DE VERDAD delante: el servidor elige el primer
// atajo que se pueda montar con las fechas del atleta (antes del plan contra con
// el plan; si aún no hay plan, el alta; y si no, el trimestre anterior contra
// éste). Dos calendarios en blanco serían obligar al coach a adivinar el periodo
// que él ya sabe que quiere mirar.
//
// LOS ATAJOS LOS CALCULA EL SERVIDOR. Son aritmética sobre hechos del atleta, y
// con una copia de esa cuenta aquí el chip acabaría ofreciendo un periodo y el
// endpoint sirviendo otro. Aquí sólo se elige y se pinta.
//
// A MEDIDA, PERO EN LUNES: la fecha que se teclea se ajusta al lunes de su
// semana en cuanto se escribe. La agregación trunca por semana, así que un
// martes sumaría una primera semana a medias en un lado y entera en el otro — y
// eso no se ve, se cuela.

import { useCallback, useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { pedirComparativa } from '../del-coach/api';
import { ErrorConReintento } from './ZonasAvisos';
import { ZonasComparativa } from './ZonasComparativa';
import { SelectorDePeriodos } from './SelectorDePeriodos';
import { parPorDefecto, type ParDePeriodos } from '@/lib/zones/comparativa';
import {
  comparacionEnOrden,
  type ComparePresetDTO,
  type ComparePresetKey,
  type ZoneComparisonDTO,
} from '@fahybrid/shared/domain/zone-compare';

type Eleccion = ComparePresetKey | 'libre';

const LIBRE: Eleccion = 'libre';

export function ZonasComparar({
  athleteId,
  onDarFeedback,
}: {
  athleteId: string;
  /** Convertir lo que está a la vista en una nota. Null mientras no haya nada. */
  onDarFeedback: (periodos: ParDePeriodos) => void;
}) {
  const [eleccion, setEleccion] = useState<Eleccion>(LIBRE);
  const [libre, setLibre] = useState<ParDePeriodos>(() => parPorDefecto());
  const [intento, setIntento] = useState(0);
  /** ¿Ya llegó la primera respuesta? Hasta entonces la elección la manda el
   *  servidor (su atajo de entrada) y no la pastilla que haya marcada. */
  const [arrancado, setArrancado] = useState(false);

  // Lo último que llegó, con la firma de lo que se pidió. «Cargando» se DEDUCE de
  // comparar esa firma con la de ahora, en vez de encenderse a mano al empezar
  // cada petición: así una respuesta que se cruza con otra no puede dejar el
  // bloque girando, y lo anterior se queda a la vista (atenuado) mientras llega.
  const [cargado, setCargado] = useState<{
    firma: string;
    presets: ComparePresetDTO[];
    comparativa: ZoneComparisonDTO | null;
  } | null>(null);
  const [fallo, setFallo] = useState<{ firma: string; mensaje: string } | null>(null);

  const presets = cargado?.presets ?? [];
  const elegido = presets.find((p) => p.key === eleccion) ?? null;
  const periodos: ParDePeriodos | null =
    eleccion === LIBRE
      ? libre
      : elegido?.a_start != null && elegido.b_start != null && elegido.weeks != null
        ? { a_start: elegido.a_start, b_start: elegido.b_start, weeks: elegido.weeks }
        : null;

  const enOrden = periodos == null || comparacionEnOrden(periodos);

  // La firma de lo que se está pidiendo. Sin ella, tocar la fecha de un lado
  // dispararía una petición por cada tecla y la última en llegar mandaría.
  const firma =
    !arrancado
      ? `entrada|${intento}`
      : periodos && enOrden
        ? `${periodos.a_start}|${periodos.b_start}|${periodos.weeks}|${intento}`
        : null;

  useEffect(() => {
    if (firma == null) return;
    let vigente = true;
    void (async () => {
      const r = await pedirComparativa(
        athleteId,
        firma.startsWith('entrada|') ? undefined : periodos!,
      );
      if (!vigente) return;
      if (!r.ok) {
        setFallo({ firma, mensaje: r.mensaje });
        return;
      }
      setCargado({ firma, presets: r.data.presets, comparativa: r.data.comparativa });
      if (!arrancado) {
        // El servidor ya eligió: la pastilla se coloca en su atajo de entrada
        // para que lo que está marcado sea lo que está a la vista.
        const entrada = r.data.presets.find(
          (p) => p.unavailable == null && p.b_start === r.data.comparativa?.b.week_start,
        );
        if (entrada) setEleccion(entrada.key);
        setArrancado(true);
      }
    })();
    return () => {
      vigente = false;
    };
    // `periodos` se deriva de `firma`: incluirlo dispararía la petición dos veces
    // por cada cambio, una por el objeto nuevo y otra por la firma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, firma]);

  const error = fallo?.firma === firma ? fallo.mensaje : null;
  const cargando = firma != null && cargado?.firma !== firma && error == null;
  // Lo último servido sigue a la vista mientras llega lo nuevo, atenuado. Sólo se
  // vacía cuando el par que se está pidiendo no se puede ni pedir.
  const comparativa = cargado?.comparativa ?? null;

  const cambiarLibre = useCallback((siguiente: ParDePeriodos) => {
    setEleccion(LIBRE);
    setLibre(siguiente);
  }, []);

  const opciones = [
    ...presets.map((p) => ({
      value: p.key as Eleccion,
      label: p.label,
      disabled: p.unavailable != null,
    })),
    { value: LIBRE, label: 'A medida' },
  ];
  const apagados = presets.filter((p) => p.unavailable != null);

  return (
    <div className="flex flex-col gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] p-3.5">
      <ChipGroup
        options={opciones}
        value={eleccion}
        onChange={setEleccion}
        ariaLabel="Qué dos periodos se comparan"
        mono={false}
      />

      {apagados.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {apagados.map((p) => (
            <li key={p.key} className="text-label text-[color:var(--v2-faint)]">
              <b className="font-semibold">{p.label}:</b> {p.unavailable}
            </li>
          ))}
        </ul>
      ) : null}

      {eleccion === LIBRE ? (
        <SelectorDePeriodos periodos={libre} idp="zonas-compare" onCambiar={cambiarLibre} />
      ) : null}

      {error ? (
        <ErrorConReintento message={error} onRetry={() => setIntento((n) => n + 1)} />
      ) : !enOrden ? (
        <p className="text-label text-[color:var(--v2-warn)]">
          Los dos periodos se pisan. El segundo empieza cuando termina el primero.
        </p>
      ) : comparativa == null ? (
        <p className="text-xs text-[color:var(--v2-muted)]">
          {cargando
            ? 'Sumando los dos periodos…'
            : 'Todavía no hay dos periodos que comparar. Elige uno a medida.'}
        </p>
      ) : (
        <div className={cargando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ZonasComparativa comparativa={comparativa} />
        </div>
      )}

      {comparativa != null && periodos != null && enOrden ? (
        <button
          type="button"
          onClick={() => onDarFeedback(periodos)}
          className="v2-focus inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-3.5 text-label font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-fg)]"
        >
          <MIcon name="rate_review" size={15} />
          Dar feedback con esto
        </button>
      ) : null}
    </div>
  );
}
