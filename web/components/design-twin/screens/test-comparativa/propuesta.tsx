'use client';

// PROPUESTA — el resultado de un test contra el de hace tres meses.
//
// El sujeto NO es el número: es **cuánto has mejorado**, y por eso lo primero que
// se lee es el veredicto y no la cifra. La cifra viene inmediatamente después,
// porque el atleta la quiere, pero sola no dice nada — «7:41» solo significa algo
// contra «7:58».
//
// Cuatro bandas, de arriba abajo, en el orden en que se contesta la pregunta:
//   1. el veredicto + la marca de hoy;
//   2. contra QUÉ (el segmentado: anterior · hace 3 meses · tu mejor · 1ª vez);
//   3. lo que cambia en su plan — el umbral desplazado en la escala de ritmo,
//      que es lo que va a leer mañana;
//   4. cómo se produjo — tramo a tramo, y a qué pulso.
//
// Nada se pinta sin dato: un intento sin reloj deja la fila del pulso dicha, no
// rellenada, y sin historia no hay comparación (se dice que esta es la primera).

import { useState } from 'react';
import { Card, Etiqueta, NavBar, Pantalla, Pastilla, PuntoModalidad } from '../../kit-composicion/chrome';
import { esDecimal, ppm } from '../../kit-composicion/formato';
import { R, S } from '../../kit-composicion/tokens';
import {
  esEmpate,
  esMejora,
  menosEsMejor,
  referencias,
  type Intento,
  type TestComparado,
} from './data';

// ── Formateadores. Uno por concepto (§2): el test se lee con DÉCIMAS, que es la
//    precisión a la que se decide un récord, y el resto del doble no las tiene.
// ─────────────────────────────────────────────────────────────────────────────

/** `461.2` → `7:41,2` · `120.3` → `2:00,3`. */
function relojDec(segundos: number): string {
  const t = Math.round(segundos * 10) / 10;
  const m = Math.floor(t / 60);
  const resto = (t - m * 60).toFixed(1).padStart(4, '0').replace('.', ',');
  return `${m}:${resto}`;
}

/** La marca, en la unidad del test. */
function marca(test: TestComparado, valor: number): string {
  return test.unidad === 'segundos' ? relojDec(valor) : esDecimal(valor, valor % 1 === 0 ? 0 : 1);
}

function unidadDe(test: TestComparado): string {
  return test.unidad === 'segundos' ? '' : 'm';
}

/** El ritmo comparable, siempre con su sufijo. */
function ritmoTexto(test: TestComparado, valor: number): string {
  return `${relojDec(test.ritmo(valor))}${test.umbralUnidad === 'por500m' ? '/500m' : '/km'}`;
}

/** Delta con signo tipográfico y su unidad: `−17,4 s` · `+35,5 m`. */
function deltaTexto(test: TestComparado, d: number): string {
  const signo = d > 0 ? '+' : d < 0 ? '−' : '';
  const mag = Math.abs(d);
  return test.unidad === 'segundos'
    ? `${signo}${esDecimal(mag)} s`
    : `${signo}${esDecimal(mag, mag % 1 === 0 ? 0 : 1)} m`;
}

// ── El veredicto: la frase que abre la pantalla ──────────────────────────────

interface Veredicto {
  titular: string;
  detalle: string;
  tono: 'ok' | 'neutro' | 'aviso';
}

/**
 * Lo que de verdad pasó entre los dos intentos. El caso que hoy se pierde es el
 * tercero: MISMO tiempo con el pulso más bajo es una mejora de las buenas, y una
 * pantalla que solo resta números la enseña como «−0,4 s», o sea, como nada.
 */
