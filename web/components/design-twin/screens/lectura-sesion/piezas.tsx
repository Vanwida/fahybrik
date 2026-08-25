'use client';

// LAS PIEZAS DE LA LECTURA DE UNA SESIÓN — cabecera, totales, desglose bloque
// a bloque y lo que dijo el atleta. La gráfica del pulso vive en `grafica.tsx`
// y el mapa se REUTILIZA de `lectura-carrera` (mismo `PuntoRuta`, mismo
// dibujo: no se redibuja un segundo mapa para esta pantalla, §0 del
// CONTRATO-UI).
//
// TIPOGRAFÍA Y CONTRASTE (§4.1/§4.2 del CONTRATO-UI, card 124): nada por
// debajo de 15 pt, y todo texto nuevo vive sobre uno de DOS fondos SÓLIDOS
// conocidos — `--twin-surface` (la tarjeta de cada sección) o
// `--twin-surface-elevated` (una fila dentro de ella) — para que el contraste
// se pueda MEDIR con número y no a ojo contra un ambiente que cambia de zona.
// `--twin-faint` queda fuera de esta pantalla a propósito: mide 2,8–4,0:1
// contra las dos superficies (verificado, ver el informe) y el §4.2 exige
// 4,5:1 — es la razón por la que las fuentes pequeñas de la versión anterior
// «no se leían», no el tamaño solo.

import type { CSSProperties, ReactNode } from 'react';
import { colorZona, zonaDe } from '../../kit-vivo';
import { IconoTipoEntreno, PuntoModalidad } from '../../kit';
import { SIGNO_POR, type Modalidad as ModalidadKit } from '../../datos-reales';
import { conMillar, distancia, esDecimal, kg, reloj, ritmo500, ritmoKm, toneladas } from '../../kit-composicion/formato';
import { R, S } from '../../kit-composicion/tokens';
import { DIFICULTAD_LABEL } from '../post-entreno/piezas';
import type { SegmentoZona } from '../post-entreno/piezas';
import type { RecapSeries } from '@fahybrid/shared/domain/recap-sticker';
import {
  distanciaTotalDeSesion,
  resultadoDeSesion,
  ritmoMedioDeCorrer,
  tipoDeSesion,
  type Bloque,
  type DichoAtleta,
  type GrupoDesglose,
  type Sesion,
} from './modelo';
import { ritmoDeCorrer, ritmoDeErgometro } from './modelo';
import type { TwinAppearance } from '../../types';

// ---------------------------------------------------------------------------
// La tarjeta de sección — el «tarjeta por sección» de la referencia, y el
// fondo SÓLIDO contra el que se mide todo lo de dentro.
// ---------------------------------------------------------------------------

export function TarjetaSeccion({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 24,
            fontWeight: 800,
            fontStyle: 'italic',
            fontFamily: 'var(--twin-font-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--twin-fg)',
          }}
        >
          {titulo}
        </span>
        {nota && <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--twin-muted)' }}>{nota}</span>}
      </div>
      <div style={{ borderRadius: R.l, background: 'var(--twin-surface)', border: '1px solid var(--twin-hairline)', padding: 14 }}>
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CAPA 1 · CABECERA — el tipo de entreno de un vistazo, y la ventana horaria
// ---------------------------------------------------------------------------

/** «07:15» + 2822 s → «08:02». Sin AM/PM: el reloj de 24 h de toda la app. */
function sumarHora(horaInicio: string, segundos: number): string {
  const [h, m] = horaInicio.split(':').map(Number);
  const totalMin = (h ?? 0) * 60 + (m ?? 0) + Math.round(segundos / 60);
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function Cabecera({ sesion, appearance }: { sesion: Sesion; appearance: TwinAppearance }) {
  const tipo = tipoDeSesion(sesion);
  const fin = sumarHora(sesion.horaInicio, sesion.duracionTotalS);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderRadius: R.l,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        padding: 14,
      }}
    >
      <IconoTipoEntreno tipo={tipo} appearance={appearance} size={52} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            fontStyle: 'italic',
            fontFamily: 'var(--twin-font-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--twin-fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sesion.titulo}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--twin-muted)' }}>
          {`${sesion.cuando} · ${sesion.horaInicio}–${fin}`}
        </span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: sesion.completitud.completa ? 'var(--twin-muted)' : 'var(--twin-warning)',
          }}
        >
          {sesion.completitud.completa ? 'Sesión completa' : `Hecha a medias · ${sesion.completitud.nota}`}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CAPA 2 · LOS TOTALES — la foto de la sesión entera, en rejilla
