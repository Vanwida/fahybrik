'use client';

// El reloj de pared, en la muñeca. Ver `guion.ts` para el porqué de los CUATRO
// sujetos distintos: lo que comparten los cuatro formatos es el mecanismo (el
// crono corta y nadie mide el trabajo), no la pregunta que hace el atleta.

import { useState } from 'react';
import { useTicker } from '../../sim';
import {
  AroContinuo,
  AroSegmentado,
  Reloj,
  W,
  countdown,
  tinteDe,
  type EstadoDestello,
} from '../../kit-watch';
import { SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import {
  DEATH_BY_BURPEES,
  MOVILIDAD,
  PLANCHA,
  TABATA_BURPEES,
  TRINEO,
  bpmDe,
  cicloDe,
  faseDe,
  paginas,
  repsDelMinuto,
  rondasDe,
  trabajoDe,
  type Estado,
} from './guion';

export const meta: TwinMeta = {
  id: 'watch-reloj-de-pared',
  titulo: 'Muñeca · reloj de pared',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-05',
  descripcion:
    'Series, tabata, death by y trabajo continuo cuando no hay ni GPS ni máquina. Los cuatro los corta el crono, pero cada uno hace otra pregunta — y por eso salen cuatro sujetos del mismo lienzo.',
  fuentes: [],
  enApp:
    'Hoy los cuatro esquemas caen a `ForTimeLiveHUD` (ActiveWorkoutView.swift): enseña el crono del bloque, nunca la ventana de trabajo/descanso que los gobierna. Sin pantalla propia en iOS ni en el reloj.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'intervalos',
    titulo: 'El mínimo · series de plancha',
    descripcion:
      "Bloque 79, «Side plank 4x40''/20''»: cuatro rondas de 40 s y 20 s a peso corporal, sin objetivo escrito y sin ninguna ejecución que le dé pulso. Una sola página, y el numeral se queda toda la pantalla.",
  },
  {
    id: 'intervalos-estacion',
    titulo: 'Series con objetivo · trineo',
    descripcion:
      'Bloque 402, on/off por estación: 3×60/60 de empuje de trineo a RPE 9. Lo que gana el segundo nivel es el OBJETIVO, no el movimiento — el movimiento ya te lo sabes desde la primera ronda.',
  },
  {
    id: 'tabata',
    titulo: 'Tabata · 20/10 × 8',
    descripcion:
      'Cero casos en la biblioteca; la estructura sale del preajuste de la propia app. En ventanas de 20 y 10 s la cifra no sirve para nada: el sujeto es LA RONDA y el estado lo dice el color. Mira que el número no cambia al parar.',
  },
  {
    id: 'death-by',
    titulo: 'Death by · el minuto N pide N',
    descripcion:
      'Cero casos; arranque, incremento y minuto son los defectos del motor. Las repeticiones de este minuto son el sujeto, y suben de golpe al entrar el minuto. Aquí vive la única acción de la familia, atenuada porque estás en el suelo.',
  },
  {
    id: 'steady',
    titulo: 'Continuo · una sola ventana',
    descripcion:
      'Bloque 409, «Calentamiento general»: 5 min de movilidad de cadera. Una cosa que saber, y la pantalla entera es esa cosa — ni segundo nivel, ni acción, ni nota.',
  },
];

function inicial(escenario: string): Estado {
  const base = { ancla: SIN_ANCLA, t: 0, fallado: false } as const;
  const caso =
    escenario === 'intervalos-estacion'
      ? TRINEO
      : escenario === 'tabata'
        ? TABATA_BURPEES
        : escenario === 'death-by'
          ? DEATH_BY_BURPEES
          : escenario === 'steady'
            ? MOVILIDAD
            : PLANCHA;
  return { ...base, caso, ronda: caso.rondaActual };
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual (y un ref aquí lo cazaría `react-hooks/refs`).
  const rendirse = () => {
    if (e.caso.formato !== 'death_by' || e.fallado) return;
    setE({ ...e, fallado: true });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(`Fallaste el minuto ${e.ronda} · ${e.ronda - 1} rondas superadas`);
  };

  // EL RELOJ DE PARED, Y SÓLO ÉL, gobierna las transiciones de los cuatro
  // formatos: la ronda avanza la hayas acabado o no. Ésa es su definición, y es
  // lo único que los cuatro comparten de verdad.
  useTicker(true, () => {
    // Declarado el fallo, el bloque se acabó: el crono no sigue corriendo detrás.
    if (e.fallado) return;

    const ciclo = cicloDe(e.caso);
    const trabajo = trabajoDe(e.caso);
    const t = e.t + 1;

    // El continuo no rueda a ninguna ronda siguiente: se agota y se queda ahí.
    if (e.caso.formato === 'steady') {
      if (e.t >= e.caso.ventanaS) return;
      if (t >= e.caso.ventanaS) {
        setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
        onLog('Se acabó la ventana');
      }
      setE({ ...e, t: Math.min(t, e.caso.ventanaS) });
      return;
    }

    if (t >= ciclo) {
      const total = rondasDe(e.caso);
      // Un death by no tiene fin: la ronda siguiente siempre existe. Los que sí
      // tienen cuenta vuelven a la 1 para que el escenario se pueda ver entero.
      const ronda = total != null && e.ronda >= total ? 1 : e.ronda + 1;
      setE({ ...e, t: 0, ronda });
      setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
      onLog(
        e.caso.formato === 'death_by'
          ? `Minuto ${ronda} · ${repsDelMinuto(e.caso, ronda)} repeticiones`
          : `Ronda ${ronda}${total != null ? ` de ${total}` : ''}`,
      );
      return;
    }

    // El corte de trabajo a parada es el aviso que de verdad importa, y avisa de
    // PARAR: salta lo hayas acabado o no, porque quien decide es la ventana.
    if (ciclo > trabajo && t === trabajo) {
      setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
      onLog(`Para · ${countdown(ciclo - trabajo)} de respiro`);
    }
    setE({ ...e, t });
  });

  // Verde cuando NO estás trabajando: en la parada de una serie o de una tabata,
  // y con el bloque ya cerrado. Es un ESTADO, no una zona ni un aplauso — un
  // death by fallado también está en verde, porque verde aquí sólo significa
  // «ya no estás empujando».
  const enVerde = (e.caso.formato !== 'steady' && faseDe(e) === 'parada') || e.fallado;
  const rondas = rondasDe(e.caso);

  return (
    <Reloj
      paginas={paginas(e, { rendirse })}
      tinte={enVerde ? W.zoneGreen : tinteDe(bpmDe(e), e.ancla)}
      bisel={
        e.fallado ? undefined : rondas != null ? (
          // Series y tabata: una porción por ronda, y el ciclo entero de un
          // tirón dentro de la activa. Dice «cuántas me faltan» sin gastar una
          // línea de texto, que es lo que el sujeto no puede decir.
          <AroSegmentado total={rondas} hechas={e.ronda - 1} fraccion={e.t / cicloDe(e.caso)} />
        ) : (
          // Death by y continuo: no hay nada que segmentar. En el continuo
          // porque sólo hay una ventana; en el death by porque nadie sabe
          // cuántas rondas hay — la 12 existe si llegas.
          <AroContinuo fraccion={(cicloDe(e.caso) - e.t) / cicloDe(e.caso)} />
        )
      }
      destello={destello}
      onLog={onLog}
    />
  );
}
