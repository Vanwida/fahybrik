// LOS VECTORES DE ORO DE LA MUÑECA DE CORRER — del kit web al Swift.
//
// El kit (`kit-reloj/`) es la fuente de diseño de la muñeca: decide qué se pinta
// (`laminaDelPaso`), cómo se lee cada página (`filasDeDatos`, `filasDeVueltas`,
// `textoFila`) y a qué cuerpo cabe cada fila (los componentes de `pasos.tsx` y
// `piezas.tsx`). El reloj lo reimplementa en Swift (`FAHYBRIKCore/Vivo`,
// `Vivo+Muneca`): estos vectores son el contrato entre los dos. Un cambio en el
// kit que el Swift no siga (o al revés) hace fallar el examen de iOS
// (`MunecaCorrerTests`), y este fichero se regenera con:
//
//   cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/muneca-correr-vectores.ts
//
// Qué lleva cada vector:
//   · el PLAN de cada sesión de correr del doble tal como lo lee el Swift (los
//     pasos con las claves de `paso.ts`; el Swift los decodifica desde aquí);
//   · por cada paso significativo y cada SITUACIÓN de lecturas (arranque, dentro,
//     rápido, lento, sin enlace), el CUADRO en líneas de texto («plano»): héroe,
//     banda, líneas y los cuerpos a los que caben. El plano es el mismo formato
//     en los dos lados; se compara línea a línea;
//   · la estructura, la página Datos y las Vueltas.
//
// Los componentes de la muñeca (`PasoCorrer`, `Recupera`, `Descanso`,
// `TresDosUno`) deciden sus filas dentro del JSX: aquí se reproducen esas
// decisiones (qué filas hay y cuánto alto le dejan al héroe) llamando a las
// mismas funciones del kit. Si un componente cambia sus filas, este espejo se
// actualiza en el mismo commit.

import { estructuraDe } from '@/components/design-twin/kit-reloj/estructura';
import { heroeDelPaso, laminaDelPaso, lineaPulso, type Lamina, type LineaVista } from '@/components/design-twin/kit-reloj/lamina';
import { filasDeDatos, filasDeVueltas, textoFila } from '@/components/design-twin/kit-reloj/listas';
import type { Lecturas, PasoBase, Sesion, Vuelta, ZonasCoach } from '@/components/design-twin/kit-reloj/paso';
import type { PlanSesion } from '@/components/design-twin/kit-reloj/secuencia';
import { lineasDeNota } from '@/components/design-twin/kit-reloj/piezas';
import { textoCuenta } from '@/components/design-twin/kit-reloj/pasos';
import { luegoDe, textoViene } from '@/components/design-twin/kit-reloj/posicion';
import { contextoDe, principal, tinteDelPaso } from '@/components/design-twin/kit-reloj/reglas';
import {
  ANCHO_CABEZA,
  ANCHO_HEROE,
  ANCHO_PIE,
  ANCHO_UTIL,
  FILA,
  T,
  altoHeroe,
  ALTO_UTIL,
  anchoTexto,
  cuerpoQueCabe,
  tallaHeroe,
} from '@/components/design-twin/kit-reloj/tokens';
import { casosConVector, type CasoPlan } from './garmin-plan-casos';

/** Dónde se escribe, relativa a `web/`: el Swift lo lee desde su carpeta de tests. */
export const RUTA_VECTORES = '../ios/FAHYBRIKTests/Vivo/Vectores/muneca-correr.json';
export const AYUDA = 'Regenera los vectores: cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/muneca-correr-vectores.ts';

/** Las sesiones que se examinan: todo lo de correr, el correr libre y la Cursa 5K (552). */
export const esDeCorrer = (c: CasoPlan) => c.familia === 'correr' || c.familia === 'libre' || c.clave === '552';

// ---------------------------------------------------------------------------
// El plano: el cuadro en líneas de texto, igual en los dos lados
// ---------------------------------------------------------------------------

