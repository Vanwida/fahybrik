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

import { useCallback, useState } from 'react';
import { CTA, Pantalla, SP, SecondaryCTA } from '../../kit';
import { COLOR_MODALIDAD, reloj } from '../../datos-reales';
import { useTimeline } from '../../sim';
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
import { Ambiente, Flash, Franja } from './atoms';
import { Sello, SujetoTrabajo, Trio } from './sujeto';
import { Riel, type Fila } from './ruta';
import { useCronoSim } from './crono';

/** Último minuto de cap: la franja se pone naranja y lo dice. */
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

export function EscenaPulso({ escenario, onLog }: { escenario: string; onLog: (linea: string) => void }) {
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

  if (acabado || muerto) {
    return (
      <Cierre
        muerto={muerto}
        scoreS={acabado ? scoreS : CAP_S}
        hechas={hechas}
        tandasCerradas={estado.cerradas.length}
        onLog={onLog}
      />
    );
  }

  const tanda = TANDAS[estado.activa];
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Ambiente color={COLOR} />
      {/* `inicioS` es el crono en el que arrancó la tanda, o sea el del último
          sello: el fogonazo sale de ahí sin guardar nada. */}
      <Flash activo={recienSellado(scoreS, estado.inicioS)} color={COLOR} />
      <Pantalla
        padding={0}
        gap={0}
        accion={
          <div style={{ padding: SP.m }}>
            <CTA
              title={estado.activa === TANDAS.length - 1 ? 'ÚLTIMA HECHA' : 'TANDA HECHA'}
              height={76}
              onClick={avanzar}
            />
          </div>
        }
      >
        <Franja
          posicion={`Tanda ${estado.activa + 1} de ${TANDAS.length}`}
          scoreS={scoreS}
          cap={{ totalS: CAP_S, restanteS, urgente: restanteS <= AVISO_CAP_S }}
          pausado={pausado}
          onPausa={alternarPausa}
        />
        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s, padding: SP.m }}>
          <SujetoTrabajo
            cifra={String(tanda.reps)}
            titulo={tanda.nombre}
            carga={tanda.carga}
            regla="cierras tú: nadie cuenta repeticiones"
          />
          <Trio
            celdas={[
              { label: 'Esta tanda', valor: reloj(parcialS) },
              { label: 'Cerradas', valor: `${hechas}/${TOTAL_REPS}`, unidad: 'reps' },
              { label: 'FC', valor: String(fcEn(parcialS)), unidad: 'ppm' },
            ]}
          />
          <Proyeccion segundos={proyeccion} restanteS={restanteS} />
          {/* Sin «ver todas»: seis tandas caben enteras. La hoja aparte existe
              para la ruta de 16, donde el riel tendría que comerse al sujeto. */}
          <Riel filas={filas} activo={estado.activa} alto={40} />
        </div>
      </Pantalla>
    </div>
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
    <div
      style={{
        flex: '0 0 auto',
        textAlign: 'center',
        font: '500 12px/1.3 var(--twin-font-sans)',
        color: seComeElCap && restanteS <= AVISO_CAP_S ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
      }}
    >
      {seComeElCap
        ? 'Al ritmo de lo que llevas cerrado, te comes el cap.'
        : `Al ritmo de lo que llevas cerrado, acabas sobre ${reloj(segundos)}.`}
    </div>
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
  onLog,
}: {
  muerto: boolean;
  scoreS: number;
  hechas: number;
  tandasCerradas: number;
  onLog: (linea: string) => void;
}) {
  const enVuelo = TANDAS[tandasCerradas];
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Ambiente color={muerto ? 'var(--twin-accent)' : COLOR} />
      <Pantalla padding={0} gap={0}>
        <Franja
          posicion={muerto ? 'Se acabó el cap' : `${TANDAS.length} de ${TANDAS.length}`}
          scoreS={scoreS}
          cap={{ totalS: CAP_S, restanteS: muerto ? 0 : CAP_S - scoreS, urgente: muerto }}
          pausado={false}
          onPausa={() => onLog('El bloque ya está cerrado: no hay nada que pausar')}
        />
        {muerto ? (
          <Sello
            label="Cap"
            cifra={String(hechas)}
            unidad={`de ${TOTAL_REPS} reps`}
            titulo={`Se acabó el cap a los ${reloj(CAP_S)}`}
            lineas={[
              `Cerraste ${tandasCerradas} tandas de ${TANDAS.length}, y ese es tu resultado.`,
              enVuelo
                ? `De la que estabas haciendo (${enVuelo.reps} ${enVuelo.nombre}) no se apunta nada: nadie cuenta repeticiones.`
                : 'De lo último no se apunta nada: nadie cuenta repeticiones.',
            ]}
            extra={
              <div style={{ width: 250, marginTop: SP.s }}>
                <SecondaryCTA
                  title="Apunta las que hiciste"
                  onClick={() => onLog('Un campo, un toque: las repeticiones sueltas de la última tanda')}
                />
              </div>
            }
          />
        ) : (
          <Sello
            label="Hecho"
            cifra={reloj(scoreS)}
            titulo={`${TOTAL_REPS} de ${TOTAL_REPS} reps`}
            lineas={[
              `Las ${TANDAS.length} tandas, cerradas por ti.`,
              `Dentro del cap de ${reloj(CAP_S)} por ${reloj(CAP_S - scoreS)}.`,
            ]}
          />
        )}
      </Pantalla>
    </div>
  );
}
