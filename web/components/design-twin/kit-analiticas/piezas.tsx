'use client';

// LAS PIEZAS DEL IPHONE — el cromo y los átomos de la pestaña de analíticas,
// sobre el lenguaje del vivo firmado (28-09): negro, SF tabular, tinta y
// tinta2, naranja SOLO en la acción, suelo 15 pt en todo. Ninguna pieza
// escribe un hex ni un cuerpo que no salga de `tokens.ts`.
//
//   PantallaAnaliticas   título grande + selector de ventana + cuerpo con
//                        scroll + barra de pestañas
//   EstadoFijo           la cabecera que no se va: la palabra, forma/fatiga/
//                        frescura y la disposición de hoy (pregunta 1)
//   SelectorVentana      7 d · 4 sem · 12 sem · 6 m · 1 a · Todo (A4)
//   Seccion              título 24 pt + pregunta + «›» al detalle
//   Celda                un dato: etiqueta, cifra, unidad, delta y ancla
//   Delta                ▲ / ▼ / = con el texto en la unidad que lo juzga
//   Ancla                «medido», «declarado», «estimado», «por edad»
//   FilaProgreso         una familia: punto, nombre, métrica, cifra, delta, chispa
//   FilaRecord           una marca: prueba, valor, fecha, «Nuevo»
//   FilaSesion           una sesión: fecha, título, plan → hecho, veredicto
//   HuecoBloque          vacío / poco / viejo, con salida obligatoria
//   Glosa                la hoja del glosario (A5), a un toque
//   Segmento             conmutador (Remo · Ski · Bici; Carga · Horas)

import { useState, type CSSProperties, type ReactNode } from 'react';
import { TabBar } from '../kit-composicion/chrome';
import { Icono } from '../kit-iphone-vivo/piezas';
import { estiloNumeral } from '../kit-iphone-vivo/tokens';
import {
  ANCLA_ETIQUETA,
  CUMPLIMIENTO_PALABRA,
  FAMILIA_NOMBRE,
  VENTANAS,
  VENTANA_ETIQUETA,
  type Ancla,
  type Comparacion,
  type Cumplimiento,
  type EstadoBloque,
  type Familia,
  type FamiliaGrande,
  type RecordPanel,
  type SesionResumen,
  type UnidadPanel,
  type Ventana,
} from './contrato';
import { menosEsMejor } from './mecanismo';
import { GLOSARIO } from './metodo';
import { cifra, fechaLegible, formatear, formatearDelta, unidadCorta } from './fmt';
import { Chispa } from './graficos';
import { ENTRE_BLOQUES, HUECO_A, MARGEN_A, PIEL_IPHONE as P, RADIO_A, TA, colorFamilia } from './tokens';
import type { PuntoSerie } from './contrato';

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export function Etiqueta({ children, tono = P.tinta2, estilo }: { children: ReactNode; tono?: string; estilo?: CSSProperties }) {
  return <span style={{ font: `${TA.etiqueta.peso} ${TA.etiqueta.cuerpo}px/1.25 ${P.fuente}`, color: tono, ...estilo }}>{children}</span>;
}

export function Cuerpo({ children, tono = P.tinta, fuerte = false, estilo }: { children: ReactNode; tono?: string; fuerte?: boolean; estilo?: CSSProperties }) {
  return <span style={{ font: `${fuerte ? TA.cuerpoFuerte.peso : TA.cuerpo.peso} ${TA.cuerpo.cuerpo}px/1.3 ${P.fuente}`, color: tono, textWrap: 'pretty', ...estilo }}>{children}</span>;
}

export function Numeral({ texto, cuerpo, tono = P.tinta, estilo }: { texto: string; cuerpo: number; tono?: string; estilo?: CSSProperties }) {
  return <span style={{ ...estiloNumeral(cuerpo), color: tono, whiteSpace: 'nowrap', ...estilo }}>{texto}</span>;
}

