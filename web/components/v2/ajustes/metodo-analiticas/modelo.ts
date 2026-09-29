// Borrador (strings con coma decimal) ↔ método, y los helpers de la escalera de
// carga y del conjunto de familias. Puro: sin React, sin red. Lo comparten el
// componente y sus tests.
//
// POR QUÉ EL CANDIDATO SE CONSTRUYE POR GRUPO, NO DE GOLPE: las claves
// numéricas viven en varios grupos visuales independientes. Si «candidatoDe»
// exigiera el borrador de todas a la vez, un campo roto y abandonado en un
// grupo bloquearía el guardado de CUALQUIER OTRO grupo para siempre. Por eso
// solo se leen del borrador las claves que de verdad se están confirmando
// (un grupo, o un único campo con «Usar X»); el resto sale de `vigente` — el
// último método ya guardado, siempre válido. Las reglas que cruzan campos
// (`validarMetodoAnalitico`) nunca cruzan dos grupos distintos (comprobado
// campo a campo contra `catalogo.ts`; lo fija el test de `metodo-analiticas`),
// así que este recorte nunca esconde un error real.

import { analyticsMethodSchema } from '@fahybrid/shared/domain/methodology/method-editors';
import {
  ANALYTICS_METHOD_BOUNDS,
  FUENTES_ADMISIBLES,
  type ClaveNumericaMetodo,
  type CoachAnalyticsMethod,
  type FuenteCarga,
  type ModalidadCarga,
} from '@fahybrid/shared/domain/analytics/metodo';
import { FAMILIAS, type Familia } from '@fahybrid/shared/domain/analytics/lectura';
import { ESTADOS_FRESCURA, ESTADO_FRESCURA_ES } from '@fahybrid/shared/domain/analytics/forma';
import { DESCRIPTORES_METODO_ANALITICO } from './catalogo';
import { CAMPOS_POR_GRUPO, type GrupoId } from './descriptores';

/** El borrador de los campos NUMÉRICOS: cada uno como texto, en su escala de PRESENTACIÓN. */
export type BorradorMetodoAnalitico = Record<ClaveNumericaMetodo, string>;

/** Las claves numéricas de cada grupo (sin escaleras, familias ni desplegable), para el commit por grupo. */
export const CLAVES_NUMERICAS_POR_GRUPO: Record<GrupoId, ClaveNumericaMetodo[]> = Object.fromEntries(
  (Object.keys(CAMPOS_POR_GRUPO) as GrupoId[]).map((id) => [
    id,
    CAMPOS_POR_GRUPO[id].filter((c) => DESCRIPTORES_METODO_ANALITICO[c].tipo === 'numero') as ClaveNumericaMetodo[],
  ]),
) as Record<GrupoId, ClaveNumericaMetodo[]>;

/** ¿Algún campo de este grupo se sale de su defecto? Para abrir un grupo plegado que ya trae ajuste propio. */
export function grupoDifiereDeDefecto(grupo: GrupoId, m: CoachAnalyticsMethod, defectos: CoachAnalyticsMethod): boolean {
  return CAMPOS_POR_GRUPO[grupo].some((clave) => JSON.stringify(m[clave]) !== JSON.stringify(defectos[clave]));
}

export type Problema = { clave: string | null; mensaje: string };
export type ResultadoCandidato = { ok: true; method: CoachAnalyticsMethod } | { ok: false; problemas: Problema[] };

/** Redondea a una precisión razonable para borrar el ruido de coma flotante (p. ej. 1,1 × 60). */
function redondear(n: number, decimales = 6): number {
  const factor = 10 ** decimales;
  return Math.round(n * factor) / factor;
}

/** Un número con coma decimal, al número de decimales del campo (sin ceros de relleno). */
export function formatearNumero(n: number, decimales: number): string {
  return String(redondear(n, decimales)).replace('.', ',');
}

function escalaDe(clave: ClaveNumericaMetodo): number {
  const d = DESCRIPTORES_METODO_ANALITICO[clave];
  return d.tipo === 'numero' && d.escalaDivisor ? d.escalaDivisor : 1;
}

function decimalesDe(clave: ClaveNumericaMetodo): number {
  const d = DESCRIPTORES_METODO_ANALITICO[clave];
  return d.tipo === 'numero' ? d.decimales : 0;
}

/** El borrador completo (todas las claves numéricas) a partir de un método guardado. */
export function draftOf(m: CoachAnalyticsMethod): BorradorMetodoAnalitico {
  const out = {} as BorradorMetodoAnalitico;
  for (const clave of Object.keys(DESCRIPTORES_METODO_ANALITICO) as Array<keyof CoachAnalyticsMethod>) {
    const d = DESCRIPTORES_METODO_ANALITICO[clave];
    if (d.tipo !== 'numero') continue;
    const k = clave as ClaveNumericaMetodo;
    out[k] = formatearNumero((m[k] as number) / escalaDe(k), d.decimales);
  }
  return out;
}

/** El mensaje de rango en la escala que ve el coach (minutos, no segundos guardados). */
function mensajeRangoMostrado(clave: ClaveNumericaMetodo): string {
  const b = ANALYTICS_METHOD_BOUNDS[clave];
  const divisor = escalaDe(clave);
  const decimales = decimalesDe(clave);
  return `Entre ${formatearNumero(b.min / divisor, decimales)} y ${formatearNumero(b.max / divisor, decimales)}.`;
}

