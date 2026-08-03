'use client';

// El minuto, en la muñeca. Ver `guion.ts` para el porqué de las tres pantallas
// que salen del MISMO formato según lo que el cuerpo pueda hacer en cada ronda.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroContinuo, Reloj, W, countdown, tinteDe, type EstadoDestello } from '../../kit-watch';
import { SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import {
  EMOM_BURPEES,
  EMOM_MAQUINAS,
  bpmDe,
  faseDe,
  paginas,
  quedaDe,
  tareaDe,
  type Estado,
} from './guion';

export const meta: TwinMeta = {
  id: 'watch-emom',
  titulo: 'Muñeca · EMOM',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-03',
  descripcion:
    'El aro lleva la ventana entera de un tirón, porque no se para porque tú acabes antes. Al marcar la tarea el mismo número se pone verde y pasa a leerse como el respiro que te queda.',
  fuentes: [],
  enApp:
    'RotatingLiveView shipea los datos EMOM y el verde en descanso; sin aro y sin interacción del atleta.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-maquina',
    titulo: 'El mínimo · sin máquina',
    descripcion:
      'Ejecución 177, sin ergo emparejado al móvil: la tarea se pinta como la escribió el coach y NO se cuenta nada. Ni un contador a 0 — sin máquina no hay contador.',
  },
  {
    id: 'con-maquina',
    titulo: 'Con el ergo emparejado',
    descripcion:
      'El mismo EMOM con el ski conectado al móvil: el segundo nivel cuenta metros y va marcado «del móvil». Rondas alternas de ski y bici, para ver el 45/15 entero.',
  },
  {
    id: 'a-pulso',
    titulo: 'A pulso · burpees',
    descripcion:
      'Plantilla 462: 10 rondas de 60 s a burpees. En el suelo no se mira ni se toca, así que la misma vista se vuelve ciega. Mismo formato, otra pantalla.',
  },
];

function inicial(escenario: string): Estado {
  const base = { ancla: SIN_ANCLA, t: 0, hechaEnS: null } as const;
  switch (escenario) {
    case 'con-maquina':
      return { ...base, caso: EMOM_MAQUINAS, ronda: EMOM_MAQUINAS.rondaActual, maquina: true };
    case 'a-pulso':
      return { ...base, caso: EMOM_BURPEES, ronda: EMOM_BURPEES.rondaActual, maquina: false };
    default:
      return { ...base, caso: EMOM_MAQUINAS, ronda: EMOM_MAQUINAS.rondaActual, maquina: false };
  }
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual (y un ref aquí lo cazaría `react-hooks/refs`).
  const marcarHecha = () => {
    setE({ ...e, hechaEnS: e.t });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(`Ronda ${e.ronda} hecha · ${countdown(quedaDe(e))} de respiro`);
  };

  // El reloj de pared, y sólo él, gobierna las transiciones de este formato: la
  // ronda avanza la hayas marcado o no. Ésa es la definición del EMOM.
  useTicker(true, () => {
    const t = e.t + 1;
    if (t >= e.caso.ventanaS) {
      const ronda = e.ronda >= e.caso.rondas ? 1 : e.ronda + 1;
      setE({ ...e, t: 0, ronda, hechaEnS: null });
      setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
      onLog(`Ronda ${ronda} de ${e.caso.rondas} · ${tareaDe(e.caso, ronda).texto}`);
      return;
    }
    // El corte de trabajo a parada es el aviso que de verdad importa, y avisa de
    // PARAR: salta lo hayas acabado o no, porque quien decide es la ventana.
    if (e.caso.ventanaS > e.caso.trabajoS && t === e.caso.trabajoS) {
      setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
      onLog('Para · empieza el cambio');
    }
    setE({ ...e, t });
  });

  // Verde cuando NO estás trabajando: en la parada, y desde el instante en que
  // marcas la tarea. Es un estado, no una zona — igual que el descanso de fuerza.
  const enVerde = faseDe(e) === 'parada' || e.hechaEnS != null;

  return (
    <Reloj
      paginas={paginas(e, { marcarHecha })}
      tinte={enVerde ? W.zoneGreen : tinteDe(bpmDe(e), e.ancla)}
      // La ventana entera, de un tirón y cruzando trabajo y parada: el aro no se
      // reinicia a mitad de minuto porque el minuto no se reinicia.
      bisel={<AroContinuo fraccion={(e.caso.ventanaS - e.t) / e.caso.ventanaS} />}
      destello={destello}
      onLog={onLog}
    />
  );
}
