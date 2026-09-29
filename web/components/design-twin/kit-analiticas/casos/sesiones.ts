// LA SESIÓN, TRAMO A TRAMO (A8, pregunta 9): prescrito frente a hecho en
// TODAS las modalidades, serie a serie contra su banda — ritmo, zona, split,
// vatios, reps, kg, RIR, rondas, tiempo — con la carga de cada tramo y su
// peldaño (§4). Los casos son las ejecuciones contra las que se rompió el
// modelo (§7): un 4 × 1000 en cinta reclamado al plan, un remo 5 × 500 con un
// solo split, una sentadilla 4 × 5 a 100 kg, un EMOM de ski y dominadas, una
// fuerza con trineos sin kg (carga que no se sabe) y una carrera importada de
// Salud sin plan. Ninguno es una fila de la base: son sus FORMAS.

import type { Ancla, Cumplimiento, Familia } from '../contrato';
import { cumplimientoDe, cargaPorEsfuerzo } from '../mecanismo';
import { METODO_DEFECTO, type EjeCumplimiento, type MetodoAnaliticas, type PeldanoCarga } from '../metodo';
import { azar } from './generador';

export interface TramoSesion {
  n: number;
  nombre_es: string;
  rol: 'trabajo' | 'recuperacion' | 'calentamiento' | 'vuelta';
  prescrito: {
    /** «1000 m», «500 m», «5 reps», «60 s». */
    medida_es: string;
    /** «3:45–3:55/km», «Z2», «1:52/500m», «100 kg · RIR 2». Null sin objetivo. */
    objetivo_es: string | null;
    eje: EjeCumplimiento | null;
    objetivo: number | [number, number] | null;
  } | null;
  hecho: {
    medida_es: string;
    /** El valor en el eje del objetivo (s/km, s/500, kg, reps…). */
    valor: number | null;
    valor_es: string;
    /** Lo demás medido en el tramo: pulso medio, cadencia… */
    extra_es: string | null;
  };
  cumplimiento: Cumplimiento;
  carga: { tss: number | null; peldano: PeldanoCarga | null; ancla: Ancla | null };
}

export interface CurvaSesion {
  /** Segundos desde el inicio y valor. */
  puntos: Array<{ t: number; v: number }>;
  unidad: 'bpm' | 's_km' | 's_500m' | 'w';
  /** La banda prescrita, si el objetivo era de este eje. */
  banda: [number, number] | null;
}

export interface SesionDetalle {
  id: string;
  titulo_es: string;
  fecha: string;
  familia: Familia;
  formato_es: string;
  duracion_s: number;
  /** De dónde salió (el plan del coach, un libre, una importación de Salud). */
  origen_es: string;
  carga: { tss: number | null; plan_tss: number | null; peldano: PeldanoCarga | null; ancla: Ancla | null; cobertura_pct: number | null };
  cumplimiento: { resumen_es: string; dentro: number; de: number } | null;
  tramos: TramoSesion[];
  curvas: { pulso: CurvaSesion | null; principal: CurvaSesion | null };
  parciales: Array<{ etiqueta_es: string; segundos: number }> | null;
  /** Segundos Z1…Z5, o null sin pulso. */
  zonas: number[] | null;
  rpe: number | null;
  nota_es: string | null;
}

export type EscenarioSesion = 'cinta-4x1000' | 'remo-5x500' | 'sentadilla-4x5' | 'emom-ski-dominadas' | 'fuerza-trineos' | 'carrera-salud';

export const ESCENARIOS_SESION: readonly EscenarioSesion[] = ['cinta-4x1000', 'remo-5x500', 'sentadilla-4x5', 'emom-ski-dominadas', 'fuerza-trineos', 'carrera-salud'];

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

function curva(semilla: number, duracion: number, forma: (t: number) => number, paso = 5): Array<{ t: number; v: number }> {
  const rnd = azar(semilla);
  const out: Array<{ t: number; v: number }> = [];
  for (let t = 0; t <= duracion; t += paso) out.push({ t, v: Math.round(forma(t) + (rnd() - 0.5) * 3) });
  return out;
}

/** Carga de un tramo por pulso: minutos × factor de zona (aprox. hrTSS por zona media). */
function cargaPulso(segundos: number, ppmMedia: number, umbral: number): number {
  const rel = ppmMedia / umbral;
  return Math.round(((segundos / 3600) * 100 * rel * rel) * 10) / 10;
}

