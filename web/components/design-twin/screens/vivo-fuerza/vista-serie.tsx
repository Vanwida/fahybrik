'use client';

// LA SERIE QUE TIENES DELANTE.
//
// Aquí no gobierna el reloj: gobierna el atleta. La app no puede contar una
// repetición ni pesar un disco, así que su único trabajo es que sepas QUÉ toca
// sin pensarlo — y quitarse de en medio hasta que digas que has acabado.
//
// Por eso hay UN botón y ocupa el pulgar entero. El sujeto es la serie
// (`reps × carga`), y cuando el plan no trae medida degrada a lo que sí hay:
// la carga, o el nombre a secas. Nunca aparece un cero ni un guion inventado.

import type { ReactNode } from 'react';
import { CTA, Pantalla } from '../../kit';
import { Barra } from './barra';
import { Cabecera, Sujeto, SujetoNombre, TiraPlan, pastillaRir } from './atoms';
import { serie, type Prescripcion } from './data';

export function VistaSerie({
  bloque,
  p,
  riel,
  indice,
  total,
  encima,
  ctaTitulo,
  pie,
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
  onHecha: () => void;
}) {
  const sujeto = serie(p.reps, p.cargaKg);

  return (
    <Pantalla accion={<CTA title={ctaTitulo} height={88} onClick={onHecha} />}>
      <Cabecera bloque={bloque} ejercicio={p.ejercicio} indice={indice} total={total} onSalir={() => undefined} />
      {riel}
      <TiraPlan p={p} />

      {sujeto ? (
        <Sujeto
          encima={encima}
          cifra={sujeto.cifra}
          unidad={sujeto.unidad}
          nombre={p.ejercicio}
          pastilla={pastillaRir(p.rir)}
          // Los discos solo cuando la carga es de barra. En una zancada a 30 kg
          // la app no sabe si son mancuernas o sandbag, y dibujarlos sería
          // mandarte a cargar un material que a lo mejor no es el tuyo (§7).
          debajo={
            p.cargaKg != null && p.implemento === 'barra' ? (
              <div style={{ paddingTop: 10 }}>
                <Barra totalKg={p.cargaKg} />
              </div>
            ) : undefined
          }
        />
      ) : (
        <SujetoNombre encima={encima} nombre={p.ejercicio} />
      )}

      {pie}
    </Pantalla>
  );
}
