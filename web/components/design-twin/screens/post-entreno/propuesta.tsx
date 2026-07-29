'use client';

// Vista «propuesta» — el sujeto es el REGISTRO que se va a guardar, no los
// campos que lo llenan (arquetipo «configurar», CONTRATO-UI §6.2). Compárese
// con hoy.tsx: allí la app apila ocho tarjetas de igual peso y dedica media
// pantalla a un ScrollView que no llega a su alto (Muerto). Aquí una única
// tarjeta elevada CRECE con lo que hay que decidir — duración, sesión, trabajo,
// lo medido — y lo que sigue abierto (esfuerzo, cómo ha ido, notas) se pliega
// a tres filas de 44 pt. GUARDAR sigue funcionando sin tocar nada de eso (§6.2,
// "Configurar": la acción se puede empezar sin tocar nada).
//
// Decisión de composición no pedida explícitamente pero que sale directo del
// propio modelo de datos: `BloqueReal.estructural` documenta en
// datos-reales.ts que "Calentamiento y vuelta a la calma se cierran de UNA,
// no ítem a ítem" — en «el trabajo» un bloque estructural se resume en una
// línea (los nombres, sin dosis) y solo el bloque principal se lista ítem a
// ítem con su dosis y objetivo. La vista «hoy» NO hace esto (reproduce el
// Swift real, que sí itemiza el calentamiento fila a fila) — el contraste
// entre las dos vistas es justamente la evidencia del porqué.
//
// La tarjeta del registro usa `fill` del `Card` (kit.tsx): su wrapper de
// padding pasa a ser flex column con minHeight:0, así el contenido con
// className="twin-scroll" recibe una altura acotada real y solo scrollea si
// desborda — sin ese `fill` no había forma de lograrlo sin tocar kit.tsx.

import { useState } from 'react';
import { CTA, Card, Hairline, Mono, Pantalla, SecondaryCTA } from '../../kit';
import { dosisConSeries, reloj, totalItems, UMBRAL, type BloqueReal, type MedidoReal, type SesionReal } from '../../datos-reales';
import {
  BarraZonas,
  ContenidoComoHaIdo,
  DIFICULTAD_LABEL,
  estadoComoHaIdoInicial,
  FilaPlegada,
  PastillasRPE,
  TileMedida,
  umbralLabel,
  type SegmentoZona,
} from './piezas';

const FUENTE_LABEL: Record<MedidoReal['fuente'], string> = {
  live: 'Medido en vivo',
  imported: 'Importado de Concept2',
  manual: 'Anotado a mano',
};

type Abierta = 'esfuerzo' | 'como-ha-ido' | 'notas' | null;

