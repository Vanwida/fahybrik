// EL LOCALIZADOR DEL VÍDEO DE UN EJERCICIO — dos formas y ninguna más.
//
// Lo que fija este suite es el contrato: una columna (`video_url`), sin campo de
// «tipo», y una sola validación que aplican por igual el alta, la edición y el campo
// del panel. Si alguien vuelve a estrechar el campo a YouTube, o afloja la forma del
// vídeo propio hasta dejar entrar una URL de fuera, aquí se cae.

import { describe, expect, it } from 'vitest';
import {
  EXERCISE_VIDEO_EXTENSIONS,
  EXERCISE_VIDEO_MAX_BYTES,
  EXERCISE_VIDEO_MAX_DURATION_SECONDS,
  EXERCISE_VIDEO_URL_MAX,
  exerciseStreamHlsUrl,
  exerciseStreamIframeUrl,
  exerciseStreamRefFrom,
  exerciseVideoSchema,
  isValidExerciseVideo,
  parseExerciseVideo,
} from '@/lib/exercises/video-source';
import { CHAT_ATTACHMENT_MAX_BYTES } from '@/lib/chat/schema';

// Un par (code, uid) con la forma EXACTA que emite Cloudflare Stream — copiados de una
// subida real, no inventados: el code es el subdominio de la cuenta y el uid son 32
// hexadecimales.
const CODE = 'y1njxqklp26mzz8v';
const UID = '64d93f4fa041b608bff0de740f7ad28d';
const HLS = `https://customer-${CODE}.cloudflarestream.com/${UID}/manifest/video.m3u8`;

