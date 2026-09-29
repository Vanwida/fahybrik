// Las analíticas del atleta: el contrato de lectura, el método editable del
// coach, y los motores que producen cada familia de lecturas.
//
// `lectura` va primero a propósito — es el contrato al que se conforman los
// demás, y quien llegue a esta carpeta debe leerlo antes que ningún motor.
//
// Desde el 29-09-2026 (docs/analiticas/modelo.md) el panel único se monta con:
//   anclas → carga-tramo (lo hecho) y carga-plan (lo prescrito) → forma
//   (con proyección) · semanas · estado, en el sobre de `panel`; y el
//   cumplimiento (bandas → esfuerzos → tramo → líneas → sesión → lecturas).
// `carga`, `capacidad` y `recuperacion` son el contrato de agosto que sigue
// sirviendo `/analytics/lecturas` hasta que las dos superficies nuevas estén en
// producción (§9).

export * from './lectura';
export * from './metodo';
export * from './ventana';
export * from './hechos';
export * from './carga';
export * from './capacidad';
export * from './recuperacion';
export * from './anclas';
export * from './familia';
export * from './carga-tramo';
export * from './carga-plan';
export * from './forma';
export * from './semanas';
export * from './estado';
export * from './cumplimiento-bandas';
export * from './cumplimiento-esfuerzos';
export * from './cumplimiento-tramo';
export * from './cumplimiento-lineas';
export * from './cumplimiento-sesion';
export * from './cumplimiento';
export * from './panel';
