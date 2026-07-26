// Las reglas de adjunto que comparten el servidor y el navegador.
//
// Existen en un solo sitio precisamente para que no puedan divergir: si el
// navegador aceptara algo que el servidor rechaza, quien escribe subiría el
// fichero entero para comerse un 400 sin explicación al final.

import { describe, expect, it } from 'vitest';
import {
  CHAT_ATTACHMENT_EXTENSIONS,
  CHAT_ATTACHMENT_MAX_BYTES,
  fileExtension,
  inferAttachmentKind,
} from '@/lib/chat/schema';

describe('fileExtension', () => {
  it('saca la extensión en minúsculas', () => {
    expect(fileExtension('Sentadilla.MOV')).toBe('mov');
  });

  it('coge la ÚLTIMA extensión cuando hay varios puntos', () => {
    expect(fileExtension('plan.semana.3.pdf')).toBe('pdf');
  });

  it('devuelve vacío cuando no hay extensión', () => {
    expect(fileExtension('captura')).toBe('');
  });
});

describe('inferAttachmentKind', () => {
  it('clasifica cada tipo por su extensión', () => {
    expect(inferAttachmentKind('foto.jpg', 'image/jpeg')).toBe('image');
    expect(inferAttachmentKind('tecnica.mp4', 'video/mp4')).toBe('video');
    expect(inferAttachmentKind('nota.wav', 'audio/wav')).toBe('voice');
    expect(inferAttachmentKind('plan.pdf', 'application/pdf')).toBe('file');
  });

  it('manda la extensión, no el MIME', () => {
    // Los navegadores mienten con el MIME más de lo que mienten con el nombre.
    // Un .mp4 sin MIME sigue siendo vídeo.
    expect(inferAttachmentKind('clip.mp4', '')).toBe('video');
    expect(inferAttachmentKind('clip.mp4', 'application/octet-stream')).toBe('video');
  });

  it('cae al MIME solo cuando no hay extensión', () => {
    expect(inferAttachmentKind('captura', 'image/png')).toBe('image');
    expect(inferAttachmentKind('grabacion', 'audio/mpeg')).toBe('voice');
  });

  it('acepta lo que de verdad se pasan un entrenador y su atleta', () => {
    expect(inferAttachmentKind('cargas.xlsx', 'application/vnd.ms-excel')).toBe('file');
    expect(inferAttachmentKind('plan.csv', 'text/csv')).toBe('file');
    expect(inferAttachmentKind('animacion.gif', 'image/gif')).toBe('image');
    expect(inferAttachmentKind('foto.heif', 'image/heif')).toBe('image');
  });

  it('rechaza lo que el otro lado no podría reproducir', () => {
    // WebM/Opus suena en el navegador y NO en iOS: dejarlo entrar solo serviría
    // para mandarle al atleta algo que no puede abrir.
    expect(inferAttachmentKind('nota.webm', 'audio/webm')).toBeNull();
    expect(inferAttachmentKind('clip.webm', 'video/webm')).toBeNull();
    expect(inferAttachmentKind('clip.mkv', 'video/x-matroska')).toBeNull();
  });

  it('rechaza SVG aunque sea una imagen', () => {
    // Un SVG es un documento con scripts dentro, y se serviría desde nuestro
    // propio dominio.
    expect(inferAttachmentKind('logo.svg', 'image/svg+xml')).toBeNull();
  });

  it('rechaza ejecutables y archivos comprimidos', () => {
    expect(inferAttachmentKind('app.exe', 'application/octet-stream')).toBeNull();
    expect(inferAttachmentKind('cosas.zip', 'application/zip')).toBeNull();
    expect(inferAttachmentKind('script.sh', 'text/x-shellscript')).toBeNull();
  });

  it('no adivina por MIME cuando la extensión existe pero no vale', () => {
    // Si valiera el MIME de respaldo, un .exe con `image/png` entraría como foto.
    expect(inferAttachmentKind('trampa.exe', 'image/png')).toBeNull();
  });
});

describe('topes y extensiones', () => {
  it('cubre los cuatro tipos, sin huecos', () => {
    const kinds = ['voice', 'video', 'image', 'file'] as const;
    for (const kind of kinds) {
      expect(CHAT_ATTACHMENT_EXTENSIONS[kind].length).toBeGreaterThan(0);
      expect(CHAT_ATTACHMENT_MAX_BYTES[kind]).toBeGreaterThan(0);
    }
  });

  it('ninguna extensión pertenece a dos tipos', () => {
    // Un solapamiento haría que `inferAttachmentKind` dependiera del orden de las
    // claves del objeto, que no es algo sobre lo que apoyarse.
    const seen = new Set<string>();
    for (const exts of Object.values(CHAT_ATTACHMENT_EXTENSIONS)) {
      for (const ext of exts) {
        expect(seen.has(ext)).toBe(false);
        seen.add(ext);
      }
    }
  });

  it('el vídeo es el que más margen tiene', () => {
    const video = CHAT_ATTACHMENT_MAX_BYTES.video;
    for (const [kind, max] of Object.entries(CHAT_ATTACHMENT_MAX_BYTES)) {
      if (kind !== 'video') expect(max).toBeLessThan(video);
    }
  });
});
