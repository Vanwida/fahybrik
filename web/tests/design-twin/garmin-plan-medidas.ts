// LAS MEDIDAS DEL PLAN COMPACTO — cuánto pesa cada sesión en cada transporte.
//
// Decisión A/B del doc (docs/garmin-reloj/plan-compacto.md): se miden los DOS
// transportes sobre las mismas sesiones y con la MISMA secuencia de valores.
//
//   A · JSON de arrays numéricos posicionales con tabla de cadenas internadas:
//       {"v":1,"s":[…cadenas…],"d":[…valores…]}. Es la MEJOR versión posible de
//       A (una sola lista plana, sin claves ni sub-arrays por paso): si B gana
//       a esta, gana a cualquier JSON posicional por paso.
//   B · Binario de varints, en base64 dentro de {"v":1,"b":"…"}.
//
// El serializador de A vive solo aquí: tras la decisión no es producción (nada
// muerto en el kit). Se usa desde el examen y desde el script de medidas.

import { gzipSync } from 'node:zlib';
import type { PlanSesion } from '@/components/design-twin/kit-reloj/secuencia';
import { flujoDeSesion } from '@fahybrid/shared/domain/watch-plan/plan-compacto/codificar';
import { CLAVE_STORAGE_MAX_BYTES, MAX_PASOS, PRESUPUESTO_BYTES } from '@fahybrid/shared/domain/watch-plan/plan-compacto/formato';
import type { Flujo } from '@fahybrid/shared/domain/watch-plan/plan-compacto/flujo';
import type { MetaSesion } from '@fahybrid/shared/domain/watch-plan/plan-compacto/tipos';
import { aBase64, aBinario, envolver } from '@fahybrid/shared/domain/watch-plan/plan-compacto/transporte';

const utf8 = new TextEncoder();
const bytesDe = (s: string) => utf8.encode(s).length;

/** Transporte A: el flujo como JSON posicional plano. */
export function aJsonPosicional(f: Flujo): string {
  return JSON.stringify({ v: f.version, s: f.cadenas, d: f.tokens });
}

export interface MedidaSesion {
  pasos: number;
  /** Valores enteros del flujo (lo que un `Array` de Monkey C tendría que guardar en A). */
  valores: number;
  cadenas: number;
  /** Bytes UTF-8 de la tabla de cadenas dentro del binario. */
  bytesCadenas: number;
  /** Solo cabecera: el mismo plan sin pasos (zonas, reglas, vocabulario, método). */
  binarioCabecera: number;
  // Transporte B
  binario: number;
  base64: number;
  sobre: number;
  gzipSobre: number;
  // Transporte A
  json: number;
  gzipJson: number;
  cabe: boolean;
}

export function medirSesion(plan: PlanSesion, meta: MetaSesion): MedidaSesion {
  const { flujo } = flujoDeSesion(plan, meta);
  const binario = aBinario(flujo);
  const sobre = envolver(binario, flujo.version);
  const json = aJsonPosicional(flujo);
  const cabecera = aBinario(flujoDeSesion({ ...plan, pasos: [] }, meta).flujo);
  const base64 = aBase64(binario).length;
  return {
    pasos: plan.pasos.length,
    valores: flujo.tokens.length,
    cadenas: flujo.cadenas.length,
    bytesCadenas: flujo.cadenas.reduce((s, c) => s + bytesDe(c), 0),
    binarioCabecera: cabecera.length,
    binario: binario.length,
    base64,
    sobre: bytesDe(sobre),
    gzipSobre: gzipSync(sobre).length,
    json: bytesDe(json),
    gzipJson: gzipSync(json).length,
    cabe: binario.length <= PRESUPUESTO_BYTES && base64 <= CLAVE_STORAGE_MAX_BYTES && plan.pasos.length <= MAX_PASOS,
  };
}

export interface ResumenMedidas {
  n: number;
  mayor: { clave: string; bytes: number };
  media: number;
  /** Las dos sesiones más grandes en un mismo día (el peor día doble). */
  peorDiaDoble: number;
  /** Dos sesiones medias en un día. */
  diaDobleMedio: number;
  noCaben: string[];
}

export function resumir(medidas: Array<{ clave: string; m: MedidaSesion }>): ResumenMedidas {
  const porTamano = [...medidas].sort((a, b) => b.m.binario - a.m.binario);
  const suma = medidas.reduce((s, x) => s + x.m.binario, 0);
  const media = suma / medidas.length;
  return {
    n: medidas.length,
    mayor: { clave: porTamano[0]!.clave, bytes: porTamano[0]!.m.binario },
    media,
    peorDiaDoble: (porTamano[0]?.m.binario ?? 0) + (porTamano[1]?.m.binario ?? 0),
    diaDobleMedio: media * 2,
    noCaben: medidas.filter((x) => !x.m.cabe).map((x) => x.clave),
  };
}
