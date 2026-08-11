'use client';

// LA FICHA ENTERA — la salida de la clave cuando no cabe.
//
// Es la misma hoja que el atleta ya conoce del plan (`ExerciseDetailView`), con
// sus secciones en el MISMO orden: el vídeo, la prescripción, los consejos, la
// descripción y la nota del coach. No se reordena para este momento: una hoja
// que cambia de forma según desde dónde se abra deja de reconocerse, y esta
// propuesta va de la línea en vivo, no de rehacer la ficha.
//
// Lo que sí es distinto es CÓMO se llega: hasta ahora solo se abría desde el
// plan, antes de entrenar. Aquí se abre desde la clave, con la barra al lado, y
// por eso lo primero que se lee al abrirla es el nombre y su dosis.

import { useState } from 'react';
import { Hairline, Label, RAD, SP } from '../../kit';
import { useTimeline } from '../../sim';
import { TiraPlan, pastillaRir } from '../vivo-fuerza/atoms';
import type { Prescripcion } from '../vivo-fuerza/data';
import type { Contenido } from './data';

/** Lo que tarda la hoja en subir. Una hoja de iOS, ni instantánea ni lenta. */
const SUBIDA_MS = 320;

/** Un frame: deja pintar la hoja abajo antes de arrancar la transición. */
const ARRANQUE_MS = 16;

/** Cuánto del lienzo ocupa como mucho: por debajo se sigue viendo la serie. */
const ALTO_MAXIMO = '76%';

function Seccion({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <Label size={10}>{titulo}</Label>
      <span style={{ font: '500 14px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{texto}</span>
    </div>
  );
}

export function FichaEjercicio({
  p,
  contenido,
  onCerrar,
  onVideo,
}: {
  p: Prescripcion;
  contenido: Contenido;
  onCerrar: () => void;
  onVideo: () => void;
}) {
  const [arriba, setArriba] = useState(false);
  useTimeline([{ at: ARRANQUE_MS, run: () => setArriba(true) }]);

  const pastilla = pastillaRir(p.rir);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* El velo también cierra: es lo que hace un iOS, y con la barra en las
          manos el gesto barato importa más que en el sofá. */}
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar la ficha"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--twin-scrim)',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          opacity: arriba ? 1 : 0,
          transition: `opacity ${SUBIDA_MS}ms ease-out`,
        }}
      />
      <div
        role="dialog"
        aria-label={`Ficha de ${p.ejercicio}`}
        style={{
          position: 'relative',
          maxHeight: ALTO_MAXIMO,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--twin-bg)',
          borderRadius: `${RAD.xl}px ${RAD.xl}px 0 0`,
          borderTop: '1px solid var(--twin-hairline-strong)',
          boxShadow: 'var(--twin-shadow-hero)',
          transform: arriba ? 'translateY(0)' : 'translateY(100%)',
          transition: `transform ${SUBIDA_MS}ms ease-out`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: `${SP.s}px 0 0` }}>
          <div
            aria-hidden
            style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--twin-hairline-strong)' }}
          />
        </div>

        <div
          className="twin-scroll"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: SP.xl,
            padding: `${SP.l}px ${SP.l}px ${SP.xl}px`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s }}>
            <span className="t-headline-m">{p.ejercicio}</span>
            <TiraPlan p={p} />
            {pastilla && <span className="tw-pill">{pastilla}</span>}
          </div>

          {contenido.video && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
              <button
                type="button"
                onClick={onVideo}
                className="tw-btn-secondary"
                style={{ width: '100%', height: 44, fontSize: 14 }}
              >
                Ver el vídeo
              </button>
              <span
                style={{ font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}
              >
                El cronómetro se pausa mientras lo miras.
              </span>
            </div>
          )}

          {contenido.consejos && (
            <>
              <Hairline />
              <Seccion titulo="Consejos" texto={contenido.consejos} />
            </>
          )}

          {contenido.descripcion && (
            <>
              <Hairline />
              <Seccion titulo="Descripción" texto={contenido.descripcion} />
            </>
          )}

          {contenido.nota && (
            <>
              <Hairline />
              <Seccion titulo="Nota de tu coach" texto={contenido.nota} />
            </>
          )}

          <button
            type="button"
            onClick={onCerrar}
            className="tw-btn-secondary"
            style={{ width: '100%', height: 44, fontSize: 14 }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
