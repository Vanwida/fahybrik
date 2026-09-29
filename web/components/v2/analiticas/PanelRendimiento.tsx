'use client';

// LA PESTAÑA RENDIMIENTO DEL COACH — el panel de analíticas del atleta sobre el
// MISMO sobre que ve él en su iPhone (A1: `cargarPanel`), con lo que añade el
// coach (modelo §3): comparar con el periodo anterior, el cumplimiento tramo a
// tramo y comparar dos sesiones, y el acceso a su método.
//
// Contrato visual: la propuesta firmada el 29-09 (DECISIONS «Alex firma las
// analíticas rehechas»; pantalla del doble `analiticas-panel-coach`). La
// rejilla de doce columnas de la propuesta se decide por el ANCHO DEL PANEL
// (consultas de contenedor), no por el de la ventana: con la barra lateral
// abierta o plegada, la ficha tiene anchos distintos a la misma resolución.
//
// Aquí no se calcula nada del atleta: el servidor manda el panel (la ventana
// la elige la URL), y los detalles del cumplimiento y de cada sesión se piden a
// su fuente (`./detalle`). Un bloque que el servidor aún no sirve (va en
// `pendientes`) pinta su estado sin inventar.

import { useCallback, useEffect, useState } from 'react';
import type { PanelAnaliticas } from '@fahybrid/shared/domain/analytics/panel';
import type { VentanaClave } from '@fahybrid/shared/domain/analytics/ventana';
import { Link } from '@/i18n/navigation';
import { useAncho } from './graficos';
import type { DetalleCumplimientoConsumo, FilaSesionConsumo, FuenteDetalle, Resultado } from './detalle';
import { pendiente } from './lecturas';
import type { ManejarAccion } from './piezas';
import { EstadoHoy } from './bloques/Estado';
import { Filtros } from './bloques/Filtros';
import { Forma } from './bloques/Forma';
import { Recuperacion } from './bloques/Recuperacion';
import { Semanas } from './bloques/Semanas';
import { Intensidad } from './bloques/Intensidad';
import { Progreso } from './bloques/Progreso';
import { Records } from './bloques/Records';
import { Carrera } from './bloques/Carrera';
import { Tramos } from './bloques/Tramos';

/** Ancho (px) del panel a partir del cual la rejilla va a dos columnas (`@4xl` = 56 rem). */
const DOS_COLUMNAS_PX = 896;
const HUECO_REJILLA = 16;

export interface PanelRendimientoProps {
  panel: PanelAnaliticas;
  atleta: {
    nombre: string;
    /** La carrera objetivo de la ficha (nombre y día): rotula la proyección. */
    carrera: { nombre: string; fecha: string } | null;
  };
  onVentana: (v: VentanaClave) => void;
  /** Mientras llega el panel de otra ventana. */
  cargandoVentana?: boolean;
  compararInicial?: boolean;
  onComparar?: (v: boolean) => void;
  /** Ajustes › Método (analíticas); null donde no hay a dónde ir. */
  metodoHref: string | null;
  manejar: ManejarAccion;
  fuente: FuenteDetalle;
  /** Dónde sigue el cálculo anterior de cada bloque que aún no se sirve. */
  /** Solo en el doble: sustituye al pie que enlaza al método. */
  pie?: React.ReactNode;
}

