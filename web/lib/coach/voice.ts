// Cómo se NOMBRA al coach en algo que lee un atleta o un lead.
//
// Por qué existe: este software se vende a cualquier entrenador, así que ninguna
// plantilla puede llevar un nombre propio escrito. Pero quitar el nombre no basta —
// hay que dejar la frase bien en los tres casos reales que da la base: nombre de
// verdad, columna NULL y cadena vacía o con solo espacios.
//
// El fallo que esto evita es de bulto: sustituir «Pablo» por una variable y que el
// correo salga con «␣ te espera» o «Tu videollamada con  está confirmada». Un push
// se olvida; un correo y un `.ics` ya no se retiran del buzón ni del calendario.
//
// LA IDEA: una plantilla nunca interpola el nombre pelado. Pide el FRAGMENTO que le
// toca por su posición gramatical, y el fragmento ya viene resuelto para los dos
// casos. En particular `withCoach` desaparece entero cuando no hay nombre —
// «tu videollamada está confirmada» se lee perfecto, y es preferible a rellenar con
// un genérico que chirría («tu videollamada con tu entrenador está confirmada»).
//
// Es MECANISMO (nuestro, en código). El nombre es DATO del coach (`coaches.full_name`)
// y se resuelve por fila en cada envío.

/** Sujeto neutro a principio de frase cuando no hay nombre resoluble. */
export const COACH_FALLBACK_SUBJECT = 'Tu entrenador';

/** El mismo sujeto en medio de una frase, donde la mayúscula sería un error. */
export const COACH_FALLBACK_OBJECT = 'tu entrenador';

/** Con quién firma un correo que no puede nombrar a nadie. */
export const TEAM_SIGNATURE = 'El equipo de FAHYBRID';

export interface CoachVoice {
  /** true solo si hay un nombre de verdad detrás. */
  named: boolean;
  /** El nombre tal cual, ya recortado. '' cuando no hay. NUNCA se pinta pelado. */
  name: string;
  /**
   * Sujeto a PRINCIPIO de frase: «Pablo Amigo la confirmará» / «Tu entrenador la
   * confirmará». Siempre no vacío, así que una frase nunca empieza por un hueco.
   */
  subject: string;
  /**
   * El mismo sujeto EN MEDIO de una frase, en minúscula: «en el grupo de Pablo
   * Amigo» / «en el grupo de tu entrenador».
   */
  object: string;
  /**
   * Complemento entero, con su espacio delante: `' con Pablo Amigo'` o `''`.
   * Sin nombre la oración se queda sin la coletilla y se lee natural:
   * «Tu videollamada está confirmada».
   */
  withCoach: string;
  /**
   * Firma, SIN el guion (la plantilla pone el suyo): «Pablo Amigo · FAHYBRID» o
   * «El equipo de FAHYBRID». Nunca «Tu entrenador · FAHYBRID», que no es una firma.
   */
  signature: string;
}

const UNNAMED: CoachVoice = {
  named: false,
  name: '',
  subject: COACH_FALLBACK_SUBJECT,
  object: COACH_FALLBACK_OBJECT,
  withCoach: '',
  signature: TEAM_SIGNATURE,
};

/**
 * Los fragmentos con los que una plantilla nombra al coach.
 * NULL, `undefined`, `''` y `'   '` son el MISMO caso: no hay nombre.
 */
export function coachVoice(name: string | null | undefined): CoachVoice {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (clean.length === 0) return UNNAMED;
  return {
    named: true,
    name: clean,
    subject: clean,
    object: clean,
    withCoach: ` con ${clean}`,
    signature: `${clean} · FAHYBRID`,
  };
}