/** Un número a 3 decimales, sin ceros de más ni «-0». */
export function n3(x: number): string {
  const r = Math.round(x * 1000) / 1000;
  return String(r === 0 ? 0 : r);
}
const S = (x: string | null | undefined) => (x == null || x === '' ? '-' : x);
const un = (partes: Array<string | number | boolean | null | undefined>) => partes.map((x) => (x == null ? '-' : typeof x === 'number' ? n3(x) : String(x))).join('|');

/** «#8FB3D9» de una zona. */
const zona = (z: { n: number; color: string } | undefined | null) => (z ? `Z${z.n}${z.color.toUpperCase()}` : '-');

function extraDeLinea(l: LineaVista): number {
  return (
    (l.etiqueta ? anchoTexto(l.etiqueta, T.nota.cuerpo) + 6 : 0) +
    (l.glifo ? 18 : 0) +
    (l.unidad ? anchoTexto(l.unidad, T.nota.cuerpo) + 3 : 0) +
    (l.tendencia ? 14 : 0) +
    (l.zona ? 28 : 0) +
    (l.aviso ? anchoTexto(`${l.aviso.marca} ${l.aviso.texto}`, T.nota.cuerpo) + 8 : 0)
  );
}

function planoLinea(clave: string, l: LineaVista | null, cuerpo: 30 | 22, ancho: number): string[] {
  if (!l) return [];
  const c = cuerpoQueCabe(l.valor, cuerpo, ancho - extraDeLinea(l));
  return [`${clave}=${un([l.etiqueta, l.valor, l.unidad, l.glifo ? 'pulso' : null, l.tendencia, zona(l.zona), l.aviso ? `${l.aviso.marca} ${l.aviso.texto}` : null, c])}`];
}

/** El contexto como lo pinta `ContextoLinea`: quita partes por el final hasta que cabe y baja de 16 a 15. */
function planoContexto(partes: string[]): string {
  let usadas = partes.filter(Boolean);
  const cabe = (x: string[]) => anchoTexto(x.join(' · '), T.suelo, T.contexto.peso) <= ANCHO_CABEZA;
  while (usadas.length > 1 && !cabe(usadas)) usadas = usadas.slice(0, -1);
  const texto = usadas.join(' · ');
  return `ctx=${un([texto, cuerpoQueCabe(texto, T.contexto.cuerpo, ANCHO_CABEZA, T.contexto.peso)])}`;
}

function planoHeroe(h: Lamina['heroe'], filas: Array<keyof typeof FILA>): string {
  const alto = altoHeroe(filas) - (h.etiqueta != null ? FILA.etiquetaHeroe : 0);
  const t = tallaHeroe(h.texto, h.unidad, ANCHO_HEROE, alto);
  return `heroe=${un([h.clase, h.texto, h.unidad, h.etiqueta, zona(h.zona), t.cuerpo, t.cuerpoUnidad])}`;
}

function planoBanda(b: Lamina['banda']): string[] {
  if (!b) return [];
  const p = b.palabra ? `${b.palabra.marca ?? ''}${b.palabra.texto}` : null;
  const zs = b.zonas ? `${b.zonas.colores.map((c) => c.toUpperCase()).join(',')}@${b.zonas.objetivo.join('-')}` : null;
  return [`banda=${un([b.eje, b.desde, b.hasta, b.marca, b.veredicto, b.rotulo, p, zs])}`];
}

const nota = (texto: string, prefijo?: string) => `${prefijo ? `${prefijo} ` : ''}${texto}`;

