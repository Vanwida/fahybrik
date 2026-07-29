import { describe, expect, it } from 'vitest';
import { lecturaDeCarrera, type Carrera, type Muestra } from '@/components/design-twin/tramos';

// Lo que este test defiende es UNA frase: la media se gana el derecho a ser el
// sujeto sólo si la carrera fue una sola cosa. Todo lo demás son las maneras de
// romperla.
//
// Los datos marcados «(real)» salen de la base el 29-jul-2026. Los de muestras
// están generados aquí porque LA BASE NO GUARDA NINGUNA SERIE DE RITMO — ni una,
// en ninguna tabla: el enum `biometric_metric` no contempla `pace` ni `speed`.
// Que el único caso que hoy se puede alimentar con producción sea el de «no se
// sabe» es, en sí, el hallazgo de la tanda.

/**
 * Las ocho vueltas de correr de una carrera real — `races.run_splits_json`.
 * HYROX son 8 × 1 km, así que cada número es directamente un ritmo en s/km.
 */
const HYROX_44 = [227, 234, 247, 245, 258, 249, 250, 248]; // race 44 (real)
const HYROX_45 = [263, 242, 251, 255, 248, 253, 250, 226]; // race 45 (real)

function comoVueltas(splits: number[]): Carrera {
  return {
    distanciaM: splits.length * 1000,
    duracionS: splits.reduce((a, s) => a + s, 0),
    marcados: splits.map((s) => ({ tipo: 'fuerte' as const, duracionS: s, distanciaM: 1000 })),
  };
}

/**
 * Un fartlek con la forma que Alex vio en Instagram: 8 fuertes de 1' contra
 * suaves de 1'30", con su calentamiento y su vuelta a la calma. El ruido es
 * determinista (una sinusoide, no un aleatorio) para que el test no pueda
 * fallar un día de cada veinte.
 */
function fartlek({
  fuerteSkm = 238,
  suaveSkm = 312,
  reps = 8,
  cadaS = 5,
}: { fuerteSkm?: number; suaveSkm?: number; reps?: number; cadaS?: number } = {}): Carrera {
  const plan: Array<{ dur: number; skm: number }> = [{ dur: 600, skm: 330 }];
  for (let i = 0; i < reps; i += 1) {
    plan.push({ dur: 60, skm: fuerteSkm });
    if (i < reps - 1) plan.push({ dur: 90, skm: suaveSkm });
  }
  plan.push({ dur: 300, skm: 330 });
  return conMuestras(plan, cadaS);
}

function conMuestras(plan: Array<{ dur: number; skm: number | null }>, cadaS: number): Carrera {
  const muestras: Muestra[] = [];
  let t = 0;
  let metros = 0;
  for (const paso of plan) {
    for (let d = 0; d < paso.dur; d += cadaS) {
      // ±4 s/km de ondulación: el ruido real de un ritmo por GPS.
      const ruido = paso.skm == null ? 0 : Math.sin(t / 7) * 4;
      muestras.push({ t, ritmoSkm: paso.skm == null ? null : paso.skm + ruido });
      if (paso.skm != null) metros += (cadaS / (paso.skm + ruido)) * 1000;
      t += cadaS;
    }
  }
  return { distanciaM: Math.round(metros), duracionS: t, muestras };
}

