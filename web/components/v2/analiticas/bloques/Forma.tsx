'use client';

// ¿GANA FORMA O SE PASA? ¿CÓMO LLEGA A SU CARRERA? — forma y fatiga día a día
// con su proyección hasta la carrera (A7), la frescura debajo alrededor de
// cero, la frase del veredicto con lo que dijo el servidor y tres cifras: la
// subida de forma contra el aviso del coach, cuánta carga se ha podido
// calcular (y con qué umbral) y las sesiones de la ventana.

import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { KPI, KPIRow } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { esDecimal } from '@/lib/formato';
import { conSigno } from '../formato';
import { Divergente, Lineas } from '../graficos';
import { fraseForma, pieCobertura, resumenSesiones, vistaForma } from '../derivados';
import { huecoForma, huecoPendiente, type Hueco } from '../huecos';
import { falta, medida } from '../lecturas';
import { PIEL_PANEL as P } from '../piel';
import { Tarjeta, type ManejarAccion } from '../piezas';

const entero = (v: number) => String(Math.round(v));

export function Forma({
  forma,
  semanas,
  metodo,
  hoy,
  carrera,
  pendiente,
  manejar,
  className,
  anchoInicial,
}: {
  forma: readonly Lectura[];
  semanas: readonly Lectura[];
  metodo: CoachAnalyticsMethod;
  hoy: string;
  carrera: { nombre: string; fecha: string } | null;
  pendiente: boolean;
  /** Dónde sigue el cálculo anterior mientras este bloque no se sirve. */
  manejar: ManejarAccion;
  className?: string;
  anchoInicial: number;
}) {
  const pregunta = carrera
    ? `¿Gana forma o se pasa? ¿Cómo llega a ${carrera.nombre}? Proyección con la carga planificada hasta el día de la carrera.`
    : '¿Gana forma o se pasa? Forma, fatiga y frescura día a día.';
  if (pendiente) return <Tarjeta id="forma" titulo="Forma y fatiga" pregunta={pregunta} hueco={huecoPendiente('forma')} className={className} />;

  const hueco: Hueco | null = huecoForma(forma);
  const vista = vistaForma(forma, P, hoy, carrera);
  const frase = fraseForma(forma, metodo);
  const subida = medida(forma, 'carga.subida');
  const subidaSinDato = forma.find((l) => l.id === 'carga.subida' && l.estado !== 'medida');
  const cobertura = medida(forma, 'carga.cobertura');
  const proyeccion = forma.find((l) => l.id === 'carga.proyeccion') ?? null;
  const sesiones = resumenSesiones(semanas);
  const vacio = hueco?.tipo === 'vacio';

  // La respuesta a «¿cómo llega?»: la frescura el día de la carrera, con la palabra si el servidor la dijo.
  let llegada: string | null = null;
  if (proyeccion?.estado === 'medida' && proyeccion.dato && carrera) {
    const f = falta(proyeccion);
    llegada =
      f?.por === 'plan'
        ? `Sin entrenos planificados hasta ${carrera.nombre}: la proyección es la curva si no entrenara (frescura ${conSigno(proyeccion.dato.valor)} ese día).`
        : `Llega a ${carrera.nombre} con frescura ${conSigno(proyeccion.dato.valor)}${proyeccion.veredicto ? ` · ${proyeccion.veredicto.etiqueta_es}` : ''}.`;
  }

  return (
    <Tarjeta id="forma" titulo="Forma y fatiga" pregunta={pregunta} hueco={hueco} manejar={manejar} className={className}>
      {!vacio && vista.series.length >= 1 ? (
        <div className={cn('flex flex-col gap-3', hueco ? 'mt-3' : null)}>
          <Lineas piel={P} alto={250} series={vista.series} marcas={vista.marcas} formatoY={entero} desdeCero anchoInicial={anchoInicial} />
          {vista.frescura ? (
            <div className="flex flex-col gap-1">
              <span className="t-label text-v2-faint">Frescura · forma menos fatiga</span>
              <Divergente piel={P} alto={84} puntos={vista.frescura.puntos} proyeccion={vista.frescura.proyeccion} marcas={vista.marcas} formato={(v) => conSigno(v)} anchoInicial={anchoInicial} />
            </div>
          ) : null}
        </div>
      ) : null}
      {!vacio && (frase || llegada) ? (
        <p className={cn('mt-3 t-body', frase?.retirada ? 'text-v2-muted' : 'text-v2-fg')}>
          {[frase?.texto, llegada].filter(Boolean).join(' ')}
        </p>
      ) : null}
      {!vacio ? (
        <KPIRow className="mt-3">
          <KPI
            label="Subida de forma"
            value={subida ? `${subida.dato.valor < 0 ? '−' : ''}${esDecimal(Math.abs(subida.dato.valor), 1)}` : null}
            unit="por semana"
            caption={subida ? `avisas a partir de +${metodo.ramp_alert_tss_per_week}` : subidaSinDato ? 'necesita una semana de historia' : undefined}
          />
          <KPI label="Carga calculada" value={cobertura ? `${Math.round(cobertura.dato.valor)} %` : null} caption={pieCobertura(forma) ?? 'sin entrenos en la ventana'} />
          <KPI label={sesiones.etiqueta} value={sesiones.valor} caption={sesiones.pie ?? undefined} />
        </KPIRow>
      ) : null}
    </Tarjeta>
  );
}