// ---------------------------------------------------------------------------

const COLOR_POR_MODO: Record<string, string> = {
  corriendo: 'var(--twin-modality-hyrox)',
  remando: 'var(--twin-modality-support)',
  'en ski erg': 'var(--twin-modality-support)',
  'en bici': 'var(--twin-modality-support)',
};

function CeldaTotal({
  etiqueta,
  valor,
  unidad,
  color = 'var(--twin-fg)',
  sub,
}: {
  etiqueta: string;
  valor: string;
  unidad?: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span
        style={{
          fontSize: 15,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--twin-muted)',
        }}
      >
        {etiqueta}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 34,
            fontWeight: 700,
            fontFamily: 'var(--twin-font-mono)',
            fontVariantNumeric: 'tabular-nums',
            color,
          }}
        >
          {valor}
        </span>
        {unidad && <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--twin-muted)' }}>{unidad}</span>}
      </div>
      {sub && (
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--twin-muted)', lineHeight: 1.3 }}>{sub}</span>
      )}
    </div>
  );
}

/**
 * LA REJILLA — solo entra el recuadro que tiene dato (§7). El «resultado»
 * propio del formato (volumen de fuerza, rondas de un AMRAP/EMOM) entra justo
 * después del tiempo, cuando el tiempo no cuenta ya toda la historia
 * (`resultadoDeSesion` devuelve null en for-time/libre a propósito).
 */
export function RejillaTotales({ sesion }: { sesion: Sesion }) {
  const celdas: ReactNode[] = [<CeldaTotal key="tiempo" etiqueta="Tiempo" valor={reloj(sesion.duracionTotalS)} />];

  const resultado = resultadoDeSesion(sesion);
  if (resultado?.clase === 'fuerza') {
    celdas.push(
      <CeldaTotal
        key="volumen"
        etiqueta="Volumen"
        valor={toneladas(resultado.volumenKg)}
        unidad="t"
        sub={
          resultado.serieMasPesada
            ? `${resultado.serieMasPesada.etiqueta} · ${kg(resultado.serieMasPesada.kg)} × ${resultado.serieMasPesada.reps}`
            : undefined
        }
      />,
    );
  } else if (resultado?.clase === 'amrap') {
    celdas.push(
      <CeldaTotal
        key="rondas"
        etiqueta="Rondas"
        valor={String(resultado.rondas)}
        unidad="rondas"
        sub={resultado.repsExtra > 0 ? `+ ${resultado.repsExtra} reps sueltas` : undefined}
      />,
    );
  } else if (resultado?.clase === 'emom') {
    const completo = resultado.rondasCompletadas === resultado.rondasPrescritas;
    celdas.push(
      <CeldaTotal
        key="rondas"
        etiqueta="Rondas completadas"
        valor={`${resultado.rondasCompletadas} de ${resultado.rondasPrescritas}`}
        color={completo ? 'var(--twin-ok)' : 'var(--twin-fg)'}
      />,
    );
  }

  // La distancia total: solo con UNA modalidad midiéndola (card 124). Si hay
  // más de una, este recuadro no existe y cada bloque enseña la suya.
  const distanciaTotal = distanciaTotalDeSesion(sesion);
  if (distanciaTotal) {
    const color = COLOR_POR_MODO[distanciaTotal.modo] ?? 'var(--twin-fg)';
    celdas.push(
      <CeldaTotal key="distancia" etiqueta="Distancia" valor={distancia(distanciaTotal.metros)} sub={distanciaTotal.modo} color={color} />,
    );
    if (distanciaTotal.ritmoSkm != null) {
      const ritmo = distanciaTotal.modo === 'corriendo' ? ritmoKm(distanciaTotal.ritmoSkm) : ritmo500(distanciaTotal.ritmoSkm);
      celdas.push(<CeldaTotal key="ritmo" etiqueta="Ritmo medio" valor={ritmo} color={color} />);
    }
  } else {
    // Sin un total de distancia (porque se midió en más de una modalidad), el
    // ritmo de CORRER sigue siendo una pregunta con respuesta propia: no
    // mezcla nada, solo mira los tramos de correr.
    const ritmoCorrer = ritmoMedioDeCorrer(sesion);
    if (ritmoCorrer != null) {
      celdas.push(
        <CeldaTotal key="ritmo-correr" etiqueta="Ritmo medio" valor={ritmoKm(ritmoCorrer)} sub="corriendo" color="var(--twin-modality-hyrox)" />,
      );
    }
  }

  if (sesion.fcMediaPpm != null) {
    celdas.push(
      <CeldaTotal
        key="fc-media"
        etiqueta="FC media"
        valor={String(Math.round(sesion.fcMediaPpm))}
        unidad="ppm"
        color={colorZona(zonaDe(sesion.fcMediaPpm))}
      />,
    );
  }
  if (sesion.fcMaxPpm != null) {
    celdas.push(
      <CeldaTotal
        key="fc-max"
        etiqueta="FC máxima"
        valor={String(Math.round(sesion.fcMaxPpm))}
        unidad="ppm"
        color={colorZona(zonaDe(sesion.fcMaxPpm))}
      />,
    );
  }
  if (sesion.kcal != null) {
    celdas.push(<CeldaTotal key="kcal" etiqueta="Calorías" valor={String(sesion.kcal)} unidad="kcal" />);
  }

  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 18, columnGap: 16 }}>{celdas}</div>;
}

