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

import { useEffect, useMemo, useState } from 'react';
import { CTA, Pantalla, SP, SecondaryCTA } from '../../kit';
import { COLOR_MODALIDAD, reloj, type ItemReal } from '../../datos-reales';
import { useTimeline } from '../../sim';
import {
  ESTACIONES,
  SCORE_APERTURA_S,
  cifraEnUnidadDe,
  fcEn,
  motorDe,
  objetivoDe,
  planDe,
  quienLoSabe,
  recienSellado,
  reglaDeSalida,
  ritmoDe,
  rutaEn,
  type Cerrado,
  type Cortes,
  type Ruta,
} from './data';
import { Ambiente, Flash, Franja } from './atoms';
import { Sello, SujetoMedida, SujetoTrabajo, Trio, type Celda } from './sujeto';
import { HojaRuta, Riel, type Fila } from './ruta';
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

export function EscenaHyrox({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
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
  const color = item ? COLOR_MODALIDAD[item.modalidad] : 'var(--twin-accent)';

  const cuerpo = () => {
    if (hoja) {
      return (
        <HojaRuta
          titulo="La ruta"
          filas={filas}
          resumen={`${cerradas.length} cerradas en ${reloj(cerradas.reduce((n, c) => n + c.parcialS, 0))}`}
        />
      );
    }
    if (!item) {
      return (
        <Sello
          label="Hecho"
          cifra={reloj(scoreS)}
          titulo="Las 16 estaciones"
          lineas={[
            'Cada parcial es el que midió el reloj, y los metros los que leyó cada aparato.',
            'Donde no había aparato solo hay tiempo, y así se queda.',
          ]}
          extra={
            <div style={{ width: 240, marginTop: SP.s }}>
              <SecondaryCTA title="Ver la ruta entera" onClick={() => setHoja(true)} />
            </div>
          }
        />
      );
    }
    return (
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s, padding: SP.m }}>
        <Sujeto item={item} parcialS={parcialS} />
        <Riel
          filas={filas}
          activo={ruta.activo}
          verTodas={{
            etiqueta: `Ver las ${ESTACIONES.length} estaciones`,
            onClick: () => {
              setHoja(true);
              onLog('La ruta entera, encima. El crono del bloque se queda arriba.');
            },
          }}
        />
      </div>
    );
  };

  const accion = hoja ? (
    <CTA title={item ? 'VOLVER A LA ESTACIÓN' : 'VOLVER'} height={68} onClick={() => setHoja(false)} />
  ) : item ? (
    <CTA
      title={ruta.activo === ESTACIONES.length - 1 ? 'ÚLTIMA HECHA' : 'ESTACIÓN HECHA'}
      height={76}
      onClick={() => setCortes({ ...cortes, [ruta.activo]: Math.max(1, parcialS) })}
    />
  ) : undefined;

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Ambiente color={color} />
      <Flash activo={recienSellado(scoreS, ruta.ultimoSelloS)} color={color} />
      <Pantalla padding={0} gap={0} accion={accion ? <div style={{ padding: SP.m }}>{accion}</div> : undefined}>
        <Franja
          posicion={
            item ? `Estación ${ruta.activo + 1} de ${ESTACIONES.length}` : `${ESTACIONES.length} de ${ESTACIONES.length}`
          }
          scoreS={scoreS}
          pausado={pausado}
          onPausa={alternarPausa}
        />
        {cuerpo()}
      </Pantalla>
    </div>
  );
}

/** El sujeto sale del modelo: hay medida corriendo, o hay trabajo delante. */
function Sujeto({ item, parcialS }: { item: ItemReal; parcialS: number }) {
  const motor = motorDe(item);
  const { texto, valor } = objetivoDe(item);
  const celdas: Celda[] = [];

  if (motor && texto && valor) {
    const metros = motor.metrosEn(parcialS);
    const ritmo = ritmoDe(item, metros, parcialS);
    if (ritmo) celdas.push({ label: 'Ritmo', valor: ritmo.valor, unidad: ritmo.unidad });
    celdas.push({ label: 'Aquí', valor: reloj(parcialS) });
    celdas.push({ label: 'FC', valor: String(fcEn(parcialS)), unidad: 'ppm' });
    return (
      <>
        <SujetoMedida
          cifra={cifraEnUnidadDe(texto, metros)}
          objetivo={texto}
          cumplido={metros >= valor}
          titulo={item.nombre}
          regla={reglaDeSalida(item)}
        />
        <Trio celdas={celdas} />
      </>
    );
  }

  celdas.push({ label: 'Aquí', valor: reloj(parcialS) });
  celdas.push({ label: 'FC', valor: String(fcEn(parcialS)), unidad: 'ppm' });
  return (
    <>
      {/* Sin dosis (pasa: el circuito de pierna del coach trae cuatro), el
          nombre NO se agranda a 72 pt de instrumento: un movimiento no es una
          medida (§4). Se queda de titular y el sujeto es él. */}
      <SujetoTrabajo cifra={texto} titulo={item.nombre} carga={item.objetivo ?? null} regla={reglaDeSalida(item)} />
      <Trio celdas={celdas} />
    </>
  );
}
