import { describe, expect, it } from 'vitest';
import { zonaDe } from '@/components/design-twin/kit-vivo';
import {
  PENDIENTE_QUE_RETIRA_EL_RITMO_PCT,
  lecturaDeCorrer,
  type Carrera,
  type Muestra,
  type Objetivo,
  type Repeticion,
} from '@/components/design-twin/screens/lectura-carrera/modelo';
import { dominioDelRitmo } from '@/components/design-twin/screens/lectura-carrera/curva';
import { ESCENAS } from '@/components/design-twin/screens/lectura-carrera/datos';

// Lo que este test defiende es UNA frase: **el sujeto lo decide cuánta
// información sobrevive**, y la precedencia es el orden en que la carrera la
// pierde. Mientras haya intención medible y tramos que medir, el sujeto es si
// la clavó; sin intención queda el contraste; sin estructura queda la media;
// sin archivo quedan los totales, y se dice por qué.
//
// Las degradaciones son la mitad que de verdad se rompe sola con el tiempo —
// un tramo suelto que se cuela como veredicto, una cuesta que vuelve a
// compararse por ritmo— así que van con el mismo peso que el camino feliz.
//
// El veredicto NO se comprueba contra una reimplementación: `lecturaDeCorrer`
// llama a `evaluateRunSegment` de `@fahybrid/shared/domain/adherence`, el mismo
// motor que juzga la sesión en el panel del coach. Lo que se defiende aquí es
// QUIÉN gana el número grande, no cómo se compara un ritmo con una banda.

// ---------------------------------------------------------------------------
// Constructores — una carrera se arma por lo que la distingue, no por sus 20 campos
// ---------------------------------------------------------------------------

const TRAZA_MINIMA = { ritmo: [{ t: 0, v: 300 }], pulso: [{ t: 0, v: 140 }] };

function carrera(parcial: Partial<Carrera> = {}): Carrera {
  return {
    titulo: 'Carrera',
    cuando: 'Hoy',
    momento: 'al-terminar',
    prescrito: null,
    objetivo: { clase: 'ninguno' },
    superficie: 'calle',
    distanciaM: 10_000,
    duracionS: 3000,
    fcMediaPpm: 150,
    fcMaxPpm: 175,
    desnivelM: null,
    traza: TRAZA_MINIMA,
    repeticiones: [],
    certezaTramos: null,
    kilometros: [],
    zonasS: {},
    derivado: {},
    ruta: [],
    procedencia: 'test',
    ...parcial,
  };
}

/** Series de trabajo con su ritmo, separadas por la recuperación que se le pase. */
function conSeries(
  ritmos: number[],
  opciones: { recuperacionSkm?: number | null; pendientePct?: number | null; duracionS?: number } = {},
): Repeticion[] {
  const { recuperacionSkm = null, pendientePct = null, duracionS = 170 } = opciones;
  const reps: Repeticion[] = [];
  let t = 0;
  ritmos.forEach((skm, i) => {
    reps.push({
      n: i + 1,
      papel: 'trabajo',
      inicioS: t,
      duracionS,
      distanciaM: Math.round((duracionS / skm) * 1000),
      ritmoSkm: skm,
      fcMediaPpm: 172,
      pendientePct,
    });
    t += duracionS;
    if (i < ritmos.length - 1) {
      reps.push({
        n: i + 1,
        papel: 'recuperacion',
        modo: recuperacionSkm == null ? 'parado' : 'trote',
        inicioS: t,
        duracionS: 120,
        distanciaM: recuperacionSkm == null ? null : Math.round((120 / recuperacionSkm) * 1000),
        ritmoSkm: recuperacionSkm,
        fcMediaPpm: 140,
        pendientePct,
      });
      t += 120;
    }
  });
  return reps;
}

/** «a 3:30» ensanchado ±5 s/km, que es lo que hace `paceBandFromTarget`. */
const A_330: Objetivo = { clase: 'ritmo', rapidoSkm: 205, lentoSkm: 215 };

// ---------------------------------------------------------------------------
// La jerarquía, peldaño a peldaño
// ---------------------------------------------------------------------------

