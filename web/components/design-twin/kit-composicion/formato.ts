// Un formateador por concepto (§2 del CONTRATO-UI) — el doble los importa del
// producto: `web/lib/formato.ts` es el canónico (subió allí el 29-09, cuando la
// pestaña Rendimiento del coach los necesitó). Este fichero solo los reexporta
// para que las pantallas del doble no cambien de import: si ves aquí una
// implementación, es un duplicado.

export {
  conMillar,
  delta,
  diaCorto,
  distancia,
  esDecimal,
  fechaCorta,
  haceCuanto,
  horasYMin,
  kg,
  mesCorto,
  ppm,
  reloj,
  ritmo500,
  ritmoKm,
  toneladas,
} from '@/lib/formato';
