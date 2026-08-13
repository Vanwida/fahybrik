'use client';

// TENDENCIAS — los informes de running por métrica y periodo.
//
// DE DÓNDE SALE (docs/analiticas-running-mapa.md, v2, sección TENDENCIAS,
// PRIORIDAD 2). Lo que Garmin llama Reports: km/semana, tiempo, ritmo medio, FC
// media, desnivel, VO₂máx, cadencia — cada uno con periodos elegibles (4
// semanas / 6 meses / año / todo). Se entra por push desde la puerta «Este
// mes» del hub de Analíticas (nivel 0 → nivel 1); hoy esa puerta no lleva a
// ningún sitio, solo enseña cuatro barras de la semana en curso dentro de la
// tira de Carrera y todo lo de antes desaparece sin dejar rastro.
//
// ARQUETIPO DETALLE, ESTRATEGIA LLENA (CONTRATO-UI §6.2): el sujeto es «el
// dato que te trajo a abrirla» — los kilómetros del periodo — y el hueco se
// gana con lo que le da sentido: el resto de métricas del mismo periodo, no
// con aire. Con siete bloques y su gráfico cada uno, la pantalla desborda y
// scrollea desde arriba, que es justo lo que `llena` resuelve (§6.1).
//
// LA VOZ ES LA DE `analiticas-correr`, estudiada mirándola (12-ago): cero
// cajas, cero rayas divisorias, aire entre bloques (48, §6.1), cifras mono
// tabulares, etiquetas en versalita, trazos finos SOBRE el lienzo sin relleno
// sólido de color. La diferencia deliberada: esto es un INFORME, no un
// veredicto — no hay tinte de fondo (no hay un juicio que teñir el lienzo) y
// las líneas no invierten el eje («lo bueno arriba» es una regla de esa
// pantalla, no de esta). Ver `graficos.tsx`.
//
// LA CABECERA ES LA DE UNA VISTA EMPUJADA: `NavBar` con `atras`, nunca la
// `TabBar` de pestañas — mismo patrón que `ranking-box`, `tests-calibracion` y
// `correr-historial`, que tampoco son raíz de pestaña. El selector de periodo
// va FIJO bajo el título, no en el cuerpo que scrollea: afecta a los siete
// bloques a la vez, así que tiene que seguir alcanzable aunque el atleta haya
// bajado hasta la cadencia.
//
// `composicion` se declara (el panel ofrece «hoy/propuesta»), pero `Screen` no
// bifurca por `vista`: TENDENCIAS es ❌ ENTERA en el mapa, no hay una pantalla
// de hoy que reproducir — mismo criterio que ya fijó `correr-historial` para
// el mismo caso.

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Etiqueta, NavBar, Pantalla } from '../../kit-composicion/chrome';
import { R, S } from '../../kit-composicion/tokens';
import { conMillar, horasYMin, ppm, reloj, ritmoKm } from '../../kit-composicion/formato';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Barras, Linea } from './graficos';
import {
  ESCENAS,
  PERIODOS,
  bloqueDe,
  huboSeriesEnVentana,
  separaRodajesDe,
  tieneCadencia,
  tieneVo2,
  ultimoBucket,
  type Bloque as BloqueDatos,
  type PeriodoId,
} from './datos';

