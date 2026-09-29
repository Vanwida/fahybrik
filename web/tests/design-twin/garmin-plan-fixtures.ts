// LOS VECTORES DE ORO — un fichero por sesión con su plan codificado y su forma
// decodificada, para tres consumidores:
//   · quien escriba el decodificador de Monkey C prueba contra ellos (los
//     bytes en hex, la lista de valores y las cadenas: puede validar la capa
//     de bytes y la de campos por separado);
//   · iOS y el servidor comparten el mismo contrato (arreglo A1 del modelo);
//   · el examen falla si el codificador cambia y los vectores no.
//
// Esta función es la ÚNICA que decide qué texto lleva cada fichero: la usan el
// script que los escribe (`web/scripts/garmin-plan-fixtures.ts`) y el test que
// comprueba que el disco coincide. `00-basicos.json` lleva los vectores de las
// piezas (varint, escalas, opcionales, slots, empaquetado, base64) para
// probar el decodificador antes de tocar un plan entero.
//
// Regenerar: cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/garmin-plan-fixtures.ts

import { canonico } from '@fahybrid/shared/domain/watch-plan/plan-compacto/canonico';
import { flujoDeSesion } from '@fahybrid/shared/domain/watch-plan/plan-compacto/codificar';
import {
  ANCHOS_MEDIDA,
  ANCHOS_ROL_FASE,
  ESCALA_CENTI,
  ESCALA_DECI,
  ESCALA_PCT,
  MAX_NUM,
  VERSION_ESQUEMA,
  empaquetar,
} from '@fahybrid/shared/domain/watch-plan/plan-compacto/formato';
import { escalar } from '@fahybrid/shared/domain/watch-plan/plan-compacto/flujo';
import { aBase64, aBinario, envolver } from '@fahybrid/shared/domain/watch-plan/plan-compacto/transporte';
import { NO_ENCONTRADAS, casosConVector } from './garmin-plan-casos';

/** Carpeta de los vectores, relativa a `web/`. */
export const DIR_VECTORES = 'tests/design-twin/fixtures/garmin-plan';

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Los bytes del varint de un valor: la capa más baja del decodificador. */
const varintDe = (valor: number) => aBinario({ version: 0, cadenas: [], tokens: [valor] }).slice(2);

function vectoresBasicos(): string {
  const cuerpo = {
    descripcion:
      'Vectores de las piezas del formato. Un varint: 7 bits por byte, menos significativo primero, bit 0x80 = sigue. Un opcional: 0 = ausente, valor + 1 = presente. Una escala: décimas para los ejes, centésimas para los kilos, porcentaje ×100.',
    esquema: VERSION_ESQUEMA,
    varint: [0, 1, 127, 128, 255, 300, 16383, 16384, 2097152, MAX_NUM].map((valor) => ({ valor, hex: hex(varintDe(valor)) })),
    opcional: [
      { valor: null, token: 0 },
      { valor: 0, token: 1 },
      { valor: 5, token: 6 },
    ],
    escalas: [
      { campo: 'rpe', valor: 6.5, escala: ESCALA_DECI, token: escalar(6.5, ESCALA_DECI, 'rpe') },
      { campo: 'ritmo (s/km)', valor: 225, escala: ESCALA_DECI, token: escalar(225, ESCALA_DECI, 'ritmo') },
      { campo: 'kg', valor: 1.25, escala: ESCALA_CENTI, token: escalar(1.25, ESCALA_CENTI, 'kg') },
      { campo: 'kg', valor: 186.5, escala: ESCALA_CENTI, token: escalar(186.5, ESCALA_CENTI, 'kg') },
      { campo: 'umbralHecho', valor: 0.9, escala: ESCALA_PCT, token: escalar(0.9, ESCALA_PCT, 'umbral') },
    ],
    slots: [
      { slot: 'A1', tokens: [1, 1] },
      { slot: 'B2', tokens: [2, 2] },
      { slot: 'A4', tokens: [1, 4] },
    ],
    empaquetado: [
      { campo: 'rol · fase · cierre (2+2+1 bits)', valores: [0, 1, 1], token: empaquetar(ANCHOS_ROL_FASE, [0, 1, 1]) },
      { campo: 'medida: tipo · quién mide (3+3 bits)', valores: [1, 5], token: empaquetar(ANCHOS_MEDIDA, [1, 5]) },
    ],
    base64: [
      { bytes: '010203', base64: aBase64(Uint8Array.of(1, 2, 3)) },
      { bytes: 'fffe', base64: aBase64(Uint8Array.of(0xff, 0xfe)) },
    ],
    cadenas: ['Wall Ball', 'Extensión de cadera en cuadrupedia', 'Vuelta a la calma'].map((texto) => ({ texto, hex: hex(new TextEncoder().encode(texto)) })),
    sinDatosEnElDoble: [...NO_ENCONTRADAS],
  };
  return `${JSON.stringify(cuerpo, null, 2)}\n`;
}

/** Un fichero legible: la cabecera en líneas sueltas y cada paso en la suya. */
function vectorDeCaso({ caso, meta }: ReturnType<typeof casosConVector>[number]): { nombre: string; texto: string; bytes: number } {
  const { flujo } = flujoDeSesion(caso.plan, meta);
  const bytes = aBinario(flujo);
  const plan = canonico(caso.plan);
  const l = (k: string, v: unknown) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  const lineas = [
    l('caso', caso.clave),
    l('sesion', caso.numero),
    l('etiqueta', caso.etiqueta),
    l('fuente', caso.fuente),
    l('esquema', flujo.version),
    l('bytes', bytes.length),
    l('hex', hex(bytes)),
    l('base64', aBase64(bytes)),
    l('sobre', envolver(bytes, flujo.version)),
    l('cadenas', flujo.cadenas),
    l('valores', flujo.tokens),
    l('meta', meta),
    `  "plan": {\n${Object.entries(plan)
      .filter(([k]) => k !== 'pasos')
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`)
      .join('')}    "pasos": [\n${plan.pasos.map((p) => `      ${JSON.stringify(p)}`).join(',\n')}\n    ]\n  }`,
  ];
  return { nombre: `${caso.clave}.json`, texto: `{\n${lineas.join(',\n')}\n}\n`, bytes: bytes.length };
}

/** Todos los ficheros de vectores: nombre → contenido exacto. */
export function generarVectores(): Map<string, string> {
  const out = new Map<string, string>();
  out.set('00-basicos.json', vectoresBasicos());
  const indice: Array<{ caso: string; sesion: string | null; pasos: number; bytes: number }> = [];
  for (const c of casosConVector()) {
    const v = vectorDeCaso(c);
    out.set(v.nombre, v.texto);
    indice.push({ caso: c.caso.clave, sesion: c.caso.numero, pasos: c.caso.plan.pasos.length, bytes: v.bytes });
  }
  out.set('indice.json', `${JSON.stringify({ esquema: VERSION_ESQUEMA, casos: indice }, null, 2)}\n`);
  return out;
}
