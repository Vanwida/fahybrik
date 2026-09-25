'use client';

// LAS CARAS DE LA SERIE (P11) — compuestas con las piezas del kit.
//
//   CaraSerie     el nombre del ejercicio PRIMERO (A1/A2 en superserie), la
//                 serie k/K, las reps (o la cuenta del sensor, o la cuenta
//                 atrás de una isometría), la carga y el esfuerzo —los dos
//                 ejes—, la acción del momento y lo que viene.
//   CaraColocate  el paso corto antes de una isometría que no sale de un
//                 descanso: cuenta atrás con el 3-2-1 del kit.
//   CuentaFuerza  el 3-2-1 / GO a pantalla completa con el nombre y la dosis
//                 (el `TresDosUno` del kit dice «a 65–70 %», sin «RM» ni kg).
//
// Presupuesto vertical: el héroe se queda lo que sobra. Si una fila no cabe
// sin bajar el héroe de `HEROE_MIN`, se cae la de menos prioridad: primero
// el cue, luego «Luego ·» (también está en el descanso y en Ejercicios).

import type { ReactNode } from 'react';
import {
  ALTO_UTIL,
  ANCHO_CABEZA,
  ANCHO_PIE,
  ANCHO_UTIL,
  C,
  Columna,
  ContextoLinea,
  FILA,
  HUECO,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  PistaAccion,
  anchoTexto,
  faltaDe,
  fmtDuracion,
  fmtReloj,
  lineaPulso,
  lineasDeNota,
  useCabe,
  useFilaAccion,
  type HeroeVista,
  type Lecturas,
  type PasoBase,
} from '../../kit-reloj';
import { dosisSerie, textoCarga, textoEsfuerzo, textoPct, textoTempo, type PasoFuerza } from './modelo';
import { quienSerie } from './textos';

/** El héroe no baja de aquí (alto de caja en pt: ≈ 45 pt de cuerpo, por encima del suelo del héroe). */
const HEROE_MIN = 38;

/** Lo que le queda de alto al héroe con estas filas. */
export function altoLibre(filas: number[]): number {
  return ALTO_UTIL - filas.reduce((a, h) => a + h + HUECO, 0) - HUECO;
}

const altoNota = (texto: string, ancho: number = ANCHO_UTIL) => (lineasDeNota(texto, ancho) === 2 ? FILA.nota2 : FILA.nota);

