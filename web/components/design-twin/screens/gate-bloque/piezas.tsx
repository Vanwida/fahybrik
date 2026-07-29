'use client';

// Átomos compartidos entre `hoy.tsx` (la reproducción fiel) y `propuesta.tsx`
// (el diseño nuevo): el mismo punto de modalidad, la misma fila de trabajo y
// el mismo pie «Empieza cuando estés listo» + EMPEZAR viven en los dos — es
// literalmente el mismo elemento de UI en ambas caras, así que se pinta UNA
// vez (CONTRATO-UI §0).
//
// También los formateadores de dosis: `lineaFila` es el MISMO que usa la fila
// compacta de `hoy` y la escala `fila` de la propuesta (CONTRATO-UI §2 — un
// formateador por concepto, no uno por pantalla).

import { CTA, Mono, SP } from '../../kit';
import { COLOR_MODALIDAD, dosisConSeries, reloj, type ItemReal, type Modalidad } from '../../datos-reales';

// `dosisConSeries` se re-exporta para que los hermanos de la carpeta la sigan
// importando de './piezas'. La función VIVE en datos-reales.ts: las tres
// pantallas de la tanda la habían escrito cada una a su manera (§2).
export { dosisConSeries };

// ---------------------------------------------------------------------------
// Formateadores — dosis + objetivo, con o sin series
// ---------------------------------------------------------------------------

/**
 * La dosis y el objetivo unidos por " · " — "500 m · 1:52/500m", "4×5 · 100 kg".
 * Sin dosis y sin objetivo, cadena vacía: la fila se queda con el nombre solo,
 * tal y como pide §7 — nunca un guión ni un placeholder.
 */
export function lineaFila(item: ItemReal): string {
  const partes: string[] = [];
  const dosis = dosisConSeries(item);
  if (dosis) partes.push(dosis);
  if (item.objetivo) partes.push(item.objetivo);
  return partes.join(' · ');
}

/**
 * La leyenda completa bajo las pastillas de serie del caso `hero`:
 * "5 reps · 100 kg · descanso 1:30". Null cuando la prescripción no trae
 * series+descanso (no hay pastillas que explicar).
 */
export function leyendaSeries(item: ItemReal): string | null {
  if (!item.series || !item.descansoS) return null;
  const partes: string[] = [];
  if (item.dosis) partes.push(item.dosis);
  if (item.objetivo) partes.push(item.objetivo);
  partes.push(`descanso ${reloj(item.descansoS)}`);
  return partes.join(' · ');
}

// ---------------------------------------------------------------------------
// Punto de modalidad — ModalityDot, el color no un Circle() a mano
// ---------------------------------------------------------------------------

export function PuntoModalidad({ modalidad }: { modalidad: Modalidad }) {
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: COLOR_MODALIDAD[modalidad],
        opacity: 0.7,
        flex: '0 0 auto',
        alignSelf: 'center',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Fila de trabajo — la fila de «Lo que viene» de hoy Y la escala `fila` de la
// propuesta son la MISMA fila (solo cambia el padding vertical: 12 vs 11 pt).
// ---------------------------------------------------------------------------

export function FilaTrabajo({ item, paddingV = 12 }: { item: ItemReal; paddingV?: number }) {
  const linea = lineaFila(item);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: `${paddingV}px 14px` }}>
      <PuntoModalidad modalidad={item.modalidad} />
      <span style={{ font: '600 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{item.nombre}</span>
      <span style={{ flex: 1 }} />
      {/* Sin dosis y sin objetivo, ni Mono vacío: el nombre se queda solo. */}
      {linea && (
        <Mono size={13} color="var(--twin-muted)" style={{ textAlign: 'right' }}>
          {linea}
        </Mono>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El pie — «Empieza cuando estés listo» + EMPEZAR. Idéntico en las dos vistas:
// es literalmente el mismo botón de compromiso, con o sin sujeto escalado
// encima.
// ---------------------------------------------------------------------------

export function Pie({ onEmpezar }: { onEmpezar: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s, flex: '0 0 auto', alignItems: 'center' }}>
      <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)', textAlign: 'center' }}>
        Empieza cuando estés listo
      </span>
      <CTA title="EMPEZAR" height={64} onClick={onEmpezar} />
    </div>
  );
}
