'use client';

// La reproducción FIEL del body de HOY — ActiveWorkoutView.body (línea 158) +
// WorkoutFormatHUDs.ForTimeLiveHUD (359), simplificado al camino de una
// estación-ruta en retrato (soportaHorizontal: false, así que aquí no vive la
// rama landscape que SÍ mete un ScrollView). El cromo (topStrip, phaseRail)
// es idéntico en las 4 escenas: lo que falla vive DEBAJO, y por eso los
// instrumentos del kit (`Muerto`, `Recortado`) miden justo ahí.
//
// Corrección deliberada frente al Swift: `hrCell` en WorkoutFormatHUDs.swift
// todavía etiqueta "HR"/"bpm" — la violación exacta que el CONTRATO-UI §3
// prohíbe. El doble no reproduce el bug de vocabulario, solo el de altura.

import { CTA, Card, Display, Hairline, Label, Mono, Muerto, Pantalla, Recortado, SecondaryCTA, SP } from '../../kit';
import { HYROX, MEDIDO_REMO, REMO_500, reloj, type ItemReal } from '../../datos-reales';
import {
  ContextStripForTime,
  CURSOR_HYROX,
  EstacionRow,
  MetricRow3,
  PhaseRail,
  TopStrip,
  rutaHyrox,
  type FasePill,
} from './piezas';

const FASES_HYROX: FasePill[] = [
  { titulo: 'Calentamiento', estado: 'hecha' },
  { titulo: 'Simulación HYROX', estado: 'actual' },
  { titulo: 'Vuelta a la calma', estado: 'futura' },
];

// ---------------------------------------------------------------------------
// hyrox — la ruta de 16 estaciones, recortada por el clipShape de siempre
// ---------------------------------------------------------------------------

function ListaCompleta({ filas }: { filas: ReturnType<typeof rutaHyrox> }) {
  return (
    <Card padding={0} topAccent>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px' }}>
        <Label size={10}>El entreno</Label>
        <Label size={9}>{CURSOR_HYROX.indiceActivo + 1} DE {filas.length}</Label>
      </div>
      {filas.map((f) => (
        <div key={f.indice}>
          <Hairline />
          <EstacionRow fila={f} />
        </div>
      ))}
    </Card>
  );
}

