'use client';

// El check-in matinal, de una pregunta cada vez y con un toque por pregunta.
//
// Son las MISMAS cinco preguntas y las mismas anclas que `CheckinView.swift`
// (Recuperación muscular, Ánimo, Motivación, Energía, Calidad del sueño; de 1 a
// 5), pero en el propio sujeto de la portada: sin hoja, sin scroll, con el
// pulgar. Cada respuesta avanza sola; la quinta cierra y el sujeto de la
// portada pasa a lo siguiente (por eso `momento()` lo trata como el paso que
// tapa a todos los demás: es lo más rápido para tener un número).
//
// «Saltar por hoy» existe, como en la app (`CheckinStore.markSkipped`).

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { fuente, TABULAR, TAM, TOQUE } from '../../kit-dia/tokens';

export const PREGUNTAS_CHECKIN = [
  { titulo: 'Recuperación muscular', izquierda: '1 dolorido', derecha: '5 recuperado' },
  { titulo: 'Ánimo', izquierda: '1 mal', derecha: '5 genial' },
  { titulo: 'Motivación', izquierda: '1 cero', derecha: '5 a tope' },
  { titulo: 'Energía', izquierda: '1 agotado', derecha: '5 a tope' },
  { titulo: 'Calidad del sueño', izquierda: '1 mal', derecha: '5 perfecto' },
] as const;

const ESPERA_AVANCE_MS = 200;
const VALORES = [1, 2, 3, 4, 5] as const;

export interface CheckinEstado {
  paso: number;
  valores: (number | null)[];
}

export function useCheckin(onHecho: (valores: number[]) => void, onLog: (linea: string) => void) {
  const [e, setE] = useState<CheckinEstado>({ paso: 0, valores: PREGUNTAS_CHECKIN.map(() => null) });
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);

  const responde = (v: number) => {
    // Mientras avanza no se acepta otro toque: dos toques seguidos no saltan una pregunta.
    if (espera.current) return;
    const valores = e.valores.map((x, i) => (i === e.paso ? v : x));
    setE({ ...e, valores });
    onLog(`Check-in · ${PREGUNTAS_CHECKIN[e.paso].titulo}: ${v}`);
    espera.current = setTimeout(() => {
      espera.current = null;
      if (e.paso === PREGUNTAS_CHECKIN.length - 1) {
        onHecho(valores.filter((x): x is number => x !== null));
      } else {
        setE({ paso: e.paso + 1, valores });
      }
    }, ESPERA_AVANCE_MS);
  };
  const atras = () => setE((x) => ({ ...x, paso: Math.max(0, x.paso - 1) }));
  return { ...e, responde, atras };
}

/** Los cinco círculos de una pregunta (`Scale1to5Picker`), de 48 pt cada uno. */
export function Escala({
  valor,
  onElige,
  aria,
}: {
  valor: number | null;
  onElige: (v: number) => void;
  aria: string;
}) {
  return (
    <div role="radiogroup" aria-label={aria} style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
      {VALORES.map((v) => {
        const elegido = valor === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={elegido}
            aria-label={String(v)}
            className="hd-toque"
            onClick={() => onElige(v)}
            style={{ width: TOQUE + 4, height: TOQUE + 4, display: 'grid', placeItems: 'center', '--hd-foco': 'var(--twin-fg)' } as CSSProperties}
          >
            <span
              className="hd-circulo"
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                boxSizing: 'border-box',
                border: `2px solid ${elegido ? 'var(--twin-accent)' : 'var(--twin-muted)'}`,
                background: elegido ? 'var(--twin-accent)' : 'transparent',
                color: elegido ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
                ...fuente(800, TAM.cuerpo + 3, 1, true),
                ...TABULAR,
              }}
            >
              {v}
            </span>
          </button>
        );
      })}
    </div>
  );
}
