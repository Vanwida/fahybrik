'use client';

// LA CONFIG DE UNA SECCIÓN CON FORMA DE COMPARATIVA.
//
// Lo que se edita aquí NO son los totales: es de qué dos PERIODOS habla. Las
// horas y el reparto no están en el formulario porque no son suyos — son del
// atleta, y se suman al servirle la nota.
//
// LOS ATAJOS NO ESTÁN AQUÍ, y es a propósito. «Antes del plan contra con el plan»
// sale de las fechas de UN atleta, y una nota se puede estar escribiendo para
// varios o para la biblioteca, donde no hay ninguna fecha de la que sacarlos. Se
// eligen en Rendimiento, delante del dato, y desde ahí se entra al compositor con
// la sección ya montada.
//
// El editor de los dos periodos es el MISMO que el de la ficha
// (`SelectorDePeriodos`): con una copia, el ajuste al lunes acabaría siendo
// distinto en cada punta.

import { comparacionEnOrden } from '@fahybrid/shared/domain/zone-compare';
import type { ParDePeriodos } from '@/lib/zones/comparativa';
import { SelectorDePeriodos } from '../rendimiento/SelectorDePeriodos';
import { AvisoFila, LineaDeEmbed } from './campos';

export function SeccionComparativa({
  comparativa,
  indice,
  anclaSirve,
  onCambiar,
}: {
  comparativa: ParDePeriodos;
  indice: number;
  /** El ancla elegida deja dibujarla. Se avisa aquí y no sólo al publicar. */
  anclaSirve: boolean;
  onCambiar: (siguiente: ParDePeriodos) => void;
}) {
  const enOrden = comparacionEnOrden(comparativa);

  return (
    <div className="flex flex-col gap-2.5">
      <LineaDeEmbed>
        Se suma sola con SUS minutos por zona de los dos periodos que elijas: las horas de cada
        lado, el reparto en porcentaje y lo que ha cambiado. Lo que se guarda son las fechas, no
        los números.
      </LineaDeEmbed>

      <SelectorDePeriodos
        periodos={comparativa}
        idp={`seccion-${indice}-comparativa`}
        onCambiar={onCambiar}
      />

      {enOrden ? null : (
        <AvisoFila>
          Los dos periodos se pisan, así que todavía no se puede publicar: las semanas de en medio
          se contarían en los dos lados a la vez. Mueve el segundo o acorta los dos.
        </AvisoFila>
      )}

      {anclaSirve ? null : (
        <AvisoFila>
          La comparativa cuelga de <b className="font-semibold">su plan</b>, de{' '}
          <b className="font-semibold">esta semana</b> o de nada. Cámbialo abajo, en «Dónde le
          aparece»: colgada de una sesión hablaría de un día, y esto son meses.
        </AvisoFila>
      )}
    </div>
  );
}
