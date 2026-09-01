'use client';

// EL SUJETO — el número grande, uno por lectura y solo uno.
//
// Vive aparte porque es donde está la decisión de producto: la precedencia la
// resuelve `modelo.ts` (qué lectura toca) y aquí se decide CÓMO SE CUENTA. Las
// seis lecturas del modelo tienen aquí su voz, y una de ellas tiene DOS —el
// veredicto de una sesión de series se puede contar poniendo nota («5 de 6») o
// enseñando el hecho («3:33/km», con el veredicto debajo)—, que es la
// bifurcación de tono que Alex decide viendo.

import type { ReactNode } from 'react';
import { EtiquetaSujeto, Numeral, colorZona } from '../../kit-vivo';
import { esDecimal, reloj, ritmoKm } from '../../kit-composicion/formato';
import type { Carrera, Lectura } from './modelo';
import { fraseSesgo } from './voz';
import { Pastilla } from './piezas';

/** Las dos voces del mismo veredicto. Es tono, no dato. */
export type VozDelSujeto = 'veredicto' | 'hecho';

export function Sujeto({ carrera, lectura, voz }: { carrera: Carrera; lectura: Lectura; voz: VozDelSujeto }) {
  const s = lectura.sujeto;
  const banda = lectura.banda?.eje === 'ritmo' ? `${reloj(lectura.banda.rapidoSkm)} a ${ritmoKm(lectura.banda.lentoSkm)}` : null;

  switch (s.clase) {
    case 'veredicto': {
      const fuera = s.evaluables - s.dentro;
      // ─ VOZ B · manda el hecho ────────────────────────────────────────────
      if (voz === 'hecho') {
        return (
          <>
            <EtiquetaSujeto>{`Media de las ${s.evaluables} series`}</EtiquetaSujeto>
            <Numeral unidad="/km">{reloj(s.mediaTrabajoSkm)}</Numeral>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <span className="t-readout-s" style={{ color: fuera === 0 ? 'var(--twin-ok)' : 'var(--twin-fg)' }}>
                {`${s.dentro} de ${s.evaluables} dentro`}
              </span>
              {banda && <Apunte>{`de lo que te pidieron, ${banda}`}</Apunte>}
            </div>
          </>
        );
      }
      // ─ VOZ A · manda el veredicto ────────────────────────────────────────
      return (
        <>
          <EtiquetaSujeto tono={fuera === 0 ? 'var(--twin-ok)' : 'var(--twin-muted)'}>Series dentro</EtiquetaSujeto>
          <Numeral tono={fuera === 0 ? 'var(--twin-ok)' : 'var(--twin-fg)'}>{`${s.dentro} de ${s.evaluables}`}</Numeral>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 12 }}>
            <span style={{ font: '600 14px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              {fraseSesgo(s.sesgo, fuera) ?? 'Todas dentro de lo que te pidieron'}
            </span>
            {banda && (
              <Apunte>
                {s.peorDesvioS != null && s.peorDesvioS > 0
                  ? `Te pedían ${banda} · la peor se fue ${Math.round(s.peorDesvioS)} s`
                  : `Te pedían ${banda}`}
              </Apunte>
            )}
          </div>
        </>
      );
    }

    case 'contraste':
      return (
        <>
          <EtiquetaSujeto>{`${s.nFuertes} ${s.nFuertes === 1 ? 'fuerte' : 'fuertes'}`}</EtiquetaSujeto>
          <Numeral unidad="/km">{reloj(s.fuerteSkm)}</Numeral>
          {s.suaveSkm != null && s.contrasteSkm != null ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 10 }}>
              <Numeral escala="segundo" tono="var(--twin-muted)" unidad="/km">
                {reloj(s.suaveSkm)}
              </Numeral>
              <Apunte>{`suave · contraste ${reloj(s.contrasteSkm)}`}</Apunte>
            </div>
          ) : (
            <Apunte>
              {s.recuperacion === 'parado'
                ? 'Recuperaste parado: no hay ritmo suave con el que comparar'
                : 'No se guardó lo suave: no hay contra qué comparar'}
            </Apunte>
          )}
        </>
      );

    case 'tiempo-en-zona':
      return (
        <>
          <EtiquetaSujeto tono={colorZona(s.zona)}>{`En Z${s.zona}, lo que pedías`}</EtiquetaSujeto>
          <Numeral tono={colorZona(s.zona)}>{reloj(s.segundos)}</Numeral>
          <Apunte>{`de ${reloj(carrera.duracionS)} · el ${s.pct}% de la sesión`}</Apunte>
        </>
      );

    case 'ritmo-medio':
      return (
        <>
          <EtiquetaSujeto>Ritmo medio</EtiquetaSujeto>
          <Numeral unidad="/km">{reloj(s.skm)}</Numeral>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 12 }}>
            {s.veredicto && s.veredicto !== 'sin_dato' && <Pastilla veredicto={s.veredicto} />}
            <Apunte>
              {banda
                ? `Te pedían ${banda}, y fuiste una sola cosa: esta media describe cada kilómetro`
                : 'Corriste a una sola intensidad: esta media describe cada kilómetro'}
            </Apunte>
          </div>
        </>
      );

    case 'tiempo-por-repeticion':
      return (
        <>
          <EtiquetaSujeto>{`${s.nRepeticiones} subidas`}</EtiquetaSujeto>
          <Numeral unidad="de media">{reloj(s.mediaS)}</Numeral>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 12 }}>
            <span style={{ font: '600 14px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              {`De ${reloj(s.primeraS)} la primera a ${reloj(s.ultimaS)} la última`}
            </span>
            <Apunte>{`En una cuesta del ${Math.round(s.pendientePct)}% el ritmo no se compara: lo que cuenta es el tiempo`}</Apunte>
          </div>
        </>
      );

    case 'kilometros':
      return (
        <>
          <EtiquetaSujeto>Recorriste</EtiquetaSujeto>
          <Numeral unidad="km">{esDecimal(carrera.distanciaM / 1000, 2)}</Numeral>
          <Apunte>{s.porque}</Apunte>
        </>
      );
  }
}

/** La línea de apoyo del sujeto: siempre bajo el numeral, siempre en apagado. */
function Apunte({ children }: { children: ReactNode }) {
  return (
    <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)', maxWidth: 300 }}>
      {children}
    </span>
  );
}
