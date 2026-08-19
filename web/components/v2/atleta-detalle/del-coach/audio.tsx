'use client';

// LA NOTA DE VOZ DEL COMUNICADO — grabarla, oírla y quitarla.
//
// Es el «ahora te hago un podcast» del entrenador, dentro del producto. Sobre
// una gráfica marcada, la explicación hablada es la mitad del valor de un
// feedback, y hoy vive en un audio de WhatsApp que nadie vuelve a encontrar.
//
// Va en el PIE y no dentro de un tipo concreto: cualquiera de los cinco puede
// llevarla. Un protocolo de día de carrera explicado en voz vale tanto como una
// nota de zonas.
//
// SE SUBE AL CORTAR, NO AL PUBLICAR. Así el fallo (sin cobertura, formato raro,
// almacén caído) se ve cuando todavía se puede volver a grabar, y no cuando el
// coach acaba de pulsar «Publicar» con el comunicado entero escrito.
//
// El grabador es el MISMO del chat (`components/v2/chat/voice-recorder`), que
// entrega WAV a propósito: cada navegador escupe un formato distinto y el
// WebM/Opus de Chrome no se reproduce en iOS — o sea, no sonaría en el móvil del
// atleta, que es para quien se graba.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { MAX_AUDIO_SECONDS } from '@fahybrid/shared/domain/coach-communications';
import { canRecordVoice, VoiceRecorder, VoiceRecordingError } from '@/components/v2/chat/voice-recorder';
import { pedirSubidaDeAudio } from './api';

/** Cada cuánto se refresca el contador mientras se graba, en ms. */
const TICK_MS = 200;

export type AudioDelComunicado = { url: string; seconds: number } | null;

/** «2:14». La duración se escribe igual aquí y en el móvil del atleta. */
export function duracionCorta(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * ¿Se puede grabar en este navegador? El servidor no lo sabe —no hay `window`—
 * así que responde que no y el cliente corrige tras montar. Por
 * `useSyncExternalStore` y no por un estado con efecto: es exactamente para lo
 * que existe, y preguntarlo a pelo rompe la hidratación.
 */
function usePuedeGrabar(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => canRecordVoice(),
    () => false,
  );
}

