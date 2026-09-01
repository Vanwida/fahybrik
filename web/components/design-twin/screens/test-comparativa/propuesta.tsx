'use client';

// PROPUESTA v2 — el test contra el de hace tres meses, con LAS ZONAS de sujeto.
//
// El giro respecto a la v1 (que enseñaba el umbral como un pin en una escala):
// en HYROX se entrena POR ZONAS, en correr y en los ergos. El producto real de
// un test no es la cifra — es la tabla de zonas recalculada, porque eso es lo
// que el atleta va a leer mañana en su plan. Así que la comparación enseña las
// SEIS bandas, antes → ahora, cada una con su corte y su mejora.
//
// Cuatro bandas, en el orden en que se contesta la pregunta:
//   1. la marca, antes → ahora — el número viejo apagado, el nuevo grande,
//      el delta y el % debajo;
//   2. contra QUÉ (el segmentado: anterior · hace 3 meses · tu mejor · 1ª vez);
//   3. LA ESCALERA DE ZONAS — la banda de cada zona entonces y ahora, con su
//      mejora por fila. Como las bandas del coach son cortes fijos sobre el
//      umbral, el test que lo mueve las mueve todas: eso es lo que se ve;
//   4. cómo se produjo — tramo a tramo, y a qué pulso.
//
// Nada se pinta sin dato: un intento sin reloj deja la fila del pulso dicha,
// sin historia no hay comparación, y un umbral que no se movió medio segundo
// enseña las zonas UNA vez (dos columnas idénticas serían teatro).

import { useState } from 'react';
import { Card, Etiqueta, NavBar, Pantalla, Pastilla, PuntoModalidad } from '../../kit-composicion/chrome';
import { esDecimal, ppm, reloj } from '../../kit-composicion/formato';
import { R, S } from '../../kit-composicion/tokens';
import {
  banda,
  esEmpate,
  esMejora,
  menosEsMejor,
  referencias,
  type Intento,
  type TestComparado,
  type ZonaDef,
} from './data';

// ── Formateadores. El test se lee con DÉCIMAS (la precisión a la que se decide
//    un récord); las bandas de zona van en segundos enteros, que es como se
//    entrenan. Uno por concepto (§2). ─────────────────────────────────────────

/** `461.2` → `7:41,2` · `120.3` → `2:00,3`. */
function relojDec(segundos: number): string {
  const t = Math.round(segundos * 10) / 10;
  const m = Math.floor(t / 60);
  const resto = (t - m * 60).toFixed(1).padStart(4, '0').replace('.', ',');
  return `${m}:${resto}`;
}

function sufijoRitmo(test: TestComparado): string {
  return test.umbralUnidad === 'por500m' ? '/500m' : '/km';
}

/** El HÉROE de un intento: el resultado en su propia voz. Un esfuerzo único se
 *  nombra por su tiempo total; un test de N tramos no TIENE tiempo total con
 *  significado, así que se nombra por su ritmo medio. */
function hero(test: TestComparado, i: Intento): { texto: string; sufijo: string } {
  if (test.agregacion !== 'unico') {
    return { texto: relojDec(test.ritmo(i.valor)), sufijo: sufijoRitmo(test) };
  }
  return test.unidad === 'segundos'
    ? { texto: relojDec(i.valor), sufijo: '' }
    : { texto: esDecimal(i.valor, i.valor % 1 === 0 ? 0 : 1), sufijo: 'm' };
}

/** La línea secundaria: lo que el héroe no dijo (el ritmo, o el total). */
function secundaria(test: TestComparado, i: Intento): string {
  if (test.agregacion !== 'unico') {
    const total =
      test.unidad === 'metros'
        ? `${esDecimal(i.valor, i.valor % 1 === 0 ? 0 : 1)} m en total`
        : `${relojDec(i.valor)} en total`;
    return `${total} · media de los tramos`;
  }
  return `${relojDec(test.ritmo(i.valor))}${sufijoRitmo(test)}`;
}

/** Delta del héroe, en su voz: segundos de ritmo para tests de tramos, y la
 *  unidad del test para esfuerzos únicos. */
function deltaHero(test: TestComparado, ref: Intento, hoy: Intento): string {
  const d =
    test.agregacion !== 'unico' || test.unidad === 'segundos'
      ? test.ritmo(hoy.valor) - test.ritmo(ref.valor)
      : hoy.valor - ref.valor;
  const esTiempo = test.agregacion !== 'unico' || test.unidad === 'segundos';
  const signo = d > 0 ? '+' : d < 0 ? '−' : '';
  const mag = Math.abs(d);
  return esTiempo
    ? `${signo}${mag >= 60 ? relojDec(mag) : esDecimal(mag)} s`
    : `${signo}${esDecimal(mag, mag % 1 === 0 ? 0 : 1)} m`;
}

