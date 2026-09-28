'use client';

// LA LISTA ±1 (familia WOD, 28-09) — un chipper de diez estaciones o un HYROX
// de dieciséis piezas NO caben en el vivo como lista (el vivo de hoy desbordaba
// la pantalla). Se enseña lo que acabas de hacer con su tiempo, lo que viene, y
// cuántas quedan («+7 más»). La estación de AHORA no va aquí: es la fila del
// trabajo, justo encima. Tocar abre la Estructura, que es la lista entera.
//
// Va en la franja elástica (`apoyo` de `VistaIphone`), sobre las celdas
// compactas. Tres filas fijas: nunca crece, nunca desborda.

import type { AlrededorVista } from '../kit-reloj/alrededor';
import { textoEstacion } from '../kit-reloj/alrededor';
import { fmtReloj } from '../kit-reloj/reglas';
import { Etiqueta, Icono, Numeral, Superficie } from './piezas';
import { CI, TI } from './tokens';

const ALTO_FILA = 28;

function Fila({ etiqueta, texto, hecha, tiempo }: { etiqueta: string; texto: string; hecha?: boolean; tiempo?: string | null }) {
  return (
    <div style={{ height: ALTO_FILA, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Etiqueta estilo={{ minWidth: 52 }}>{etiqueta}</Etiqueta>
      {hecha ? <Icono nombre="check" talla={16} tono={CI.tinta2} /> : null}
      <span style={{ fontSize: TI.cuerpo.cuerpo, fontWeight: 600, color: hecha ? CI.tinta2 : CI.tinta, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', minWidth: 0, flex: '1 1 auto' }}>
        {texto}
      </span>
      {tiempo ? <Numeral texto={tiempo} cuerpo={TI.cuerpo.cuerpo} tono={CI.tinta2} /> : null}
    </div>
  );
}

/**
 * LA VENTANA ALREDEDOR DE LA ESTACIÓN: «hecha · ✓ 50 Double Under · 1:02»,
 * «luego · 30 cal Row», «+7 más · 1 hecha antes». `onAbrir` abre la Estructura.
 */
export function ListaAlrededor({ alrededor, onAbrir }: { alrededor: AlrededorVista; onAbrir?: () => void }) {
  const { anterior, siguiente, masAtras, masAdelante } = alrededor;
  const resto = [masAdelante > 0 ? `+${masAdelante} más` : siguiente ? 'la última después' : 'es la última', masAtras > 0 ? `${masAtras} ${masAtras === 1 ? 'hecha' : 'hechas'} antes` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      aria-label="Ver todas las estaciones"
      onClick={(e) => {
        e.stopPropagation();
        onAbrir?.();
      }}
      style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', flex: '0 0 auto' }}
    >
      <Superficie padding={10} estilo={{ display: 'flex', flexDirection: 'column' }}>
        {anterior ? <Fila etiqueta="hecha" texto={textoEstacion(anterior.paso)} hecha tiempo={anterior.segundos != null ? fmtReloj(anterior.segundos) : null} /> : <Fila etiqueta="primera" texto="es la primera estación" hecha />}
        {siguiente ? <Fila etiqueta="luego" texto={textoEstacion(siguiente)} /> : <Fila etiqueta="luego" texto="nada: esta es la última" />}
        <div style={{ height: ALTO_FILA, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Etiqueta>{resto}</Etiqueta>
          <Etiqueta tono={CI.tinta}>todas ›</Etiqueta>
        </div>
      </Superficie>
    </button>
  );
}
