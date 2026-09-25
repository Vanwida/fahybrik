// LOS PLANES DE WOD Y ERGO — las sesiones reales escritas como pasos del kit,
// sin una línea de texto libre salvo el cue del coach. Fuente: get_session de
// 498, 572, 506, 552, 505, 530, 536 y 514 (atletas 63 y 64) y la lente 6 de la
// auditoría. Lo que NO sale de una sesión real se dice aquí:
//   · 498 no trae carga en la Bench Press: los 60 kg son de ejemplo, para ver
//     dónde va la carga (P12: «la tarea con su carga»).
//   · El AMRAP 15′ de tres movimientos, el For Time con cap 20:00 y el Tabata
//     son ilustrativos: no hay ninguno asignado (lente 6: «sin casos reales de
//     AMRAP como bloque»).
//   · 530 «3×2′ @Z2» por máquina se lee como rotación (una ronda = SkiErg, Row
//     y Assault Bike): sin descanso escrito, 3 × 2′ en la misma máquina serían
//     6′ seguidos y el coach lo habría escrito así.
//   · 536: de «Bloque 1» solo la escalera de remo; el Burpee Broad Jump «10/15»
//     es de la cara de estación (reloj-circuito).
//
// M5 (EMOM con duración total explícita): el EMOM se escribe como N ventanas
// con su tarea, así que el total es un dato (498: 6 rondas × 2 minutos = 12′),
// no el «máximo de rondas» que hoy lo deja en 6′ o 12′ según quién lo lea.

import {
  REGLAS_AVISO_DEFECTO,
  dosisTarea,
  fmtDuracion,
  textoTarea,
  wodDe,
  type FilaLista,
  type InfoWod,
  type Medida,
  type Objetivo,
  type PasoBase,
  type PlanSesion,
  type QuienMide,
  type Tarea,
  type ZonasCoach,
} from '../../kit-reloj';

/** Umbral 170 ppm, 5 zonas del coach (Z1 ≤ 138 · Z2 ≤ 150 · Z3 ≤ 160 · Z4 ≤ 173 · Z5 ≤ 192). */
export const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };

// La tarea y su formato son del kit (`PasoBase.wod`, `Tarea`, `InfoWod`), y
// también sus textos (`textoTarea`, `dosisTarea`, `cargaTarea`): el mismo EMOM
// se dice igual en la muñeca, en la voz y en la Estructura.

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

const tiempo = (s: number, mide: QuienMide = 'reloj'): Medida => ({ tipo: 'tiempo', prescrito: s, mide });
const metros = (m: number, mide: QuienMide): Medida => ({ tipo: 'distancia', prescrito: m, mide });
const reps = (n: number): Medida => ({ tipo: 'reps', prescrito: n, mide: 'atleta' });
const ABIERTA: Medida = { tipo: 'abierta', prescrito: null, mide: 'atleta' };
const zona = (z: number, avisa?: Objetivo['avisa']): Objetivo => ({ eje: 'zona', min: z, max: z, papel: 'principal', avisa });
const rpe = (n: number): Objetivo => ({ eje: 'rpe', min: n, max: n, papel: 'principal' });
const split = (s: number): Objetivo => ({ eje: 'split500', min: s, max: s, papel: 'principal' });

let cuenta = 0;
const id = (p: string) => `${p}-${++cuenta}`;

type Parcial = Omit<PasoBase, 'id' | 'cierre' | 'objetivos' | 'fase'> & Partial<Pick<PasoBase, 'cierre' | 'objetivos' | 'fase'>>;
const paso = (p: Parcial): PasoBase => ({ id: id(p.clase), cierre: 'medida', objetivos: [], fase: 'principal', ...p });

const base = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

export type Formato = 'emom' | 'amrap' | 'chipper' | 'fortime' | 'carrera' | 'ergo' | 'pared';

