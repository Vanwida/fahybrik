// KIT-RELOJ — la muñeca, rehecha (25-09-2026). Modelo: docs/reloj-muneca/modelo.md.
//
// TODA pantalla `reloj-*` del doble se construye con este kit y con nada más
// (DECISIONS 2026-09-25: «NO diseñar una pantalla de la muñeca fuera del kit»).
// De `kit-watch` solo se reutiliza el aro de estructura, por dentro (`aro.tsx`).
// El Swift espeja el KIT función por función: lo genérico vive aquí UNA vez
// (consolidación del 25-09); una pantalla es configuración + sus caras propias.
//
// ── CÓMO SE MONTA UNA PANTALLA (lo normal: 20 líneas) ──────────────────────
//
//   1. PLAN — `PlanSesion` = pasos planos (`PasoBase[]`) + `ZonasCoach` +
//      `REGLAS_AVISO_DEFECTO`. Cada paso: medida × objetivos × rol × fase, con
//      su posición anidada (P2) y, si es de una familia, su dato (`roxzone`,
//      `wod`, `fuerza`). Sin texto libre salvo `cue` y `nombre`.
//   2. CUERPO — un `Simulador` (paso, i, t, sesionT) → { ritmo, split500, ppm,
//      gps, hecho, viejos… }. El PM5 da su /500 (o sus metros), no un ritmo.
//   3. `<VivoDePlan plan sim inicio …/>` — motor + carcasa + caras de correr +
//      las cuatro páginas de la corona. Una familia cambia lo suyo, y nada más:
//      `cara` (null = la del kit), `paginas`, `accion`, `capa`, `corona` (un
//      valor enfocado), `aro`/`duracion`, `final`, `onFin`, `guardarQuieto`,
//      `avisoCierre`, `traducir` (su voz) e `inicial`/`guion` para demos.
//   Con estado propio que depende del paso (lo anotado, las rondas): `useVivo`
//   + tus ganchos + `<VistaVivo seq eventos …/>` (lo mismo que hace VivoDePlan).
//   Antes y después del vivo, la carcasa es `Pila`.
//
// ── EL API, POR FICHERO ─────────────────────────────────────────────────────
//
//   tokens.ts     LIENZO, SAFE, ANCHO_UTIL/ALTO_UTIL, ANCHO_HEROE, ANCHO_CABEZA (fila
//                 de arriba), ANCHO_PIE (fila de abajo, esquinas); T (escala de tipo),
//                 FILA + HUECO + altoHeroe(filas) (presupuesto vertical), C (color),
//                 espectroZonas(n)/colorZona(z,n)/tinte(), TINTE_ZONA_PCT, AOD,
//                 RPE_PALABRA_DEFECTO (0–10), anchoTexto (métricas SF), tallaHeroe, cuerpoQueCabe.
//   paso.ts       El contrato (P1/P2): Medida, Objetivo, EjeObjetivo, Rol, Fase, Posicion,
//                 Clase + NOMBRE_CLASE_DEFECTO, PasoBase/Paso, Lecturas, ZonasCoach,
//                 ReglasAviso + REGLAS_AVISO_DEFECTO, Vuelta, Parcial, FilaEstructura,
//                 EstadoVivo; lo de cada familia como dato: SentidoRoxzone (P10),
//                 Tarea/InfoWod (P12, M5), FichaFuerza/CargaFuerza/EsfuerzoFuerza +
//                 FICHA_FUERZA_DEFECTO (P11, M1).
//   reglas.ts     Formatos (fmtReloj, fmtRitmo, fmtDistancia, fmtDuracion, fmtPrescrito,
//                 fmtObjetivo, num), textoObjetivo (LA notación del objetivo: brief,
//                 esfera, Estructura), textoCargaImplemento (M7), principal/objetivoDe,
//                 faltaDe, contextoDe, textoPasoCorto (con la carga), esCarrera,
//                 zonaDe/limitesZona/rangoPpm, veredictoDe/veredictoPrincipal/
//                 veredictoDelPaso, palabraVeredicto, holguraDe, valorDeEje,
//                 posicionZona, tinteDelPaso.
//   fuerza.ts     La serie de fuerza en palabras: esFuerza/PasoFuerza, fmtKg, kgDelPlan,
//                 textoKgPlan, textoPct, textoEsfuerzo, textoTempo, textoCarga,
//                 dosisSerie, dosisEjercicio, avisoSerie, quienSerie.
//   tarea.ts      La tarea del WOD: wodDe, textoTarea, textoTareaCorto, dosisTarea,
//                 cargaTarea, repsPorRonda; la puntuación: Dial, girarDial, desgloseReps.
//   estructura.ts La estructura en líneas de dato: duracionEstimada/duracionHumana,
//                 Grupo + filasDePasos, estructuraDe, lineaBrief, grupoPrincipal,
//                 hoyDe, paginar.
//   despues.ts    Lo que se decide al terminar: MetodoResumen + METODO_RESUMEN_DEFECTO
//                 (pares, umbral de serie cortada, guardado solo tras 10′ quieto),
//                 completitud (completa/parcial/libre), costeTrasEstacion.
//   lamina.ts     P3 en UNA función: heroeDelPaso(paso, lecturas, zonas) y
//                 laminaDelPaso(…) → { contexto, heroe, banda, instruccion, segundo,
//                 tercero, nota, tinte }; bandaDe, lineaPulso. El Swift las espeja.
//   voz.ts        vozInicio (sabe de tareas, fuerza con su carga y ergo), vozRecupera,
//                 vozDescanso, vozTransicion (Colócate, campana, Roxzone), vozFinSerie
//                 (en /500 a split), vozKm, vozPreaviso, VOZ_SESION, nombreCuenta, enLetras.
//   eventos.ts    EventoVivo (incl. «GPS listo») + VOCABULARIO (tabla §4), useEventos(onLog)
//                 → { emitir, ultimo }: un instante = un háptico + voces encadenadas;
//                 decidirAviso (histéresis/cadencia/gracia como dato del coach).
//   secuencia.ts  El motor PURO: PlanSesion, Simulador/LecturaSim (ritmo, split500,
//                 vatios, cadencia, metros del PM5), EstadoSecuencia (parciales,
//                 zonasS, ppmMax, sesionM corridos + sesionErgoM), InicioSecuencia
//                 (parciales, preavisado), estadoInicial/avanzar/cerrar, lecturasDe,
//                 pasoVivo, cuentaDe, DETECCION (cierre al volver a correr), Emitido.
//   gancho.ts     useSecuencia(plan, sim, inicio, eventos, { traducir }) → Secuencia
//                 { estado, plan, paso, lecturas, cuenta, go, pausado, pausar, cerrar,
//                 deshacer, sumar30, vuelta, terminar }; Transicion, Traductor, conVoz,
//                 traducirCon.
//   gestos.ts     Lo que comparten Muneca y Pila: useDestinos, useGuion, useRueda,
//                 useArrastreValor, GestoGuion, Direccion, OrigenPrimario.
//   piezas.tsx    ContextoLinea, Nota (1–2 líneas), Instruccion, Heroe, Linea (30/22),
//                 Corazon, ChipZona, BotonAccion (≥ 44 pt), PistaAccion («doble toque ·
//                 …» o botón según ModeloReloj), DatoViejo; RelojContexto/useReloj,
//                 usePrimaria (la acción con su deshacer), useFilaAccion, useCabe.
//   apoyos.tsx    Centro, altoLibre, Titulo (prefijo gris), lineaTotal, pistaCerrar,
//                 pistaDeclarar, ParDatos, Luego/filasLuego, Viene + VieneLinea/
//                 vieneEnUna/altoViene, Marca (✓/aro), BotonesDescanso.
//   banda.tsx     BandaObjetivo (ritmo, /500, pulso, zona sobre el espectro del coach).
//   pasos.tsx     Columna, PasoCorrer (contexto, línea bajo él, ritmo bajo el RPE),
//                 Recupera, Descanso (P8: «Viene» propio, hueco de anotación, pulso
//                 opcional), TresDosUno, AvisoVuelta, LuegoLinea, textoViene.
//   puntuacion.tsx CaraPuntuacion: la campana del AMRAP, la puntuación con la corona.
//   paginas.tsx   PaginaControles/Control/ConfirmarTerminar, AhoraSuena.
//   listas.tsx    Las de la corona: PaginaFilas/FilaDato, PaginaSplits/juicioDe,
//                 PaginaLista/FilaLista, y sus usos: PaginaDatos, PaginaVueltas,
//                 PaginaEstructura/textoFila.
//   aro.tsx       AroSesion (con su estimador `duracion`), arcosDePlan, fraccionDelPaso.
//   Muneca.tsx    La carcasa del vivo (P4): áreas, corona (y la corona enfocada en un
//                 valor), doble toque en la pantalla, puntos, muñeca/AOD, pausa, Water
//                 Lock, deshacer 5 s en la franja del pie, terminar, «Sesión completada»,
//                 mandos simulados; onEntrada.
//   pila.tsx      Pila: la carcasa de antes y después (sin Controles ni Ahora suena).
//   fin.tsx       Completada (completa/parcial/libre, Guardar/Seguir, guardada sola),
//                 lineaCompletitud.
//   vivo.tsx      useVivo, VistaVivo, VivoDePlan, FinDeVivo, sesionDe, avisoDeCierre.
//
// ── LO QUE NO SE NEGOCIA ────────────────────────────────────────────────────
//
//   · Ningún `fontSize` ni hex a mano: T y C. Nada por debajo de 15 pt (T.suelo).
//   · El número grande lo decide heroeDelPaso, no la vista.
//   · Un háptico solo por `eventos.emitir(evento)`; ni uno nuevo ni con otro sentido.
//     Una familia cambia la VOZ con `traducir`, no el evento de un cambio de paso.
//   · Naranja = acción. Zonas = espectro del coach. Recupera y descanso, monocromos.
//   · La última fila cabe en ANCHO_PIE; la primera, en ANCHO_CABEZA. El aviso de
//     deshacer vive en la franja del pie: nunca tapa el héroe.
//   · Un toque no cierra nada; dos seguidos en la pantalla (o el gesto de la mano)
//     son la acción del momento.
//
// ── LO QUE ES MÉTODO DEL COACH (dato con defecto, HARD RULE Nº0) ────────────
//
//   ZonasCoach (3–9), REGLAS_AVISO_DEFECTO (holgura, cadencia, confirmación,
//   gracia, preaviso), RPE_PALABRA_DEFECTO, NOMBRE_CLASE_DEFECTO,
//   METODO_RESUMEN_DEFECTO (pares mínimos, umbral de serie cortada, guardado
//   solo tras 10′ quieto), PasoBase.vueltaAutoM, PasoBase.cierre («hasta
//   pulsar»), Objetivo.avisa. Del implemento y del gimnasio: FICHA_FUERZA_DEFECTO
//   (kg por clic, barra vacía). Mecanismo nuestro (constante): DETECCION.

export * from './tokens';
export * from './paso';
export * from './reglas';
export * from './fuerza';
export * from './tarea';
export * from './estructura';
export * from './despues';
export * from './lamina';
export * from './voz';
export * from './eventos';
export * from './secuencia';
export * from './gancho';
export * from './gestos';
export * from './piezas';
export * from './apoyos';
export * from './banda';
export * from './pasos';
export * from './puntuacion';
export * from './paginas';
export * from './listas';
export * from './aro';
export * from './vivo';
export * from './pila';
export * from './fin';
export { Muneca, type AccionPrimaria, type MunecaProps, type PaginaVivo, type Area } from './Muneca';
