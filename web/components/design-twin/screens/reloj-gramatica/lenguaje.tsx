'use client';

// EL LENGUAJE — los doce eventos del §4, uno tras otro, cada uno con lo que se
// VE en la muñeca y lo que VIBRA y se DICE (en el lector de debajo del reloj y
// en la cronología). Las frases salen de las funciones de voz del kit sobre
// pasos de datos, no de textos escritos a mano: si el paso cambia, la frase
// cambia sola.

import { useState, type ReactNode } from 'react';
import { useTimeline } from '../../sim';
import {
  AroSesion,
  AvisoVuelta,
  C,
  Columna,
  Muneca,
  Nota,
  PaginaVueltas,
  PasoCorrer,
  Recupera,
  T,
  TresDosUno,
  VOZ_SESION,
  useEventos,
  vozFinSerie,
  vozInicio,
  vozKm,
  vozPreaviso,
  vozRecupera,
  type EventoVivo,
  type Lecturas,
  type Paso,
  type Vuelta,
} from '../../kit-reloj';
import { ZONAS, planSeries } from './planes';

const { plan } = planSeries();
const serie3: Paso = { ...plan.pasos[5]!, siguiente: plan.pasos[6]! };
const rec3: Paso = { ...plan.pasos[6]!, siguiente: plan.pasos[7]! };
const rodaje: Paso = {
  id: 'rodaje',
  clase: 'rodaje',
  rol: 'trabajo',
  fase: 'principal',
  medida: { tipo: 'tiempo', prescrito: 3000, mide: 'reloj' },
  objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal', avisa: 'solo-arriba' }],
  cierre: 'medida',
  siguiente: null,
};

const lect = (x: Partial<Lecturas>): Lecturas => ({ t: 60, hecho: 380, ritmo: 230, ppm: 171, gps: 'listo', ...x });

const VUELTA3: Vuelta = { n: 3, clase: 'serie', segundos: 228, metros: 1000, ritmo: 228, ppm: 172, veredicto: 'dentro', eje: 'ritmo' };
const VUELTAS: Vuelta[] = [
  { n: 1, clase: 'serie', segundos: 231, metros: 1000, ritmo: 231, ppm: 169, veredicto: 'dentro', eje: 'ritmo' },
  { n: 2, clase: 'serie', segundos: 228, metros: 1000, ritmo: 228, ppm: 171, veredicto: 'dentro', eje: 'ritmo' },
  VUELTA3,
];

/** Un hito sin número: «Bloque hecho», «Sesión completada». */
function Hito({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <Columna estilo={{ justifyContent: 'center', gap: 10 }}>
      <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10.5" fill="none" stroke={C.tinta2} strokeWidth="1.5" />
        <path d="M7.5 12.5 10.3 15.3 16.5 9" fill="none" stroke={C.tinta} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600, textAlign: 'center', lineHeight: 1.15 }}>{titulo}</span>
      <Nota>{detalle}</Nota>
    </Columna>
  );
}

interface Momento {
  evento: EventoVivo;
  voz?: string;
  cara: (n321: number) => ReactNode;
  pausado?: boolean;
  /** El paso que dibuja el aro en este momento (índice del plan). */
  i: number;
}

const MOMENTOS: Momento[] = [
  { evento: 'cuenta', i: 4, cara: (n) => <TresDosUno n={n} paso={serie3} /> },
  { evento: 'go', i: 5, voz: vozInicio(serie3), cara: () => <TresDosUno n={0} paso={serie3} /> },
  {
    evento: 'recupera',
    i: 6,
    voz: vozRecupera(rec3, rec3.siguiente),
    cara: () => <Recupera paso={rec3} lecturas={lect({ t: 2, hecho: 2, ritmo: 372, ppm: 171, ppmTendencia: 'baja' })} zonas={ZONAS} onEmpezarYa={() => undefined} />,
  },
  { evento: 'preaviso', i: 5, voz: vozPreaviso(serie3, 100), cara: () => <PasoCorrer paso={serie3} lecturas={lect({ t: 207, hecho: 900 })} zonas={ZONAS} /> },
  { evento: 'afloja', i: 5, cara: () => <PasoCorrer paso={serie3} lecturas={lect({ ritmo: 218 })} zonas={ZONAS} /> },
  { evento: 'aprieta', i: 5, cara: () => <PasoCorrer paso={serie3} lecturas={lect({ ritmo: 244 })} zonas={ZONAS} /> },
  {
    evento: 'vuelta',
    i: 5,
    voz: vozKm(5, 292),
    cara: () => (
      <>
        <PasoCorrer paso={rodaje} lecturas={lect({ t: 1460, hecho: 1460, ritmo: 292, ppm: 145 })} zonas={ZONAS} />
        <AvisoVuelta titulo="Kilómetro 5" valor="4:52" pie="ritmo del km" />
      </>
    ),
  },
  { evento: 'fin-serie', i: 6, voz: vozFinSerie(serie3, VUELTA3), cara: () => <PaginaVueltas vueltas={VUELTAS} objetivo="3:45–3:55" /> },
  { evento: 'bloque', i: 12, cara: () => <Hito titulo="Series hechas" detalle="Viene: Vuelta a la calma · 10′" /> },
  { evento: 'sesion', i: 13, voz: VOZ_SESION, cara: () => <Hito titulo="Sesión completada" detalle="guardando…" /> },
  { evento: 'accion', i: 5, pausado: true, cara: () => <PasoCorrer paso={serie3} lecturas={lect({})} zonas={ZONAS} /> },
  {
    evento: 'enlace',
    i: 5,
    cara: () => <PasoCorrer paso={serie3} lecturas={lect({ viejos: ['hecho', 'ritmo'] })} zonas={ZONAS} />,
  },
];

const PASO_MS = 3500;

export function Lenguaje({ onLog }: { onLog: (linea: string) => void }) {
  const ev = useEventos(onLog);
  const [k, setK] = useState(0);
  const [n321, setN321] = useState(3);

  // 3-2-1 al segundo y, a partir del GO, un evento cada 3,5 s.
  const pasos = [
    ...[3, 2, 1].map((n, j) => ({
      at: j * 1000,
      run: () => {
        setK(0);
        setN321(n);
        ev.emitir('cuenta');
      },
    })),
    ...MOMENTOS.slice(1).map((m, j) => ({
      at: 3000 + j * PASO_MS,
      run: () => {
        setK(j + 1);
        ev.emitir(m.evento, m.voz);
      },
    })),
  ];
  useTimeline(pasos);

  const m = MOMENTOS[k]!;
  const finSesion = m.i >= plan.pasos.length;
  const pasoAro = plan.pasos[Math.min(m.i, plan.pasos.length - 1)]!;
  return (
    <Muneca
      paginas={[{ id: `m${k}`, titulo: m.evento, contenido: m.cara(n321) }]}
      aro={<AroSesion pasos={plan.pasos} i={finSesion ? plan.pasos.length : m.i} paso={pasoAro} lecturas={lect({ t: 60, hecho: 380 })} />}
      pausado={m.pausado ?? false}
      onPausa={() => undefined}
      eventos={ev}
      onLog={onLog}
    />
  );
}