export interface PlanWod {
  plan: PlanSesion;
  formato: Formato;
  /** El formato con su tamaño: «EMOM 12′», «AMRAP 15′», «For Time · cap 20:00». */
  titulo: string;
  estructura: (i: number) => FilaLista[];
}

const estado = (i: number, desde: number, hasta: number): FilaLista['estado'] =>
  i > hasta ? 'hecho' : i >= desde ? 'ahora' : 'pendiente';

// ---------------------------------------------------------------------------
// EMOM — N ventanas, cada una con su tarea (M5)
// ---------------------------------------------------------------------------

const maquinaDe = (t: Tarea): PasoBase['maquina'] =>
  t.nombre === 'Row' ? { tipo: 'remo' } : t.nombre === 'SkiErg' ? { tipo: 'ski' } : undefined;

function emom(ciclo: Tarea[], rondas: number, ventanaS: number): PasoBase[] {
  const n = ciclo.length * rondas;
  return Array.from({ length: n }, (_, k) => {
    const tarea = ciclo[k % ciclo.length]!;
    return paso({
      clase: 'emom',
      rol: 'trabajo',
      medida: tiempo(ventanaS),
      nombre: tarea.nombre,
      carga: tarea.carga,
      maquina: maquinaDe(tarea),
      entorno: tarea.corre ? 'cinta' : undefined,
      posicion: { serie: { n: k + 1, de: n } },
      bloque: 0,
      wod: { formato: 'emom', tarea, ciclo, ventanas: n, ventanaS },
    });
  });
}

function filasEmom(ciclo: Tarea[], ventanaS: number, pasos: PasoBase[]) {
  return (i: number): FilaLista[] => {
    const actual = wodDe(pasos[i]);
    return ciclo.map((t, k) => ({
      linea: `${k + 1} · ${t.nombre}${t.corre ? ' en cinta' : ''}`,
      detalle: dosisTarea(t) ?? `${fmtDuracion(ventanaS)} entero`,
      estado: actual?.formato === 'emom' && actual.tarea === t ? 'ahora' : 'pendiente',
    }));
  };
}

/** 498 · «EMOM 6′ · 6×6» Bench Press alterno con «EMOM 6′ · 6×1′» Row = 12′ (M5). */
export function emom498(): PlanWod {
  const bench: Tarea = { nombre: 'Bench Press', dosis: reps(6), carga: { kg: 60 }, mide: 'atleta' };
  const row: Tarea = { nombre: 'Row', dosis: null, mide: 'ergo' };
  const pasos = emom([bench, row], 6, 60);
  return { plan: base(pasos), formato: 'emom', titulo: 'EMOM 12′', estructura: filasEmom([bench, row], 60, pasos) };
}

/** 572 · Row, SkiErg y Run (en cinta) cada 75″, «EMOM 5′ · 5×75″» cada uno = 15 ventanas, 18:45. */
export function emom572(): PlanWod {
  const ciclo: Tarea[] = [
    { nombre: 'Row', dosis: null, mide: 'ergo' },
    { nombre: 'SkiErg', dosis: null, mide: 'ergo' },
    { nombre: 'Run', dosis: null, mide: 'cinta', corre: true },
  ];
  const pasos = emom(ciclo, 5, 75);
  return { plan: base(pasos), formato: 'emom', titulo: 'EMOM 18:45', estructura: filasEmom(ciclo, 75, pasos) };
}

// ---------------------------------------------------------------------------
// AMRAP — la ventana y, detrás, la puntuación (rondas + reps, o reps)
// ---------------------------------------------------------------------------

