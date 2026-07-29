'use client';

// El diseño nuevo. La tesis: GOBERNAR es decidir QUÉ manda en cada tramo, y
// que todo lo demás se subordine — incluso desapareciendo. No es una lista de
// tres casos: es una función pura sobre qué se puede medir en ese instante.
//
//   trabajo → una estación que nadie mide (repeticiones, un sled): manda lo
//             que tienes delante.
//   reloj   → lo que corre es tiempo y no hay máquina que lea: manda el
//             cronómetro.
//   nadie   → un bloque estructural no tiene ningún número que valga 96 pt:
//             ES una Lista, y se pinta como Lista.
//
// `type Gobierna` documenta la regla; el árbol de escenarios de abajo es su
// aplicación, no una segunda fuente de verdad.

import { CTA, Card, Display, Hairline, IconChevron, Label, Mono, Pantalla, SecondaryCTA, SP } from '../../kit';
import { HYROX, MEDIDO_REMO, REMO_500, dosisConSeries, reloj, type ItemReal } from '../../datos-reales';
import {
  ContextStripForTime,
  CURSOR_HYROX,
  EstacionRow,
  MetricRow3,
  PhaseRail,
  TopStrip,
  rutaHyrox,
  type FilaRuta,
} from './piezas';

/** Quién manda en la pantalla, por tramo. No es una lista de casos: es la regla. */
type Gobierna = 'trabajo' | 'reloj' | 'nadie';

/** La regla aplicada a los tres escenarios que gobiernan algo (`puerta` no
 * gobierna: es Configurar encima de En vivo, otro arquetipo). */
export const GOBIERNA_POR_ESCENARIO: Record<'hyrox' | 'minimo' | 'calentamiento', Gobierna> = {
  hyrox: 'trabajo',
  minimo: 'reloj',
  calentamiento: 'nadie',
};

// ---------------------------------------------------------------------------
// hyrox — gobierna el TRABAJO: el sujeto escala hasta llenar
// ---------------------------------------------------------------------------

function SujetoTrabajo({ item }: { item: ItemReal }) {
  // `dosis` es `string | null` — si faltara, la cabecera cae al nombre y el
  // nombre no se repite debajo (misma regla que en `hoy.tsx`).
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Label size={10}>Ahora</Label>
        {/* Sin contador de repeticiones — la app no sabe cuántas llevas y no lo
            insinúa (DECISIONS 28-jul, «El TRAMO…»). Solo la dosis, y escala. */}
        <span
          style={{
            fontStyle: 'italic',
            fontWeight: 800,
            fontFamily: 'var(--twin-font-sans)',
            fontSize: 'clamp(56px, 14vh, 96px)',
            lineHeight: 1,
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--twin-fg)',
          }}
        >
          {item.dosis ?? item.nombre}
        </span>
        {item.dosis && <Display size={22}>{item.nombre}</Display>}
        {item.objetivo && <span className="tw-pill">{item.objetivo}</span>}
        <span style={{ font: '500 12px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          llevas {CURSOR_HYROX.enEstacion} aquí
        </span>
      </div>
    </div>
  );
}

/** Alto FIJO, tres filas: la ruta entera vive en su propia superficie (Lista)
 * y no compite por el alto que aquí gana el sujeto. */
function VentanaRuta({ filas, indiceActivo, onVerTodas }: { filas: FilaRuta[]; indiceActivo: number; onVerTodas: () => void }) {
  const visibles = [filas[indiceActivo - 1], filas[indiceActivo], filas[indiceActivo + 1]].filter(
    (f): f is FilaRuta => Boolean(f)
  );
  return (
    <Card padding={0}>
      {visibles.map((f, i) => (
        <div key={f.indice}>
          {i > 0 && <Hairline />}
          <EstacionRow fila={f} />
        </div>
      ))}
      <Hairline />
      <button
        type="button"
        onClick={onVerTodas}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '11px 12px',
          background: 'transparent',
          border: 0,
          color: 'var(--twin-fg)',
          cursor: 'pointer',
          font: '600 13px var(--twin-font-sans)',
        }}
      >
        Ver las 16 estaciones
        <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}><IconChevron size={12} /></span>
      </button>
    </Card>
  );
}