// ---------------------------------------------------------------------------
// CAPA 5 · EL DESGLOSE — un bloque, en su propio idioma
// ---------------------------------------------------------------------------

const PUNTO_DE: Record<Bloque['modalidad'], ModalidadKit> = {
  correr: 'run',
  ergometro: 'row',
  fuerza: 'strength',
  funcional: 'functional',
};

const LABEL_COLUMNA: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--twin-muted)',
};

/** La cabecera de columnas del desglose — una vez, no en cada fila (§ misma
 *  razón que antes: repetirla en cada fila sería la misma etiqueta gritando
 *  una vez por bloque). Ahora con las DOS columnas, no solo la del pulso. */
export function CabeceraDesglose() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
      <span style={LABEL_COLUMNA}>Ejercicio</span>
      <span style={{ ...LABEL_COLUMNA, width: 46, textAlign: 'right' }}>ppm</span>
    </div>
  );
}

/**
 * LA DISTANCIA, EN LA UNIDAD EN QUE SE PRESCRIBE — no la del formateador
 * genérico de la app (`distancia()`, que corta en 1.000 m y da dos decimales:
 * sirve a los TOTALES de arriba, que son una medida agregada, y a otras diez
 * pantallas; no a esta fila, que es la DOSIS de un bloque).
 *
 * Nadie piensa un kilómetro prescrito en decimales: por debajo de 2 km se lee
 * en METROS, con el separador de millar de siempre («1.000 m», «40 m»); de ahí
 * para arriba, un decimal y sin el cero de relleno («2,5 km», pero «10 km»,
 * nunca «10,0 km»). Corrección de Alex, 20-ago, sobre esta pantalla.
 */
function distanciaPrescrita(metros: number): string {
  if (metros < 2000) return `${conMillar(Math.round(metros))} m`;
  const conDecimal = esDecimal(metros / 1000, 1);
  return `${conDecimal.endsWith(',0') ? conDecimal.slice(0, -2) : conDecimal} km`;
}

/**
 * UNA RONDA DEL DESGLOSE — cabecera solo si el grupo la trae (§ agrupado sale
 * del dato). El tiempo de la ronda se suma SOLO si todos sus bloques tienen
 * duración: sumar 6 de 8 y llamarlo «el tiempo de la ronda» sería inventar
 * los dos que faltan.
 */
export function GrupoRonda({ grupo, rondas }: { grupo: GrupoDesglose; rondas: number }) {
  const duracionCompleta = grupo.bloques.every((b) => b.duracionS != null);
  const duracionRondaS = duracionCompleta ? grupo.bloques.reduce((acc, b) => acc + b.duracionS!, 0) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {grupo.ronda != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 2px 0' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--twin-muted)', letterSpacing: '0.1em' }}>
            {`Ronda ${grupo.ronda} de ${rondas}`}
          </span>
          {duracionRondaS != null && (
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--twin-font-mono)', color: 'var(--twin-fg)' }}>
              {reloj(duracionRondaS)}
            </span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {grupo.bloques.map((b, i) => (
          <FilaBloque key={i} bloque={b} />
        ))}
      </div>
    </div>
  );
}

