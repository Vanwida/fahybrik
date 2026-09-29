// RENDIMIENTO: LAS CINCO FILAS, RESUELTAS SIN PINTAR NADA.
//
// Port de `RendimientoEstados` (ios/FAHYBRIK/Profile/RendimientoSection.swift):
// dónde están todas las decisiones que importan (qué es un contador y qué un
// valor medido, cuándo un hueco se declara y cuándo se calla, qué es «no hay
// dato» y qué «todavía no lo sé»), más la que Swift no tiene: la fuente que NO
// contestó. Puro y con test (web/tests/design-twin/perfil-rehecho.test.ts).

import { esDecimal } from '../kit-composicion/formato';
import type { Fila, Fuente, LecturaPerfil } from './contrato';
import { unir } from './texto';

/** Kilos sin decimal inútil: `245` o `186,7`. La unidad la pone quien llama. */
export const cifraKg = (v: number) => (Number.isInteger(v) ? String(v) : esDecimal(v));

// ---------------------------------------------------------------------------
// Rendimiento (port de RendimientoEstados)
// ---------------------------------------------------------------------------

/**
 * Lo que una fila sabe de su fuente. `contesto` se resuelve con `f`; lo que no ha
 * contestado nunca se convierte en cifra ni en invitación.
 */
function conFuente<V>(f: Fuente<V>, resolver: (v: V) => Pick<Fila, 'estado' | 'logrado'> & { pideActo?: boolean }) {
  if (f.tipo === 'cargando') return { estado: { tipo: 'cargando' as const }, logrado: false, pideActo: false };
  if (f.tipo === 'sin-respuesta') return { estado: { tipo: 'sin-respuesta' as const }, logrado: false, pideActo: false };
  const r = resolver(f.valor);
  return { ...r, pideActo: r.pideActo ?? false };
}

/**
 * Las filas que SE PINTAN, en su orden. Con coach son cinco; sin coach, tres: no
 * se le enseñan ni tests ni zonas (las calibra su coach) y un contador que las
 * incluyera prometería dos huecos que en su app no existen.
 *
 * Coherencia con la lectura: en frío TODAS son `cargando` (los valores de relleno
 * no se leen) y con la identidad caída las zonas —que viajan dentro de ella— no
 * pueden contestar.
 */
