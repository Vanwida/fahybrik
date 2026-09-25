// KIT-RELOJ — la muñeca, rehecha (25-09-2026). Modelo: docs/reloj-muneca/modelo.md.
//
// TODA pantalla `reloj-*` del doble se construye con este kit y con nada más
// (DECISIONS 2026-09-25: «NO diseñar una pantalla de la muñeca fuera del kit»).
// Nada de `kit-watch` salvo el aro, que se reutiliza tal cual por dentro.
//
// ── CÓMO SE MONTA UNA PANTALLA ──────────────────────────────────────────────
//
//   1. El PLAN: `PlanSesion` = pasos planos (`PasoBase[]`) + zonas del coach +
//      reglas de aviso (`REGLAS_AVISO_DEFECTO`). Cada paso es medida × objetivos
//      × rol × fase con su posición anidada (P2). Nada de texto libre salvo el
//      `cue` del coach y el `nombre` de catálogo.
//   2. El CUERPO: un `Simulador` (paso, i, t) → { ritmo, ppm, gps, viejos… }.
//   3. El MOTOR: `const ev = useEventos(onLog)` y
//      `const seq = useSecuencia(plan, sim, { i, t, metros, … }, ev)`.
//      Cierra pasos por medida, emite 3-2-1 / GO / recupera / preaviso /
//      afloja / vuelta / fin de serie con su voz, y deja deshacer.
//   4. La CARCASA: `<Muneca paginas=[…] aro=… capa=… accion=… eventos={ev} …/>`
//      pone la gramática nativa (Controles | Vivo | Ahora suena, corona,
//      doble toque, muñeca, pausa, Water Lock, deshacer, terminar) y los
//      mandos simulados FUERA del lienzo.
//   5. Las CARAS: `PasoCorrer`, `Recupera`, `Descanso`, `TresDosUno` y las
//      páginas `PaginaDatos` / `PaginaVueltas` / `PaginaEstructura` como
//      contenido de las páginas. Una familia nueva (fuerza, estación, EMOM…)
//      compone su cara con las PIEZAS (`ContextoLinea`, `Heroe`, `Linea`,
//      `BandaObjetivo`, `Instruccion`, `Nota`, `BotonAccion`, `PistaAccion`)
//      dentro de una `Columna`, y el alto del héroe con `altoHeroe([...filas])`.
//
// ── LAS REGLAS QUE NO SE NEGOCIAN (y dónde viven) ──────────────────────────
//
//   P3  el número grande      → `heroeDelPaso` / `laminaDelPaso` (lamina.ts)
//   P5  un evento, un háptico  → `VOCABULARIO` + `useEventos` (eventos.ts)
//   P6  un color, un significado → `C`, `espectroZonas`, `colorZona` (tokens.ts)
//   P7  SF recto, cifras fijas, héroe 44–96 ajustado → `T`, `tallaHeroe`
//   P8  el descanso común       → `Descanso` (pasos.tsx)
//   P4  la gramática            → `Muneca` (Muneca.tsx)
//   §3  Always-On, dato viejo   → `AOD` + `Muneca`; `DatoViejo`, `Lecturas.viejos`
//   Suelo de 15 pt              → `T.suelo`; toda pieza lo respeta.
//
// ── LO QUE ES MÉTODO DEL COACH (dato con defecto, HARD RULE Nº0) ────────────
//
//   zonas (`ZonasCoach`, 3–9), holgura / cadencia / gracia / preaviso
//   (`REGLAS_AVISO_DEFECTO`), palabras del RPE (`RPE_PALABRA_DEFECTO`),
//   nombres de las clases de paso (`NOMBRE_CLASE_DEFECTO`), vuelta automática
//   (`PasoBase.vueltaAutoM`), «hasta pulsar» (`PasoBase.cierre`).

export * from './tokens';
export * from './paso';
export * from './reglas';
export * from './lamina';
export * from './voz';
export * from './eventos';
export * from './secuencia';
export * from './piezas';
export * from './pasos';
export * from './paginas';
export * from './aro';
export * from './vivo';
export { Muneca, type AccionPrimaria, type MunecaProps, type PaginaVivo, type Area, type GestoGuion } from './Muneca';