function SujetoEstacion({ item }: { item: ItemReal }) {
  // `dosis` es `string | null` (el circuito del coach SÍ trae huecos): si
  // faltara, la cabecera cae al nombre y la línea de abajo no lo repite.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0' }}>
      <Label size={10}>Ahora</Label>
      <Display size={64}>{item.dosis ?? item.nombre}</Display>
      {item.dosis && <Display size={19}>{item.nombre}</Display>}
      <span style={{ font: '500 12px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        llevas {CURSOR_HYROX.enEstacion} en esta estación
      </span>
    </div>
  );
}

/**
 * El `liveSurface` real de una estación: contexto → sujeto → ruta recortada.
 * SIN scroll — en retrato la app no lo tiene — así que `Recortado` mide justo
 * lo que hoy se pierde. Se reutiliza tal cual como fondo atenuado en `puerta`:
 * es LA MISMA superficie, no una reconstrucción aparte.
 */
function SuperficieHyrox() {
  const filas = rutaHyrox();
  return (
    <>
      <ContextStripForTime indiceActivo={CURSOR_HYROX.indiceActivo + 1} total={filas.length} reloj={CURSOR_HYROX.relojBloque} />
      <SujetoEstacion item={filas[CURSOR_HYROX.indiceActivo].item} />
      <Recortado>
        <ListaCompleta filas={filas} />
      </Recortado>
    </>
  );
}

function metricasHyrox() {
  return [
    { label: 'Parcial', valor: CURSOR_HYROX.parciales[2] },
    { label: 'Estación', valor: `${CURSOR_HYROX.indiceActivo + 1}/16` },
    { label: 'FC', valor: `${CURSOR_HYROX.fcPpm}`, unidad: 'ppm' },
  ];
}

function HyroxHoy({ onLog }: { onLog: (s: string) => void }) {
  return (
    <Pantalla accion={<CTA title="ESTACIÓN HECHA" height={88} onClick={() => onLog('Estación marcada — avanza a la siguiente')} />}>
      <TopStrip faseLabel="Simulación HYROX" segmentoTitulo="Sled Push" indice={CURSOR_HYROX.indiceActivo + 1} total={16} />
      <PhaseRail fases={FASES_HYROX} />
      <SuperficieHyrox />
      <MetricRow3 celdas={metricasHyrox()} />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// mínimo — nada gobierna: un Spacer() declara el hueco y lo deja muerto
// ---------------------------------------------------------------------------

function TiraConexion({ conectado, texto }: { conectado: boolean; texto: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 6,
        background: 'var(--twin-surface)',
        alignSelf: 'flex-start',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: conectado ? 'var(--twin-ok)' : 'var(--twin-danger)' }} />
      <Label size={10}>{texto}</Label>
    </div>
  );
}

function RelojModalidad({ tiempo, objetivo }: { tiempo: string; objetivo: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 0' }}>
      <Label size={10}>Tiempo</Label>
      <Display size={56}>{tiempo}</Display>
      <Mono size={13} color="var(--twin-muted)">{objetivo}</Mono>
    </div>
  );
}

function MinimoHoy({ onLog }: { onLog: (s: string) => void }) {
  const item = REMO_500.bloques[0].items[0];
  return (
    <Pantalla accion={<CTA title="TERMINAR" height={88} onClick={() => onLog('Pieza terminada')} />}>
      <TopStrip faseLabel={null} segmentoTitulo={item.nombre} indice={1} total={1} puedeVolver={false} />
      <PhaseRail fases={[{ titulo: 'Entreno', estado: 'actual' }]} />
      <TiraConexion conectado={false} texto="Sin monitor" />
      <RelojModalidad tiempo={reloj(MEDIDO_REMO.duracionS)} objetivo={item.dosis ?? item.nombre} />
      <Muerto nota="Un Spacer() declara que sobra alto y que nadie decidió qué hacer con él." />
      <SecondaryCTA title="Conectar el remo" onClick={() => onLog('Buscar remo por Bluetooth')} />
      <MetricRow3
        celdas={[
          { label: 'Tiempo', valor: reloj(MEDIDO_REMO.duracionS) },
          { label: 'Metros', valor: '—' },
          { label: 'FC', valor: '—' },
        ]}
      />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// calentamiento — un ScrollView con contenido que no llega al alto
// ---------------------------------------------------------------------------

function FilaMovimiento({ item }: { item: ItemReal }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 12px' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid var(--twin-muted)', flexShrink: 0 }} />
      <span style={{ flex: 1, font: '600 14px var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{item.nombre}</span>
      {/* Sin dosis, no hay nada que decir a la derecha — repetir el nombre ahí sería ruido, no dato. */}
      {item.dosis && (
        <Mono size={12} color="var(--twin-muted)">{item.dosis}{item.series ? ` × ${item.series}` : ''}</Mono>
      )}
    </div>
  );
}

function ChecklistEstructural({ fase, items }: { fase: string; items: ItemReal[] }) {
  return (
    <Card padding={0} topAccent>
      <div style={{ padding: '10px 12px' }}><Label size={10}>{fase}</Label></div>
      {items.map((item, i) => (
        <div key={i}><Hairline /><FilaMovimiento item={item} /></div>
      ))}
      <Hairline />
      <div style={{ padding: '10px 12px' }}>
        <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          Marca el bloque entero cuando termines.
        </span>
      </div>
    </Card>
  );
}

function CalentamientoHoy({ onLog }: { onLog: (s: string) => void }) {
  const items = HYROX.bloques[0].items;
  return (
    <Pantalla accion={<CTA title="CALENTAMIENTO HECHO" height={88} onClick={() => onLog('Bloque de calentamiento cerrado')} />}>
      <TopStrip faseLabel="Calentamiento" segmentoTitulo="Calentamiento" indice={1} total={items.length} />
      <PhaseRail
        fases={[
          { titulo: 'Calentamiento', estado: 'actual' },
          { titulo: 'Simulación HYROX', estado: 'futura' },
          { titulo: 'Vuelta a la calma', estado: 'futura' },
        ]}
      />
      <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ChecklistEstructural fase="Calentamiento" items={items} />
        <Muerto nota="Un ScrollView con contenido que no llega al alto da inercia sobre nada." />
      </div>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// puerta — dos arquetipos apilados en el mismo body
// ---------------------------------------------------------------------------

function PuertaReducida({ onLog }: { onLog: (s: string) => void }) {
  const items = HYROX.bloques[1].items.slice(0, 3);
  return (
    <Card elevated padding={SP.l}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <Display size={20}>{HYROX.titulo}</Display>
        <Label size={10}>Lo que viene</Label>
        <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ font: '500 13px var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{it.nombre}</span>
              {it.dosis && <Mono size={12} color="var(--twin-muted)">{it.dosis}</Mono>}
            </div>
          ))}
        </div>
        <CTA title="EMPEZAR" height={64} onClick={() => onLog('Puerta del bloque: empieza la simulación')} />
      </div>
    </Card>
  );
}

function PuertaHoy({ onLog }: { onLog: (s: string) => void }) {
  return (
    <Pantalla>
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.25,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: SP.m,
          }}
        >
          <TopStrip faseLabel="Simulación HYROX" segmentoTitulo="Sled Push" indice={CURSOR_HYROX.indiceActivo + 1} total={16} />
          <PhaseRail fases={FASES_HYROX} />
          <SuperficieHyrox />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--twin-scrim)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 10px', background: 'color-mix(in srgb, var(--twin-danger) 14%, transparent)' }}>
            <span style={{ font: '600 11px var(--twin-font-sans)', color: 'var(--twin-danger)' }}>
              Dos arquetipos en el mismo body: En vivo debajo, Configurar encima.
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: SP.l }}>
            <PuertaReducida onLog={onLog} />
          </div>
        </div>
      </div>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------

export function HoyScreen({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
  switch (escenario) {
    case 'minimo':
      return <MinimoHoy onLog={onLog} />;
    case 'calentamiento':
      return <CalentamientoHoy onLog={onLog} />;
    case 'puerta':
      return <PuertaHoy onLog={onLog} />;
    default:
      return <HyroxHoy onLog={onLog} />;
  }
}
