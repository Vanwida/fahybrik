// KIT-GARMIN — el reloj Garmin (29-09-2026). Modelo: docs/garmin-reloj/modelo.md.
// Nota de uso: docs/garmin-reloj/kit.md.
//
// UN ESTADO, DOS PINTORES (G1): este kit NO tiene dominio propio. El paso, el
// motor, las reglas, el héroe (`laminaDelPaso`), el veredicto, las zonas del
// coach, la estructura y la completitud se importan de `kit-reloj`. Aquí vive
// solo lo que cambia con la plataforma: el LIENZO REDONDO (en fracciones del
// diámetro D), la GRAMÁTICA DE BOTONES (§5) y los AVISOS de vibración y tono
// sin voz (§6). Toda pantalla `garmin-*` del doble se construye con este kit.
//
// ── CÓMO SE MONTA UNA PANTALLA (lo normal: 20 líneas) ──────────────────────
//
//   1. PLAN — un `PlanSesion` de kit-reloj (pasos planos + zonas del coach +
//      `REGLAS_AVISO_DEFECTO`). Los de `screens/reloj-*` se reutilizan tal cual.
//   2. CUERPO — el `Simulador` de kit-reloj (ritmo, pulso, GPS… por segundo).
//   3. `<VivoGarminDePlan plan sim inicio onLog />` — motor + carcasa de cinco
//      botones + caras base + páginas (Paso → Datos → Vueltas → Estructura) +
//      Controles + pausa + deshacer + final. Una familia cambia lo suyo y nada
//      más: `cara` (null = la del kit), `paginas`, `estadoMandos` (p. ej.
//      'anotar' en el descanso de fuerza), `alAccion` (ronda hecha, reps ±1,
//      anotar…: las acciones de §5 que no son del kit), `controles`, `capa`,
//      `aro`/`duracion`, `avisoCierre`, `final`/`onFin`, `traducir` (sus
//      avisos, partiendo de `eventosDeTransicion`) e `inicial`/`guion`.
//   Con estado propio que depende del paso: `useVivoGarmin` + tus ganchos +
//   `<VistaGarmin seq avisos …/>` (lo mismo que hace VivoGarminDePlan).
//   Una cara nueva = una función PURA que devuelve una `Disposicion` (con
//   `lineasContexto`, `heroeEn`, `lineaDeDato`, `lineaDeTexto`, `colocar`…) y
//   un componente de una línea que la pinta con `<PintaDisposicion d />`.
//
// ── EL API, POR FICHERO ─────────────────────────────────────────────────────
//
//   tokens.ts     TAMANOS (454/390 AMOLED, 260/218 MIP), SUELO_D, tamanoDe; TG (la
//                 escala en fracción de D: héroe 0,20–0,26, segundo 0,11, tercero
//                 0,085, contexto 0,07, nota = suelo 0,062), CAJA, FUENTE (cifras
//                 de marca / sans), AIRE, aPx, cuerpoPx; CG (color), aMip,
//                 NIVELES_MIP, sobreNegro, pintorDe, tinteDeFondo (solo AMOLED),
//                 BRILLO_ARO, TRAZO, DIBUJO, ZONA_APAGADA; TIEMPO; CARCASA y ESTUDIO
//                 (el reloj físico y la mesa).
//   geometria.ts  ARO, AIRE_ARO, RADIO_UTIL, REJILLA (contexto 8–22 %, héroe 24–60,
//                 banda 62–70, secundaria 72–84, pie 86–94), ASIENTO, cuerdaEn,
//                 anchoUtilFila, yEnFranja, cajaEnFila, caja, repartir,
//                 FRANJA_DESHACER, CONTEXTO_EN_DOS, PISTA, SELLO.
//   medir.ts      SUBCONJUNTO_CIFRAS (la bitmap del reloj), CIFRA_EM, ESPACIO_EM, avanceCifra,
//                 anchoCifras, anchoEn, Pieza/Tono/Glifo, anchoPiezas, ajustarPartes
//                 (baja de cuerpo antes de perder una parte), partirEnLineas,
//                 cuerpoQueCabe, tallaHeroe.
//   disponer.ts   LineaG, HeroeG, PistaG, Disposicion; colocar, chica, altoLinea,
//                 lineaDePartes, lineaDeTexto (una línea o dos), piezasDeLinea,
//                 lineaDeDato (la `LineaVista` de la lámina en su fila), heroeEn.
//   caras.ts      Las caras del vivo, PURAS: disponerPaso(lamina) (G09),
//                 disponerRecupera, disponerDescanso, disponerCuenta (3-2-1/GO),
//                 disponerKm, disponerPausa, disponerDeshacer,
//                 disponerCompletada; lineasContexto, lineasApoyo, disponerBanda.
//   paginas.ts    disponerDatos, disponerVueltas, disponerEstructura, disponerMenu
//                 (Controles y sus confirmaciones), disponerDescartada.
//   mandos.ts     §5 como DATO: BotonGarmin, EstadoMandos, FILA_MODELO, MANDOS
//                 (estado × botón → acción, lo que dice §5, rótulo), REPOSO, LUZ,
//                 accionDe, PULSACION_LARGA_MS, TECLA, botonDeTecla.
//   avisos.ts     §6 como DATO: EventoGarmin, AVISOS (pulsos + tono, o «ninguno»
//                 con su motivo), PULSO_MS, perfilesDe (≤ 8 perfiles), fmtPulsos,
//                 fmtTono, sistemaDe (GPS/pulso perdido o de vuelta),
//                 eventosDeTransicion, componerAvisos (el acuse delante y UN
//                 aviso), useAvisos(onLog) → { emitir, transicion, ultimo, comoEventos }.
//   pintar.tsx    GarminContexto/useGarmin/entornoDe, PantallaGarmin (el círculo),
//                 Cifras (tabulares a mano), LineaPintada, HeroePintado, PistaPintada,
//                 PintaDisposicion (pinta una disposición), Tapa, colorDe.
//   aro.tsx       AroGarmin (la sesión en el borde; destella en un aviso fuera).
//   lista.tsx     ListaEstructura (la lista con ventana: la página Estructura y la
//                 Estructura completa del brief), ProveeLista, MoverLista, filasDeEstructura.
//   pantalla.tsx  CaraPaso, CaraRecupera, CaraDescanso, CaraCuenta, CaraKm, CaraPausa,
//                 CaraCompletada, CaraDescartada, FranjaDeshacer, CaraMenu,
//                 PaginaDatos, PaginaVueltas, PaginaEstructura; caraPorDefecto,
//                 capaPorDefecto, CaraDelVivo.
//   carcasa.tsx   CarcasaGarmin (cinco botones clicables + teclado, rótulos en
//                 reposo, táctil solo fuera del vivo, selector de tamaño, lector),
//                 useEncaje.
//   comparar.tsx  ComparaTamanos (los cuatro relojes a 1:1).
//   controles.ts  IdControl, TEXTO_CONTROL, ENTORNOS, estadoDelPaso (la fila de §5
//                 que dice el paso), controlesPorDefecto.
//   vivo.tsx      useVivoGarmin, VistaGarmin, VivoGarminDePlan, hechoDe,
//                 ContextoAccion, PaginaGarmin.
//
// ── LO QUE NO SE NEGOCIA ────────────────────────────────────────────────────
//
//   · Todo en fracciones de D. Ningún `fontSize`, hex ni número suelto en una
//     pieza: TG, CG, REJILLA, AIRE. Ningún texto bajo el 6,2 % de D; todo cabe
//     a 218 (los tests lo miden en los cuatro tamaños).
//   · El número grande lo decide `laminaDelPaso`; la vista coloca y pinta.
//   · En MIP (260, 218) todo color pasa por `aMip`; el fondo no se tiñe.
//   · Naranja = acción (el marco de Controles, «↶ UP · deshacer») y el trabajo
//     en el aro. Zonas = el espectro del coach. Recupera y descanso, monocromos.
//   · Un botón hace lo que dice `MANDOS` para su estado. BACK en el vivo es la
//     vuelta, con 5 s para deshacer (UP), y jamás cierra la app grabando.
//   · Un aviso solo por `avisos.emitir(evento)` (o la transición del motor);
//     nada de voz. El pulso, siempre en la fila de abajo.
//
// ── LO QUE ES MÉTODO DEL COACH (dato con defecto, HARD RULE Nº0) ────────────
//
//   Lo hereda todo de kit-reloj: ZonasCoach, REGLAS_AVISO_DEFECTO (holgura,
//   cadencia, confirmación, gracia, preaviso), NOMBRE_CLASE_DEFECTO,
//   PasoBase.vueltaAutoM, PasoBase.cierre, Objetivo.avisa, METODO_RESUMEN_DEFECTO.
//   Aquí no nace ningún método: el tamaño de un pulso, las notas de un tono o
//   el ángulo de un botón son mecanismo (constantes con nombre).

export * from './tokens';
export * from './geometria';
export * from './medir';
export * from './disponer';
export * from './caras';
export * from './paginas';
export * from './mandos';
export * from './avisos';
export * from './pintar';
export * from './aro';
export * from './lista';
export * from './pantalla';
export * from './carcasa';
export * from './comparar';
export * from './controles';
export * from './vivo';
