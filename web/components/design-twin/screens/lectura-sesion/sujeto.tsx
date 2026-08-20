'use client';

// EL SUJETO — el número que ES la sesión, uno por formato y nunca un cero.
//
// La voz sigue la ya aprobada en las diez vistas en vivo (`vivo-fortime`,
// `vivo-amrap`, `vivo-emom`): «Llevas» en directo pasa a «Tu tiempo» al
// terminar, y el «Hecho» de un EMOM que se cierra es el mismo «X de Y rondas»
// que aquí se lee en frío. Esta pantalla no inventa un vocabulario nuevo para
// el mismo hecho — lo continúa (§2 del CONTRATO-UI).

import { EtiquetaSujeto, Numeral } from '../../kit-vivo';
import { reloj, toneladas, kg } from '../../kit-composicion/formato';
import type { Sujeto as SujetoT } from './modelo';

export function Sujeto({ sujeto }: { sujeto: SujetoT }) {
  switch (sujeto.clase) {
    case 'for-time':
      return (
        <>
          <EtiquetaSujeto>Tu tiempo</EtiquetaSujeto>
          <Numeral>{reloj(sujeto.duracionS)}</Numeral>
        </>
      );

    case 'amrap':
      return (
        <>
          <EtiquetaSujeto>Rondas</EtiquetaSujeto>
          <Numeral unidad="rondas">{sujeto.rondas}</Numeral>
          {sujeto.repsExtra > 0 && (
            <span style={{ font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', marginTop: 8 }}>
              {`+ ${sujeto.repsExtra} reps sueltas`}
            </span>
          )}
        </>
      );

    case 'emom':
      return (
        <>
          <EtiquetaSujeto
            tono={sujeto.rondasCompletadas === sujeto.rondasPrescritas ? 'var(--twin-ok)' : 'var(--twin-muted)'}
          >
            Rondas completadas
          </EtiquetaSujeto>
          <Numeral tono={sujeto.rondasCompletadas === sujeto.rondasPrescritas ? 'var(--twin-ok)' : 'var(--twin-fg)'}>
            {`${sujeto.rondasCompletadas} de ${sujeto.rondasPrescritas}`}
          </Numeral>
        </>
      );

    case 'fuerza':
      return (
        <>
          <EtiquetaSujeto>Volumen movido</EtiquetaSujeto>
          {/* «t» a mano y no por `unidad`: ese slot pasa por `t-readout-label`,
              que va en mayúsculas — «T» sola se lee como un error tipográfico,
              no como una unidad (corrección de Alex, 20-ago). */}
          <Numeral>{`${toneladas(sujeto.volumenKg)} t`}</Numeral>
          {sujeto.serieMasPesada && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 12 }}>
              <span style={{ font: '600 14px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                {`La serie más pesada: ${sujeto.serieMasPesada.etiqueta}`}
              </span>
              <span className="t-readout-s" style={{ color: 'var(--twin-muted)', fontSize: 17 }}>
                {`${kg(sujeto.serieMasPesada.kg)} × ${sujeto.serieMasPesada.reps}`}
              </span>
            </div>
          )}
        </>
      );

    case 'libre':
      return (
        <>
          <EtiquetaSujeto>Duración</EtiquetaSujeto>
          <Numeral>{reloj(sujeto.duracionS)}</Numeral>
        </>
      );
  }
}
