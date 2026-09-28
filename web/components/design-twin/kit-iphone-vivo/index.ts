// KIT-IPHONE-VIVO — el vivo del iPhone, rehecho (28-09-2026). Modelo:
// docs/vivo-iphone/modelo.md. Cómo se usa: README.md, aquí al lado.
//
// UN ESTADO, DOS PINTORES (I1): este kit NO tiene dominio propio. Qué héroe,
// qué veredicto, qué notación, qué métricas, qué se dice y qué vibra, todo se
// importa de `kit-reloj` (`heroeDeFamilia`, `laminaDelPaso`, `metricasDelPaso`,
// `luegoDe`, `formatoDe`, la secuencia, la voz, los eventos, `anotar`). Aquí
// solo vive el LIENZO del iPhone: tokens, la anatomía I5 y sus piezas.
//
// ── EL API, POR FICHERO ─────────────────────────────────────────────────────
//
//   tokens.ts     LIENZO (402 × 874; 390–430 de ancho), MARGEN, anchoUtil, HUECO;
//                 NUMERAL (UN token: la cara de todas las cifras) + estiloNumeral;
//                 TI (la escala por papel, suelo 15), ALTO (las franjas de la
//                 anatomía; el sujeto es fijo), CELDA, RADIO; CI (= C de la muñeca
//                 + desactivado/celda), tinteAmbiente (zona de fondo, solo a zona);
//                 DURACION (terminar 1 s, destello, tarjeta del km).
//   piezas.tsx    LienzoContexto/useLienzo/useMedidaLienzo (el ancho real), Numeral,
//                 Etiqueta, Cuerpo, Nota, Boton (64 / 44), BotonRedondo, Chip
//                 (ok/buscando/perdido/apagado), Icono, Superficie, KEYFRAMES_IPHONE;
//                 Corazon y ChipZona son los de la muñeca.
//   enlace.ts     Dispositivos (reloj, máquina, pulsómetro), enlacesDe (los chips,
//                 derivados de las lecturas: nunca un segundo estado), notaEnlace,
//                 usaGps.
//   cabecera.tsx  Cabecera (posición + formato + Test + crono de sesión/total + chips),
//                 PuntosPaginas, partesQueCaben (quita por el final, nunca trunca).
//   sujeto.tsx    Sujeto (72–176 pt, alto fijo, nota debajo), BandaObjetivo (▲▼ +
//                 palabra, espectro a zona), Trabajo (40 pt, nunca gris), CuentaAtras
//                 (LA cuenta atrás: 3-2-1 y GO), AvisoVuelta (el km).
//   rejilla.tsx   Rejilla (2–4 celdas en dos columnas; la franja ELÁSTICA), Luego
//                 (con «después»), TiraEstructura (la sesión en una tira; tocar abre
//                 la Estructura).
//   accion.tsx    VOCABULARIO_PRIMARIA (cerrado, con su peso), primariaDe,
//                 claveDesdeEtiqueta, FranjaAccion (Pausa · Primaria · Terminar con
//                 pulsación de 1 s), AvisoDeshacer (5 s), HojaTerminar +
//                 resumenParaTerminar, VeloPausa, Terminado.
//   descanso.tsx  Mas30, AnotarSerie (tocar el dato, ± grandes, «sin confirmar» / «✓»).
//   paginas.tsx   PaginasLaterales (Vivo · Estructura · Mapa), PaginaEstructura (la
//                 única lista larga: scrollea), PaginaMapa.
//   fuera.tsx     PantallaBloqueo (Live Activity), IslaDinamica (compacta / expandida).
//   Vivo.tsx      VistaIphone (la anatomía sobre una `Secuencia`), VivoIphoneDePlan
//                 (motor + vista), GestoIphone (el guion de una demo).
//
// ── LO QUE NO SE NEGOCIA ────────────────────────────────────────────────────
//
//   · Ningún `fontSize` ni hex a mano: TI, ALTO y CI. Nada por debajo de 15 pt.
//   · El héroe lo decide `heroeDeFamilia`; la rejilla, `metricasDelPaso`; el
//     botón, el VOCABULARIO_PRIMARIA. Una familia CONFIGURA, no repinta.
//   · El sujeto tiene alto fijo (ALTO.sujeto): su centro no baila entre familias.
//     El sobrante entra en la rejilla, nunca en una cola.
//   · Naranja = la acción primaria y el trabajo en la tira. Nada más.
//   · Una cuenta atrás (CuentaAtras). Un deshacer (5 s, sobre la franja).
//     Terminar = mantener 1 s + hoja. Nunca «Terminar» cerrando otra cosa.
//   · Lo que nadie mide no se pinta; lo perdido, «—» con su nota (enlace.ts).
//   · Copy de box: «el remo», «la bici», «lo dices tú». Nunca PM5/FTMS/BLE.
//   · Nada del vivo se diseña fuera de este kit (ver docs/DECISIONS.md).

export * from './tokens';
export * from './piezas';
export * from './enlace';
export * from './cabecera';
export * from './sujeto';
export * from './rejilla';
export * from './accion';
export * from './descanso';
export * from './paginas';
export * from './fuera';
export * from './Vivo';