/** `PasoCorrer`: un paso de trabajo. */
function planoPaso(p: PasoBase, lec: Lecturas, zonas: ZonasCoach | null, reglas: PlanSesion['reglas']): string[] {
  const l = laminaDelPaso(p, lec, zonas, reglas);
  const filas: Array<keyof typeof FILA> = ['contexto'];
  if (l.nota) filas.push(lineasDeNota(l.nota) === 2 ? 'nota2' : 'nota');
  if (l.banda) filas.push('banda');
  if (l.instruccion) filas.push('instruccion');
  if (l.segundo) filas.push('segundo');
  if (l.tercero) filas.push('tercero');
  return [
    'cara=paso',
    planoContexto(l.contexto),
    ...(l.nota ? [`nota=${un([l.nota, lineasDeNota(l.nota)])}`] : []),
    planoHeroe(l.heroe, filas),
    ...planoBanda(l.banda),
    ...(l.instruccion ? [`instr=${un([l.instruccion, cuerpoQueCabe(l.instruccion, T.tercero.cuerpo, ANCHO_UTIL)])}`] : []),
    ...planoLinea('segundo', l.segundo, 30, l.tercero ? ANCHO_UTIL : ANCHO_PIE),
    ...planoLinea('tercero', l.tercero, 22, ANCHO_PIE),
    `tinte=${S(tinteDelPaso(p, lec, zonas)).toUpperCase()}`,
  ];
}

/** `Recupera`: monocromo, «Luego ·» y la acción. */
function planoRecupera(p: PasoBase, sig: PasoBase | null, lec: Lecturas, zonas: ZonasCoach | null): string[] {
  const l = laminaDelPaso(p, lec, zonas);
  const heroe = { ...heroeDelPaso(p, lec, zonas), etiqueta: undefined };
  const pulso = l.tercero ? { ...l.tercero, zona: undefined } : null;
  const luego = sig ? nota(textoViene(sig), 'Luego ·') : null;
  const filas: Array<keyof typeof FILA> = ['contexto', 'tercero', 'pista'];
  if (sig) filas.push('nota');
  return [
    'cara=recupera',
    planoContexto(contextoDe(p)),
    planoHeroe(heroe, filas),
    ...(luego ? [`luego=${un([luego, lineasDeNota(luego)])}`] : []),
    ...planoLinea('pulso', pulso, 22, ANCHO_PIE),
  ];
}

/** `Descanso`: cuenta atrás, «Viene:», +30 s y Empezar ya. */
function planoDescanso(p: PasoBase, sig: PasoBase | null, lec: Lecturas): string[] {
  const heroe = { ...heroeDelPaso(p, lec, null), etiqueta: undefined };
  const pulso = lec.ppm != null ? { ...lineaPulso(p, lec, null), zona: undefined } : null;
  const viene = sig ? nota(textoViene(sig), 'Viene:') : null;
  const filas: Array<keyof typeof FILA> = ['contexto', 'boton'];
  if (viene) filas.push(lineasDeNota(viene) === 2 ? 'nota2' : 'nota');
  if (pulso) filas.push('tercero');
  return [
    'cara=descanso',
    planoContexto(contextoDe(p)),
    planoHeroe(heroe, filas),
    ...(viene ? [`viene=${un([viene, lineasDeNota(viene)])}`] : []),
    ...planoLinea('pulso', pulso, 22, ANCHO_UTIL),
  ];
}

/** `TresDosUno`: a qué entras y el número (0 = GO). */
function planoCuenta(n: number, p: PasoBase): string[] {
  const que = textoCuenta(p);
  const filas: Array<keyof typeof FILA> = que ? ['contexto', 'instruccion'] : ['contexto'];
  return [
    planoContexto(contextoDe(p)),
    ...(que ? [`que=${un([que, cuerpoQueCabe(que, T.tercero.cuerpo, ANCHO_UTIL)])}`] : []),
    planoHeroe({ clase: 'crono', texto: n > 0 ? String(n) : 'GO' }, filas),
  ];
}

// ---------------------------------------------------------------------------
// Las situaciones: lecturas deterministas por paso
// ---------------------------------------------------------------------------

export interface Situacion {
  n: string;
  lec: Lecturas;
  sesion: Sesion;
}

const SESION = { t: 1234, metros: 5230, ritmoMedio: 330, ppmMedio: 152 };
const SESION_SIN_METROS = { t: 12, metros: null, ritmoMedio: null, ppmMedio: null };

/** Ritmo de crucero del paso (s/km): el centro de su banda, o uno razonable. */
function ritmoDe(p: PasoBase): number {
  const o = principal(p);
  if (o?.eje === 'ritmo' && o.min != null && o.max != null) return (o.min + o.max) / 2;
  return p.rol === 'recuperacion' ? 400 : 330;
}

