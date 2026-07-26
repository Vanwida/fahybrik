// La cabecera del WAV que produce la grabadora de notas de voz.
//
// Se prueba byte a byte porque un fallo aquí no revienta nada: produce un fichero
// que sube bien, se guarda bien y suena mal —acelerado, lento o a ruido— y eso se
// descubre cuando el atleta intenta escuchar la nota de su entrenador.

import { describe, expect, it } from 'vitest';
import { encodeWav } from '@/components/v2/chat/voice-recorder';

const SAMPLE_RATE = 16_000;

function ascii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

describe('encodeWav', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const buffer = encodeWav(samples, SAMPLE_RATE);
  const view = new DataView(buffer);

  it('escribe un contenedor RIFF/WAVE', () => {
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(ascii(view, 36, 4)).toBe('data');
  });

  it('declara PCM mono de 16 bits', () => {
    expect(view.getUint16(20, true)).toBe(1); // 1 = PCM sin comprimir
    expect(view.getUint16(22, true)).toBe(1); // canales
    expect(view.getUint16(34, true)).toBe(16); // bits por muestra
  });

  it('guarda la frecuencia REAL, que es de lo que depende que no suene acelerado', () => {
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(SAMPLE_RATE * 2); // bytes por segundo
    expect(view.getUint16(32, true)).toBe(2); // alineación de bloque
  });

  it('escribe la frecuencia que se le pasa, no una fija', () => {
    // Si el navegador impone 48 kHz y guardáramos los 16 kHz pedidos, la nota
    // sonaría a un tercio de velocidad.
    const other = new DataView(encodeWav(samples, 48_000));
    expect(other.getUint32(24, true)).toBe(48_000);
  });

  it('cuadra los tamaños de la cabecera con los datos', () => {
    const dataBytes = samples.length * 2;
    expect(buffer.byteLength).toBe(44 + dataBytes);
    expect(view.getUint32(4, true)).toBe(36 + dataBytes); // fichero menos los 8 primeros
    expect(view.getUint32(40, true)).toBe(dataBytes);
    expect(view.getUint32(16, true)).toBe(16); // longitud del bloque fmt
  });

  it('convierte las muestras a enteros de 16 bits sin dar la vuelta en los extremos', () => {
    // El caso que importa: +1.0 debe quedarse en 32767, NO saltar a -32768.
    expect(view.getInt16(44, true)).toBe(0);
    // `setInt16` trunca hacia cero, no redondea: medio bit de 65536 no se oye.
    expect(view.getInt16(46, true)).toBe(Math.trunc(0.5 * 0x7fff));
    expect(view.getInt16(48, true)).toBe(-0.5 * 0x8000);
    expect(view.getInt16(50, true)).toBe(32767);
    expect(view.getInt16(52, true)).toBe(-32768);
  });

  it('recorta lo que se sale de rango en vez de desbordarlo', () => {
    // Una muestra fuera de [-1, 1] desbordaría el entero y sonaría a chasquido.
    const loud = new DataView(encodeWav(new Float32Array([2, -2]), SAMPLE_RATE));
    expect(loud.getInt16(44, true)).toBe(32767);
    expect(loud.getInt16(46, true)).toBe(-32768);
  });

  it('produce una cabecera válida aunque no se grabara nada', () => {
    const empty = new DataView(encodeWav(new Float32Array(0), SAMPLE_RATE));
    expect(ascii(empty, 0, 4)).toBe('RIFF');
    expect(empty.getUint32(40, true)).toBe(0);
  });
});