describe('las dos formas válidas', () => {
  it('lee un enlace de YouTube y lo canoniza', () => {
    const v = parseExerciseVideo('https://youtu.be/dQw4w9WgXcQ');
    expect(v).toMatchObject({ kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  });

  it('conserva la verticalidad de un Short', () => {
    expect(parseExerciseVideo('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.url).toBe(
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    );
  });

  it('lee el vídeo propio y saca de él la cuenta y el vídeo', () => {
    expect(parseExerciseVideo(HLS)).toEqual({ kind: 'stream', code: CODE, uid: UID, url: HLS });
  });

  it('canoniza de forma idempotente: guardar y volver a guardar da lo mismo', () => {
    const once = parseExerciseVideo('https://youtu.be/dQw4w9WgXcQ')!.url;
    expect(parseExerciseVideo(once)!.url).toBe(once);
    expect(parseExerciseVideo(HLS)!.url).toBe(HLS);
  });

  it('un localizador de Stream cabe de sobra en la columna', () => {
    expect(HLS.length).toBeLessThanOrEqual(EXERCISE_VIDEO_URL_MAX);
  });
});

// Cloudflare reparte VARIAS direcciones del mismo vídeo, y del panel se copia la del
// reproductor o la de «watch», no la del manifiesto. Rechazárselas al entrenador sería
// decirle «eso no es un vídeo» sobre un vídeo suyo que sí lo es.
describe('las otras direcciones del MISMO vídeo se aceptan y se canonizan', () => {
  it.each([
    ['el reproductor incrustado', `https://customer-${CODE}.cloudflarestream.com/${UID}/iframe`],
    ['la página de ver', `https://customer-${CODE}.cloudflarestream.com/${UID}/watch`],
    ['el manifiesto DASH', `https://customer-${CODE}.cloudflarestream.com/${UID}/manifest/video.mpd`],
  ])('%s acaba en el manifiesto HLS', (_caso, entrada) => {
    expect(parseExerciseVideo(entrada)?.url).toBe(HLS);
  });

  it('el host no distingue mayúsculas', () => {
    expect(parseExerciseVideo(HLS.replace('customer-', 'CUSTOMER-'))?.url).toBe(HLS);
  });
});

describe('todo lo demás se rechaza', () => {
  it.each([
    ['otro host de vídeo', 'https://vimeo.com/123'],
    ['un fichero en un dominio ajeno', 'https://ejemplo.com/video.mp4'],
    [
      'un dominio que sólo TERMINA pareciéndose',
      `https://customer-${CODE}.cloudflarestream.com.ejemplo.tld/${UID}/manifest/video.m3u8`,
    ],
    ['sin cifrar', HLS.replace('https://', 'http://')],
    ['un subdominio de Cloudflare que no es de una cuenta', `https://cloudflarestream.com/${UID}/manifest/video.m3u8`],
    ['un id que no son 32 hexadecimales', `https://customer-${CODE}.cloudflarestream.com/abc123/manifest/video.m3u8`],
    ['un id con un carácter que no es hexadecimal', `https://customer-${CODE}.cloudflarestream.com/${UID.slice(0, 31)}z/manifest/video.m3u8`],
    ['un camino que no es del vídeo', `https://customer-${CODE}.cloudflarestream.com/${UID}/thumbnails/thumbnail.jpg`],
    ['el vídeo sin camino', `https://customer-${CODE}.cloudflarestream.com/${UID}`],
    ['texto suelto', 'el vídeo se lo paso por whatsapp'],
  ])('rechaza %s', (_caso, entrada) => {
    expect(isValidExerciseVideo(entrada)).toBe(false);
    expect(() => exerciseVideoSchema.parse(entrada)).toThrow();
  });

  // El fichero alojado por nosotros y servido tras autenticación
  // (`/api/exercises/video/<key>`) fue la segunda forma durante unas horas del
  // 11-ago y se retiró el mismo día: Stream lo sustituye entero. Que siga sin colar
  // es lo que impide que reaparezca un segundo camino para lo mismo.
  it('una ruta relativa nuestra YA NO es un vídeo', () => {
    expect(isValidExerciseVideo('/api/exercises/video/ejercicios/60/2026/08/algo.mp4')).toBe(false);
  });
});

describe('el schema del campo', () => {
  it('el vacío es null (sin vídeo, o hereda de la base)', () => {
    expect(exerciseVideoSchema.parse('')).toBeNull();
    expect(exerciseVideoSchema.parse('   ')).toBeNull();
  });

  it('guarda el enlace canónico y el manifiesto tal cual', () => {
    expect(exerciseVideoSchema.parse('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(exerciseVideoSchema.parse(HLS)).toBe(HLS);
  });
});

describe('reconstruir el reproductor a partir del localizador', () => {
  it('el incrustado sale del mismo par que el manifiesto: el panel no sabe de cuentas', () => {
    const video = parseExerciseVideo(HLS)!;
    expect(video.kind).toBe('stream');
    expect(exerciseStreamIframeUrl(video as { code: string; uid: string })).toBe(
      `https://customer-${CODE}.cloudflarestream.com/${UID}/iframe`,
    );
  });

  it('ida y vuelta del localizador', () => {
    expect(exerciseStreamRefFrom(exerciseStreamHlsUrl(CODE, UID))).toEqual({ code: CODE, uid: UID });
  });
});

describe('los límites', () => {
  it('el tope de bytes sale del chat, no de un número suelto: es el mismo fichero', () => {
    expect(EXERCISE_VIDEO_MAX_BYTES).toBe(CHAT_ATTACHMENT_MAX_BYTES.video);
  });

  it('la duración es la regla que firma el alojamiento', () => {
    expect(EXERCISE_VIDEO_MAX_DURATION_SECONDS).toBe(300);
  });

  // Los formatos ya NO son los del chat: allí la regla era «lo que decodifica el móvil
  // del atleta», y con Stream transcodificando eso dejó de ser cierto. Lo que tiene que
  // seguir siendo verdad es que entra lo que sale de un móvil.
  it('acepta lo que graba un móvil, empezando por el .mov de un iPhone', () => {
    for (const ext of ['mp4', 'mov', 'm4v']) {
      expect(EXERCISE_VIDEO_EXTENSIONS).toContain(ext);
    }
  });
});
