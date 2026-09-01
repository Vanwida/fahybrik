'use client';

// LA TARJETA, dibujada a los píxeles REALES de la story y escalada para caber
// en el lienzo del doble. Un `fontSize: 32` son 32 píxeles del PNG que se
// exporta: si se maquetara a tamaño de maqueta, los cuerpos de letra que se
// están juzgando aquí no serían los que acaban en Instagram.
//
// LO QUE SE EXPORTA ES SOLO LA TARJETA, no el lienzo entero. El vídeo que se ve
// detrás es simulación del doble: en la app, el atleta abre Instagram, elige su
// vídeo y la tarjeta le llega como pegatina — la mueve y la escala él, que es
// justo lo que hoy hace a mano con una captura de pantalla, pero legible.
//
// ---------------------------------------------------------------------------
// LAS REGLAS DE OFICIO DE ESTA TARJETA (la primera versión era una tabla)
// ---------------------------------------------------------------------------
//
// 1. EL ACENTO SOLO DONDE SIGNIFICA ALGO: el chip del día, la mejor repetición
//    y el punto del club. Un acento en cada raya y cada número es un acento en
//    ninguna parte — la primera versión subrayaba todos los bloques en naranja
//    y el ojo no sabía a qué ir.
// 2. LA VOZ ES LA DISPLAY ITÁLICA PESADA en mayúsculas — la misma del wordmark.
//    Todo lo demás es cuerpo neutro o mono para números. Tres voces, no cinco.
// 3. LOS DATOS SE VEN, NO SOLO SE LEEN: cada parcial lleva detrás una barra
//    proporcional a su tiempo. La historia de la tanda (aguantó, se cayó,
//    cerró fuerte) aparece sin leer un solo número.
// 4. Los números tabulares (fontVariantNumeric) para que las columnas de
//    tiempos queden a plomo — con dígitos proporcionales, 1:11 y 1:28 no miden
//    lo mismo y la columna baila.

import type { CSSProperties } from 'react';
import type { ReactNode } from 'react';
import {
  GASTO, STORY, TARJETA, columnasDeSerie, recortar, recortarSemana,
  type BloqueCartel, type Club, type DiaSemana, type Entreno, type Repeticion, type Semana,
} from './modelo';

export type Marca = 'club' | 'sin';

const FUENTE = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif";
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";

const TINTA = '#ffffff';
const TINTA_TENUE = 'rgba(255,255,255,0.56)';
const TINTA_DEBIL = 'rgba(255,255,255,0.34)';
const HAIRLINE = 'rgba(255,255,255,0.12)';

/**
 * El lienzo de la story con el vídeo simulado y la tarjeta posada donde el
 * atleta la pondría. Esto entero solo existe en el doble, para poder juzgar si
 * la tarjeta estorba: lo que sale de la app es `Tarjeta`.
 */
