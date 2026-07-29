'use client';

// LA SERIE QUE TIENES DELANTE.
//
// Aquí no gobierna el reloj: gobierna el atleta. La app no puede contar una
// repetición ni pesar un disco, así que su único trabajo es que sepas QUÉ toca
// sin pensarlo — y quitarse de en medio hasta que digas que has acabado.
//
// Por eso el toque de «serie hecha» es `unicaSalida` (§10.5): es lo ÚNICO que
// puede cerrar el tramo, y ahí es donde el relleno naranja significa algo. El
// sujeto es la serie, y cuando el plan no trae medida degrada a lo que sí hay:
// la carga, o el nombre a secas. Nunca aparece un cero ni un guion inventado.

import type { ReactNode } from 'react';
import type { TwinAppearance } from '../../types';
import { Ambiente, FranjaAccion, MarcoVivo, zonaDe } from '../../kit-vivo';
import { Barra } from './barra';
import { Cabecera, Sujeto, SujetoNombre, TiraPlan, dosisEnPeldanos, pastillaRir } from './atoms';
import { type Prescripcion } from './data';

export function VistaSerie({
  bloque,
  p,
  riel,
  indice,
  total,
  encima,
  ctaTitulo,
  pie,
  pulso,
  appearance,
  onHecha,
}: {
  bloque: string;
  p: Prescripcion;
  riel: ReactNode;
  indice: number;
  total: number;
  /** La micro-etiqueta encima del sujeto: «Te toca · serie 2 de 4». */
  encima: string;
  ctaTitulo: string;
  /** Lo que da contexto: tu última vez, o el hueco declarado del plan. */
  pie?: ReactNode;
  /** El pulso del reloj. Nulo = no hay reloj y el lienzo se queda neutro (§10.1). */
  pulso: number | null;
  appearance: TwinAppearance;
  onHecha: () => void;
}) {
  const dosis = dosisEnPeldanos(p.reps, p.cargaKg);

  return (
    <>
      <Ambiente zona={zonaDe(pulso)} appearance={appearance} />
      <MarcoVivo
        cromo={
          <Cabecera bloque={bloque} ejercicio={p.ejercicio} indice={indice} total={total} onSalir={() => undefined} />
        }
        contexto={<TiraPlan p={p} />}
        sujeto={
          dosis ? (
            <Sujeto encima={encima} dosis={dosis} nombre={p.ejercicio} pastilla={pastillaRir(p.rir)} />
          ) : (
            <SujetoNombre encima={encima} nombre={p.ejercicio} />
          )
        }
        apoyos={
          <>
            {/* Los discos solo cuando la carga es de barra. En una zancada a 30
                kg la app no sabe si son mancuernas o sandbag, y dibujarlos sería
                mandarte a cargar un material que a lo mejor no es el tuyo (§7). */}
            {p.cargaKg != null && p.implemento === 'barra' && <Barra totalKg={p.cargaKg} />}
            {riel}
            {pie}
          </>
        }
        accion={<FranjaAccion titulo={ctaTitulo} onClick={onHecha} unicaSalida />}
      />
    </>
  );
}
