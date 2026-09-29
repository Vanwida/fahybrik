'use client';

// LA FILA DE FILTROS — UNA ventana para toda la pestaña (A4), sus fechas y las
// del periodo anterior con el que se compara todo, el conmutador «comparar» y
// el acceso al método del coach. Cambiar la ventana pide al servidor el MISMO
// panel para otra ventana: aquí no se recorta nada en el cliente.

import { Settings2 } from 'lucide-react';
import { VENTANAS_PANEL, type VentanaClave, type VentanaResuelta } from '@fahybrid/shared/domain/analytics/ventana';
import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { Button, SegmentedControl, Tooltip } from '@/components/v2/ui';
import { Link } from '@/i18n/navigation';
import { fechaLegible } from '../formato';
import { VENTANA_ETIQUETA } from '../lecturas';

export function Filtros({
  ventana,
  onVentana,
  comparar,
  onComparar,
  metodo,
  metodoHref,
  cargando = false,
}: {
  ventana: VentanaResuelta;
  onVentana: (v: VentanaClave) => void;
  comparar: boolean;
  onComparar: (v: boolean) => void;
  metodo: Pick<CoachAnalyticsMethod, 'ctl_days' | 'atl_days'>;
  /** Ajustes › Método (analíticas). Null donde no hay a dónde ir (el doble). */
  metodoHref: string | null;
  cargando?: boolean;
}) {
  const hoy = ventana.hasta;
  const rango =
    ventana.anterior != null
      ? `${fechaLegible(ventana.desde, hoy)} → ${fechaLegible(ventana.hasta, hoy)} · anterior ${fechaLegible(ventana.anterior.desde, hoy)} → ${fechaLegible(ventana.anterior.hasta, hoy)}`
      : `${fechaLegible(ventana.desde, hoy)} → ${fechaLegible(ventana.hasta, hoy)} · toda su historia`;
  const sinAnterior = ventana.anterior == null;
  const botonComparar = (
    <Button
      size="sm"
      variant={comparar && !sinAnterior ? 'secondary' : 'ghost'}
      aria-pressed={comparar && !sinAnterior}
      disabled={sinAnterior}
      onClick={() => onComparar(!comparar)}
    >
      {comparar && !sinAnterior ? 'Comparando con el periodo anterior' : 'Comparar con el periodo anterior'}
    </Button>
  );
  const textoMetodo = `Método: ${metodo.ctl_days}/${metodo.atl_days} · frescura · cumplimiento`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-busy={cargando || undefined}>
      <SegmentedControl
        aria-label="Ventana de tiempo"
        items={VENTANAS_PANEL.map((v) => ({ value: v, label: VENTANA_ETIQUETA[v] }))}
        value={ventana.clave}
        onValueChange={onVentana}
      />
      <span className="basis-full t-meta t-tnum text-v2-faint sm:basis-auto">{rango}</span>
      {sinAnterior ? (
        <Tooltip content="«Todo» no tiene periodo anterior con el que comparar.">
          <span tabIndex={0} className="outline-none">
            {botonComparar}
          </span>
        </Tooltip>
      ) : (
        botonComparar
      )}
      {metodoHref ? (
        <Link
          href={metodoHref}
          className="inline-flex h-7 items-center gap-1.5 rounded-ctl px-2.5 t-body-sm font-medium text-v2-muted outline-none hover:bg-v2-hover hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)] sm:ml-auto"
        >
          <Settings2 aria-hidden className="size-3.5" />
          {textoMetodo}
        </Link>
      ) : (
        <span className="inline-flex h-7 items-center gap-1.5 px-2.5 t-body-sm text-v2-muted sm:ml-auto">
          <Settings2 aria-hidden className="size-3.5" />
          {textoMetodo}
        </span>
      )}
    </div>
  );
}