export function filasRendimiento(l: LecturaPerfil): Fila[] {
  const r = l.rendimiento;
  const enFrio = l.cargando;

  const tests: Fila = {
    clave: 'tests',
    etiqueta: 'Tests',
    ...(enFrio
      ? { estado: { tipo: 'cargando' }, logrado: false, pideActo: false }
      : conFuente(r.bateria, (b) => {
          // Sin batería programada no hay contador que enseñar Y no hay acto que el
          // atleta pueda hacer: los tests los programa su coach. Se dice; jamás «0 de 0».
          if (!b || b.total <= 0) {
            return {
              estado: { tipo: 'vacio', invitacion: 'Tu coach los programa y aparecen aquí', salida: null },
              logrado: false,
            };
          }
          const base = b.completados === 1 ? 'calibrado' : 'calibrados';
          return {
            estado: {
              tipo: 'valor',
              cifra: String(b.completados),
              sufijo: `de ${b.total}`,
              pie: b.aMedias > 0 ? unir(base, `${b.aMedias} sin resultado`) : base,
              avance: { n: b.completados, m: b.total },
            },
            logrado: b.completados > 0 || b.aMedias > 0,
            pideActo: b.completados < b.total,
          };
        })),
  };

  const marcas: Fila = {
    clave: 'marcas',
    etiqueta: 'Marcas',
    ...(enFrio
      ? { estado: { tipo: 'cargando' }, logrado: false, pideActo: false }
      : conFuente(r.marcas, (m) =>
          m.catalogo <= 0
            ? { estado: { tipo: 'vacio', invitacion: 'Aún no hay marcas que probar', salida: null }, logrado: false }
            : {
                estado: {
                  tipo: 'valor',
                  cifra: String(m.conRecord),
                  sufijo: `de ${m.catalogo}`,
                  pie: 'con récord',
                  avance: { n: m.conRecord, m: m.catalogo },
                },
                logrado: m.conRecord > 0,
              },
        )),
  };

  const vo2: Fila = {
    clave: 'vo2',
    etiqueta: 'VO₂ máx',
    ...(enFrio
      ? { estado: { tipo: 'cargando' }, logrado: false, pideActo: false }
      : conFuente(r.vo2, (v) =>
          v === null
            ? {
                estado: { tipo: 'vacio', invitacion: 'Lo trae tu reloj, o el Cooper de 12 min', salida: 'Cómo medirlo' },
                logrado: false,
              }
            : {
                estado: {
                  tipo: 'valor',
                  cifra: esDecimal(v.valor),
                  sufijo: null,
                  pie: unir('ml/kg/min', v.fuente === 'reloj' ? 'tu reloj' : 'tu Cooper'),
                  avance: null,
                },
                logrado: true,
              },
        )),
  };

  const zonas: Fila = {
    clave: 'zonas',
    etiqueta: 'Zonas de FC',
    ...(enFrio
      ? { estado: { tipo: 'cargando' }, logrado: false, pideActo: false }
      : conFuente(l.errorCarga ? { tipo: 'sin-respuesta' } : r.zonas, (z) =>
          // Sin ancla no hay zonas, y no se inventa ninguna. La invitación dice los DOS
          // actos que las calculan (MyZonesView): la fecha de nacimiento da una primera
          // estimación; el test de umbral, las de verdad.
          z === null
            ? {
                estado: {
                  tipo: 'vacio',
                  invitacion: 'Tu edad o un test de umbral las calculan',
                  salida: 'Cómo tenerlas',
                },
                logrado: false,
              }
            : {
                estado: {
                  tipo: 'valor',
                  cifra: String(z.umbralPpm),
                  sufijo: 'ppm',
                  // SIEMPRE el origen que escribe el servidor: un umbral inferido no puede leerse como medido.
                  pie: z.origen,
                  avance: null,
                },
                logrado: true,
              },
        )),
  };

  const fuerza: Fila = {
    clave: 'fuerza',
    etiqueta: 'Fuerza',
    ...(enFrio
      ? { estado: { tipo: 'cargando' }, logrado: false, pideActo: false }
      : conFuente(r.fuerza, (lista) => {
          if (lista.length === 0) {
            return {
              estado: { tipo: 'vacio', invitacion: 'Un test de peso y repeticiones calcula tu 1RM', salida: 'Registrar un test' },
              logrado: false,
            };
          }
          // El más pesado abre la fila y el pie dice CUÁL es: «245 kg» sin decir de qué
          // levantamiento habla no es un dato.
          const top = lista.reduce((a, b) => (b.kg > a.kg ? b : a));
          return {
            estado: {
              tipo: 'valor',
              cifra: cifraKg(top.kg),
              sufijo: 'kg',
              pie: unir(top.etiqueta.toLowerCase(), lista.length === 1 ? '1 levantamiento' : `${lista.length} levantamientos`),
              avance: null,
            },
            logrado: true,
          };
        })),
  };

  return l.conCoach ? [tests, marcas, vo2, zonas, fuerza] : [marcas, vo2, fuerza];
}

/**
 * «3 de 5 con dato»: cuántas de las filas VISIBLES tienen algo del atleta. Se
 * calla mientras una fuente esté en el aire o haya fallado: un recuento con una
 * pieza desconocida sería un número que miente o que cambia solo bajo el pulgar.
 */
export function lineaRendimiento(filas: Fila[]): string | null {
  if (filas.some((f) => f.estado.tipo === 'cargando' || f.estado.tipo === 'sin-respuesta')) return null;
  return `${filas.filter((f) => f.logrado).length} de ${filas.length} con dato`;
}

/**
 * Si NINGUNA fuente contestó (sin red en frío), la sección no son tres o cinco
 * teselas de error: es una sola frase que dice por qué y dónde está la salida.
 */
export function rendimientoSinRespuesta(filas: Fila[]): boolean {
  return filas.length > 0 && filas.every((f) => f.estado.tipo === 'sin-respuesta');
}

