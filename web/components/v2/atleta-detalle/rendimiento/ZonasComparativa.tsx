'use client';

// ANTES CONTRA AHORA — dos periodos enfrentados, con su reparto y su diferencia.
//
// SE DIBUJA EN DOS SITIOS Y CON DOS PALETAS, igual que la gráfica: la ficha del
// coach (`--v2-*`) y dentro del móvil del atleta (`--twin-*`, en la previa del
// compositor y en la nota que le llega). No conoce ni un color ni un tamaño: los
// recibe. Una copia por superficie sería la bifurcación de siempre, y entonces la
// previa dejaría de servir para lo único que sirve.
//
// LA CUENTA NO ESTÁ AQUÍ. Los porcentajes, las diferencias y las frases vienen de
// `lib/zones/comparativa.ts`, que tiene tests. Esto es geometría y rótulos.
//
// TRES DECISIONES QUE SE VEN:
//   · Las dos barras van UNA SOBRE OTRA y no lado a lado: alineadas por su borde
//     izquierdo, el trozo que crece se ve sin medir. De paso, se lee igual en un
//     monitor y en un móvil de 390 sin una sola consulta de medios.
//   · El DELTA VA EN TINTA NEUTRA. Pintar de verde «más Z1» sería el sistema
//     opinando sobre qué reparto es bueno, y eso es método del coach, no
//     mecanismo nuestro (CLAUDE.md, HARD RULE Nº0). Quien dice si esto está bien
//     es él, con su texto debajo.
//   · La COBERTURA se dice en cada lado, siempre. Sin esa línea, un atleta que
//     conectó el reloj a mitad del periodo parecería haber triplicado su volumen.

import type { CSSProperties } from 'react';
import type { ZoneComparePeriodDTO, ZoneComparisonDTO } from '@fahybrid/shared/domain/zone-compare';
import {
  deltasDe,
  fraseDeCobertura,
  fraseDePuntos,
  fraseDeTiempo,
  fraseDeCadencia,
  ladosSinDato,
  partesDe,
  porSemanaMedida,
  sePuedeComparar,
} from '@/lib/zones/comparativa';
import {
  formatDuration,
  ZONE_PART_LABEL,
  ZONE_TOKENS_V2,
  type ZoneChartTokens,
  type ZonePartKey,
} from '@/lib/zones/chart';

/** Las dos medidas del bloque, por lo mismo que la gráfica tiene dos: dentro de
 *  una tarjeta en un móvil hay menos aire y el cuerpo baja un punto. */
export interface CompareMetrics {
  barH: number;
  titulo: number;
  cifra: number;
  pie: number;
  gap: number;
}

export const COMPARE_METRICS_FULL: CompareMetrics = {
  barH: 12,
  titulo: 12,
  cifra: 15,
  pie: 11.5,
  gap: 14,
};

export const COMPARE_METRICS_EMBED: CompareMetrics = {
  barH: 10,
  titulo: 11,
  cifra: 14,
  pie: 10.5,
  gap: 12,
};

// Geometría del propio dibujo, no del tema: esto se pinta con dos paletas
// (--v2-* del panel, --twin-* del doble) que no comparten variables CSS, así
// que un radio no puede leer un token de una sola — se calcula aquí en JS.
/** La barra siempre en pastilla completa: la mitad de su alto. */
const BAR_PILL_RADIO_FRACCION = 0.5;
/** El cuadradito de color junto a cada delta. */
const SWATCH_LADO = 8;
/** Esquina redondeada del cuadradito — geometría propia, no una pastilla. */
const SWATCH_RADIO = 2;

function rayado(tokens: ZoneChartTokens): string {
  // El tiempo que no se pudo repartir va rayado y no en gris liso: un bloque liso
  // se lee como «una zona más» y esto es la ausencia de una.
  return `repeating-linear-gradient(45deg, ${tokens.hatchLine} 0 2px, ${tokens.hatchBg} 2px 5px)`;
}

function fondoDe(key: ZonePartKey, tokens: ZoneChartTokens): string {
  return key === 'no_hr' ? rayado(tokens) : tokens.zone[key];
}

