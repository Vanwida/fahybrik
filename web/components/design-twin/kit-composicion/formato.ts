// Un formateador por concepto (§2 del CONTRATO-UI). Estas cuatro pantallas no
// escriben ni un `toFixed` suelto: el 28-jul salieron seis funciones `clock` y
// tres grafías del ritmo por no tener esto.
//
// Vocabulario §3: español siempre. El pulso es **FC** y la unidad **ppm** —
// nunca «HR» ni «bpm», ni siquiera en un comentario de cara al atleta.

/** Decimales con coma española. `42.35` → `42,4`. */
export function esDecimal(v: number, decimales = 1): string {
  return v.toFixed(decimales).replace('.', ',');
}

/** Duración en reloj, sin cero delante: `312` → `5:12`; `4149` → `1:09:09`. */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dosDigitos(m)}:${dosDigitos(sec)}` : `${m}:${dosDigitos(sec)}`;
}

/** Carga en kilos: `186.7` → `186,7 kg`; `245` → `245 kg` (sin decimal inútil). */
export function kg(v: number): string {
  return Number.isInteger(v) ? `${v} kg` : `${esDecimal(v)} kg`;
}

/** Pulso — SIEMPRE ppm. */
export function ppm(v: number): string {
  return `${Math.round(v)} ppm`;
}

/** Ritmo de correr: segundos por km → `4:15/km`, sin espacio (§2). */
export function ritmoKm(segundosPorKm: number): string {
  return `${reloj(segundosPorKm)}/km`;
}

/** Ritmo de ergo: segundos por 500 m → `1:52/500m`, sin espacio y con la `m`. */
export function ritmo500(segundosPor500: number): string {
  return `${reloj(segundosPor500)}/500m`;
}

/** Distancia: `2000` → `2,00 km`; `450` → `450 m`. */
export function distancia(metros: number): string {
  return metros >= 1000 ? `${esDecimal(metros / 1000, 2)} km` : `${Math.round(metros)} m`;
}

/**
 * Antigüedad en lenguaje de gimnasio. Siempre acompaña a un dato viejo: la ley
 * del 28-jul dice que una FC en reposo nunca se enseña sin su edad.
 */
export function haceCuanto(dias: number): string {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 14) return 'hace 1 semana';
  if (dias < 31) return `hace ${Math.floor(dias / 7)} semanas`;
  if (dias < 61) return 'hace 1 mes';
  if (dias < 365) return `hace ${Math.floor(dias / 30)} meses`;
  return 'hace más de un año';
}

/** Delta con signo explícito: `+1,2` / `−0,4` (menos tipográfico, no guion). */
export function delta(v: number, decimales = 1): string {
  const signo = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${signo}${esDecimal(Math.abs(v), decimales)}`;
}

// ---------------------------------------------------------------------------
// Fecha corta y agregados — promovidos el 13-ago desde la tanda del hogar del
// running (§2.1 del contrato): tres pantallas escribieron su copia local el
// mismo día porque este fichero estaba bloqueado a agentes en paralelo, y una
// cuarta escribió el tiempo agregado con OTRA grafía (`8:10`). Este es el
// canónico; si ves una copia local de estos, es un duplicado: bórrala.
//
// La aritmética va sobre el string ISO (`YYYY-MM-DD`) en UTC a propósito: el
// huso horario del navegador no decide en qué día cae una carrera.
// ---------------------------------------------------------------------------

const DIAS_ABREV = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function partesISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

/** 1=lunes … 7=domingo. */
function diaSemanaISO(iso: string): number {
  const { y, m, d } = partesISO(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** «mar 11» — el día de una fila de listado. Sin mes: lo da su contexto. */
export function diaCorto(iso: string): string {
  const { d } = partesISO(iso);
  return `${DIAS_ABREV[diaSemanaISO(iso) - 1]} ${d}`;
}

/** «4 ago» — la voz de `FechaES.corta` de iOS (§2). */
export function fechaCorta(iso: string): string {
  const { m, d } = partesISO(iso);
  return `${d} ${MESES_ABREV[m - 1]}`;
}

/** «abr» — la marca de mes de un eje temporal. */
export function mesCorto(iso: string): string {
  const { m } = partesISO(iso);
  return MESES_ABREV[m - 1]!;
}

/**
 * Tiempo AGREGADO (el total de un periodo): `8h 10min` · `42 min`. Distinto de
 * `reloj()`, que es la duración de UN esfuerzo — un total de mes en formato
 * cronómetro (`40:12:33`) se lee como una carrera imposible, no como un mes.
 */
export function horasYMin(segundos: number): string {
  const totalMin = Math.round(segundos / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

/** Millar con punto español: `1234` → `1.234`. Para km y desnivel acumulados. */
export function conMillar(n: number): string {
  const v = Math.round(Math.max(0, n));
  if (v < 1000) return String(v);
  return `${Math.floor(v / 1000)}.${String(v % 1000).padStart(3, '0')}`;
}
