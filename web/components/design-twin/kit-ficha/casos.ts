// Los casos con los que se rompe el modelo de la ficha ANTES de pintarlo.
//
// Dieciséis sesiones, cinco de ellas REALES (las del doble de hace un mes, con su
// procedencia: salen de `datos-reales.ts` y pasan por el adaptador de abajo, así
// que si el modelo no las aguantara se vería aquí) y once de DISEÑO, escritas para
// cubrir lo que las reales no traen: la rampa de cargas con %RM y tempo, la
// superserie, el EMOM que alterna, el AMRAP, el metcon de rondas, las series de
// pista, el ergo por tramos, la prueba, el Dobles y la sesión sin detalle.
//
// Ninguna lleva texto libre más allá de lo que escribe el coach (su nota, la nota
// de un bloque): todo lo demás son campos del contrato. Los datos de un atleta
// (última vez, 1RM) salen solo donde alguien los midió.

import {
  BACK_SQUAT,
  CIRCUITO_PIERNA,
  FARTLEK_16X500,
  HYROX,
  REMO_500,
  distanciaDosis,
  dosisConSeries,
  fraseDeRecuperacion,
  reloj,
  type BloqueReal,
  type ItemReal,
  type SesionReal,
} from '../datos-reales';
import { fichaSesionDe } from '../screens/sesion-previa/data';
import type {
  Bloque,
  CasoFicha,
  LecturaFicha,
  Modalidad,
  Movimiento,
  PerfilTramos,
  RolDeBloque,
  Zona,
} from './contrato';

// ---------------------------------------------------------------------------
// El adaptador de lo real: `SesionReal` (lo que guarda la base) → `LecturaFicha`
// ---------------------------------------------------------------------------

function zonaDe(objetivo: string | undefined): Zona | undefined {
  const m = /^Z([1-5])$/.exec(objetivo ?? '');
  return m ? (Number(m[1]) as Zona) : undefined;
}

function perfilDe(item: ItemReal): PerfilTramos | undefined {
  const tramos = item.estructura;
  if (!tramos || tramos.length === 0) return undefined;
  const principales = tramos.filter((t) => (t.fase ?? 'principal') === 'principal');
  const trabajos = principales.filter((t) => t.tipo === 'trabajo');
  const primero = trabajos[0];
  if (!primero) return undefined;
  const medida =
    primero.metros != null ? distanciaDosis(primero.metros) : primero.segundos ? reloj(primero.segundos, 'segundos') : null;
  if (!medida) return undefined;
  const recuperacion = principales.find((t) => t.tipo === 'recuperacion');
  return {
    repeticiones: trabajos.length,
    trabajo: { medida, zona: primero.zona as Zona | undefined, objetivo: primero.objetivo },
    recuperacion: recuperacion
      ? {
          frase: fraseDeRecuperacion(recuperacion) ?? '',
          zona: recuperacion.zona as Zona | undefined,
          activa: recuperacion.modo === 'trote' || recuperacion.modo === 'caminar',
        }
      : undefined,
  };
}

function movimientoDeReal(item: ItemReal): Movimiento {
  const perfil = perfilDe(item);
  const zona = zonaDe(item.objetivo);
  return {
    id: '',
    nombre: item.nombre,
    modalidad: item.modalidad,
    dosis: perfil ? `${perfil.repeticiones} × ${perfil.trabajo.medida}` : dosisConSeries(item),
    objetivo: zona ? undefined : item.objetivo,
    zona,
    descanso: !perfil && item.descansoS ? reloj(item.descansoS, 'segundos') : undefined,
    perfil,
  };
}

/**
 * «Run 1 km, estación, Run 1 km, estación…» son OCHO estaciones precedidas de la
 * misma carrera, no dieciséis filas. Solo se pliega cuando la alternancia es exacta:
 * una carrera distinta en medio rompe el patrón y el bloque se queda como lista.
 */
