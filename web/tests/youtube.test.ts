import { describe, expect, it } from 'vitest';
import {
  isValidYouTubeUrl,
  parseYouTubeVideoId,
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