export function FilaBloque({ bloque }: { bloque: Bloque }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S.s,
        padding: '10px 10px',
        borderRadius: R.m,
        background: 'var(--twin-surface-elevated)',
      }}
    >
      <PuntoModalidad modalidad={PUNTO_DE[bloque.modalidad]} size={10} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            fontFamily: 'var(--twin-font-sans)',
            color: 'var(--twin-fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {bloque.etiqueta}
        </span>
        {/* Sin cronómetro propio, el tramo no lleva duración: no se inventa (§7). */}
        {bloque.duracionS != null && (
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--twin-muted)' }}>{reloj(bloque.duracionS)}</span>
        )}
        {/* El descanso es del tramo, no de la modalidad: una estación de
            simulacro lo cierra igual que un ejercicio de fuerza. */}
        {bloque.descansoS != null && (
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--twin-muted)' }}>
            {`descanso ${reloj(bloque.descansoS)}`}
          </span>
        )}
      </div>
      <MedidaDeBloque bloque={bloque} />
      {/* La FC media, solo si se midió. Nunca un hueco con unidad al lado. */}
      {bloque.fcMediaPpm != null && (
        <span
          style={{
            width: 42,
            textAlign: 'right',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'var(--twin-font-mono)',
            color: 'var(--twin-muted)',
          }}
        >
          {bloque.fcMediaPpm}
        </span>
      )}
    </div>
  );
}

/**
 * LA MEDIDA, en el idioma de la modalidad — y ninguna si no se midió.
 *
 * «Donde no hay metros no hay recuadro de metros ni de ritmo» (card 118): esta
 * función es literalmente esa regla. Sin distancia no hay ritmo que derivar —
 * `ritmoDeCorrer`/`ritmoDeErgometro` ya devuelven null en ese caso—, y sin
 * series ni reps/metros el bloque no pinta nada aquí: solo su nombre, su
 * duración y su pulso, que es exactamente lo que SÍ se sabe de él.
 */
