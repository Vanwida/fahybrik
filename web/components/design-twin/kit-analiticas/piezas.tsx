'use client';

// LAS PIEZAS DEL IPHONE — los átomos y las filas de la pestaña de analíticas,
// con el diseño de «Hoy · El día»: tarjetas de radio 22 sobre `--twin-surface`,
// cifras en cursiva pesada tabular, etiquetas de 15 px a 700, la pastilla de
// tinta invertida como acción y ningún gris que no salga de un token del tema.
// Lo genérico (Rotulo, Pastilla, Esqueleto, iconos) se IMPORTA de `kit-dia`;
// aquí vive lo que solo tiene sentido con el contrato de analíticas.
//
//   Etiqueta / Cuerpo / Numeral   el texto (apoyo 15, cuerpo 17, cifra)
//   Superficie / Rejilla / Lista  la tarjeta, la rejilla de teselas y la lista con rayas
//   Celda                         una tesela de dato: etiqueta, cifra, unidad, delta y ancla
//   Delta                         ▲ mejor · ▼ peor · ≈ dentro del ruido, con su palabra
//   AnclaChip                     «medido», «declarado», «estimado», «por edad»
//   FilaProgreso / FilaRecord / FilaSesion   las tres filas de la portada
//   HuecoBloque                   vacío / poco / viejo, con salida obligatoria
//   BotonAccion                   la pastilla de tinta invertida (o su versión de contorno)
//
// La pantalla, el selector de ventana, la sección y la hoja del glosario están
// en `pantalla.tsx`; el sujeto de la portada (el Estado), en `estado.tsx`.

import { Children, type CSSProperties, type ReactNode } from 'react';
import { IcoChevron, IcoFlecha, SelloEstado } from '../kit-dia/iconos';
import { Pastilla, Rotulo } from '../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../kit-dia/tokens';
import {
  ANCLA_ETIQUETA,
  CUMPLIMIENTO_PALABRA,
  FAMILIA_NOMBRE,
  type Ancla,
  type Comparacion,
  type Cumplimiento,
  type EstadoBloque,
  type Familia,
  type FamiliaGrande,
  type PuntoSerie,
  type RecordPanel,
  type SesionResumen,
  type UnidadPanel,
} from './contrato';
import { cifra, esCero, fechaLegible, formatear, formatearDelta, unidadCorta } from './fmt';
import { Chispa } from './graficos';
import { esMejora } from './mecanismo';
import { CUERPO_HEROE, DATO_FILA, HUECO_TESELAS, PIEL_IPHONE as P, chispaDe, colorFamilia } from './tokens';

/** Texto solo para lectores de pantalla: la palabra que la marca visual no dice. */
const SOLO_LECTOR: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Texto de apoyo: 15 px, en el gris del tema. Unidades, fechas, procedencia y pies de gráfico. */
export function Etiqueta({ children, tono = P.tinta2, estilo }: { children: ReactNode; tono?: string; estilo?: CSSProperties }) {
  return <span style={{ ...fuente(600, TAM.suelo, 1.25), color: tono, textWrap: 'pretty', ...estilo }}>{children}</span>;
}

export function Cuerpo({ children, tono = P.tinta, fuerte = false, estilo }: { children: ReactNode; tono?: string; fuerte?: boolean; estilo?: CSSProperties }) {
  return <span style={{ ...fuente(fuerte ? 700 : 500, TAM.cuerpo, 1.3), color: tono, textWrap: 'pretty', ...estilo }}>{children}</span>;
}

/** Una cifra. De héroe (≥ 28) va en cursiva pesada como toda cifra de «El día»; una de fila va recta, para leerse en columna. */
export function Numeral({ texto, cuerpo, tono = P.tinta, estilo }: { texto: string; cuerpo: number; tono?: string; estilo?: CSSProperties }) {
  const heroe = cuerpo >= CUERPO_HEROE;
  return (
    <span
      style={{
        ...fuente(heroe ? 800 : 700, cuerpo, 1, heroe),
        ...TABULAR,
        letterSpacing: heroe ? '-0.02em' : 0,
        color: tono,
        whiteSpace: 'nowrap',
        ...estilo,
      }}
    >
      {texto}
    </span>
  );
}