// ---------------------------------------------------------------------------
// La pantalla
// ---------------------------------------------------------------------------

export function PantallaAnaliticas({
  titulo,
  ventana,
  onVentana,
  cabeceraFija,
  atras,
  children,
  accionDerecha,
  pestana = 'Analíticas',
}: {
  titulo: string;
  ventana: Ventana;
  onVentana: (v: Ventana) => void;
  /** Lo que no se va al hacer scroll (el Estado en la portada; la cabecera de familia en un detalle). */
  cabeceraFija?: ReactNode;
  /** Un detalle lleva «‹ Analíticas» y no la barra de pestañas grande. */
  atras?: { texto: string; onTap: () => void };
  children: ReactNode;
  accionDerecha?: ReactNode;
  /** Cómo se llama la pestaña en la barra (§11.1: «Analíticas» o «Progreso»). */
  pestana?: string;
}) {
  return (
    <div className="twin-screen-safe">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: P.fondo, color: P.tinta, fontFamily: P.fuente }}>
        <header style={{ flex: '0 0 auto', padding: `${atras ? 4 : 8}px ${MARGEN_A}px 0`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {atras ? (
            <button type="button" onClick={atras.onTap} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2, height: 32, color: P.tinta2, font: `600 ${TA.cuerpo.cuerpo}px/1 ${P.fuente}` }}>
              <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden>
                <path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {atras.texto}
            </button>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <h1 style={{ margin: 0, font: `${TA.pantalla.peso} ${TA.pantalla.cuerpo}px/1.05 ${P.fuente}`, letterSpacing: '-0.02em' }}>{titulo}</h1>
            {accionDerecha}
          </div>
          <SelectorVentana valor={ventana} onCambio={onVentana} />
        </header>
        <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
          {cabeceraFija ? (
            <div style={{ position: 'sticky', top: 0, zIndex: 3, background: P.fondo, padding: `10px ${MARGEN_A}px 12px`, borderBottom: `1px solid ${P.rejilla}` }}>{cabeceraFija}</div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: ENTRE_BLOQUES, padding: `${cabeceraFija ? 20 : 8}px ${MARGEN_A}px 28px` }}>{children}</div>
        </div>
        {!atras ? <TabBar activa="Analíticas" renombrar={pestana !== 'Analíticas' ? { Analíticas: pestana } : undefined} /> : null}
      </div>
    </div>
  );
}

/** Los seis periodos, uno activo en tinta sobre superficie2 (como los chips del vivo). Nunca naranja: no es una acción. */
export function SelectorVentana({ valor, onCambio }: { valor: Ventana; onCambio: (v: Ventana) => void }) {
  return (
    <div role="radiogroup" aria-label="Periodo" style={{ display: 'grid', gridTemplateColumns: `repeat(${VENTANAS.length}, minmax(0, 1fr))`, gap: 4, padding: 3, borderRadius: RADIO_A.chip + 3, background: P.superficie }}>
      {VENTANAS.map((v) => {
        const activo = v === valor;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(v)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              height: TA.chip.alto - 6,
              borderRadius: RADIO_A.chip,
              textAlign: 'center',
              font: `${TA.chip.peso} ${TA.chip.cuerpo}px/1 ${P.fuente}`,
              fontVariantNumeric: 'tabular-nums',
              color: activo ? P.fondo : P.tinta2,
              background: activo ? P.tinta : 'transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {VENTANA_ETIQUETA[v]}
          </button>
        );
      })}
    </div>
  );
}