function plegarEstaciones(items: ItemReal[]): { carrera: string; estaciones: ItemReal[] } | null {
  if (items.length < 4 || items.length % 2 !== 0) return null;
  const carrera = items[0];
  for (let i = 0; i < items.length; i += 2) {
    if (items[i].nombre !== carrera.nombre || items[i].dosis !== carrera.dosis) return null;
  }
  for (let i = 1; i < items.length; i += 2) {
    if (items[i].nombre === carrera.nombre) return null;
  }
  const dosis = (carrera.dosis ?? '').replace(',00', '');
  return { carrera: dosis, estaciones: items.filter((_, i) => i % 2 === 1) };
}

function bloqueDeReal(b: BloqueReal, indice: number): Bloque {
  const base = { id: `b${indice}`, titulo: b.titulo };
  if (b.estructural) {
    const rol: RolDeBloque = indice === 0 ? 'calentamiento' : 'vuelta';
    return { ...base, rol, formato: { tipo: 'marco' }, movimientos: b.items.map(movimientoDeReal) };
  }
  const plegado = plegarEstaciones(b.items);
  if (plegado) {
    return {
      ...base,
      rol: 'principal',
      formato: { tipo: 'estaciones', carrera: plegado.carrera },
      movimientos: plegado.estaciones.map(movimientoDeReal),
    };
  }
  if (b.items.some((i) => i.estructura)) {
    return { ...base, rol: 'principal', formato: { tipo: 'intervalos' }, movimientos: b.items.map(movimientoDeReal) };
  }
  const continuo = b.items.length === 1 && !(b.items[0].series && b.items[0].series > 1);
  return {
    ...base,
    rol: 'principal',
    formato: continuo ? { tipo: 'continuo' } : { tipo: 'series' },
    movimientos: b.items.map(movimientoDeReal),
  };
}

/** Los ids de los movimientos salen del orden: nadie los escribe a mano. */
function conIds(l: LecturaFicha): LecturaFicha {
  return {
    ...l,
    bloques: l.bloques.map((b) => ({
      ...b,
      movimientos: b.movimientos.map((m, i) => ({ ...m, id: `${b.id}-${i}` })),
    })),
  };
}

function desdeReal(sesion: SesionReal, resto: Partial<LecturaFicha> = {}): LecturaFicha {
  const ficha = fichaSesionDe(sesion.procedencia);
  return conIds({
    titulo: sesion.titulo,
    origen: sesion.origen,
    cuando: 'Hoy',
    coach: ficha.coach,
    nota: ficha.porque,
    minutos: ficha.duracionMin,
    bloques: sesion.bloques.map(bloqueDeReal),
    ...resto,
  });
}

// ---------------------------------------------------------------------------
// Constructores de los casos de diseño
// ---------------------------------------------------------------------------

function mov(nombre: string, modalidad: Modalidad, dosis: string | null, extra: Partial<Movimiento> = {}): Movimiento {
  return { id: '', nombre, modalidad, dosis, ...extra };
}

const CALENTAR_PIERNA: Movimiento[] = [
  mov('BikeErg', 'bike', '5:00', { objetivo: 'RPE 3' }),
  mov('Leg Swings', 'mobility', '2×10'),
  mov('Thoracic Rotation', 'mobility', '2×10'),
  mov('Air Squat', 'functional', '2×15', { objetivo: 'peso corporal' }),
];

const VUELTA_SUAVE: Movimiento[] = [
  mov('BikeErg', 'bike', '5:00', { objetivo: 'RPE 2' }),
  mov('Foam roll lower body', 'mobility', '5:00'),
  mov('Breathing Work', 'mobility', '3:00'),
];

const marco = (id: string, titulo: string, rol: RolDeBloque, movimientos: Movimiento[]): Bloque => ({
  id,
  titulo,
  rol,
  formato: { tipo: 'marco' },
  movimientos,
});

// ---------------------------------------------------------------------------
// Los dieciséis casos
// ---------------------------------------------------------------------------

