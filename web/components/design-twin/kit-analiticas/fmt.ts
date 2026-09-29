// UN FORMATEADOR POR UNIDAD — el doble lo importa del producto: el canónico es
// `web/components/v2/analiticas/formato.ts` (subió allí el 29-09 con la pestaña
// Rendimiento del coach). Este fichero solo lo reexporta para que las
// propuestas del iPhone no cambien de import; el vocabulario de la propuesta
// (`w`, `tss_dia`, `semanas`…) ya lo entiende el formateador del producto.

export {
  conMillar,
  cifra,
  enDias,
  esCero,
  esDecimal,
  fechaCorta,
  fechaLegible,
  formatear,
  formatearDelta,
  horas,
  horasYMin,
  reloj,
  unidadCorta,
} from '@/components/v2/analiticas/formato';