function MedidaDeBloque({ bloque }: { bloque: Bloque }) {
  if (bloque.modalidad === 'correr') {
    if (bloque.distanciaM == null) return null;
    const ritmo = ritmoDeCorrer(bloque);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--twin-font-mono)', color: 'var(--twin-fg)' }}>
          {distanciaPrescrita(bloque.distanciaM)}
        </span>
        {ritmo != null && <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--twin-muted)' }}>{ritmoKm(ritmo)}</span>}
      </div>
    );
  }

  if (bloque.modalidad === 'ergometro') {
    if (bloque.distanciaM == null) return null;
    const ritmo = ritmoDeErgometro(bloque);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--twin-font-mono)', color: 'var(--twin-fg)' }}>
          {distanciaPrescrita(bloque.distanciaM)}
        </span>
        {ritmo != null && <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--twin-muted)' }}>{ritmo500(ritmo)}</span>}
      </div>
    );
  }

  if (bloque.modalidad === 'fuerza') {
    if (!bloque.grupos || bloque.grupos.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        {bloque.grupos.map((g, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
            {g.aproximacion ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--twin-accent)' }}>Aproximación</span>
            ) : null}
            <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--twin-font-mono)', color: 'var(--twin-fg)' }}>
              {`${g.sets}${SIGNO_POR}${g.reps}`}
            </span>
            {/* Peso corporal: no hay carga que enseñar, y no se escribe «— kg». */}
            {g.kg != null && <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--twin-muted)' }}>{kg(g.kg)}</span>}
          </div>
        ))}
      </div>
    );
  }

  // Funcional: reps o metros — nunca los dos, y ninguno si no se contó.
  if (bloque.reps == null && bloque.metros == null) return null;
  return (
    <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--twin-font-mono)', color: 'var(--twin-fg)' }}>
      {bloque.reps != null ? `${bloque.reps} reps` : distanciaPrescrita(bloque.metros!)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CAPA 6 · LAS ZONAS — barra propia (no la de `post-entreno`: su leyenda va a
// 9 px y su tarjeta es translúcida contra el ambiente, dos cosas que este
// contrato ya no permite).
// ---------------------------------------------------------------------------

export function BarraZonasSesion({ segmentos }: { segmentos: SegmentoZona[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden' }}>
        {segmentos.map((s, i) => (
          <div
            key={i}
            style={{ width: `${Math.max(0, s.pct)}%`, background: s.zona ? `var(--twin-z${s.zona})` : 'var(--twin-hairline-strong)' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: segmentos.length > 1 ? 'space-between' : 'flex-start' }}>
        {segmentos.map((s, i) => (
          <span
            key={i}
            style={{
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'var(--twin-font-mono)',
              fontVariantNumeric: 'tabular-nums',
              color: s.zona ? `var(--twin-z${s.zona})` : 'var(--twin-muted)',
            }}
          >
            {s.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CAPA 7 · LO QUE DIJO EL ATLETA — la única capa que no es una medida
// ---------------------------------------------------------------------------

export function TarjetaSerie({ series }: { series: RecapSeries }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 12px 10px',
        borderRadius: R.m,
        background: 'var(--twin-surface-elevated)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            fontStyle: 'italic',
            color: 'var(--twin-fg)',
          }}
        >
          {series.label}
        </span>
        {series.pauta && (
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--twin-muted)' }}>{series.pauta}</span>
        )}
      </div>
      <Parciales series={series} />
    </div>
  );
}

export function Parciales({ series }: { series: RecapSeries }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: series.columns === 2 ? '1fr 1fr' : '1fr',
        gap: '6px 14px',
      }}
    >
      {series.splits.map((s) => {
        const tiempo = s.duration_s != null ? reloj(s.duration_s) : null;
        const ritmo = s.pace_s_per_km != null ? ritmoKm(s.pace_s_per_km) : null;
        return (
          <div
            key={s.index}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 8,
              padding: '4px 0',
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--twin-muted)' }}>{s.index}</span>
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                fontFamily: 'var(--twin-font-mono)',
                color: 'var(--twin-fg)',
              }}
            >
              {tiempo ?? '—'}
            </span>
            {ritmo && (
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: 'var(--twin-font-mono)',
                  color: s.is_best ? 'var(--twin-ok)' : 'var(--twin-muted)',
                }}
              >
                {ritmo}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AccionesRecap({
  completa,
  onLog,
}: {
  completa: boolean;
  onLog: (l: string) => void;
}) {
  return (
    <div data-acciones="abajo" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <FilaAccion
        titulo={completa ? 'Completado' : 'Hecha a medias'}
        nota="El entreno ya está guardado."
        onClick={() => onLog(completa ? 'Completado' : 'Hecha a medias')}
      />
      <FilaAccion
        titulo="Técnica"
        nota="Vídeo, consejos y la nota de tu coach."
        onClick={() => onLog('Técnica')}
      />
      <FilaAccion
        titulo="Captura"
        nota="Garmin, Strava, Concept2… la leemos por ti."
        onClick={() => onLog('Captura')}
      />
    </div>
  );
}

function FilaAccion({ titulo, nota, onClick }: { titulo: string; nota: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: 'none',
        border: '1px solid var(--twin-hairline)',
        background: 'var(--twin-surface)',
        borderRadius: R.m,
        padding: '12px 14px',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 800, fontStyle: 'italic', color: 'var(--twin-fg)' }}>{titulo}</span>
      <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--twin-muted)' }}>{nota}</span>
    </button>
  );
}

export function LoQueDijoElAtleta({ dicho }: { dicho: DichoAtleta | undefined }) {
  if (!dicho) return null;
  const piezas = [
    dicho.rpe != null ? `Esfuerzo ${dicho.rpe}` : null,
    dicho.dificultad ? DIFICULTAD_LABEL[dicho.dificultad] : null,
  ].filter((p): p is string => p != null);
  if (piezas.length === 0 && !dicho.molestia) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {piezas.length > 0 && (
        <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--twin-fg)' }}>{piezas.join(' · ')}</span>
      )}
      {dicho.molestia && (
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--twin-warning)' }}>
          {`Molestia en ${dicho.molestia.area}${dicho.molestia.nota ? ` · ${dicho.molestia.nota}` : ''}`}
        </span>
      )}
    </div>
  );
}