/** El centro de la zona (o el pulso objetivo) del paso, o 150. */
function ppmDe(p: PasoBase, zonas: ZonasCoach | null): number {
  const o = principal(p);
  if (!zonas) return 150;
  if (o?.eje === 'zona' && o.max != null) {
    const k = Math.min(zonas.techos.length, Math.max(1, o.max));
    const hi = zonas.techos[k - 1]!;
    const lo = k > 1 ? zonas.techos[k - 2]! + 1 : hi - 20;
    return Math.round((lo + hi) / 2);
  }
  return p.rol === 'trabajo' ? 150 : 128;
}

function hechoDe(p: PasoBase, fraccion: number, t: number): number | null {
  const pr = p.medida.prescrito;
  if (p.medida.tipo === 'tiempo') return t;
  if (p.medida.tipo === 'distancia' && p.medida.mide !== 'atleta' && pr != null) return Math.round(pr * fraccion);
  return null;
}

export function situacionesDe(p: PasoBase, zonas: ZonasCoach | null): Situacion[] {
  const pr = p.medida.prescrito;
  const cinta = p.entorno === 'cinta';
  const gps = cinta ? 'no-aplica' : 'listo';
  const tDentro = p.medida.tipo === 'tiempo' && pr != null ? Math.round(pr * 0.4) : p.medida.tipo === 'distancia' && pr != null ? Math.round((pr * 0.4 * ritmoDe(p)) / 1000) : 60;
  const o = principal(p);
  const ritmoRapido = (o?.eje === 'ritmo' && o.min != null ? o.min : ritmoDe(p)) - 12;
  const ritmoLento = (o?.eje === 'ritmo' && o.max != null ? o.max : ritmoDe(p)) + 15;
  const ppm = ppmDe(p, zonas);
  const zTecho = zonas && o?.eje === 'zona' && o.max != null ? zonas.techos[Math.min(zonas.techos.length, o.max) - 1]! : ppm + 12;
  const base = (): Lecturas => ({
    t: tDentro,
    hecho: hechoDe(p, 0.4, tDentro),
    ritmo: Math.round(ritmoDe(p)),
    ppm,
    ppmTendencia: 'estable',
    split500: null,
    vatios: null,
    cadencia: null,
    cal: null,
    gps,
  });
  return [
    { n: 'arranque', lec: { t: 0, hecho: p.medida.tipo === 'tiempo' ? 0 : null, ritmo: null, ppm: null, split500: null, vatios: null, cadencia: null, cal: null, gps: cinta ? 'no-aplica' : 'buscando' }, sesion: SESION_SIN_METROS },
    { n: 'dentro', lec: base(), sesion: SESION },
    { n: 'rapido', lec: { ...base(), ritmo: Math.round(ritmoRapido), ppm: zTecho + 5, ppmTendencia: 'sube' }, sesion: SESION },
    { n: 'lento', lec: { ...base(), ritmo: Math.round(ritmoLento), ppm: ppm - 14, ppmTendencia: 'baja' }, sesion: SESION },
    { n: 'sin-enlace', lec: { ...base(), viejos: ['ritmo', 'hecho'] }, sesion: SESION },
  ];
}

// ---------------------------------------------------------------------------
// Los pasos que se examinan
// ---------------------------------------------------------------------------

/**
 * Los pasos significativos de una sesión: el primero, el último y, de cada clase
 * de paso (clase · rol · fase · entorno), la primera, la segunda y la última
 * aparición. Una sesión de 60 pasos se examina en unos doce sin dejar ninguna
 * clase sin mirar.
 */
