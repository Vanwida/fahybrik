// LOS HUECOS — qué se dice cuando un bloque está vacío, con poco dato o con
// dato viejo, y cuál es su salida. Un solo sitio para las cuatro familias de
// texto (A10): el bloque no escribe su prosa, la deriva de la FALTA y de los
// números. Así la portada del atleta y la ficha del coach dicen lo mismo
// ante el mismo hueco (A1), y una frase se cambia una vez.
//
// La salida sigue la ley del §6.2 bis: se declara cuando el atleta puede
// llenarlo con un acto concreto (la salida de `salidaDe`); si solo falta
// tiempo, se dibuja el plazo; si el dato es viejo, se dice desde cuándo y qué
// lo reanuda. Nunca una silueta muda.

import { salidaDe } from '@fahybrid/shared/domain/running/progress';
import type { Bloque, EstadoBloque, Falta, LecturaPanel } from './contrato';
import { diasDesde } from './mecanismo';
import type { MetodoAnaliticas } from './metodo';
import type { SalidaHueco } from './piezas';

export interface TextoHueco {
  titulo: string;
  cuerpo: string;
  salida: SalidaHueco;
  plazo?: { llevas: number; hacen: number };
}

const VACIO: Record<Bloque, { titulo: string; cuerpo: string; accion: string }> = {
  estado: { titulo: 'Sin carga todavía', cuerpo: 'Tu estado sale de la carga de tus entrenos. Con el primero ya aparece.', accion: 'Empezar un entreno' },
  forma: { titulo: 'Tu forma aparece con los entrenos', cuerpo: 'Cada entreno con esfuerzo, ritmo o pulso suma carga. Con seis semanas la curva es fiable; con una ya se ve algo.', accion: 'Empezar un entreno' },
  semanas: { titulo: 'Nada hecho todavía', cuerpo: 'Aquí verás cada semana lo que tenías que hacer y lo que hiciste, por familia.', accion: 'Ver mi plan' },
  intensidad: { titulo: 'Sin tiempo en zonas', cuerpo: 'Las zonas salen de tu pulso. Con una banda o el reloj, cada entreno se reparte solo.', accion: 'Conectar banda de pulso' },
  progreso: { titulo: 'Sin marcas que seguir', cuerpo: 'Cada familia tiene su número clave: el ritmo umbral, el 2000 m, tu sentadilla. Salen con los primeros entrenos.', accion: 'Empezar un entreno' },
  records: { titulo: 'Todavía sin récords', cuerpo: 'Tu primera marca de cada prueba será un récord. Aquí se quedan todos, de todas las familias.', accion: 'Empezar un entreno' },
  carrera: { titulo: 'Elige tu carrera', cuerpo: 'Con una carrera objetivo te decimos el tiempo previsto, el hueco por tramo y cómo llegas de fresco.', accion: 'Elegir carrera' },
  recuperacion: { titulo: 'Sin reloj conectado', cuerpo: 'La variabilidad, el pulso en reposo y el sueño los mide tu reloj cada noche.', accion: 'Conectar tu reloj' },
};

const VIEJO: Record<Bloque, { titulo: (dias: number) => string; cuerpo: string; accion: string }> = {
  estado: { titulo: (d) => `Sin entrenar desde hace ${d} días`, cuerpo: 'La fatiga ya cayó; la forma baja un poco cada día que pasa.', accion: 'Empezar un entreno' },
  forma: { titulo: (d) => `Último entreno hace ${d} días`, cuerpo: 'La curva sigue: la forma baja despacio y la frescura sube. Es lo que pasa al parar.', accion: 'Empezar un entreno' },
  semanas: { titulo: (d) => `Ninguna sesión en ${d} días`, cuerpo: 'Las últimas semanas están vacías. Si estás lesionado o de viaje, díselo a tu coach.', accion: 'Escribir a mi coach' },
  intensidad: { titulo: (d) => `Sin pulso desde hace ${d} días`, cuerpo: 'Lo último que se repartió por zonas es de hace semanas.', accion: 'Empezar un entreno' },
  progreso: { titulo: (d) => `Marcas de hace ${d} días o más`, cuerpo: 'Las tendencias se quedan donde estaban hasta que vuelvas.', accion: 'Empezar un entreno' },
  records: { titulo: (d) => `Sin marcas nuevas desde hace ${d} días`, cuerpo: 'Tus récords siguen aquí; el siguiente llega con el siguiente entreno.', accion: 'Empezar un entreno' },
  carrera: { titulo: (d) => `Previsión de hace ${d} días`, cuerpo: 'La previsión usa tus últimas marcas; sin entrenos nuevos no se mueve.', accion: 'Empezar un entreno' },
  recuperacion: { titulo: (d) => `Reloj sin sincronizar desde hace ${d} días`, cuerpo: 'Sin noches nuevas no hay contra qué leer tu basal.', accion: 'Sincronizar el reloj' },
};

