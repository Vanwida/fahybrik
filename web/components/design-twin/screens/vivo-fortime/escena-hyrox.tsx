'use client';

// La simulación HYROX, estación 10 de 16: el remo.
//
// Aquí no hay ningún caso especial escrito a mano. El tramo activo pregunta al
// modelo quién lo mide, y de ahí sale TODO: si hay motor, la medida corre sola
// y el tramo se cierra al cruzar; si no lo mide nadie, no hay cruce posible y
// solo tu toque cierra la estación. El botón grande cierra la ESTACIÓN, nunca
// el bloque — el bloque solo se acaba cuando se acaba la ruta.
//
// Y la ruta no se guarda en una máquina de estados: se PLIEGA desde la
// apertura cada vez que corre el reloj (`rutaEn`). Lo único que se guarda son
// tus toques, porque son lo único que el reloj no puede saber. Así el cursor
// no puede quedarse a medias, la reproducción es determinista, y no hace falta
// ningún efecto que dispare renders en cascada al cruzar un hito.
//
// QUIÉN GOBIERNA LA TRANSICIÓN — y por qué la acción cambia de peso (§10.5):
// con el remo delante el SUCESO cierra la estación (la medida cruza los 1.000)
// y tu toque es la salida de respaldo, así que la franja va de contorno. En un
// trineo, que no lo mide nadie, el toque es lo ÚNICO que puede cerrarla y ahí
// el relleno naranja se gana.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TwinAppearance } from '../../types';
import { COLOR_MODALIDAD, reloj, type ItemReal } from '../../datos-reales';
import { useTimeline } from '../../sim';
import { BandaSujeto, Fogonazo, FranjaAccion, MarcoVivo, zonaDe } from '../../kit-vivo';
import {
  ESTACIONES,
  SCORE_APERTURA_S,
  VENTANA_SUCESO_S,
  caraDeMonitor,
  cifraEnUnidadDe,
  fcEn,
  motorDe,
  objetivoDe,
  planDe,
  quienLoSabe,
  quienMide,
  recienSellado,
  reglaDeSalida,
  ritmoDe,
  rutaEn,
  type Cerrado,
  type Cortes,
  type Ruta,
} from './data';
import { ContextoFormato, CromoFormato } from './atoms';
import { LineasSello, SujetoMedida, SujetoSello, SujetoTrabajo } from './sujeto';
import { HojaRuta, Riel, type Fila } from './ruta';
import {
  ACCION_APAISADA,
  Apoyos,
  BandaSuceso,
  DosCampos,
  Lienzo,
  MarcoPlano,
  apoyoPulso,
  caraMonitor,
  type CeldaApoyo,
} from './caras';
import { useCronoSim } from './crono';

function filasDe(ruta: Ruta, parcialVivoS: number): Fila[] {
  return ESTACIONES.map((item, indice) => {
    const color = COLOR_MODALIDAD[item.modalidad];
    const cerrada = ruta.cerradas[indice];
    if (cerrada) {
      const hecho = cerrada.medido ? `${cerrada.medido} · ${reloj(cerrada.parcialS)}` : reloj(cerrada.parcialS);
      return { indice, plan: planDe(item), estado: 'hecha', hecho, color };
    }
    if (indice === ruta.activo) {
      return { indice, plan: planDe(item), estado: 'activa', hecho: reloj(parcialVivoS), color };
    }
    return { indice, plan: planDe(item), estado: 'pendiente', hecho: null, color };
  });
}

/** La línea de cronología de la última estación cerrada en esta reproducción. */
function lineaDe(ruta: Ruta): string | null {
  const i = ruta.ultimaDeLaEscena;
  if (i == null) return null;
  const cerrada = ruta.cerradas[i];
  if (!cerrada) return null;
  const item = ESTACIONES[i];
  const cola = cerrada.medido
    ? `${cerrada.medido} según ${quienLoSabe(item)}`
    : 'sin medida: ese trabajo no lo cuenta nadie';
  return `${planDe(item)} · cerrada en ${reloj(cerrada.parcialS)} · ${cola}`;
}