export function ZonasComparativa({
  comparativa,
  tokens = ZONE_TOKENS_V2,
  metrics = COMPARE_METRICS_FULL,
}: {
  comparativa: ZoneComparisonDTO;
  tokens?: ZoneChartTokens;
  metrics?: CompareMetrics;
}) {
  const { a, b, weeks } = comparativa;
  const sinDato = ladosSinDato(comparativa);
  const comparable = sePuedeComparar(comparativa);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: metrics.gap }}>
      <Lado periodo={a} weeks={weeks} tokens={tokens} metrics={metrics} />
      <Lado periodo={b} weeks={weeks} tokens={tokens} metrics={metrics} />

      {comparable ? (
        <Deltas comparativa={comparativa} tokens={tokens} metrics={metrics} />
      ) : (
        <Nota tokens={tokens} metrics={metrics}>
          {sinDato.length === 2
            ? 'De ninguno de los dos periodos hay entrenos medidos, así que no hay nada que comparar todavía.'
            : `Del ${sinDato[0] === 'a' ? 'primer' : 'segundo'} periodo no hay ni un entreno medido. Comparar contra eso diría que lo ha cambiado todo, cuando lo que pasa es que no lo sabemos.`}
        </Nota>
      )}

      <Ancla comparativa={comparativa} tokens={tokens} metrics={metrics} />
    </div>
  );
}

/** Un periodo: cómo se llama, cuánto suma y cómo se reparte. */
function Lado({
  periodo,
  weeks,
  tokens,
  metrics,
}: {
  periodo: ZoneComparePeriodDTO;
  weeks: number;
  tokens: ZoneChartTokens;
  metrics: CompareMetrics;
}) {
  const partes = partesDe(periodo);
  const hayDato = periodo.total_s > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 8px' }}>
        <span style={{ ...texto(metrics.titulo, 600, tokens.fg), letterSpacing: '0.01em' }}>
          {periodo.label}
        </span>
        {hayDato ? (
          <span
            style={{
              fontFamily: tokens.fontMono,
              fontVariantNumeric: 'tabular-nums',
              fontSize: metrics.cifra,
              fontWeight: 700,
              color: tokens.fg,
            }}
          >
            {formatDuration(porSemanaMedida(periodo))}
          </span>
        ) : null}
        {hayDato ? (
          <span style={texto(metrics.pie, 400, tokens.muted)}>
            {fraseDeCadencia(periodo, weeks)} · {formatDuration(periodo.total_s)} en total
          </span>
        ) : null}
      </div>

      <div
        role="img"
        aria-label={rotuloDelReparto(periodo)}
        style={{
          display: 'flex',
          height: metrics.barH,
          borderRadius: metrics.barH * BAR_PILL_RADIO_FRACCION,
          overflow: 'hidden',
          // Sin dato, el carril va PUNTEADO y vacío. Relleno liso a todo lo
          // ancho se lee de reojo como una barra llena de algo, que es
          // exactamente lo contrario de lo que pasa.
          background: hayDato ? tokens.grid : 'transparent',
          border: hayDato ? 'none' : `1px dashed ${tokens.grid}`,
        }}
      >
        {hayDato
          ? partes
              .filter((p) => p.share > 0)
              .map((p) => (
                <span
                  key={p.key}
                  aria-hidden
                  style={{ width: `${p.share * 100}%`, background: fondoDe(p.key, tokens) }}
                />
              ))
          : null}
      </div>

      <span style={texto(metrics.pie, 400, tokens.faint)}>
        {fraseDeCobertura(periodo, weeks)}
      </span>
    </div>
  );
}

/** El desglose en una frase: quien no ve la barra oye lo mismo que quien la ve. */
function rotuloDelReparto(p: ZoneComparePeriodDTO): string {
  if (p.total_s <= 0) return `${p.label}: sin tiempo medido`;
  const partes = partesDe(p)
    .filter((x) => x.share > 0)
    .map((x) => `${ZONE_PART_LABEL[x.key]} ${Math.round(x.share * 100)}%`)
    .join(', ');
  return `${p.label}: ${partes}`;
}

