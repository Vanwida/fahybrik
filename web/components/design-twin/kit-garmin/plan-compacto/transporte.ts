// EL TRANSPORTE — del flujo de valores a los bytes y al JSON que los lleva.
//
// Transporte elegido (docs/garmin-reloj/plan-compacto.md, decisión A/B): BINARIO
// de varints, dentro de un JSON mínimo como base64.
//
//   contenedor   = varint(versión) · varint(nº de cadenas) ·
//                  [varint(bytes) · bytes UTF-8]×n · varint(valor)×hasta el final
//   varint       = 7 bits por byte, el bit 0x80 dice «sigue»; menos significativo
//                  primero. Un valor < 128 ocupa 1 byte, < 16 384 ocupa 2.
//   sobre JSON   = {"v":<versión>,"b":"<base64 estándar con relleno>"}
//
// Por qué así, pensando en el decodificador de Monkey C: el `ByteArray` se
// indexa con `bytes[i]` (un `Number` 0–255, sin reservar memoria), el bucle del
// varint son seis líneas y la cadena se lee con `StringUtil.convertEncodedString`
// sobre el trozo. El base64 lo convierte a `ByteArray` el propio sistema
// (`REPRESENTATION_STRING_BASE64` → `REPRESENTATION_BYTE_ARRAY`). Y 6 KB de
// binario son 8 192 caracteres de base64: justo la clave máxima de Storage.
//
// QUÉ NO HACER: no usar `Buffer` (este módulo corre también en el navegador)
// ni saltos de línea en el base64 (el conversor de Connect IQ no los admite).

import { MAX_NUM } from './formato';
import { ErrorPlanCompacto, type Flujo } from './flujo';

/** Un varint lleva 7 bits útiles por byte. */
const BITS_VARINT = 7;
const BASE_VARINT = 2 ** BITS_VARINT;
const MASCARA_VARINT = BASE_VARINT - 1;
/** El bit alto de cada byte dice que el número sigue en el siguiente. */
const CONTINUA_VARINT = BASE_VARINT;
/** Un número de 31 bits cabe en 5 bytes de varint. */
const MAX_BYTES_VARINT = 5;

const codificadorTexto = new TextEncoder();

function escribirVarint(out: number[], valor: number): void {
  let resto = valor;
  while (resto > MASCARA_VARINT) {
    out.push((resto % BASE_VARINT) | CONTINUA_VARINT);
    resto = Math.floor(resto / BASE_VARINT);
  }
  out.push(resto);
}

/** Flujo → bytes. */
export function aBinario(f: Flujo): Uint8Array {
  const out: number[] = [];
  escribirVarint(out, f.version);
  escribirVarint(out, f.cadenas.length);
  for (const c of f.cadenas) {
    const bytes = codificadorTexto.encode(c);
    escribirVarint(out, bytes.length);
    for (const b of bytes) out.push(b);
  }
  for (const t of f.tokens) escribirVarint(out, t);
  return Uint8Array.from(out);
}

/** Bytes → flujo. Rechaza un varint que se pasa de 31 bits o que se corta a medias. */
export function deBinario(bytes: Uint8Array): Flujo {
  let pos = 0;
  const varint = (): number => {
    let valor = 0;
    for (let k = 0; k < MAX_BYTES_VARINT; k++) {
      const b = bytes[pos];
      if (b === undefined) throw new ErrorPlanCompacto('truncado', `varint cortado en el byte ${pos}`);
      pos += 1;
      valor += (b % BASE_VARINT) * BASE_VARINT ** k;
      if (b < CONTINUA_VARINT) {
        if (valor > MAX_NUM) throw new ErrorPlanCompacto('fuera-de-rango', `varint ${valor} pasa de 31 bits`);
        return valor;
      }
    }
    throw new ErrorPlanCompacto('fuera-de-rango', `varint de más de ${MAX_BYTES_VARINT} bytes en ${pos}`);
  };

  const version = varint();
  const nCadenas = varint();
  const decodificadorTexto = new TextDecoder('utf-8', { fatal: true });
  const cadenas: string[] = [];
  for (let i = 0; i < nCadenas; i++) {
    const largo = varint();
    if (pos + largo > bytes.length) throw new ErrorPlanCompacto('truncado', `la cadena ${i} se sale del plan`);
    cadenas.push(decodificadorTexto.decode(bytes.subarray(pos, pos + largo)));
    pos += largo;
  }
  const tokens: number[] = [];
  while (pos < bytes.length) tokens.push(varint());
  return { version, cadenas, tokens };
}

/** Bytes → base64 estándar con relleno, sin saltos de línea. */
export function aBase64(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

export function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const out = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) out[i] = binario.charCodeAt(i);
  return out;
}

/** El sobre JSON mínimo que lleva el binario por la red. */
export function envolver(bytes: Uint8Array, version: number): string {
  return JSON.stringify({ v: version, b: aBase64(bytes) });
}

export function desenvolver(json: string): Uint8Array {
  const o: unknown = JSON.parse(json);
  if (typeof o !== 'object' || o === null || typeof (o as { b?: unknown }).b !== 'string') {
    throw new ErrorPlanCompacto('formato', 'el sobre no trae «b» con el plan en base64');
  }
  return deBase64((o as { b: string }).b);
}
