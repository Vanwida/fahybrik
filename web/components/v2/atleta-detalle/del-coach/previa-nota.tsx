'use client';

// LA NOTA EN SU MÓVIL — las cuatro formas de una sección, como se van a ver.
//
// Vive aparte de las otras cuatro pantallas (`previa-pantallas.tsx`) porque es
// la única que tiene FORMAS, y porque el dibujo tiene que ser EL MISMO que el
// del doble: una cifra grande en mono con su pie, una barra de proporción y la
// espina del plan. No es un parecido — la geometría de la espina es literalmente
// el componente compartido (`components/plan-espina`), y la cifra y el reparto
// se montan con los mismos átomos y los mismos números que
// `design-twin/screens/coach-nota/bloques.tsx`.
//
// Si esto se dibujara «parecido», el coach aprobaría una nota que en el móvil
// del atleta se lee distinta, que es exactamente el fallo que la previa existe
// para no tener.

import { Card, Display, Hairline, Label, Mono } from '@/components/design-twin/kit';
import { Pantalla } from '@/components/design-twin/kit-composicion/chrome';
import { S } from '@/components/design-twin/kit-composicion/tokens';
import { Espina, TOKENS_TWIN, TONOS_TWIN, colorDelTono, tramosDesdePlan } from '@/components/plan-espina';
import { ZonasChart } from '../rendimiento/ZonasChart';
import {
  COMPARE_METRICS_EMBED,
  ZonasComparativa,
} from '../rendimiento/ZonasComparativa';
import {
  buildWindowCells,
  rangeBands,
  ZONE_METRICS_EMBED,
  ZONE_TOKENS_TWIN,
} from '@/lib/zones/chart';
import type { PlanPathDTO } from '@fahybrid/shared/domain/plan-path';
import type { ZoneChartDTO } from '@fahybrid/shared/domain/zone-chart';
import type { ZoneComparisonDTO } from '@fahybrid/shared/domain/zone-compare';
import type { Borrador, FilaBorrador } from '@/lib/dashboard/v2/del-coach-borrador';

const TENUE = 'var(--twin-faint)';

/** El separador de una banda («1:15 a 1:18»): el «a» va en SANS aunque los dos
 *  extremos vayan en mono, porque dentro del monoespaciado una palabra ocupa una
 *  columna de instrumento y parte la banda en tres datos. */
const SEPARADOR_BANDA = /^(.{1,12}?)\s+a\s+(.{1,12})$/;

/** ¿Es una banda de dos extremos o una cifra sola? Se exige que los dos lados
 *  sean cortos y lleven un número: sin eso, «de 3 a 5 series por bloque» se
 *  partiría en dos cifras que no lo son. */
function banda(cifra: string): [string, string] | null {
  const m = SEPARADOR_BANDA.exec(cifra.trim());
  if (!m) return null;
  const [, desde, hasta] = m;
  if (!desde || !hasta || !/\d/.test(desde) || !/\d/.test(hasta)) return null;
  return [desde, hasta];
}