export function PanelRendimiento({ panel, atleta, onVentana, cargandoVentana = false, compararInicial = false, onComparar, metodoHref, manejar, fuente, pie }: PanelRendimientoProps) {
  const [comparar, setComparar] = useState(compararInicial);
  const [cumplimiento, setCumplimiento] = useState<{ ventana: VentanaClave; res: Resultado<DetalleCumplimientoConsumo> } | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const { ref, ancho } = useAncho<HTMLDivElement>(1176);
  const ventana = panel.ventana;
  const hoy = ventana.hasta;
  const b = panel.bloques;

  useEffect(() => {
    let vivo = true;
    void fuente.cumplimiento(ventana.clave).then((res) => {
      if (vivo) setCumplimiento({ ventana: ventana.clave, res });
    });
    return () => {
      vivo = false;
    };
  }, [fuente, ventana.clave]);
  const detalle = cumplimiento?.ventana === ventana.clave ? cumplimiento.res : null;

  const cambiarComparar = useCallback(
    (v: boolean) => {
      setComparar(v);
      onComparar?.(v);
    },
    [onComparar],
  );

  const abrirSesion = useCallback((s: FilaSesionConsumo) => {
    setSeleccion(s.assignment_id);
    document.getElementById('tramos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // El ancho de una columna de la rejilla, para el primer pintado de los gráficos (luego se miden solos) y para agrupar semanas.
  const dos = ancho >= DOS_COLUMNAS_PX;
  const anchoCol = (span: number) => (dos ? Math.max(240, ((ancho - HUECO_REJILLA * 11) / 12) * span + HUECO_REJILLA * (span - 1) - 34) : Math.max(240, ancho - 34));
  const compararEfectivo = comparar && ventana.anterior != null;

  return (
    <div ref={ref} className="@container flex min-w-0 flex-col gap-4">
      <EstadoHoy estado={b.estado} metodo={panel.metodo} />
      <Filtros ventana={ventana} onVentana={onVentana} comparar={compararEfectivo} onComparar={cambiarComparar} metodo={panel.metodo} metodoHref={metodoHref} cargando={cargandoVentana} />

      <div aria-busy={cargandoVentana || undefined} className={`grid min-w-0 grid-cols-1 gap-4 transition-opacity duration-[var(--v2-dur)] @4xl:grid-cols-12 ${cargandoVentana ? 'opacity-60' : ''}`}>
        <Forma
          forma={b.forma}
          semanas={b.semanas}
          metodo={panel.metodo}
          hoy={hoy}
          carrera={atleta.carrera}
          pendiente={pendiente(panel, 'forma')}
          manejar={manejar}
          className="@4xl:col-span-8"
          anchoInicial={anchoCol(8)}
        />
        <Recuperacion recuperacion={b.recuperacion} metodo={panel.metodo} comparar={compararEfectivo} pendiente={pendiente(panel, 'recuperacion')} manejar={manejar} className="@4xl:col-span-4" />
        <Semanas
          semanas={b.semanas}
          ventana={ventana}
          comparar={compararEfectivo}
          pendiente={pendiente(panel, 'semanas')}
          cumplimiento={detalle}
          onSesion={abrirSesion}
          manejar={manejar}
          className="@4xl:col-span-7"
          anchoInicial={anchoCol(7)}
        />
        <Intensidad intensidad={b.intensidad} hoy={hoy} pendiente={pendiente(panel, 'intensidad')} manejar={manejar} className="@4xl:col-span-5" anchoInicial={anchoCol(5)} />
        <Progreso progreso={b.progreso} hoy={hoy} comparar={compararEfectivo} pendiente={pendiente(panel, 'progreso')} manejar={manejar} className="@4xl:col-span-7" />
        <Records records={b.records} hoy={hoy} pendiente={pendiente(panel, 'records')} manejar={manejar} className="@4xl:col-span-5" />
        <Carrera carrera={b.carrera} hoy={hoy} fechaCarrera={atleta.carrera?.fecha ?? null} pendiente={pendiente(panel, 'carrera')} manejar={manejar} className="@4xl:col-span-12" anchoInicial={dos ? anchoCol(7) : anchoCol(12)} />
        <Tramos
          cumplimiento={detalle}
          fuente={fuente}
          seleccion={seleccion}
          onSeleccion={setSeleccion}
          hoy={hoy}
          manejar={manejar}
          className="@4xl:col-span-12"
          anchoInicial={dos ? anchoCol(8) : anchoCol(12)}
        />
      </div>

      {pie ?? (
        <p className="t-meta text-v2-faint">
          Lo mismo que ve {atleta.nombre.split(' ')[0]} en su iPhone: un solo cálculo. Los días de forma y fatiga, las bandas de frescura, el cumplimiento y lo que cuenta como cambio son tu método
          {metodoHref ? (
            <>
              {': se editan en '}
              <Link href={metodoHref} className="underline decoration-v2-border-strong underline-offset-2 hover:text-v2-fg">
                Ajustes › Método
              </Link>
              .
            </>
          ) : (
            '.'
          )}
        </p>
      )}
    </div>
  );
}