/**
 * Compuesto entero de `hyrox` — se reutiliza literal como fondo atenuado de
 * `puerta`. Nótese qué NO lleva: `phaseRail`. El bloque (Simulación HYROX) ya
 * vive en el label de `topStrip`; las tres pastillas eran la misma
 * información dos veces, y aquí el alto que liberan se lo queda el sujeto.
 */
function HyroxPropuesta({ onLog }: { onLog: (linea: string) => void }) {
  const filas = rutaHyrox();
  const activa = filas[CURSOR_HYROX.indiceActivo];
  return (
    <Pantalla accion={<CTA title="ESTACIÓN HECHA" height={88} onClick={() => onLog('Estación marcada — avanza a la siguiente')} />}>
      <TopStrip
        faseLabel="Simulación HYROX"
        segmentoTitulo={activa.item.nombre}
        indice={CURSOR_HYROX.indiceActivo + 1}
        total={filas.length}
      />
      <ContextStripForTime indiceActivo={CURSOR_HYROX.indiceActivo + 1} total={filas.length} reloj={CURSOR_HYROX.relojBloque} />
      <SujetoTrabajo item={activa.item} />
      <VentanaRuta
        filas={filas}
        indiceActivo={CURSOR_HYROX.indiceActivo}
        onVerTodas={() => onLog('Ver las 16 → abriría la ruta entera como Lista, en su propia hoja')}
      />
      <MetricRow3
        celdas={[
          { label: 'Parcial', valor: CURSOR_HYROX.parciales[2] },
          { label: 'Estación', valor: `${CURSOR_HYROX.indiceActivo + 1}/${filas.length}` },
          { label: 'FC', valor: `${CURSOR_HYROX.fcPpm}`, unidad: 'ppm' },
        ]}
      />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// mínimo — gobierna el RELOJ: voz de instrumento, sin celdas vacías
// ---------------------------------------------------------------------------

function SujetoReloj({ tiempo, detalle }: { tiempo: string; detalle: string }) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Label size={10}>Tiempo</Label>
        <span
          style={{
            fontFamily: 'var(--twin-font-mono)',
            fontWeight: 800,
            fontSize: 'clamp(64px, 18vh, 112px)',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--twin-fg)',
          }}
        >
          {tiempo}
        </span>
        <Mono size={13} color="var(--twin-muted)">{detalle}</Mono>
      </div>
    </div>
  );
}

function CardVerdad({ texto, ctaTitulo, onClick }: { texto: string; ctaTitulo: string; onClick: () => void }) {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ font: '500 13px var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{texto}</span>
        <SecondaryCTA title={ctaTitulo} onClick={onClick} height={44} />
      </div>
    </Card>
  );
}

