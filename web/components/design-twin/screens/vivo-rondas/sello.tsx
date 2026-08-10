'use client';

// Cómo se cierra un bloque por rondas. Y son DOS cosas distintas:
//
//  · si acabas las rondas, la puntuación es el TIEMPO;
//  · si te come el tope, la puntuación son las RONDAS CERRADAS, y de la que
//    estabas haciendo no se apunta nada cuando nadie la contaba. Declararlo
//    cuesta un toque, así que se ofrece el toque (§7).
//
// El sello NO usa la banda fija del §10.3, y a propósito: la banda existe para
// que el sujeto no baile entre formatos que se turnan durante el mismo entreno,
// y de aquí ya no se vuelve. Su estrategia es `centra` (§6.1).

import type { ReactNode } from 'react';
import type { TwinAppearance } from '../../types';
import { reloj } from '../../datos-reales';
import { BANDA, ContextoFormato, CromoFormato, EtiquetaSujeto, FranjaAccion, Numeral } from '../../kit-vivo';
import { Lienzo } from './lienzo';
import { soloTuLaCierras, type Metcon } from './data';

/**
 * El marco del sello: las mismas dos filas de arriba, y el cuerpo CENTRADO en
 * lo que quede.
 *
 * No usa `MarcoVivo` a propósito. Su banda de 340 pt existe para que el sujeto
 * no baile entre los formatos que se turnan durante el mismo entreno, y de un
 * sello ya no se vuelve; con la banda, el resultado quedaba arriba y los ~290 pt
 * que sobran se acumulaban en un hueco muerto al fondo, que es exactamente lo
 * que el §6.1 prohíbe. La fila de acción es `auto` y no fija: cuando no hay nada
 * que declarar, no reserva nada.
 *
 * `containerType: 'size'` sigue siendo obligatorio: de él cuelga la escala del
 * numeral, y sin contenedor de consulta las unidades `cqh` no resuelven y la
 * cifra se queda clavada en el suelo del clamp.
 */
function MarcoSello({
  cromo,
  contexto,
  cuerpo,
  accion,
}: {
  cromo: ReactNode;
  contexto: ReactNode;
  cuerpo: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'grid',
        gridTemplateRows: `${BANDA.cromo}px ${BANDA.contexto}px minmax(0, 1fr) auto`,
        gap: BANDA.hueco,
        padding: BANDA.hueco,
        boxSizing: 'border-box',
        containerType: 'size',
      }}
    >
      <div style={{ minHeight: 0, display: 'flex', alignItems: 'center' }}>{cromo}</div>
      <div style={{ minHeight: 0, display: 'flex', alignItems: 'center' }}>{contexto}</div>
      <div
        style={{
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          textAlign: 'center',
        }}
      >
        {cuerpo}
      </div>
      <div style={{ minHeight: 0 }}>{accion}</div>
    </div>
  );
}

export function Sello({
  metcon,
  muerto,
  scoreS,
  cerradas,
  appearance,
  onLog,
}: {
  metcon: Metcon;
  /** El tope se comió el bloque antes de que acabaras las rondas. */
  muerto: boolean;
  scoreS: number;
  cerradas: readonly number[];
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const nadieCuenta = soloTuLaCierras(metcon);
  const lineas = muerto
    ? [
        `Cerraste ${cerradas.length} rondas de ${metcon.rondas}, y ese es tu resultado.`,
        nadieCuenta
          ? 'De la que estabas haciendo no se apunta nada: nadie cuenta repeticiones.'
          : 'La que estabas haciendo se quedó a medias.',
      ]
    : [
        `Las ${metcon.rondas} rondas, cerradas.`,
        metcon.capS != null
          ? `Dentro del tope de ${reloj(metcon.capS)} por ${reloj(metcon.capS - scoreS)}.`
          : `Tu media por ronda: ${reloj(Math.round(scoreS / metcon.rondas))}.`,
      ];

  return (
    // Acento en el lienzo solo cuando se ha LOGRADO algo: acabar las rondas. Un
    // tope que te come no es un logro, y teñirlo de naranja lo celebraría.
    <Lienzo zona={null} appearance={appearance}>
      <MarcoSello
        cromo={
          <CromoFormato
            formato={metcon.formato}
            posicion={muerto ? 'Se acabó el tope' : `${metcon.rondas} de ${metcon.rondas}`}
            pausado={false}
            onPausa={() => onLog('El bloque ya está cerrado: no hay nada que pausar')}
          />
        }
        contexto={
          <ContextoFormato
            scoreS={scoreS}
            cap={metcon.capS != null ? { totalS: metcon.capS, restanteS: muerto ? 0 : metcon.capS - scoreS, urgente: muerto } : undefined}
          />
        }
        cuerpo={
          <>
            <EtiquetaSujeto>{muerto ? 'Tope' : 'Hecho'}</EtiquetaSujeto>
            {muerto ? (
              <Numeral unidad={`de ${metcon.rondas} rondas`}>{String(cerradas.length)}</Numeral>
            ) : (
              <Numeral>{reloj(scoreS)}</Numeral>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, maxWidth: 300 }}>
              {lineas.map((l) => (
                <span key={l} style={{ font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  {l}
                </span>
              ))}
            </div>
          </>
        }
        // Con el tope agotado queda algo que declarar; acabando las rondas no
        // queda nada, y aquí la fila NO se reserva: de un sello no se vuelve, así
        // que ya no hay ninguna banda que mantener quieta.
        accion={
          muerto && nadieCuenta ? (
            <FranjaAccion
              titulo="APUNTA LO QUE HICISTE"
              nota="un campo, un toque"
              onClick={() => onLog('Un campo, un toque: lo que llevabas de la ronda que no cerró')}
              style={{ height: BANDA.accion }}
            />
          ) : undefined
        }
      />
    </Lienzo>
  );
}