/** Valida un método ya construido (tipos correctos) contra el esquema compartido con la API. */
export function validarCandidato(m: CoachAnalyticsMethod): ResultadoCandidato {
  const parsed = analyticsMethodSchema.safeParse(m);
  if (parsed.success) return { ok: true, method: parsed.data };
  const problemas: Problema[] = parsed.error.issues.map((issue) => {
    const clave = issue.path.length > 0 ? String(issue.path[0]) : null;
    // El único issue con path sobre un campo numérico es el de numeroAcotado
    // (min/max): en los dos campos con escala de minutos, se re-expresa en esa
    // escala para no decirle al coach «entre 60 y 600» cuando escribió minutos.
    const escalado = clave != null && escalaDe(clave as ClaveNumericaMetodo) !== 1;
    return { clave, mensaje: escalado ? mensajeRangoMostrado(clave as ClaveNumericaMetodo) : issue.message };
  });
  return { ok: false, problemas };
}

/**
 * El candidato a partir de un borrador PARCIAL (solo las claves que se están
 * confirmando ahora) más el método vigente para todo lo demás. Acepta coma o
 * punto decimal; aplica la escala de presentación antes de validar.
 */
export function candidatoDe(borrador: Partial<BorradorMetodoAnalitico>, vigente: CoachAnalyticsMethod): ResultadoCandidato {
  const claves = Object.keys(borrador) as ClaveNumericaMetodo[];
  const overrides: Partial<Record<ClaveNumericaMetodo, number>> = {};
  const problemas: Problema[] = [];
  for (const clave of claves) {
    const texto = borrador[clave];
    if (texto == null) continue;
    const n = Number(texto.trim().replace(',', '.'));
    if (!Number.isFinite(n)) {
      problemas.push({ clave, mensaje: 'Escribe un número.' });
      continue;
    }
    overrides[clave] = redondear(n * escalaDe(clave));
  }
  if (problemas.length > 0) return { ok: false, problemas };
  return validarCandidato({ ...vigente, ...overrides });
}

// ── Los peldaños de una escalera ────────────────────────────────────────────

export function subirPeldano<T>(lista: readonly T[], indice: number): T[] {
  if (indice <= 0 || indice >= lista.length) return [...lista];
  const copia = [...lista];
  [copia[indice - 1], copia[indice]] = [copia[indice]!, copia[indice - 1]!];
  return copia;
}

export function bajarPeldano<T>(lista: readonly T[], indice: number): T[] {
  return subirPeldano(lista, indice + 1);
}

/** Nunca deja una escalera vacía: con un solo peldaño, quitar no hace nada. */
export function quitarPeldano<T>(lista: readonly T[], indice: number): T[] {
  if (lista.length <= 1) return [...lista];
  return lista.filter((_, i) => i !== indice);
}

/** Añade al final; no-op si ya está o si esa modalidad no puede preciar por esa fuente. */
export function anadirPeldano(lista: readonly FuenteCarga[], modalidad: ModalidadCarga, fuente: FuenteCarga): FuenteCarga[] {
  if (lista.includes(fuente) || !FUENTES_ADMISIBLES[modalidad].includes(fuente)) return [...lista];
  return [...lista, fuente];
}

/** Los peldaños admisibles de una modalidad que la escalera aún no lista, en el orden del vocabulario. */
export function peldanosDisponibles(lista: readonly FuenteCarga[], modalidad: ModalidadCarga): FuenteCarga[] {
  return FUENTES_ADMISIBLES[modalidad].filter((f) => !lista.includes(f));
}

// ── El conjunto de familias ─────────────────────────────────────────────────

/**
 * Añade o quita una familia. Nunca deja el conjunto vacío (el reparto necesita
 * al menos una) y lo devuelve siempre en el orden del vocabulario, para que un
 * mismo conjunto se guarde y se compare igual sin importar el orden de clics.
 */
export function alternarFamilia(lista: readonly Familia[], familia: Familia): Familia[] {
  const siguiente = lista.includes(familia) ? lista.filter((f) => f !== familia) : [...lista, familia];
  if (siguiente.length === 0) return [...lista];
  return FAMILIAS.filter((f) => siguiente.includes(f));
}

// ── La lectura en vivo de las cinco bandas de frescura ──────────────────────

/** Formatea un negativo con el signo menos tipográfico, como en el resto de analíticas. */
function conSigno(n: number): string {
  const r = Math.round(n);
  return r < 0 ? `−${Math.abs(r)}` : String(r);
}

/**
 * «Pasado de carga ≤ −30 · Construyendo −29 a −11 · … · Recargando ≥ 30» — los
 * cinco tramos resultantes de los cuatro cortes, con los mismos nombres que ve
 * el atleta (`ESTADO_FRESCURA_ES`, una sola fuente).
 */
export function formatearBandasFrescura(sobrecarga: number, optimo: number, mantener: number, fresco: number): string {
  const cortes = [sobrecarga, optimo, mantener, fresco];
  return ESTADOS_FRESCURA.map((estado, i) => {
    const etiqueta = ESTADO_FRESCURA_ES[estado].etiqueta_es;
    if (i === 0) return `${etiqueta} ≤ ${conSigno(cortes[0]!)}`;
    if (i === cortes.length) return `${etiqueta} ≥ ${conSigno(cortes[i - 1]! + 1)}`;
    return `${etiqueta} ${conSigno(cortes[i - 1]! + 1)} a ${conSigno(cortes[i]!)}`;
  }).join(' · ');
}
