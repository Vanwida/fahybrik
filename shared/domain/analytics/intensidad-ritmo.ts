// EL RITMO POR ZONAS, AL CORRER — la parte del bloque de INTENSIDAD que va por
// ritmo y no por pulso (docs/analiticas/modelo.md §3 fila 4).
//
// Cada tramo de carrera cae ENTERO en la zona de su ritmo medio, corregido por la
// pendiente con el mismo Minetti que precia la carga: con parciales de tramo y no
// series continuas, es lo que se puede afirmar sin inventar. Las seis bandas son
// las del coach (`methodology_zones`) resueltas sobre el umbral de ritmo del
// atleta, con su peldaño. Sin umbral, no hay zonas de ritmo y se pide.
//
// Puro y sin base de datos.

import type { ResolvedZone } from '../methodology/zone-model';
import type { AnclaResuelta } from './anclas';
import { ritmoEquivalenteLlano, type SesionHecha, type TramoHecho } from './carga-tramo';
import { aMitadDeFrase, lecturaMedida, lecturaSinDato, pctCobertura, type Lectura, type Procedencia } from './lectura';
import type { VentanaResuelta } from './ventana';

const GRUPO = 'intensidad' as const;
const SEGUNDOS_POR_HORA = 3600;

export interface EntradaRitmoCorrer {
  sesiones: readonly SesionHecha[];
  ventana: VentanaResuelta;
  /** Las seis zonas de ritmo del coach resueltas sobre el umbral de correr. Null sin umbral. */
  ritmo_correr: { ancla: AnclaResuelta; zonas: readonly ResolvedZone[] } | null;
}

/**
 * La zona de un ritmo: la más suave cuyo borde rápido no se supera. Así las
 * seis bandas del coach, que en su tabla dejan un segundo entre una y otra,
 * parten el eje sin huecos: cada zona va de su borde rápido al de la
 * siguiente más suave. Más rápido que la última, es la última (no hay más
 * arriba).
 */
export function zonaDeRitmo(ritmo_s: number, zonas: readonly ResolvedZone[]): ResolvedZone | null {
  if (!Number.isFinite(ritmo_s) || ritmo_s <= 0 || zonas.length === 0) return null;
  const orden = [...zonas].sort((a, b) => a.sort_order - b.sort_order);
  for (const z of orden) if (ritmo_s >= z.fast_s) return z;
  return orden[orden.length - 1] ?? null;
}

/** La lectura del ritmo por zonas al correr. Sin carreras en la ventana, se calla. */
export function lecturaRitmoCorrer(e: EntradaRitmoCorrer): Lectura {
  const { ventana: v } = e;
  const id = 'intensidad.ritmo.correr';
  const titulo_es = 'Ritmo por zonas';
  const tramos: Array<{ t: TramoHecho; dia: string }> = [];
  for (const s of e.sesiones) {
    if (s.dia < v.desde || s.dia > v.hasta) continue;
    for (const t of s.tramos) if (t.familia === 'correr' && t.segundos > 0 && t.ritmo_s != null && t.ritmo_s > 0) tramos.push({ t, dia: s.dia });
  }
  const dias = new Set(tramos.map((x) => x.dia));
  const cobertura = { muestras: tramos.length, dias_ventana: v.dias, dias_con_dato: dias.size, pct: pctCobertura(dias.size, v.dias) };
  const base: Procedencia = {
    de: 'ritmo_medio_tramo',
    explica_es: 'Cada tramo de carrera en la zona de su ritmo medio (corregido por la pendiente), con las zonas de ritmo de tu coach sobre tu umbral.',
    medida: true,
    ancla: e.ritmo_correr?.ancla.ancla ?? null,
    proveedor: null,
  };
  // Sin carreras en la ventana esta lectura no existe en su vida: se calla.
  if (tramos.length === 0) return lecturaSinDato({ id, grupo: GRUPO, familia: 'correr', titulo_es, falta: { por: 'ocasion' }, cobertura, procedencia: base });
  if (!e.ritmo_correr) return lecturaSinDato({ id, grupo: GRUPO, familia: 'correr', titulo_es, falta: { por: 'ancla' }, cobertura, procedencia: { ...base, medida: false } });

  const { zonas, ancla } = e.ritmo_correr;
  const porZona = new Map<string, number>();
  let clasif = 0;
  let fuera = 0;
  for (const { t } of tramos) {
    const llano = ritmoEquivalenteLlano(t.ritmo_s!, t.pendiente_pct);
    const z = llano != null ? zonaDeRitmo(llano, zonas) : null;
    if (!z) {
      fuera += t.segundos;
      continue;
    }
    porZona.set(z.code, (porZona.get(z.code) ?? 0) + t.segundos);
    clasif += t.segundos;
  }
  if (clasif <= 0) return lecturaSinDato({ id, grupo: GRUPO, familia: 'correr', titulo_es, falta: { por: 'sensor' }, cobertura, procedencia: base });

  const orden = [...zonas].sort((a, b) => a.sort_order - b.sort_order);
  const fueraTxt = fuera > 0 ? ` ${Math.round((fuera / (fuera + clasif)) * 100)} % del tiempo corriendo en cuestas de más del 15 % queda fuera.` : '';
  return lecturaMedida({
    id,
    grupo: GRUPO,
    familia: 'correr',
    titulo_es,
    dato: { valor: clasif / SEGUNDOS_POR_HORA, unidad: 'horas', referencia: null },
    reparto: {
      unidad: 'horas',
      total: clasif / SEGUNDOS_POR_HORA,
      partes: orden.map((z) => ({ code: z.code, etiqueta_es: `${z.code} · ${z.label}`, valor: (porZona.get(z.code) ?? 0) / SEGUNDOS_POR_HORA, pct: ((porZona.get(z.code) ?? 0) / clasif) * 100 })),
    },
    cobertura,
    procedencia: {
      ...base,
      explica_es: `${base.explica_es} Tu umbral de ritmo: ${formatoRitmo(ancla.valor)}/km (${aMitadDeFrase(ancla.explica_es)}).${fueraTxt}`,
    },
  });
}

function formatoRitmo(s: number): string {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
