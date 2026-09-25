'use client';

// EL RPE — tras guardar, en la corona (P13): 0–10 con palabras (las del
// coach: dato con defecto, `RPE_PALABRA_DEFECTO`, que ya tiene el 0); también
// va a Salud como esfuerzo del entreno. Se puede saltar. Empieza en «—»: el
// número es del atleta, no una sugerencia que lo ancle.
//
// La pantalla de «Sesión completada» (completa o parcial según lo hecho,
// Guardar / Seguir) es del kit: `Completada`.

import { useState } from 'react';
import {
  BotonAccion,
  C,
  Columna,
  ContextoLinea,
  FILA,
  Heroe,
  Instruccion,
  Nota,
  Pila,
  RPE_PALABRA_DEFECTO,
  altoHeroe,
  type Eventos,
  type GestoGuion,
} from '../../kit-reloj';

const SIN_LADOS = 'La sesión ya terminó: no hay Controles ni Ahora suena';

// ---------------------------------------------------------------------------
// El RPE en la corona
// ---------------------------------------------------------------------------

function palabra(v: number): string {
  return RPE_PALABRA_DEFECTO[v] ?? '';
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
  const girar = (dir: 1 | -1): boolean => {
    // Corona hacia arriba = más esfuerzo (como el selector de Apple). Los
    // topes de la corona los vibra el sistema: no son un evento de la sesión.
    const n = valor == null ? (dir === -1 ? 1 : 0) : Math.min(10, Math.max(0, valor - dir));
    if (n === valor) return true;
    setValor(n);
    onLog(`Corona → RPE ${n} · ${palabra(n)}`);
    return true;
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
              <Nota>{valor === 0 ? '0 no va a Salud (1–10)' : 'También a Salud · esfuerzo'}</Nota>
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
