// Genera el `icon.png` de 300×300 que el ZIP de la guide exige.
//
// POR QUÉ GENERADO Y NO UN FICHERO EN EL REPO
// -------------------------------------------
// El icono es un anillo sobre fondo plano: describirlo en código son cuarenta
// líneas, y así sale SIEMPRE a 300×300 exactos (el tamaño que pide el PDF, que no
// perdona) y con los colores de marca leídos de los tokens compartidos, sin un
// binario que se desincronice de la paleta. Además evita depender de que el
// bundler del servidor arrastre un asset.
//
// El PDF avisa: "should not contain any private data (may be accessible via
// public link)". Es un icono de marca, sin nada del atleta — por eso NO se dibuja
// aquí ni el nombre de la sesión ni ningún dato personal.

import { deflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { tokens } from '@fahybrid/shared/tokens';

/** Lado en píxeles exigido por la spec ("300x300 PNG image"). */
export const GUIDE_ICON_SIZE = 300;

const BYTES_PER_PIXEL = 3; // color type 2 = RGB de 8 bits
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BIT_DEPTH = 8;
const PNG_COLOR_TYPE_RGB = 2;
const FILTER_NONE = 0;

// Proporciones del anillo, relativas al lado (así el dibujo no depende del tamaño).
const RING_OUTER_RATIO = 0.37;
const RING_INNER_RATIO = 0.28;

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Un chunk PNG: longitud + tipo + datos + CRC(tipo+datos). */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * PNG de un anillo naranja de marca sobre fondo oscuro. Sin antialiasing: a
 * 300 px el borde duro se ve limpio y el fichero comprime a unos pocos KB.
 */
export function buildGuideIconPng(): Uint8Array {
  const size = GUIDE_ICON_SIZE;
  const background = hexToRgb(tokens.color.bg);
  const accent = hexToRgb(tokens.color.accent);

  const center = (size - 1) / 2;
  const outerRadiusSq = (size * RING_OUTER_RATIO) ** 2;
  const innerRadiusSq = (size * RING_INNER_RATIO) ** 2;

  // Cada fila lleva delante su byte de filtro (0 = sin filtrar).
  const raw = Buffer.alloc(size * (1 + size * BYTES_PER_PIXEL));
  let cursor = 0;
  for (let y = 0; y < size; y++) {
    raw[cursor++] = FILTER_NONE;
    const dy = y - center;
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const distanceSq = dx * dx + dy * dy;
      const inRing = distanceSq <= outerRadiusSq && distanceSq >= innerRadiusSq;
      const [r, g, b] = inRing ? accent : background;
      raw[cursor++] = r;
      raw[cursor++] = g;
      raw[cursor++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(PNG_BIT_DEPTH, 8);
  ihdr.writeUInt8(PNG_COLOR_TYPE_RGB, 9);
  ihdr.writeUInt8(0, 10); // compresión deflate
  ihdr.writeUInt8(0, 11); // filtrado adaptativo estándar
  ihdr.writeUInt8(0, 12); // sin entrelazado

  return new Uint8Array(
    Buffer.concat([
      PNG_SIGNATURE,
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
