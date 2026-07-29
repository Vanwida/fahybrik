// El único sitio público de la familia: `dominio` (qué se prescribe y cómo se
// dice) + `curvas` (qué canta el monitor segundo a segundo). Las vistas importan
// SIEMPRE de aquí, así partir el fichero por tamaño no obliga a tocar diez
// imports cada vez.
//
// La dirección de dependencia es una sola: dominio ← curvas ← data. Ni un ciclo.

export * from './dominio';
export * from './curvas';

/**
 * El cronómetro que CORRE va a ancho fijo (`01:52`), que es el `anchoFijo: true`
 * del §2: así el layout no baila y, de paso, el crono no se confunde con el
 * ritmo, que se lee `1:52` a su lado. `fmtClock` de `sim.ts` no tiene ese
 * parámetro, así que se toma la única implementación que ya existe en el doble
 * en vez de escribir la decimoquinta duración del proyecto (§2.1). Cuando
 * `sim.ts` acepte el parámetro, esta reexportación se cae.
 */
export { fmtElapsed } from '../benchmark-erg/data';
