// LAS ANALÍTICAS DE CARRERA DEL ATLETA — ¿estoy mejorando?
//
// LA REGLA QUE GOBIERNA ESTA PANTALLA: **el dato es el dibujo.** El texto es
// pie, de una línea, y casi siempre sobra. La primera versión (12-ago) razonaba
// bien y se leía como un informe: Alex la rechazó por eso mismo, y con razón.
// Una pantalla de analíticas que hay que LEER ha fallado antes de empezar.
//
// Consecuencia para el modelo, que es lo que importa aquí: **el modelo no
// produce frases, produce magnitudes dibujables.** Donde antes había una cadena
// («hace 4 semanas perdías 15,5») ahora hay un número y una referencia, y quien
// decide cómo se enseña es el gráfico: un fantasma, una sombra, una banda.
//
// EL MODELO ENTERO. Una lectura longitudinal son cuatro cosas a la vez:
//
//   MAGNITUD    qué se mide
//   BASE        contra qué (sin base, un número no dice nada)
//   COBERTURA   si hay con qué afirmarlo
//   SENTIDO     hacia dónde es mejor — y NO es obvio: que el ritmo baje es
//               mejorar, que el volumen suba no lo es necesariamente.
//
// El SENTIDO es lo que permite dibujar sin explicar: si el modelo sabe hacia
// dónde es mejor, el gráfico puede poner lo bueno arriba y la flecha verde, y
// entonces la frase que lo contaba sobra.
//
// EL VEREDICTO SE DERIVA Y CABE EN TRES PALABRAS. No es un índice del 0 al 100
// sacado de una fórmula que nadie puede auditar: sale de una ESCALERA DE
// EVIDENCIA, y el número que lo sostiene se dibuja debajo en vez de contarse.
// Y tiene que poder decir «aún no».
//
// REGLA Nº0. El mecanismo (la escalera, la detección de exceso de carga, qué
// silencia una lectura) es del producto. Los umbrales son MÉTODO del coach:
// nacen aquí como defectos editables, no como constantes.

import type { Zona } from '../../kit-vivo';

// ---------------------------------------------------------------------------
// EL MÉTODO DEL COACH — defectos editables (Regla Nº0)
// ---------------------------------------------------------------------------

export interface Metodo {
  /** Semanas de historia antes de atreverse a afirmar una tendencia. */
  semanasParaAfirmar: number;
  /** Segundos por km a partir de los cuales un cambio deja de ser ruido. */
  mejoraMinimaSkm: number;
  /** Subida de volumen (proporción) que, con el ritmo empeorando, avisa. */
  subidaQueAvisa: number;
  /** Parejas fresco/cansado al mismo objetivo antes de poder dar el coste. */
  parejasMinimasCansado: number;
  /** El reparto que este coach considera bueno. Se dibuja como marca sobre la barra. */
  reparto: { suave: number; fuerte: number };
  /** A partir de qué porcentaje en banda se considera que clava lo que le piden. */
  enBandaBienPct: number;
  /** Cuántas repeticiones evaluadas hacen falta antes de JUZGAR ese porcentaje. */
  repeticionesParaJuzgar: number;
}

export const METODO: Metodo = {
  semanasParaAfirmar: 6,
  mejoraMinimaSkm: 3,
  subidaQueAvisa: 0.2,
  parejasMinimasCansado: 4,
  reparto: { suave: 80, fuerte: 20 },
  enBandaBienPct: 80,
  repeticionesParaJuzgar: 15,
};

// ---------------------------------------------------------------------------
// POR QUÉ UNA LECTURA PUEDE NO PODER DARSE
// ---------------------------------------------------------------------------

/**
 * Cinco razones, y se agrupan en DOS tratamientos. Esa agrupación es toda la
 * diferencia entre una pantalla honesta y una que da pena.
 */
