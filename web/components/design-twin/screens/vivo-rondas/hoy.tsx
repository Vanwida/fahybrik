'use client';

// HOY — el fallo, reproducido y MEDIDO.
//
// Esto es lo que la app pinta ahora mismo: el crono de sujeto, debajo la lista
// de rondas con una fila por ronda y debajo la fila de lecturas. La lista no
// recorta ni scrollea (`StrikeList`), y la ranura del vivo no scrollea en
// vertical por el ancla del sujeto (§10.3), así que lo que sobra EMPUJA. El
// 10-ago eso sacó EMPEZAR de la pantalla en el fartlek de 16 series
// (docs/DECISIONS.md); con un metcon de muchas rondas el agujero sigue vivo.
//
// El número de pt que sobran NO está escrito aquí: lo mide `Recortado` del
// layout reproducido, así que cambia con el escenario en vez de envejecer. Con
// cuatro rondas ya sobra; con doce sobran casi quinientos.

import type { TwinAppearance } from '../../types';
import { reloj } from '../../datos-reales';
import { Recortado } from '../../kit';
import {
  Apoyo,
  ContextoFormato,
  CromoFormato,
  EtiquetaSujeto,
  FilaApoyos,
  FranjaAccion,
  MarcoVivo,
  Numeral,
  colorZona,
  zonaDe,
  type CapEstado,
} from '../../kit-vivo';
import { Lienzo } from './lienzo';
import { ListaDeHoy } from './lista';
import { fcEn, soloTuLaCierras, type Metcon } from './data';

export function Hoy({
  metcon,
  vivoS,
  activa,
  cerradas,
  parcialS,
  pausado,
  onPausa,
  onAvanzar,
  cap,
  appearance,
}: {
  metcon: Metcon;
  vivoS: number;
  activa: number;
  cerradas: readonly number[];
  parcialS: number;
  pausado: boolean;
  onPausa: () => void;
  onAvanzar: () => void;
  cap?: CapEstado;
  appearance: TwinAppearance;
}) {
  const pulso = fcEn(parcialS);
  const zona = zonaDe(pulso);

  return (
    <Lienzo zona={zona} appearance={appearance}>
      <MarcoVivo
        cromo={
          <CromoFormato
            formato={metcon.formato}
            posicion={`Ronda ${activa + 1} de ${metcon.rondas}`}
            pausado={pausado}
            onPausa={onPausa}
          />
        }
        contexto={<ContextoFormato scoreS={vivoS} cap={cap} />}
        // El sujeto de hoy es el crono del bloque, y eso la propuesta no lo
        // discute: lo que discute es qué se hace con los apoyos.
        sujeto={
          <>
            <EtiquetaSujeto>Tiempo</EtiquetaSujeto>
            <Numeral>{reloj(vivoS)}</Numeral>
          </>
        }
        apoyos={
          <Recortado>
            <ListaDeHoy metcon={metcon} activa={activa} cerradas={cerradas} parcialVivoS={parcialS} />
            <div style={{ marginTop: 8 }}>
              <FilaApoyos>
                <Apoyo etiqueta="Parcial" valor={reloj(parcialS)} />
                <Apoyo etiqueta="Ronda" valor={`${activa + 1}/${metcon.rondas}`} />
                <Apoyo etiqueta="Pulso" valor={String(pulso)} tono={colorZona(zona)} pie="ppm" />
              </FilaApoyos>
            </div>
          </Recortado>
        }
        accion={
          <FranjaAccion
            titulo={activa + 1 === metcon.rondas ? 'ÚLTIMA HECHA' : 'RONDA HECHA'}
            unicaSalida={soloTuLaCierras(metcon)}
            onClick={onAvanzar}
          />
        }
      />
    </Lienzo>
  );
}
