'use client';

// EL FINAL — la sesión acaba y la muñeca lo dice (P9, P13).
//
//   Completada  el final natural TIENE pantalla (hoy se congela la lámina y
//               los toques siguen grabando vueltas fantasma, P0-1). Dice si
//               está completa o parcial, y por qué — lo decide lo hecho
//               (`completitud`), nunca un `.partial` cableado (P0-2). Guardar,
//               o Seguir: sigue grabando un enfriamiento libre.
//               Tras «Terminar y guardar» (ya confirmado), no pregunta otra
//               vez: dice cómo quedó y pasa al RPE.
//   RPE         en la corona, 0–10 con palabras (las del coach: dato con
//               defecto); también va a Salud como esfuerzo del entreno. Se
//               puede saltar. Empieza en «—»: el número es del atleta, no una
//               sugerencia que lo ancle.

import { useEffect, useState } from 'react';
import {
  ANCHO_UTIL,
  BotonAccion,
  C,
  Columna,
  ContextoLinea,
  FILA,
  Heroe,
  Instruccion,
  Nota,
  RPE_PALABRA_DEFECTO,
  T,
  altoHeroe,
  cuerpoQueCabe,
  fmtDistancia,
  fmtReloj,
  type Emision,
  type Eventos,
  type GestoGuion,
} from '../../kit-reloj';
import type { Completitud } from './calculo';
import { Pila } from './pila';

const SIN_LADOS = 'La sesión ya terminó: no hay Controles ni Ahora suena';

// ---------------------------------------------------------------------------
// Sesión completada / terminada
// ---------------------------------------------------------------------------

function Sello() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={C.tinta2} strokeWidth="1.6" />
      <path d="M7.5 12.5 10.3 15.3 16.5 9" fill="none" stroke={C.tinta} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ESTADO = { completa: 'Completa', parcial: 'Parcial', libre: 'Libre' } as const;

/** «Completa · 6 de 6 series», «Parcial · 4 de 6 series», «Libre · 5,21 km». */
export function lineaCompletitud(c: Completitud, metros: number | null, libreS = 0): string {
  const d = metros != null ? fmtDistancia(metros) : null;
  const detalle = libreS > 0 ? `+ ${fmtReloj(libreS)} libre` : c.estado === 'libre' ? (d ? `${d.valor} ${d.unidad}` : null) : c.cuenta;
  return detalle ? `${ESTADO[c.estado]} · ${detalle}` : ESTADO[c.estado];
}