export function Propuesta({ sesion, medido, onLog }: { sesion: SesionReal; medido: MedidoReal; onLog: (linea: string) => void }) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [comoHaIdo, setComoHaIdo] = useState(estadoComoHaIdoInicial());
  const [notas, setNotas] = useState('');
  const [abierta, setAbierta] = useState<Abierta>(null);

  const hasFC = medido.fcMediaPpm != null;
  const hasZonas = Object.keys(medido.zonasS).length > 0;
  const esPrescrita = sesion.origen === 'coach';
  const compacto = totalItems(sesion) > 3;

  const toggle = (id: Abierta) => setAbierta((a) => (a === id ? null : id));

  return (
    <Pantalla
      accion={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <CTA title="GUARDAR" height={64} onClick={() => onLog('GUARDAR — funciona sin tocar nada')} />
          <p style={{ margin: 0, textAlign: 'center', font: '500 11px var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            Se guarda tal cual. El esfuerzo lo puedes decir ahora o nunca.
          </p>
        </div>
      }
    >
      <Card elevated fill>
        {/* `safe center`: con poco registro el bloque se centra y el aire queda
            simétrico — es `previsualiza` degradando a `centra` cuando ya no hay
            más verdad que enseñar, el mismo movimiento que hace la puerta del
            bloque con un solo ítem. El `safe` importa: cuando SÍ desborda (el
            plan del coach, 11 ítems en 3 bloques) vuelve a alinear arriba en vez
            de dejar la cabecera fuera de alcance del scroll. */}
        <div
          className="twin-scroll"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'safe center',
            gap: compacto ? 14 : 20,
          }}
        >
          <RegistroContenido sesion={sesion} medido={medido} hasFC={hasFC} hasZonas={hasZonas} compacto={compacto} onLog={onLog} />
        </div>
      </Card>

      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
        <Hairline />
        <FilaPlegada
          etiqueta="Esfuerzo"
          valor={rpe != null ? String(rpe) : 'Sin decir'}
          abierta={abierta === 'esfuerzo'}
          onToggle={() => toggle('esfuerzo')}
        >
          <PastillasRPE
            valor={rpe}
            onChange={(n) => {
              setRpe(n);
              if (n != null) onLog(`Esfuerzo ${n} — el RPE nunca viene puesto de antes`);
            }}
          />
        </FilaPlegada>
        <Hairline />
        {/* Solo con plan de coach: en entreno libre no hay prescripción contra
           la que decir "fácil" o "duro" — la fila no existe, no se deshabilita. */}
        {esPrescrita && (
          <>
            <FilaPlegada
              etiqueta="Cómo ha ido"
              valor={comoHaIdo.dificultad ? DIFICULTAD_LABEL[comoHaIdo.dificultad] : 'Sin decir'}
              abierta={abierta === 'como-ha-ido'}
              onToggle={() => toggle('como-ha-ido')}
            >
              <ContenidoComoHaIdo estado={comoHaIdo} onCambia={setComoHaIdo} />
            </FilaPlegada>
            <Hairline />
          </>
        )}
        <FilaPlegada
          etiqueta="Notas"
          valor={notas.trim() ? notas : 'Sin decir'}
          abierta={abierta === 'notas'}
          onToggle={() => toggle('notas')}
        >
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
            rows={2}
            aria-label="Notas del entreno"
            style={{
              width: '100%',
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              font: '500 13px/1.4 var(--twin-font-sans)',
              color: 'var(--twin-fg)',
              padding: 0,
            }}
          />
        </FilaPlegada>
      </div>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// El contenido de la tarjeta del registro
// ---------------------------------------------------------------------------

function RegistroContenido({
  sesion,
  medido,
  hasFC,
  hasZonas,
  compacto,
  onLog,
}: {
  sesion: SesionReal;
  medido: MedidoReal;
  hasFC: boolean;
  hasZonas: boolean;
  compacto: boolean;
  onLog: (linea: string) => void;
}) {
  return (
    <>
      <span style={{ font: '600 11px/1.1 var(--twin-font-sans)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--twin-accent-text)' }}>
        Se va a guardar
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ font: '600 11px/1.1 var(--twin-font-sans)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>
          Tiempo
        </span>
        <span style={{ font: '800 clamp(56px, 13vh, 88px)/1 var(--twin-font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--twin-fg)' }}>
          {reloj(medido.duracionS)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ font: 'italic 800 20px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{sesion.titulo}</span>
        <Mono size={11} color="var(--twin-muted)">{FUENTE_LABEL[medido.fuente]}</Mono>
      </div>

      <ElTrabajo sesion={sesion} compacto={compacto} />

      <Hairline />

      <LoQueSeMidio medido={medido} hasFC={hasFC} hasZonas={hasZonas} onLog={onLog} />
    </>
  );
}

function ElTrabajo({ sesion, compacto }: { sesion: SesionReal; compacto: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compacto ? 10 : 16 }}>
      {sesion.bloques.map((bloque, bi) =>
        bloque.estructural ? (
          <BloqueEstructural key={`${bloque.titulo}-${bi}`} bloque={bloque} />
        ) : (
          <BloquePrincipal key={`${bloque.titulo}-${bi}`} bloque={bloque} compacto={compacto} />
        ),
      )}
    </div>
  );
}

/** Calentamiento / vuelta a la calma: una línea, no ítem a ítem (datos-reales.ts, `estructural`). */
function BloqueEstructural({ bloque }: { bloque: BloqueReal }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{bloque.titulo}</span>
      <Mono size={11} color="var(--twin-faint)">{bloque.items.map((it) => it.nombre).join(' · ')}</Mono>
    </div>
  );
}