export function indicesClave(pasos: PasoBase[]): number[] {
  const grupos = new Map<string, number[]>();
  pasos.forEach((p, i) => {
    const k = `${p.clase}|${p.rol}|${p.fase}|${p.entorno ?? ''}|${p.posicion?.tramo ? 'tramo' : ''}`;
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  });
  const set = new Set<number>([0, pasos.length - 1]);
  for (const idx of grupos.values()) {
    set.add(idx[0]!);
    if (idx[1] != null) set.add(idx[1]);
    set.add(idx[idx.length - 1]!);
  }
  return [...set].sort((a, b) => a - b);
}

/** La estructura en líneas de texto para el paso `i`. */
function planoEstructura(pasos: PasoBase[], i: number): string[] {
  return estructuraDe(pasos)(i).map((f) => {
    const t = textoFila(f);
    return `${f.estado}|${t.linea}|${S(t.detalle)}`;
  });
}

const VUELTAS_SERIES: Vuelta[] = [
  { n: 1, clase: 'serie', segundos: 232, metros: 1000, ritmo: 232, ppm: 171, veredicto: 'dentro', eje: 'ritmo' },
  { n: 2, clase: 'serie', segundos: 228, metros: 1000, ritmo: 228, ppm: 174, veredicto: 'por-encima', eje: 'ritmo' },
  { n: 3, clase: 'serie', segundos: 241, metros: 1000, ritmo: 241, ppm: 176, veredicto: 'por-debajo', eje: 'ritmo' },
];
const VUELTAS_TANDAS: Vuelta[] = [
  { n: 5, tanda: 1, clase: 'serie', segundos: 60, metros: 312, ritmo: 192, ppm: 168, veredicto: 'dentro', eje: 'zona' },
  { n: 6, tanda: 1, clase: 'serie', segundos: 60, metros: 305, ritmo: 197, ppm: 171, veredicto: 'por-encima', eje: 'zona' },
  { n: 1, tanda: 2, clase: 'serie', segundos: 60, metros: 298, ritmo: 201, ppm: 160, veredicto: 'por-debajo', eje: 'zona' },
];
const VUELTAS_KM: Vuelta[] = [
  { n: 1, clase: 'km', segundos: 331, metros: 1000, ritmo: 331, ppm: 148, veredicto: null },
  { n: 2, clase: 'km', segundos: 328, metros: 1000, ritmo: 328, ppm: 151, veredicto: null },
];
const VUELTAS_TRAMOS: Vuelta[] = [
  { n: 1, clase: 'tramo', segundos: 95, metros: 430, ritmo: 221, ppm: null, veredicto: null },
  { n: 2, clase: 'tramo', segundos: 40, metros: 30, ritmo: null, ppm: null, veredicto: null },
];

function vectoresDeVueltas() {
  const casos: Array<[string, Vuelta[], string | null, number]> = [
    ['series', VUELTAS_SERIES, '3:45–3:55', 4],
    ['series-5', VUELTAS_SERIES, '3:45–3:55', 5],
    ['tandas', VUELTAS_TANDAS, null, 4],
    ['km', VUELTAS_KM, null, 5],
    ['tramos', VUELTAS_TRAMOS, null, 5],
    ['vacia-con-objetivo', [], '4:00', 4],
    ['vacia', [], null, 5],
  ];
  return casos.map(([n, vueltas, objetivo, visibles]) => {
    const r = filasDeVueltas(vueltas, objetivo, visibles);
    return {
      n,
      vueltas,
      objetivo,
      visibles,
      titulo: r.titulo,
      // La última primero, como la pinta PaginaSplits.
      filas: [...r.filas].reverse().slice(0, visibles).map((f) => un([f.n, f.valor, f.detalle, f.juicio ? `${f.juicio.texto}#${f.juicio.fuera}` : null])),
    };
  });
}

// ---------------------------------------------------------------------------
// El documento
// ---------------------------------------------------------------------------