const FUERZA_COMPLETA: LecturaFicha = conIds({
  titulo: 'Fuerza A · sentadilla y empuje',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  minutos: 70,
  nota: 'La sentadilla manda hoy. Las dos primeras series son para entrar en calor: ligeras y con el tempo marcado. En el press, para una repetición antes del fallo.',
  bloques: [
    marco('calentar', 'Calentamiento', 'calentamiento', CALENTAR_PIERNA),
    {
      id: 'fuerza',
      titulo: 'Fuerza',
      rol: 'principal',
      formato: { tipo: 'series' },
      movimientos: [
        mov('Back Squat', 'strength', '5×5', {
          tempo: '3-1-1',
          series: [
            { trabajo: '5 reps', carga: '60 kg', descanso: '1:30' },
            { trabajo: '5 reps', carga: '70 kg', descanso: '1:30' },
            { trabajo: '5 reps', carga: '80 kg', descanso: '2:30' },
            { trabajo: '5 reps', carga: '80 kg', descanso: '2:30' },
            { trabajo: '5 reps', carga: '80 kg' },
          ],
          nota: 'Baja hasta que el muslo pase la paralela. Pausa de un segundo abajo.',
        }),
        mov('Bench Press', 'strength', '4×8', {
          objetivo: '70 % RM',
          segunTuRm: { kg: '56 kg' },
          tempo: '2-0-1',
          descanso: '2:00',
          material: ['barra', 'discos', 'banco'],
        }),
        mov('Pull-Up', 'strength', '3×6', { objetivo: 'RPE 8', descanso: '1:30', material: ['barra de dominadas'] }),
      ],
    },
    marco('calma', 'Vuelta a la calma', 'vuelta', VUELTA_SUAVE),
  ],
});

const HYROX_DOBLES: LecturaFicha = (() => {
  const base = desdeReal(HYROX, {
    titulo: 'Simulación HYROX dobles',
    conPareja: 'Marta',
    nota: 'Os repartís cada estación a medias. Salid juntos de cada kilómetro y entrad juntos a la estación.',
    minutos: undefined,
    sinDuracion: 'Dura lo que tardes',
  });
  const mitades: Record<string, { tuParte: string; total: string }> = {
    SkiErg: { tuParte: '500 m', total: '1.000 m' },
    'Sled Push': { tuParte: '25 m', total: '50 m' },
    'Sled Pull': { tuParte: '25 m', total: '50 m' },
    'Burpee Broad Jump': { tuParte: '40 m', total: '80 m' },
    Rowing: { tuParte: '500 m', total: '1.000 m' },
    'Farmers Carry': { tuParte: '100 m', total: '200 m' },
    'Sandbag Lunges': { tuParte: '50 m', total: '100 m' },
    'Wall Balls': { tuParte: '50 reps', total: '100 reps' },
  };
  return {
    ...base,
    bloques: base.bloques.map((b) =>
      b.formato.tipo === 'estaciones'
        ? { ...b, titulo: base.titulo, movimientos: b.movimientos.map((m) => ({ ...m, reparto: mitades[m.nombre] })) }
        : b
    ),
  };
})();

const HIBRIDO: LecturaFicha = conIds({
  titulo: 'Híbrido · peso muerto y metcon',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  sinDuracion: 'Dura lo que tardes',
  nota: 'Hoy dos cosas: peso pesado y luego piernas cansadas. El peso muerto se hace bien aunque el metcon espere: la técnica no se negocia.',
  bloques: [
    marco('calentar', 'Calentamiento', 'calentamiento', [
      mov('BikeErg', 'bike', '5:00', { objetivo: 'RPE 3' }),
      mov('Leg Swings', 'mobility', '2×10'),
      mov('Air Squat', 'functional', '2×15', { objetivo: 'peso corporal' }),
    ]),
    {
      id: 'fuerza',
      titulo: 'Peso muerto',
      rol: 'principal',
      formato: { tipo: 'series' },
      movimientos: [
        mov('Deadlift', 'strength', '5×3', {
          objetivo: '85 % RM',
          segunTuRm: { kg: '102 kg' },
          descanso: '3:00',
          tempo: '1-0-X',
          material: ['barra', 'discos'],
        }),
      ],
    },
    {
      id: 'metcon',
      titulo: 'Metcon',
      rol: 'principal',
      formato: { tipo: 'fortime', rondas: 3, topeMin: 14 },
      nota: 'Si pasas del tope, para donde estés: cuenta lo que llevas.',
      movimientos: [
        mov('Run', 'run', '400 m'),
        mov('Kettlebell Swing', 'functional', '15 reps', { objetivo: '24 kg', material: ['kettlebell'] }),
        mov('Box Jump', 'functional', '12 reps', { objetivo: '60 cm', material: ['cajón'] }),
      ],
    },
    marco('calma', 'Vuelta a la calma', 'vuelta', VUELTA_SUAVE),
  ],
});