/** El bloque principal: ítem a ítem, con su dosis y objetivo — es el trabajo de verdad. */
function BloquePrincipal({ bloque, compacto }: { bloque: BloqueReal; compacto: boolean }) {
  const nombreSize = compacto ? 13 : 18;
  const dosisSize = compacto ? 11 : 13;
  const filaGap = compacto ? 2 : 10;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compacto ? 4 : 8 }}>
      <span style={{ font: '600 10px/1.1 var(--twin-font-sans)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--twin-accent-text)' }}>
        {bloque.titulo}
        {bloque.formato ? ` · ${bloque.formato}` : ''}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: filaGap }}>
        {bloque.items.map((it, ii) => {
          // `dosisConSeries` es la ÚNICA grafía de dosis+series (datos-reales.ts) —
          // nace justo de que esta pantalla, la puerta del bloque y el entreno en
          // vivo inventaron cada una la suya el mismo día. Nulo (Sled Push, Sled
          // drag, Run: `{"scheme":"sets"}` sin medida real) se pinta como el
          // nombre solo — jamás un «— reps» que el coach no escribió (§7).
          // El descanso es una DURACIÓN, así que se escribe con el formateador
          // de duraciones (`1:30`), no en segundos crudos — y «descanso» entero,
          // que «desc» no lo dice nadie en el box (§2 y §3).
          const detalle = [
            dosisConSeries(it),
            it.objetivo,
            it.descansoS ? `descanso ${reloj(it.descansoS)}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div key={`${it.nombre}-${ii}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ font: `600 ${nombreSize}px/1.3 var(--twin-font-sans)`, color: 'var(--twin-fg)' }}>{it.nombre}</span>
              {detalle && (
                <>
                  <span style={{ flex: 1, borderBottom: '1px dotted var(--twin-hairline-strong)', transform: 'translateY(-3px)' }} />
                  <Mono size={dosisSize} color="var(--twin-muted)">{detalle}</Mono>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// «Lo que se midió» — FC y zonas, cada una solo si existe (§7 del contrato).
// ---------------------------------------------------------------------------

function LoQueSeMidio({
  medido,
  hasFC,
  hasZonas,
  onLog,
}: {
  medido: MedidoReal;
  hasFC: boolean;
  hasZonas: boolean;
  onLog: (linea: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ font: '600 10px/1.1 var(--twin-font-sans)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>
        Se midió
      </span>
      {hasFC ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <TileMedida etiqueta="FC media" valor={String(medido.fcMediaPpm)} unidad="ppm" />
          <TileMedida etiqueta="FC máx" valor={String(medido.fcMaxPpm)} unidad="ppm" />
        </div>
      ) : (
        // El hueco se declara, no se celebra: una línea, no una tarjeta entera.
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Sin pulsómetro — no se midió la FC
          </span>
          <div style={{ width: 148, flex: '0 0 auto' }}>
            <SecondaryCTA title="Anotarla a mano" onClick={() => onLog('Anotar FC a mano')} height={36} />
          </div>
        </div>
      )}
      {hasZonas && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{ font: '600 9px/1.1 var(--twin-font-sans)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}
            >
              Zonas
            </span>
            <span style={{ flex: 1 }} />
            <Mono size={9} color="var(--twin-muted)">{umbralLabel(UMBRAL)}</Mono>
          </div>
          {/* Corrección honesta frente a hoy.tsx: el % se calcula sobre la
             DURACIÓN de la sesión, no sobre la suma de zonas. Con z1 236 s +
             z2 246 s sobre una sesión de 572 s salen 41% y 43%, no 49%/51%, y
             el 16% que falta se pinta como tramo "sin medir" en vez de
             desaparecer dentro del 100%. */}
          <BarraZonas segmentos={distribucionPropuesta(medido)} />
        </div>
      )}
    </div>
  );
}

function distribucionPropuesta(medido: MedidoReal): SegmentoZona[] {
  const total = medido.duracionS;
  const zonasConDato = ([1, 2, 3, 4, 5] as const)
    .map((zona) => ({ zona, secs: medido.zonasS[`z${zona}` as const] ?? 0 }))
    .filter((z) => z.secs > 0);
  const segmentos: SegmentoZona[] = zonasConDato.map(({ zona, secs }) => {
    const pct = Math.round((secs / total) * 100);
    return { zona, pct, etiqueta: `Z${zona} ${pct}%` };
  });
  const resto = 100 - segmentos.reduce((acc, s) => acc + s.pct, 0);
  if (resto > 0) segmentos.push({ zona: null, pct: resto, etiqueta: `${resto}% sin medir` });
  return segmentos;
}