/** Conmutador de vista (Remo · Ski · Bici; Carga · Horas). Mismo cromo que el selector de ventana. */
export function Segmento<V extends string>({ items, valor, onCambio, etiqueta }: { items: Array<{ id: V; texto: string }>; valor: V; onCambio: (v: V) => void; etiqueta: string }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 4, padding: 3, borderRadius: RADIO_A.chip + 3, background: P.superficie }}>
      {items.map((it) => {
        const activo = it.id === valor;
        return (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(it.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              height: TA.chip.alto - 6,
              padding: '0 14px',
              borderRadius: RADIO_A.chip,
              textAlign: 'center',
              font: `${TA.chip.peso} ${TA.chip.cuerpo}px/1 ${P.fuente}`,
              color: activo ? P.fondo : P.tinta2,
              background: activo ? P.tinta : 'transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {it.texto}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Secciones y celdas
// ---------------------------------------------------------------------------

/**
 * Título 24 pt + la pregunta + «›» al detalle. El accesorio (un conmutador)
 * va en su propia fila: nunca dentro del botón del título (un botón no puede
 * contener otro) ni robándole sitio al título (que se partía en dos líneas).
 */
export function Seccion({ titulo, pregunta, onAbrir, children, accesorio }: { titulo: string; pregunta?: string; onAbrir?: () => void; children: ReactNode; accesorio?: ReactNode }) {
  const cabeza = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <h2 style={{ margin: 0, font: `${TA.titulo.peso} ${TA.titulo.cuerpo}px/1.1 ${P.fuente}`, letterSpacing: '-0.015em', color: P.tinta, textWrap: 'balance' }}>{titulo}</h2>
        {pregunta ? <Etiqueta estilo={{ textWrap: 'pretty' }}>{pregunta}</Etiqueta> : null}
      </div>
      {onAbrir ? (
        <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', color: P.tinta2, flex: '0 0 auto' }}>
          <svg width="12" height="20" viewBox="0 0 12 20">
            <path d="m2 2 8 8-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </div>
  );
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: HUECO_A + 2 }}>
      {onAbrir ? (
        <button type="button" onClick={onAbrir} aria-label={`Abrir ${titulo}`} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
          {cabeza}
        </button>
      ) : (
        cabeza
      )}
      {accesorio ? <div style={{ display: 'flex', justifyContent: 'flex-start' }}>{accesorio}</div> : null}
      {children}
    </section>
  );
}

/** Una superficie sobre el negro (la celda del vivo). */
export function Superficie({ children, estilo, padding = 14 }: { children: ReactNode; estilo?: CSSProperties; padding?: number | string }) {
  return <div style={{ background: P.superficie, borderRadius: RADIO_A.celda, padding, boxSizing: 'border-box', ...estilo }}>{children}</div>;
}

/** Rejilla de celdas: dos columnas, la última suelta a lo ancho (como la rejilla del vivo). */
export function Rejilla({ children, columnas = 2 }: { children: ReactNode; columnas?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, gap: HUECO_A - 2 }}>{children}</div>;
}

/**
 * Un dato: etiqueta arriba, cifra a 30 pt con la unidad a 15 pt, y debajo el
 * delta en la unidad que lo juzga y el ancla. `valor` null pinta «sin dato»
 * SOLO si hay una salida (§6.2 bis); si no, la celda no existe.
 */
export function Celda({
  etiqueta,
  valor,
  unidad,
  comparacion,
  ancla,
  nota,
  pie,
  cuerpo = TA.dato.cuerpo,
  aLoAncho = false,
}: {
  etiqueta: string;
  valor: number;
  unidad: UnidadPanel;
  comparacion?: Comparacion | null;
  ancla?: Ancla;
  /** Una línea en tinta2 debajo (la fecha del récord, el basal). */
  nota?: string;
  pie?: ReactNode;
  cuerpo?: number;
  aLoAncho?: boolean;
}) {
  const u = unidadCorta(unidad);
  return (
    <Superficie estilo={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: aLoAncho ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Etiqueta>{etiqueta}</Etiqueta>
        {ancla ? <AnclaChip ancla={ancla} /> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
        <Numeral texto={cifra(valor, unidad)} cuerpo={cuerpo} />
        {u ? <Etiqueta>{u}</Etiqueta> : null}
      </div>
      {comparacion ? <Delta comparacion={comparacion} unidad={unidad} /> : nota ? <Etiqueta>{nota}</Etiqueta> : null}
      {comparacion && nota ? <Etiqueta>{nota}</Etiqueta> : null}
      {pie}
    </Superficie>
  );
}

/**
 * ▲ mejor · ▼ peor · ≈ dentro del ruido, con el texto del delta y contra qué.
 * El color no cambia: la marca y la palabra lo dicen. Se parte en dos líneas
 * si no cabe; nunca se corta.
 */
export function Delta({ comparacion, unidad, corto = false }: { comparacion: Comparacion; unidad: UnidadPanel; corto?: boolean }) {
  const mejor = menosEsMejor(unidad) ? comparacion.delta < 0 : comparacion.delta > 0;
  const igual = !comparacion.significativo;
  const marca = igual ? '≈' : mejor ? '▲' : '▼';
  const texto = igual && Math.abs(comparacion.delta) < 0.05 ? 'igual' : formatearDelta(comparacion.delta, unidad);
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 6px', minWidth: 0, font: `600 ${TA.etiqueta.cuerpo}px/1.25 ${P.fuente}`, color: igual ? P.tinta2 : P.tinta }}>
      <span aria-label={igual ? 'sin cambio' : mejor ? 'mejor' : 'peor'} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {marca} {texto}
      </span>
      {!corto ? <Etiqueta>{comparacion.etiqueta_es}</Etiqueta> : null}
    </span>
  );
}

export function AnclaChip({ ancla }: { ancla: Ancla }) {
  const estimada = ancla === 'estimada' || ancla === 'poblacional';
  return (
    <span
      style={{
        font: `600 ${TA.etiqueta.cuerpo}px/1 ${P.fuente}`,
        color: P.tinta2,
        padding: '4px 8px',
        borderRadius: 999,
        border: `1.5px ${estimada ? 'dashed' : 'solid'} ${P.carril}`,
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
      }}
    >
      {ANCLA_ETIQUETA[ancla]}
    </span>
  );
}

export function PuntoFamilia({ familia, talla = 10 }: { familia: Familia | FamiliaGrande; talla?: number }) {
  return <span aria-hidden style={{ width: talla, height: talla, borderRadius: 999, background: colorFamilia(P, familia), flex: '0 0 auto' }} />;
}

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

/** Una familia en Progreso: nombre + métrica clave · cifra · delta · chispa · «›». */
export function FilaProgreso({
  familia,
  metrica,
  valor,
  unidad,
  comparacion,
  tendencia,
  nota,
  onAbrir,
}: {
  familia: Familia;
  metrica: string;
  valor: number | null;
  unidad: UnidadPanel;
  comparacion: Comparacion | null;
  tendencia: PuntoSerie[] | null;
  /** Lo que se dice cuando falta dato: «Sin remo todavía», «2 sesiones · faltan 3». */
  nota?: string | null;
  onAbrir?: () => void;
}) {
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '10px 0', borderBottom: `1px solid ${P.rejilla}` }}>
      <PuntoFamilia familia={familia} />
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          <Cuerpo fuerte>{FAMILIA_NOMBRE[familia]}</Cuerpo>
          <Etiqueta estilo={{ textWrap: 'pretty' }}>{metrica}</Etiqueta>
        </span>
        {valor != null ? (
          <>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <Numeral texto={cifra(valor, unidad)} cuerpo={TA.datoMenor.cuerpo} />
              {unidadCorta(unidad) ? <Etiqueta>{unidadCorta(unidad)}</Etiqueta> : null}
            </span>
            {comparacion ? <Delta comparacion={comparacion} unidad={unidad} corto /> : nota ? <Etiqueta>{nota}</Etiqueta> : null}
          </>
        ) : (
          <Etiqueta estilo={{ textWrap: 'pretty' }}>{nota ?? 'sin dato'}</Etiqueta>
        )}
      </div>
      {tendencia && tendencia.length > 1 ? <Chispa piel={P} puntos={tendencia} color={colorFamilia(P, familia)} /> : null}
      {onAbrir ? (
        <svg width="10" height="18" viewBox="0 0 12 20" aria-hidden style={{ color: P.tinta2, flex: '0 0 auto' }}>
          <path d="m2 2 8 8-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </div>
  );
  return onAbrir ? (
    <button type="button" onClick={onAbrir} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }} aria-label={`Abrir ${FAMILIA_NOMBRE[familia]}`}>
      {inner}
    </button>
  ) : (
    inner
  );
}

