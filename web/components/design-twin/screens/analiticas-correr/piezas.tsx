'use client';

// Las piezas de la analítica. El lenguaje no se reinventa: la cabecera de
// sección, la barra de zonas y la fila de apoyos ya están aprobadas y shipeadas
// y se importan tal cual. Lo único nuevo aquí es lo que esta pantalla necesita
// y ninguna otra tenía: el veredicto, el tramo causal y la petición hoisteada.

import type { ReactNode } from 'react';
import { colorZona } from '../../kit-vivo';
import { esDecimal, reloj, ritmoKm } from '../../kit-composicion/formato';
import { R, S } from '../../kit-composicion/tokens';
import { BarraZonas, type SegmentoZona } from '../post-entreno/piezas';
import { Seccion } from '../lectura-carrera/piezas';
import { METODO, porQueFalta, tonoDe, type Falta, type Historia, type Pedido, type Veredicto } from './modelo';

// ---------------------------------------------------------------------------
// EL VEREDICTO — una frase, su porqué, y nada más
// ---------------------------------------------------------------------------

/**
 * Aquí es donde esta pantalla se separa de la de hoy. Hoy el atleta abre y ve
 * catorce números; ninguno le dice si está mejorando, que es lo único que venía
 * a mirar. Aquí lo primero que lee es la respuesta.
 *
 * No hay índice del 0 al 100. Un número propietario que sale de una fórmula que
 * nadie puede auditar es exactamente lo que la Regla Nº0 prohíbe: se lee como
 * dato y es opinión disfrazada. La frase, en cambio, se puede rastrear hasta el
 * número del que salió — y ese número va escrito debajo.
 */
