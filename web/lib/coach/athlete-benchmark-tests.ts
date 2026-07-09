// #34 — Tests de calibración por defecto (~semana 1).
//
// El stub anterior (PHASE=2, slugs no canónicos, importado en 0 sitios) queda
// SUSTITUIDO por el catálogo canónico en shared, único source of truth:
//   @fahybrid/shared/domain/coach/test-battery  (DEFAULT_CALIBRATION_BATTERY, store_results)
// Se re-exporta aquí para compatibilidad de import desde el lado web.

export {
  DEFAULT_CALIBRATION_BATTERY,
  CALIBRATION_META_KEY,
  storeResultSpecBySlug,
  type CalibrationTestProtocol,
  type CalibrationFormat,
} from '@fahybrid/shared/domain/coach/test-battery';