const SERIES_PISTA: LecturaFicha = conIds({
  titulo: 'Series 6 × 800 m',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  sinDuracion: 'Según tu ritmo y tus descansos',
  nota: 'Las dos primeras salen controladas: tienen que ser las más lentas. De la cuarta en adelante, aguanta el ritmo aunque duela.',
  bloques: [
    marco('calentar', 'Calentamiento', 'calentamiento', [
      mov('Run', 'run', '15:00', { zona: 2 }),
      mov('Leg Swings', 'mobility', '2×10'),
    ]),
    {
      id: 'series',
      titulo: 'Series',
      rol: 'principal',
      formato: { tipo: 'intervalos' },
      movimientos: [
        mov('Run', 'run', null, {
          perfil: {
            repeticiones: 6,
            trabajo: { medida: '800 m', objetivo: '@ 4:10/km' },
            recuperacion: { frase: 'recuperación 1:30 suave', activa: true },
          },
        }),
      ],
    },
    marco('calma', 'Vuelta a la calma', 'vuelta', [mov('Run', 'run', '10:00', { zona: 1 })]),
  ],
});

const AMRAP: LecturaFicha = conIds({
  titulo: 'AMRAP 12 minutos',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  sinDuracion: 'Según tu ritmo y tus descansos',
  nota: 'Si en la segunda ronda ya vas ahogado, escala: baja las dominadas a banda. Lo que cuenta es mantener el ritmo los doce minutos.',
  bloques: [
    marco('calentar', 'Calentamiento', 'calentamiento', [
      mov('Leg Swings', 'mobility', '2×10'),
      mov('Air Squat', 'functional', '2×15', { objetivo: 'peso corporal' }),
    ]),
    {
      id: 'amrap',
      titulo: 'Metcon',
      rol: 'principal',
      formato: { tipo: 'amrap', minutos: 12 },
      movimientos: [
        mov('Pull-Up', 'strength', '5 reps', { material: ['barra de dominadas'] }),
        mov('Wall Balls', 'functional', '10 reps', { objetivo: '9 kg' }),
        mov('Air Squat', 'functional', '15 reps'),
      ],
    },
    marco('calma', 'Vuelta a la calma', 'vuelta', [
      mov('Foam roll lower body', 'mobility', '5:00'),
      mov('Breathing Work', 'mobility', '3:00'),
    ]),
  ],
});

const EMOM: LecturaFicha = conIds({
  titulo: 'EMOM 12 minutos',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  sinDuracion: 'Según tu ritmo y tus descansos',
  bloques: [
    marco('calentar', 'Calentamiento', 'calentamiento', [mov('BikeErg', 'bike', '5:00', { objetivo: 'RPE 3' })]),
    {
      id: 'emom',
      titulo: 'Remo y wall balls',
      rol: 'principal',
      formato: { tipo: 'emom', minutos: 12, alterna: true },
      nota: 'Si acabas antes del minuto, descansa lo que sobre. Si no llegas, para y espera al siguiente.',
      movimientos: [
        mov('Rowing', 'row', '12 cal', { rol: 'Minuto impar' }),
        mov('Wall Balls', 'functional', '12 reps', { objetivo: '9 kg', rol: 'Minuto par' }),
      ],
    },
  ],
});

const SUPERSERIE: LecturaFicha = conIds({
  titulo: 'Fuerza · superserie',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  sinDuracion: 'Según tu ritmo y tus descansos',
  nota: 'Entre una y otra no descanses: el descanso va al acabar la pareja.',
  bloques: [
    marco('calentar', 'Calentamiento', 'calentamiento', CALENTAR_PIERNA),
    {
      id: 'super',
      titulo: 'Pierna y espalda',
      rol: 'principal',
      formato: { tipo: 'superserie', rondas: 4, descanso: '1:30' },
      movimientos: [
        mov('Reverse Lunge', 'strength', '8 reps', { objetivo: '30 kg', rol: 'A1' }),
        mov('Pull-Up', 'strength', '6 reps', { rol: 'A2', material: ['barra de dominadas'] }),
      ],
    },
    {
      id: 'accesorio',
      titulo: 'Accesorio',
      rol: 'principal',
      formato: { tipo: 'series' },
      movimientos: [mov('Farmers Carry', 'functional', '3×40 m', { objetivo: '24 kg', descanso: '1:00' })],
    },
  ],
});