export function FilaRecord({ r, hoy }: { r: RecordPanel; hoy: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '8px 0', borderBottom: `1px solid ${P.rejilla}` }}>
      <PuntoFamilia familia={r.familia} />
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Cuerpo fuerte estilo={{ textWrap: 'pretty' }}>{r.prueba_es}</Cuerpo>
        <Etiqueta estilo={{ textWrap: 'pretty' }}>
          {fechaLegible(r.fecha, hoy)}
          {r.anterior ? ` · antes ${formatear(r.anterior.valor, r.unidad)}` : ''}
          {r.ancla !== 'medida' ? ` · ${ANCLA_ETIQUETA[r.ancla]}` : ''}
        </Etiqueta>
      </div>
      {r.nuevo ? <Sello texto="Nuevo" /> : null}
      <Numeral texto={formatear(r.valor, r.unidad)} cuerpo={TA.datoMenor.cuerpo} />
    </div>
  );
}

/** Un sello sin naranja: tinta sobre nada, borde fino. El naranja es acción. */
export function Sello({ texto }: { texto: string }) {
  return <span style={{ font: `700 ${TA.etiqueta.cuerpo}px/1 ${P.fuente}`, color: P.fondo, background: P.tinta, padding: '5px 8px', borderRadius: 999, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{texto}</span>;
}

const MARCA_CUMPLIMIENTO: Record<Cumplimiento, string> = {
  dentro: '✓',
  'por-encima': '▲',
  'por-debajo': '▼',
  'no-hecha': '✕',
  'sin-plan': '·',
};

export function FilaSesion({ s, hoy, onAbrir }: { s: SesionResumen; hoy: string; onAbrir?: () => void }) {
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '8px 0', borderBottom: `1px solid ${P.rejilla}` }}>
      <span style={{ width: 26, textAlign: 'center', font: `700 ${TA.cuerpo.cuerpo}px/1 ${P.fuente}`, color: s.cumplimiento === 'dentro' ? P.tinta : P.tinta2, flex: '0 0 auto' }} aria-label={CUMPLIMIENTO_PALABRA[s.cumplimiento]}>
        {MARCA_CUMPLIMIENTO[s.cumplimiento]}
      </span>
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <PuntoFamilia familia={s.familia} talla={8} />
          <Cuerpo fuerte estilo={{ textWrap: 'pretty' }}>{s.titulo_es}</Cuerpo>
        </span>
        <Etiqueta estilo={{ textWrap: 'pretty' }}>
          {fechaLegible(s.fecha, hoy)} · {CUMPLIMIENTO_PALABRA[s.cumplimiento]}
          {s.detalle_es ? ` · ${s.detalle_es}` : ''}
        </Etiqueta>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, flex: '0 0 auto' }}>
        {s.plan_tss != null ? (
          <>
            <Numeral texto={String(Math.round(s.plan_tss))} cuerpo={TA.etiqueta.cuerpo + 2} tono={P.tinta2} />
            <Etiqueta>→</Etiqueta>
          </>
        ) : null}
        <Numeral texto={s.hecho_tss != null ? String(Math.round(s.hecho_tss)) : '—'} cuerpo={TA.datoMenor.cuerpo} tono={s.hecho_tss != null ? P.tinta : P.tinta2} />
      </span>
    </div>
  );
  return onAbrir ? (
    <button type="button" onClick={onAbrir} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }} aria-label={`Abrir ${s.titulo_es}`}>
      {inner}
    </button>
  ) : (
    inner
  );
}

