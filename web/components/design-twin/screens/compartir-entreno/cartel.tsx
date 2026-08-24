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

import type { CSSProperties } from 'react';
import { GASTO, STORY, TARJETA, recortar, type BloqueCartel, type Club, type Entreno } from './modelo';

export type Marca = 'club' | 'sin';

const FUENTE = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif";
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";

const TINTA = '#ffffff';
const TINTA_TENUE = 'rgba(255,255,255,0.60)';

/**
 * El lienzo de la story con el vídeo simulado y la tarjeta posada donde el
 * atleta la pondría. Esto entero solo existe en el doble, para poder juzgar si
 * la tarjeta estorba: lo que sale de la app es `Tarjeta`.
 */
export function Lienzo({
  entreno,
  marca,
  club,
  escala,
}: {
  entreno: Entreno;
  marca: Marca;
  club: Club;
  escala: number;
}) {
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
        <div style={{ position: 'absolute', left: 84, bottom: 400 }}>
          <Tarjeta entreno={entreno} marca={marca} club={club} />
        </div>
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
  const acento = conClub ? club.acento : TINTA;

  return (
    <div
      style={{
        width: TARJETA.ancho,
        maxHeight: TARJETA.altoMaximo,
        boxSizing: 'border-box',
        padding: TARJETA.padding,
        borderRadius: 28,
        fontFamily: FUENTE,
        color: TINTA,
        // SU PROPIO FONDO — por eso el vídeo de alrededor se queda intacto.
        // Casi opaco a propósito: un cristal muy transparente se lee bien sobre
        // un vídeo oscuro y desaparece sobre uno claro, y el atleta no puede
        // saber cuál le va a tocar antes de publicar.
        background: 'rgba(10,10,11,0.88)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
      }}
    >
      <Titular entreno={entreno} acento={acento} />
      {entreno.resultado && <Resultado filas={entreno.resultado} acento={acento} />}
      <Lista bloques={visibles} ocultos={ocultos} acento={acento} />
      {conClub && <PieDeClub club={club} />}
    </div>
  );
}

function Titular({ entreno, acento }: { entreno: Entreno; acento: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: acento,
        }}
      >
        {entreno.dia}
      </div>
      {/* La cursiva pesada es la voz de la marca y lo que se lee de un vistazo:
          en una tarjeta pequeña, el título ES la tarjeta. */}
      <div
        style={{
          fontSize: 62,
          lineHeight: 0.98,
          fontWeight: 900,
          fontStyle: 'italic',
          letterSpacing: -1.5,
          marginTop: 8,
        }}
      >
        {entreno.titulo}
      </div>
    </div>
  );
}

/** Solo en la tarjeta de DESPUÉS: lo que pasó, antes del detalle. */
function Resultado({ filas, acento }: { filas: { etiqueta: string; valor: string }[]; acento: string }) {
  return (
    <div style={{ display: 'flex', gap: 40 }}>
      {filas.map((f) => (
        <div key={f.etiqueta}>
          <div style={{ fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: TINTA_TENUE, fontFamily: MONO }}>
            {f.etiqueta}
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, fontStyle: 'italic', marginTop: 2, color: acento }}>
            {f.valor}
          </div>
        </div>
      ))}
    </div>
  );
}

function Lista({ bloques, ocultos, acento }: { bloques: BloqueCartel[]; ocultos: number; acento: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {bloques.map((b, i) => (
        <div key={i}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              paddingBottom: 8,
              borderBottom: `2px solid ${acento}`,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase' }}>
              {b.titulo}
            </span>
            {b.pauta && <span style={{ fontSize: 21, color: TINTA_TENUE, fontFamily: MONO }}>{b.pauta}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {b.ejercicios.map((e, j) => (
              <div key={j} style={fila}>
                <span style={{ fontSize: 32, fontWeight: 600 }}>{e.nombre}</span>
                {/* Lo hecho manda sobre lo prescrito: en la tarjeta de después
                    interesa el número que salió, no el que tocaba. */}
                <span style={{ fontSize: 30, fontWeight: 700, fontFamily: MONO, color: e.hecho ? acento : TINTA_TENUE }}>
                  {e.hecho ?? e.dosis}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* NUNCA se recorta en silencio: quien lo ve tiene que saber que hubo más. */}
      {ocultos > 0 && (
        <div style={{ fontSize: 24, fontFamily: MONO, color: TINTA_TENUE, letterSpacing: 1.5 }}>
          + {ocultos} más
        </div>
      )}
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
        borderTop: '1px solid rgba(255,255,255,0.14)',
        height: GASTO.club,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ width: 11, height: 11, borderRadius: 6, background: club.acento, flex: '0 0 auto' }} />
      <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
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
 */
function VideoSimulado() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(115% 75% at 58% 30%, #f7f3ec 0%, #d8cfc0 34%, #9b9284 66%, #5c554d 100%)',
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
