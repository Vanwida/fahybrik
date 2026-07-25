// Escritor de ZIP mínimo (método STORE, sin comprimir) para empaquetar la guide.
//
// POR QUÉ A MANO Y NO UNA DEPENDENCIA
// -----------------------------------
// El ZIP que pide Suunto son tres ficheros diminutos (dos JSON y un PNG ya
// comprimido). Comprimir no ahorra nada y el formato STORE está en la primera
// versión de la especificación de PKWARE: lo entiende cualquier lector. Meter una
// librería de compresión en el bundle del servidor para esto no se paga.
//
// La salida es DETERMINISTA (marca de tiempo fija): el mismo entreno produce
// exactamente los mismos bytes, así que comparar hashes basta para saber si hace
// falta re-subir un guide o no.

import { Buffer } from 'node:buffer';

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

const LOCAL_FILE_HEADER_BYTES = 30;
const CENTRAL_DIR_HEADER_BYTES = 46;
const END_OF_CENTRAL_DIR_BYTES = 22;

/** 2.0: es la versión que introduce STORE/DEFLATE con directorio central. */
const VERSION_NEEDED = 20;
const METHOD_STORE = 0;

// Fecha MS-DOS fija (1980-01-01 00:00), el mínimo representable. Fijarla es lo
// que hace el ZIP reproducible byte a byte.
const DOS_DATE_1980_01_01 = 0x0021;
const DOS_TIME_MIDNIGHT = 0x0000;

// ── CRC-32 (IEEE 802.3), el que exige el formato ZIP ─────────────────────────

const CRC32_POLYNOMIAL = 0xedb88320;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? CRC32_POLYNOMIAL ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Empaquetado ──────────────────────────────────────────────────────────────

export interface ZipEntry {
  /** Ruta dentro del ZIP. Solo ASCII: los tres nombres que pide Suunto lo son. */
  name: string;
  data: Uint8Array;
}

export function createZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'ascii');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = Buffer.alloc(LOCAL_FILE_HEADER_BYTES);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(0, 6); // sin flags
    localHeader.writeUInt16LE(METHOD_STORE, 8);
    localHeader.writeUInt16LE(DOS_TIME_MIDNIGHT, 10);
    localHeader.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // comprimido == original en STORE
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // sin campo extra

    localParts.push(localHeader, nameBytes, Buffer.from(entry.data));

    const centralHeader = Buffer.alloc(CENTRAL_DIR_HEADER_BYTES);
    centralHeader.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
    centralHeader.writeUInt16LE(VERSION_NEEDED, 4); // versión que lo creó
    centralHeader.writeUInt16LE(VERSION_NEEDED, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(METHOD_STORE, 10);
    centralHeader.writeUInt16LE(DOS_TIME_MIDNIGHT, 12);
    centralHeader.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comentario
    centralHeader.writeUInt16LE(0, 34); // disco
    centralHeader.writeUInt16LE(0, 36); // atributos internos
    centralHeader.writeUInt32LE(0, 38); // atributos externos
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBytes);
    offset += LOCAL_FILE_HEADER_BYTES + nameBytes.length + size;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(END_OF_CENTRAL_DIR_BYTES);
  end.writeUInt32LE(END_OF_CENTRAL_DIR_SIG, 0);
  end.writeUInt16LE(0, 4); // número de disco
  end.writeUInt16LE(0, 6); // disco donde arranca el directorio
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // sin comentario

  return new Uint8Array(Buffer.concat([...localParts, central, end]));
}

/**
 * Lee un ZIP escrito por `createZip` recorriendo el DIRECTORIO CENTRAL, que es
 * como lo hace un lector de verdad (no encadenando cabeceras locales). Existe
 * para que el test de ida y vuelta compruebe el formato, no solo nuestros bytes.
 */
export function readStoredZip(zip: Uint8Array): Map<string, Uint8Array> {
  const buf = Buffer.from(zip);
  const eocdOffset = buf.length - END_OF_CENTRAL_DIR_BYTES;
  if (eocdOffset < 0 || buf.readUInt32LE(eocdOffset) !== END_OF_CENTRAL_DIR_SIG) {
    throw new Error('ZIP inválido: no se encuentra el fin del directorio central');
  }

  const count = buf.readUInt16LE(eocdOffset + 10);
  let cursor = buf.readUInt32LE(eocdOffset + 16);
  const out = new Map<string, Uint8Array>();

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(cursor) !== CENTRAL_DIR_HEADER_SIG) {
      throw new Error('ZIP inválido: cabecera de directorio central corrupta');
    }
    const size = buf.readUInt32LE(cursor + 24);
    const nameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('ascii', cursor + CENTRAL_DIR_HEADER_BYTES, cursor + CENTRAL_DIR_HEADER_BYTES + nameLength);

    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + LOCAL_FILE_HEADER_BYTES + localNameLength + localExtraLength;
    out.set(name, new Uint8Array(buf.subarray(dataStart, dataStart + size)));

    cursor += CENTRAL_DIR_HEADER_BYTES + nameLength + extraLength + commentLength;
  }
  return out;
}