/**
 * Lo que ha cambiado, zona a zona. En puntos porcentuales (que es lo que compara
 * repartos) y en tiempo (que es lo que se reconoce), sin una sola opinión encima.
 */
function Deltas({
  comparativa,
  tokens,
  metrics,
}: {
  comparativa: ZoneComparisonDTO;
  tokens: ZoneChartTokens;
  metrics: CompareMetrics;
}) {
  const deltas = deltasDe(comparativa);
  const volumen = porSemanaMedida(comparativa.b) - porSemanaMedida(comparativa.a);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 14px',
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {deltas.map((d) => (
          <li
            key={d.key}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}
          >
            <span
              aria-hidden
              style={{
                width: SWATCH_LADO,
                height: SWATCH_LADO,
                borderRadius: SWATCH_RADIO,
                flex: '0 0 auto',
                background: fondoDe(d.key, tokens),
              }}
            />
            <span style={texto(metrics.pie, 500, tokens.muted)}>
              {ZONE_PART_LABEL[d.key]}
            </span>
            <span style={{ ...numero(tokens, metrics), color: tokens.fg }}>
              {fraseDePuntos(d.pts)}
            </span>
            <span style={{ ...numero(tokens, metrics), color: tokens.faint }}>
              {fraseDeTiempo(d.seconds)}
            </span>
          </li>
        ))}
      </ul>

      <span style={texto(metrics.pie, 400, tokens.muted)}>
        Volumen{' '}
        <b style={{ ...numero(tokens, metrics), color: tokens.fg, fontWeight: 700 }}>
          {fraseDeTiempo(volumen)}
        </b>{' '}
        por semana medida.
      </span>
    </div>
  );
}

/**
 * Con qué umbral se repartió esto. Si los dos periodos no comparten ancla se dice
 * en voz alta: parte del cambio de reparto sería de la medición y no del entreno,
 * y callarlo convertiría una recalibración en un mérito.
 */
function Ancla({
  comparativa,
  tokens,
  metrics,
}: {
  comparativa: ZoneComparisonDTO;
  tokens: ZoneChartTokens;
  metrics: CompareMetrics;
}) {
  const anchor = comparativa.anchor;
  if (anchor == null) {
    return (
      <Nota tokens={tokens} metrics={metrics}>
        Sin umbral con el que repartir, todo el tiempo medido cae en «sin zona».
      </Nota>
    );
  }
  return (
    <Nota tokens={tokens} metrics={metrics}>
      Repartido con{' '}
      <b style={{ ...numero(tokens, metrics), color: tokens.fg, fontWeight: 700 }}>
        {anchor.lthr_bpm}
      </b>{' '}
      ppm ({anchor.source_label.toLocaleLowerCase('es-ES')}).
      {anchor.mixed
        ? ' Ojo: estas semanas no se repartieron todas con el mismo umbral, así que parte del cambio es de la medición y no del entreno.'
        : ''}
    </Nota>
  );
}

function Nota({
  children,
  tokens,
  metrics,
}: {
  children: React.ReactNode;
  tokens: ZoneChartTokens;
  metrics: CompareMetrics;
}) {
  return (
    <p style={{ ...texto(metrics.pie, 400, tokens.faint), lineHeight: 1.45, margin: 0 }}>
      {children}
    </p>
  );
}

/**
 * Tipografía sin FAMILIA a propósito: se hereda de la superficie. En el móvil la
 * pone `.twin-root` y en el dashboard el cuerpo del documento, así que el mismo
 * bloque sale con la letra de cada sitio sin que el componente tenga que conocer
 * ninguna de las dos.
 */
function texto(size: number, weight: number, color: string): CSSProperties {
  return { fontSize: size, fontWeight: weight, lineHeight: 1.3, color };
}

/** Los números, en la mono de la superficie. Tabular para que no bailen de una
 *  línea a la siguiente. */
function numero(tokens: ZoneChartTokens, metrics: CompareMetrics): CSSProperties {
  return {
    fontFamily: tokens.fontMono,
    fontVariantNumeric: 'tabular-nums',
    fontSize: metrics.pie,
    fontWeight: 600,
  };
}