export function GrabadorDeAudio({
  audio,
  onCambiar,
  disabled = false,
}: {
  audio: AudioDelComunicado;
  onCambiar: (audio: AudioDelComunicado) => void;
  disabled?: boolean;
}) {
  const puedeGrabar = usePuedeGrabar();
  const [grabador, setGrabador] = useState<VoiceRecorder | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const empezar = useCallback(async () => {
    const nuevo = new VoiceRecorder();
    setFallo(null);
    try {
      await nuevo.start();
      setSegundos(0);
      setGrabador(nuevo);
    } catch (err) {
      setFallo(
        err instanceof VoiceRecordingError ? err.message : 'No se pudo empezar a grabar.',
      );
    }
  }, []);

  const cortar = useCallback(async () => {
    if (!grabador) return;
    setGrabador(null);
    const grabado = await grabador.stop();
    if (!grabado) return; // pulsación fugaz: no hay nada que subir
    if (grabado.duration_ms / 1000 > MAX_AUDIO_SECONDS) {
      setFallo('Esa nota de voz es demasiado larga. Córtala en un par de ideas.');
      return;
    }

    setSubiendo(true);
    const destino = await pedirSubidaDeAudio(grabado.file);
    if (!destino.ok) {
      setSubiendo(false);
      setFallo(destino.mensaje);
      return;
    }
    // El Content-Type debe ser EXACTAMENTE el firmado o el almacén rechaza el PUT.
    const puesto = await fetch(destino.data.upload_url, {
      method: 'PUT',
      headers: { 'content-type': destino.data.content_type },
      body: grabado.file,
    }).catch(() => null);
    setSubiendo(false);
    if (!puesto?.ok) {
      setFallo('No se pudo subir el audio. Revisa la conexión y vuelve a grabarlo.');
      return;
    }
    onCambiar({ url: destino.data.audio_url, seconds: Math.round(grabado.duration_ms / 1000) });
  }, [grabador, onCambiar]);

  const descartar = useCallback(() => {
    grabador?.cancel();
    setGrabador(null);
  }, [grabador]);

  // Contador de la grabación. Se para solo al desmontar o al cortar.
  useEffect(() => {
    if (!grabador) return;
    const id = setInterval(() => setSegundos(grabador.elapsedSeconds), TICK_MS);
    return () => clearInterval(id);
  }, [grabador]);

  // Si el compositor se cierra en mitad de una grabación, soltar el micrófono:
  // el piloto de la pestaña se quedaría encendido.
  useEffect(() => () => grabador?.cancel(), [grabador]);

  if (!puedeGrabar && audio == null) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {grabador ? (
        <BarraGrabando segundos={segundos} onDescartar={descartar} onCortar={() => void cortar()} />
      ) : audio ? (
        <Reproductor audio={audio} onQuitar={() => onCambiar(null)} disabled={disabled} />
      ) : (
        <button
          type="button"
          onClick={() => void empezar()}
          disabled={disabled || subiendo}
          className="v2-focus inline-flex h-9 w-fit items-center gap-2 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-3 text-label font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)] disabled:opacity-50"
        >
          <MIcon name={subiendo ? 'progress_activity' : 'mic'} size={16} className={subiendo ? 'animate-spin' : undefined} />
          {subiendo ? 'Guardando el audio…' : 'Grabar una nota de voz'}
        </button>
      )}

      {fallo ? (
        <p className="text-label font-medium text-[color:var(--v2-danger)]">{fallo}</p>
      ) : null}
    </div>
  );
}

/** Mientras se graba, el botón cede el sitio: no se puede grabar y repasar el
 *  audio a la vez, y dejar los dos controles sólo confunde. */
function BarraGrabando({
  segundos,
  onDescartar,
  onCortar,
}: {
  segundos: number;
  onDescartar: () => void;
  onCortar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[color:var(--v2-danger)] motion-reduce:animate-none"
      />
      <span className="text-label font-semibold text-[color:var(--v2-fg)]">Grabando</span>
      <span className="v2-num text-label tabular-nums text-[color:var(--v2-muted)]" role="timer">
        {duracionCorta(segundos)}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onDescartar}
        className="v2-focus rounded-[var(--v2-r-pill)] px-2 py-1 text-label font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
      >
        Descartar
      </button>
      <button
        type="button"
        onClick={onCortar}
        className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3 text-label font-bold text-[color:var(--v2-accent-fg)]"
      >
        <MIcon name="stop" size={15} filled />
        Listo
      </button>
    </div>
  );
}

/** El audio ya subido: se oye antes de publicarlo. Mandar a ciegas algo que no
 *  se puede deshacer es de las pocas cosas que no se pueden arreglar después. */
function Reproductor({
  audio,
  onQuitar,
  disabled,
}: {
  audio: NonNullable<AudioDelComunicado>;
  onQuitar: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
      <MIcon name="graphic_eq" size={17} className="shrink-0 text-[color:var(--v2-accent)]" />
      <span className="text-label font-semibold text-[color:var(--v2-fg)]">Nota de voz</span>
      <span className="v2-num text-label tabular-nums text-[color:var(--v2-muted)]">
        {duracionCorta(audio.seconds)}
      </span>
      <audio src={audio.url} controls preload="none" className="h-8 min-w-0 flex-1" />
      <button
        type="button"
        onClick={onQuitar}
        disabled={disabled}
        aria-label="Quitar la nota de voz"
        className="v2-focus shrink-0 rounded-[var(--v2-r-2xs)] p-1 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)] disabled:opacity-50"
      >
        <MIcon name="close" size={16} />
      </button>
    </div>
  );
}
