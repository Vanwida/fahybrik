'use client';

// LA CLAVE, NO EL VÍDEO — lo que se puede leer sin soltar la serie.
//
// PROPUESTA. El tramo que corre el entreno (`WorkoutSegment`) lleva `videoUrl` y
// nada más de contenido: ni consejos, ni descripción, ni la nota que el coach
// escribió hoy para esa línea. Así que en mitad de una serie la única salida
// del atleta es pedir un VÍDEO, y abrirlo pausa el cronómetro
// (`session.pauseForVideo()`). Nadie para una serie para ver un vídeo: lo que
// quiere es la clave, una línea.
//
// Lo tramposo es que el dato YA está en el móvil. `WorkoutItem` trae `cues`,
// `exerciseDescription` y `notes`, y `ExerciseDetailView` los pinta en tres
// secciones. Lo que falta no es contenido: es que cruce al tramo en vivo y se
// resuelva a UNA línea. De ahí las cinco decisiones de esta pantalla:
//
//   1. En vivo manda la clave. El botón de vídeo se queda donde está, en el
//      cromo, para quien sí quiera parar y mirar.
//   2. La nota de HOY gana a los consejos del catálogo, y solo se pinta una
//      (la precedencia vive en `claveDe`, `data.ts`).
//   3. Una línea, siempre una. Si no cabe se corta y se toca para abrir la
//      ficha entera.
//   4. Sin contenido no hay línea. Ni relleno ni «sin técnica disponible».
//   5. Su sitio es bajo el nombre del movimiento y encima del riel de series,
//      en tinta atenuada: el sujeto sigue siendo LA SERIE y el naranja se
//      reserva para lo que hay que accionar.
//
// Los cuatro escenarios corren la MISMA serie (Back Squat 4×5 a 100 kg, la de
// `vivo-fuerza`) y solo cambian el contenido: lo único que se juzga es la línea.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Ambiente, FranjaAccion, MarcoVivo, zonaDe } from '../../kit-vivo';
import { useTimeline } from '../../sim';
import { Barra } from '../vivo-fuerza/barra';
import {
  Cabecera,
  RielSeries,
  Sujeto,
  SujetoNombre,
  TiraPlan,
  UltimaVez,
  dosisEnPeldanos,
  pastillaRir,
} from '../vivo-fuerza/atoms';
import { SERIE_1, ULTIMA_VEZ, kg } from '../vivo-fuerza/data';
import { LineaClave } from './clave';
import { FichaEjercicio } from './ficha';
import {
  BLOQUE,
  CASOS,
  PRESCRIPCION,
  PULSO_TRABAJANDO,
  RETARDO_FICHA_MS,
  SERIE_ACTIVA,
  claveDe,
} from './data';

export const meta: TwinMeta = {
  id: 'vivo-clave',
  titulo: 'La clave, no el vídeo',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-11',
  descripcion:
    'Durante una serie lo único que el atleta puede pedir hoy es un vídeo, y abrirlo pausa el cronómetro. Nadie para una serie para ver un vídeo: quiere la clave, una línea que se lee en un segundo. La nota que el coach escribió para hoy gana a los consejos del catálogo, se pinta una sola, y cuando no hay ninguna la línea sencillamente no existe.',
  fuentes: ['ios/FAHYBRIK/Workout/ActiveWorkoutView.swift', 'ios/FAHYBRIKCore/Workout/WorkoutModels.swift'],
  enApp:
    'Lo que hay hoy: el tramo en vivo solo lleva `videoUrl`, y el botón del cromo pausa el cronómetro al abrirlo. Los consejos, la descripción y la nota del coach ya viajan al móvil en `WorkoutItem` y se leen en la ficha del ejercicio, pero desde el plan y antes de entrenar. Es futuro que crucen al tramo y que la pantalla resuelva cuál de ellos se lee sin parar.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'nota-de-hoy',
    titulo: 'La nota que el coach escribió para hoy',
    descripcion:
      'El movimiento tiene consejos de catálogo y además una nota de hoy. Se pinta la nota: es la que sabe de esta sesión y de este atleta. Abre la ficha y verás que los consejos siguen enteros, no se han perdido.',
  },
  {
    id: 'consejos-del-catalogo',
    titulo: 'Hoy el coach no escribió nada',
    descripcion:
      'Sin nota para hoy habla el catálogo, que es la técnica de siempre. Misma serie, mismo sitio, misma tinta: lo único que cambia es de dónde sale la frase.',
  },
  {
    id: 'sin-clave',
    titulo: 'Sin nota y sin consejos',
    descripcion:
      'El catálogo está vacío y el coach no escribió nada, así que no hay línea. Ni un relleno ni un «sin técnica disponible»: el hueco se queda vacío y el botón de vídeo sigue donde estaba.',
  },
  {
    id: 'clave-larga',
    titulo: 'Una clave que no cabe',
    descripcion:
      'La nota de hoy son tres frases. La línea se corta y aparece la salida; al tocarla, la ficha la sirve entera con el vídeo, la descripción y los consejos. El cronómetro solo se para si pides el vídeo.',
  },
];