/** Mejora relativa sobre el ritmo comparable — el «−3,6 %» que hace el delta
 *  legible entre tests de distinta duración. */
function porcentaje(test: TestComparado, ref: Intento, hoy: Intento): string {
  const p = ((test.ritmo(hoy.valor) - test.ritmo(ref.valor)) / test.ritmo(ref.valor)) * 100;
  const signo = p > 0 ? '+' : p < 0 ? '−' : '';
  return `${signo}${esDecimal(Math.abs(p))} %`;
}

// ── El veredicto: la frase que interpreta lo que los números no dicen ────────

interface Veredicto {
  /** Solo cuando los números solos ENGAÑARÍAN (empate, empeora, mismo-tiempo-
   *  menos-pulso). En una mejora normal los números son el titular. */
  titular: string | null;
  detalle: string;
  tono: 'ok' | 'neutro' | 'aviso';
}

function veredicto(test: TestComparado, ref: Intento, hoy: Intento): Veredicto {
  const d = hoy.valor - ref.valor;
  const dFc = hoy.fcMedia != null && ref.fcMedia != null ? hoy.fcMedia - ref.fcMedia : null;
  const empate = esEmpate(test, ref, hoy);

  if (empate && dFc != null && dFc <= -3) {
    return {
      titular: `Mismo ritmo, ${Math.abs(dFc)} ppm menos`,
      detalle: 'El mismo esfuerzo te cuesta menos que entonces. Es mejora, aunque el crono no se mueva.',
      tono: 'ok',
    };
  }
  if (empate) {
    return {
      titular: 'Te has quedado igual',
      detalle: 'Ni el ritmo ni el pulso se mueven: tus zonas siguen donde estaban.',
      tono: 'neutro',
    };
  }
  if (esMejora(test.unidad, d)) {
    return {
      titular: null,
      detalle:
        dFc != null && dFc <= 0
          ? `Y con ${dFc === 0 ? 'el mismo pulso' : `${Math.abs(dFc)} ppm menos`}: más rápido pagando menos.`
          : 'Tu umbral baja, y las seis zonas de tu plan bajan con él.',
      tono: 'ok',
    };
  }
  return {
    titular: `Más lento que ${ref.cuando}`,
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

// ── Banda 1 · La marca, antes → ahora ────────────────────────────────────────

function HeroComparado({ test, contra, hoy }: { test: TestComparado; contra: Intento | null; hoy: Intento }) {
  const v = contra ? veredicto(test, contra, hoy) : null;
  const empate = contra != null && esEmpate(test, contra, hoy);
  const mejora = !empate && contra != null && esMejora(test.unidad, hoy.valor - contra.valor);
  const hoyHero = hero(test, hoy);

  return (
    <Card padding={S.l}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
          <PuntoModalidad modalidad={test.modalidad} />
          <Etiqueta>{test.protocolo}</Etiqueta>
          <span style={{ flex: 1 }} />
          {test.calibra ? <Pastilla tono="acento">Calibra</Pastilla> : null}
        </div>

        {v?.titular ? (
          <span
            style={{
              font: 'italic 800 21px/1.12 var(--twin-font-sans)',
              letterSpacing: '-0.01em',
              color: v.tono === 'ok' ? 'var(--twin-ok)' : v.tono === 'aviso' ? 'var(--twin-warning)' : 'var(--twin-fg)',
            }}
          >
            {v.titular}
          </span>
        ) : null}
        {!contra ? (
          <span style={{ font: 'italic 800 21px/1.12 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
            Tu primera vez
          </span>
        ) : null}

        {/* La pareja de números: el viejo apagado, el nuevo manda. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: S.m, flexWrap: 'wrap' }}>
          {contra ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ font: '600 10px/1 var(--twin-font-sans)', letterSpacing: '0.08em', color: 'var(--twin-faint)' }}>
                {contra.fecha}
              </span>
              <span
                style={{
                  font: '700 24px/1 var(--twin-font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--twin-muted)',
                }}
              >
                {hero(test, contra).texto}
              </span>
            </div>
          ) : null}
          {contra ? (
            <span style={{ color: 'var(--twin-faint)', fontSize: 15, paddingBottom: 6 }}>→</span>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ font: '600 10px/1 var(--twin-font-sans)', letterSpacing: '0.08em', color: 'var(--twin-accent-text)' }}>
              {hoy.fecha} · HOY
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
              <span
                style={{
                  font: '800 42px/0.95 var(--twin-font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--twin-fg)',
                }}
              >
                {hoyHero.texto}
              </span>
              {hoyHero.sufijo ? (
                <span style={{ font: '600 14px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  {hoyHero.sufijo}
                </span>
              ) : null}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: S.s, flexWrap: 'wrap' }}>
          {contra ? (
            <>
              <ChipDelta texto={deltaHero(test, contra, hoy)} mejora={mejora} neutro={empate} />
              <ChipDelta texto={porcentaje(test, contra, hoy)} mejora={mejora} neutro={empate} />
            </>
          ) : null}
          <span style={{ font: '600 12px/1 var(--twin-font-mono)', color: 'var(--twin-muted)' }}>
            {secundaria(test, hoy)}
          </span>
        </div>

        <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {v?.detalle ??
            'No hay nada contra qué medirla todavía: esta marca es la referencia con la que se compararán las siguientes.'}
        </span>
      </div>
    </Card>
  );
}

// ── Banda 3 · La escalera de zonas ───────────────────────────────────────────

function bandaTexto(umbral: number, z: ZonaDef): string {
  const b = banda(umbral, z);
  return b.slow === null
    ? `> ${reloj(Math.round(b.fast))}`
    : `${reloj(Math.round(b.fast))}–${reloj(Math.round(b.slow))}`;
}

function FilaZona({
  z,
  antes,
  ahora,
}: {
  z: ZonaDef;
  /** Banda de la referencia. undefined = columna única (sin comparación). */
  antes?: string;
  ahora: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S.s, padding: '7px 0' }}>
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: 4, background: z.color, flex: '0 0 auto' }}
      />
      <span style={{ flex: '0 0 92px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ font: '700 12px/1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{z.codigo}</span>
        <span style={{ font: '500 10px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{z.nombre}</span>
      </span>
      {antes !== undefined ? (
        <>
          <span
            style={{
              flex: 1,
              textAlign: 'right',
              font: '600 12.5px/1 var(--twin-font-mono)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--twin-muted)',
            }}
          >
            {antes}
          </span>
          <span style={{ flex: '0 0 12px', textAlign: 'center', color: 'var(--twin-faint)', fontSize: 10 }}>→</span>
        </>
      ) : null}
      <span
        style={{
          flex: 1,
          textAlign: 'right',
          font: '700 13px/1 var(--twin-font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-fg)',
        }}
      >
        {ahora}
      </span>
    </div>
  );
}

function ZonasCard({ test, contra, hoy }: { test: TestComparado; contra: Intento | null; hoy: Intento }) {
  if (!test.calibra || hoy.umbral == null) return null;
  const uHoy = hoy.umbral;
  const uRef = contra?.umbral ?? null;
  const sinCambio = uRef != null && Math.abs(uHoy - uRef) < 0.5;
  const comparando = uRef != null && !sinCambio;

  return (
    <Card padding={S.l}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: S.s }}>
          <Etiqueta color="var(--twin-accent-text)">Tus zonas · {sufijoRitmo(test)}</Etiqueta>
          <span style={{ flex: 1 }} />
          {comparando ? (
            <ChipDelta
              // El corte rápido de la Z4 ES el umbral: su desplazamiento, en
              // segundos enteros (las bandas se leen así), es el de TODAS.
              texto={`todas ${Math.round(uHoy) - Math.round(uRef) > 0 ? '+' : '−'}${Math.abs(Math.round(uHoy) - Math.round(uRef))} s`}
              mejora={uHoy < uRef}
            />
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {comparando ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: S.s, paddingBottom: 2 }}>
              <span style={{ width: 8, flex: '0 0 auto' }} />
              <span style={{ flex: '0 0 92px' }} />
              <span style={{ flex: 1, textAlign: 'right', font: '600 9.5px/1 var(--twin-font-sans)', letterSpacing: '0.07em', color: 'var(--twin-faint)' }}>
                {contra?.fecha}
              </span>
              <span style={{ flex: '0 0 12px' }} />
              <span style={{ flex: 1, textAlign: 'right', font: '600 9.5px/1 var(--twin-font-sans)', letterSpacing: '0.07em', color: 'var(--twin-accent-text)' }}>
                HOY
              </span>
            </div>
          ) : null}
          {test.zonas.map((z) => (
            <FilaZona
              key={z.codigo}
              z={z}
              antes={comparando ? bandaTexto(uRef, z) : undefined}
              ahora={bandaTexto(uHoy, z)}
            />
          ))}
        </div>

        <span style={{ font: '400 11.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          {sinCambio
            ? `Sin cambios: tu umbral se queda en ${relojDec(uHoy)}${sufijoRitmo(test)} y las bandas no se mueven.`
            : comparando
              ? 'Los cortes de cada zona los define tu coach sobre tu umbral: el test lo mueve, y todas se recalculan con él. Esto es lo que leerás en tu plan.'
              : 'Estas bandas salen de tu marca de hoy. Los cortes los define tu coach; a partir de ahora tu plan se escribe con ellas.'}
        </span>
      </div>
    </Card>
  );
}

// ── Banda 4 · Cómo lo hiciste ────────────────────────────────────────────────

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
  antes?: string;
  ahora: string;
  delta?: string;
  mejora?: boolean;
  neutro?: boolean;
  falta?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S.s, padding: `${S.s}px 0` }}>
      <span style={{ flex: '0 0 74px', font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {etiqueta}
      </span>
      {antes !== undefined ? (
        <>
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
        </>
      ) : null}
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
      <span style={{ flex: '0 0 64px', display: 'flex', justifyContent: 'flex-end' }}>
        {delta ? <ChipDelta texto={delta} mejora={mejora ?? false} neutro={neutro} /> : null}
      </span>
    </div>
  );
}

function ComoLoHiciste({ test, contra, hoy }: { test: TestComparado; contra: Intento | null; hoy: Intento }) {
  const dFc = hoy.fcMedia != null && contra?.fcMedia != null ? hoy.fcMedia - contra.fcMedia : null;
  const dFcMax = hoy.fcMax != null && contra?.fcMax != null ? hoy.fcMax - contra.fcMax : null;
  const signo = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±');

  return (
    <Card padding={S.l}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Etiqueta>Cómo lo hiciste</Etiqueta>

        {hoy.tramos.map((t, i) => {
          const antes = contra?.tramos[i];
          const d = antes ? t.valor - antes.valor : null;
          return (
            <FilaCara
              key={t.etiqueta}
              etiqueta={t.etiqueta}
              antes={contra ? (antes ? `${esDecimal(antes.valor, 0)} m` : '—') : undefined}
              ahora={`${esDecimal(t.valor, 0)} m`}
              delta={d != null ? `${signo(d)}${esDecimal(Math.abs(d), 0)} m` : undefined}
              mejora={d != null && esMejora(test.unidad, d)}
            />
          );
        })}

        {/* El pulso de un test máximo es CONTEXTO, no veredicto: nunca se
            colorea solo. La interpretación (mismo ritmo pagando menos) la hace
            la frase del héroe, que ve ritmo y pulso JUNTOS. */}
        {hoy.fcMedia != null || contra?.fcMedia != null ? (
          <FilaCara
            etiqueta="FC media"
            antes={contra ? (contra.fcMedia != null ? ppm(contra.fcMedia) : 'sin reloj') : undefined}
            falta={contra != null && contra.fcMedia == null}
            ahora={hoy.fcMedia != null ? ppm(hoy.fcMedia) : '—'}
            delta={dFc != null ? `${signo(dFc)}${Math.abs(dFc)}` : undefined}
            mejora={false}
            neutro
          />
        ) : null}
        {hoy.fcMax != null || contra?.fcMax != null ? (
          <FilaCara
            etiqueta="FC máx"
            antes={contra ? (contra.fcMax != null ? ppm(contra.fcMax) : 'sin reloj') : undefined}
            falta={contra != null && contra.fcMax == null}
            ahora={hoy.fcMax != null ? ppm(hoy.fcMax) : '—'}
            delta={dFcMax != null ? `${signo(dFcMax)}${Math.abs(dFcMax)}` : undefined}
            mejora={false}
            neutro
          />
        ) : null}

        {contra && contra.fcMedia == null ? (
          <span style={{ font: '400 11.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)', paddingTop: S.xs }}>
            Aquel día no llevabas reloj, así que de ese test solo se sabe el tiempo.
          </span>
        ) : null}
        {hoy.tramos.length > 0 ? (
          <span style={{ font: '400 11.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)', paddingTop: S.xs }}>
            {menosEsMejor(test.unidad) ? 'Menos tiempo es mejor.' : 'Más metros es mejor.'} El resultado es la{' '}
            {test.agregacion === 'media' ? 'media' : 'mejor'} de los tramos, como lo definió tu coach.
          </span>
        ) : null}
      </div>
    </Card>
  );
}

// ── La curva de todos los intentos ───────────────────────────────────────────

function Curva({ test, refId }: { test: TestComparado; refId: string | null }) {
  const vals = test.intentos.map((i) => test.ritmo(i.valor));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const ANCHO = 100;
  const ALTO = 44;
  // Los extremos se meten hacia dentro para que el círculo no se corte.
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
        <HeroComparado test={test} contra={ref} hoy={hoy} />
        {refs.length > 1 ? (
          <Selector opciones={refs} activa={refId} onElegir={(id) => { setRefId(id); onLog(`comparar contra: ${id}`); }} />
        ) : null}
        <ZonasCard test={test} contra={ref} hoy={hoy} />
        {hoy.tramos.length > 0 || hoy.fcMedia != null || ref?.fcMedia != null ? (
          <ComoLoHiciste test={test} contra={ref} hoy={hoy} />
        ) : null}
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