export const meta: TwinMeta = {
  id: 'correr-tendencias',
  titulo: 'Tendencias — tus números de correr',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-08-13',
  descripcion:
    'Los informes de running por métrica y periodo, como los Reports de Garmin: kilómetros, tiempo, ritmo, FC, desnivel, VO₂máx y cadencia, cada uno con su cifra del periodo, su delta contra el anterior y su serie — y el bloque que no tiene fuente, directamente no existe.',
  fuentes: [],
  enApp:
    'No existe como vista: hoy hay barras de 4 semanas dentro de la tira de Carrera. Los datos existen (ejecuciones, biometric_streams con vo2max, desnivel del 13-ago).',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  // Sin `composicion`: propuesta pura sin vista «hoy» que alternar (TENDENCIAS
  // es ❌ ENTERA en el mapa). Arquetipo detalle, estrategia llena.
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'ano-completo',
    titulo: '① Un año dentro · histórico importado',
    descripcion:
      'Cuarenta y ocho semanas, las siete métricas presentes. El ritmo lleva su nota Y su alternancia «solo rodajes»: la fuente distingue series de rodajes semana a semana.',
  },
  {
    id: 'mes-a-mes',
    titulo: '② Un mes y pico · sin cadencia',
    descripcion:
      'Veinte semanas, sin histórico de Garmin: hay VO₂máx (el reloj lo estima solo) pero cadencia no existe. El ritmo lleva la nota de las series, sin alternancia — la fuente no las separa.',
  },
  {
    id: 'poco-historico',
    titulo: '③ Cinco semanas en la app',
    descripcion:
      'Recién llegado a este coach, no a correr: ya entrena 30-40 km/semana. Sin VO₂máx estable ni cadencia todavía, y sin series aún: el ritmo no lleva nota. La pantalla se sostiene con lo que hay.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const semanas = ESCENAS[escenario] ?? ESCENAS['ano-completo']!;
  const [periodo, setPeriodo] = useState<PeriodoId>('4sem');
  const [soloRodajes, setSoloRodajes] = useState(false);

  const puedeSepararRodajes = separaRodajesDe(semanas);
  const conVo2 = tieneVo2(semanas);
  const conCadencia = tieneCadencia(semanas);
  const conNotaSeries = huboSeriesEnVentana(semanas, periodo);

  // Viendo «solo rodajes» ya excluye las series por construcción — la nota de más abajo, que
  // avisa de que las series se han colado en la media, dejaría de tener sentido en ese modo.
  const viendoSoloRodajes = soloRodajes && puedeSepararRodajes;

  const bKm = bloqueDe(semanas, periodo, 'km');
  const bTiempo = bloqueDe(semanas, periodo, 'tiempoS');
  const bRitmo = bloqueDe(semanas, periodo, viendoSoloRodajes ? 'ritmoRodajes' : 'ritmo');
  const bFc = bloqueDe(semanas, periodo, 'fcMedia');
  const bDesnivel = bloqueDe(semanas, periodo, 'desnivelM');
  const bVo2 = conVo2 ? bloqueDe(semanas, periodo, 'vo2') : null;
  const bCadencia = conCadencia ? bloqueDe(semanas, periodo, 'cadencia') : null;

  useEffect(() => {
    const nBloques = 5 + (conVo2 ? 1 : 0) + (conCadencia ? 1 : 0);
    onLog(`${nBloques} bloques · periodo por defecto ${PERIODOS.find((p) => p.id === '4sem')!.etiqueta}`);
    // Solo al montar: el remount por `key` al cambiar de escenario reinicia esto, y cada
    // interacción del atleta ya se registra en su propio manejador (como en `correr-historial`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tocar = (metrica: string) => {
    const unidad = periodo === '4sem' ? 'semana' : 'mes';
    const ultimo = ultimoBucket(semanas, periodo);
    onLog(ultimo ? `${metrica} → sesiones de la ${unidad} del ${ultimo.etiqueta}` : `${metrica} → sin sesiones en este periodo`);
  };

  const cabecera = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.m, paddingBottom: S.m }}>
      <NavBar titulo="Tendencias" atras />
      <SelectorPeriodo
        activo={periodo}
        onPick={(p) => {
          setPeriodo(p);
          onLog(`Periodo → ${PERIODOS.find((x) => x.id === p)!.etiqueta}`);
        }}
      />
    </div>
  );

  return (
    <div className="twin-screen-safe">
      <Pantalla estrategia="llena" cabecera={cabecera}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xxxl, padding: `${S.m}px ${S.l}px ${S.xxl}px` }}>
          <BloqueMetrica etiqueta="Kilómetros" onTap={() => tocar('Kilómetros')}>
            <ContenidoBloque actual={bKm.actual}>
              <Cabecera>
                <Cifra valor={conMillar(bKm.actual!)} unidad="km" />
                <DeltaVolumen b={bKm} />
              </Cabecera>
              <Barras puntos={bKm.puntos} />
            </ContenidoBloque>
          </BloqueMetrica>

          <BloqueMetrica etiqueta="Tiempo corriendo" onTap={() => tocar('Tiempo corriendo')}>
            <ContenidoBloque actual={bTiempo.actual}>
              <Cabecera>
                <Cifra valor={horasYMin(bTiempo.actual!)} />
                <DeltaVolumen b={bTiempo} />
              </Cabecera>
              <Barras puntos={bTiempo.puntos} />
            </ContenidoBloque>
          </BloqueMetrica>

          <BloqueMetrica etiqueta="Ritmo medio" onTap={() => tocar('Ritmo medio')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.s, flexWrap: 'wrap' }}>
              <ContenidoBloque actual={bRitmo.actual} motivo="Sin rodajes en este periodo">
                <Cabecera>
                  <Cifra valor={ritmoKm(bRitmo.actual!)} />
                  <DeltaVolumen b={bRitmo} />
                </Cabecera>
              </ContenidoBloque>
              {puedeSepararRodajes && (
                <TogglePequeno
                  activo={soloRodajes}
                  onPick={(v) => {
                    setSoloRodajes(v);
                    onLog(`Ritmo → ${v ? 'solo rodajes' : 'todo'}`);
                  }}
                />
              )}
            </div>
            {conNotaSeries && !viendoSoloRodajes && <NotaFina>Incluye series, que aceleran la media</NotaFina>}
            {bRitmo.actual != null && <Linea puntos={bRitmo.puntos} formato={(v) => reloj(Math.round(v))} />}
          </BloqueMetrica>

          <BloqueMetrica etiqueta="FC media" onTap={() => tocar('FC media')}>
            <ContenidoBloque actual={bFc.actual}>
              <Cabecera>
                <Cifra valor={ppm(bFc.actual!)} />
                <DeltaVolumen b={bFc} />
              </Cabecera>
              <Linea puntos={bFc.puntos} formato={(v) => String(Math.round(v))} />
            </ContenidoBloque>
          </BloqueMetrica>

          <BloqueMetrica etiqueta="Desnivel" onTap={() => tocar('Desnivel')}>
            <ContenidoBloque actual={bDesnivel.actual}>
              <Cabecera>
                <Cifra valor={conMillar(bDesnivel.actual!)} unidad="m" />
                <DeltaVolumen b={bDesnivel} />
              </Cabecera>
              <Barras puntos={bDesnivel.puntos} />
            </ContenidoBloque>
          </BloqueMetrica>

          {bVo2 && (
            <BloqueMetrica etiqueta="VO₂máx" onTap={() => tocar('VO₂máx')}>
              <ContenidoBloque actual={bVo2.actual}>
                <Cabecera>
                  <Cifra valor={String(Math.round(bVo2.actual!))} unidad="VO₂máx" />
                  <DeltaVo2 b={bVo2} />
                </Cabecera>
                <Linea puntos={bVo2.puntos} formato={(v) => String(Math.round(v))} />
              </ContenidoBloque>
            </BloqueMetrica>
          )}

          {bCadencia && (
            <BloqueMetrica etiqueta="Cadencia" onTap={() => tocar('Cadencia')}>
              <ContenidoBloque actual={bCadencia.actual}>
                <Cabecera>
                  <Cifra valor={String(Math.round(bCadencia.actual!))} unidad="pasos/min" />
                  <DeltaVolumen b={bCadencia} />
                </Cabecera>
                <Linea puntos={bCadencia.puntos} formato={(v) => String(Math.round(v))} />
              </ContenidoBloque>
            </BloqueMetrica>
          )}
        </div>
      </Pantalla>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL BLOQUE — etiqueta versalita + contenido, tappable entero (§ transversal
// «cifra → días → sesión»). `div role="button"` y no `<button>`: dentro va el
// toggle «solo rodajes», que también es interactivo, y un botón real no puede
// anidar otro.
// ---------------------------------------------------------------------------

const RESET: CSSProperties = { all: 'unset', boxSizing: 'border-box', cursor: 'pointer' };

function BloqueMetrica({ etiqueta, onTap, children }: { etiqueta: string; onTap: () => void; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: S.m, cursor: 'pointer' }}
    >
      <Etiqueta>{etiqueta}</Etiqueta>
      {children}
    </div>
  );
}