/** El hueco elástico donde se centra el héroe. */
export function Centro({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El nombre del ejercicio: una línea si cabe bajo las esquinas; si no, dos
// ---------------------------------------------------------------------------

export interface NombreMedido {
  lineas: string[];
  cuerpo: number;
  alto: number;
}

const ancho = (s: string, c: number) => anchoTexto(s, c, 600);

function partir(texto: string, c: number): [string, string] | null {
  const w = texto.split(' ');
  let mejor: [string, string] | null = null;
  let peor = Infinity;
  for (let k = 1; k < w.length; k++) {
    const a = w.slice(0, k).join(' ');
    const b = w.slice(k).join(' ');
    if (a.endsWith('·') || b.startsWith('·')) continue;
    const m = Math.max(ancho(a, c), ancho(b, c));
    if (m < peor) {
      peor = m;
      mejor = [a, b];
    }
  }
  return mejor;
}

/** Cómo va el nombre: la primera fila cabe bajo las esquinas de arriba (`ANCHO_CABEZA`). */
export function medirNombre(slot: string | undefined, nombre: string): NombreMedido {
  const texto = slot ? `${slot} · ${nombre}` : nombre;
  for (const c of [22, 20]) if (ancho(texto, c) <= ANCHO_CABEZA) return { lineas: [texto], cuerpo: c, alto: FILA.instruccion };
  for (const c of [22, 20, 18]) {
    const par = partir(texto, c);
    if (par && ancho(par[0], c) <= ANCHO_CABEZA && ancho(par[1], c) <= ANCHO_UTIL) return { lineas: par, cuerpo: c, alto: 2 * Math.round(c * 1.1) };
  }
  return { lineas: partir(texto, 17) ?? [texto], cuerpo: 17, alto: 2 * 19 };
}

function LineaNombre({ texto, slot, cuerpo }: { texto: string; slot?: string; cuerpo: number }) {
  // Cinturón del kit: sin SF (Linux, capturas) la línea se escala lo justo.
  const ref = useCabe<HTMLSpanElement>();
  const prefijo = slot ? `${slot} · ` : null;
  const conPrefijo = prefijo != null && texto.startsWith(prefijo);
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', lineHeight: 1.1 }}>
      <span ref={ref} style={{ whiteSpace: 'nowrap', fontSize: cuerpo, fontWeight: 600, color: C.tinta, transformOrigin: 'center' }}>
        {conPrefijo ? <span style={{ color: C.tinta2 }}>{prefijo}</span> : null}
        {conPrefijo ? texto.slice(prefijo.length) : texto}
      </span>
    </div>
  );
}

/** El nombre, en una o dos líneas, con el hueco de la superserie en tinta2. */
export function NombreEjercicio({ m, slot }: { m: NombreMedido; slot?: string }) {
  return (
    <div style={{ width: '100%', height: m.alto, flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: m.lineas.length === 1 ? ANCHO_CABEZA : undefined }}>
      {m.lineas.map((l, k) => (
        <LineaNombre key={k} texto={l} slot={k === 0 ? slot : undefined} cuerpo={m.cuerpo} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La serie
// ---------------------------------------------------------------------------

/** «Serie 2/4 · 20″ · por pierna · cuenta el reloj» (o «lo dices tú»). Si no cabe, se cae por el final. */
function partesPosicion(p: PasoFuerza): string[] {
  const partes = [quienSerie(p)];
  if (p.medida.tipo === 'tiempo') partes.push(fmtDuracion(p.medida.prescrito ?? 0));
  if (p.fuerza.porLado) partes.push(`por ${p.fuerza.porLado}`);
  // Quién cuenta las reps, siempre dicho: el sensor o el atleta.
  if (p.medida.tipo === 'reps') partes.push(p.medida.mide === 'sensor' ? 'cuenta el reloj' : 'lo dices tú');
  return partes;
}

/** La línea de la carga: «121–131 kg · 65–70 % RM», «127,5 kg · 65–70 % RM», «carga tuya · última 140 kg». */
export function lineaCarga(p: PasoFuerza, arrastrada: number | null): string | null {
  const kg = textoCarga(p.fuerza, arrastrada);
  const pct = textoPct(p.fuerza.carga);
  if (!kg) return null;
  return pct && kg !== pct ? `${kg} · ${pct}` : kg;
}

/** La línea del esfuerzo: «RIR 3 · tempo 3-1-1». */
function lineaEsfuerzo(p: PasoFuerza): string[] {
  const out: string[] = [];
  if (p.fuerza.esfuerzo) out.push(textoEsfuerzo(p.fuerza.esfuerzo));
  if (p.tempo) out.push(`tempo ${textoTempo(p.tempo)}`);
  return out;
}

function heroeDeSerie(p: PasoFuerza, l: Lecturas): HeroeVista {
  const reps = p.medida.prescrito ?? 0;
  if (p.medida.tipo === 'tiempo') return { clase: 'falta', texto: fmtReloj(Math.ceil(faltaDe(p, l) ?? 0)), etiqueta: 'quedan' };
  // El sensor cuenta desde cero con la serie abierta: el 0 es medido, no inventado.
  if (p.medida.mide === 'sensor') return { clase: 'crono', texto: String(l.hecho ?? 0), unidad: `/ ${reps}` };
  return { clase: 'crono', texto: String(reps), unidad: 'reps' };
}

export function CaraSerie({
  paso,
  lecturas,
  arrastrada,
  luego,
}: {
  paso: PasoFuerza;
  lecturas: Lecturas;
  /** La carga declarada en la serie anterior del mismo ejercicio (cascada). */
  arrastrada: number | null;
  luego: string | null;
}) {
  const filaAccion = useFilaAccion();
  const nombre = medirNombre(paso.posicion?.slot, paso.nombre ?? '');
  let carga = lineaCarga(paso, arrastrada);
  let esfuerzo = lineaEsfuerzo(paso);
  // Espacios que no parten: si el cue va en dos líneas, «Coach ·» no se queda solo.
  let cue = esfuerzo.length === 0 && paso.cue ? `Coach\u00A0·\u00A0${paso.cue}` : null;
  // La velocidad de la barra NO va aquí: sale en el descanso, con la serie
  // entera y su confianza (DECISIONS 2026-08-06/11), junto al RIR que la etiqueta.
  let pie = luego ? `Luego · ${luego}` : null;

  const alto = () =>
    altoLibre([
      nombre.alto,
      FILA.contexto,
      carga ? FILA.instruccion : -HUECO,
      esfuerzo.length ? FILA.contexto : -HUECO,
      cue ? altoNota(cue) : -HUECO,
      filaAccion === 'pista' ? FILA.pista : FILA.boton,
      pie ? altoNota(pie, ANCHO_PIE) : -HUECO,
    ]);
  // Primero se cae el cue; «Luego ·» solo si la acción es un botón (la pista
  // de texto no puede ser la última fila: las esquinas se la comen).
  if (alto() < HEROE_MIN) cue = null;
  // Con el nombre en dos líneas no caben los dos ejes en dos filas: van en una
  // («carga tuya · RIR 3»), que se ajusta al ancho sin bajar de 15 pt.
  if (alto() < HEROE_MIN && carga && esfuerzo.length) {
    carga = [carga, ...esfuerzo].join(' · ');
    esfuerzo = [];
  }
  if (alto() < HEROE_MIN && filaAccion === 'boton') pie = null;

  return (
    <Columna>
      <NombreEjercicio m={nombre} slot={paso.posicion?.slot} />
      <ContextoLinea partes={partesPosicion(paso)} tono={C.tinta2} />
      <Centro>
        <Heroe heroe={heroeDeSerie(paso, lecturas)} altoMax={alto()} />
      </Centro>
      {carga ? <Instruccion texto={carga} /> : null}
      {esfuerzo.length ? <ContextoLinea partes={esfuerzo} /> : null}
      {cue ? <Nota>{cue}</Nota> : null}
      <PistaAccion accion="serie hecha" />
      {pie ? <Nota ancho={ANCHO_PIE}>{pie}</Nota> : null}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Colócate — antes de una isometría que no sale de un descanso
// ---------------------------------------------------------------------------

export function CaraColocate({ paso, lecturas, siguiente }: { paso: PasoBase; lecturas: Lecturas; siguiente: PasoFuerza }) {
  const filaAccion = useFilaAccion();
  const nombre = medirNombre(siguiente.posicion?.slot, siguiente.nombre ?? '');
  const f = faltaDe(paso, lecturas);
  // Monocromo, como todo lo que no es trabajo: el pulso sin el color de su zona.
  const pulso = { ...lineaPulso(paso, lecturas, null), zona: undefined };
  const alto = altoLibre([FILA.contexto, nombre.alto, FILA.contexto, filaAccion === 'pista' ? FILA.pista : FILA.boton, filaAccion === 'pista' ? FILA.tercero : -HUECO]);
  return (
    <Columna>
      <ContextoLinea partes={['Colócate']} />
      <NombreEjercicio m={nombre} slot={siguiente.posicion?.slot} />
      <ContextoLinea partes={[quienSerie(siguiente), dosisSerie(siguiente, null)]} tono={C.tinta2} />
      <Centro>
        <Heroe heroe={{ clase: 'falta', texto: f == null ? '—' : String(Math.ceil(f)), unidad: 's' }} altoMax={alto} />
      </Centro>
      <PistaAccion accion="empezar ya" />
      {filaAccion === 'pista' ? <Linea linea={pulso} cuerpo={22} ancho={ANCHO_PIE} /> : null}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// 3-2-1 y GO con el nombre y la dosis
// ---------------------------------------------------------------------------

export function CuentaFuerza({ n, paso, arrastrada }: { n: number; paso: PasoFuerza; arrastrada: number | null }) {
  const nombre = medirNombre(paso.posicion?.slot, paso.nombre ?? '');
  const alto = altoLibre([nombre.alto, FILA.contexto]);
  return (
    <Columna estilo={{ background: C.fondo }}>
      <NombreEjercicio m={nombre} slot={paso.posicion?.slot} />
      <ContextoLinea partes={[quienSerie(paso), dosisSerie(paso, arrastrada)]} tono={C.tinta2} />
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: n > 0 ? String(n) : 'GO' }} altoMax={alto} />
      </Centro>
    </Columna>
  );
}
