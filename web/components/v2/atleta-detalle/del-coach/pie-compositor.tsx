'use client';

// EL PIE DEL COMPOSITOR — el botón que lo manda, y qué va a pasar cuando lo pulses.
//
// Vive aparte porque es lo que NO cambia con el tipo: los cinco formularios se
// mandan igual. Y porque es donde se dicen las tres cosas que el coach necesita
// antes de pulsar — qué falla, qué se pierde si cierra, y qué le va a pasar al
// atleta — que juntas pesan tanto como el formulario entero.

import { Button } from '@/components/v2/ui';
import { GrabadorDeAudio, type AudioDelComunicado } from './audio';

/** Qué está mandándose ahora mismo. Null = nada en vuelo. */
export type Enviando = 'publicar' | 'borrador' | 'plantilla' | null;

/** El acto principal, que lo decide el modo del compositor y sus destinatarios. */
export interface AccionPrincipal {
  texto: string;
  hacer: () => Promise<void> | void;
  clave: Exclude<Enviando, null>;
}

export function PieCompositor({
  fallo,
  faltaAlgo,
  confirmarCierre,
  onSeguirEscribiendo,
  onCerrarYPerder,
  principal,
  ofreceBorrador,
  onGuardarBorrador,
  enviando,
  nota,
  audio,
  onAudio,
}: {
  /** Lo que contestó el servidor cuando dijo que no. */
  fallo: string | null;
  /** Hay campos sin rellenar y ya se han enseñado en rojo. */
  faltaAlgo: boolean;
  confirmarCierre: boolean;
  onSeguirEscribiendo: () => void;
  onCerrarYPerder: () => void;
  principal: AccionPrincipal;
  /** Publicar admite además dejarlo guardado sin publicar. */
  ofreceBorrador: boolean;
  onGuardarBorrador: () => void;
  enviando: Enviando;
  /** Qué le va a pasar al atleta con ESTE borrador. */
  nota: string;
  /** La nota de voz ya subida, si la hay. Vale para los cinco tipos. */
  audio: AudioDelComunicado;
  onAudio: (audio: AudioDelComunicado) => void;
}) {
  const ocupado = enviando !== null;

  return (
    <div className="flex shrink-0 flex-col gap-2.5 border-t border-v2-border p-4 sm:p-5">
      {fallo ? (
        <p role="alert" className="t-body-sm font-medium text-v2-danger">
          {fallo}
        </p>
      ) : null}
      {faltaAlgo ? <p className="t-body-sm text-v2-danger">Falta algo por rellenar. Los campos en rojo dicen qué.</p> : null}
      {confirmarCierre ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-ctl bg-v2-warn-soft px-3 py-2">
          <span className="t-body-sm text-v2-fg">Tienes cosas escritas. Si cierras ahora se pierden.</span>
          <span className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={onSeguirEscribiendo}>
              Seguir escribiendo
            </Button>
            <Button size="sm" variant="destructive" onClick={onCerrarYPerder}>
              Cerrar y perderlo
            </Button>
          </span>
        </div>
      ) : null}

      {/* La voz va ARRIBA del botón que publica: es lo último que el coach añade
          y lo primero que tiene que poder repasar antes de mandarlo. */}
      <GrabadorDeAudio audio={audio} onCambiar={onAudio} disabled={ocupado} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="lg"
          onClick={() => void principal.hacer()}
          disabled={ocupado && enviando !== principal.clave}
          loading={enviando === principal.clave}
        >
          {principal.texto}
        </Button>
        {ofreceBorrador ? (
          <Button
            size="lg"
            onClick={onGuardarBorrador}
            disabled={ocupado && enviando !== 'borrador'}
            loading={enviando === 'borrador'}
          >
            Guardar sin publicar
          </Button>
        ) : null}
        <span className="min-w-[200px] flex-1 t-meta text-v2-muted">{nota}</span>
      </div>
    </div>
  );
}
