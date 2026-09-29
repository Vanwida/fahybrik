// LAS FRASES QUE DICE EL PÓSTER, puras y probadas. La vista no escribe copy con
// condiciones: pregunta aquí qué toca decir para cada estado del predicho, y así
// el mismo texto sirve a la pantalla y al lector de pantalla (que dice lo mismo
// que se ve, ni más ni menos).

import type { Formato, Prediccion, TipoEvento } from './contrato';
import { listaCorta } from './decide';
import { reloj, relojCarrera, unidadDias } from './formato';

export interface TextoPredicho {
  etiqueta: string;
  /** La cifra o la frase corta que ocupa el sitio de la cifra. Null = solo hay frase. */
  valor: string | null;
  valorEsCifra: boolean;
  /** Lo que se dice debajo. Null = nada más que decir. */
  frase: string | null;
  /** La marca que acompaña a la frase: por delante (ok) o por detrás (aviso) del objetivo. */
  marca: 'ok' | 'aviso' | null;
  /** Tramos medidos de los que hay, para la regleta. */
  regleta: { n: number; de: number } | null;
  /** Hay un «Reintentar» dentro del panel. */
  reintentar: boolean;
  /** Se pinta el esqueleto de este panel. */
  esqueleto: boolean;
}

const base: TextoPredicho = {
  etiqueta: 'Predicho hoy',
  valor: null,
  valorEsCifra: false,
  frase: null,
  marca: null,
  regleta: null,
  reintentar: false,
  esqueleto: false,
};

export interface ContextoPredicho {
  principal: boolean;
  tipoEvento: TipoEvento;
  formato: Formato;
  metaS: number | null;
}

/** El hueco entre el predicho y el objetivo, dicho como se habla («por delante», «te faltan»). */
export function fraseHueco(huecoS: number): { frase: string; marca: 'ok' | 'aviso' | null } {
  if (huecoS < 0) return { frase: `Vas ${reloj(-huecoS)} por delante de tu objetivo`, marca: 'ok' };
  if (huecoS > 0) return { frase: `Te faltan ${reloj(huecoS)} para tu objetivo`, marca: 'aviso' };
  return { frase: 'Justo en tu objetivo', marca: null };
}

export function textoPredicho(p: Prediccion, ctx: ContextoPredicho): TextoPredicho {
  const equipo = ctx.formato !== 'singles';
  const con = (pareja?: string) => (pareja ? `Predicho hoy · con ${pareja}` : equipo ? 'Predicho hoy · pareja' : 'Predicho hoy');
  switch (p.tipo) {
    case 'cargando':
      return { ...base, esqueleto: true };
    case 'error':
      return { ...base, valor: 'No disponible', frase: 'No pudimos calcularlo. Inténtalo de nuevo.', reintentar: true };
    case 'no-aplica':
      if (!ctx.principal) {
        return { ...base, frase: 'Se calcula para tu objetivo principal. Hazla principal y lo verás aquí.' };
      }
      return {
        ...base,
        etiqueta: 'Tu objetivo',
        frase: 'El desglose por estaciones es solo de HYROX: para esta carrera el plan se ancla a la fecha.',
      };
    case 'sin-meta':
      return { ...base, etiqueta: 'Tu objetivo', valor: 'Sin tiempo fijado', frase: 'Fija a qué tiempo vas y verás tu predicho de hoy, estación a estación.' };
    case 'sin-pareja':
      return { ...base, etiqueta: 'Predicho hoy · pareja', valor: 'Sin pareja conectada', frase: 'Con tu pareja conectada verás aquí el predicho conjunto, tramo a tramo.' };
    case 'sin-datos':
      return { ...base, etiqueta: con(p.pareja), valor: 'Aún sin datos', frase: 'Entrena estaciones o importa una carrera y el predicho aparece solo.' };
    case 'parcial':
      return {
        ...base,
        etiqueta: con(p.pareja),
        valor: 'Aún sin cifra',
        frase: `${p.medidos} de ${p.de} tramos medidos. Te ${p.faltan.length === 1 ? 'falta' : 'faltan'} ${listaCorta(p.faltan)}.`,
        regleta: { n: p.medidos, de: p.de },
      };
    case 'cifra': {
      const hueco = p.huecoS == null ? null : fraseHueco(p.huecoS);
      return { ...base, etiqueta: con(p.pareja), valor: relojCarrera(p.totalS), valorEsCifra: true, frase: hueco?.frase ?? null, marca: hueco?.marca ?? null };
    }
  }
}

/** La cuenta atrás: una cifra y su unidad, o «Hoy» sin unidad. */
export function textoCuenta(dias: number | null): { cifra: string; unidad: string | null } | null {
  if (dias == null) return null;
  if (dias <= 0) return { cifra: 'Hoy', unidad: null };
  return { cifra: String(dias), unidad: unidadDias(dias) };
}

/** El texto que lee el lector de pantalla de un panel de predicho: lo mismo que se ve. */
export function vozPredicho(t: TextoPredicho): string {
  if (t.esqueleto) return 'Calculando tu predicho';
  return [t.etiqueta, t.valor, t.frase].filter(Boolean).join('. ');
}