function amrap(tareas: Tarea[], duracionS: number, extra: Partial<Parcial> = {}): PasoBase[] {
  const ventana = paso({
    clase: 'amrap',
    rol: 'trabajo',
    medida: tiempo(duracionS),
    nombre: tareas.length === 1 ? tareas[0]!.nombre : undefined,
    bloque: 0,
    ...extra,
    wod: { formato: 'amrap', tareas, duracionS },
  });
  // La puntuación: se dice con la corona y se guarda con la acción. En un
  // chipper el reloj no para, así que se le da un tiempo (y un 3-2-1 al paso
  // siguiente); si no se dice, queda «sin declarar», nunca 0.
  const puntuacion = paso({
    clase: 'amrap',
    rol: 'transicion',
    medida: extra.posicion ? tiempo(20) : ABIERTA,
    cierre: extra.posicion ? 'medida' : 'atleta',
    nombre: ventana.nombre,
    posicion: extra.posicion,
    bloque: extra.bloque ?? 0,
    wod: { formato: 'puntuacion', tareas, duracionS },
  });
  return [ventana, puntuacion];
}

/** AMRAP 15′ de tres movimientos (ilustrativo): 30 reps por ronda. */
export function amrap15(): PlanWod {
  const tareas: Tarea[] = [
    { nombre: 'Wall Ball', dosis: reps(12), carga: { kg: 9 }, mide: 'atleta' },
    { nombre: 'KB Swing', dosis: reps(10), carga: { kg: 24 }, mide: 'atleta' },
    { nombre: 'Burpee', dosis: reps(8), corporal: true, mide: 'atleta' },
  ];
  const pasos = amrap(tareas, 900);
  return {
    plan: base(pasos),
    formato: 'amrap',
    titulo: 'AMRAP 15′',
    estructura: (i) => tareas.map((t) => ({ linea: textoTarea(t), estado: i === 0 ? 'ahora' : 'hecho' })),
  };
}

/** 506 · Chipper: 4 × [Run 800 m @RPE 8 → AMRAP 4′ de un movimiento, a peso corporal]. */
export function chipper506(): PlanWod {
  const movimientos = ['Pull-up', 'Walking Lunge', 'Push-up', 'Air Squat'];
  const pasos: PasoBase[] = [];
  movimientos.forEach((m, k) => {
    const ronda = { n: k + 1, de: 4 };
    pasos.push(
      // El Run no lleva `wod`: es un paso de correr y usa la cara de correr (P10).
      // Un solo bloque del coach (el chipper entero): cambiar de ronda no es «bloque hecho».
      paso({ clase: 'carrera', rol: 'trabajo', nombre: 'Run', medida: metros(800, 'gps'), objetivos: [rpe(8)], posicion: { ronda }, bloque: 0 }),
      ...amrap([{ nombre: m, dosis: ABIERTA, corporal: true, mide: 'atleta' }], 240, { posicion: { ronda }, bloque: 0 }),
    );
  });
  return {
    plan: base(pasos),
    formato: 'chipper',
    titulo: 'Chipper · 4 rondas',
    estructura: (i) =>
      movimientos.flatMap((m, k) => [
        { linea: 'Run · 800 m', detalle: 'RPE 8', estado: estado(i, k * 3, k * 3) },
        { linea: `AMRAP 4′ · ${m}`, detalle: 'peso corporal', estado: estado(i, k * 3 + 1, k * 3 + 2) },
      ]),
  };
}

// ---------------------------------------------------------------------------
// For Time — el crono total es la puntuación
// ---------------------------------------------------------------------------

