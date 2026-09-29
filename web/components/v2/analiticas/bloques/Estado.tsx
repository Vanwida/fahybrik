'use client';

// ¿CÓMO ESTÁ HOY? — la cabecera de estado de la pestaña (modelo §3, pregunta 1):
// la palabra de la frescura, forma · fatiga · frescura de hoy y la disposición.
// Las MISMAS lecturas que ve el atleta en su iPhone (`estado.*`): aquí no se
// calcula nada, se escriben. Cada etiqueta lleva su glosa a un toque (A5: el
// nombre nuestro y, para quien la busque, la sigla de TrainingPeaks).

import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { Tooltip } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { conSigno, entero } from '../formato';
import { falta, lectura, medida } from '../lecturas';

function Celda({ etiqueta, glosa, valor, palabra, claseValor, clasePalabra }: { etiqueta: string; glosa: string; valor: string; palabra?: string | null; claseValor?: string; clasePalabra?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <Tooltip content={glosa}>
        <span tabIndex={0} className="t-label text-v2-faint outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]">
          {etiqueta}
        </span>
      </Tooltip>
      <span className={cn('t-title-sm t-tnum text-v2-fg', claseValor)}>{valor}</span>
      {palabra ? <span className={cn('t-meta', clasePalabra ?? 'text-v2-muted')}>{palabra}</span> : null}
    </div>
  );
}

/** La palabra de hoy: la de la frescura si el servidor la dijo; si la retiró, por qué, corto. */
function palabraDeHoy(estado: readonly Lectura[]): { palabra: string; retirada: boolean } {
  const fres = lectura(estado, 'estado.frescura');
  if (!fres || fres.estado !== 'medida') return { palabra: 'Sin carga todavía', retirada: true };
  if (fres.veredicto) return { palabra: fres.veredicto.etiqueta_es, retirada: false };
  const f = falta(fres);
  if (f?.por === 'historia') return { palabra: 'Arrancando', retirada: true };
  return { palabra: 'Sin palabra', retirada: true };
}

export function EstadoHoy({ estado, metodo }: { estado: readonly Lectura[]; metodo: Pick<CoachAnalyticsMethod, 'ctl_days' | 'atl_days'> }) {
  const hoy = palabraDeHoy(estado);
  const forma = medida(estado, 'estado.forma');
  const fatiga = medida(estado, 'estado.fatiga');
  const fres = medida(estado, 'estado.frescura');
  const readiness = medida(estado, 'estado.readiness');
  // El readiness de otro día se enseña como lo que es: el último, no el de hoy.
  const readinessDeHoy = readiness != null && readiness.cobertura.dias_con_dato > 0;
  return (
    <section aria-label="Cómo está hoy" className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-7">
      <div className="col-span-2 flex min-w-0 items-baseline gap-2">
        <Tooltip content="La palabra de hoy sale de su frescura con las bandas de tu método. Si la carga medida no la sostiene, se retira y queda el número.">
          <span tabIndex={0} className="t-label text-v2-faint outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]">
            Hoy
          </span>
        </Tooltip>
        {/* La palabra no cambia de color (como en el vivo): lo que la hace legible es que sea una palabra. */}
        <span className={cn('t-title-sm', hoy.retirada ? 'text-v2-muted' : 'text-v2-fg')}>{hoy.palabra}</span>
      </div>
      {forma ? <Celda etiqueta="Forma" glosa={`Forma (CTL): la media de ${metodo.ctl_days} días de su carga diaria. El trabajo que ya lleva encima.`} valor={entero(forma.dato.valor)} /> : null}
      {fatiga ? <Celda etiqueta="Fatiga" glosa={`Fatiga (ATL): la media de ${metodo.atl_days} días. El cansancio que aún arrastra.`} valor={entero(fatiga.dato.valor)} /> : null}
      {fres ? <Celda etiqueta="Frescura" glosa="Frescura (TSB): forma menos fatiga. En positivo, llega con descanso; en negativo, con carga acumulada." valor={conSigno(fres.dato.valor)} /> : null}
      {readiness ? (
        <Celda
          etiqueta="Disposición"
          glosa={readinessDeHoy ? 'Cómo llega hoy: su check-in, su variabilidad, su sueño y su pulso en reposo con los pesos de tu método.' : readiness.procedencia.explica_es}
          valor={entero(readiness.dato.valor)}
          claseValor={readinessDeHoy ? undefined : 'text-v2-muted'}
          palabra={readinessDeHoy ? (readiness.veredicto?.etiqueta_es ?? null) : 'no es de hoy'}
          clasePalabra={readinessDeHoy ? 'text-v2-muted' : 'text-v2-faint'}
        />
      ) : null}
    </section>
  );
}