export type Falta =
  | { por: 'historia'; llevas: number; hacen: number }
  | { por: 'ancla' }
  | { por: 'sensor' }
  | { por: 'ocasion' }
  | { por: 'intencion' };

/**
 * «Aún no» y «no aplica» parecen lo mismo y no lo son. Al recién llegado le
 * falta TIEMPO y se le dibuja el plazo. Al que no ha corrido nunca detrás de un
 * trineo no le falta nada: esa lectura no existe en su vida, y enseñarle un
 * hueco prometiéndosela es ruido con forma de dato.
 *
 * Regla dura (DECISIONS.md, 12-ago): sin cobertura se dice por qué; si en su
 * caso no existe, la app se calla.
 */
export function seCalla(f: Falta): boolean {
  return f.por === 'ocasion' || f.por === 'intencion';
}

/**
 * La SALIDA de una falta — el botón, que es todo el texto que se le dedica.
 * Antes esto era un párrafo explicando qué faltaba y por qué; el párrafo se
 * borró y quedó lo único accionable.
 */
export function salidaDe(f: Falta): string | null {
  switch (f.por) {
    case 'ancla':
      return 'Hacer el test de zonas';
    case 'sensor':
      return 'Conectar banda de pulso';
    default:
      return null;
  }
}

/**
 * Cuando varias lecturas esperan LO MISMO, la salida sale UNA vez. Sin esto, al
 * atleta sin test le pediría el test tres veces seguidas.
 */
export function faltaComun(faltas: Falta[]): Falta | null {
  const contables = faltas.filter((f) => !seCalla(f));
  if (contables.length < 2) return null;
  const primera = contables[0]!;
  return contables.every((f) => f.por === primera.por) ? primera : null;
}

// ---------------------------------------------------------------------------
// LO QUE SE SABE DEL ATLETA
// ---------------------------------------------------------------------------

export interface PuntoSemana {
  semana: string;
  valor: number;
}

export interface Esfuerzo {
  metros: number;
  segundos: number;
}

/**
 * LO QUE LE PIDIERON. `porRepeticion` no está para escribir «se te rompe en la
 * cuarta»: está para DIBUJARLO. El sesgo tampoco se redacta — se ve en que la
 * barra divergente es más larga por un lado.
 */
export interface Pedido {
  evaluadas: number;
  dentro: number;
  fueraLento: number;
  fueraRapido: number;
}

export interface PuntoCansado {
  semana: string;
  costeSkm: number;
  parejas: number;
}

export interface CarreraObjetivo {
  nombre: string;
  dias: number;
  /** Sin base previa no se inventa un tiempo. Nulo = no se pinta cifra. */
  predichoS: number | null;
}

/**
 * EL VO₂MÁX ENTRA AQUÍ, Y NO EN PERFIL.
 *
 * Hoy vive escondido en `RendimientoSection` (Perfil), entre las zonas y las
 * marcas. Está mal colocado: en Perfil van las cosas que te DESCRIBEN, y el
 * VO₂máx contesta «¿estoy mejorando?», que es esta pantalla.
 *
 * Va de TITULAR de la prueba de forma, con el ritmo al mismo pulso de gráfico
 * debajo: el número que el atleta ya reconoce de su reloj, sostenido por la
 * señal que nosotros sí medimos en vez de estimar.
 *
 * Y NO entran ni el pulso en reposo ni la variabilidad: son señales de
 * RECUPERACIÓN, no de forma corriendo. Mezclarlas aquí juntaría dos preguntas
 * distintas y esta pantalla contesta una.
 */
export interface Vo2 {
  valor: number;
  /** Contra el mismo dato hace `ventanaSemanas`. Positivo = ha subido. */
  delta: number;
  ventanaSemanas: number;
  /** La serie, para la sombra de fondo. */
  serie: number[];
}