function Cabecera({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>{children}</div>;
}

function Cifra({ valor, unidad }: { valor: string; unidad?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 800,
          fontSize: 44,
          lineHeight: 0.9,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.03em',
          color: 'var(--twin-fg)',
        }}
      >
        {valor}
      </span>
      {unidad && (
        <span style={{ font: '600 11px/1.2 var(--twin-font-sans)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>
          {unidad}
        </span>
      )}
    </span>
  );
}

function Delta({ mejor, texto }: { mejor: boolean | null; texto: string }) {
  const tono = mejor == null ? 'var(--twin-muted)' : mejor ? 'var(--twin-ok)' : 'var(--twin-warning)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontFamily: 'var(--twin-font-mono)', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: tono }}>
        {texto}
      </span>
      <span style={{ font: '600 10px/1.2 var(--twin-font-sans)', letterSpacing: '0.06em', color: 'var(--twin-faint)' }}>vs. anterior</span>
    </span>
  );
}

/**
 * El volumen y las tasas NO juzgan (mismo criterio que `DeltaVolumen` en
 * `analiticas-correr`): correr más, más rápido de media o con más desnivel no es bueno ni malo
 * por sí mismo — mezclar series y rodajes en la misma media es justo por lo que el bloque de
 * ritmo lleva su nota en vez de un veredicto. Solo el VO₂máx tiene un sentido fisiológico
 * inequívoco (`DeltaVo2`, más abajo).
 */
