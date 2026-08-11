// EL LOCALIZADOR DEL VÍDEO DE UN EJERCICIO — dos formas y ninguna más.
//
// Lo que fija este suite es el contrato: una columna (`video_url`), sin campo de
// «tipo», y una sola validación que aplican por igual el alta, la edición y el campo
// del panel. Si alguien vuelve a estrechar el campo a YouTube, o afloja la forma de
// la ruta propia hasta dejar entrar una URL de fuera, aquí se cae.

import { describe, expect, it } from 'vitest';
import {
  EXERCISE_VIDEO_EXTENSIONS,
  EXERCISE_VIDEO_MAX_BYTES,
  EXERCISE_VIDEO_PROXY_PREFIX,
  coachIdFromExerciseVideoPathname,
  exerciseVideoLocator,
  exerciseVideoPathnameFrom,
  exerciseVideoSchema,
  isValidExerciseVideo,
  parseExerciseVideo,
} from '@/lib/exercises/video-source';
import { CHAT_ATTACHMENT_EXTENSIONS, CHAT_ATTACHMENT_MAX_BYTES } from '@/lib/chat/schema';

const UUID = '0e5b0a0c-1f2d-4c3b-8a91-2b6d7e8f9a01';
const PATHNAME = `ejercicios/60/2026/08/${UUID}.mp4`;
const LOCATOR = `${EXERCISE_VIDEO_PROXY_PREFIX}${PATHNAME}`;

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

  it('lee un fichero propio y devuelve su pathname', () => {
    expect(parseExerciseVideo(LOCATOR)).toEqual({
      kind: 'subido',
      pathname: PATHNAME,
      url: LOCATOR,
    });
  });

  it('acepta las tres extensiones que reproduce el móvil del atleta', () => {
    for (const ext of EXERCISE_VIDEO_EXTENSIONS) {
      const locator = exerciseVideoLocator(`ejercicios/60/2026/08/${UUID}.${ext}`);
      expect(isValidExerciseVideo(locator)).toBe(true);
    }
  });

  it('canoniza de forma idempotente: guardar y volver a guardar da lo mismo', () => {
    const once = parseExerciseVideo('https://youtu.be/dQw4w9WgXcQ')!.url;
    expect(parseExerciseVideo(once)!.url).toBe(once);
    expect(parseExerciseVideo(LOCATOR)!.url).toBe(LOCATOR);
  });
});

describe('todo lo demás se rechaza', () => {
  it.each([
    ['otro host de vídeo', 'https://vimeo.com/123'],
    ['un fichero en un dominio ajeno', 'https://ejemplo.com/video.mp4'],
    ['una ruta nuestra con forma inventada', '/api/exercises/video/lo-que-sea.mp4'],
    ['una ruta con carpeta de otro producto', `/api/exercises/video/chat/60/2026/08/${UUID}.mp4`],
    ['un formato que iOS no reproduce', `/api/exercises/video/ejercicios/60/2026/08/${UUID}.webm`],
    ['un intento de salirse de la carpeta', '/api/exercises/video/../../etc/passwd'],
    ['un id que no es un uuid nuestro', '/api/exercises/video/ejercicios/60/2026/08/video.mp4'],
    ['una carpeta que no es de un coach', `/api/exercises/video/ejercicios/mia/2026/08/${UUID}.mp4`],
    ['texto suelto', 'el vídeo se lo paso por whatsapp'],
  ])('rechaza %s', (_caso, entrada) => {
    expect(isValidExerciseVideo(entrada)).toBe(false);
    expect(() => exerciseVideoSchema.parse(entrada)).toThrow();
  });

  it('un localizador absoluto NO vale: la columna guarda la ruta relativa', () => {
    expect(isValidExerciseVideo(`https://app.fahybrid.com${LOCATOR}`)).toBe(false);
  });
});

describe('el schema del campo', () => {
  it('el vacío es null (sin vídeo, o hereda de la base)', () => {
    expect(exerciseVideoSchema.parse('')).toBeNull();
    expect(exerciseVideoSchema.parse('   ')).toBeNull();
  });

  it('guarda el enlace canónico y el localizador tal cual', () => {
    expect(exerciseVideoSchema.parse('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(exerciseVideoSchema.parse(LOCATOR)).toBe(LOCATOR);
  });
});

describe('de quién es el fichero', () => {
  it('el dueño sale de la propia ruta, nunca de quien la pide', () => {
    expect(coachIdFromExerciseVideoPathname(PATHNAME)).toBe(BigInt(60));
  });

  it('una ruta con otra forma no tiene dueño y por tanto no se sirve', () => {
    expect(coachIdFromExerciseVideoPathname('ejercicios/60/2026/08/video.mp4')).toBeNull();
    expect(coachIdFromExerciseVideoPathname('otra/60/2026/08/algo.mp4')).toBeNull();
  });

  it('ida y vuelta del localizador', () => {
    expect(exerciseVideoPathnameFrom(exerciseVideoLocator(PATHNAME))).toBe(PATHNAME);
  });
});

describe('los límites salen del chat, no de un número suelto', () => {
  it('mismos formatos y mismo tope que un vídeo del chat', () => {
    expect(EXERCISE_VIDEO_EXTENSIONS).toBe(CHAT_ATTACHMENT_EXTENSIONS.video);
    expect(EXERCISE_VIDEO_MAX_BYTES).toBe(CHAT_ATTACHMENT_MAX_BYTES.video);
  });
});
