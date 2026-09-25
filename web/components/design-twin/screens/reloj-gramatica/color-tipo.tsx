'use client';

// COLOR Y TIPO — los tokens del kit pintados en el propio lienzo del reloj,
// para juzgarlos a su tamaño y no en una tabla. La corona pasa las páginas:
// el héroe ajustándose al ancho con cifras largas, la escala, el espectro con
// 5 y con 7 zonas del coach, y los colores con su único significado.

import { useState, type ReactNode } from 'react';
import { useTicker } from '../../sim';
import {
  ANCHO_HEROE,
  BotonAccion,
  C,
  Columna,
  ContextoLinea,
  Heroe,
  Muneca,
  T,
  altoHeroe,
  espectroZonas,
  limitesZona,
  tallaHeroe,
  useEventos,
  type ZonasCoach,
} from '../../kit-reloj';
import { ZONAS } from './planes';

/** Las cadenas que tienen que caber: la del día a día y las que rompen. */
const MUESTRAS: Array<{ texto: string; unidad?: string }> = [
  { texto: '3:52', unidad: '/km' },
  { texto: '88:88' },
  { texto: '10:59:59' },
  { texto: '1000', unidad: 'm' },
  { texto: '176', unidad: 'ppm' },
  { texto: '0:07' },
];

/** Un coach con 7 zonas (sobre el mismo umbral de 170 ppm). */
const ZONAS_7: ZonasCoach = { techos: [125, 138, 148, 156, 165, 175, 192] };

function PaginaHeroe() {
  const [i, setI] = useState(0);
  useTicker(true, (s) => setI(Math.floor(s / 1.6) % MUESTRAS.length));
  const m = MUESTRAS[i]!;
  const alto = altoHeroe(['contexto', 'nota', 'nota']);
  const talla = tallaHeroe(m.texto, m.unidad, ANCHO_HEROE, alto);
  return (
    <Columna>
      <ContextoLinea partes={['Héroe · 44–96 pt']} tono={C.tinta2} />
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center' }}>
        <Heroe heroe={{ clase: 'crono', texto: m.texto, unidad: m.unidad }} altoMax={alto} />
      </div>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>{`${Math.round(talla.cuerpo)} pt · ajustado al ancho`}</span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>SF, cifras fijas, recto</span>
    </Columna>
  );
}

function Fila({ muestra, rotulo }: { muestra: ReactNode; rotulo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', width: '100%', gap: 8, padding: '0 12px 0 4px', boxSizing: 'border-box' }}>
      <span style={{ whiteSpace: 'nowrap', lineHeight: 1.05 }}>{muestra}</span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, whiteSpace: 'nowrap' }}>{rotulo}</span>
    </div>
  );
}

function PaginaEscala() {
  return (
    <Columna estilo={{ gap: 9 }}>
      <ContextoLinea partes={['La escala']} tono={C.tinta2} />
      <Fila muestra={<span style={{ fontSize: T.segundo.cuerpo, fontWeight: 600 }}>620 m</span>} rotulo="segundo 30" />
      <Fila muestra={<span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600 }}>171 ppm</span>} rotulo="tercero 22" />
      <Fila muestra={<span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600 }}>Serie 3/6</span>} rotulo="contexto 16" />
      <Fila muestra={<span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>lo dices tú</span>} rotulo="nota 15" />
      <div style={{ width: '100%', padding: '2px 8px 0', boxSizing: 'border-box' }}>
        <BotonAccion etiqueta="Empezar ya · 44 pt" onPulsa={() => undefined} />
      </div>
    </Columna>
  );
}

function PaginaZonas({ zonas, titulo }: { zonas: ZonasCoach; titulo: string }) {
  const colores = espectroZonas(zonas.techos.length);
  const pocas = zonas.techos.length <= 5;
  return (
    <Columna estilo={{ gap: pocas ? 8 : 4 }}>
      <ContextoLinea partes={[titulo]} tono={C.tinta2} />
      {colores.map((c, i) => {
        const [lo, hi] = limitesZona(i + 1, zonas);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0 6px', boxSizing: 'border-box', height: pocas ? 22 : 19 }}>
            <span style={{ width: 34, height: 10, borderRadius: 5, background: c, flex: '0 0 auto' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: c, width: 26 }}>Z{i + 1}</span>
            <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, fontVariantNumeric: 'tabular-nums' }}>
              {i === 0 ? `≤ ${hi}` : `${lo}–${hi}`}
            </span>
          </div>
        );
      })}
    </Columna>
  );
}

const COLORES: Array<{ hex: string; nombre: string; uso: string }> = [
  { hex: C.fondo, nombre: 'fondo', uso: '#000' },
  { hex: C.superficie2, nombre: 'superficie', uso: 'botones' },
  { hex: C.tinta, nombre: 'tinta', uso: 'el dato' },
  { hex: C.tinta2, nombre: 'tinta2', uso: 'el apoyo' },
  { hex: C.accion, nombre: 'acción', uso: 'solo acción' },
];

function PaginaColor() {
  return (
    <Columna estilo={{ gap: 7 }}>
      <ContextoLinea partes={['Un color, un significado']} tono={C.tinta2} />
      {COLORES.map((c) => (
        <div key={c.nombre} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0 12px 0 6px', boxSizing: 'border-box' }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: c.hex, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)', flex: '0 0 auto' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>{c.nombre}</span>
          <span style={{ marginLeft: 'auto', fontSize: T.nota.cuerpo, color: C.tinta2 }}>{c.uso}</span>
        </div>
      ))}
    </Columna>
  );
}

export function ColorTipo({ onLog }: { onLog: (linea: string) => void }) {
  const ev = useEventos(onLog);
  return (
    <Muneca
      paginas={[
        { id: 'heroe', titulo: 'Héroe', contenido: <PaginaHeroe /> },
        { id: 'escala', titulo: 'Escala', contenido: <PaginaEscala /> },
        { id: 'z5', titulo: '5 zonas', contenido: <PaginaZonas zonas={ZONAS} titulo="5 zonas del coach" /> },
        { id: 'z7', titulo: '7 zonas', contenido: <PaginaZonas zonas={ZONAS_7} titulo="7 zonas del coach" /> },
        { id: 'color', titulo: 'Color', contenido: <PaginaColor /> },
      ]}
      pausado={false}
      onPausa={() => undefined}
      eventos={ev}
      onLog={onLog}
    />
  );
}
