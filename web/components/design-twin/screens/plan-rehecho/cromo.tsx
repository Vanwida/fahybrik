'use client';

// El cromo de arriba de Plan (`PlanView.cabeceraDeNavegacion`): a la izquierda, el
// chip de Dobles si hay pareja; a la derecha, compartir la semana, el ciclo, el
// historial y el chat. Fijo: no scrollea nunca. Sin logo (el logo vive en Hoy).
//
// El ciclo va PRIMERO de los tres iconos de siempre porque es el único que habla
// del plan que se está mirando (11-ago). «Compartir» solo con una semana real
// delante: sin días servidos no hay nada honesto que enseñar. El chat no existe
// sin coach. Los cuatro botones son de 48 pt y llevan su nombre accesible.

import { BotonCromo } from '../hoy-dia/cromo';
import { fuente, TAM, TOQUE } from '../../kit-dia/tokens';
import { IcoChat } from '../../kit-dia/iconos';
import { IcoCiclo, IcoCompartir, IcoHistorial } from './iconos';

export function PlanCromo({
  companero,
  conSemana,
  conChat,
  onLog,
}: {
  companero: string | null;
  /** Hay una semana con sesiones delante: se puede compartir. */
  conSemana: boolean;
  conChat: boolean;
  onLog: (linea: string) => void;
}) {
  return (
    <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 8px 0 20px' }}>
      <div style={{ minWidth: 0, flex: '0 1 auto' }}>
        {companero ? (
          <button
            type="button"
            className="pl-btn"
            aria-label={`Modalidad Dobles con ${companero}. Ver su plan`}
            onClick={() => onLog(`Dobles · ${companero} → abre el plan de tu pareja`)}
            style={{ height: TOQUE, maxWidth: '100%', display: 'inline-flex', alignItems: 'center' }}
          >
            <span
              style={{
                height: 36,
                maxWidth: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 14px',
                boxSizing: 'border-box',
                borderRadius: 9999,
                background: 'var(--twin-surface-elevated)',
                border: '1px solid var(--twin-hairline-strong)',
                color: 'var(--twin-fg)',
                ...fuente(700, TAM.suelo, 1),
              }}
            >
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--twin-info)', flex: '0 0 auto' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dobles · {companero}</span>
            </span>
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', flex: '0 0 auto', minHeight: TOQUE }}>
        {conSemana ? (
          <BotonCromo etiqueta="Compartir la semana" onClick={() => onLog('Compartir la semana → abre la tarjeta para compartir')}>
            <IcoCompartir tam={20} />
          </BotonCromo>
        ) : null}
        <BotonCromo etiqueta="Ver el ciclo entero" onClick={() => onLog('Ciclo → abre el ciclo entero del plan')}>
          <IcoCiclo tam={20} />
        </BotonCromo>
        <BotonCromo etiqueta="Historial de entrenos" onClick={() => onLog('Historial → abre tus entrenos hechos')}>
          <IcoHistorial tam={20} />
        </BotonCromo>
        {conChat ? (
          <BotonCromo etiqueta="Chat con tu coach" onClick={() => onLog('Chat → abre el hilo con tu coach')}>
            <IcoChat tam={20} />
          </BotonCromo>
        ) : null}
      </div>
    </div>
  );
}
