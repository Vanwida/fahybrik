'use client';

// ¿MEJORA? — una fila por familia con su número clave (A9), el cambio contra el
// periodo anterior en la unidad que lo juzga (A3), la palabra del servidor, el
// ancla y la tendencia. Con «comparar», además la columna del periodo anterior.
// Lo que en su vida no existe (nunca ha remado) se calla; lo que es viejo se
// enseña con su fecha, sin cambio ni palabra.

import type { Familia, Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { cn } from '@/lib/utils';
import { fechaLegible, formatear } from '../formato';
import { Chispa } from '../graficos';
import { huecoPendiente, huecoProgreso, type Legado } from '../huecos';
import { FAMILIA_NOMBRE, falta, seCalla, unidadDe } from '../lecturas';
import { PIEL_PANEL as P, colorFamilia } from '../piel';
import { AnclaChip, DeltaPanel, PuntoFamilia, TablaPanel, Tarjeta, type ColumnaPanel, type ManejarAccion } from '../piezas';
import { palabraCoach } from '../voz';

function familiaDe(l: Lectura): Familia {
  return (l.familia ?? 'otro') as Familia;
}

/** Lo que dice la celda «Ahora»: el número, o por qué no lo hay. */
function ahora(l: Lectura, hoy: string) {
  const f = falta(l);
  if (l.estado === 'medida' && l.dato) {
    return (
      <span className="inline-flex flex-col items-end">
        <span className={cn('font-medium', f?.por === 'viejo' ? 'text-v2-muted' : 'text-v2-fg')}>{formatear(l.dato.valor, unidadDe(l))}</span>
        {f?.por === 'viejo' ? <span className="t-meta text-v2-faint">del {fechaLegible(f.ultimo, hoy)}</span> : null}
      </span>
    );
  }
  if (f?.por === 'historia') return <span className="text-v2-faint">todavía nada</span>;
  return <span className="text-v2-faint">sin dato</span>;
}

/** El cambio, o por qué no se compara (primera ventana de esa familia, dato viejo). */
function cambio(l: Lectura) {
  if (l.comparacion && l.comparacion.delta != null) {
    // La marca (↗ mejor · ↘ peor · — igual) ya lleva la palabra del servidor sin depender del color; la palabra entera va en el título.
    return (
      <span title={palabraCoach(l) ?? undefined} className="inline-flex justify-end">
        <DeltaPanel l={l} comparacion={l.comparacion} compacto />
      </span>
    );
  }
  const f = falta(l);
  if (f?.por === 'historia' && l.estado === 'medida') return <span className="t-meta text-v2-faint">primera ventana</span>;
  if (f?.por === 'viejo') return <span className="t-meta text-v2-faint">nada nuevo</span>;
  return <span className="t-meta text-v2-faint">sin periodo anterior</span>;
}

export function Progreso({
  progreso,
  hoy,
  comparar,
  pendiente,
  legado,
  manejar,
  className,
}: {
  progreso: readonly Lectura[];
  hoy: string;
  comparar: boolean;
  pendiente: boolean;
  /** Dónde sigue el cálculo anterior mientras este bloque no se sirve. */
  legado?: Legado | null;
  manejar: ManejarAccion;
  className?: string;
}) {
  const pregunta = comparar ? 'Una marca por familia · esta ventana frente a la anterior' : 'Una marca por familia · ¿mejora?';
  if (pendiente) return <Tarjeta id="progreso" titulo="Progreso" pregunta={pregunta} hueco={huecoPendiente('progreso', legado)} className={className} />;
  const hueco = huecoProgreso(progreso);
  const filas = progreso.filter((l) => !seCalla(falta(l)));
  const columnas: ColumnaPanel<Lectura>[] = [
    {
      id: 'f',
      cabecera: 'Familia',
      celda: (l) => (
        <span className="inline-flex items-center gap-2">
          <PuntoFamilia familia={familiaDe(l)} />
          <span className="font-medium">{FAMILIA_NOMBRE[familiaDe(l)]}</span>
        </span>
      ),
      ancho: '112px',
      movil: 'principal',
    },
    { id: 'm', cabecera: 'Marca', celda: (l) => <span className="text-v2-muted">{l.titulo_es}</span>, movil: 'detalle' },
    ...(comparar
      ? [
          {
            id: 'ant',
            cabecera: 'Periodo anterior',
            celda: (l: Lectura) => (l.comparacion?.anterior != null ? formatear(l.comparacion.anterior, unidadDe(l)) : <span className="text-v2-faint">·</span>),
            alinear: 'derecha' as const,
            ancho: '120px',
            movil: 'detalle' as const,
          },
        ]
      : []),
    { id: 'v', cabecera: 'Ahora', celda: (l) => ahora(l, hoy), alinear: 'derecha', ancho: '116px', movil: 'valor' },
    { id: 'd', cabecera: 'Cambio', celda: cambio, alinear: 'derecha', ancho: '124px', movil: 'detalle' },
    { id: 'a', cabecera: 'Ancla', celda: (l) => (l.estado === 'medida' && l.procedencia.ancla ? <AnclaChip ancla={l.procedencia.ancla} /> : null), alinear: 'derecha', ancho: '92px', movil: 'detalle' },
    {
      id: 's',
      cabecera: 'Tendencia',
      celda: (l) =>
        l.serie && l.serie.puntos.filter((q) => q.v != null).length > 1 ? (
          <span className="inline-flex justify-end">
            <Chispa piel={P} puntos={l.serie.puntos} color={colorFamilia(P, familiaDe(l))} ancho={96} alto={28} />
          </span>
        ) : null,
      alinear: 'derecha',
      ancho: '104px',
      movil: 'oculta',
    },
  ];
  return (
    <Tarjeta id="progreso" titulo="Progreso" pregunta={pregunta} hueco={hueco} manejar={manejar} className={className}>
      {!hueco && filas.length > 0 ? <TablaPanel etiqueta="Progreso por familia" columnas={columnas} filas={filas} clave={(l) => l.id} /> : null}
    </Tarjeta>
  );
}
