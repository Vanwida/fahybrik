'use client';

// LA CARRERA DENTRO DE LA SESIÓN — sujeto, curva y un solo troceado.
//
// El orden no es decorativo: el sujeto abre porque es lo que el coach viene a
// saber; la curva va antes que la tabla porque es lo único que no se puede
// sustituir por texto (se ve entrar y salir de la banda, y se ve dónde); y la
// tabla cierra, para quien quiera la cifra exacta de un tramo.
//
// LO DERIVADO NO ESTÁ AQUÍ: vive en el carril (`SesionScreen`), como en el
// mockup. Esta columna es la narración de la carrera y el carril es el contexto.

import type { ReactNode } from 'react';
import type { AssignmentDetailTrace } from '@/lib/execution/session-trace';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { Lectura } from './lectura';
import { Curva } from './Curva';
import { Sujeto } from './Sujeto';
import { TablaKilometros, TablaTramos } from './Tramos';

function Seccion({ titulo, nota, children }: { titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="v2-micro">{titulo}</h3>
        {nota ? <span className="text-[11px] text-[color:var(--v2-faint)]">{nota}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * El hueco declarado. No es la versión rota de la pantalla: es la misma pantalla
 * diciendo la verdad. Las secciones que no existen se explican con UNA frase, en
 * vez de con varias cajas vacías.
 */
function SinArchivo() {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border-strong)] px-4 py-6 text-center">
      <span className="v2-display text-[15px]">Sin curva y sin kilómetros</span>
      <span className="max-w-[52ch] text-xs leading-relaxed text-[color:var(--v2-muted)]">
        De esta carrera solo se guardaron los totales, no el minuto a minuto. Las carreras se archivan muestra a
        muestra desde que el reloj empezó a emitirlas.
      </span>
    </div>
  );
}

/**
 * El agregado de DURACIÓN, que es una pregunta distinta de la intensidad y por
 * eso no se mezcla con ella en un número. Solo aparece cuando hubo tramos
 * prescritos por tiempo: si nadie pidió una duración, no hay nada que resumir.
 */
function NotaDuracion({ compliance }: { compliance: CoachSessionDetail['run_compliance'] }) {
  const trabajo = compliance.work_duration_summary;
  const recuperacion = compliance.recovery_duration_summary;
  const partes = [
    trabajo.evaluable > 0 ? `${trabajo.completa} de ${trabajo.evaluable} completaron su tiempo` : null,
    recuperacion.evaluable > 0
      ? `${recuperacion.controlada} de ${recuperacion.evaluable} recuperaciones se quedaron en el tiempo pedido`
      : null,
  ].filter((p): p is string => p != null);
  if (partes.length === 0) return null;
  return <>{partes.join(' · ')}</>;
}

/**
 * El cumplimiento de la RECUPERACIÓN, aparte del trabajo y a propósito: un «6 de
 * 6 en el trabajo, 2 de 6 en la recuperación» no se puede resumir en un
 * porcentaje único sin perder la mitad de lo que pasó.
 */
function ResumenRecuperacion({ compliance }: { compliance: CoachSessionDetail['run_compliance'] }) {
  const r = compliance.recovery_summary;
  if (r.evaluable === 0) return null;
  const fuera = r.demasiado_rapida;
  return (
    <p className="text-xs leading-relaxed text-[color:var(--v2-muted)]">
      <span className="font-semibold text-[color:var(--v2-fg)]">
        {r.controlada} de {r.evaluable}
      </span>{' '}
      recuperaciones controladas
      {fuera > 0 ? `, ${fuera} ${fuera === 1 ? 'se fue' : 'se fueron'} más fuerte de lo pedido` : ''}.
    </p>
  );
}

export function CarreraSesion({
  lectura,
  compliance,
  trace,
}: {
  lectura: Lectura;
  compliance: CoachSessionDetail['run_compliance'];
  trace: AssignmentDetailTrace | null;
}) {
  const { sujeto, troceado, eje, tramos, kilometros, hayCurva, tramosSituables } = lectura;

  return (
    <div className="flex flex-col gap-5">
      <Sujeto sujeto={sujeto} prescrito={lectura.prescrito} />

      {hayCurva && trace ? (
        <div className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-4 pb-3 pt-4">
          <Curva
            ritmo={trace.display_curve.pace}
            pulso={trace.display_curve.hr}
            tramos={tramos}
            kilometros={kilometros}
            troceado={troceado}
            situables={tramosSituables}
          />
        </div>
      ) : (
        <SinArchivo />
      )}

      {troceado === 'tramos' && tramos.length > 0 ? (
        <Seccion titulo="Tramo a tramo" nota={<NotaDuracion compliance={compliance} />}>
          <TablaTramos tramos={tramos} eje={eje} />
          <ResumenRecuperacion compliance={compliance} />
        </Seccion>
      ) : null}

      {troceado === 'kilometros' && kilometros.length > 0 ? (
        <Seccion titulo="Kilómetro a kilómetro">
          <TablaKilometros kilometros={kilometros} />
        </Seccion>
      ) : null}
    </div>
  );
}