/** For Time · cap 20:00 · 3 rondas: 500 m Row (PM5) · 20 Wall Ball 9 kg · 10 Burpee (ilustrativo). */
export function forTimeWod(): PlanWod {
  const tareas: Tarea[] = [
    { nombre: 'Row', dosis: metros(500, 'ergo'), mide: 'ergo' },
    { nombre: 'Wall Ball', dosis: reps(20), carga: { kg: 9 }, mide: 'atleta' },
    { nombre: 'Burpee', dosis: reps(10), corporal: true, mide: 'atleta' },
  ];
  const pasos: PasoBase[] = [];
  for (let r = 1; r <= 3; r++) {
    tareas.forEach((t, k) =>
      pasos.push(
        paso({
          clase: 'fortime',
          rol: 'trabajo',
          medida: t.dosis!,
          cierre: t.mide === 'atleta' ? 'atleta' : 'medida',
          nombre: t.nombre,
          carga: t.carga,
          maquina: maquinaDe(t),
          posicion: { ronda: { n: r, de: 3 }, estacion: { n: k + 1, de: 3 } },
          bloque: 0,
          wod: { formato: 'fortime', tarea: t, capS: 1200 },
        }),
      ),
    );
  }
  return {
    plan: base(pasos),
    formato: 'fortime',
    titulo: 'For Time · cap 20:00',
    estructura: (i) => {
      const r = Math.floor(i / 3);
      return tareas.map((t, k) => ({ linea: textoTarea(t), estado: estado(i, r * 3 + k, r * 3 + k) }));
    },
  };
}

/** 552 · Cursa Popular de Sabadell 5K: «For Time · 5000 m», «ritmo de competición» (nota del coach → cue, M8). */
export function carrera552(): PlanWod {
  const carrera = paso({
    clase: 'carrera',
    rol: 'trabajo',
    medida: metros(5000, 'gps'),
    cue: 'ritmo de competición',
    vueltaAutoM: 1000,
    bloque: 0,
    wod: { formato: 'fortime', tarea: null, capS: null },
  });
  return { plan: base([carrera]), formato: 'carrera', titulo: 'For Time · 5 km', estructura: () => [{ linea: 'Run · 5 km', detalle: 'For Time', estado: 'ahora' }] };
}

// ---------------------------------------------------------------------------
// Ergo — el /500 contra su banda (PM5), la zona por tiempo, el techo de pulso
// ---------------------------------------------------------------------------

/** 505 · SkiErg 8 × 250 m @2:05/500 · r 45″. Sin PM5, los 250 m los dices tú. */
export function ergo505(pm5: boolean): PlanWod {
  const pasos: PasoBase[] = [];
  for (let k = 1; k <= 8; k++) {
    pasos.push(
      paso({
        clase: 'ergo',
        rol: 'trabajo',
        nombre: 'SkiErg',
        maquina: { tipo: 'ski' },
        medida: metros(250, pm5 ? 'ergo' : 'atleta'),
        cierre: pm5 ? 'medida' : 'atleta',
        objetivos: [split(125)],
        posicion: { serie: { n: k, de: 8 } },
        bloque: 0,
      }),
    );
    if (k < 8) pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', medida: tiempo(45), modoRecupera: 'parado', bloque: 0 }));
  }
  return {
    plan: base(pasos),
    formato: 'ergo',
    titulo: 'SkiErg · 8 × 250 m',
    estructura: (i) => [{ linea: '8 × SkiErg · 250 m', detalle: 'a 2:05 /500 · r 45″ parado', estado: estado(i, 0, 14) }],
  };
}

/** 530 · Calentamiento aeróbico: 3 × (SkiErg 2′ · Row 2′ · Assault Bike 2′) @Z2 + Run 7′ @Z2. */
export function ergo530(): PlanWod {
  const maquinas: Array<[string, PasoBase['maquina'], QuienMide]> = [
    ['SkiErg', { tipo: 'ski' }, 'ergo'],
    ['Row', { tipo: 'remo' }, 'ergo'],
    ['Assault Bike', { tipo: 'bici' }, 'reloj'],
  ];
  const pasos: PasoBase[] = [];
  for (let r = 1; r <= 3; r++) {
    maquinas.forEach(([nombre, maquina, mide]) =>
      pasos.push(
        paso({
          clase: 'ergo',
          rol: 'trabajo',
          fase: 'calentamiento',
          nombre,
          maquina,
          medida: tiempo(120, mide),
          objetivos: [zona(2)],
          posicion: { ronda: { n: r, de: 3 } },
          bloque: 0,
          }),
      ),
    );
  }
  const run = paso({ clase: 'rodaje', rol: 'trabajo', fase: 'calentamiento', medida: tiempo(420), objetivos: [zona(2, 'solo-arriba')], bloque: 0 });
  pasos.push(run);
  return {
    plan: base(pasos),
    formato: 'ergo',
    titulo: 'Calentamiento aeróbico',
    estructura: (i) => [
      { linea: '3 × (SkiErg · Row · Bike)', detalle: '2′ cada una a Z2', estado: estado(i, 0, 8) },
      { linea: 'Run · 7′', detalle: 'a Z2', estado: estado(i, 9, 9) },
    ],
  };
}

