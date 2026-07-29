'use client';

// El 21-15-9 con cap: el For Time donde no mide nadie.
//
// Es el caso que obliga a ser honesto. Los metros los sabe un aparato y los
// segundos el reloj, pero las repeticiones no las cuenta nada: ni la app, ni
// el móvil en el suelo, ni el reloj. Así que aquí el sujeto NO puede ser un
// contador — es el trabajo que tienes delante, y cada tanda la cierras tú.
//
// De ahí salen las tres consecuencias que gobiernan la pantalla:
//   · cero barra de progreso de repeticiones (sí de cap: el cap es tiempo)
//   · lo cerrado sí se sabe (lo cerraste tú), y con eso se proyecta
//   · si el cap muere, la puntuación son las repeticiones cerradas, no el
//     tiempo — y lo que estabas haciendo se queda sin contar, y se dice.
//
// Y de ahí sale también el peso de la acción (§10.5): aquí el toque es lo ÚNICO
// que puede cerrar una tanda, así que la franja se gana el relleno naranja. En
// el HYROX, donde el remo cierra la estación al cruzar, va de contorno. El
// color deja de ser decoración y pasa a decir quién gobierna la transición.

import { useCallback, useState } from 'react';
import type { TwinAppearance } from '../../types';
import { COLOR_MODALIDAD, reloj } from '../../datos-reales';
import { useTimeline } from '../../sim';
import { BandaSujeto, Fogonazo, FranjaAccion, MarcoVivo, zonaDe } from '../../kit-vivo';
import {
  CAP_S,
  CERRADAS_CAP,
  CERRADAS_PULSO,
  SCORE_APERTURA_CAP_S,
  SCORE_APERTURA_PULSO_S,
  TANDAS,
  TOTAL_REPS,
  fcEn,
  proyeccionS,
  recienSellado,
  repsCerradas,
} from './data';
import { ContextoFormato, CromoFormato } from './atoms';
import { LineasSello, SujetoSello, SujetoTrabajo } from './sujeto';
import { Riel, type Fila } from './ruta';
import { ACCION_APAISADA, Apoyos, DosCampos, Lienzo, MarcoPlano, NotaLateral, apoyoPulso } from './caras';
import { useCronoSim } from './crono';

/** Último minuto de cap: el contexto se pone naranja y lo dice. */
const AVISO_CAP_S = 60;

const COLOR = COLOR_MODALIDAD.functional;

interface Estado {
  activa: number;
  inicioS: number;
  /** Parciales reales de las tandas cerradas, en orden. */
  cerradas: number[];
}

function planTanda(indice: number): string {
  const t = TANDAS[indice];
  return t.carga ? `${t.reps} ${t.nombre} · ${t.carga}` : `${t.reps} ${t.nombre}`;
}

function filasDe(estado: Estado, parcialVivoS: number): Fila[] {
  return TANDAS.map((_, indice) => {
    const plan = planTanda(indice);
    if (indice < estado.cerradas.length) {
      return { indice, plan, estado: 'hecha', hecho: reloj(estado.cerradas[indice]), color: COLOR };
    }
    if (indice === estado.activa) {
      return { indice, plan, estado: 'activa', hecho: reloj(parcialVivoS), color: COLOR };
    }
    return { indice, plan, estado: 'pendiente', hecho: null, color: COLOR };
  });
}

