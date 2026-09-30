// PLAN COMPACTO — el formato que lleva una sesión al reloj Garmin.
// Diseño, medidas y huecos del modelo: docs/garmin-reloj/plan-compacto.md.
//
//   formato.ts      ABI: versión, tablas de códigos, empaquetado, límites, presupuesto.
//   flujo.ts        La capa entre el modelo y los bytes: valores enteros + tabla de cadenas.
//   codificar.ts    codificarSesion(plan, meta) → bytes · flujoDeSesion (con el informe de cadenas).
//   codificar-campos.ts  El cómo de cada campo del paso y las tablas de tareas (interno).
//   decodificar.ts  decodificarSesion(bytes) → { meta, plan } · decodificarPlan · decodificarSobre.
//   transporte.ts   Varints binarios, base64 y el sobre JSON mínimo.
//   canonico.ts     La forma contra la que se compara «ida y vuelta exacta».
//   meta.ts         Prototipo del constructor de servidor: cabecera por defecto y huella.
//   tipos.ts        MetaSesion, Vocabulario, MetodoReloj, bandas de ritmo.

export * from './formato';
export * from './flujo';
export * from './tipos';
export * from './canonico';
export * from './transporte';
export * from './codificar';
export * from './decodificar';
export * from './meta';
