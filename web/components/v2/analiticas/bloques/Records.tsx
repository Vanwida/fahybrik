'use client';

// ¿QUÉ MARCAS TIENE? — la lista única de récords de todas las familias, lo
// nuevo de la ventana primero (lo marca el servidor) y la fecha de cada uno.
// Un récord es de siempre: la ventana solo decide qué es «nuevo».

import { useState } from 'react';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { Button, Tag } from '@/components/v2/ui';
import { fechaLegible, formatear } from '../formato';
import { filasRecords, type FilaRecord } from '../derivados';
import { huecoPendiente, huecoRecords, type Legado } from '../huecos';
import { unidadDe } from '../lecturas';
import { PuntoFamilia, TablaPanel, Tarjeta, type ManejarAccion } from '../piezas';

const VISIBLES = 8;

export function Records({ records, hoy, pendiente, legado, manejar, className }: { records: readonly Lectura[]; hoy: string; pendiente: boolean; legado?: Legado | null; manejar: ManejarAccion; className?: string }) {
  const [todas, setTodas] = useState(false);
  if (pendiente) return <Tarjeta id="records" titulo="Récords" pregunta="¿Qué marcas tiene?" hueco={huecoPendiente('records', legado)} className={className} />;
  const filas = filasRecords(records);
  const nuevas = filas.filter((f) => f.nuevo).length;
  const hueco = huecoRecords(records);
  const pregunta = filas.length > 0 ? `${filas.length} ${filas.length === 1 ? 'marca' : 'marcas'} · ${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'} en la ventana` : '¿Qué marcas tiene?';
  const vistas = todas ? filas : filas.slice(0, VISIBLES);
  return (
    <Tarjeta id="records" titulo="Récords" pregunta={pregunta} hueco={hueco} manejar={manejar} className={className}>
      {filas.length > 0 ? (
        <>
          <TablaPanel<FilaRecord>
            etiqueta="Récords"
            columnas={[
              {
                id: 'p',
                cabecera: 'Prueba',
                celda: (x) => (
                  <span className="inline-flex min-w-0 items-center gap-2">
                    {x.familia ? <PuntoFamilia familia={x.familia} /> : null}
                    <span className="truncate">{x.prueba}</span>
                  </span>
                ),
                movil: 'principal',
              },
              { id: 'v', cabecera: 'Marca', celda: (x) => <span className="font-medium">{formatear(x.l.dato.valor, unidadDe(x.l))}</span>, alinear: 'derecha', ancho: '96px', movil: 'valor' },
              {
                id: 'f',
                cabecera: 'Cuándo',
                celda: (x) => (
                  <span className="inline-flex items-center justify-end gap-2">
                    {x.nuevo ? <Tag>Nuevo</Tag> : null}
                    <span className="text-v2-muted">{x.fecha ? fechaLegible(x.fecha, hoy) : ''}</span>
                  </span>
                ),
                alinear: 'derecha',
                ancho: '128px',
                movil: 'detalle',
              },
            ]}
            filas={vistas}
            clave={(x) => x.id}
          />
          {filas.length > VISIBLES ? (
            <Button size="sm" variant="ghost" className="mt-2" aria-expanded={todas} onClick={() => setTodas((v) => !v)}>
              {todas ? 'Ver solo las últimas' : `Ver las ${filas.length}`}
            </Button>
          ) : null}
        </>
      ) : null}
    </Tarjeta>
  );
}
