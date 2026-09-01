import { describe, expect, it } from 'vitest';
import {
  isValidYouTubeUrl,
  parseYouTubeLink,
  parseYouTubeVideoId,
  youtubeCanonicalUrl,
  youtubeEmbedUrl,
  youtubeWatchUrl,
} from '@fahybrid/shared/youtube';

describe('parseYouTubeVideoId', () => {
  it('parses watch URLs', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('parses short links', () => {
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses embed URLs', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('rejects non-YouTube hosts', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/123')).toBeNull();
  });
});

describe('youtubeEmbedUrl', () => {
  it('builds nocookie embed', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toContain('playsinline=1');
  });
});

describe('isValidYouTubeUrl', () => {
  it('accepts watch and rejects empty', () => {
    expect(isValidYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(isValidYouTubeUrl('')).toBe(false);
  });
});

describe('youtubeWatchUrl', () => {
  it('canonicalizes storage', () => {
    expect(youtubeWatchUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });
});

// La verticalidad de un Short SOLO viaja en la forma de la URL. Si al guardar
// se colapsa a `watch?v=`, iOS lo pinta en 16:9 con bandas negras — su rama
// vertical está escrita pero nunca se ejecuta. Esto lo fija.
describe('Shorts — la forma se conserva', () => {
  it('distingue un Short de un vídeo normal al leerlo', () => {
    expect(parseYouTubeLink('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      id: 'dQw4w9WgXcQ',
      isShort: true,
    });
    expect(parseYouTubeLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      id: 'dQw4w9WgXcQ',
      isShort: false,
    });
  });

  it('canoniza un Short como /shorts/, no como watch', () => {
    expect(
      youtubeCanonicalUrl(parseYouTubeLink('https://www.youtube.com/shorts/dQw4w9WgXcQ')!),
    ).toBe('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  });

  it('un vídeo normal se sigue canonizando como watch', () => {
    expect(youtubeCanonicalUrl(parseYouTubeLink('https://youtu.be/dQw4w9WgXcQ')!)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(
      youtubeCanonicalUrl(parseYouTubeLink('https://www.youtube.com/embed/dQw4w9WgXcQ')!),
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

// El schema del campo `video_url` ya NO vive aquí: un vídeo de ejercicio puede ser
// un enlace de YouTube o un fichero del entrenador, así que su validación (una sola)
// está en lib/exercises/video-source.ts y se prueba en tests/exercises/video-source.test.ts.
