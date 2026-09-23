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
import { MAX_AUDIO_SECONDS } from '@fahybrid/shared/domain/coach-communications';
import { canRecordVoice, VoiceRecorder, VoiceRecordingError } from '@/components/v2/chat/voice-recorder';
import { pedirSubidaDeAudio } from './api';
import { AudioLines, Mic, Square, X } from 'lucide-react';
import { Button, IconButton } from '@/components/v2/ui';

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
        <Button size="sm" icon={Mic} loading={subiendo} disabled={disabled} onClick={() => void empezar()} className="w-fit">
          {subiendo ? 'Guardando el audio…' : 'Grabar una nota de voz'}
        </Button>
      )}

      {fallo ? (
        <p className="t-meta font-medium text-[color:var(--v2-danger)]">{fallo}</p>
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
    <div className="flex flex-wrap items-center gap-2.5 rounded-ctl border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[color:var(--v2-danger)] motion-reduce:animate-none"
      />
      <span className="t-meta font-semibold text-[color:var(--v2-fg)]">Grabando</span>
      <span className="t-tnum t-meta tabular-nums text-[color:var(--v2-muted)]" role="timer">
        {duracionCorta(segundos)}
      </span>
      <span className="flex-1" />
      <Button size="sm" variant="ghost" onClick={onDescartar}>
        Descartar
      </Button>
      <Button size="sm" icon={Square} onClick={onCortar}>
        Listo
      </Button>
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
    <div className="flex flex-wrap items-center gap-2.5 rounded-ctl border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2">
      <AudioLines aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-v2-muted" />
      <span className="t-meta font-semibold text-[color:var(--v2-fg)]">Nota de voz</span>
      <span className="t-tnum t-meta tabular-nums text-[color:var(--v2-muted)]">
        {duracionCorta(audio.seconds)}
      </span>
      <audio src={audio.url} controls preload="none" className="h-8 min-w-0 flex-1" />
      <IconButton icon={X} size="sm" onClick={onQuitar} disabled={disabled} label="Quitar la nota de voz" className="hover:text-v2-danger" />
    </div>
  );
}
