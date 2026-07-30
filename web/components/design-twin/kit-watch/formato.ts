// LOS FORMATEADORES DE LA MUÑECA — un formateador por concepto (§2).
//
// `clock`, `countdown` y `pace` se toman TAL CUAL del espejo de Swift
// (`screens/watch-live/format.ts`): son sólo cifras y dos puntos, no tienen
// separador decimal, y el reloj los escribe distinto del móvil a propósito
// («04:36» con los minutos a dos cifras, «:45» por debajo del minuto y CEIL,
// para ir en paso con los pitidos del motor).
//
// ── UN HALLAZGO QUE NO ES DE DISEÑO, ES UN BUG ─────────────────────────────
//
// Los DOS formateadores del reloj que sí llevan decimal escriben un PUNTO:
//
//   · `WatchFormat.kg`  → `82.5`  (el móvil, con `Formato.kg`, escribe `82,5 kg`)
//   · `distanceValue`   → `1.24`  (el móvil, con `Formato.distanciaCubierta`,
//                                  escribe `1,24 km`)
//
// Es exactamente el «42,4 en una pantalla y 42.4 en la de al lado» que motivó
// el CONTRATO-UI, con la diferencia de que aquí las dos pantallas son del mismo
// atleta en el mismo entreno: la carga en la muñeca y la carga en el teléfono.
// Y el §3 es explícito — nada de coma inglesa de cara al atleta.
//
// Las nueve vistas usan ESTOS, con coma. El espejo `watch-live` se queda con
// los suyos a propósito: un espejo que arregla lo que espeja deja de enseñar el
// desfase. La corrección de verdad va en `WatchFormat` (Swift) y va con su
// prueba en `FormatoTests`; queda dicho en el informe.

export { clock, countdown, pace } from '../screens/watch-live/format';

/** Coma española. Jamás un punto de cara al atleta (§3). */
function coma(valor: string): string {
  return valor.replace('.', ',');
}

/** Carga: `100 kg` · `82,5 kg`. Sin el «,0» de más. */
export function kg(valor: number): string {
  return coma(valor % 1 === 0 ? String(Math.round(valor)) : valor.toFixed(1));
}

/**
 * Distancia MEDIDA: `1,24` en km a partir de 1.000 m, metros enteros por
 * debajo. En una medida los ceros SON el dato (§2), así que `2,00` se escribe
 * `2,00` y no `2`.
 */
export function distanciaMedida(metros: number): string {
  return metros >= 1000 ? coma((metros / 1000).toFixed(2)) : String(Math.floor(metros));
}

/** La unidad que le toca a `distanciaMedida`, para pintarla al lado del numeral. */
export function unidadDistancia(metros: number): 'km' | 'm' {
  return metros >= 1000 ? 'km' : 'm';
}

/** Velocidad de cinta: `12,0 km/h`. Siempre un decimal — cambia de 0,1 en 0,1. */
export function velocidad(kmh: number): string {
  return coma(kmh.toFixed(1));
}