function DeltaVolumen({ b }: { b: BloqueDatos }) {
  if (b.actual == null || b.anterior == null || b.anterior === 0) return null;
  const cambio = b.actual / b.anterior - 1;
  const signo = cambio > 0 ? '+' : cambio < 0 ? '−' : '';
  return <Delta mejor={null} texto={`${signo}${Math.abs(Math.round(cambio * 100))}%`} />;
}

function DeltaVo2({ b }: { b: BloqueDatos }) {
  if (b.actual == null || b.anterior == null) return null;
  const diff = Math.round(b.actual - b.anterior);
  if (diff === 0) return <Delta mejor={null} texto="0" />;
  return <Delta mejor={diff > 0} texto={`${diff > 0 ? '+' : '−'}${Math.abs(diff)}`} />;
}

function NotaFina({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--twin-font-mono)', fontWeight: 600, fontSize: 10, letterSpacing: '0.03em', color: 'var(--twin-faint)' }}>
      {children}
    </span>
  );
}

function SinDatoEnVentana({ children }: { children: ReactNode }) {
  return (
    <span style={{ font: '500 12.5px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{children}</span>
  );
}

/**
 * Guarda única del §7 para los siete bloques: si `actual` es null, el bloque no pinta un
 * guion en el sitio de la cifra — pinta la frase de por qué no hay dato. Hoy es defensivo (en
 * los tres escenarios de este mockup, cada campo con bloque visible SIEMPRE tiene `actual`
 * salvo el ritmo «solo rodajes» en una ventana sin ningún rodaje), pero es la guarda correcta:
 * es la MISMA regla que ya aplica al bloque entero de VO₂máx/cadencia, solo que aquí opera
 * dentro de un bloque que sí existe.
 */
function ContenidoBloque({ actual, motivo = 'Sin datos en este periodo', children }: { actual: number | null; motivo?: string; children: ReactNode }) {
  if (actual == null) return <SinDatoEnVentana>{motivo}</SinDatoEnVentana>;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// EL SELECTOR DE PERIODO — cuatro pastillas, afecta a los siete bloques a la vez
// ---------------------------------------------------------------------------

function SelectorPeriodo({ activo, onPick }: { activo: PeriodoId; onPick: (p: PeriodoId) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: `0 ${S.l}px` }}>
      {PERIODOS.map((p) => {
        const on = p.id === activo;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            aria-pressed={on}
            style={{
              ...RESET,
              flex: 1,
              textAlign: 'center',
              padding: '8px 0',
              borderRadius: R.pill,
              border: on ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
              background: on ? 'var(--twin-fg)' : 'transparent',
              color: on ? 'var(--twin-bg)' : 'var(--twin-muted)',
              font: '700 12.5px/1.2 var(--twin-font-sans)',
            }}
          >
            {p.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** Todo/Solo rodajes — solo se ofrece cuando la fuente separa (`puedeSepararRodajes`). */
function TogglePequeno({ activo, onPick }: { activo: boolean; onPick: (v: boolean) => void }) {
  const opciones: { id: boolean; etiqueta: string }[] = [
    { id: false, etiqueta: 'Todo' },
    { id: true, etiqueta: 'Solo rodajes' },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: R.pill, background: 'var(--twin-surface)' }}>
      {opciones.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={(e) => {
            // Sin esto, el toque también dispara el `onTap` del bloque que lo envuelve.
            e.stopPropagation();
            onPick(o.id);
          }}
          aria-pressed={o.id === activo}
          style={{
            ...RESET,
            padding: '4px 10px',
            borderRadius: R.pill,
            background: o.id === activo ? 'var(--twin-surface-elevated)' : 'transparent',
            font: '600 10.5px/1 var(--twin-font-sans)',
            color: o.id === activo ? 'var(--twin-fg)' : 'var(--twin-faint)',
          }}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UN ENTERO GRANDE CON PUNTO DE MILLAR — local a esta pantalla
// ---------------------------------------------------------------------------
//
// `kit-composicion/formato.ts` no tiene todavía un formateador de enteros grandes (su
// `distancia()` espera METROS de una carrera, no un total de temporada ya en km) y esta tanda
// no toca el kit compartido (agentes en paralelo sobre él). Mismo criterio que `metrosTexto` en
// `vivo-dobles/data.ts`: a mano y no `toLocaleString('es-ES')`, que no agrupa un número de
// cuatro cifras. Candidato a subir a `formato.ts` como canónico si otra pantalla lo necesita.
