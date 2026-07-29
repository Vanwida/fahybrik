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
