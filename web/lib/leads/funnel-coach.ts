import type { Sql } from '@/lib/db';
import { COACH_FALLBACK_SUBJECT } from '@/lib/coach/voice';

/**
 * El coach dueño del EMBUDO PÚBLICO (fahybrid.com → /empieza → leads).
 *
 * Un lead entra por un ENLACE, y ese enlace tiene dueño. Hoy hay un solo embudo
 * público y su dueño se declara en el entorno con `FUNNEL_COACH_ID`; el día que
 * entre un segundo coach, su enlace llevará el identificador y esto leerá de ahí.
 *
 * NO HAY DEFECTO POR DESCARTE, y esto es lo importante de este módulo.
 * Hasta el 29-jul-2026 esto caía al `min(coaches.id)` cuando no había env. Eso es
 * ADIVINAR, y adivinar un dueño sale mal siempre: en producción el mínimo id es el
 * 4, una fila de desarrollo llamada «alexsole». Como número de cupo era invisible;
 * en un correo firmado habría sido un desconocido leyendo «— alexsole», y en un
 * `.ics` metido en su calendario para siempre.
 *
 * Así que: **configuración explícita o nada**. `null` significa «no se sabe de quién
 * es», que es un estado legítimo y NO se rellena por conveniencia.
 *
 * Qué hace cada consumidor con `null`:
 *   • atribución del lead → `coach_id` NULL = sin asignar, y alguien lo asigna a
 *     mano (migración 0147). Es el camino explícito para un lead no atribuible.
 *   • cupo / lista de espera → sin dueño no hay cupo que aplicar, así que NO se
 *     bloquea a nadie. Es la lectura que ya tenía `null` antes de este cambio.
 *     Se falla ABIERTO a propósito: el cupo es una comodidad del coach, pero la
 *     captura del lead es el negocio. Pasarse de aforo se ve y se corrige desde el
 *     panel; un atleta que rellena 19 pasos y recibe un error se pierde entero.
 *   • nombre en un correo → sin dueño no hay nombre, y la plantilla se lee igual
 *     de bien sin él (ver `lib/coach/voice.ts`).
 */
export async function funnelCoachId(): Promise<bigint | null> {
  const configured = process.env.FUNNEL_COACH_ID?.trim();
  if (!configured || !/^\d+$/.test(configured)) return null;
  return BigInt(configured);
}

/**
 * El nombre del coach dueño del embudo, para la parte pública donde TODAVÍA NO HAY LEAD
 * (la pantalla de bienvenida del onboarding: aún no ha dejado ni el email).
 *
 * En cuanto el lead existe se usa `coachNameForLead`, que lee la atribución grabada en su
 * fila. Esto es solo para el tramo anterior a esa fila.
 *
 * `null` cuando el embudo no tiene dueño declarado o el coach no tiene nombre puesto: la
 * copia se queda sin nombre y se lee igual. NUNCA lanza.
 */
export async function funnelCoachName(client: Sql): Promise<string | null> {
  try {
    const id = await funnelCoachId();
    if (id === null) return null;
    const rows = await client<{ full_name: string | null }[]>`
      select full_name from coaches where id = ${id as unknown as number} limit 1
    `;
    const name = rows[0]?.full_name?.trim();
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

/**
 * El nombre del coach de un lead YA CAPTURADO, para nombrarlo en un correo suyo.
 *
 * Lee `leads.coach_id` — la atribución que se grabó AL CAPTARLO (migración 0147),
 * no una deducción a posteriori. Mismo patrón que
 * `coachDisplayNameForAthlete`: un `join coaches` por fila y un sujeto neutro
 * cuando no hay nombre.
 *
 * Devuelve `COACH_FALLBACK_SUBJECT` cuando el lead no tiene dueño (sin asignar), el
 * coach no tiene nombre puesto, o el lead no existe. NUNCA lanza: esto se llama
 * dentro del argumento de un envío de correo, y una excepción aquí tumbaría el
 * envío entero por no saber un nombre.
 */
export async function coachNameForLead(client: Sql, lead_id: bigint): Promise<string> {
  try {
    const rows = await client<{ coach_name: string | null }[]>`
      select c.full_name as coach_name
      from leads l
      join coaches c on c.id = l.coach_id
      where l.id = ${lead_id as unknown as number}
      limit 1
    `;
    const name = rows[0]?.coach_name?.trim();
    return name && name.length > 0 ? name : COACH_FALLBACK_SUBJECT;
  } catch {
    return COACH_FALLBACK_SUBJECT;
  }
}