// ---------------------------------------------------------------------------
// Los estados que no son «lleno» — con salida obligatoria (§5, §6.2 bis)
// ---------------------------------------------------------------------------

export type SalidaHueco = { tipo: 'accion'; texto: string; onTap?: () => void } | { tipo: 'espera'; texto: string };

/**
 * vacío: qué hacer para tenerlo · poco: cuánto falta (el plazo dibujado) ·
 * viejo: desde cuándo, y qué lo reanuda. Nunca una silueta muda.
 */
export function HuecoBloque({ estado, titulo, cuerpo, salida, plazo }: { estado: Exclude<EstadoBloque, 'lleno'>; titulo: string; cuerpo: string; salida: SalidaHueco; plazo?: { llevas: number; hacen: number } }) {
  return (
    <Superficie estilo={{ display: 'flex', flexDirection: 'column', gap: 10, borderLeft: estado === 'viejo' ? `3px solid ${P.tinta2}` : undefined }}>
      <Cuerpo fuerte>{titulo}</Cuerpo>
      <Cuerpo tono={P.tinta2}>{cuerpo}</Cuerpo>
      {plazo ? <Plazo llevas={plazo.llevas} hacen={plazo.hacen} /> : null}
      {salida.tipo === 'accion' ? <BotonAccion texto={salida.texto} onTap={salida.onTap} /> : <Etiqueta>{salida.texto}</Etiqueta>}
    </Superficie>
  );
}