/** Texto del bloque con poco dato, según la falta más frecuente entre sus lecturas. */
function poco(bloque: Bloque, faltas: Falta[], muestras: number, metodo: MetodoAnaliticas): TextoHueco {
  const historia = faltas.find((f): f is Extract<Falta, { por: 'historia' }> => f.por === 'historia');
  if (historia) {
    const hacen = bloque === 'forma' || bloque === 'estado' ? metodo.semanas_minimas_forma : historia.hacen;
    const cuerpoPor: Record<Bloque, string> = {
      estado: 'La palabra de hoy necesita semanas de carga detrás para no engañar.',
      forma: `La forma es una media de ${metodo.ctl_days} días: hasta las ${hacen} semanas sube por pura aritmética, no por ti.`,
      semanas: 'Con pocas semanas se ve lo hecho, pero todavía no una tendencia.',
      intensidad: 'El reparto por zonas se estabiliza con más sesiones.',
      progreso: `Cada familia necesita ${metodo.muestras_minimas} sesiones para decir si mejoras.`,
      records: 'Los primeros récords llegan con las primeras marcas.',
      carrera: 'La previsión se afina con cada marca nueva.',
      recuperacion: `La basal necesita ${metodo.hrv_min_nights_baseline} noches. Hasta entonces el delta mediría la basal, no a ti.`,
    };
    return {
      titulo: 'Todavía es pronto',
      cuerpo: cuerpoPor[bloque],
      salida: { tipo: 'espera', texto: 'Se llena solo con las semanas' },
      plazo: { llevas: Math.min(historia.llevas, hacen), hacen },
    };
  }
  const otra = faltas.find((f) => f.por !== 'historia');
  const accion = otra ? salidaDe(otra) : null;
  return {
    titulo: `${muestras} ${muestras === 1 ? 'sesión' : 'sesiones'} de momento`,
    cuerpo: `Con ${metodo.muestras_minimas} ya se ve la tendencia.`,
    salida: accion ? { tipo: 'accion', texto: accion } : { tipo: 'espera', texto: 'Se llena solo con las sesiones' },
  };
}

/** El texto del hueco de un bloque en un estado que no es «lleno». `ultimoDato` para los bloques que no son lecturas (récords, carrera). */
export function textoHueco(bloque: Bloque, estado: Exclude<EstadoBloque, 'lleno'>, lecturas: readonly LecturaPanel[], hoy: string, metodo: MetodoAnaliticas, ultimoDato: string | null = null): TextoHueco {
  const faltas = lecturas.map((l) => l.cobertura.falta).filter((f): f is Falta => f != null);
  if (estado === 'vacio') {
    const v = VACIO[bloque];
    // Si la falta tiene una salida concreta (reloj, banda, test), manda esa.
    const concreta = faltas.map(salidaDe).find((s) => s != null) ?? null;
    return { titulo: v.titulo, cuerpo: v.cuerpo, salida: { tipo: 'accion', texto: concreta ?? v.accion } };
  }
  if (estado === 'viejo') {
    const ultimos = lecturas.map((l) => l.cobertura.ultimo_dato).filter((x): x is string => x != null);
    if (ultimoDato) ultimos.push(ultimoDato);
    const masReciente = ultimos.length ? ultimos.reduce((a, b) => (a > b ? a : b)) : null;
    const dias = diasDesde(masReciente, hoy) ?? metodo.dato_viejo_dias;
    const v = VIEJO[bloque];
    return { titulo: v.titulo(dias), cuerpo: v.cuerpo, salida: { tipo: 'accion', texto: v.accion } };
  }
  const muestras = Math.max(0, ...lecturas.map((l) => l.cobertura.muestras));
  return poco(bloque, faltas, muestras, metodo);
}
