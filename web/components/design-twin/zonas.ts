// El reparto de la sesión por zonas — espejo exacto de `ZoneCoverage.read`
// (ios/FAHYBRIK/Workout/ZoneCoverage.swift), reparto por resto mayor incluido.
//
// Vive en su propio módulo, y no dentro de `piezas.tsx`, porque es cálculo puro:
// así se prueba sin montar un componente y así el espejo no puede separarse de
// la app sin que salte un test (web/tests/design-twin/zonas.test.ts, con las
// nueve filas de producción — las mismas del test de Swift).
//
// Las tres reglas que tiene que cumplir, y por qué:
//
//  1. La base es la DURACIÓN, no la suma de las zonas. Las zonas solo acumulan
//     mientras hay pulso clasificable, así que sobre su propia suma CUALQUIER
//     cobertura se lee como el entreno entero. La ejecución 162 (real): 236 s de
//     Z1 + 246 s de Z2 sobre 572 s pintaba «Z1 49% · Z2 51%» y se callaba que el
//     16 % restante no se midió. El número no estaba mal; la base sí.
//  2. El hueco es UNA BANDA MÁS, no un extra que cada vista recuerde añadir —
//     es lo que impide que vuelvan a divergir.
//  3. Una zona a 0 s no sale: «Z5 0%» es un valor medido pintado como un cero
//     (§6.2 bis del CONTRATO-UI).

import type { SegmentoZona } from './screens/post-entreno/piezas';

/** Como se llama al hueco en toda la app — el espejo de `ZoneCoverage.unknownLabel`. */
export const SIN_PULSO = 'Sin pulso';

export interface MedidoZonas {
  /** `workout_executions.total_duration_seconds`. */
  duracionS: number;
  /** `raw_lap_data_json.zone_seconds`. */
  zonasS: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>>;
}

/** Vacío = no hay lectura, y entonces NO se pinta barra (§7): ni vacía, ni a cero. */
export function distribucionZonas(medido: MedidoZonas): SegmentoZona[] {
  const conDato = ([1, 2, 3, 4, 5] as const)
    .map((zona) => ({ zona: zona as 1 | 2 | 3 | 4 | 5 | null, secs: medido.zonasS[`z${zona}` as const] ?? 0 }))
    .filter((z) => z.secs > 0);
  const medidos = conDato.reduce((acc, z) => acc + z.secs, 0);
  if (medidos <= 0) return [];

  // Una duración menor que lo medido es redondeo del reloj, no un hueco
  // negativo: se ensancha a lo medido, que es lo único que no puede desbordar
  // la barra. Nunca TAPA un hueco real — ese hace la duración la mayor de las dos.
  const total = Math.max(medido.duracionS, medidos);
  const partes = total > medidos ? [...conDato, { zona: null, secs: total - medidos }] : conDato;

  // Resto mayor: lo que se lista suma exactamente 100 — sobre la base buena esta
  // vez. Redondear cada banda por su cuenta deja el total en 99 o en 101, que en
  // la única pantalla cuyo asunto es un total fiable se lee como un fallo.
  const exactos = partes.map((p) => (p.secs / total) * 100);
  const pcts = exactos.map((e) => Math.floor(e));
  let sobran = 100 - pcts.reduce((a, b) => a + b, 0);
  [...exactos.keys()]
    .sort((a, b) => (exactos[b]! - pcts[b]!) - (exactos[a]! - pcts[a]!) || a - b)
    .forEach((i) => {
      if (sobran > 0) {
        pcts[i]! += 1;
        sobran -= 1;
      }
    });

  return partes
    .map((p, i) => ({
      zona: p.zona,
      pct: pcts[i]!,
      etiqueta: p.zona ? `Z${p.zona} ${pcts[i]}%` : `${SIN_PULSO} ${pcts[i]}%`,
    }))
    .filter((s) => s.pct > 0);
}