function veredicto(test: TestComparado, ref: Intento, hoy: Intento): Veredicto {
  const d = hoy.valor - ref.valor;
  const dFc = hoy.fcMedia != null && ref.fcMedia != null ? hoy.fcMedia - ref.fcMedia : null;
  const dRitmo = test.ritmo(hoy.valor) - test.ritmo(ref.valor);
  const empate = esEmpate(test, ref, hoy);

  if (empate && dFc != null && dFc <= -3) {
    return {
      titular: `Mismo tiempo, ${Math.abs(dFc)} ppm menos`,
      detalle: 'El mismo esfuerzo te cuesta menos que hace tres meses. Es mejora, aunque el crono no se mueva.',
      tono: 'ok',
    };
  }
  if (empate) {
    return {
      titular: 'Te has quedado igual',
      detalle: 'Ni el tiempo ni el pulso se mueven. Tu umbral no cambia y tu plan sigue con los mismos ritmos.',
      tono: 'neutro',
    };
  }
  if (esMejora(test.unidad, d)) {
    // El titular y el chip cuentan el MISMO número: redondear aquí a 36 lo que
    // ahí se lee 35,5 hace dudar de los dos.
    const cuanto =
      test.unidad === 'segundos'
        ? `${esDecimal(Math.abs(d))} s más rápido`
        : `${esDecimal(Math.abs(d), Math.abs(d) % 1 === 0 ? 0 : 1)} m más`;
    return {
      titular: `${cuanto} que ${ref.cuando}`,
      detalle:
        dFc != null && dFc <= 0
          ? `Y con ${dFc === 0 ? 'el mismo' : `${Math.abs(dFc)} ppm menos de`} pulso: has ido más rápido pagando menos.`
          : `Son ${esDecimal(Math.abs(dRitmo))} s por ${test.umbralUnidad === 'por500m' ? '500 m' : 'kilómetro'}.`,
      tono: 'ok',
    };
  }
  return {
    titular: `${esDecimal(Math.abs(d))} ${test.unidad === 'segundos' ? 's más lento' : 'm menos'} que ${ref.cuando}`,
    detalle: 'Un test malo también es dato: tu plan se recalcula con este número, no con el de antes.',
    tono: 'aviso',
  };
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function ChipDelta({ texto, mejora, neutro }: { texto: string; mejora: boolean; neutro?: boolean }) {
  const color = neutro ? 'var(--twin-muted)' : mejora ? 'var(--twin-ok)' : 'var(--twin-warning)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 7px',
        borderRadius: R.pill,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        font: '700 12px/1 var(--twin-font-mono)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}

/** El segmentado de referencia: contra qué se compara. */
function Selector({
  opciones,
  activa,
  onElegir,
}: {
  opciones: { id: string; etiqueta: string }[];
  activa: string;
  onElegir: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        padding: 2,
        borderRadius: R.m,
        background: 'color-mix(in srgb, var(--twin-fg) 7%, transparent)',
      }}
    >
      {opciones.map((o) => {
        const on = o.id === activa;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onElegir(o.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flex: 1,
              textAlign: 'center',
              padding: '7px 2px',
              borderRadius: R.s,
              background: on ? 'var(--twin-surface-elevated)' : 'transparent',
              boxShadow: on ? '0 1px 3px rgba(0,0,0,.25)' : 'none',
              font: `${on ? 700 : 500} 12px/1.2 var(--twin-font-sans)`,
              color: on ? 'var(--twin-fg)' : 'var(--twin-muted)',
            }}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** Una fila del cara a cara: etiqueta · entonces · ahora · delta. */
function FilaCara({
  etiqueta,
  antes,
  ahora,
  delta,
  mejora,
  neutro,
  falta,
}: {
  etiqueta: string;
  antes: string;
  ahora: string;
  delta?: string;
  mejora?: boolean;
  /** El delta es contexto, no veredicto: se pinta sin color. */
  neutro?: boolean;
  falta?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S.s, padding: `${S.s}px 0` }}>
      <span style={{ flex: '0 0 74px', font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {etiqueta}
      </span>
      <span
        style={{
          flex: 1,
          textAlign: 'right',
          font: falta ? '400 12px/1.2 var(--twin-font-sans)' : '600 14px/1.2 var(--twin-font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: falta ? 'var(--twin-faint)' : 'var(--twin-muted)',
        }}
      >
        {antes}
      </span>
      <span style={{ flex: '0 0 14px', textAlign: 'center', color: 'var(--twin-faint)', fontSize: 11 }}>→</span>
      <span
        style={{
          flex: 1,
          textAlign: 'right',
          font: '700 15px/1.2 var(--twin-font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-fg)',
        }}
      >
        {ahora}
      </span>
      <span style={{ flex: '0 0 70px', display: 'flex', justifyContent: 'flex-end' }}>
        {delta ? <ChipDelta texto={delta} mejora={mejora ?? false} neutro={neutro} /> : null}
      </span>
    </div>
  );
}

/**
 * La escala de ritmo con el umbral de entonces y el de ahora. Es la traducción
 * que hace útil el test: las seis zonas del coach son desplazamientos fijos sobre
 * el umbral, así que TODAS se mueven exactamente lo que se movió él. No hace falta
 * conocer sus bandas para decir la verdad — y no se inventa ninguna.
 */
function EscalaUmbral({ antes, ahora, sufijo }: { antes: number; ahora: number; sufijo: string }) {
  const margen = Math.max(6, Math.abs(antes - ahora) * 0.9);
  const min = Math.min(antes, ahora) - margen;
  const max = Math.max(antes, ahora) + margen;
  // Más rápido = menos segundos = a la IZQUIERDA, como en cualquier monitor.
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  const mejora = ahora < antes;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <div style={{ position: 'relative', height: 34 }}>
        <div
          style={{
            position: 'absolute',
            insetInline: 0,
            top: 15,
            height: 4,
            borderRadius: 2,
            // La base es NEUTRA: un degradado de bueno a malo convertiría la
            // escala en un juicio, y aquí lo único que se juzga es el tramo
            // que separa los dos umbrales.
            background: 'color-mix(in srgb, var(--twin-fg) 12%, transparent)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 15,
            height: 4,
            borderRadius: 2,
            left: `${Math.min(pos(antes), pos(ahora))}%`,
            width: `${Math.abs(pos(ahora) - pos(antes))}%`,
            background: mejora ? 'var(--twin-ok)' : 'var(--twin-warning)',
          }}
        />
        {[
          { v: antes, texto: relojDec(antes), tono: 'var(--twin-muted)', arriba: true },
          { v: ahora, texto: relojDec(ahora), tono: 'var(--twin-fg)', arriba: false },
        ].map((p) => (
          <div
            key={p.arriba ? 'antes' : 'ahora'}
            style={{
              position: 'absolute',
              left: `${pos(p.v)}%`,
              top: p.arriba ? 0 : 19,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {p.arriba ? null : <span style={{ width: 2, height: 8, background: p.tono, borderRadius: 1 }} />}
            <span
              style={{
                font: `${p.arriba ? 500 : 700} 11px/1.2 var(--twin-font-mono)`,
                fontVariantNumeric: 'tabular-nums',
                color: p.tono,
                whiteSpace: 'nowrap',
              }}
            >
              {p.texto}
            </span>
            {p.arriba ? <span style={{ width: 2, height: 8, background: p.tono, borderRadius: 1 }} /> : null}
          </div>
        ))}
      </div>
      <span style={{ font: '400 11.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
        Más rápido a la izquierda · {sufijo}
      </span>
    </div>
  );
}

/** La curva de todos los intentos. El comparado y el de hoy, marcados. */
function Curva({ test, refId }: { test: TestComparado; refId: string | null }) {
  const vals = test.intentos.map((i) => test.ritmo(i.valor));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const ANCHO = 100;
  const ALTO = 44;
  // Los extremos se meten hacia dentro: con el primer punto en x=0 el círculo
  // sale medio cortado por el borde del viewBox.
  const MARGEN = 3;
  const util = ANCHO - MARGEN * 2;
  const puntos = test.intentos.map((i, idx) => ({
    intento: i,
    x: test.intentos.length === 1 ? ANCHO / 2 : MARGEN + (idx / (test.intentos.length - 1)) * util,
    // Rápido arriba: el eje va al revés que los segundos.
    y: ALTO - ((max - test.ritmo(i.valor)) / span) * (ALTO - 8) - 4,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" style={{ width: '100%', height: 56 }} aria-hidden>
        <polyline
          points={puntos.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="var(--twin-accent)"
          strokeWidth={1.4}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {puntos.map((p, idx) => {
          const esHoy = idx === puntos.length - 1;
          const esRef = p.intento.id === refId;
          return (
            <circle
              key={p.intento.id}
              cx={p.x}
              cy={p.y}
              r={esHoy || esRef ? 3 : 1.8}
              fill={esHoy ? 'var(--twin-accent)' : esRef ? 'var(--twin-bg)' : 'var(--twin-accent)'}
              stroke={esRef ? 'var(--twin-fg)' : 'none'}
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {test.intentos.map((i) => (
          <span key={i.id} style={{ font: '500 10px/1 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            {i.fecha}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── La pantalla ──────────────────────────────────────────────────────────────

export function TestComparativa({ test, onLog }: { test: TestComparado; onLog: (l: string) => void }) {
  const refs = referencias(test);
  const [refId, setRefId] = useState(refs[0]?.id ?? '');
  const hoy = test.intentos[test.intentos.length - 1];
  const ref = refs.find((r) => r.id === refId)?.intento ?? null;
  const v = ref ? veredicto(test, ref, hoy) : null;

  const dValor = ref ? hoy.valor - ref.valor : null;
  // Empate = el número no mueve el umbral ni medio segundo. Entonces NINGÚN
  // chip del número se colorea: si el veredicto dice «mismo tiempo», un chip
  // verde al lado lo desmiente y el atleta no sabe a cuál de los dos creer.
  const empate = ref != null && esEmpate(test, ref, hoy);
  const mejora = !empate && dValor != null && esMejora(test.unidad, dValor);

  return (
    <Pantalla
      estrategia="llena"
      cabecera={<NavBar titulo={test.nombre} atras />}
      accion={
        <button
          type="button"
          className="tw-btn-secondary"
          onClick={() => onLog('volver a probarme — lanza el test otra vez')}
          style={{ width: '100%', height: 46, font: 'italic 800 13px/1 var(--twin-font-sans)', letterSpacing: '0.05em', textTransform: 'uppercase' }}
        >
          Volver a probarme
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.m, padding: `${S.m}px ${S.l}px ${S.l}px` }}>
        {/* 1 · El veredicto y la marca */}
        <Card padding={S.l}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
              <PuntoModalidad modalidad={test.modalidad} />
              <Etiqueta>{hoy.fecha} · {hoy.cuando}</Etiqueta>
              <span style={{ flex: 1 }} />
              {test.calibra ? <Pastilla tono="acento">Calibra</Pastilla> : null}
            </div>

            {v ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  style={{
                    font: 'italic 800 21px/1.12 var(--twin-font-sans)',
                    letterSpacing: '-0.01em',
                    color: v.tono === 'ok' ? 'var(--twin-ok)' : v.tono === 'aviso' ? 'var(--twin-warning)' : 'var(--twin-fg)',
                  }}
                >
                  {v.titular}
                </span>
                <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  {v.detalle}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ font: 'italic 800 21px/1.12 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                  Tu primera vez
                </span>
                <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  No hay nada contra qué medirla todavía: esta marca es la referencia con la que se compararán las siguientes.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'baseline', gap: S.s, flexWrap: 'wrap' }}>
              {/* 48 y no 72: aquí el sujeto es el veredicto, y la cifra es su
                  prueba. Un hero de 72 pt dejaría la frase de arriba de adorno. */}
              <span className="t-readout-l" style={{ color: 'var(--twin-fg)' }}>
                {marca(test, hoy.valor)}
              </span>
              {unidadDe(test) ? (
                <span style={{ font: '600 15px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  {unidadDe(test)}
                </span>
              ) : null}
              <span style={{ flex: 1 }} />
              {dValor != null ? <ChipDelta texto={deltaTexto(test, dValor)} mejora={mejora} neutro={empate} /> : null}
            </div>
            <span style={{ font: '600 13px/1 var(--twin-font-mono)', color: 'var(--twin-muted)', marginTop: -6 }}>
              {ritmoTexto(test, hoy.valor)}
              {test.agregacion === 'media' ? ' · media de los dos tramos' : ''}
            </span>
          </div>
        </Card>

        {/* 2 · Contra qué */}
        {refs.length > 1 ? (
          <Selector opciones={refs} activa={refId} onElegir={(id) => { setRefId(id); onLog(`comparar contra: ${id}`); }} />
        ) : null}

        {/* El cara a cara */}
        {ref ? (
          <Card padding={S.l}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: S.s, paddingBottom: S.xs }}>
                <span style={{ flex: '0 0 74px' }} />
                <span style={{ flex: 1, textAlign: 'right', font: '600 10px/1.2 var(--twin-font-sans)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--twin-faint)' }}>
                  {ref.fecha}
                </span>
                <span style={{ flex: '0 0 14px' }} />
                <span style={{ flex: 1, textAlign: 'right', font: '600 10px/1.2 var(--twin-font-sans)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--twin-accent-text)' }}>
                  Hoy
                </span>
                <span style={{ flex: '0 0 70px' }} />
              </div>

              <FilaCara
                etiqueta={test.unidad === 'segundos' ? 'Tiempo' : 'Metros'}
                antes={marca(test, ref.valor)}
                ahora={marca(test, hoy.valor)}
                delta={deltaTexto(test, hoy.valor - ref.valor)}
                mejora={mejora}
                neutro={empate}
              />
              <FilaCara
                etiqueta="Ritmo"
                antes={ritmoTexto(test, ref.valor)}
                ahora={ritmoTexto(test, hoy.valor)}
                delta={`${test.ritmo(hoy.valor) - test.ritmo(ref.valor) < 0 ? '−' : '+'}${esDecimal(Math.abs(test.ritmo(hoy.valor) - test.ritmo(ref.valor)))} s`}
                mejora={!empate && test.ritmo(hoy.valor) < test.ritmo(ref.valor)}
                neutro={empate}
              />
              {hoy.fcMedia != null || ref.fcMedia != null ? (
                // El pulso de un test máximo NO es bueno ni malo por sí solo: ir
                // 8 s más rápido con 1 ppm más no es empeorar nada. Solo se
                // colorea cuando dice algo — mismo rendimiento (o mejor) pagando
                // menos. En cualquier otro caso es contexto, y va neutro.
                <FilaCara
                  etiqueta="FC media"
                  antes={ref.fcMedia != null ? ppm(ref.fcMedia) : 'sin reloj'}
                  falta={ref.fcMedia == null}
                  ahora={hoy.fcMedia != null ? ppm(hoy.fcMedia) : '—'}
                  delta={
                    hoy.fcMedia != null && ref.fcMedia != null
                      ? `${hoy.fcMedia - ref.fcMedia > 0 ? '+' : hoy.fcMedia - ref.fcMedia < 0 ? '−' : ''}${Math.abs(hoy.fcMedia - ref.fcMedia)}`
                      : undefined
                  }
                  mejora={false}
                  neutro={
                    !(
                      hoy.fcMedia != null &&
                      ref.fcMedia != null &&
                      hoy.fcMedia - ref.fcMedia <= -3 &&
                      !(dValor != null && !mejora && !esEmpate(test, ref, hoy))
                    )
                  }
                />
              ) : null}
              {ref.fcMedia == null ? (
                <span style={{ font: '400 11.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)', paddingTop: S.xs }}>
                  Aquel día no llevabas reloj, así que de ese test solo se sabe el tiempo.
                </span>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* 3 · Lo que cambia en tu plan */}
        {test.calibra && hoy.umbral != null ? (
          <Card padding={S.l}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
              <Etiqueta color="var(--twin-accent-text)">Lo que cambia en tu plan</Etiqueta>
              {ref?.umbral != null && Math.abs(hoy.umbral - ref.umbral) < 0.5 ? (
                // Medio segundo por 500 m es ruido de medición, no un cambio de
                // umbral. Pintar la escala con los dos pines pisándose sugeriría
                // un movimiento que no existe.
                <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                  Tu umbral se queda en <b>{relojDec(hoy.umbral)}{test.umbralUnidad === 'por500m' ? '/500m' : '/km'}</b>: tus
                  zonas siguen exactamente donde estaban y tu plan no cambia de ritmos.
                </span>
              ) : ref?.umbral != null ? (
                <>
                  <EscalaUmbral
                    antes={ref.umbral}
                    ahora={hoy.umbral}
                    sufijo={`umbral en ${test.umbralUnidad === 'por500m' ? 's/500m' : 's/km'}`}
                  />
                  <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                    Tu umbral se ha movido{' '}
                    <b style={{ color: hoy.umbral < ref.umbral ? 'var(--twin-ok)' : 'var(--twin-warning)' }}>
                      {esDecimal(Math.abs(hoy.umbral - ref.umbral))} s
                    </b>{' '}
                    y tus seis zonas van con él: cada ritmo que leas esta semana en tu plan sale de este número.
                  </span>
                </>
              ) : (
                <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                  Este test fija {test.calibra}: a partir de ahora tus ritmos salen de{' '}
                  <b>{relojDec(hoy.umbral)}{test.umbralUnidad === 'por500m' ? '/500m' : '/km'}</b>.
                </span>
              )}
            </div>
          </Card>
        ) : null}

        {/* 4 · Cómo lo hiciste */}
        {hoy.tramos.length > 0 && ref ? (
          <Card padding={S.l}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
              <Etiqueta>Cómo lo hiciste</Etiqueta>
              <span style={{ font: '400 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', marginBottom: S.xs }}>
                {test.protocolo}
              </span>
              {hoy.tramos.map((t, i) => {
                const antes = ref.tramos[i];
                const d = antes ? t.valor - antes.valor : null;
                return (
                  <FilaCara
                    key={t.etiqueta}
                    etiqueta={t.etiqueta}
                    antes={antes ? `${esDecimal(antes.valor, 0)} m` : '—'}
                    ahora={`${esDecimal(t.valor, 0)} m`}
                    delta={d != null ? deltaTexto(test, d) : undefined}
                    mejora={d != null && esMejora(test.unidad, d)}
                  />
                );
              })}
              <span style={{ font: '400 11.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)', paddingTop: S.xs }}>
                {menosEsMejor(test.unidad) ? 'Menos tiempo es mejor.' : 'Más metros es mejor.'} El resultado del test es la{' '}
                {test.agregacion === 'media' ? 'media' : 'mejor'} de los tramos, como lo definió tu coach.
              </span>
            </div>
          </Card>
        ) : null}

        {/* La historia entera */}
        {test.intentos.length > 1 ? (
          <Card padding={S.l}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
              <Etiqueta>Todas tus veces</Etiqueta>
              <Curva test={test} refId={ref?.id ?? null} />
            </div>
          </Card>
        ) : null}
      </div>
    </Pantalla>
  );
}
