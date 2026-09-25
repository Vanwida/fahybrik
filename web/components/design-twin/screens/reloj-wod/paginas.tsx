'use client';

// LA PÁGINA PROPIA DEL WOD — la ronda del AMRAP en la muñeca (no en el móvil):
// reps, movimiento y carga. Las demás páginas de la corona (Datos, Splits,
// Lista) son las genéricas del kit (`PaginaFilas`, `PaginaSplits`, `PaginaLista`).

import { ANCHO_PIE, C, Columna, ContextoLinea, T, cargaTarea, type Tarea } from '../../kit-reloj';

/** El pie de una página: la última fila, así que cabe en ANCHO_PIE (las esquinas de abajo). */
function Pie({ children }: { children: string }) {
  return (
    <span style={{ alignSelf: 'center', maxWidth: ANCHO_PIE, fontSize: T.nota.cuerpo, color: C.tinta2, textAlign: 'center', marginTop: 'auto', lineHeight: 1.2, textWrap: 'balance' }}>
      {children}
    </span>
  );
}

export function PaginaTarea({ titulo, tareas, pie }: { titulo: string[]; tareas: Tarea[]; pie?: string | null }) {
  return (
    <Columna estilo={{ alignItems: 'stretch', gap: 6 }}>
      <ContextoLinea partes={titulo} tono={C.tinta2} />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 6, padding: '4px 8px 0', alignItems: 'baseline' }}>
        {tareas.map((t) => {
          const n = t.dosis?.tipo === 'reps' ? String(t.dosis.prescrito) : null;
          const carga = cargaTarea(t);
          return [
            <span key={`${t.nombre}-n`} style={{ fontSize: T.tercero.cuerpo, fontWeight: T.tercero.peso, textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
              {n ?? '·'}
            </span>,
            <div key={`${t.nombre}-t`} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: T.contexto.cuerpo, fontWeight: T.contexto.peso, color: C.tinta, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{t.nombre}</span>
              {carga ? <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, lineHeight: 1.15 }}>{carga}</span> : null}
            </div>,
          ];
        })}
      </div>
      {pie ? <Pie>{pie}</Pie> : null}
    </Columna>
  );
}