describe('la precedencia del sujeto', () => {
  it('con objetivo medible y varias series, el sujeto es EL VEREDICTO', () => {
    const l = lecturaDeCorrer(
      carrera({ objetivo: A_330, repeticiones: conSeries([208, 210, 209, 212, 224, 213]) }),
    );
    expect(l.sujeto.clase).toBe('veredicto');
    if (l.sujeto.clase !== 'veredicto') return;
    expect(l.sujeto.evaluables).toBe(6);
    expect(l.sujeto.dentro).toBe(5);
    expect(l.sujeto.sesgo).toBe('lento');
    // La quinta se fue 9 s por encima del borde lento (224 − 215).
    expect(l.sujeto.peorDesvioS).toBe(9);
  });

  it('sin objetivo pero con contraste, el sujeto es EL CONTRASTE', () => {
    const l = lecturaDeCorrer(
      carrera({
        objetivo: { clase: 'sensacion' },
        repeticiones: conSeries([232, 236, 240, 244], { recuperacionSkm: 318 }),
      }),
    );
    expect(l.sujeto.clase).toBe('contraste');
    if (l.sujeto.clase !== 'contraste') return;
    expect(l.sujeto.nFuertes).toBe(4);
    expect(l.sujeto.fuerteSkm).toBeCloseTo(238, 0);
    expect(l.sujeto.suaveSkm).toBeCloseTo(318, 0);
    // El contraste es lo que hace que 3:58 signifique algo: se DA, no se deduce.
    expect(l.sujeto.contrasteSkm).toBeCloseTo(80, 0);
  });

  it('con objetivo de zona sobre trabajo continuo, el sujeto es EL TIEMPO DENTRO', () => {
    const l = lecturaDeCorrer(
      carrera({
        objetivo: { clase: 'zona', zona: 2, minPpm: 132, maxPpm: 143 },
        duracionS: 3600,
        zonasS: { z1: 600, z2: 2400, z3: 600 },
      }),
    );
    expect(l.sujeto.clase).toBe('tiempo-en-zona');
    if (l.sujeto.clase !== 'tiempo-en-zona') return;
    expect(l.sujeto.segundos).toBe(2400);
    expect(l.sujeto.pct).toBe(67);
  });

  it('uniforme y sin objetivo, el sujeto es LA MEDIA — y sin veredicto que colgarle', () => {
    const l = lecturaDeCorrer(carrera({ distanciaM: 12_000, duracionS: 3432 }));
    expect(l.sujeto.clase).toBe('ritmo-medio');
    if (l.sujeto.clase !== 'ritmo-medio') return;
    expect(l.sujeto.skm).toBeCloseTo(286, 0);
    expect(l.sujeto.veredicto).toBeNull();
  });

  it('sin archivo, el sujeto degrada a LOS KILÓMETROS y dice por qué', () => {
    const l = lecturaDeCorrer(carrera({ traza: null, distanciaM: 15_380, momento: 'revision' }));
    expect(l.sujeto.clase).toBe('kilometros');
    if (l.sujeto.clase !== 'kilometros') return;
    expect(l.sujeto.km).toBeCloseTo(15.38, 2);
    // El porqué NO es opcional: es lo que separa «no lo sabemos» de «no lo hay».
    expect(l.sujeto.porque).toMatch(/anterior al archivo/i);
    expect(l.troceado).toBe('ninguno');
    expect(l.banda).toBeNull();
    expect(l.veredictos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Las degradaciones — la mitad que se rompe sola
// ---------------------------------------------------------------------------

describe('las degradaciones', () => {
  it('UN SOLO tramo juzgable no da veredicto: «1 de 1 dentro» no es una lectura', () => {
    const l = lecturaDeCorrer(carrera({ objetivo: A_330, repeticiones: conSeries([210]) }));
    expect(l.sujeto.clase).toBe('ritmo-medio');
    if (l.sujeto.clase !== 'ritmo-medio') return;
    // El veredicto no se pierde: baja a apoyo de la media, que es su sitio.
    expect(l.sujeto.veredicto).toBe('dentro');
  });

  it('pasado el umbral de pendiente, el troceado se mide en TIEMPO', () => {
    const l = lecturaDeCorrer(
      carrera({
        objetivo: { clase: 'sensacion' },
        repeticiones: conSeries([270, 280, 290, 315], {
          recuperacionSkm: 700,
          pendientePct: PENDIENTE_QUE_RETIRA_EL_RITMO_PCT,
          duracionS: 56,
        }),
      }),
    );
    expect(l.eje).toBe('tiempo');
    expect(l.sujeto.clase).toBe('tiempo-por-repeticion');
    if (l.sujeto.clase !== 'tiempo-por-repeticion') return;
    expect(l.sujeto.nRepeticiones).toBe(4);
    expect(l.sujeto.mediaS).toBe(56);
  });

  it('y en cuesta el veredicto de ritmo SE RETIRA aunque hubiera banda', () => {
    const l = lecturaDeCorrer(
      carrera({
        objetivo: A_330,
        repeticiones: conSeries([270, 280], { pendientePct: PENDIENTE_QUE_RETIRA_EL_RITMO_PCT + 5 }),
      }),
    );
    expect(l.sujeto.clase).toBe('tiempo-por-repeticion');
    // Ni banda dibujada ni veredictos: comparar 4:30 en llano con 4:30 al 8% es
    // el error que este corrector existe para no cometer.
    expect(l.banda).toBeNull();
    expect(l.veredictos).toEqual([]);
  });

  it('justo por debajo del umbral el ritmo SIGUE valiendo — la regla no dispara de más', () => {
    const l = lecturaDeCorrer(
      carrera({
        objetivo: A_330,
        repeticiones: conSeries([208, 212], { pendientePct: PENDIENTE_QUE_RETIRA_EL_RITMO_PCT - 0.5 }),
      }),
    );
    expect(l.eje).toBe('ritmo');
    expect(l.sujeto.clase).toBe('veredicto');
  });

  it('con banda pero sin ritmo medido, no se inventa un veredicto', () => {
    const sinRitmo = conSeries([210, 212]).map((r) =>
      r.papel === 'trabajo' ? { ...r, ritmoSkm: null, fcMediaPpm: null } : r,
    );
    const l = lecturaDeCorrer(carrera({ objetivo: A_330, repeticiones: sinRitmo }));
    // Nada evaluable → no hay veredicto que dar, y tampoco contraste (no hay
    // ritmo de nada): cae a la media de la sesión, que sí se midió.
    expect(l.sujeto.clase).toBe('ritmo-medio');
  });

  it('hubo contraste pero la recuperación fue PARADA: se dice, no se rellena', () => {
    const l = lecturaDeCorrer(
      carrera({ objetivo: { clase: 'sensacion' }, repeticiones: conSeries([232, 240]) }),
    );
    expect(l.sujeto.clase).toBe('contraste');
    if (l.sujeto.clase !== 'contraste') return;
    expect(l.sujeto.suaveSkm).toBeNull();
    expect(l.sujeto.contrasteSkm).toBeNull();
    expect(l.sujeto.recuperacion).toBe('parado');
  });

  it('un objetivo de zona sin pulso clasificado no finge tiempo en zona', () => {
    const l = lecturaDeCorrer(
      carrera({ objetivo: { clase: 'zona', zona: 2, minPpm: 132, maxPpm: 143 }, zonasS: {} }),
    );
    expect(l.sujeto.clase).toBe('ritmo-medio');
  });
});

// ---------------------------------------------------------------------------
// La recuperación — que en carrera casi nunca es un parado
// ---------------------------------------------------------------------------

describe('la recuperación tiene objetivo, y se comprueba', () => {
  const conTrote = (ritmos: number[], troteSkm: number[]): Repeticion[] => {
    const reps: Repeticion[] = [];
    let t = 0;
    ritmos.forEach((skm, i) => {
      reps.push({ n: i + 1, papel: 'trabajo', inicioS: t, duracionS: 170, distanciaM: 800, ritmoSkm: skm, fcMediaPpm: 172, pendientePct: null });
      t += 170;
      if (i < troteSkm.length) {
        reps.push({ n: i + 1, papel: 'recuperacion', modo: 'trote', inicioS: t, duracionS: 120, distanciaM: 320, ritmoSkm: troteSkm[i]!, fcMediaPpm: 150, pendientePct: null });
        t += 120;
      }
    });
    return reps;
  };
  /** «2′ de trote a 6:00-6:20». */
  const TROTE: Objetivo = { clase: 'ritmo', rapidoSkm: 360, lentoSkm: 380 };

  it('el trote se juzga con el MISMO motor que el trabajo', () => {
    const l = lecturaDeCorrer(
      carrera({
        objetivo: A_330,
        objetivoRecuperacion: TROTE,
        // Dos se van rápido (348, 344) y uno se queda lento (392).
        repeticiones: conTrote([208, 210, 209, 212], [372, 348, 344, 392]),
      }),
    );
    expect(l.veredictosRecuperacion).toEqual(['dentro', 'fuera_rapido', 'fuera_rapido', 'fuera_lento']);
    expect(l.bandaRecuperacion).toEqual({ rapidoSkm: 360, lentoSkm: 380 });
  });

  it('sin objetivo de recuperación no se inventa ninguno', () => {
    const l = lecturaDeCorrer(carrera({ objetivo: A_330, repeticiones: conTrote([208, 210], [372]) }));
    expect(l.veredictosRecuperacion).toEqual([]);
    expect(l.bandaRecuperacion).toBeNull();
  });

  it('una recuperación PARADA con objetivo cae en «sin dato», no en un veredicto', () => {
    const parado = conSeries([208, 210, 209]); // `conSeries` recupera parado por defecto
    const l = lecturaDeCorrer(carrera({ objetivo: A_330, objetivoRecuperacion: TROTE, repeticiones: parado }));
    // De pie no hay ritmo que comparar. Ni «dentro» ni «lento»: no se sabe.
    expect(l.veredictosRecuperacion.every((v) => v === 'sin_dato')).toBe(true);
  });

  it('en cuesta se retira también el veredicto del paseo de bajada', () => {
    const l = lecturaDeCorrer(
      carrera({
        objetivo: A_330,
        objetivoRecuperacion: TROTE,
        repeticiones: conSeries([270, 280], {
          recuperacionSkm: 700,
          pendientePct: PENDIENTE_QUE_RETIRA_EL_RITMO_PCT,
        }),
      }),
    );
    expect(l.veredictosRecuperacion).toEqual([]);
    expect(l.bandaRecuperacion).toBeNull();
  });

  it('sin archivo tampoco hay veredicto de recuperación', () => {
    const l = lecturaDeCorrer(
      carrera({ traza: null, objetivo: A_330, objetivoRecuperacion: TROTE, repeticiones: [] }),
    );
    expect(l.veredictosRecuperacion).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// El eje de la curva — la regla que ya se ha afinado dos veces
// ---------------------------------------------------------------------------

describe('el eje lo fija lo que se corrió', () => {
  /** Muestras cada 5 s a un ritmo fijo dentro de una ventana. */
  const tramo = (desde: number, hasta: number, skm: number): Muestra[] => {
    const ms: Muestra[] = [];
    for (let t = desde; t < hasta; t += 5) ms.push({ t, v: skm });
    return ms;
  };
  const rep = (papel: Repeticion['papel'], modo: Repeticion['modo'], inicioS: number, duracionS: number, ritmoSkm: number | null): Repeticion => ({
    n: 1,
    papel,
    modo,
    inicioS,
    duracionS,
    distanciaM: null,
    ritmoSkm,
    fcMediaPpm: null,
    pendientePct: null,
  });

  it('ANDAR se queda fuera: el paseo de una cuesta no manda sobre ocho subidas', () => {
    const ritmo = [...tramo(0, 60, 280), ...tramo(60, 220, 700), ...tramo(220, 280, 285)];
    const reps = [rep('trabajo', undefined, 0, 60, 280), rep('recuperacion', 'andando', 60, 160, 700)];
    const { max } = dominioDelRitmo(ritmo, reps, null);
    expect(max).toBeLessThan(400);
  });

  it('TROTAR entra: un trote entre series es correr, y es parte de la lectura', () => {
    // Es el caso que rompió la versión anterior de la regla: con el criterio
    // puesto en el PAPEL del tramo, este trote se salía del eje y aparecía
    // punteado en el suelo — la lectura equivocada en la pantalla estrella.
    const ritmo = [...tramo(0, 200, 210), ...tramo(200, 320, 372), ...tramo(320, 520, 212)];
    const reps = [rep('trabajo', undefined, 0, 200, 210), rep('recuperacion', 'trote', 200, 120, 372)];
    const { max } = dominioDelRitmo(ritmo, reps, null);
    expect(max).toBeGreaterThan(372);
  });

  it('EL SUELO: si no se corrió nada, manda lo que haya', () => {
    // Una caminata entera, o una vuelta a la calma andada de punta a punta. Con
    // la regla literal el eje se quedaría sin nada que lo fije y la curva saldría
    // degenerada; aquí andar deja de ser la excepción porque es lo único.
    const ritmo = tramo(0, 300, 700);
    const reps = [rep('recuperacion', 'andando', 0, 300, 700)];
    const { min, max } = dominioDelRitmo(ritmo, reps, null);
    expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
    expect(min).toBeLessThan(700);
    expect(max).toBeGreaterThan(700);
  });

  it('la banda del coach siempre cabe en el eje, aunque nadie la haya pisado', () => {
    const ritmo = tramo(0, 300, 300);
    const { min } = dominioDelRitmo(ritmo, [], { eje: 'ritmo', rapidoSkm: 205, lentoSkm: 215 });
    expect(min).toBeLessThan(205);
  });

  it('sobre las nueve escenas, solo lo ANDADO se queda fuera de escala', () => {
    for (const [id, escena] of Object.entries(ESCENAS)) {
      if (!escena.traza) continue;
      const l = lecturaDeCorrer(escena);
      const { max } = dominioDelRitmo(escena.traza.ritmo, escena.repeticiones, l.banda);
      const fuera = escena.repeticiones.filter(
        (r) => r.papel === 'recuperacion' && r.ritmoSkm != null && r.ritmoSkm > max,
      );
      expect(fuera.every((r) => r.modo === 'andando'), id).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariantes de la lectura — lo que no puede pasar en NINGÚN reparto
// ---------------------------------------------------------------------------

describe('invariantes de toda lectura', () => {
  it('la franja se dibuja sobre el eje donde vive su objetivo', () => {
    const porRitmo = lecturaDeCorrer(carrera({ objetivo: A_330, repeticiones: conSeries([208, 212]) }));
    expect(porRitmo.banda?.eje).toBe('ritmo');

    const porZona = lecturaDeCorrer(
      carrera({
        objetivo: { clase: 'zona', zona: 2, minPpm: 132, maxPpm: 143 },
        duracionS: 3600,
        zonasS: { z2: 2400 },
      }),
    );
    // Una zona se mide por el PULSO: pintarla sobre el ritmo enseñaría una
    // comparación que nadie ha hecho.
    expect(porZona.banda?.eje).toBe('pulso');
  });

  it('nunca hay veredictos sin banda que los sostenga', () => {
    for (const escena of Object.values(ESCENAS)) {
      const l = lecturaDeCorrer(escena);
      if (l.veredictos.length > 0) expect(l.banda).not.toBeNull();
    }
  });

  it('el troceado es uno u otro, jamás los dos ni un tercero', () => {
    for (const escena of Object.values(ESCENAS)) {
      const l = lecturaDeCorrer(escena);
      expect(['repeticiones', 'kilometros', 'ninguno']).toContain(l.troceado);
      if (l.troceado === 'repeticiones') expect(escena.repeticiones.some((r) => r.papel === 'trabajo')).toBe(true);
    }
  });

  it('el modelo no sabe nada de las dos voces: A y B leen exactamente lo mismo', () => {
    // La bifurcación que decidió Alex el 12-ago es de TONO y vive en la
    // presentación. Si algún día se cuela en el modelo, este test lo caza.
    const a = lecturaDeCorrer(ESCENAS['series-veredicto']!);
    const b = lecturaDeCorrer(ESCENAS['series-hecho']!);
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// Invariantes de los datos del doble — que el mockup no mienta sobre un número real
// ---------------------------------------------------------------------------

describe('las nueve escenas', () => {
  it('el escenario canónico recupera TROTANDO, que es lo que se hace de verdad', () => {
    // El «parado» existe y es legítimo en repeticiones cortas y máximas, pero en
    // carrera rara vez se hace. Montarlo como ejemplo principal era enseñar mal
    // cómo se construye esto en Swift (Alex, 12-ago) — así que el ① trota, y el
    // parado se conserva como escenario menor.
    const canonico = ESCENAS['series-veredicto']!;
    const trotes = canonico.repeticiones.filter((r) => r.papel === 'recuperacion');
    expect(trotes.length).toBeGreaterThan(0);
    expect(trotes.every((r) => r.modo === 'trote' && r.ritmoSkm != null)).toBe(true);
    expect(canonico.objetivoRecuperacion).toBeDefined();

    const raro = ESCENAS['series-parado']!;
    expect(raro.repeticiones.filter((r) => r.papel === 'recuperacion').every((r) => r.modo === 'parado')).toBe(true);
    // Sin ritmo en la recuperación no se le pone objetivo que no se puede juzgar.
    expect(raro.objetivoRecuperacion).toBeUndefined();
  });

  it('el trote que se va rápido explica la serie que se cae', () => {
    // No es decorado: es la única historia que esta app puede contar y ninguna
    // otra, porque ninguna sabe qué trote se pidió. Si algún día los datos dejan
    // de contarla, el escenario ha perdido su razón de existir.
    const l = lecturaDeCorrer(ESCENAS['series-veredicto']!);
    const rapidos = l.veredictosRecuperacion.filter((v) => v === 'fuera_rapido').length;
    expect(rapidos).toBeGreaterThan(0);
    expect(l.veredictos.filter((v) => v === 'fuera_lento').length).toBeGreaterThan(0);
  });

  it('solo hay veredicto de recuperación donde el coach puso objetivo', () => {
    for (const [id, escena] of Object.entries(ESCENAS)) {
      const l = lecturaDeCorrer(escena);
      if (l.veredictosRecuperacion.length > 0) expect(escena.objetivoRecuperacion, id).toBeDefined();
    }
  });

  it('ninguna sesión con recuperaciones enseña deriva', () => {
    // `decoupling.ts` se niega a calcularla sin esfuerzo SOSTENIDO: una sesión
    // troceada por recuperaciones no lo es. Enseñar un número que el motor real
    // no daría es exactamente la mentira que un mockup no se puede permitir.
    for (const [id, escena] of Object.entries(ESCENAS)) {
      const tieneRecuperaciones = escena.repeticiones.some((r) => r.papel === 'recuperacion');
      if (tieneRecuperaciones) expect(escena.derivado.derivaSkm, id).toBeUndefined();
    }
  });

  it('la banda de una zona es la MISMA que pinta el clasificador de la app', () => {
    // El 12-ago la Z2 estaba escrita a mano como 130-148 y el clasificador decía
    // 132-143: el mockup enseñaba una zona distinta de la de la app para el
    // mismo pulso. Se barre de `zonaDe`, y esto lo deja clavado.
    for (const [id, escena] of Object.entries(ESCENAS)) {
      if (escena.objetivo.clase !== 'zona') continue;
      const { zona, minPpm, maxPpm } = escena.objetivo;
      expect(zonaDe(minPpm), id).toBe(zona);
      expect(zonaDe(maxPpm), id).toBe(zona);
      expect(zonaDe(minPpm - 1), id).not.toBe(zona);
      expect(zonaDe(maxPpm + 1), id).not.toBe(zona);
    }
  });

  it('ningún kilómetro sin cobertura lleva un ritmo inventado, y el parcial va el último', () => {
    for (const [id, escena] of Object.entries(ESCENAS)) {
      escena.kilometros.forEach((km, i) => {
        if (km.sinCobertura != null) expect(km.ritmoSkm, `${id} km${km.n}`).toBeNull();
        // Solo la cola puede ser parcial: un parcial en medio sería un corte mal hecho.
        if (km.parcial) expect(i, id).toBe(escena.kilometros.length - 1);
      });
    }
  });

  it('sin traza no hay nada derivado de la traza, y sin calle no hay ruta', () => {
    for (const [id, escena] of Object.entries(ESCENAS)) {
      if (escena.traza == null) {
        expect(escena.kilometros, id).toEqual([]);
        expect(escena.repeticiones, id).toEqual([]);
        expect(escena.zonasS, id).toEqual({});
        expect(escena.ruta, id).toEqual([]);
      }
      if (escena.superficie === 'cinta') expect(escena.ruta, id).toEqual([]);
    }
  });

  it('un tramo inferido va SIEMPRE con su sello de certeza', () => {
    for (const [id, escena] of Object.entries(ESCENAS)) {
      const hayTramos = escena.repeticiones.length > 0;
      expect(hayTramos ? escena.certezaTramos != null : escena.certezaTramos == null, id).toBe(true);
    }
  });
});