export function Completada({
  natural,
  completitud,
  metros,
  libreS,
  onGuardar,
  onSeguir,
  onSigue,
  ultimo,
  guion,
  onLog,
}: {
  /** Final natural: se decide aquí (Guardar / Seguir). Si no, ya se confirmó «Terminar y guardar». */
  natural: boolean;
  completitud: Completitud;
  metros: number | null;
  libreS: number;
  onGuardar: () => void;
  onSeguir: () => void;
  /** Tras un «Terminar y guardar» ya confirmado: pasa sola al RPE. */
  onSigue: () => void;
  ultimo: Emision | null;
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  onLog: (l: string) => void;
}) {
  const decide = natural && libreS === 0;
  useEffect(() => {
    if (decide) return;
    const t = setTimeout(onSigue, 2400);
    return () => clearTimeout(t);
    // Una vez por montaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const titulo = natural ? 'Sesión completada' : 'Sesión terminada';
  const linea = lineaCompletitud(completitud, metros, libreS);
  return (
    <Pila
      paginas={[
        {
          id: 'fin',
          titulo,
          contenido: (
            <Columna estilo={{ justifyContent: 'center', gap: 6 }}>
              <Sello />
              <span style={{ fontSize: cuerpoQueCabe(titulo, T.tercero.cuerpo, ANCHO_UTIL), fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{titulo}</span>
              <Nota tono={C.tinta}>{linea}</Nota>
              {completitud.motivo ? <Nota>{completitud.motivo}</Nota> : null}
              {decide ? (
                <div style={{ display: 'flex', gap: 6, width: '100%', height: FILA.boton, alignItems: 'center', padding: '0 4px', boxSizing: 'border-box', marginTop: 6 }}>
                  <BotonAccion etiqueta="Seguir" variante="superficie" ancho={80} onPulsa={onSeguir} />
                  <BotonAccion etiqueta="Guardar" ancho={98} onPulsa={onGuardar} />
                </div>
              ) : null}
            </Columna>
          ),
        },
      ]}
      accion={decide ? { etiqueta: 'guardar', hacer: onGuardar } : null}
      ultimo={ultimo}
      guion={guion}
      sinLados={SIN_LADOS}
      onLog={onLog}
    />
  );
}

// ---------------------------------------------------------------------------
// El RPE en la corona
// ---------------------------------------------------------------------------

/** 0 no está en la tabla del coach (1–10): en CR-10 es «nada». Dato con defecto, como el resto. */
const PALABRA_CERO = 'nada';

function palabra(v: number): string {
  return v === 0 ? PALABRA_CERO : (RPE_PALABRA_DEFECTO[v] ?? '');
}

function Escala({ valor }: { valor: number | null }) {
  return (
    <div aria-hidden style={{ display: 'flex', gap: 3, width: '100%', height: 8, padding: '0 10px', boxSizing: 'border-box', flex: '0 0 auto' }}>
      {Array.from({ length: 11 }, (_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            borderRadius: 3,
            background: valor != null && i <= valor ? C.tinta : C.carril,
            transition: 'background-color 160ms ease',
          }}
        />
      ))}
    </div>
  );
}

export function Rpe({
  eventos,
  onHecho,
  guion,
  onLog,
}: {
  eventos: Eventos;
  onHecho: (rpe: number | null) => void;
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  onLog: (l: string) => void;
}) {
  const [valor, setValor] = useState<number | null>(null);
  const girar = (dir: 1 | -1) => {
    // Corona hacia arriba = más esfuerzo (como el selector de Apple). Los
    // topes de la corona los vibra el sistema: no son un evento de la sesión.
    const n = valor == null ? (dir === -1 ? 1 : 0) : Math.min(10, Math.max(0, valor - dir));
    if (n === valor) return;
    setValor(n);
    onLog(`Corona → RPE ${n} · ${palabra(n)}`);
  };
  const hecho = () => {
    if (valor == null) {
      onLog('Hecho sin valor — gira la corona primero (o Saltar)');
      return;
    }
    eventos.emitir('accion');
    onLog(
      valor === 0
        ? 'RPE 0 · nada → a la sesión. Salud no lo admite (su esfuerzo va de 1 a 10)'
        : `RPE ${valor} · ${palabra(valor)} → a la sesión y a Salud (esfuerzo del entreno, ${valor}/10)`,
    );
    onHecho(valor);
  };
  const saltar = () => {
    eventos.emitir('accion');
    onLog('RPE saltado → la sesión se guarda sin RPE; a Salud no va nada');
    onHecho(null);
  };
  const filas: Array<keyof typeof FILA> = ['contexto', 'instruccion', 'nota', 'boton'];
  const alto = altoHeroe(filas) - 8 - 4;
  return (
    <Pila
      paginas={[
        {
          id: 'rpe',
          titulo: 'Esfuerzo',
          contenido: (
            <Columna>
              <ContextoLinea partes={['¿Cómo de dura ha sido?']} tono={C.tinta2} />
              <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Heroe heroe={{ clase: 'crono', texto: valor == null ? '—' : String(valor) }} altoMax={alto} tono={valor == null ? C.tinta2 : C.tinta} />
              </div>
              <Escala valor={valor} />
              <Instruccion texto={valor == null ? 'gira la corona' : palabra(valor)} tono={valor == null ? C.tinta2 : C.tinta} />
              <Nota>{valor === 0 ? 'Solo a la sesión: Salud va de 1 a 10' : 'También a Salud · esfuerzo'}</Nota>
              <div style={{ display: 'flex', gap: 6, width: '100%', height: FILA.boton, alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxSizing: 'border-box' }}>
                {valor == null ? (
                  <BotonAccion etiqueta="Saltar" variante="superficie" onPulsa={saltar} />
                ) : (
                  <>
                    <BotonAccion etiqueta="Saltar" variante="superficie" ancho={80} onPulsa={saltar} />
                    <BotonAccion etiqueta="Hecho" ancho={98} onPulsa={hecho} />
                  </>
                )}
              </div>
            </Columna>
          ),
        },
      ]}
      corona={girar}
      accion={{ etiqueta: 'hecho', hacer: hecho }}
      ultimo={eventos.ultimo}
      guion={guion}
      sinLados={SIN_LADOS}
      onLog={onLog}
    />
  );
}
