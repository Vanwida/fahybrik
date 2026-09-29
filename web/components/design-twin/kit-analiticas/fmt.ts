// UN FORMATEADOR POR UNIDAD — el doble lo importa del producto: el canónico es
// `web/components/v2/analiticas/formato.ts` (subió allí el 29-09 con la pestaña
// Rendimiento del coach). Este fichero solo lo reexporta para que las
// propuestas del iPhone no cambien de import; el vocabulario de la propuesta
// (`w`, `tss_dia`, `semanas`…) ya lo entiende el formateador del producto.

export {
  conMillar,
  conSigno,
  cifra,
  entero,
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

/** Pega la unidad a su cifra con un espacio duro: un título que se parte en «1000 / m en cinta» no se lee. */
export function unirUnidades(texto: string): string {
  return texto.replace(/(\d) (m|km|kg|min|s|h|W|ppm|rpm|spm)(?![\p{L}\d])/gu, '$1\u00a0$2');
}