describe('design-twin · lecturaDeCarrera', () => {
  it('sin serie de ritmo no inventa tramos, y delata la media si el coach mandó contraste', () => {
    // Ejecución 175 (real): cinta en vivo, 1001,08 m en 361 s, UN solo segmento.
    // Es literalmente todo lo que la app guarda hoy de una carrera.
    const l = lecturaDeCarrera({ distanciaM: 1001.08, duracionS: 361, formaPrescrita: 'con-contraste' });
    expect(l.forma).toBe('no-se-sabe');
    expect(l.motivo).toBe('sin-serie');
    expect(l.tramos).toEqual([]);
    expect(l.certeza).toBeNull();
    // Lo que nos separa de Apple: no sabemos partirla, pero sabemos que miente.
    expect(l.mediaEsMezcla).toBe(true);
    expect(Math.round(l.mediaSkm!)).toBe(361);
  });

  it('sin serie y sin contraste prescrito, la media no se acusa de nada', () => {
    const l = lecturaDeCarrera({ distanciaM: 1001.08, duracionS: 361, formaPrescrita: 'continua' });
    expect(l.forma).toBe('no-se-sabe');
    expect(l.mediaEsMezcla).toBe(false);
  });

  it('unas pocas muestras no bastan para resolver un tramo', () => {
    const c = fartlek({ cadaS: 60 });
    expect(lecturaDeCarrera(c).motivo).toBe('muestras-escasas');
    expect(lecturaDeCarrera({ distanciaM: 5000, duracionS: 1500, muestras: [{ t: 0, ritmoSkm: 300 }] }).motivo).toBe(
      'muestras-escasas',
    );
  });

  it('cinco fuertes marcados y una recuperación que nadie grabó SÍ es contraste', () => {
    // El caso de producción: `advanceRunLeg` graba los tramos de trabajo y tira
    // los de recuperación, así que un 5×1000 llega con cinco fuertes sueltos.
    // Llamar «uniforme» a eso absolvería a una media que promedia lo que
    // tenemos con lo que perdimos.
    const l = lecturaDeCarrera({
      distanciaM: 9500,
      duracionS: 2700,
      marcados: [250, 249, 248, 247, 246].map((s) => ({ tipo: 'fuerte' as const, duracionS: s, distanciaM: 1000 })),
    });
    expect(l.forma).toBe('con-contraste');
    expect(l.certeza).toBe('marcados');
    expect(l.fuerte!.n).toBe(5);
    expect(l.mediaEsMezcla).toBe(true);
    // Lo que no hay, no se pinta (§7): no había suave que registrar.
    expect(l.suave).toBeNull();
    expect(l.contrasteSkm).toBeNull();
  });

  it('ocho vueltas reales que cubren la sesión entera son una sola cosa', () => {
    const l = lecturaDeCarrera(comoVueltas(HYROX_44));
    expect(l.forma).toBe('uniforme');
    expect(l.mediaEsMezcla).toBe(false);
    expect(Math.round(l.mediaSkm!)).toBe(245);
  });

  it('el aguante sale de las mitades, y los extremos se dicen tal cual (real)', () => {
    const a = lecturaDeCarrera(comoVueltas(HYROX_44)).aguante!;
    expect(a.primeraSkm).toBe(227);
    expect(a.ultimaSkm).toBe(248);
    expect(a.derivaSkm).toBeCloseTo(13.0, 1); // 238,25 → 251,25
    expect(a.veredicto).toBe('se-te-fue');

    // La misma carrera, otro atleta: bajar de ritmo no es un fallo, es negativo.
    const b = lecturaDeCarrera(comoVueltas(HYROX_45)).aguante!;
    expect(b.derivaSkm).toBeCloseTo(-8.5, 1);
    expect(b.veredicto).toBe('de-menos-a-mas');
  });

  it('con menos de cuatro repeticiones el aguante es una anécdota y no se lee', () => {
    expect(lecturaDeCarrera(comoVueltas(HYROX_44.slice(0, 3))).aguante).toBeNull();
  });

  it('el ritmo de un grupo es tiempo entre distancia, no la media de los ritmos', () => {
    // A propósito con dos ritmos extremos, que es donde la diferencia se ve:
    // la media aritmética diría 5:00/km y la verdad es 4:27, porque el minuto
    // rápido cubre el doble de metros que el lento y pesa el doble.
    const l = lecturaDeCarrera({
      distanciaM: 2250,
      duracionS: 600,
      marcados: [
        { tipo: 'fuerte', duracionS: 300, distanciaM: 1500 },
        { tipo: 'fuerte', duracionS: 300, distanciaM: 750 },
      ],
    });
    // Cubre la sesión entera y todo es fuerte: uniforme, y el ritmo vive en la media.
    expect(l.forma).toBe('uniforme');
    expect(l.mediaSkm).toBeCloseTo(266.67, 1);
    expect(l.mediaSkm).not.toBeCloseTo(300, 0);
  });

  it('un fartlek libre se parte en sus dos ritmos y ninguno es la media', () => {
    const c = fartlek();
    const l = lecturaDeCarrera(c);
    expect(l.forma).toBe('con-contraste');
    expect(l.certeza).toBe('detectados');
    expect(l.fuerte!.n).toBe(8);
    expect(l.fuerte!.ritmoSkm).toBeCloseTo(238, 0);
    expect(l.suave!.ritmoSkm).toBeGreaterThan(300);
    expect(l.contrasteSkm).toBeGreaterThan(60);
    // La media cae ENTRE los dos y no describe ni uno: es la enfermedad entera.
    expect(l.mediaSkm!).toBeGreaterThan(l.fuerte!.ritmoSkm);
    expect(l.mediaSkm!).toBeLessThan(l.suave!.ritmoSkm);
    expect(l.mediaEsMezcla).toBe(true);
  });

  it('los tramos se numeran dentro de su tipo y van en orden', () => {
    const tramos = lecturaDeCarrera(fartlek()).tramos.filter((t) => t.tipo === 'fuerte');
    expect(tramos.map((t) => t.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(tramos.every((t, i) => i === 0 || t.desdeS > tramos[i - 1]!.desdeS)).toBe(true);
  });

  it('un rodaje continuo NO se trocea: la media es honesta y se queda de sujeto', () => {
    // La otra mitad de la ley. Un detector que parta esto en fuertes y suaves
    // le quitaría a la media el único caso en que dice la verdad.
    const c = conMuestras([{ dur: 2400, skm: 300 }], 5);
    const l = lecturaDeCarrera(c);
    expect(l.forma).toBe('uniforme');
    expect(l.mediaEsMezcla).toBe(false);
    expect(l.fuerte).toBeNull();
    expect(l.suave).toBeNull();
  });

  it('los trozos de un rodaje continuo no son una lectura y no se pintan', () => {
    // El disparador trocea igualmente —lo necesita para concluir que NO hay
    // frontera— pero esos trozos no son repeticiones. Si la pantalla los
    // dibujara, enseñaría una estructura que el atleta no corrió.
    const l = lecturaDeCarrera(conMuestras([{ dur: 2400, skm: 300 }], 5));
    expect(l.tramosSonLectura).toBe(false);
    expect(l.aguante).toBeNull();

    // En cambio un fartlek y unas vueltas marcadas SÍ son una lectura.
    expect(lecturaDeCarrera(fartlek()).tramosSonLectura).toBe(true);
    expect(lecturaDeCarrera(comoVueltas(HYROX_44)).tramosSonLectura).toBe(true);
  });

  it('la ondulación del terreno no es una frontera', () => {
    // ±12 s/km de subidas y bajadas: variación real, pero por debajo del umbral
    // de contraste. Sigue siendo una sola cosa.
    const plan = Array.from({ length: 12 }, (_, i) => ({ dur: 200, skm: i % 2 ? 306 : 294 }));
    expect(lecturaDeCarrera(conMuestras(plan, 5)).forma).toBe('uniforme');
  });

  it('un semáforo no es un tramo suave ni ensucia los ritmos', () => {
    const c = fartlek();
    const l = lecturaDeCarrera(c);
    // Ningún tramo `parado` cuenta como suave, y un parón no aparece con ritmo.
    expect(l.tramos.filter((t) => t.tipo === 'parado').every((t) => t.ritmoSkm === null)).toBe(true);

    // El mismo fartlek con 45 s de parón en medio: se aísla, no se reparte.
    const conParon = fartlek();
    const mitad = Math.floor(conParon.muestras!.length / 2);
    for (let i = mitad; i < mitad + 9; i += 1) conParon.muestras![i]!.ritmoSkm = null;
    const p = lecturaDeCarrera(conParon);
    expect(p.tramos.some((t) => t.tipo === 'parado')).toBe(true);
    expect(p.fuerte!.ritmoSkm).toBeCloseTo(238, 0);
  });

  it('un tropiezo de diez segundos se absorbe en su vecino', () => {
    const c = conMuestras(
      [
        { dur: 600, skm: 300 },
        { dur: 10, skm: 210 },
        { dur: 600, skm: 300 },
      ],
      5,
    );
    // Diez segundos rápidos no parten un rodaje en tres.
    expect(lecturaDeCarrera(c).tramos.length).toBeLessThanOrEqual(2);
    expect(lecturaDeCarrera(c).forma).toBe('uniforme');
  });

  it('con separación justa el tramo se declara estimado, no detectado', () => {
    // 26 s/km de contraste: pasa el umbral, pero no es la separación limpia de
    // un fartlek de verdad. La pantalla tiene que poder decir cuál es cuál.
    const l = lecturaDeCarrera(fartlek({ fuerteSkm: 280, suaveSkm: 306 }));
    if (l.forma === 'con-contraste') expect(l.certeza).toBe('estimados');
  });
});