export function EscenaPulso({
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
  const alFilo = escenario === 'cap-encima';
  const cerradasIniciales = alFilo ? CERRADAS_CAP : CERRADAS_PULSO;
  const aperturaS = alFilo ? SCORE_APERTURA_CAP_S : SCORE_APERTURA_PULSO_S;

  const [estado, setEstado] = useState<Estado>({
    activa: cerradasIniciales.length,
    inicioS: cerradasIniciales.reduce((a, b) => a + b, 0),
    cerradas: [...cerradasIniciales],
  });
  const { t, pausado, alternarPausa } = useCronoSim();

  const acabado = estado.activa >= TANDAS.length;
  // Tres relojes distintos y una sola verdad: mientras corre, la puntuación es
  // el crono; si se cierra la última tanda, se congela ahí; si muere el cap,
  // se congela en el cap.
  const vivoS = aperturaS + t;
  const muerto = !acabado && vivoS >= CAP_S;
  const scoreS = acabado ? estado.inicioS : Math.min(vivoS, CAP_S);
  const parcialS = scoreS - estado.inicioS;
  const restanteS = Math.max(0, CAP_S - scoreS);

  const avanzar = useCallback(() => {
    const tanda = TANDAS[estado.activa];
    if (!tanda) return;
    const parcial = Math.max(1, Math.round(scoreS - estado.inicioS));
    setEstado({
      activa: estado.activa + 1,
      inicioS: estado.inicioS + parcial,
      cerradas: [...estado.cerradas, parcial],
    });
    onLog(`${tanda.reps} ${tanda.nombre} · cerrada en ${reloj(parcial)} porque la cerraste tú`);
  }, [estado, scoreS, onLog]);

  useTimeline([
    {
      at: 0,
      run: () =>
        onLog(
          alFilo
            ? 'Queda menos de un minuto de cap · las repeticiones que estás haciendo no las cuenta nadie'
            : 'Tanda 4 de 6 · aquí no mide nadie, así que cada tanda la cierras tú',
        ),
    },
  ]);

  const filas = filasDe(estado, parcialS);
  const proyeccion = proyeccionS(estado.cerradas);
  const hechas = repsCerradas(estado.cerradas.length);
  const cap = { totalS: CAP_S, restanteS, urgente: restanteS <= AVISO_CAP_S };

  if (acabado || muerto) {
    return (
      <Cierre
        muerto={muerto}
        scoreS={acabado ? scoreS : CAP_S}
        hechas={hechas}
        tandasCerradas={estado.cerradas.length}
        landscape={landscape}
        appearance={appearance}
        onLog={onLog}
      />
    );
  }

  const tanda = TANDAS[estado.activa];
  const sujeto = (
    <SujetoTrabajo
      horizontal={landscape}
      cifra={String(tanda.reps)}
      titulo={tanda.nombre}
      carga={tanda.carga}
      regla="cierras tú: nadie cuenta repeticiones"
    />
  );
  const lecturas = (
    <Apoyos
      celdas={[
        { etiqueta: 'Esta tanda', valor: reloj(parcialS) },
        { etiqueta: 'Cerradas', valor: `${hechas}/${TOTAL_REPS}`, pie: 'reps' },
        apoyoPulso(parcialS),
      ]}
    />
  );
  const proyeccionEl = <Proyeccion segundos={proyeccion} restanteS={restanteS} />;
  // Sin «ver todas»: no hay hoja aparte (esa existe para la ruta de 16). La
  // ventana enseña la que cerraste, la que haces y la que viene — que es lo que
  // cabe en los apoyos sin empujar al sujeto fuera de su banda.
  const riel = <Riel filas={filas} activo={estado.activa} alto={landscape ? 30 : 34} ventana />;

  const cromo = (
    <CromoFormato posicion={`Tanda ${estado.activa + 1} de ${TANDAS.length}`} pausado={pausado} onPausa={alternarPausa} />
  );
  const contexto = <ContextoFormato scoreS={scoreS} cap={cap} />;
  // Aquí no mide nadie: el toque es la ÚNICA salida y el relleno se lo gana.
  const accion = (
    <FranjaAccion
      titulo={estado.activa === TANDAS.length - 1 ? 'ÚLTIMA HECHA' : 'TANDA HECHA'}
      unicaSalida
      onClick={avanzar}
    />
  );

  return (
    <Lienzo zona={zonaDe(fcEn(parcialS))} appearance={appearance}>
      {/* `inicioS` es el crono en el que arrancó la tanda, o sea el del último
          sello: el fogonazo sale de ahí sin guardar nada. */}
      <Fogonazo activo={recienSellado(scoreS, estado.inicioS)} />
      {landscape ? (
        <MarcoPlano
          cromo={cromo}
          contexto={contexto}
          altoAccion={ACCION_APAISADA}
          cuerpo={
            <DosCampos
              izquierda={<BandaSujeto>{sujeto}</BandaSujeto>}
              derecha={
                <>
                  {lecturas}
                  {riel}
                  {proyeccionEl}
                </>
              }
            />
          }
          accion={accion}
        />
      ) : (
        <MarcoVivo
          cromo={cromo}
          contexto={contexto}
          sujeto={sujeto}
          apoyos={
            <>
              {lecturas}
              {proyeccionEl}
              {riel}
            </>
          }
          accion={accion}
        />
      )}
    </Lienzo>
  );
}

/**
 * La proyección se hace SOLO con lo medible: tandas cerradas por él, con sus
 * repeticiones conocidas y su tiempo real. Lo que está en vuelo no entra. Con
 * una sola tanda cerrada no se dice nada, porque un punto no es un ritmo.
 */
function Proyeccion({ segundos, restanteS }: { segundos: number | null; restanteS: number }) {
  if (segundos == null) return null;
  const seComeElCap = segundos > CAP_S;
  return (
    <NotaLateral tono={seComeElCap && restanteS <= AVISO_CAP_S ? 'accent' : 'muted'}>
      {seComeElCap
        ? 'Al ritmo de lo que llevas cerrado, te comes el cap.'
        : `Al ritmo de lo que llevas cerrado, acabas sobre ${reloj(segundos)}.`}
    </NotaLateral>
  );
}

/**
 * Cómo se sella. Y son DOS cosas distintas:
 *
 *  · si acabas, la puntuación es el tiempo (es un For Time);
 *  · si te come el cap, la puntuación son las repeticiones cerradas — y de la
 *    tanda que estabas haciendo no se apunta nada, porque nadie las contó.
 *    Declararlo cuesta un toque, así que se ofrece el toque (§7).
 */
function Cierre({
  muerto,
  scoreS,
  hechas,
  tandasCerradas,
  landscape,
  appearance,
  onLog,
}: {
  muerto: boolean;
  scoreS: number;
  hechas: number;
  tandasCerradas: number;
  landscape: boolean;
  appearance: TwinAppearance;
  onLog: (linea: string) => void;
}) {
  const enVuelo = TANDAS[tandasCerradas];
  const sujeto = muerto ? (
    <SujetoSello
      horizontal={landscape}
      label="Cap"
      cifra={String(hechas)}
      unidad={`de ${TOTAL_REPS} reps`}
      titulo={`Se acabó el cap a los ${reloj(CAP_S)}`}
    />
  ) : (
    <SujetoSello horizontal={landscape} label="Hecho" cifra={reloj(scoreS)} titulo={`${TOTAL_REPS} de ${TOTAL_REPS} reps`} />
  );
  const lineas = muerto ? (
    <LineasSello
      lineas={[
        `Cerraste ${tandasCerradas} tandas de ${TANDAS.length}, y ese es tu resultado.`,
        enVuelo
          ? `De la que estabas haciendo (${enVuelo.reps} ${enVuelo.nombre}) no se apunta nada: nadie cuenta repeticiones.`
          : 'De lo último no se apunta nada: nadie cuenta repeticiones.',
      ]}
    />
  ) : (
    <LineasSello
      lineas={[
        `Las ${TANDAS.length} tandas, cerradas por ti.`,
        `Dentro del cap de ${reloj(CAP_S)} por ${reloj(CAP_S - scoreS)}.`,
      ]}
    />
  );
  // Con el cap muerto queda algo que hacer, así que hay acción; acabando dentro
  // del cap no queda nada que declarar y la fila se reserva vacía (§10.3).
  const accion = muerto ? (
    <FranjaAccion
      titulo="APUNTA LAS QUE HICISTE"
      nota="un campo, un toque"
      onClick={() => onLog('Un campo, un toque: las repeticiones sueltas de la última tanda')}
    />
  ) : undefined;

  const cromo = (
    <CromoFormato
      posicion={muerto ? 'Se acabó el cap' : `${TANDAS.length} de ${TANDAS.length}`}
      pausado={false}
      onPausa={() => onLog('El bloque ya está cerrado: no hay nada que pausar')}
    />
  );
  const contexto = (
    <ContextoFormato scoreS={scoreS} cap={{ totalS: CAP_S, restanteS: muerto ? 0 : CAP_S - scoreS, urgente: muerto }} />
  );

  // El sello NO usa la banda fija del §10.3, y a propósito: la banda existe
  // para que el sujeto no baile ENTRE FORMATOS que se turnan durante el mismo
  // entreno, y de aquí ya no se vuelve. Un sello es un bloque único, así que su
  // estrategia es `centra` (§6.1) — con la banda, el resultado quedaba arriba y
  // las dos líneas que lo explican caían al fondo con 150 pt de vacío en medio,
  // que es justo el hueco que el contrato persigue.
  return (
    <Lienzo zona={null} appearance={appearance} acento={!muerto}>
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
      />
    </Lienzo>
  );
}