/** `play.circle.fill` a 16 pt, el mismo glifo que el cromo del entreno en vivo. */
function IconVideo({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M6.4 5.1 11 8l-4.6 2.9V5.1Z" fill="var(--twin-bg)" />
    </svg>
  );
}

/**
 * El botón de vídeo, intacto y en su sitio. Es la única mancha de acento del
 * cromo porque es lo único de ahí que se acciona, y sigue costando lo que
 * costaba: parar el cronómetro.
 */
function BotonVideo({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ver vídeo de técnica, pausa el cronómetro"
      style={{
        width: 28,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 0,
        color: 'var(--twin-accent-text)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <IconVideo />
    </button>
  );
}

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const caso = CASOS[escenario] ?? CASOS['nota-de-hoy'];
  const [ficha, setFicha] = useState(false);
  const p = PRESCRIPCION;
  const clave = claveDe(caso.contenido);
  const dosis = dosisEnPeldanos(p.reps, p.cargaKg);
  const abreSola = caso.abreFicha;

  // El guion del escenario largo: primero se ve la línea cortada, que es la
  // mitad de lo que hay que juzgar, y luego se abre lo que hay detrás.
  useTimeline(
    [
      {
        at: RETARDO_FICHA_MS,
        run: () => {
          setFicha(true);
          onLog('Tocas la clave: la ficha la sirve entera, sin tocar el cronómetro');
        },
      },
    ],
    abreSola
  );

  const abrirFicha = () => {
    setFicha(true);
    onLog('Ficha abierta desde la clave');
  };

  const lineaClave = clave ? (
    <LineaClave texto={clave.texto} nombre={p.ejercicio} onAbrir={abrirFicha} />
  ) : null;

  const encima = `Te toca · serie ${SERIE_ACTIVA + 1} de ${p.series}`;

  return (
    <div className="twin-screen-safe">
      <Ambiente zona={zonaDe(PULSO_TRABAJANDO)} appearance={appearance} />
      <MarcoVivo
        cromo={
          <Cabecera
            bloque={BLOQUE}
            ejercicio={p.ejercicio}
            indice={SERIE_ACTIVA + 1}
            total={p.series}
            onSalir={() => undefined}
            accion={
              caso.contenido.video ? (
                <BotonVideo onClick={() => onLog('Vídeo abierto: el cronómetro se pausa')} />
              ) : undefined
            }
          />
        }
        contexto={<TiraPlan p={p} />}
        sujeto={
          dosis ? (
            <Sujeto
              encima={encima}
              dosis={dosis}
              nombre={p.ejercicio}
              pastilla={pastillaRir(p.rir)}
              debajo={lineaClave}
            />
          ) : (
            <SujetoNombre encima={encima} nombre={p.ejercicio} debajo={lineaClave} />
          )
        }
        apoyos={
          <>
            {p.cargaKg != null && p.implemento === 'barra' && <Barra totalKg={p.cargaKg} />}
            <RielSeries total={p.series} activa={SERIE_ACTIVA} hechas={{ 0: SERIE_1 }} />
            <UltimaVez
              haceDias={ULTIMA_VEZ.haceDias}
              linea={`${ULTIMA_VEZ.series}×${ULTIMA_VEZ.reps} · ${kg(ULTIMA_VEZ.cargaKg)}`}
              detalle={`las ${ULTIMA_VEZ.seriesCompletas} enteras · te quedaban ${ULTIMA_VEZ.rirUltimaSerie} en la última`}
            />
          </>
        }
        accion={
          <FranjaAccion
            titulo="SERIE HECHA"
            onClick={() => onLog(`Serie ${SERIE_ACTIVA + 1} hecha`)}
            unicaSalida
          />
        }
      />
      {ficha && (
        <FichaEjercicio
          p={p}
          contenido={caso.contenido}
          onCerrar={() => {
            setFicha(false);
            onLog('Ficha cerrada: vuelves a la serie');
          }}
          onVideo={() => onLog('Vídeo abierto desde la ficha: el cronómetro se pausa')}
        />
      )}
    </div>
  );
}
