// LO QUE MUESTRA EL DESCANSO — de lo anotado y del plan a las vistas de `caras.ts`.
// PURAS: el vivo las llama en cada pintado y los exámenes las recorren sin DOM.
//
//   vistaAnotarDe      la serie que se anota: sus datos (con su estado: propuesto
//                      o declarado), el foco, la pista de la cascada y el pulso.
//   resumenDeDescanso  lo anotado para el descanso ya cerrado, de más a menos
//                      largo: «✓ 8 × 125 kg · RIR 3», «✓ ronda 1 anotada» o «sin
//                      confirmar» (la anotación se cerró con algo propuesto).
//
// Qué NO hacer: llamar «anotado» a lo propuesto; pintar el marco del foco
// mientras viven los 5 s de deshacer (los botones aún son los del deshacer).

import {
  faltaDe,
  fmtReloj,
  fmtValor,
  lineaPulso,
  pendiente,
  seriesDelDescanso,
  textoAnotacion,
  type Lecturas,
  type Paso,
  type PasoFuerza,
  type Registro,
} from '../../kit-reloj';
import type { CampoVista, ResumenDescanso, VistaAnotar } from './caras';
import { UI_VACIA, anotacionDeSerie, camposDelDescanso, datoDe, focoDe, type ContextoAnotar, type UiAnotar } from './modelo';
import { etiquetaCampo, pistaCascada } from './textos';

export function vistaAnotarDe(c: ContextoAnotar, registro: Registro, ui: UiAnotar, lecturas: Lecturas, paso: Paso, deshacer: boolean): VistaAnotar {
  const campos = camposDelDescanso(c.plan, c.i);
  const k = focoDe(ui.paso === c.pasoId ? ui : UI_VACIA, campos.length);
  const { j, campo } = campos[k]!;
  const serie = c.plan.pasos[j] as PasoFuerza;
  const anot = anotacionDeSerie(c, registro, j);
  const deSerie = campos.filter((x) => x.j === j);
  const vistos: CampoVista[] = deSerie.map((x) => {
    const d = datoDe(anot, x.campo)!;
    return { etiqueta: etiquetaCampo(serie, x.campo), valor: fmtValor(d.valor), estado: d.estado };
  });
  const faltan = vistos.filter((x) => x.estado === 'propuesto').length;
  const estado = faltan === 0 ? 'anotada ✓' : faltan === vistos.length ? 'sin confirmar' : `${faltan} sin confirmar`;
  return {
    cuenta: fmtReloj(Math.ceil(faltaDe(paso, lecturas) ?? 0)),
    nombre: [serie.posicion?.slot, serie.nombre].filter(Boolean).join(' · '),
    estado: `Serie ${serie.posicion?.serie?.n ?? ''} · ${estado}`,
    estadoCorto: estado,
    campos: vistos,
    foco: deshacer ? null : deSerie.findIndex((x) => x.campo === campo),
    pista: !deshacer && campo === 'kg' ? pistaCascada(c.plan, j, registro) : null,
    pulso: lecturas.ppm != null ? lineaPulso(paso, lecturas, null) : null,
  };
}

export function resumenDeDescanso(c: ContextoAnotar, registro: Registro): ResumenDescanso | null {
  const series = seriesDelDescanso(c.plan, c.i);
  if (series.length === 0) return null;
  const anots = series.map((j) => anotacionDeSerie(c, registro, j));
  if (anots.some(pendiente)) return { textos: ['sin confirmar'], atencion: true };
  const primera = c.plan.pasos[series[0]!] as PasoFuerza;
  if (series.length > 1) return { textos: [`✓ ronda ${primera.posicion?.serie?.n ?? ''} anotada`, '✓ anotada'], atencion: false };
  return {
    textos: [`✓ ${textoAnotacion(anots[0]!, primera.fuerza)}`, `✓ ${textoAnotacion(anots[0]!, primera.fuerza, false)}`, '✓ anotada'],
    atencion: false,
  };
}
