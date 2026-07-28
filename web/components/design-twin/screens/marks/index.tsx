'use client';

// «Tus marcas» — la biblioteca de benchmarks del atleta y el detalle de una marca.
//
// ESPEJO de dos vistas Swift encadenadas por un NavigationLink: la lista con los
// PR y, un toque después, la ficha con historial, delta y la CTA. El doble
// reproduce el push de iOS (la lista se va con parallaje, la ficha entra) porque
// la navegación ES parte del diseño: la marca se elige, no se busca.
//
// Lo que el doble NO hace es ejecutar el intento: «Probarme ahora» abre en la app
// un fullScreenCover con el motor de entreno en vivo, y eso ya tiene su propia
// pantalla aquí. Al tocar, el botón acusa el toque y la cronología dice a dónde va.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { MarkDetail } from './detail';
import { MarksLibrary } from './library';
import { best, MARCAS_CON_HISTORIAL, MARCAS_SIN_DATOS, type Mark } from './fixtures';

/** Duración del push de iOS + la curva con la que decelera. */
const PUSH_MS = 340;
const PUSH_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** Cuánto se va la vista de abajo mientras entra la de arriba (parallaje de UIKit). */
const PARALLAX = '-24%';

export const meta: TwinMeta = {
  id: 'marks',
  titulo: 'Marcas — biblioteca y detalle',
  zona: 'Marcas y tests',
  estado: 'espejo',
  descripcion:
    'Las nueve marcas del catálogo con su PR, y la ficha de una: historial, delta por intento y «Probarme ahora».',
  fuentes: [
    'ios/FAHYBRIK/Marks/MarksLibraryView.swift',
    'ios/FAHYBRIK/Marks/MarkDetailView.swift',
    'ios/FAHYBRIK/Marks/MarksService.swift',
    'ios/FAHYBRIK/Marks/BenchmarkLaunch.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'con-historial',
    titulo: 'Remo 500 m con historial',
    descripcion:
      'Toca «Remo 500 m»: PR 1:52, cuatro intentos y el delta de cada uno. En «Remo 1000 m» aparece además el gemelo de carrera.',
  },
  {
    id: 'nunca-probada',
    titulo: 'Marca sin datos',
    descripcion:
      'Alguien que aún no se ha probado: la lista en «—» y, dentro, el vacío honesto con el tiempo que cuesta la marca.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const marks = escenario === 'nunca-probada' ? MARCAS_SIN_DATOS : MARCAS_CON_HISTORIAL;

  const [abierta, setAbierta] = useState<Mark | null>(null);
  const [dentro, setDentro] = useState(false);
  const salida = useRef<number | null>(null);

  useEffect(() => {
    const conRegistro = marks.filter((m) => best(m) !== null).length;
    onLog(`Tus marcas · ${marks.length} del catálogo, ${conRegistro} con registro`);
  }, [marks, onLog]);

  useEffect(
    () => () => {
      if (salida.current !== null) window.clearTimeout(salida.current);
    },
    [],
  );

  const abrir = useCallback(
    (mark: Mark) => {
      if (salida.current !== null) {
        window.clearTimeout(salida.current);
        salida.current = null;
      }
      setAbierta(mark);
      // Un frame en la posición de partida: sin él, el navegador colapsa el
      // arranque y el detalle aparece de golpe en vez de entrar.
      window.requestAnimationFrame(() => setDentro(true));
      onLog(`→ ${mark.label}`);
    },
    [onLog],
  );

  const volver = useCallback(() => {
    setDentro(false);
    salida.current = window.setTimeout(() => setAbierta(null), PUSH_MS);
    onLog('← Tus marcas');
  }, [onLog]);

  const lanzar = useCallback(
    (mark: Mark) => {
      onLog(destinoCta(mark));
    },
    [onLog],
  );

  return (
    <div className="twin-screen-safe">
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: dentro ? `translateX(${PARALLAX})` : 'translateX(0)',
            transition: `transform ${PUSH_MS}ms ${PUSH_EASE}`,
          }}
        >
          <MarksLibrary marks={marks} onOpen={abrir} />
        </div>

        {abierta && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--twin-bg)',
              boxShadow: '-10px 0 28px var(--twin-shadow-ink-hero)',
              transform: dentro ? 'translateX(0)' : 'translateX(100%)',
              transition: `transform ${PUSH_MS}ms ${PUSH_EASE}`,
            }}
          >
            <MarkDetail mark={abierta} onBack={volver} onCta={() => lanzar(abierta)} />
          </div>
        )}
      </div>
    </div>
  );
}

/** A dónde lleva la CTA en la app real — cada medida abre un flujo distinto. */
function destinoCta(mark: Mark): string {
  if (mark.measuredBy === 'registered') {
    return '→ abre la hoja «Registrar carrera» (candidatas del reloj, o a mano)';
  }
  if (mark.measuredBy === 'erg') {
    return '→ abre el benchmark en vivo (pantalla «Benchmark del remo»)';
  }
  return '→ abre el benchmark en vivo (el prearranque pregunta calle o cinta)';
}