export function EscenaHyrox({
  escenario,
  landscape,
  appearance,
  onLog,
}: {
  escenario: string;
  landscape: boolean;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const [cortes, setCortes] = useState<Cortes>({});
  const [hoja, setHoja] = useState(escenario === 'ruta-entera');
  const { t, pausado, alternarPausa } = useCronoSim();

  const ruta = useMemo(() => rutaEn(SCORE_APERTURA_S + t, cortes), [t, cortes]);
  const terminado = ruta.activo >= ESTACIONES.length;
  // Al terminar, el crono se para: la puntuación es la suma de los parciales,
  // y `inicioS` ya la lleva acumulada.
  const scoreS = terminado ? ruta.inicioS : SCORE_APERTURA_S + t;
  const item = terminado ? null : ESTACIONES[ruta.activo];
  const parcialS = scoreS - ruta.inicioS;

  const linea = lineaDe(ruta);
  useEffect(() => {
    if (linea) onLog(linea);
  }, [linea, onLog]);

  useTimeline([
    {
      at: 0,
      run: () => onLog('Estación 10 de 16 · el remo mide los metros, así que sale sola al cruzar los 1.000'),
    },
  ]);

  const filas = useMemo(() => filasDe(ruta, parcialS), [ruta, parcialS]);
  const cerradas = ruta.cerradas.filter((c): c is Cerrado => Boolean(c));

  // §10.1 · el lienzo lo tiñe LA ZONA DE PULSO, nunca la modalidad del tramo.
  // Terminado no hay tramo vivo, así que tampoco hay pulso que pintar: el sello
  // se lleva el acento, que es lo único que el §10.1 reserva para un logro.
  const zona = item ? zonaDe(fcEn(parcialS)) : null;

  // El suceso, por encima de la cara: dura dos ticks, lo justo para leer el
  // tachado antes de que la vista ya esté en el tramo siguiente.
  const suceso =
    ruta.ultimaDeLaEscena != null && recienSellado(scoreS, ruta.ultimoSelloS, VENTANA_SUCESO_S)
      ? filas[ruta.ultimaDeLaEscena]
      : null;

  const cromo = (
    <CromoFormato
      posicion={
        item ? `Estación ${ruta.activo + 1} de ${ESTACIONES.length}` : `${ESTACIONES.length} de ${ESTACIONES.length}`
      }
      pausado={pausado}
      onPausa={alternarPausa}
    />
  );
  const contexto = <ContextoFormato scoreS={scoreS} />;

  const lienzo = (contenido: ReactNode) => (
    <Lienzo zona={zona} appearance={appearance} acento={terminado}>
      <Fogonazo activo={recienSellado(scoreS, ruta.ultimoSelloS)} />
      {contenido}
    </Lienzo>
  );

  // ---- la hoja de la ruta: una hoja encima, no una cara en vivo ------------
  if (hoja) {
    return lienzo(
      <MarcoPlano
        cromo={cromo}
        contexto={contexto}
        altoAccion={landscape ? ACCION_APAISADA : undefined}
        cuerpo={
          <HojaRuta
            titulo="La ruta"
            filas={filas}
            resumen={`${cerradas.length} cerradas en ${reloj(cerradas.reduce((n, c) => n + c.parcialS, 0))}`}
            columnas={landscape ? 2 : 1}
          />
        }
        accion={
          <FranjaAccion
            titulo={item ? 'VOLVER A LA ESTACIÓN' : 'VOLVER'}
            onClick={() => setHoja(false)}
          />
        }
      />,
    );
  }

  // ---- el sello: se acabó la ruta -----------------------------------------
  if (!item) {
    const lineas = (
      <LineasSello
        lineas={[
          'Cada parcial es el que midió el reloj, y los metros los que leyó cada aparato.',
          'Donde no había aparato solo hay tiempo, y así se queda.',
        ]}
      />
    );
    const sujeto = <SujetoSello horizontal={landscape} label="Hecho" cifra={reloj(scoreS)} titulo="Las 16 estaciones" />;
    const accion = <FranjaAccion titulo="VER LA RUTA ENTERA" onClick={() => setHoja(true)} />;
    // El sello no usa la banda fija (§10.3): es un bloque único del que ya no se
    // vuelve, así que su estrategia es `centra` (§6.1). Ver `escena-pulso.tsx`.
    return lienzo(
      <MarcoPlano
        cromo={cromo}
        contexto={contexto}
        altoAccion={landscape ? ACCION_APAISADA : undefined}
        cuerpo={
          landscape ? (
            <DosCampos izquierda={<BandaSujeto>{sujeto}</BandaSujeto>} derecha={lineas} />
          ) : (
            <BandaSujeto>
              {sujeto}
              <div style={{ marginTop: 12 }}>{lineas}</div>
            </BandaSujeto>
          )
        }
        accion={accion}
      />,
    );
  }

  // ---- la cara en vivo ----------------------------------------------------
  const riel = (
    <Riel
      filas={filas}
      activo={ruta.activo}
      alto={landscape ? 30 : 34}
      ventana
      verTodas={{
        etiqueta: `Ver las ${ESTACIONES.length} estaciones`,
        onClick: () => {
          setHoja(true);
          onLog('La ruta entera, encima. El crono del bloque se queda arriba.');
        },
      }}
    />
  );

  // El toque es la ÚNICA salida solo cuando no lo mide nadie: con el remo o el
  // reloj delante, el cruce cierra la estación y el botón es el respaldo.
  const soloElToque = quienMide(item) === 'nadie';
  const accion = (
    <FranjaAccion
      titulo={ruta.activo === ESTACIONES.length - 1 ? 'ÚLTIMA HECHA' : 'ESTACIÓN HECHA'}
      unicaSalida={soloElToque}
      onClick={() => setCortes({ ...cortes, [ruta.activo]: Math.max(1, parcialS) })}
    />
  );

  // EL TRAMO DECIDE LA CARA. Con máquina delante gana el monitor; sin ella
  // (un Run, un trineo) manda el bloque igual que en vertical.
  if (landscape) {
    const monitor = caraDeMonitor(item) ? caraMonitor(item, parcialS) : null;
    return lienzo(
      <>
        <MarcoPlano
          cromo={cromo}
          contexto={contexto}
          altoAccion={ACCION_APAISADA}
          cuerpo={
            monitor ? (
              <DosCampos izquierda={monitor.izquierda} derecha={monitor.derecha} />
            ) : (
              <DosCampos
                izquierda={<BandaSujeto>{sujetoDe(item, parcialS, true)}</BandaSujeto>}
                derecha={
                  <>
                    <Apoyos celdas={apoyosDe(item, parcialS)} />
                    {riel}
                  </>
                }
              />
            )
          }
          accion={accion}
        />
        {suceso && <BandaSuceso fila={suceso} />}
      </>,
    );
  }

  return lienzo(
    <>
      <MarcoVivo
        cromo={cromo}
        contexto={contexto}
        sujeto={sujetoDe(item, parcialS, false)}
        apoyos={
          <>
            <Apoyos celdas={apoyosDe(item, parcialS)} />
            {riel}
          </>
        }
        accion={accion}
      />
      {suceso && <BandaSuceso fila={suceso} />}
    </>,
  );
}

/** El sujeto sale del modelo: hay medida corriendo, o hay trabajo delante. */
function sujetoDe(item: ItemReal, parcialS: number, horizontal: boolean) {
  const motor = motorDe(item);
  const { texto, valor } = objetivoDe(item);
  if (motor && texto && valor) {
    return (
      <SujetoMedida
        horizontal={horizontal}
        cifra={cifraEnUnidadDe(texto, motor.metrosEn(parcialS))}
        objetivo={texto}
        cumplido={motor.metrosEn(parcialS) >= valor}
        titulo={item.nombre}
        regla={reglaDeSalida(item)}
      />
    );
  }
  return (
    <SujetoTrabajo
      horizontal={horizontal}
      cifra={texto}
      titulo={item.nombre}
      carga={item.objetivo ?? null}
      regla={reglaDeSalida(item)}
    />
  );
}

/** Las lecturas de apoyo del tramo: lo que hay, y solo lo que hay (§7). */
function apoyosDe(item: ItemReal, parcialS: number): CeldaApoyo[] {
  const motor = motorDe(item);
  const { texto, valor } = objetivoDe(item);
  const celdas: CeldaApoyo[] = [];
  if (motor && texto && valor) {
    const ritmo = ritmoDe(item, motor.metrosEn(parcialS), parcialS);
    if (ritmo) celdas.push({ etiqueta: 'Ritmo', valor: ritmo.valor, pie: ritmo.unidad });
  }
  celdas.push({ etiqueta: 'Aquí', valor: reloj(parcialS) });
  celdas.push(apoyoPulso(parcialS));
  return celdas;
}