const RODAJE: LecturaFicha = conIds({
  titulo: 'Rodaje suave 45 minutos',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  minutos: 45,
  nota: 'Que puedas hablar sin ahogarte. Si el pulso se dispara, camina un minuto y vuelve.',
  bloques: [
    {
      id: 'rodaje',
      titulo: 'Rodaje suave 45 minutos',
      rol: 'principal',
      formato: { tipo: 'continuo' },
      movimientos: [mov('Run', 'run', '45:00', { zona: 2 })],
    },
  ],
});

const ERGO: LecturaFicha = conIds({
  titulo: 'Remo 5 × 500 m',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  minutos: 40,
  nota: 'Cada 500 m igual que el anterior. Si el último sale más lento que el primero, saliste demasiado fuerte.',
  bloques: [
    marco('calentar', 'Calentamiento', 'calentamiento', [mov('BikeErg', 'bike', '5:00', { objetivo: 'RPE 3' })]),
    {
      id: 'ergo',
      titulo: 'Series de remo',
      rol: 'principal',
      formato: { tipo: 'intervalos' },
      movimientos: [
        mov('Rowing', 'row', null, {
          perfil: {
            repeticiones: 5,
            trabajo: { medida: '500 m', objetivo: '@ 1:50/500m' },
            recuperacion: { frase: 'descanso 2:00', activa: false },
          },
        }),
      ],
    },
    marco('calma', 'Vuelta a la calma', 'vuelta', [mov('Rowing', 'row', '5:00', { objetivo: 'RPE 2' })]),
  ],
});

const PRUEBA: LecturaFicha = conIds({
  titulo: 'Test de 3 km',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  prueba: true,
  sinDuracion: 'Dura lo que tardes',
  nota: 'Calienta bien. Sal controlado el primer kilómetro: es una prueba, no una carrera.',
  bloques: [
    marco('calentar', 'Calentamiento', 'calentamiento', [
      mov('Run', 'run', '10:00', { zona: 2 }),
      mov('Leg Swings', 'mobility', '2×10'),
    ]),
    {
      id: 'prueba',
      titulo: 'Test de 3 km',
      rol: 'principal',
      formato: { tipo: 'continuo' },
      movimientos: [mov('Run', 'run', '3 km', { objetivo: 'RPE 10' })],
    },
    marco('calma', 'Vuelta a la calma', 'vuelta', [mov('Run', 'run', '5:00', { zona: 1 })]),
  ],
});

const SIN_DETALLE: LecturaFicha = {
  titulo: 'Sesión de Pablo',
  origen: 'coach',
  cuando: 'Hoy',
  coach: 'Pablo',
  sinDuracion: 'Sin detallar',
  nota: 'Hoy sal a rodar por sensaciones. Te escribo el detalle por el chat.',
  bloques: [],
};