export interface Historia {
  semanas: number;
  zonasMedidas: boolean;
  conPulso: boolean;
  ppmReferencia: number;
  /** Declarada, no deducida: de ella sale el color de la serie, y el color es dato. */
  zonaReferencia: Zona | null;
  vo2: Vo2 | null;
  /** Ritmo (s/km) al pulso de referencia, semana a semana. */
  alPulso: PuntoSemana[];
  esfuerzos: Esfuerzo[];
  /** La sombra: los mismos esfuerzos hace un mes. Vacío = aún no hay contra qué. */
  esfuerzosAntes: Esfuerzo[];
  /** Kilómetros por semana. */
  semanasKm: PuntoSemana[];
  zonasS: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>>;
  segundosCorriendo: number;
  pedido: Pedido | null;
  cansado: PuntoCansado[];
  carrera: CarreraObjetivo | null;
  mismoTipo: { tipo: string; ganaSkm: number } | null;
}

// ---------------------------------------------------------------------------
// LA ESCALERA DE EVIDENCIA — de qué sale el veredicto
// ---------------------------------------------------------------------------

/**
 * El veredicto usa la MEJOR señal que el atleta tenga hoy, no una sola:
 *
 *  1. Ritmo al mismo pulso — la única que aísla la forma del esfuerzo.
 *  2. Mejores esfuerzos contra la sombra — menos limpia, hecho duro.
 *  3. Ritmo medio del mismo tipo de sesión — degradada, pero honesta.
 *
 * Sin ninguna no se improvisa un cuarto: se dice que aún no.
 */
export type Peldano =
  | { en: 'al-pulso'; ganaSkm: number; semanas: number }
  | { en: 'esfuerzos'; ganaS: number; metros: number }
  | { en: 'mismo-tipo'; ganaSkm: number; semanas: number };

export type ClaseVeredicto = 'mejor' | 'igual' | 'cargando' | 'peor' | 'aun-no';

export interface Veredicto {
  clase: ClaseVeredicto;
  /** Dos o tres palabras. Lo que antes lo explicaba debajo se dibuja o no está. */
  frase: string;
  peldano: Peldano | null;
  /** Solo en «aún no»: el plazo, para dibujarlo como barra que se llena. */
  plazo: { llevas: number; hacen: number } | null;
}

const TONO: Record<ClaseVeredicto, string> = {
  mejor: 'var(--twin-ok)',
  igual: 'var(--twin-fg)',
  // Aviso, no alarma: el rojo se reserva para lo que hay que atender hoy.
  cargando: 'var(--twin-warning)',
  peor: 'var(--twin-warning)',
  'aun-no': 'var(--twin-muted)',
};

export function tonoDe(c: ClaseVeredicto): string {
  return TONO[c];
}

function ganancia(serie: PuntoSemana[]): number {
  if (serie.length < 2) return 0;
  return serie[0]!.valor - serie[serie.length - 1]!.valor;
}

/** Subida del volumen: últimas dos semanas contra la media de las cuatro primeras. */
export function subidaDeVolumen(semanas: PuntoSemana[]): number {
  if (semanas.length < 4) return 0;
  const base = semanas.slice(0, 4).reduce((a, s) => a + s.valor, 0) / 4;
  if (base <= 0) return 0;
  const ultimas = semanas.slice(-2).reduce((a, s) => a + s.valor, 0) / Math.min(2, semanas.length);
  return ultimas / base - 1;
}

export function peldanoDisponible(h: Historia): Peldano | null {
  if (h.conPulso && h.zonasMedidas && h.alPulso.length >= 3) {
    // N puntos semanales abarcan N-1 semanas: el primero es el origen, no un salto.
    return { en: 'al-pulso', ganaSkm: ganancia(h.alPulso), semanas: h.alPulso.length - 1 };
  }
  const comunes = h.esfuerzos
    .filter((e) => h.esfuerzosAntes.some((a) => a.metros === e.metros))
    .sort((a, b) => b.metros - a.metros);
  const hoy = comunes[0];
  if (hoy) {
    const antes = h.esfuerzosAntes.find((a) => a.metros === hoy.metros)!;
    return { en: 'esfuerzos', ganaS: antes.segundos - hoy.segundos, metros: hoy.metros };
  }
  if (h.mismoTipo) {
    return { en: 'mismo-tipo', ganaSkm: h.mismoTipo.ganaSkm, semanas: Math.max(1, h.semanasKm.length - 1) };
  }
  return null;
}