export function Portada({ veredicto }: { veredicto: Veredicto }) {
  const tono = tonoDe(veredicto.clase);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: S.s, paddingTop: S.xs }}>
      <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.14em' }}>
        Correr
      </span>
      <h1
        style={{
          margin: 0,
          font: 'italic 800 30px/1.06 var(--twin-font-sans)',
          letterSpacing: '-0.02em',
          color: tono,
          textWrap: 'balance',
        }}
      >
        {veredicto.frase}
      </h1>
      <p style={{ margin: 0, font: '500 13.5px/1.42 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {veredicto.porque}
      </p>
      {veredicto.loQueSiHay && (
        <p style={{ margin: 0, font: '500 12px/1.42 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {veredicto.loQueSiHay}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// EL TRAMO — lo que convierte cuatro tarjetas en un argumento
// ---------------------------------------------------------------------------

/**
 * Una rejilla de tarjetas trata igual el trabajo que metes y el efecto que
 * produce, y con eso pierde lo único interesante: que **una explica a la otra**.
 * Separarlas y ponerles nombre es lo que hace que el atleta que carga de más lo
 * VEA — arriba el motor respondiendo peor, y debajo, en la misma pantalla, el
 * tercio del tiempo a ritmo medio que lo explica.
 */
export function Tramo({ titulo, pie, children }: { titulo: string; pie?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: S.l }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: S.s, borderTop: '1px solid var(--twin-hairline-strong)' }}>
        <span style={{ font: 'italic 800 15px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)', letterSpacing: '-0.01em' }}>
          {titulo}
        </span>
        {pie && <span style={{ font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{pie}</span>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// LA PIEZA — un título, una lectura con comparación, y el dibujo
// ---------------------------------------------------------------------------

/**
 * `lectura` NUNCA es un número suelto: es la frase que compara. Un «42 km» no
 * dice nada; un «42 km, ocho más que hace dos meses» sí. Esa es la diferencia
 * entre el panel de instrumentos de hoy y una respuesta, y por eso el campo es
 * obligatorio en el tipo — una pieza sin comparación no se puede montar.
 */
export function Pieza({
  titulo,
  lectura,
  tono = 'var(--twin-fg)',
  nota,
  marca,
  children,
}: {
  titulo: string;
  lectura: string;
  tono?: string;
  nota?: string;
  /** El sello de «esto solo lo tienes aquí». Discreto: no es un trofeo. */
  marca?: string;
  children?: ReactNode;
}) {
  return (
    <Seccion titulo={titulo}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
        <p style={{ margin: 0, font: '600 14.5px/1.35 var(--twin-font-sans)', color: tono, textWrap: 'balance' }}>
          {lectura}
        </p>
        {children}
        {(nota || marca) && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: S.s, flexWrap: 'wrap' }}>
            {marca && <Marca>{marca}</Marca>}
            {nota && (
              <span style={{ font: '500 11.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', flex: 1, minWidth: 0 }}>
                {nota}
              </span>
            )}
          </div>
        )}
      </div>
    </Seccion>
  );
}

function Marca({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        flex: '0 0 auto',
        padding: '2px 7px',
        borderRadius: R.pill,
        border: '1px solid var(--twin-hairline-strong)',
        font: '600 9.5px/1.3 var(--twin-font-sans)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--twin-muted)',
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LO QUE FALTA — dicho una vez, y con la salida puesta
// ---------------------------------------------------------------------------

/**
 * LA PETICIÓN SALE UNA VEZ Y NOMBRA LO QUE ABRE.
 *
 * Al atleta sin test de umbral se le caen dos lecturas por la misma razón. La
 * versión fácil es dejar dos tarjetas grises pidiéndole el test dos veces; el
 * resultado es una pantalla que da la brasa y que además esconde el bulto,
 * porque ninguna de las dos dice que la otra también espera lo mismo.
 *
 * Así que va al revés: UN bloque, arriba, que dice **qué lecturas te faltan** y
 * **qué las abre**. Nada se oculta y nada se repite.
 */
export function Peticion({ falta, abre, accion }: { falta: Falta; abre: string[]; accion: string }) {
  const lista = abre.length === 2 ? `${abre[0]} y ${abre[1]}` : abre.join(', ');
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: `${S.m}px ${S.m}px`,
        borderRadius: R.l,
        border: '1px dashed var(--twin-hairline-strong)',
      }}
    >
      <span style={{ font: '700 12.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {abre.length === 1 ? `Te falta una lectura: ${lista}.` : `Te faltan ${abre.length} lecturas: ${lista}.`}
      </span>
      <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {porQueFalta(falta)}
      </span>
      <span style={{ font: '700 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>{accion}</span>
    </div>
  );
}

/** Cuando una pieza espera sola, lo dice en su sitio y sin dramatizar. */
export function Espera({ titulo, falta }: { titulo: string; falta: Falta }) {
  return (
    <Seccion titulo={titulo}>
      <span style={{ font: '500 12.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {porQueFalta(falta)}
      </span>
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// EL REPARTO — la barra de siempre, y la lectura que la interpreta
// ---------------------------------------------------------------------------

/**
 * La barra es la MISMA que en la lectura de una carrera, con las cinco zonas y
 * sus colores de siempre: un tramo ámbar significa Z4 aquí, en el mapa y en el
 * resumen. El color es dato y no puede querer decir dos cosas (§9.1).
 *
 * Encima va el colapso a tres —suave, medio, fuerte— porque el reparto se juzga
 * con tres cubos y no con cinco, y los tres números salen DE LA BARRA, no de
 * otra cuenta: que el texto y el dibujo puedan discrepar es cómo nace un bug
 * que nadie ve hasta que lo ve un atleta.
 */
export function colapsoDe(segmentos: SegmentoZona[]) {
  const suma = (zonas: number[]) => segmentos.filter((s) => s.zona != null && zonas.includes(s.zona)).reduce((a, s) => a + s.pct, 0);
  return { suave: suma([1, 2]), medio: suma([3]), fuerte: suma([4, 5]) };
}

export function Reparto({ segmentos }: { segmentos: SegmentoZona[] }) {
  const c = colapsoDe(segmentos);
  const objetivo = METODO.reparto;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <BarraZonas segmentos={segmentos} />
      <div style={{ display: 'flex', gap: S.m }}>
        <Cubo etiqueta="Suave" pct={c.suave} objetivo={objetivo.suave} color={colorZona(2)} />
        <Cubo etiqueta="Medio" pct={c.medio} color={colorZona(3)} />
        <Cubo etiqueta="Fuerte" pct={c.fuerte} objetivo={objetivo.fuerte} color={colorZona(4)} />
      </div>
    </div>
  );
}

function Cubo({ etiqueta, pct, objetivo, color }: { etiqueta: string; pct: number; objetivo?: number; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ font: '600 9.5px/1.2 var(--twin-font-sans)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--twin-faint)' }}>
        {etiqueta}
      </span>
      <span className="t-readout-s" style={{ fontSize: 19, color }}>{`${pct}%`}</span>
      {/* El objetivo del coach, no un ideal universal: otro entrenador reparte
          distinto y el suyo manda (Regla Nº0). El cubo del medio no lleva
          objetivo porque nadie prescribe ritmo medio: es lo que sobra. */}
      <span style={{ font: '500 10px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
        {objetivo != null ? `te pide ${objetivo}%` : 'ni suave ni fuerte'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LO QUE TE PIDIERON — y el sesgo, que es lo que de verdad informa
// ---------------------------------------------------------------------------

/**
 * El mismo 70% de acierto significa cosas opuestas según hacia dónde se falle
 * (§07.2 del diagnóstico): fallar lento es que el ritmo te viene largo, fallar
 * rápido es que sales pasado. Por eso el porcentaje solo no se enseña nunca.
 *
 * Y el sesgo NO se afirma con dos fallos. Con tan pocos, la dirección es azar y
 * llamarla tendencia es inventarse un dato — se enseña el número y se calla la
 * interpretación, que es lo honesto y no cuesta nada.
 */
const FALLOS_PARA_AFIRMAR_SESGO = 3;

export function sesgoDe(p: Pedido): string | null {
  const fallos = p.fueraLento + p.fueraRapido;
  if (fallos < FALLOS_PARA_AFIRMAR_SESGO) return null;
  // «Casi siempre» para cinco de siete es exagerar, y exagerar en una frase que
  // el atleta va a creerse cuesta más que no decir nada. Lo que se afirma es la
  // dirección del fallo, que es lo único que el reparto sostiene.
  if (p.fueraRapido >= p.fueraLento * 2) return 'Cuando te sales, es por salir pasado de rosca.';
  if (p.fueraLento >= p.fueraRapido * 2) return 'Cuando te sales, es por quedarte corto.';
  return null;
}

export function Pedido_({ pedido }: { pedido: Pedido }) {
  const pct = Math.round((pedido.dentro / pedido.evaluadas) * 100);
  const bien = pct >= METODO.enBandaBienPct;
  const sesgo = sesgoDe(pedido);
  const rompe = pedido.seRompeEnLaRepeticion;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S.s }}>
        <span className="t-readout-m" style={{ color: bien ? 'var(--twin-ok)' : 'var(--twin-fg)' }}>{`${pct}%`}</span>
        <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {`${pedido.dentro} de ${pedido.evaluadas} en la banda que te puso`}
        </span>
      </div>
      {sesgo && <span style={{ font: '600 12.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{sesgo}</span>}
      {rompe != null && (
        <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {`Se te rompe a partir de la ${rompe}ª: el ritmo lo tienes, lo que no aguanta es el número de series.`}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TU CARRERA — el día, el tiempo, y lo único que de verdad transfiere
// ---------------------------------------------------------------------------

/**
 * El tiempo predicho SOLO existe si hay de dónde sacarlo. Sin una carrera
 * previa que proyectar no se inventa una cifra bonita: se dice que aún no la
 * hay y por qué. Una predicción sin base es el número inventado que esta
 * pantalla entera se ha propuesto no tener.
 */
export function Carrera({
  historia,
  llega,
}: {
  historia: NonNullable<Historia['carrera']>;
  /** Si la tendencia le lleva ahí. Sale del veredicto: no es otra cuenta. */
  llega: { texto: string; tono: string } | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: S.s, flexWrap: 'wrap' }}>
        <span className="t-readout-m">{historia.dias}</span>
        <span style={{ font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          {`días para ${historia.nombre}`}
        </span>
      </div>
      {historia.predicho ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
            {`Si fueras hoy, ${reloj(historia.predicho.segundos)}`}
          </span>
          <span style={{ font: '500 11.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {`Sale de ${historia.predicho.base}.`}
          </span>
        </div>
      ) : (
        <span style={{ font: '500 12.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Todavía no hay tiempo predicho: será tu primera, así que no hay de dónde sacarlo.
        </span>
      )}
      {llega && (
        <span style={{ font: '600 12.5px/1.4 var(--twin-font-sans)', color: llega.tono }}>{llega.texto}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formateadores de esta pantalla
// ---------------------------------------------------------------------------

/** El ritmo del eje va sin `/km`: la unidad ya la dice el título de la pieza. */
export const ejeRitmo = (skm: number) => reloj(Math.round(skm));

/** El coste de correr cansado, en segundos por km con un decimal. */
export const ejeCoste = (skm: number) => `${esDecimal(skm)} s`;

export { ritmoKm };