export function Lienzo({ escala, children }: { escala: number; children: ReactNode }) {
  return (
    <div
      style={{
        width: STORY.ancho * escala,
        height: STORY.alto * escala,
        overflow: 'hidden',
        borderRadius: 14,
        position: 'relative',
        flex: '0 0 auto',
      }}
    >
      <div
        style={{
          width: STORY.ancho,
          height: STORY.alto,
          transform: `scale(${escala})`,
          transformOrigin: 'top left',
          position: 'relative',
          fontFamily: FUENTE,
        }}
      >
        <VideoSimulado />
        <ChromeInstagram />
        {/* Posada abajo a la izquierda: en un vídeo de gimnasio la persona está
            arriba y en el centro, y ahí abajo es donde el ojo ya busca el pie.
            En Instagram el atleta la arrastra donde quiera — es una pegatina,
            no un fondo. */}
        <div style={{ position: 'absolute', left: 84, bottom: 400 }}>{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** ESTO es lo que se exporta: la tarjeta sola, con transparencia alrededor. */
export function Tarjeta({ entreno, marca, club }: { entreno: Entreno; marca: Marca; club: Club }) {
  const conClub = marca === 'club';
  const { visibles, ocultos } = recortar(entreno.bloques, {
    conClub,
    conResultado: !!entreno.resultado,
  });
  // Sin club, el acento del significado es el blanco a plena tinta: la mejor
  // repetición y el chip del día siguen destacando por peso, no por color.
  const acento = conClub ? club.acento : TINTA;

  return (
    <div
      style={{
        width: TARJETA.ancho,
        maxHeight: TARJETA.altoMaximo,
        boxSizing: 'border-box',
        padding: TARJETA.padding,
        borderRadius: 32,
        fontFamily: FUENTE,
        color: TINTA,
        // SU PROPIO FONDO — por eso el vídeo de alrededor se queda intacto.
        // Casi opaco a propósito: un cristal muy transparente se lee bien sobre
        // un vídeo oscuro y desaparece sobre uno claro, y el atleta no puede
        // saber cuál le va a tocar antes de publicar. El degradado vertical es
        // sutil de verdad: da volumen sin que se note como «efecto».
        background: 'linear-gradient(178deg, rgba(19,19,21,0.94) 0%, rgba(9,9,10,0.93) 100%)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 30px 70px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <Titular chip={entreno.dia} titulo={entreno.titulo} acento={acento} />
      {entreno.resultado && <Resultado filas={entreno.resultado} />}
      <Lista bloques={visibles} ocultos={ocultos} acento={acento} />
      {conClub && <PieDeClub club={club} />}
    </div>
  );
}

function Titular({ chip, titulo, acento }: { chip: string; titulo: string; acento: string }) {
  const chipOscuro = '#0b0b0c';
  return (
    <div>
      {/* El día como CHIP lleno, no como una palabrita suelta: es el primer
          golpe de marca de la tarjeta y el ancla del acento. Inclinado como la
          display — el chip pertenece a la misma voz que el título. */}
      <span
        style={{
          display: 'inline-block',
          padding: '7px 18px 9px',
          borderRadius: 10,
          background: acento,
          color: chipOscuro,
          fontFamily: MONO,
          fontSize: 22,
          fontWeight: 800,
          fontStyle: 'italic',
          letterSpacing: 3,
          textTransform: 'uppercase',
          transform: 'skewX(-6deg)',
        }}
      >
        {chip}
      </span>
      {/* La display itálica pesada EN MAYÚSCULAS es la voz del wordmark, y en
          una tarjeta pequeña el título es la tarjeta. */}
      <div
        style={{
          fontSize: 60,
          lineHeight: 0.96,
          fontWeight: 900,
          fontStyle: 'italic',
          letterSpacing: -1,
          textTransform: 'uppercase',
          marginTop: 16,
        }}
      >
        {titulo}
      </div>
    </div>
  );
}

/**
 * Solo en la tarjeta de DESPUÉS: lo que pasó, antes del detalle. Números
 * grandes en blanco — el acento no se gasta aquí, se reserva para la mejor
 * repetición de abajo, que es el dato con historia.
 */
function Resultado({ filas }: { filas: { etiqueta: string; valor: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 44, alignItems: 'baseline' }}>
      {filas.map((f) => (
        <div key={f.etiqueta}>
          <div
            style={{
              fontSize: 17,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: TINTA_TENUE,
              fontFamily: MONO,
            }}
          >
            {f.etiqueta}
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 900,
              fontStyle: 'italic',
              letterSpacing: -0.5,
              marginTop: 3,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {f.valor}
          </div>
        </div>
      ))}
    </div>
  );
}

function Lista({ bloques, ocultos, acento }: { bloques: BloqueCartel[]; ocultos: number; acento: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {bloques.map((b, i) => (
        <div key={i}>
          {/* Cabecera de bloque en voz baja: separa, no compite. El acento ya
              no subraya cada bloque — eso era ruido. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 14,
              paddingBottom: 9,
              borderBottom: `1px solid ${HAIRLINE}`,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 21,
                fontWeight: 800,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: TINTA_TENUE,
              }}
            >
              {b.titulo}
            </span>
            {b.pauta && <span style={{ fontSize: 20, color: TINTA_DEBIL, fontFamily: MONO }}>{b.pauta}</span>}
          </div>
          {/* La forma del bloque decide el cuerpo: movimientos distintos se
              leen en lista, la misma cosa repetida se lee en parciales. */}
          {b.clase === 'serie' ? (
            <Parciales reps={b.repeticiones} acento={acento} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {b.ejercicios.map((e, j) => (
                <div key={j} style={fila}>
                  <span style={{ fontSize: 31, fontWeight: 650 }}>{e.nombre}</span>
                  {/* Lo hecho manda sobre lo prescrito: en la tarjeta de después
                      interesa el número que salió, no el que tocaba. Y lo hecho
                      va a plena tinta — es el dato; la dosis prevista es
                      contexto y va tenue. */}
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      fontFamily: MONO,
                      fontVariantNumeric: 'tabular-nums',
                      color: e.hecho ? TINTA : TINTA_TENUE,
                    }}
                  >
                    {e.hecho ?? e.dosis}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* NUNCA se recorta en silencio: quien lo ve tiene que saber que hubo más. */}
      {ocultos > 0 && (
        <div style={{ fontSize: 23, fontFamily: MONO, color: TINTA_DEBIL, letterSpacing: 1.5 }}>
          + {ocultos} más
        </div>
      )}
    </div>
  );
}

/** `1:26` → 86 s. Devuelve null si el texto no es un tiempo — sin barra. */
function segundos(valor: string): number | null {
  const m = /^(\d+):(\d{2})(?:\.\d+)?$/.exec(valor.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * LOS PARCIALES — el dato por el que se comparte una tanda de series.
 *
 * Cada repetición lleva DETRÁS una barra proporcional a su tiempo: la historia
 * de la tanda (aguantó el ritmo, se cayó a la cuarta, cerró fuerte) se VE antes
 * de leer un solo número. Es lo que un promedio no puede contar, y es la razón
 * de que el bloque de serie exista como forma propia.
 *
 * La barra corta es la rápida — la barra ES el tiempo. La mejor va en acento,
 * y se marca sola a partir del dato: no la elige nadie.
 *
 * En dos columnas cuando pasan de cinco: ocho parciales en una sola columna
 * convierten la tarjeta de esquina en un cartel, que es lo que no queremos.
 */
function Parciales({ reps, acento }: { reps: Repeticion[]; acento: string }) {
  const cols = columnasDeSerie(reps.length);
  // SI TODAS LAS REPETICIONES SON LO MISMO, el ritmo de cada una sobra: la
  // cabecera ya dice «400 m» y el ritmo medio está arriba, así que repetirlo
  // ocho veces solo roba sitio al número que la gente enseña. Cuando las
  // repeticiones no son iguales (una pirámide, por ejemplo), el ritmo es lo
  // único que las hace comparables y entonces sí sale.
  const mismaCosa = reps.every((r) => !r.etiqueta);

  // Las barras se normalizan al rango REAL de la tanda: entre 1:22 y 1:28 hay
  // un 7% de diferencia, invisible a escala absoluta. El suelo del 30% evita
  // que la mejor desaparezca — la barra informa, no engaña: el orden y las
  // proporciones relativas se conservan.
  const tiempos = reps.map((r) => segundos(r.valor));
  const conBarra = tiempos.every((t): t is number => t != null) && reps.length > 1;
  const min = conBarra ? Math.min(...(tiempos as number[])) : 0;
  const max = conBarra ? Math.max(...(tiempos as number[])) : 1;
  const ancho = (t: number) => (max === min ? 72 : 30 + 70 * ((t - min) / (max - min)));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        columnGap: 30,
        rowGap: 10,
      }}
    >
      {reps.map((r, i) => {
        const t = tiempos[i];
        return (
          <div key={i} style={{ position: 'relative', height: 44 }}>
            {/* La barra, debajo del texto. Redondeada solo lo justo: es un
                dato, no una píldora decorativa. */}
            {conBarra && t != null && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 4,
                  bottom: 4,
                  width: `${ancho(t)}%`,
                  borderRadius: 7,
                  background: r.mejor ? acento : 'rgba(255,255,255,0.10)',
                  opacity: r.mejor ? 0.28 : 1,
                }}
              />
            )}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                height: '100%',
                padding: '0 12px',
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  fontFamily: MONO,
                  color: TINTA_DEBIL,
                  minWidth: 24,
                  alignSelf: 'center',
                }}
              >
                {i + 1}
              </span>
              {r.etiqueta && (
                <span style={{ fontSize: 24, color: TINTA_TENUE, alignSelf: 'center' }}>{r.etiqueta}</span>
              )}
              <span
                style={{
                  fontSize: 33,
                  fontWeight: 800,
                  fontFamily: MONO,
                  fontVariantNumeric: 'tabular-nums',
                  marginLeft: 'auto',
                  alignSelf: 'center',
                  color: r.mejor ? acento : TINTA,
                }}
              >
                {r.valor}
              </span>
              {!mismaCosa && r.ritmo && (
                <span
                  style={{
                    fontSize: 22,
                    fontFamily: MONO,
                    color: TINTA_TENUE,
                    minWidth: 62,
                    textAlign: 'right',
                    alignSelf: 'center',
                  }}
                >
                  {r.ritmo}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ---------------------------------------------------------------------------
// LA TARJETA SEMANAL
// ---------------------------------------------------------------------------

/**
 * La semana entera, en la misma voz que el entreno. SIN fila de números
 * grandes a propósito: la tira de días YA es el titular visual — cuatro
 * cuadros llenos se ven como cuatro sesiones sin leer nada — y los totales
 * viajan en la cabecera de la lista. Con héroe además de tira, lista y club,
 * la tarjeta no baja de 780 px y deja de ser una firma de esquina (medido).
 */
export function TarjetaSemana({ semana, marca, club }: { semana: Semana; marca: Marca; club: Club }) {
  const conClub = marca === 'club';
  const { visibles, ocultos } = recortarSemana(semana, { conClub });
  const acento = conClub ? club.acento : TINTA;

  return (
    <div
      style={{
        width: TARJETA.ancho,
        maxHeight: TARJETA.altoMaximo,
        boxSizing: 'border-box',
        padding: TARJETA.padding,
        borderRadius: 32,
        fontFamily: FUENTE,
        color: TINTA,
        background: 'linear-gradient(178deg, rgba(19,19,21,0.94) 0%, rgba(9,9,10,0.93) 100%)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 30px 70px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <Titular chip={semana.etiqueta} titulo={semana.titulo} acento={acento} />
      <TiraDias dias={semana.dias} acento={acento} />

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 14,
            paddingBottom: 9,
            borderBottom: `1px solid ${HAIRLINE}`,
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: TINTA_TENUE }}>
            Sesiones
          </span>
          <span style={{ fontSize: 20, color: TINTA_DEBIL, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
            {semana.totales}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {visibles.map((sesion, i) => (
            <div key={i} style={fila}>
              <span style={{ fontSize: 20, fontFamily: MONO, color: TINTA_DEBIL, minWidth: 26 }}>{sesion.dia}</span>
              <span style={{ fontSize: 31, fontWeight: 650, marginRight: 'auto' }}>{sesion.titulo}</span>
              {sesion.dato && (
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    fontFamily: MONO,
                    fontVariantNumeric: 'tabular-nums',
                    color: TINTA_TENUE,
                  }}
                >
                  {sesion.dato}
                </span>
              )}
            </div>
          ))}
        </div>
        {ocultos > 0 && (
          <div style={{ fontSize: 23, fontFamily: MONO, color: TINTA_DEBIL, letterSpacing: 1.5, marginTop: 12 }}>
            + {ocultos} más
          </div>
        )}
      </div>

      {conClub && <PieDeClub club={club} />}
    </div>
  );
}

/**
 * LOS SIETE DÍAS, con la letra dentro del cuadro. Tres estados y los tres son
 * verdad: lleno = entrenado (el acento va aquí — es el dato de la tarjeta),
 * aro = descanso prescrito, apagado = saltado. El saltado NO se disfraza de
 * descanso: la tira cuenta la semana que fue, y el atleta decide si la
 * comparte — no la tarjeta por él.
 */
function TiraDias({ dias, acento }: { dias: DiaSemana[]; acento: string }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {dias.map((d, i) => {
        const hecho = d.estado === 'hecho';
        const saltado = d.estado === 'saltado';
        return (
          <span
            key={i}
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: MONO,
              fontSize: 23,
              fontWeight: 800,
              boxSizing: 'border-box',
              background: hecho ? acento : saltado ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: d.estado === 'descanso' ? `1.5px solid ${HAIRLINE}` : 'none',
              color: hecho ? '#0b0b0c' : saltado ? TINTA_DEBIL : TINTA_TENUE,
            }}
          >
            {d.letra}
          </span>
        );
      })}
    </div>
  );
}

function PieDeClub({ club }: { club: Club }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingTop: 18,
        borderTop: `1px solid ${HAIRLINE}`,
        height: GASTO.club,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 5, background: club.acento, flex: '0 0 auto' }} />
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: TINTA_TENUE }}>
        {club.nombre}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

const fila: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 20,
};

/**
 * El vídeo del atleta. Simulado — en la app lo elige él dentro de Instagram.
 *
 * A PROPÓSITO ES UN VÍDEO CLARO: un box con luz de mediodía es el caso duro, el
 * que mata cualquier cosa escrita en blanco. Si la tarjeta se lee aquí, se lee
 * sobre lo que sea. Probarla contra un vídeo oscuro no probaría nada.
 *
 * Pared y suelo, no un degradado abstracto: el ojo tiene que leer «esto es un
 * gimnasio grabado» para poder juzgar si la tarjeta estorba a un vídeo real.
 */
function VideoSimulado() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: [
          // La luz de la ventana, alta y a la derecha.
          'radial-gradient(90% 55% at 66% 20%, rgba(255,252,244,0.9) 0%, rgba(255,252,244,0) 60%)',
          // Pared arriba, línea de horizonte, suelo abajo.
          'linear-gradient(180deg, #e9e2d6 0%, #d9cfc0 54%, #b3a897 61.5%, #7a7266 62%, #55504a 78%, #3c3833 100%)',
        ].join(', '),
      }}
    />
  );
}

/**
 * Lo que Instagram pinta encima: su cabecera y su barra de responder. No es
 * decoración del doble — es la razón por la que la tarjeta se posa donde se
 * posa, y sin verlo no se puede juzgar si estorba.
 */
function ChromeInstagram() {
  return (
    <>
      <Franja alto={250} arriba texto="cabecera de Instagram" />
      <Franja alto={320} texto="responder · compartir" />
    </>
  );
}

function Franja({ alto, arriba, texto }: { alto: number; arriba?: boolean; texto: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: alto,
        ...(arriba ? { top: 0 } : { bottom: 0 }),
        background: arriba
          ? 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%)'
          : 'linear-gradient(0deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%)',
        display: 'flex',
        alignItems: arriba ? 'flex-start' : 'flex-end',
        justifyContent: 'center',
        padding: 26,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontFamily: MONO,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: 2,
          border: '1px dashed rgba(255,255,255,0.3)',
          borderRadius: 8,
          padding: '6px 14px',
        }}
      >
        {texto}
      </span>
    </div>
  );
}