export const CASOS: CasoFicha[] = [
  {
    id: 'fuerza-completa',
    titulo: 'Fuerza A · sentadilla y empuje',
    mira: 'El día típico de fuerza: rampa de cargas con tempo, %RM resuelto a kilos y calentamiento plegado.',
    origen: 'diseño',
    lectura: FUERZA_COMPLETA,
  },
  {
    id: 'hyrox',
    titulo: 'Simulación HYROX · 16 estaciones',
    mira: 'El caso que desborda (real, plantilla 441): dieciséis filas son OCHO estaciones precedidas de la misma carrera.',
    origen: 'real',
    lectura: desdeReal(HYROX, { minutos: undefined, sinDuracion: 'Dura lo que tardes' }),
  },
  {
    id: 'hibrido',
    titulo: 'Híbrido · peso muerto y metcon',
    mira: 'Dos formatos en un día: series de fuerza y un For Time de tres rondas con tope.',
    origen: 'diseño',
    lectura: HIBRIDO,
  },
  {
    id: 'series-pista',
    titulo: 'Series 6 × 800 m',
    mira: 'Correr por tramos: la ficha enseña la FORMA (seis veces fuerte, trote en medio), no una lista.',
    origen: 'diseño',
    lectura: SERIES_PISTA,
  },
  {
    id: 'fartlek',
    titulo: 'Fartlek 16 × 500 m en Z4',
    mira: 'Real (plantilla 609): dieciséis series con el minuto de en medio al trote, sin nota ni duración.',
    origen: 'real',
    lectura: desdeReal(FARTLEK_16X500, { sinDuracion: 'Según tu ritmo y tus descansos', minutos: undefined }),
  },
  {
    id: 'amrap',
    titulo: 'AMRAP 12 minutos',
    mira: 'Un reloj que manda: el bloque dice 12 min y qué se repite; sin dosis por serie.',
    origen: 'diseño',
    lectura: AMRAP,
  },
  {
    id: 'emom',
    titulo: 'EMOM 12 · alterna',
    mira: 'Cada minuto toca una cosa distinta: impar y par, con la nota del bloque.',
    origen: 'diseño',
    lectura: EMOM,
  },
  {
    id: 'superserie',
    titulo: 'Fuerza · superserie',
    mira: 'Una pareja A1/A2 que se repite cuatro rondas y un accesorio suelto.',
    origen: 'diseño',
    lectura: SUPERSERIE,
  },
  {
    id: 'rodaje',
    titulo: 'Rodaje suave 45 minutos',
    mira: 'La sesión más sencilla con nota del coach: una carrera continua a zona, sin estructura que enseñar.',
    origen: 'diseño',
    lectura: RODAJE,
  },
  {
    id: 'ergo',
    titulo: 'Remo 5 × 500 m',
    mira: 'Un ergo por tramos: el descanso aquí SÍ es parado, y se dice distinto del trote del fartlek.',
    origen: 'diseño',
    lectura: ERGO,
  },
  {
    id: 'prueba',
    titulo: 'Test de 3 km',
    mira: 'Una prueba: se mide, no hay «Ya lo hice», y la ficha lo dice sin asustar.',
    origen: 'diseño',
    lectura: PRUEBA,
  },
  {
    id: 'dobles',
    titulo: 'HYROX dobles con Marta',
    mira: 'En pareja: cada estación enseña TU parte (la mitad) y el total debajo.',
    origen: 'diseño',
    lectura: HYROX_DOBLES,
  },
  {
    id: 'circuito',
    titulo: 'Circuito de pierna · cuatro sin dosis',
    mira: 'Real (plantilla 442): el coach dejó cuatro movimientos sin cuánto. Se ve el nombre solo, no un 0.',
    origen: 'real',
    lectura: desdeReal(CIRCUITO_PIERNA, {
      ultima: { resumen: '52:00 · 138 ppm', cuando: 'hace 9 días' },
    }),
  },
  {
    id: 'back-squat',
    titulo: 'Back Squat · una sola cosa',
    mira: 'Real (plantilla 497): 9 de cada 11 sesiones del entreno libre son UN movimiento. Con tu última vez.',
    origen: 'real',
    lectura: desdeReal(BACK_SQUAT, {
      sinDuracion: 'Según tu ritmo y tus descansos',
      ultima: { resumen: '9:32 · 95 ppm', cuando: 'hace 6 días' },
    }),
  },
  {
    id: 'remo',
    titulo: 'Remo 500 m · el mínimo',
    mira: 'Real (plantilla 500): un movimiento, una distancia, un ritmo.',
    origen: 'real',
    lectura: desdeReal(REMO_500, { sinDuracion: 'Según tu ritmo y tus descansos' }),
  },
  {
    id: 'sin-detalle',
    titulo: 'Sin detalle',
    mira: 'La sesión no trae ejercicios: se dice, con la nota del coach, y no se inventa una lista.',
    origen: 'diseño',
    lectura: SIN_DETALLE,
  },
];

export function casoDeFicha(id: string): CasoFicha {
  return CASOS.find((c) => c.id === id) ?? CASOS[0];
}
