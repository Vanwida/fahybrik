// Grabar una nota de voz en el navegador y entregarla como WAV.
//
// POR QUÉ WAV Y NO LO QUE DA `MediaRecorder`
// ------------------------------------------
// `MediaRecorder` es el camino corto, pero cada navegador escupe un formato
// distinto: Safari da audio/mp4 y Chrome da WebM/Opus. Y WebM/Opus NO se puede
// reproducir en iOS — AVFoundation no lo decodifica. O sea que el camino corto
// significa que la nota de voz que Pablo graba desde Chrome no suena en el móvil
// del atleta. Que es exactamente para quien la graba.
//
// El WAV es PCM crudo: lo abre todo, iOS incluido, y no depende de qué códec haya
// decidido soportar hoy cada navegador. A 16 kHz en mono son unos 2 MB por minuto,
// que para voz sobra y cabe de largo en el tope de 25 MB.
//
// Se captura con un AudioWorklet (fuera del hilo principal, sin el
// ScriptProcessorNode que está deprecado) cargado desde un blob, para no tener
// que servir un fichero suelto solo para esto.

/** Frecuencia que se le pide al contexto de audio. Voz inteligible con el mínimo
 *  peso. Si el navegador impone otra, se escribe la real en la cabecera y el
 *  fichero sigue siendo correcto — solo pesa más. */
const TARGET_SAMPLE_RATE = 16_000;

const PROCESSOR_NAME = 'fahybrid-pcm-collector';

/** El worklet: recoge cada bloque de muestras del micrófono y lo manda al hilo
 *  principal. Va como texto porque se carga desde un blob. */
const PROCESSOR_SOURCE = `
class PCMCollector extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      // Copia: el buffer que da el motor se reutiliza en el siguiente ciclo.
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(PROCESSOR_NAME)}, PCMCollector);
`;

export class VoiceRecordingError extends Error {
  readonly code: 'permission_denied' | 'unsupported' | 'failed';
  constructor(code: VoiceRecordingError['code'], message: string) {
    super(message);
    this.name = 'VoiceRecordingError';
    this.code = code;
  }
}

export interface VoiceRecording {
  file: File;
  duration_ms: number;
}

/** ¿Se puede grabar aquí? Sin esto, el botón del micro aparecería en contextos
 *  donde no hay API (http sin TLS, navegadores viejos) y no haría nada. */
export function canRecordVoice(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.AudioWorkletNode === 'function' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleCount = 0;

  /** Pide el micrófono y empieza a grabar. Lanza `VoiceRecordingError` con el
   *  motivo ya escrito para pantalla. */
  async start(): Promise<void> {
    if (!canRecordVoice()) {
      throw new VoiceRecordingError('unsupported', 'Este navegador no permite grabar audio.');
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      throw new VoiceRecordingError(
        'permission_denied',
        'No hay acceso al micrófono. Permítelo en el navegador y vuelve a intentarlo.',
      );
    }

    try {
      this.context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      const blobUrl = URL.createObjectURL(
        new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' }),
      );
      try {
        await this.context.audioWorklet.addModule(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      const source = this.context.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.context, PROCESSOR_NAME);
      this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        this.chunks.push(event.data);
        this.sampleCount += event.data.length;
      };
      source.connect(this.node);
      // El worklet no produce salida, pero sin destino algunos navegadores no
      // arrancan el grafo. Va a un nodo mudo para no oírse a uno mismo.
      const silence = this.context.createGain();
      silence.gain.value = 0;
      this.node.connect(silence).connect(this.context.destination);
    } catch {
      this.releaseHardware();
      throw new VoiceRecordingError('failed', 'No se pudo iniciar la grabación.');
    }
  }

  /** Cuántos segundos lleva grabados. Para el contador en pantalla. */
  get elapsedSeconds(): number {
    const rate = this.context?.sampleRate ?? TARGET_SAMPLE_RATE;
    return this.sampleCount / rate;
  }

  /** Corta y devuelve el WAV. Null si no se capturó nada (pulsación fugaz). */
  async stop(): Promise<VoiceRecording | null> {
    const rate = this.context?.sampleRate ?? TARGET_SAMPLE_RATE;
    const samples = flatten(this.chunks, this.sampleCount);
    this.releaseHardware();
    if (samples.length === 0) return null;
    const wav = encodeWav(samples, rate);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return {
      file: new File([wav], `nota-de-voz-${stamp}.wav`, { type: 'audio/wav' }),
      duration_ms: Math.round((samples.length / rate) * 1000),
    };
  }

  /** Tira la grabación y suelta el micrófono. */
  cancel(): void {
    this.releaseHardware();
  }

  private releaseHardware(): void {
    this.chunks = [];
    this.sampleCount = 0;
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }
    // El piloto del micrófono se apaga al parar CADA pista, no al cerrar el
    // contexto. Olvidarlo deja el indicador de grabación encendido en la pestaña.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}

/** Concatena los bloques capturados en un único buffer. */
function flatten(chunks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Envuelve las muestras en un WAV mono de 16 bits: cabecera RIFF de 44 bytes más
 * los datos. La frecuencia que se escribe es la REAL del contexto, no la que se
 * pidió — si el navegador impuso otra y guardáramos la pedida, el audio sonaría
 * acelerado o ralentizado.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true); // tamaño del fichero menos los 8 primeros bytes
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // longitud del bloque fmt
  view.setUint16(20, 1, true); // 1 = PCM sin comprimir
  view.setUint16(22, 1, true); // canales: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // bytes por segundo
  view.setUint16(32, bytesPerSample, true); // alineación de bloque
  view.setUint16(34, 8 * bytesPerSample, true); // bits por muestra
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    // Recorta antes de escalar: una muestra fuera de [-1, 1] daría la vuelta al
    // entero de 16 bits y sonaría como un chasquido.
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }
  return buffer;
}
