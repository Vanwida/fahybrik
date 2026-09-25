// KIT-RELOJ — la muñeca, rehecha (25-09-2026). Modelo: docs/reloj-muneca/modelo.md.
//
// TODA pantalla `reloj-*` del doble se construye con este kit y con nada más
// (DECISIONS 2026-09-25: «NO diseñar una pantalla de la muñeca fuera del kit»).
// De `kit-watch` solo se reutiliza el aro de estructura, por dentro (`aro.tsx`).
//
// ── CÓMO SE MONTA UNA PANTALLA (lo normal: 20 líneas) ──────────────────────
//
//   1. PLAN — `PlanSesion` = pasos planos (`PasoBase[]`) + `ZonasCoach` +
//      `REGLAS_AVISO_DEFECTO`. Cada paso: medida × objetivos × rol × fase, con
//      su posición anidada (P2). Sin texto libre salvo `cue` y `nombre`.
//   2. CUERPO — un `Simulador` (paso, i, t, sesionT) → { ritmo, ppm, gps, viejos, hecho }.
//   3. `<VivoDePlan plan sim inicio estructura control onLog />` — motor +
//      carcasa + caras de correr + las cuatro páginas de la corona. Una familia
//      con caras propias pasa `cara={(seq) => … | null}` (null = la de correr,
//      P10) y, si quiere, `etiquetaSiguiente`, `avisoCierre`, `modelo`,
//      `inicial` y `guion` (gestos guionizados para demos).
//   Si hace falta montarlo a mano: `useEventos` + `useSecuencia` + `<Muneca>`.
//
// ── EL API, POR FICHERO ─────────────────────────────────────────────────────
//
//   tokens.ts    LIENZO, SAFE, ANCHO_UTIL/ALTO_UTIL, ANCHO_HEROE, ANCHO_CABEZA (fila
//                de arriba), ANCHO_PIE (fila de abajo, esquinas); T (escala de tipo),
//                FILA + HUECO + altoHeroe(filas) (presupuesto vertical), C (color),
//                espectroZonas(n)/colorZona(z,n)/tinte(), TINTE_ZONA_PCT, AOD,
//                RPE_PALABRA_DEFECTO, anchoTexto (métricas SF), tallaHeroe, cuerpoQueCabe.
//   paso.ts      El contrato (P1/P2): Medida, Objetivo, EjeObjetivo, Rol, Fase, Posicion,
//                Clase + NOMBRE_CLASE_DEFECTO, PasoBase/Paso, Lecturas, ZonasCoach,
//                ReglasAviso + REGLAS_AVISO_DEFECTO, Vuelta, FilaEstructura, EstadoVivo.
//   reglas.ts    Formatos (fmtReloj, fmtRitmo, fmtDistancia, fmtDuracion, fmtPrescrito,
//                fmtObjetivo, num), principal/objetivoDe, faltaDe, contextoDe,
//                textoPasoCorto, esCarrera, zonaDe/limitesZona/rangoPpm, veredictoDe,
//                palabraVeredicto, holguraDe, valorDeEje, posicionZona, tinteDelPaso.
//   lamina.ts    P3 en UNA función: heroeDelPaso(paso, lecturas, zonas) y
//                laminaDelPaso(…) → { contexto, heroe, banda, instruccion, segundo,
//                tercero, nota, tinte }; bandaDe, lineaPulso. El Swift las espeja.
//   voz.ts       vozInicio, vozRecupera, vozDescanso, vozFinSerie, vozKm, vozPreaviso,
//                VOZ_SESION, enLetras. Metros en letra, tiempos en cifra.
//   eventos.ts   EventoVivo + VOCABULARIO (tabla §4), useEventos(onLog) → { emitir,
//                ultimo }: un instante = un háptico + voces encadenadas;
//                decidirAviso (histéresis/cadencia/gracia como dato del coach).
//   secuencia.ts PlanSesion, Simulador, useSecuencia(plan, sim, inicio, eventos) →
//                Secuencia { paso, lecturas, estado, cuenta, go, pausado, pausar,
//                cerrar, deshacer, sumar30, vuelta, terminar }; avanzar/cerrar puros.
//   piezas.tsx   ContextoLinea, Nota (1–2 líneas), Instruccion, Heroe, Linea (30/22),
//                Corazon, ChipZona, BotonAccion (≥ 44 pt), PistaAccion («doble toque ·
//                …» o botón según ModeloReloj), DatoViejo; RelojContexto/useReloj,
//                usePrimaria (la acción con su deshacer), useFilaAccion, useCabe.
//   banda.tsx    BandaObjetivo (ritmo, pulso, zona sobre el espectro del coach).
//   pasos.tsx    Columna, PasoCorrer, Recupera, Descanso (P8), TresDosUno, AvisoVuelta,
//                LuegoLinea, textoViene.
//   paginas.tsx  PaginaControles/Control/ConfirmarTerminar, PaginaDatos, PaginaVueltas,
//                PaginaEstructura/textoFila, AhoraSuena.
//   aro.tsx      AroSesion, arcosDePlan, fraccionDelPaso, duracionEstimada.
//   Muneca.tsx   La carcasa (P4): áreas, corona, puntos, muñeca/AOD, pausa, Water Lock,
//                deshacer 5 s, terminar, «Sesión completada», mandos simulados.
//   vivo.tsx     VivoDePlan, sesionDe, avisoDeCierre.
//
// ── LO QUE NO SE NEGOCIA ────────────────────────────────────────────────────
//
//   · Ningún `fontSize` ni hex a mano: T y C. Nada por debajo de 15 pt (T.suelo).
//   · El número grande lo decide heroeDelPaso, no la vista.
//   · Un háptico solo por `eventos.emitir(evento)`; ni uno nuevo ni con otro sentido.
//   · Naranja = acción. Zonas = espectro del coach. Recupera y descanso, monocromos.
//   · La última fila cabe en ANCHO_PIE; la primera, en ANCHO_CABEZA.
//
// ── LO QUE ES MÉTODO DEL COACH (dato con defecto, HARD RULE Nº0) ────────────
//
//   ZonasCoach (3–9), REGLAS_AVISO_DEFECTO (holgura, cadencia, confirmación,
//   gracia, preaviso), RPE_PALABRA_DEFECTO, NOMBRE_CLASE_DEFECTO,
//   PasoBase.vueltaAutoM, PasoBase.cierre («hasta pulsar»), Objetivo.avisa.

export * from './tokens';
export * from './paso';
export * from './reglas';
export * from './lamina';
export * from './voz';
export * from './eventos';
export * from './secuencia';
export * from './piezas';
export * from './banda';
export * from './pasos';
export * from './paginas';
export * from './aro';
export * from './vivo';
export { Muneca, type AccionPrimaria, type MunecaProps, type PaginaVivo, type Area, type GestoGuion } from './Muneca';