/** «llevas 3 de 6 semanas»: el plazo, dibujado. */
export function Plazo({ llevas, hacen }: { llevas: number; hacen: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4, height: 8 }} role="img" aria-label={`${llevas} de ${hacen} semanas`}>
        {Array.from({ length: hacen }, (_, i) => (
          <span key={i} style={{ flex: 1, borderRadius: 2, background: i < llevas ? P.tinta : P.carril }} />
        ))}
      </div>
      <Etiqueta>
        {llevas} de {hacen} semanas
      </Etiqueta>
    </div>
  );
}

/** La ÚNICA pieza naranja de la pestaña: una acción que el atleta puede hacer ahora. */
export function BotonAccion({ texto, onTap, secundario = false }: { texto: string; onTap?: () => void; secundario?: boolean }) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        height: secundario ? 44 : TA.boton.alto,
        padding: '0 18px',
        borderRadius: 999,
        background: secundario ? P.superficie2 : P.accion,
        color: secundario ? P.tinta : P.sobreAccion,
        font: `${TA.boton.peso} ${secundario ? TA.cuerpo.cuerpo : TA.boton.cuerpo}px/1 ${P.fuente}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </button>
  );
}

// ---------------------------------------------------------------------------
// El Estado fijo (pregunta 1)
// ---------------------------------------------------------------------------

/**
 * La cabecera que no se va. Fila 1: «Hoy» y la palabra del coach. Fila 2: las
 * celdas que EXISTEN — Forma, Fatiga, Frescura y la Disposición de hoy — y solo
 * esas: lo que no se sabe no se pinta ni con guiones (§7). Lo que falta se
 * dice en una línea (`nota`), con su plazo, no con un hueco.
 */
export function EstadoFijo({
  palabra,
  forma,
  fatiga,
  frescura,
  disposicion,
  nota,
  onGlosa,
}: {
  palabra: string | null;
  forma: number | null;
  fatiga: number | null;
  frescura: number | null;
  /** 0–100 de hoy con su palabra, o null si no hay reloj. */
  disposicion: { valor: number; palabra: string } | null;
  /** Qué falta y desde cuándo: «Forma y frescura desde la 6.ª semana (llevas 3)», «sin entrenar 23 días». */
  nota?: string | null;
  onGlosa?: () => void;
}) {
  const celdas: Array<{ k: string; v: number; signo?: boolean; palabra?: string }> = [];
  if (forma != null) celdas.push({ k: 'Forma', v: forma });
  if (fatiga != null) celdas.push({ k: 'Fatiga', v: fatiga });
  if (frescura != null) celdas.push({ k: 'Frescura', v: frescura, signo: true });
  if (disposicion) celdas.push({ k: 'Disposición', v: disposicion.valor, palabra: disposicion.palabra });
  const texto = (v: number, signo?: boolean) => (signo && v > 0 ? `+${Math.round(v)}` : String(Math.round(v)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: celdas.length ? 8 : 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
        <Etiqueta>Hoy</Etiqueta>
        <span style={{ font: `${TA.palabra.peso} ${TA.palabra.cuerpo}px/1.05 ${P.fuente}`, letterSpacing: '-0.015em', color: palabra ? P.tinta : P.tinta2, textWrap: 'balance' }}>{palabra ?? 'Sin carga todavía'}</span>
      </div>
      {celdas.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${celdas.length}, minmax(0, 1fr))`, gap: 8 }}>
          {celdas.map((c) => (
            <button
              key={c.k}
              type="button"
              onClick={onGlosa}
              aria-label={`${c.k}: qué es`}
              style={{ all: 'unset', cursor: onGlosa ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
            >
              <Etiqueta>{c.k}</Etiqueta>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
                <Numeral texto={texto(c.v, c.signo)} cuerpo={TA.dato.cuerpo} />
                {c.palabra ? <Etiqueta>{c.palabra}</Etiqueta> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {nota ? <Etiqueta estilo={{ textWrap: 'pretty' }}>{nota}</Etiqueta> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La glosa (A5): a un toque, en una hoja
// ---------------------------------------------------------------------------

export function Glosa({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  if (!abierta) return null;
  return (
    <div role="dialog" aria-label="Qué significa cada número" style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} style={{ all: 'unset', position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)' }} />
      <div style={{ position: 'relative', background: P.superficie, borderRadius: `${RADIO_A.hoja}px ${RADIO_A.hoja}px 0 0`, padding: `18px ${MARGEN_A}px calc(var(--twin-safe-bottom) + 16px)`, display: 'flex', flexDirection: 'column', gap: 14, animation: 'iphone-sube 260ms ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, font: `${TA.titulo.peso} ${TA.titulo.cuerpo}px/1.1 ${P.fuente}` }}>Qué significa cada número</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ all: 'unset', cursor: 'pointer', width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: P.superficie2, color: P.tinta }}>
            <Icono nombre="terminar" talla={18} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {GLOSARIO.map((g) => (
            <div key={g.termino} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Cuerpo fuerte>{g.termino}</Cuerpo>
                {g.sigla ? <Etiqueta>{g.sigla}</Etiqueta> : null}
              </span>
              <Cuerpo tono={P.tinta2}>{g.que_es}</Cuerpo>
            </div>
          ))}
        </div>
        <Etiqueta>Los días de forma y fatiga, las bandas y los umbrales los fija tu coach.</Etiqueta>
      </div>
    </div>
  );
}

/** El gancho de la glosa: quién la abre y quién la cierra, para no repetirlo en cada pantalla. */
export function useGlosa(onLog?: (l: string) => void) {
  const [abierta, setAbierta] = useState(false);
  return {
    abierta,
    abrir: () => {
      setAbierta(true);
      onLog?.('Glosa abierta: Forma · Fatiga · Frescura · Carga · Motor · Disposición');
    },
    cerrar: () => setAbierta(false),
  };
}

/** Una lista de filas sin la última raya. */
export function Lista({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', marginTop: -6 }}>{children}</div>;
}

/** Una nota de honestidad bajo un gráfico: procedencia, cobertura, dato viejo. */
export function Nota({ children }: { children: ReactNode }) {
  return <Etiqueta estilo={{ textWrap: 'pretty' }}>{children}</Etiqueta>;
}
