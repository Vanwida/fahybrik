'use client';

// EL SUJETO — el número grande, uno por lectura y solo uno.
//
// Vive aparte porque es donde está la decisión de producto: `lectura.ts`
// resuelve QUÉ lectura toca y aquí se decide CÓMO SE CUENTA. Las palabras son
// las mismas que ve el atleta en su móvil, conjugadas para quien pidió el
// entreno: donde él lee «te pedían 3:25 a 3:35», el coach lee «le pediste».

import { Pill } from '@/components/v2/Pill';
import type { Sujeto as SujetoLeido } from './lectura';
import { distancia, fraseSesgo, reloj, relojLargo, tonoTrabajo, VOZ_TRABAJO } from './voz';

/** El numeral y su unidad, con la tipografía de dato del panel. */
function Numeral({ children, unidad, tono }: { children: string; unidad?: string; tono?: string }) {
  return (
    <span
      className="v2-display block text-[clamp(38px,6vw,54px)] leading-none tracking-tight"
      style={tono ? { color: tono } : undefined}
    >
      {children}
      {unidad ? <span className="ml-1 text-[0.4em] font-semibold not-italic tracking-normal text-[color:var(--v2-muted)]">{unidad}</span> : null}
    </span>
  );
}

function Etiqueta({ children, tono }: { children: string; tono?: string }) {
  return (
    <span className="v2-micro block" style={tono ? { color: tono } : undefined}>
      {children}
    </span>
  );
}

/** La línea de apoyo del sujeto: siempre debajo, siempre en apagado. */
function Apunte({ children }: { children: string }) {
  return <span className="max-w-[46ch] text-[13px] leading-snug text-[color:var(--v2-muted)]">{children}</span>;
}

/** La frase fuerte, la que el coach lee sin bajar a la tabla. */
function Frase({ children }: { children: string }) {
  return <span className="text-[15px] font-semibold leading-snug text-[color:var(--v2-fg)]">{children}</span>;
}

export function Sujeto({ sujeto, prescrito }: { sujeto: SujetoLeido; prescrito: string | null }) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 sm:flex-row sm:items-start sm:gap-6">
      <div className="shrink-0">
        <Cabeza sujeto={sujeto} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <Cuerpo sujeto={sujeto} />
        {prescrito ? <span className="v2-num text-xs text-[color:var(--v2-faint)]">{prescrito}</span> : null}
      </div>
    </div>
  );
}

function Cabeza({ sujeto }: { sujeto: SujetoLeido }) {
  switch (sujeto.clase) {
    case 'veredicto': {
      const todas = sujeto.dentro === sujeto.evaluables;
      const tono = todas ? 'var(--v2-ok)' : undefined;
      return (
        <>
          <Etiqueta tono={todas ? 'var(--v2-ok)' : undefined}>Tramos en banda</Etiqueta>
          <Numeral tono={tono}>{`${sujeto.dentro} de ${sujeto.evaluables}`}</Numeral>
        </>
      );
    }
    case 'contraste':
      return (
        <>
          <Etiqueta>{`${sujeto.nFuertes} ${sujeto.nFuertes === 1 ? 'fuerte' : 'fuertes'}`}</Etiqueta>
          <Numeral unidad="/km">{reloj(sujeto.fuerteSkm)}</Numeral>
        </>
      );
    case 'tiempo-en-zona':
      return (
        <>
          <Etiqueta>{`En Z${sujeto.zona}, lo que pediste`}</Etiqueta>
          <Numeral>{relojLargo(sujeto.segundos)}</Numeral>
        </>
      );
    case 'ritmo-medio':
      return (
        <>
          <Etiqueta>Ritmo medio</Etiqueta>
          <Numeral unidad="/km">{reloj(sujeto.skm)}</Numeral>
        </>
      );
    case 'tiempo-por-tramo':
      return (
        <>
          <Etiqueta>{`${sujeto.nTramos} tramos`}</Etiqueta>
          <Numeral unidad="de media">{reloj(sujeto.mediaS)}</Numeral>
        </>
      );
    case 'sin-archivo':
      return (
        <>
          <Etiqueta>Recorrió</Etiqueta>
          <Numeral>{sujeto.distanciaM != null ? distancia(sujeto.distanciaM) : 'sin medir'}</Numeral>
        </>
      );
  }
}

function Cuerpo({ sujeto }: { sujeto: SujetoLeido }) {
  switch (sujeto.clase) {
    case 'veredicto': {
      const banda = sujeto.banda ? `${reloj(sujeto.banda.rapidoSkm)} a ${reloj(sujeto.banda.lentoSkm)}/km` : null;
      const desvio =
        sujeto.peorDesvioS != null && sujeto.peorDesvioS > 0 ? `el peor se fue ${Math.round(sujeto.peorDesvioS)} s` : null;
      const apunte = [banda ? `Le pediste ${banda}` : null, desvio].filter(Boolean).join(' · ');
      return (
        <>
          <Frase>{fraseSesgo(sujeto.fueraRapido, sujeto.fueraLento) ?? 'Todos dentro de lo que le pediste'}</Frase>
          {apunte ? <Apunte>{apunte}</Apunte> : null}
          {sujeto.mediaTrabajoSkm != null ? (
            <Apunte>{`Media del trabajo, ${reloj(sujeto.mediaTrabajoSkm)}/km`}</Apunte>
          ) : null}
        </>
      );
    }
    case 'contraste':
      return sujeto.suaveSkm != null && sujeto.contrasteSkm != null ? (
        <>
          <Frase>{`Suave a ${reloj(sujeto.suaveSkm)}/km`}</Frase>
          <Apunte>{`Contraste de ${reloj(Math.abs(sujeto.contrasteSkm))} entre lo fuerte y lo suave. Sin ritmo objetivo no hay veredicto que dar: el contraste es la lectura.`}</Apunte>
        </>
      ) : (
        <Apunte>
          {sujeto.recuperacion === 'parado'
            ? 'Recuperó parado: no hay ritmo suave con el que comparar.'
            : 'No se midió lo suave: no hay contra qué comparar.'}
        </Apunte>
      );
    case 'tiempo-en-zona':
      return <Apunte>{`El ${sujeto.pct} % de la sesión dentro de la zona que pediste.`}</Apunte>;
    case 'ritmo-medio':
      return (
        <>
          {sujeto.veredicto && sujeto.veredicto !== 'sin_dato' ? (
            <span className="flex">
              <Pill tone={tonoTrabajo(sujeto.veredicto)} variant="soft">
                {VOZ_TRABAJO[sujeto.veredicto]}
              </Pill>
            </span>
          ) : null}
          <Apunte>Corrió una sola cosa: esta media describe cada kilómetro.</Apunte>
        </>
      );
    case 'tiempo-por-tramo':
      return (
        <>
          <Frase>{`De ${reloj(sujeto.primeraS)} el primero a ${reloj(sujeto.ultimaS)} el último`}</Frase>
          <Apunte>{`En una cuesta del ${Math.round(sujeto.pendientePct)} % el ritmo no se compara: lo que cuenta es el tiempo, y el veredicto de ritmo se retira.`}</Apunte>
        </>
      );
    case 'sin-archivo':
      return <Apunte>{sujeto.porque}</Apunte>;
  }
}
