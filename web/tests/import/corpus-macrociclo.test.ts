/**
 * EL BANCO DE PRUEBAS DEL IMPORTADOR — card 136.
 *
 * POR QUÉ EXISTE
 * --------------
 * Hasta ahora decidíamos «esto cabe en el modelo» y «esto no» leyendo líneas a
 * ojo. Eso encuentra los agujeros grandes, pero no dice si vamos mejorando ni
 * qué construir después. Alex lo puso mejor: el macrociclo real de 12 semanas
 * que trajo es para VER DÓNDE SE ROMPEN LAS COSTURAS. Pues aquí se ven, y en un
 * número.
 *
 * QUÉ MIDE
 * --------
 * Pasa las 1.238 líneas del ciclo real (`fixtures/macrociclo-hyrox-12-semanas.json`,
 * 84 días, 310 bloques) por la gramática determinista del importador y cuenta
 * en qué acaba cada una:
 *   · `detected`   — tipada y FIEL. Es el número que tiene que subir.
 *   · `incomplete` — se reconoció el movimiento pero no su dosis.
 *   · `review`     — la gramática no la pudo descomponer con confianza. El texto
 *                    se conserva intacto; nunca se inventa un número.
 *   · descartada   — la gramática no devolvió nada para esa línea.
 *
 * Y saca, ordenado por cuántas veces falla, QUÉ falla. Eso deja de ser opinión
 * de nadie sobre qué construir después: lo dice la lista.
 *
 * CÓMO SE USA
 * -----------
 * El umbral de abajo es un TRINQUETE, no un objetivo: sólo puede subir. Si tu
 * cambio lo baja, has roto cobertura y la prueba te lo dice. Si lo sube,
 * actualiza el número Y escribe por qué subió — es el registro de cómo ha ido
 * mejorando el importador.
 *
 * El desglose se imprime siempre (`--reporter=verbose` o mirando la salida):
 * es la lista de la compra de la siguiente card.
 *
 * ESTE FICHERO NO ENSEÑA NADA A LA GRAMÁTICA. Mide. Construir es otra card.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';

interface Bloque {
  nombre: string;
  contenido: string;
}
interface Dia {
  dia: string;
  sesion: string;
  bloques?: Bloque[];
}
interface Semana {
  numero: number;
  dias: Dia[];
}
interface Macrociclo {
  semanas: Semana[];
}

const CORPUS: Macrociclo = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/macrociclo-hyrox-12-semanas.json'), 'utf8'),
) as Macrociclo;

/** Cada línea de trabajo del ciclo, con de dónde viene (para poder mirarla). */
function lineasDelCorpus(): Array<{ semana: number; dia: string; bloque: string; texto: string }> {
  const out: Array<{ semana: number; dia: string; bloque: string; texto: string }> = [];
  for (const s of CORPUS.semanas) {
    for (const d of s.dias) {
      for (const b of d.bloques ?? []) {
        for (const raw of (b.contenido ?? '').split('\n')) {
          const texto = raw.trim();
          if (texto) out.push({ semana: s.numero, dia: d.dia, bloque: b.nombre, texto });
        }
      }
    }
  }
  return out;
}

/** La misma línea con los números borrados: así se agrupan las formas, no los casos. */
function forma(texto: string): string {
  return texto.replace(/\d+([.,]\d+)?/g, '#');
}

// ── EL TRINQUETE ────────────────────────────────────────────────────────────
// Sólo sube. Cada vez que suba, cámbialo aquí Y di por qué en el comentario.
//
// Historial:
//   2026-08-24 · 60 % (755 de 1.238) — objetivos relativos (card 130, pieza 4).
//     El importador lee peso de competición, delta en kg, % del peso corporal
//     y ritmo HYROX / race pace / umbral. «carga media» sin diccionario sigue
//     en revisión: no se inventa el mapeo.
//   2026-08-24 · 59 % (740 de 1.238) — la cabecera manda sobre las líneas de
//     debajo (card 141). Tres formas planas: «N series:», «N series de N reps
//     de:» / «N series de N:», «N rondas:». El hijo hereda lo escrito y nada
//     más; si la cabecera no trae reps, la línea entra sin reps. Lo anidado
//     («N bloques de M series») sigue en revisión.
//   2026-08-23 · 25 % (315 de 1.238) — primera medición, sin tocar la gramática.
//     Entra sobre todo la línea de una sola dosis («8 Back squat al 65-70%»).
//     Lo que cae, por orden: la CABECERA con hijos («4 series:» + las líneas
//     desnudas de debajo, 84 veces entre sus tres formas), que es la forma
//     DOMINANTE de un plan escrito a mano; «a ritmo HYROX» (30); y un montón de
//     «Nm <movimiento>» cuyo movimiento la gramática no reconoce como tal y por
//     eso ni siquiera le engancha la distancia.
const SUELO_TIPADO_PCT = 60;