/** 536 · Bloque 1: Row en escalera 90″ @Z2 → 1′ @Z3 → 30″ @Z4 · r 4′ (M4: tres pasos, tres objetivos). */
export function escalera536(): PlanWod {
  const tramos: Array<[number, number]> = [
    [90, 2],
    [60, 3],
    [30, 4],
  ];
  const pasos: PasoBase[] = tramos.map(([s, z], k) =>
    paso({
      clase: 'ergo',
      rol: 'trabajo',
      nombre: 'Row',
      maquina: { tipo: 'remo' },
      medida: tiempo(s, 'ergo'),
      objetivos: [zona(z)],
      posicion: { tramo: { n: k + 1, de: 3 } },
      bloque: 0,
    }),
  );
  pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', medida: tiempo(240), modoRecupera: 'parado', bloque: 0 }));
  return {
    plan: base(pasos),
    formato: 'ergo',
    titulo: 'Row · escalera',
    estructura: (i) => [
      ...tramos.map(([s, z], k) => ({ linea: `Row · ${fmtDuracion(s)}`, detalle: `a Z${z}`, estado: estado(i, k, k) })),
      { linea: 'Recupera · 4′', detalle: 'parado', estado: estado(i, 3, 3) },
    ],
  };
}

/** 514 · Assault Bike 45′ @Z1 · «Máximo 142 ppm»: Z1 manda; el techo solo avisa por arriba (M1). */
export function bike514(): PlanWod {
  const bici = paso({
    clase: 'ergo',
    rol: 'trabajo',
    nombre: 'Assault Bike',
    maquina: { tipo: 'bici' },
    medida: tiempo(2700),
    objetivos: [zona(1, 'solo-arriba'), { eje: 'ppm', min: null, max: 142, papel: 'techo' }],
    bloque: 0,
  });
  return { plan: base([bici]), formato: 'ergo', titulo: 'Assault Bike · 45′', estructura: () => [{ linea: 'Assault Bike · 45′', detalle: 'a Z1 · máx 142 ppm', estado: 'ahora' }] };
}

// ---------------------------------------------------------------------------
// Reloj de pared — Tabata 8 × 20″ / 10″ (ilustrativo)
// ---------------------------------------------------------------------------

export function tabata(): PlanWod {
  const info: InfoWod = { formato: 'pared', trabajoS: 20, descansoS: 10, rondas: 8 };
  const pasos: PasoBase[] = [];
  for (let k = 1; k <= 8; k++) {
    pasos.push(paso({ clase: 'series', rol: 'trabajo', nombre: 'Burpee', medida: tiempo(20), objetivos: [rpe(10)], posicion: { ronda: { n: k, de: 8 } }, bloque: 0, wod: info }));
    if (k < 8) pasos.push(paso({ clase: 'descanso', rol: 'descanso', medida: tiempo(10), bloque: 0, wod: info }));
  }
  return {
    plan: base(pasos),
    formato: 'pared',
    titulo: 'Tabata · 8 × 20″/10″',
    estructura: (i) => [{ linea: '8 × Burpee · 20″', detalle: 'RPE 10 · r 10″', estado: estado(i, 0, 14) }],
  };
}