export function generarVectoresMuneca(): string {
  const casos = casosConVector().map((x) => x.caso).filter(esDeCorrer);
  const salida = casos.map((c) => {
    const { pasos, zonas, reglas } = c.plan;
    const pasosVectores = indicesClave(pasos).map((i) => {
      const p = pasos[i]!;
      const sig = pasos[i + 1] ?? null;
      const luego = luegoDe(pasos, i);
      return {
        i,
        viene: sig ? textoViene(sig) : null,
        luego: luego ? [luego.que, luego.despues] : null,
        cuenta: planoCuenta(3, sig ?? p),
        go: planoCuenta(0, p),
        situaciones: situacionesDe(p, zonas).map((s) => ({
          n: s.n,
          lec: s.lec,
          sesion: s.sesion,
          plano: p.rol === 'recuperacion' ? planoRecupera(p, sig, s.lec, zonas) : p.rol === 'descanso' ? planoDescanso(p, sig, s.lec) : planoPaso(p, s.lec, zonas, reglas),
          datos: filasDeDatos(s.sesion, s.lec, p.entorno === 'cinta' ? 'cinta' : undefined).map((f) => un([f.valor, f.unidad, f.ppm != null && zonas ? zonaDePpm(f.ppm, zonas) : null])),
        })),
      };
    });
    const idxEstructura = [...new Set([0, Math.floor(pasos.length / 2), pasos.length - 1])];
    return {
      clave: c.clave,
      etiqueta: c.etiqueta,
      plan: { pasos, zonas, reglas },
      pasos: pasosVectores,
      estructura: idxEstructura.map((i) => ({ i, filas: planoEstructura(pasos, i) })),
    };
  });
  return serializar({
    descripcion: 'Vectores de oro de la muñeca de correr: el kit web produce el plano de cada cuadro; el Swift (Vivo+Muneca) tiene que producir el mismo.',
    regenerar: AYUDA,
    lienzo: { anchoUtil: ANCHO_UTIL, anchoHeroe: ANCHO_HEROE, anchoCabeza: ANCHO_CABEZA, anchoPie: ANCHO_PIE, altoUtil: ALTO_UTIL },
    vueltas: vectoresDeVueltas(),
    casos: salida,
  });
}

function zonaDePpm(ppm: number, z: ZonasCoach): string {
  const k = z.techos.findIndex((t) => ppm <= t);
  return `Z${k === -1 ? z.techos.length : k + 1}`;
}

/** JSON con una línea por caso, por paso y por situación: se lee y se difea. */
function serializar(doc: { descripcion: string; regenerar: string; lienzo: unknown; vueltas: unknown[]; casos: Array<Record<string, unknown>> }): string {
  const l: string[] = ['{'];
  l.push(` "descripcion": ${JSON.stringify(doc.descripcion)},`);
  l.push(` "regenerar": ${JSON.stringify(doc.regenerar)},`);
  l.push(` "lienzo": ${JSON.stringify(doc.lienzo)},`);
  l.push(` "vueltas": [`);
  doc.vueltas.forEach((v, k) => l.push(`  ${JSON.stringify(v)}${k < doc.vueltas.length - 1 ? ',' : ''}`));
  l.push(' ],');
  l.push(' "casos": [');
  doc.casos.forEach((c, k) => {
    const pasos = c.pasos as Array<{ situaciones: unknown[] } & Record<string, unknown>>;
    l.push('  {');
    l.push(`   "clave": ${JSON.stringify(c.clave)},`);
    l.push(`   "etiqueta": ${JSON.stringify(c.etiqueta)},`);
    l.push(`   "plan": ${JSON.stringify(c.plan)},`);
    l.push(`   "estructura": ${JSON.stringify(c.estructura)},`);
    l.push('   "pasos": [');
    pasos.forEach((p, j) => {
      const { situaciones, ...resto } = p;
      l.push(`    {"paso": ${JSON.stringify(resto)}, "situaciones": [`);
      (situaciones as unknown[]).forEach((s, m) => l.push(`     ${JSON.stringify(s)}${m < situaciones.length - 1 ? ',' : ''}`));
      l.push(`    ]}${j < pasos.length - 1 ? ',' : ''}`);
    });
    l.push('   ]');
    l.push(`  }${k < doc.casos.length - 1 ? ',' : ''}`);
  });
  l.push(' ]');
  l.push('}');
  return `${l.join('\n')}\n`;
}