export function sesionDe(id: EscenarioSesion, metodo: MetodoAnaliticas = METODO_DEFECTO): SesionDetalle {
  const tol = metodo.tolerancias;
  const UMBRAL_PPM = 172;
  switch (id) {
    case 'cinta-4x1000': {
      const objetivo: [number, number] = [225, 235];
      const hechos = [229, 231, 238, 226];
      const ppm = [163, 168, 172, 174];
      const tramos: TramoSesion[] = [
        { n: 1, nombre_es: 'Calentamiento', rol: 'calentamiento', prescrito: { medida_es: '10 min', objetivo_es: 'Z1–Z2', eje: 'zona', objetivo: [1, 2] }, hecho: { medida_es: '10:04', valor: 2, valor_es: 'Z2', extra_es: '5:40/km · 131 ppm' }, cumplimiento: 'dentro', carga: { tss: cargaPulso(604, 131, UMBRAL_PPM), peldano: 'pulso', ancla: 'medida' } },
        ...hechos.flatMap((h, i): TramoSesion[] => [
          { n: 2 + i * 2, nombre_es: `Serie ${i + 1} de 4`, rol: 'trabajo', prescrito: { medida_es: '1000 m', objetivo_es: '3:45–3:55/km', eje: 'ritmo', objetivo }, hecho: { medida_es: '1000 m', valor: h, valor_es: `${clock(h)}/km`, extra_es: `${ppm[i]} ppm · 178 pasos/min` }, cumplimiento: cumplimientoDe('ritmo', objetivo, h, tol), carga: { tss: Math.round(((h / 3600) * 100 * Math.pow(252 / h, 2)) * 10) / 10, peldano: 'ritmo', ancla: 'medida' } },
          ...(i < 3 ? [{ n: 3 + i * 2, nombre_es: 'Recuperación', rol: 'recuperacion' as const, prescrito: { medida_es: '90 s trote', objetivo_es: null, eje: null, objetivo: null }, hecho: { medida_es: '1:30', valor: null, valor_es: '6:10/km', extra_es: `${ppm[i]! - 18} ppm` }, cumplimiento: 'sin-plan' as const, carga: { tss: cargaPulso(90, ppm[i]! - 18, UMBRAL_PPM), peldano: 'pulso' as const, ancla: 'medida' as const } }] : []),
        ]),
        { n: 9, nombre_es: 'Vuelta a la calma', rol: 'vuelta', prescrito: { medida_es: '5 min', objetivo_es: 'Z1', eje: 'zona', objetivo: [1, 1] }, hecho: { medida_es: '5:02', valor: 1, valor_es: 'Z1', extra_es: '6:20/km · 128 ppm' }, cumplimiento: 'dentro', carga: { tss: cargaPulso(302, 128, UMBRAL_PPM), peldano: 'pulso', ancla: 'medida' } },
      ];
      const tss = Math.round(tramos.reduce((s, t) => s + (t.carga.tss ?? 0), 0));
      const dentro = tramos.filter((t) => t.rol === 'trabajo' && t.cumplimiento === 'dentro').length;
      return {
        id,
        titulo_es: 'Series 4 × 1000 m en cinta',
        fecha: '2026-09-22',
        familia: 'correr',
        formato_es: 'Series · cinta',
        duracion_s: 1880,
        origen_es: 'Del plan · reclamada al plan desde la cinta (el reloj no la enlazó)',
        carga: { tss, plan_tss: 68, peldano: 'ritmo', ancla: 'medida', cobertura_pct: 100 },
        cumplimiento: { resumen_es: `${dentro} de 4 series dentro de 3:45–3:55 · la 3.ª se fue a 3:58`, dentro, de: 4 },
        tramos,
        curvas: {
          pulso: { puntos: curva(901, 1880, (t) => (t < 600 ? 118 + t * 0.022 : t > 1580 ? 150 - (t - 1580) * 0.07 : 145 + 22 * Math.sin(((t - 600) / 245) * Math.PI) ** 2 + (t - 600) * 0.008)), unidad: 'bpm', banda: null },
          principal: { puntos: curva(902, 1880, (t) => (t < 600 ? 340 : t > 1580 ? 380 : ((t - 600) % 245) < 155 ? 230 + Math.floor((t - 600) / 245) * 2 : 370)), unidad: 's_km', banda: objetivo },
        },
        parciales: [1, 2, 3, 4].map((k) => ({ etiqueta_es: `km ${k}`, segundos: [349, 352, 361, 344][k - 1]! })),
        zonas: [420, 380, 300, 520, 260],
        rpe: 8,
        nota_es: null,
      };
    }
    case 'remo-5x500': {
      const objetivo: [number, number] = [110, 114];
      const hechos = [112.4, 111.8, 113.1, 114.9, 113.6];
      const vat = hechos.map((s) => Math.round(2.8 / Math.pow(s / 500, 3)));
      const tramos: TramoSesion[] = hechos.flatMap((h, i): TramoSesion[] => [
        { n: 1 + i * 2, nombre_es: `Pieza ${i + 1} de 5`, rol: 'trabajo', prescrito: { medida_es: '500 m', objetivo_es: '1:50–1:54/500m', eje: 'split', objetivo }, hecho: { medida_es: '500 m', valor: h, valor_es: `${clock(h)}/500m`, extra_es: `${vat[i]} W · 30 s/min · ${158 + i * 3} ppm` }, cumplimiento: cumplimientoDe('split', objetivo, h, tol), carga: { tss: Math.round((h / 3600) * 100 * Math.pow(vat[i]! / 235, 2) * 10) / 10, peldano: 'potencia', ancla: 'medida' } },
        ...(i < 4 ? [{ n: 2 + i * 2, nombre_es: 'Descanso', rol: 'recuperacion' as const, prescrito: { medida_es: '2 min', objetivo_es: null, eje: null, objetivo: null }, hecho: { medida_es: '2:00', valor: null, valor_es: 'parado', extra_es: `${140 + i * 2} ppm` }, cumplimiento: 'sin-plan' as const, carga: { tss: cargaPulso(120, 140 + i * 2, UMBRAL_PPM), peldano: 'pulso' as const, ancla: 'medida' as const } }] : []),
      ]);
      const tss = Math.round(tramos.reduce((s, t) => s + (t.carga.tss ?? 0), 0));
      const dentro = tramos.filter((t) => t.rol === 'trabajo' && t.cumplimiento === 'dentro').length;
      return {
        id,
        titulo_es: 'Remo 5 × 500 m',
        fecha: '2026-09-24',
        familia: 'remo',
        formato_es: 'Series · remo',
        duracion_s: 1050,
        origen_es: 'Del plan · el remo mandó cada pieza con su split y sus vatios',
        carga: { tss, plan_tss: 38, peldano: 'potencia', ancla: 'medida', cobertura_pct: 100 },
        cumplimiento: { resumen_es: `${dentro} de 5 piezas dentro de 1:50–1:54 · la 4.ª se fue a 1:54,9`, dentro, de: 5 },
        tramos,
        curvas: {
          pulso: { puntos: curva(911, 1050, (t) => (t % 210 < 112 ? 150 + (t % 210) * 0.2 + Math.floor(t / 210) * 3 : 165 - ((t % 210) - 112) * 0.2)), unidad: 'bpm', banda: null },
          principal: { puntos: curva(912, 1050, (t) => (t % 210 < 112 ? 112 + Math.floor(t / 210) * 0.6 : 160)), unidad: 's_500m', banda: objetivo },
        },
        parciales: null,
        zonas: [180, 260, 300, 240, 70],
        rpe: 7,
        nota_es: null,
      };
    }
    case 'sentadilla-4x5': {
      const kg = [100, 100, 100, 100];
      const rir = [3, 2, 2, 1];
      const tramos: TramoSesion[] = kg.map((k, i) => ({
        n: i + 1,
        nombre_es: `Serie ${i + 1} de 4`,
        rol: 'trabajo',
        prescrito: { medida_es: '5 reps', objetivo_es: '100 kg · RIR 2', eje: 'rir', objetivo: 2 },
        hecho: { medida_es: '5 reps', valor: rir[i]!, valor_es: `${k} kg · RIR ${rir[i]}`, extra_es: '2:30 de descanso' },
        cumplimiento: cumplimientoDe('rir', 2, rir[i]!, tol),
        carga: { tss: Math.round(cargaPorEsfuerzo(10 - rir[i]!, 150, metodo) * 10) / 10, peldano: 'esfuerzo', ancla: 'declarada' },
      }));
      const tss = Math.round(tramos.reduce((s, t) => s + (t.carga.tss ?? 0), 0) * 10) / 10;
      const dentro = tramos.filter((t) => t.cumplimiento === 'dentro').length;
      return {
        id,
        titulo_es: 'Sentadilla 4 × 5 a 100 kg',
        fecha: '2026-09-21',
        familia: 'fuerza',
        formato_es: 'Fuerza · series',
        duracion_s: 1260,
        origen_es: 'Del plan · kg y RIR anotados en el descanso del vivo',
        carga: { tss, plan_tss: 12, peldano: 'esfuerzo', ancla: 'declarada', cobertura_pct: 100 },
        cumplimiento: { resumen_es: `${dentro} de 4 series con el RIR pedido (2 ± 1) · la 1.ª quedó floja (RIR 3), la 4.ª al límite (RIR 1)`, dentro, de: 4 },
        tramos,
        curvas: { pulso: null, principal: null },
        parciales: null,
        zonas: null,
        rpe: 7,
        nota_es: 'Sin pulso en fuerza: la carga sale del esfuerzo (10 − RIR) por serie, al peldaño 4 de la escalera.',
      };
    }
    case 'emom-ski-dominadas': {
      const minutos = 12;
      const tramos: TramoSesion[] = Array.from({ length: minutos }, (_, i): TramoSesion => {
        const ski = i % 2 === 0;
        const cal = ski ? [12, 12, 12, 11, 12, 10][i / 2]! : null;
        const reps = ski ? null : [8, 8, 8, 7, 8, 6][(i - 1) / 2]!;
        return {
          n: i + 1,
          nombre_es: `Minuto ${i + 1} · ${ski ? 'SkiErg' : 'Dominadas'}`,
          rol: 'trabajo',
          prescrito: ski ? { medida_es: '12 cal', objetivo_es: 'dentro del minuto', eje: 'calorias', objetivo: 12 } : { medida_es: '8 reps', objetivo_es: 'dentro del minuto', eje: 'reps', objetivo: 8 },
          hecho: ski ? { medida_es: `${cal} cal`, valor: cal, valor_es: `${cal} cal en ${[41, 43, 44, 52, 47, 58][i / 2]} s`, extra_es: `${150 + i * 2} ppm` } : { medida_es: `${reps} reps`, valor: reps, valor_es: `${reps} reps en ${[28, 30, 31, 35, 33, 40][(i - 1) / 2]} s`, extra_es: `${148 + i * 2} ppm` },
          cumplimiento: ski ? cumplimientoDe('calorias', 12, cal, tol) : cumplimientoDe('reps', 8, reps, tol),
          carga: { tss: cargaPulso(60, 150 + i * 2, UMBRAL_PPM), peldano: 'pulso', ancla: 'medida' },
        };
      });
      const tss = Math.round(tramos.reduce((s, t) => s + (t.carga.tss ?? 0), 0));
      const dentro = tramos.filter((t) => t.cumplimiento === 'dentro').length;
      return {
        id,
        titulo_es: 'EMOM 12′ · SkiErg y dominadas',
        fecha: '2026-09-19',
        familia: 'wod',
        formato_es: 'EMOM 12 min',
        duracion_s: 720,
        origen_es: 'Del plan · el ski mandó las calorías; las dominadas las dijiste tú',
        carga: { tss, plan_tss: 22, peldano: 'pulso', ancla: 'medida', cobertura_pct: 100 },
        cumplimiento: { resumen_es: `${dentro} de 12 minutos con la dosis entera · los dos últimos se quedaron cortos`, dentro, de: 12 },
        tramos,
        curvas: { pulso: { puntos: curva(921, 720, (t) => 138 + t * 0.045 + (t % 60 < 45 ? 8 : -6)), unidad: 'bpm', banda: null }, principal: null },
        parciales: null,
        zonas: [40, 120, 260, 260, 40],
        rpe: 9,
        nota_es: null,
      };
    }
    case 'fuerza-trineos': {
      const tramos: TramoSesion[] = [
        { n: 1, nombre_es: 'Peso muerto · serie 1 de 3', rol: 'trabajo', prescrito: { medida_es: '5 reps', objetivo_es: '120 kg · RIR 2', eje: 'rir', objetivo: 2 }, hecho: { medida_es: '5 reps', valor: 2, valor_es: '120 kg · RIR 2', extra_es: null }, cumplimiento: 'dentro', carga: { tss: Math.round(cargaPorEsfuerzo(8, 150, metodo) * 10) / 10, peldano: 'esfuerzo', ancla: 'declarada' } },
        { n: 2, nombre_es: 'Peso muerto · serie 2 de 3', rol: 'trabajo', prescrito: { medida_es: '5 reps', objetivo_es: '120 kg · RIR 2', eje: 'rir', objetivo: 2 }, hecho: { medida_es: '5 reps', valor: 2, valor_es: '120 kg · RIR 2', extra_es: null }, cumplimiento: 'dentro', carga: { tss: Math.round(cargaPorEsfuerzo(8, 150, metodo) * 10) / 10, peldano: 'esfuerzo', ancla: 'declarada' } },
        { n: 3, nombre_es: 'Peso muerto · serie 3 de 3', rol: 'trabajo', prescrito: { medida_es: '5 reps', objetivo_es: '120 kg · RIR 2', eje: 'rir', objetivo: 2 }, hecho: { medida_es: '5 reps', valor: 1, valor_es: '120 kg · RIR 1', extra_es: null }, cumplimiento: cumplimientoDe('rir', 2, 1, tol), carga: { tss: Math.round(cargaPorEsfuerzo(9, 150, metodo) * 10) / 10, peldano: 'esfuerzo', ancla: 'declarada' } },
        { n: 4, nombre_es: 'Sled push · 4 × 25 m', rol: 'trabajo', prescrito: { medida_es: '4 × 25 m', objetivo_es: null, eje: null, objetivo: null }, hecho: { medida_es: '4 × 25 m', valor: null, valor_es: 'sin kg anotados', extra_es: null }, cumplimiento: 'sin-plan', carga: { tss: null, peldano: null, ancla: null } },
        { n: 5, nombre_es: 'Sled pull · 4 × 25 m', rol: 'trabajo', prescrito: { medida_es: '4 × 25 m', objetivo_es: null, eje: null, objetivo: null }, hecho: { medida_es: '4 × 25 m', valor: null, valor_es: 'sin kg anotados', extra_es: null }, cumplimiento: 'sin-plan', carga: { tss: null, peldano: null, ancla: null } },
      ];
      const conCarga = tramos.filter((t) => t.carga.tss != null);
      const tss = Math.round(conCarga.reduce((s, t) => s + (t.carga.tss ?? 0), 0) * 10) / 10;
      return {
        id,
        titulo_es: 'Fuerza + trineos',
        fecha: '2026-09-17',
        familia: 'fuerza',
        formato_es: 'Fuerza · libre',
        duracion_s: 2820,
        origen_es: 'Entreno libre · sin pulso; los trineos sin kg ni RPE',
        carga: { tss, plan_tss: null, peldano: 'esfuerzo', ancla: 'declarada', cobertura_pct: 55 },
        cumplimiento: { resumen_es: '2 de 3 series de peso muerto con el RIR pedido · los trineos no tenían objetivo', dentro: 2, de: 3 },
        tramos,
        curvas: { pulso: null, principal: null },
        parciales: null,
        zonas: null,
        rpe: null,
        nota_es: 'La carga de los trineos NO SE SABE: sin kg, sin pulso y sin RPE no hay peldaño que la calcule. Cuenta en contra de la cobertura (55 %), nunca como cero.',
      };
    }
    case 'carrera-salud': {
      const kms = [318, 322, 326, 331, 329, 335, 340, 338];
      const tramos: TramoSesion[] = [{ n: 1, nombre_es: 'Carrera continua', rol: 'trabajo', prescrito: null, hecho: { medida_es: '8,04 km', valor: 330, valor_es: '5:30/km', extra_es: '149 ppm · 168 pasos/min' }, cumplimiento: 'sin-plan', carga: { tss: cargaPulso(2640, 149, UMBRAL_PPM), peldano: 'pulso', ancla: 'medida' } }];
      return {
        id,
        titulo_es: 'Carrera importada de Salud',
        fecha: '2026-09-14',
        familia: 'correr',
        formato_es: 'Continuo · calle',
        duracion_s: 2640,
        origen_es: 'Importada de Salud · sin plan detrás',
        carga: { tss: Math.round(tramos[0]!.carga.tss!), plan_tss: null, peldano: 'pulso', ancla: 'medida', cobertura_pct: 100 },
        cumplimiento: null,
        tramos,
        curvas: {
          pulso: { puntos: curva(931, 2640, (t) => 132 + Math.min(20, t * 0.03) + Math.sin(t / 300) * 4), unidad: 'bpm', banda: null },
          principal: { puntos: curva(932, 2640, (t) => 330 + Math.sin(t / 400) * 8 + (t > 2000 ? 6 : 0)), unidad: 's_km', banda: null },
        },
        parciales: kms.map((s, i) => ({ etiqueta_es: `km ${i + 1}`, segundos: s })),
        zonas: [300, 1500, 700, 140, 0],
        rpe: null,
        nota_es: 'Sin plan no hay cumplimiento: se lee lo que fue, se carga por pulso y cuenta igual que una sesión del coach.',
      };
    }
  }
}