export function PreviaNota({
  b,
  cabecera,
  foco,
  camino,
  zonas,
  comparativas,
}: {
  b: Borrador;
  cabecera: React.ReactNode;
  /** La sección que el coach está tocando: se marca y la previa se coloca en ella. */
  foco: string | null;
  /** El plan REAL del destinatario. Null = no hay uno solo, o no tiene plan. */
  camino: PlanPathDTO | null;
  /** Sus barras de tiempo en zonas ya resueltas, por clave de sección. */
  zonas: Map<string, ZoneChartDTO>;
  /** Sus dos periodos ya sumados, por clave de sección. */
  comparativas: Map<string, ZoneComparisonDTO>;
}) {
  const secciones = b.sections.filter(escrita);
  const t = b.title.trim();

  return (
    <Pantalla estrategia="llena" cabecera={cabecera}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: S.l,
          padding: `${S.l}px ${S.l}px ${S.xl}px`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
          <Display size={26} color={t ? 'var(--twin-fg)' : TENUE}>
            {t || 'Sin título todavía'}
          </Display>
          {b.body.trim() ? (
            <span style={{ font: '400 13.5px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {b.body.trim()}
            </span>
          ) : null}
        </div>

        {secciones.length > 0 ? (
          secciones.map((s) => (
            <div key={s.key} data-fila={s.key} style={anillo(s.key === foco)}>
              <Card padding={S.l}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
                  <Seccion
                    seccion={s}
                    camino={camino}
                    zonas={zonas}
                    comparativas={comparativas}
                  />
                </div>
              </Card>
            </div>
          ))
        ) : (
          <Vacia texto="Escribe la primera sección y aparecerá aquí." />
        )}
      </div>
    </Pantalla>
  );
}

/** Una sección cuenta en cuanto tiene algo escrito. El camino cuenta siempre:
 *  no se teclea, así que esperar a que tenga texto sería no enseñarlo nunca. */
function escrita(s: FilaBorrador): boolean {
  if (s.display === 'camino' || s.display === 'grafica' || s.display === 'comparativa' || s.display === 'test_result')
    return true;
  if (s.display === 'reparto') {
    return Boolean(s.label.trim()) || s.segments.some((seg) => seg.value.trim() || seg.label.trim());
  }
  return Boolean(s.content.trim() || s.label.trim());
}

function Seccion({
  seccion,
  camino,
  zonas,
  comparativas,
}: {
  seccion: FilaBorrador;
  camino: PlanPathDTO | null;
  zonas: Map<string, ZoneChartDTO>;
  comparativas: Map<string, ZoneComparisonDTO>;
}) {
  if (seccion.display === 'cifra') return <Cifra seccion={seccion} />;

  return (
    <>
      <Label size={10} color={seccion.label.trim() ? 'var(--twin-muted)' : TENUE}>
        {seccion.label.trim() || 'Sin cabecera'}
      </Label>
      <Hairline />
      {seccion.display === 'reparto' ? (
        <Reparto seccion={seccion} />
      ) : seccion.display === 'camino' ? (
        <Camino camino={camino} />
      ) : seccion.display === 'grafica' ? (
        <Grafica seccion={seccion} chart={zonas.get(seccion.key) ?? null} />
      ) : seccion.display === 'comparativa' ? (
        <Comparativa comparativa={comparativas.get(seccion.key) ?? null} />
      ) : seccion.display === 'test_result' ? (
        <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          El informe de esa ocurrencia se dibuja solo. Debajo escribes lo que ves.
        </span>
      ) : (
        <span style={{ font: '400 14px/1.5 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
          {seccion.content.trim()}
        </span>
      )}
    </>
  );
}

/**
 * La cifra es el sujeto de su tarjeta, así que no lleva cabecera: se lee a tres
 * metros y en mono, porque es un número que se va a comparar con otro. Debajo,
 * el pie con el matiz.
 */
function Cifra({ seccion }: { seccion: FilaBorrador }) {
  const cifra = seccion.content.trim();
  const partes = banda(cifra);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {cifra ? (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: S.s, flexWrap: 'wrap' }}>
          {partes ? (
            <>
              <Mono size={38} weight={800} color="var(--twin-fg)">
                {partes[0]}
              </Mono>
              <span style={{ font: '500 17px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                a
              </span>
              <Mono size={38} weight={800} color="var(--twin-fg)">
                {partes[1]}
              </Mono>
            </>
          ) : (
            <Mono size={38} weight={800} color="var(--twin-fg)">
              {cifra}
            </Mono>
          )}
        </span>
      ) : (
        <Mono size={38} weight={800} color={TENUE}>
          —
        </Mono>
      )}
      {seccion.label.trim() ? (
        <span style={{ font: '400 12.5px/1.4 var(--twin-font-sans)', color: TENUE }}>
          {seccion.label.trim()}
        </span>
      ) : null}
    </div>
  );
}

/**
 * La barra de proporción. Cada trozo pesa lo que dice su número, y el color sale
 * de su POSICIÓN: un catálogo de intensidades («dura», «moderada») sería el
 * vocabulario de un entrenador metido en el producto.
 */
function Reparto({ seccion }: { seccion: FilaBorrador }) {
  const trozos = seccion.segments
    .map((s, i) => ({ key: s.key, valor: Number(s.value), label: s.label.trim(), i }))
    .filter((s) => Number.isFinite(s.valor) && s.valor > 0);

  if (trozos.length === 0) {
    return <Vacia texto="Escribe cuánto pesa cada trozo y aparecerá la barra." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
      <div style={{ display: 'flex', gap: 3, height: 8, borderRadius: 4, overflow: 'hidden' }}>
        {trozos.map((t) => (
          <span
            key={t.key}
            aria-hidden
            style={{
              flex: t.valor,
              minWidth: 4,
              borderRadius: 4,
              background: colorDelTono(TONOS_TWIN, t.i),
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: S.l, flexWrap: 'wrap' }}>
        {trozos.map((t) => (
          <span key={t.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: colorDelTono(TONOS_TWIN, t.i),
                flex: '0 0 auto',
              }}
            />
            <Mono size={13} weight={700}>
              {t.valor}
            </Mono>
            <span style={{ font: '500 12.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {t.label || '…'}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * El camino. Con un solo destinatario se pinta SU plan de verdad; con varios no
 * hay un plan que enseñar, y decirlo es mejor que dibujar el de nadie.
 */
function Camino({ camino }: { camino: PlanPathDTO | null }) {
  if (!camino || camino.segments.length === 0) {
    return (
      <Vacia texto="Aquí se dibujan sus semanas: los ciclos en orden, dónde está hoy y lo que rompe la rutina. Cada atleta ve el suyo." />
    );
  }
  return <Espina tokens={TOKENS_TWIN} tramos={tramosDesdePlan(camino, TONOS_TWIN)} />;
}

/**
 * LA GRÁFICA, con los datos REALES del atleta y las marcas del coach encima.
 *
 * Es el MISMO componente que dibuja la ficha (`ZonasChart`), con la paleta del
 * móvil y la medida embebida: sin eje Y, sin rótulos y con las barras finas,
 * porque dentro de una tarjeta lo que se lee es la FORMA de la serie y no cada
 * semana suelta. Una copia del dibujo para el móvil sería la bifurcación de
 * siempre, y entonces esta previa dejaría de servir para lo único que sirve.
 *
 * Sin ni una semana con dato se dice con palabras. Pintar seis meses de suelo
 * sería enseñarle al atleta que no entrenó cuando lo que pasa es que no medimos.
 */
function Grafica({ seccion, chart }: { seccion: FilaBorrador; chart: ZoneChartDTO | null }) {
  const marcas = seccion.grafica.ranges.filter((r) => r.label.trim().length > 0);

  if (chart == null || chart.weeks_data.length === 0) {
    return (
      <Vacia texto="Aquí va su tiempo en zonas del periodo que elijas. De estas semanas todavía no hay ni un entreno con pulso medido, así que no hay nada que repartir." />
    );
  }

  const cells = buildWindowCells({
    weeks_data: chart.weeks_data,
    week_start: seccion.grafica.week_start,
    weeks: seccion.grafica.weeks,
  });

  return (
    <ZonasChart
      cells={cells}
      bands={[]}
      ranges={rangeBands(cells, marcas)}
      ariaLabel={`Su tiempo en zonas, ${seccion.grafica.weeks} semanas`}
      tokens={ZONE_TOKENS_TWIN}
      metrics={ZONE_METRICS_EMBED}
    />
  );
}

/**
 * LOS DOS PERIODOS, con los datos REALES del atleta.
 *
 * El MISMO componente que dibuja la ficha (`ZonasComparativa`), con la paleta del
 * móvil y la medida embebida. Una copia del bloque para el móvil sería la
 * bifurcación de siempre, y entonces esta previa dejaría de servir para lo único
 * que sirve.
 *
 * Sin respuesta todavía se dice con palabras. Nunca dos barras de ejemplo: sería
 * enseñarle al coach una comparación que no es de nadie.
 */
function Comparativa({ comparativa }: { comparativa: ZoneComparisonDTO | null }) {
  if (comparativa == null) {
    return (
      <Vacia texto="Aquí van sus dos periodos enfrentados: las horas de cada uno, el reparto por zona y lo que ha cambiado. Cada atleta ve los suyos." />
    );
  }
  return (
    <ZonasComparativa
      comparativa={comparativa}
      tokens={ZONE_TOKENS_TWIN}
      metrics={COMPARE_METRICS_EMBED}
    />
  );
}

/** El anillo de la sección que se está editando: la previa no sólo se coloca en
 *  ella, la señala — con la nota entera delante, colocarse no basta para saber
 *  cuál de las seis tarjetas es la tuya. */
function anillo(activa: boolean): React.CSSProperties {
  return activa
    ? {
        borderRadius: 16,
        outline: '1.5px solid var(--twin-accent)',
        outlineOffset: 3,
        transition: 'outline-color 140ms ease',
      }
    : {};
}

function Vacia({ texto }: { texto: string }) {
  return (
    <div
      style={{
        border: '1px dashed var(--twin-hairline-strong)',
        borderRadius: 14,
        padding: S.l,
        font: '400 13px/1.45 var(--twin-font-sans)',
        color: TENUE,
        textAlign: 'center',
      }}
    >
      {texto}
    </div>
  );
}