/** Una nota de honestidad bajo un gráfico: procedencia, cobertura, dato viejo. */
export function Nota({ children }: { children: ReactNode }) {
  return <Etiqueta>{children}</Etiqueta>;
}

// ---------------------------------------------------------------------------
// Superficies
// ---------------------------------------------------------------------------

const TARJETA: CSSProperties = {
  background: 'var(--twin-surface)',
  border: '1px solid var(--twin-hairline)',
  borderRadius: RADIO.tarjeta,
  boxSizing: 'border-box',
};

/** La tarjeta de «El día»: superficie, raya fina y radio 22. Los gráficos van dentro de una. */
export function Superficie({ children, estilo, padding = 16 }: { children: ReactNode; estilo?: CSSProperties; padding?: number | string }) {
  return <div style={{ ...TARJETA, padding, ...estilo }}>{children}</div>;
}

/** Rejilla de teselas: dos columnas, la última suelta a lo ancho cuando le toca. */
export function Rejilla({ children, columnas = 2 }: { children: ReactNode; columnas?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, gap: HUECO_TESELAS }}>{children}</div>;
}

/** Una tarjeta con filas separadas por una raya fina. El toque de cada fila es suyo (`hd-toque`). */
export function Lista({ children }: { children: ReactNode }) {
  const filas = Children.toArray(children);
  return (
    <div style={{ ...TARJETA, overflow: 'hidden' }}>
      {filas.map((f, i) => (
        <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--twin-hairline)' : undefined }}>
          {f}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La tesela de dato
// ---------------------------------------------------------------------------

/**
 * Un dato: etiqueta arriba, cifra a 32 con la unidad a 15, y debajo el delta en
 * la unidad que lo juzga y el ancla. `valor` null pinta «sin dato» SOLO si hay
 * una salida (§6.2 bis); si no, la celda no existe.
 */
export function Celda({
  etiqueta,
  valor,
  unidad,
  comparacion,
  ancla,
  nota,
  pie,
  cuerpo = TAM.dato,
  aLoAncho = false,
}: {
  etiqueta: string;
  valor: number;
  unidad: UnidadPanel;
  comparacion?: Comparacion | null;
  ancla?: Ancla;
  /** Una línea en gris debajo (la fecha del récord, el basal). */
  nota?: string;
  pie?: ReactNode;
  cuerpo?: number;
  aLoAncho?: boolean;
}) {
  const u = unidadCorta(unidad, valor ?? undefined);
  return (
    <Superficie estilo={{ display: 'flex', flexDirection: 'column', gap: 8, gridColumn: aLoAncho ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Rotulo>{etiqueta}</Rotulo>
        {ancla ? <AnclaChip ancla={ancla} /> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
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
 * El COLOR va en la marca (verde, ámbar, gris) y nunca en la cifra; la forma y
 * la palabra dicen lo mismo sin color. Se parte en dos líneas si no cabe. `enSujeto`: sobre un tinte todo
 * el texto va en la tinta del tema (el gris de apoyo no llega a 4,5:1 sobre un tinte).
 */
export function Delta({ comparacion, unidad, corto = false, enSujeto = false }: { comparacion: Comparacion; unidad: UnidadPanel; corto?: boolean; enSujeto?: boolean }) {
  const mejor = esMejora(comparacion, unidad);
  const igual = !comparacion.significativo;
  const marca = igual ? '≈' : mejor ? '▲' : '▼';
  const color = igual ? (enSujeto ? P.tinta : 'var(--twin-muted)') : mejor ? 'var(--twin-ok)' : 'var(--twin-warning)';
  const texto = esCero(comparacion.delta, unidad) ? 'igual' : formatearDelta(comparacion.delta, unidad);
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 6px', minWidth: 0, ...fuente(700, TAM.suelo, 1.25), color: igual && !enSujeto ? P.tinta2 : P.tinta }}>
      <span style={{ ...TABULAR, whiteSpace: 'nowrap' }}>
        <span style={SOLO_LECTOR}>{igual ? 'Sin cambio: ' : mejor ? 'Mejor: ' : 'Peor: '}</span>
        <span aria-hidden style={{ color }}>
          {marca}
        </span>{' '}
        {texto}
      </span>
      {!corto ? <span style={{ fontWeight: 500, color: enSujeto ? P.tinta : P.tinta2 }}>{comparacion.etiqueta_es}</span> : null}
    </span>
  );
}

/** De dónde sale la cifra. El estimado va con la raya a trazos: se distingue de un dato medido sin depender del color. */
export function AnclaChip({ ancla, enSujeto = false }: { ancla: Ancla; enSujeto?: boolean }) {
  const estimada = ancla === 'estimada' || ancla === 'poblacional';
  return (
    <span
      style={{
        ...fuente(700, TAM.suelo, 1),
        color: enSujeto ? P.tinta : P.tinta2,
        padding: '5px 10px',
        borderRadius: RADIO.pastilla,
        border: `1.5px ${estimada ? 'dashed' : 'solid'} ${enSujeto ? velo('var(--twin-fg)', 45) : 'var(--twin-faint)'}`,
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
      }}
    >
      {ANCLA_ETIQUETA[ancla]}
    </span>
  );
}

export function PuntoFamilia({ familia, talla = 12 }: { familia: Familia | FamiliaGrande; talla?: number }) {
  return <span aria-hidden style={{ width: talla, height: talla, borderRadius: '50%', background: colorFamilia(P, familia), flex: '0 0 auto' }} />;
}

/** «Nuevo»: una pastilla tenue de la tinta del tema. Ni naranja (es del acento del club) ni tinta invertida (eso es una acción): en una tabla con seis marcas nuevas no puede gritar. */
export function Sello({ texto }: { texto: string }) {
  return (
    <Pastilla fondo={velo('var(--twin-fg)', 10)} tinta="var(--twin-fg)" borde={velo('var(--twin-fg)', 22)}>
      {texto}
    </Pastilla>
  );
}

// ---------------------------------------------------------------------------
// Filas — viven dentro de una `Lista`, que pone las rayas
// ---------------------------------------------------------------------------

const FILA: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', boxSizing: 'border-box' };

function ChevronFila() {
  return (
    <span aria-hidden style={{ color: P.tinta2, display: 'inline-flex', flex: '0 0 auto' }}>
      <IcoChevron tam={18} />
    </span>
  );
}

/** La fila entera es un botón cuando lleva a algún sitio; si no, es solo una fila. */
function FilaToque({ onAbrir, etiqueta, children }: { onAbrir?: () => void; etiqueta: string; children: ReactNode }) {
  return onAbrir ? (
    <button type="button" className="hd-toque" onClick={onAbrir} aria-label={etiqueta}>
      {children}
    </button>
  ) : (
    <>{children}</>
  );
}

/** Una familia en Progreso: nombre + métrica clave · cifra · delta · chispa · «›». `nombre` sustituye al de la familia (un ejercicio de fuerza). */
export function FilaProgreso({
  familia,
  metrica,
  valor,
  unidad,
  comparacion,
  tendencia,
  nota,
  onAbrir,
  nombre,
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
  nombre?: string;
}) {
  const u = unidadCorta(unidad, valor ?? undefined);
  return (
    <FilaToque onAbrir={onAbrir} etiqueta={`Abrir ${nombre ?? FAMILIA_NOMBRE[familia]}`}>
      <div style={{ ...FILA, minHeight: 76 }}>
        <PuntoFamilia familia={familia} />
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: '2px 8px', minWidth: 0, flexWrap: 'wrap' }}>
            <Cuerpo fuerte>{nombre ?? FAMILIA_NOMBRE[familia]}</Cuerpo>
            <Etiqueta>{metrica}</Etiqueta>
          </span>
          {valor != null ? (
            <>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <Numeral texto={cifra(valor, unidad)} cuerpo={DATO_FILA} />
                {u ? <Etiqueta>{u}</Etiqueta> : null}
              </span>
              {comparacion ? <Delta comparacion={comparacion} unidad={unidad} corto /> : nota ? <Etiqueta>{nota}</Etiqueta> : null}
            </>
          ) : (
            <Etiqueta>{nota ?? 'sin dato'}</Etiqueta>
          )}
        </div>
        {tendencia && tendencia.length > 1 ? <Chispa piel={P} puntos={tendencia} color={chispaDe(colorFamilia(P, familia))} /> : null}
        {onAbrir ? <ChevronFila /> : null}
      </div>
    </FilaToque>
  );
}

export function FilaRecord({ r, hoy }: { r: RecordPanel; hoy: string }) {
  return (
    <div style={{ ...FILA, minHeight: 68 }}>
      <PuntoFamilia familia={r.familia} />
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Cuerpo fuerte>{r.prueba_es}</Cuerpo>
        <Etiqueta>
          {fechaLegible(r.fecha, hoy)}
          {r.anterior ? ` · antes ${formatear(r.anterior.valor, r.unidad)}` : ''}
          {r.ancla !== 'medida' ? ` · ${ANCLA_ETIQUETA[r.ancla]}` : ''}
        </Etiqueta>
      </div>
      {r.nuevo ? <Sello texto="Nuevo" /> : null}
      <Numeral texto={formatear(r.valor, r.unidad)} cuerpo={DATO_FILA} />
    </div>
  );
}

/**
 * La marca de cumplimiento de una sesión: los sellos del Plan (hecho ✓, sin hacer ✕, sin plan ○) y, para
 * «más» o «menos de lo pedido», un círculo con ▲ o ▼. La forma y la palabra van siempre; el color, solo en ✓.
 */
export function MarcaCumplimiento({ c }: { c: Cumplimiento }) {
  const palabra = CUMPLIMIENTO_PALABRA[c];
  const sello =
    c === 'dentro' ? (
      <SelloEstado estado="hecha" tam={28} />
    ) : c === 'no-hecha' ? (
      <SelloEstado estado="saltada" tam={28} />
    ) : c === 'sin-plan' ? (
      <SelloEstado estado="pendiente" tam={28} />
    ) : (
      <svg width={28} height={28} viewBox="0 0 28 28" aria-hidden style={{ flex: '0 0 auto', color: 'var(--twin-fg)' }}>
        <circle cx={14} cy={14} r={12} fill="none" stroke="var(--twin-muted)" strokeWidth={2} />
        <path d={c === 'por-encima' ? 'M14 8.5 19.5 18h-11z' : 'M14 19.5 8.5 10h11z'} fill="currentColor" />
      </svg>
    );
  return (
    <span style={{ position: 'relative', width: 28, height: 28, flex: '0 0 auto', display: 'inline-flex' }}>
      <span style={SOLO_LECTOR}>{palabra}</span>
      {sello}
    </span>
  );
}

export function FilaSesion({ s, hoy, onAbrir }: { s: SesionResumen; hoy: string; onAbrir?: () => void }) {
  return (
    <FilaToque onAbrir={onAbrir} etiqueta={`Abrir ${s.titulo_es}`}>
      <div style={{ ...FILA, minHeight: 68 }}>
        <MarcaCumplimiento c={s.cumplimiento} />
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            <span style={{ paddingTop: 8, display: 'inline-flex' }}>
              <PuntoFamilia familia={s.familia} talla={10} />
            </span>
            <Cuerpo fuerte>{s.titulo_es}</Cuerpo>
          </span>
          <Etiqueta>
            {fechaLegible(s.fecha, hoy)} · {CUMPLIMIENTO_PALABRA[s.cumplimiento]}
            {s.detalle_es ? ` · ${s.detalle_es}` : ''}
          </Etiqueta>
        </div>
        {/* La carga hecha, y debajo contra cuánto: en columna, para dejarle el ancho al título. */}
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: '0 0 auto', textAlign: 'right' }}>
          {s.hecho_tss != null ? <Numeral texto={String(Math.round(s.hecho_tss))} cuerpo={DATO_FILA} /> : s.cumplimiento !== 'no-hecha' ? <Etiqueta>no se sabe</Etiqueta> : null}
          {s.plan_tss != null ? <Etiqueta>{s.hecho_tss != null ? 'de' : 'plan'} {Math.round(s.plan_tss)}</Etiqueta> : null}
        </span>
        {onAbrir ? <ChevronFila /> : null}
      </div>
    </FilaToque>
  );
}

// ---------------------------------------------------------------------------
// Los estados que no son «lleno» — con salida obligatoria (§5, §6.2 bis)
// ---------------------------------------------------------------------------

export type SalidaHueco = { tipo: 'accion'; texto: string; onTap?: () => void } | { tipo: 'espera'; texto: string };

/**
 * vacío: qué hacer para tenerlo · poco: cuánto falta (el plazo dibujado) ·
 * viejo: desde cuándo, y qué lo reanuda. Nunca una silueta muda. Su salida es
 * secundaria (contorno): la acción principal de la pantalla es la del sujeto, y
 * ocho tarjetas con la misma pastilla de tinta no serían «una sola acción clara».
 */
export function HuecoBloque({ estado, titulo, cuerpo, salida, plazo }: { estado: Exclude<EstadoBloque, 'lleno'>; titulo: string; cuerpo: string; salida: SalidaHueco; plazo?: { llevas: number; hacen: number } }) {
  return (
    <Superficie estilo={{ display: 'flex', flexDirection: 'column', gap: 10, borderLeft: estado === 'viejo' ? '4px solid var(--twin-muted)' : undefined }}>
      <Cuerpo fuerte>{titulo}</Cuerpo>
      <Cuerpo tono={P.tinta2}>{cuerpo}</Cuerpo>
      {plazo ? <Plazo llevas={plazo.llevas} hacen={plazo.hacen} /> : null}
      {salida.tipo === 'accion' ? <BotonAccion texto={salida.texto} onTap={salida.onTap} secundario /> : <Etiqueta>{salida.texto}</Etiqueta>}
    </Superficie>
  );
}

/** «llevas 3 de 6 semanas»: el plazo, dibujado. `tono` es el del texto (dentro de un sujeto con tinte va en la tinta del tema). */
export function Plazo({ llevas, hacen, tono = P.tinta2 }: { llevas: number; hacen: number; tono?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4, height: 8 }} role="img" aria-label={`${llevas} de ${hacen} semanas`}>
        {Array.from({ length: hacen }, (_, i) => (
          <span key={i} style={{ flex: 1, borderRadius: RADIO.pastilla, background: i < llevas ? P.tinta : velo('var(--twin-fg)', 16) }} />
        ))}
      </div>
      <Etiqueta tono={tono}>
        {llevas} de {hacen} semanas
      </Etiqueta>
    </div>
  );
}

/**
 * La acción de una salida. La principal es la pastilla de tinta invertida de «El día» (52 pt, cursiva
 * pesada, flecha): una sola por hueco. La secundaria es una pastilla de contorno con el acento del club.
 */
export function BotonAccion({ texto, onTap, secundario = false }: { texto: string; onTap?: () => void; secundario?: boolean }) {
  return (
    <button type="button" className="hd-toque" onClick={onTap} style={{ width: 'auto', alignSelf: 'flex-start', borderRadius: RADIO.pastilla }}>
      {secundario ? (
        <span
          className="hd-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '0 18px',
            boxSizing: 'border-box',
            borderRadius: RADIO.pastilla,
            background: tinte('var(--twin-accent)', 8, 'var(--twin-surface)'),
            border: `1px solid ${velo('var(--twin-accent-text)', 45)}`,
            color: 'var(--twin-accent-text)',
            ...fuente(700, TAM.cuerpo, 1),
          }}
        >
          {texto}
        </span>
      ) : (
        <span
          className="hd-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            height: 52,
            padding: '0 22px',
            boxSizing: 'border-box',
            borderRadius: RADIO.pastilla,
            background: 'var(--twin-fg)',
            color: 'var(--twin-bg)',
            ...fuente(800, TAM.cuerpo, 1, true),
            letterSpacing: '0.01em',
          }}
        >
          {texto}
          <IcoFlecha tam={20} />
        </span>
      )}
    </button>
  );
}