describe('el macrociclo real contra la gramática del importador', () => {
  const lineas = lineasDelCorpus();

  function bloquesDelCorpus(): Bloque[] {
    return CORPUS.semanas.flatMap((s) => s.dias.flatMap((d) => d.bloques ?? []));
  }

  test('el corpus es el que decimos que es (si esto cambia, el número no compara)', () => {
    expect(CORPUS.semanas).toHaveLength(12);
    expect(lineas.length).toBe(1238);
  });

  test('cobertura: el porcentaje de líneas que entran tipadas y fieles sólo puede subir', () => {
    const cuenta = { detected: 0, incomplete: 0, review: 0, descartada: 0 };
    const fallos = new Map<string, { veces: number; ejemplo: string; motivo: string }>();

    // EL BLOQUE ENTERO, NO LÍNEA A LÍNEA. La gramática está hecha para leer una
    // celda completa: una cabecera («4 series:») manda sobre las líneas de
    // debajo, que van desnudas porque heredan su dosis. Partiendo por líneas se
    // medía a la gramática pidiéndole algo que no se le pide nunca, y el número
    // salía injustamente bajo. `bareNamesAreExercises` va ENCENDIDO por lo
    // mismo: en un plan escrito a mano, una línea que sólo dice «Cat cow» ES un
    // movimiento, no ruido — la dosis vive en su cabecera.
    for (const b of bloquesDelCorpus()) {
      const suyas = b.contenido.split('\n').map((x) => x.trim()).filter(Boolean);
      const parsed = parseNotationCell(b.contenido, { bareNamesAreExercises: true });
      // El parser puede devolver más o menos entradas que líneas de entrada (une
      // continuaciones, parte cadenas). Se compara por CUENTA: lo que no salió
      // tipado se reparte sobre las líneas del bloque, que es lo que el coach ve.
      const fieles = parsed.filter((p) => p.confidence === 'detected').length;
      const incompletas = parsed.filter((p) => p.confidence === 'incomplete').length;
      const aRevision = parsed.filter((p) => p.confidence === 'review').length;
      const cubiertas = Math.min(suyas.length, fieles);
      cuenta.detected += cubiertas;
      cuenta.incomplete += Math.min(suyas.length - cubiertas, incompletas);
      cuenta.review += Math.min(Math.max(0, suyas.length - cubiertas - incompletas), aRevision);
      cuenta.descartada += Math.max(0, suyas.length - fieles - incompletas - aRevision);
      if (cubiertas < suyas.length) {
        const motivo =
          parsed.flatMap((p) => p.review_reasons)[0] ??
          (parsed.length === 0 ? 'la gramática no devolvió nada' : 'sin dosis reconocida');
        // Se anota la línea que NO salió fiel, no el bloque entero: la lista
        // tiene que decir qué FORMA arreglar, no en qué día pasó.
        for (const t of suyas.slice(fieles)) anota(fallos, t, motivo);
      }
    }

    const pct = Math.floor((cuenta.detected / lineas.length) * 100);
    const top = [...fallos.entries()].sort((a, b) => b[1].veces - a[1].veces).slice(0, 25);

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '── COSTURAS DEL IMPORTADOR ──────────────────────────────────────────',
        `líneas: ${lineas.length}`,
        `tipadas y fieles: ${cuenta.detected} (${pct} %)   ← el número que sube`,
        `dosis sin reconocer: ${cuenta.incomplete}`,
        `a revisión: ${cuenta.review}`,
        `descartadas: ${cuenta.descartada}`,
        '',
        'LO QUE MÁS FALLA (forma · veces · ejemplo · motivo):',
        ...top.map(([f, v]) => `  ${String(v.veces).padStart(4)}  ${f.slice(0, 62)}\n        · ${v.ejemplo.slice(0, 62)}\n        · ${v.motivo.slice(0, 70)}`),
        '─────────────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );

    expect(pct, `la cobertura bajó de ${SUELO_TIPADO_PCT}% a ${pct}%: algo se ha roto`).toBeGreaterThanOrEqual(
      SUELO_TIPADO_PCT,
    );
  });

  // LA REGLA QUE NO SE NEGOCIA, medida sobre datos reales y no sobre un ejemplo:
  // lo que no se puede tipar con confianza sale a revisión CON SU TEXTO INTACTO.
  // Nunca un número inventado. Si esto se rompe, da igual la cobertura.
  test('nada de lo que no se entiende se convierte en un número inventado', () => {
    for (const l of lineas) {
      for (const p of parseNotationCell(l.texto, { bareNamesAreExercises: true })) {
        if (p.confidence === 'detected') continue;
        const dosis = JSON.stringify(p.prescription);
        expect(
          p.review_reasons.length > 0 || p.confidence === 'incomplete',
          `"${l.texto}" salió no-fiel sin decir por qué: ${dosis}`,
        ).toBe(true);
      }
    }
  });
});

function anota(
  m: Map<string, { veces: number; ejemplo: string; motivo: string }>,
  texto: string,
  motivo: string,
): void {
  const k = forma(texto);
  const prev = m.get(k);
  if (prev) prev.veces += 1;
  else m.set(k, { veces: 1, ejemplo: texto, motivo });
}