export function veredictoDe(h: Historia, m: Metodo = METODO): Veredicto {
  const peldano = peldanoDisponible(h);

  if (!peldano || h.semanas < m.semanasParaAfirmar) {
    return {
      clase: 'aun-no',
      frase: 'Aún no',
      peldano,
      plazo: { llevas: h.semanas, hacen: m.semanasParaAfirmar },
    };
  }

  const gana = peldano.en === 'esfuerzos' ? peldano.ganaS : peldano.ganaSkm;
  const subida = subidaDeVolumen(h.semanasKm);

  if (gana >= m.mejoraMinimaSkm) return { clase: 'mejor', frase: 'Vas mejor', peldano, plazo: null };

  // EL INCÓMODO. Volumen subiendo y motor respondiendo peor es la firma clásica
  // de estar metiendo más de lo que se asimila. La DETECCIÓN es mecanismo; los
  // dos umbrales que la disparan son método.
  if (gana <= -m.mejoraMinimaSkm && subida >= m.subidaQueAvisa) {
    return { clase: 'cargando', frase: 'Cargando de más', peldano, plazo: null };
  }
  if (gana <= -m.mejoraMinimaSkm) return { clase: 'peor', frase: 'Vas más lento', peldano, plazo: null };

  return { clase: 'igual', frase: 'Te mantienes', peldano, plazo: null };
}

// ---------------------------------------------------------------------------
// La cobertura de cada lectura
// ---------------------------------------------------------------------------

export interface Cobertura {
  forma: Falta | null;
  esfuerzos: Falta | null;
  volumen: Falta | null;
  reparto: Falta | null;
  pedido: Falta | null;
  cansado: Falta | null;
}

export function coberturaDe(h: Historia, m: Metodo = METODO): Cobertura {
  const historia: Falta = { por: 'historia', llevas: h.semanas, hacen: m.semanasParaAfirmar };

  return {
    // El sensor primero: pedirle el test cuando lo que le falta es la cinta del
    // pecho sería mandarle al sitio equivocado.
    forma: !h.conPulso ? { por: 'sensor' } : !h.zonasMedidas ? { por: 'ancla' } : h.alPulso.length < 3 ? historia : null,
    esfuerzos: h.esfuerzos.length === 0 ? historia : null,
    volumen: h.semanasKm.length === 0 ? historia : null,
    reparto: !h.zonasMedidas ? { por: 'ancla' } : h.segundosCorriendo <= 0 ? historia : null,
    pedido: h.pedido == null ? { por: 'intencion' } : null,
    cansado:
      h.cansado.length === 0
        ? { por: 'ocasion' }
        : h.cansado.reduce((a, c) => Math.max(a, c.parejas), 0) < m.parejasMinimasCansado
          ? historia
          : null,
  };
}

/** Con pocas repeticiones el porcentaje existe pero no se puede juzgar. */
export function sePuedeJuzgarElPedido(p: Pedido, m: Metodo = METODO): boolean {
  return p.evaluadas >= m.repeticionesParaJuzgar;
}

/** El colapso a tres cubos. Sale de la barra, para que texto y dibujo no discrepen. */
export function colapso(segmentos: { zona: number | null; pct: number }[]) {
  const suma = (zonas: number[]) => segmentos.filter((s) => s.zona != null && zonas.includes(s.zona)).reduce((a, s) => a + s.pct, 0);
  return { suave: suma([1, 2]), medio: suma([3]), fuerte: suma([4, 5]) };
}