function MinimoPropuesta({ onLog }: { onLog: (linea: string) => void }) {
  const item = REMO_500.bloques[0].items[0];
  return (
    <Pantalla accion={<CTA title="TERMINAR" height={88} onClick={() => onLog('Pieza terminada')} />}>
      <TopStrip faseLabel={null} segmentoTitulo={item.nombre} indice={1} total={1} puedeVolver={false} />
      <PhaseRail fases={[{ titulo: 'Entreno', estado: 'actual' }]} />
      <SujetoReloj
        tiempo={reloj(MEDIDO_REMO.duracionS)}
        detalle={[item.nombre, item.dosis, item.objetivo].filter(Boolean).join(' · ')}
      />
      {/* Sin MetricRow3: si solo hay una cosa medida, el sujeto ya la enseña —
          tres celdas con dos guiones al lado serían ruido, no información. */}
      <CardVerdad
        texto="Sin monitor · no se miden los metros"
        ctaTitulo="Conectar el remo"
        onClick={() => onLog('Buscar remo por Bluetooth')}
      />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// calentamiento — NO gobierna nadie: es una Lista, y se pinta como Lista
// ---------------------------------------------------------------------------

function FilaCalentamiento({ item }: { item: ItemReal }) {
  return (
    // `flex: 1` — las filas se REPARTEN el alto de la lista. Eso es lo que
    // significa `llena` con pocos elementos: el sobrante entra en las filas y
    // engorda el blanco de tirada, no se acumula en una cola debajo. De paso
    // el objetivo se cumple solo: un calentamiento se va tachando de pie, con
    // el móvil en el suelo, y una fila de 90 pt se acierta sin agacharse.
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '16px 14px' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid var(--twin-muted)', flexShrink: 0 }} />
      <span style={{ flex: 1, font: '600 16px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{item.nombre}</span>
      {/* La MISMA grafía que la puerta del bloque y el post-entreno: `2×10`,
          nunca `10 reps × 2`. La función vive en datos-reales.ts (§2). Sin
          dosis no se pinta nada: el nombre se queda solo. */}
      {dosisConSeries(item) && (
        <Mono size={13} color="var(--twin-muted)">{dosisConSeries(item)}</Mono>
      )}
    </div>
  );
}

function CalentamientoPropuesta({ onLog }: { onLog: (linea: string) => void }) {
  const items = HYROX.bloques[0].items;
  return (
    <Pantalla accion={<CTA title="CALENTAMIENTO HECHO" height={88} onClick={() => onLog('Bloque de calentamiento cerrado')} />}>
      <TopStrip faseLabel="Calentamiento" segmentoTitulo="Calentamiento" indice={1} total={items.length} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '2px 4px' }}>
        <Label size={11}>Calentamiento</Label>
        <Mono size={11} color="var(--twin-muted)">{items.length} movimientos</Mono>
      </div>
      {/* `llena` de verdad: la tarjeta OCUPA el hueco y sus filas se lo
          reparten. La primera versión de esta pantalla dejaba las cuatro filas
          arriba y ~350 pt de nada debajo — el mismo fallo que la propuesta
          venía a arreglar, colado en la propuesta. Con `.twin-scroll` el
          scroll sigue apareciendo solo si algún día la lista desborda, que es
          lo que pide el §6.1. */}
      <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
        <Card padding={0} topAccent fill>
          {items.map((item, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {i > 0 && <Hairline />}
              <FilaCalentamiento item={item} />
            </div>
          ))}
        </Card>
      </div>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// puerta — la separación: Configurar deja de vivir dentro de En vivo
// ---------------------------------------------------------------------------

function PuertaPropuesta({ onLog }: { onLog: (linea: string) => void }) {
  return (
    <Pantalla>
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.25, pointerEvents: 'none' }}>
          <HyroxPropuesta onLog={() => undefined} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--twin-scrim)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: SP.l }}>
          <Card elevated padding={SP.l}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', maxWidth: 300 }}>
              <Label size={10}>Otra pantalla</Label>
              <Display size={20}>La puerta del bloque</Display>
              <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                Es Configurar, no En vivo: su sujeto es el entreno que vas a hacer y su estrategia es previsualiza.
                Vive en su propia pantalla del doble.
              </span>
              <SecondaryCTA
                title="Ver «La puerta del bloque»"
                onClick={() => onLog('La puerta vive en la pantalla gate-bloque del doble')}
              />
            </div>
          </Card>
        </div>
      </div>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

export function PropuestaScreen({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
  switch (escenario) {
    case 'minimo':
      return <MinimoPropuesta onLog={onLog} />;
    case 'calentamiento':
      return <CalentamientoPropuesta onLog={onLog} />;
    case 'puerta':
      return <PuertaPropuesta onLog={onLog} />;
    default:
      return <HyroxPropuesta onLog={onLog} />;
  }
}
